/// 写真・動画リネームのコア機能
/// y4m2d2の完全移植版
use anyhow::Result;
use chrono::{DateTime, Local, NaiveDateTime};
use exif::{In, Reader, Tag};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

use crate::burst::{detect_burst_groups, BurstDetectorConfig};

/// 処理オプション
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessOptions {
    /// 並列処理を有効化
    pub parallel: bool,
    /// バックアップディレクトリ（Noneの場合はバックアップしない）
    pub backup_dir: Option<PathBuf>,
    /// 動画ファイルも処理する
    pub include_videos: bool,
    /// タイムゾーンオフセット（秒、Noneの場合はローカルタイム）
    pub timezone_offset: Option<i32>,
    /// 処理後に一時ファイルをクリーンアップ
    pub cleanup_temp: bool,
    /// 画像の向きを自動修正
    pub auto_correct_orientation: bool,
}

impl Default for ProcessOptions {
    fn default() -> Self {
        Self {
            parallel: true,
            include_videos: true,
            backup_dir: None,
            timezone_offset: None,
            cleanup_temp: false,
            auto_correct_orientation: false,
        }
    }
}

/// メディアファイルの種類
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaType {
    Photo,
    Video,
}

/// メディアファイル情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub original_path: PathBuf,
    pub file_name: String,
    pub media_type: MediaType,
    pub date_taken: Option<DateTime<Local>>,
    pub new_name: String,
    pub new_path: PathBuf,
    pub file_size: u64,
    /// バーストグループID（連続撮影グループ）
    pub burst_group_id: Option<usize>,
    /// バーストグループ内のインデックス（1始まり）
    pub burst_index: Option<usize>,
}

/// 処理結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub success: bool,
    pub total_files: usize,
    pub processed_files: usize,
    pub media: Vec<MediaInfo>,
    pub errors: Vec<String>,
}

/// 画像拡張子のチェック
fn is_image_file(extension: &str) -> bool {
    matches!(
        extension,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "heic" | "heif" | "webp" | "tiff" | "tif"
    )
}

/// 動画拡張子のチェック
fn is_video_file(extension: &str) -> bool {
    matches!(
        extension,
        "mp4" | "mov" | "avi" | "mkv" | "m4v" | "3gp" | "wmv" | "flv" | "webm" | "mpeg" | "mpg"
    )
}

/// EXIF情報から撮影日時を取得
fn get_exif_date(path: &Path) -> Result<Option<DateTime<Local>>> {
    let file = fs::File::open(path)?;
    let mut bufreader = std::io::BufReader::new(&file);

    let exifreader = Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => exif,
        Err(_) => return Ok(None),
    };

    // DateTimeOriginal (撮影日時) を取得
    if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(datetime) = vec.first() {
                let datetime_str = String::from_utf8_lossy(datetime);
                // EXIF日付フォーマット: "2024:06:17 14:30:52"
                if let Ok(naive) = NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S") {
                    return Ok(Some(DateTime::from_naive_utc_and_offset(
                        naive,
                        *Local::now().offset(),
                    )));
                }
            }
        }
    }

    // DateTime も試す
    if let Some(field) = exif.get_field(Tag::DateTime, In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(datetime) = vec.first() {
                let datetime_str = String::from_utf8_lossy(datetime);
                if let Ok(naive) = NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S") {
                    return Ok(Some(DateTime::from_naive_utc_and_offset(
                        naive,
                        *Local::now().offset(),
                    )));
                }
            }
        }
    }

    Ok(None)
}

/// ファイルの作成/更新日時を取得（フォールバック）
fn get_file_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;

    // 作成日時を優先
    if let Ok(created) = metadata.created() {
        return Ok(DateTime::from(created));
    }

    // フォールバック: 更新日時
    let modified = metadata.modified()?;
    Ok(DateTime::from(modified))
}

/// 日時からファイル名を生成（YYYYMMDD_HHmmss形式）
fn format_filename(date: &DateTime<Local>, extension: &str) -> String {
    format!("{}.{}", date.format("%Y%m%d_%H%M%S"), extension)
}

/// 対象ディレクトリ内のメディアファイルをスキャン
pub fn scan_media(input_dir: &Path, options: &ProcessOptions) -> Result<Vec<MediaInfo>> {
    let files: Vec<_> = WalkDir::new(input_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();

    let media = Arc::new(Mutex::new(Vec::new()));

    let processor = |entry: &walkdir::DirEntry| {
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let media_type = if is_image_file(&extension) {
            Some(MediaType::Photo)
        } else if options.include_videos && is_video_file(&extension) {
            Some(MediaType::Video)
        } else {
            None
        };

        if let Some(mtype) = media_type {
            // EXIF日時 or ファイル日時を取得
            let date_taken = get_exif_date(path)
                .ok()
                .flatten()
                .or_else(|| get_file_date(path).ok());

            if let Some(date) = date_taken {
                let new_name = format_filename(&date, &extension);
                let file_size = fs::metadata(path).ok().map(|m| m.len()).unwrap_or(0);

                let info = MediaInfo {
                    original_path: path.to_path_buf(),
                    file_name: path
                        .file_name()
                        .unwrap()
                        .to_string_lossy()
                        .to_string(),
                    media_type: mtype,
                    date_taken: Some(date),
                    new_name,
                    new_path: PathBuf::new(),
                    file_size,
                    burst_group_id: None,
                    burst_index: None,
                };

                media.lock().unwrap().push(info);
            }
        }
    };

    if options.parallel {
        files.par_iter().for_each(processor);
    } else {
        files.iter().for_each(processor);
    }

    let mut result = Arc::try_unwrap(media)
        .map(|mutex| mutex.into_inner().unwrap())
        .unwrap_or_else(|arc| arc.lock().unwrap().clone());

    // バースト検出を実行
    let dates: Vec<Option<DateTime<Local>>> = result.iter().map(|m| m.date_taken).collect();
    let burst_config = BurstDetectorConfig::default();
    let burst_groups = detect_burst_groups(&dates, &burst_config);

    // バースト情報をMediaInfoに反映
    for group in &burst_groups {
        for (idx, &photo_idx) in group.photo_indices.iter().enumerate() {
            if let Some(media_info) = result.get_mut(photo_idx) {
                media_info.burst_group_id = Some(group.id);
                media_info.burst_index = Some(idx + 1); // 1始まり

                // ファイル名に連番を追加
                if let Some(date) = media_info.date_taken {
                    let extension = media_info.original_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("jpg");
                    media_info.new_name = format!("{}_{:02}.{}",
                        format_filename(&date, "").trim_end_matches('.'),
                        idx + 1,
                        extension
                    );
                }
            }
        }
    }

    Ok(result)
}

/// YYYY/YYYYMM/YYYYMMDD の階層構造を作成
fn create_date_hierarchy(output_dir: &Path, date: &DateTime<Local>) -> Result<PathBuf> {
    let year = date.format("%Y").to_string();
    let year_month = date.format("%Y%m").to_string();
    let year_month_day = date.format("%Y%m%d").to_string();

    let target_dir = output_dir
        .join(&year)
        .join(&year_month)
        .join(&year_month_day);
    fs::create_dir_all(&target_dir)?;

    Ok(target_dir)
}

/// バックアップを作成
fn create_backup(original_path: &Path, backup_dir: &Path) -> Result<()> {
    if let Some(file_name) = original_path.file_name() {
        let backup_path = backup_dir.join(file_name);

        // バックアップディレクトリが存在しない場合は作成
        fs::create_dir_all(backup_dir)?;

        // 既存のバックアップがある場合は上書き
        fs::copy(original_path, backup_path)?;
    }
    Ok(())
}

/// メディアファイルをリネームして階層構造にコピー
pub fn process_media(input_dir: &Path, output_dir: &Path, options: &ProcessOptions) -> Result<ProcessResult> {
    let mut media = scan_media(input_dir, options)?;
    let total_files = media.len();

    let errors = Arc::new(Mutex::new(Vec::new()));
    let success_count = Arc::new(Mutex::new(0_usize));

    let processor = |item: &mut MediaInfo| {
        if let Some(date) = item.date_taken {
            // バックアップ作成
            if let Some(ref backup_dir) = options.backup_dir {
                if let Err(e) = create_backup(&item.original_path, backup_dir) {
                    errors.lock().unwrap().push(format!(
                        "Failed to backup {}: {}",
                        item.original_path.display(),
                        e
                    ));
                    return;
                }
            }

            // 出力ディレクトリ作成
            let target_dir = match create_date_hierarchy(output_dir, &date) {
                Ok(dir) => dir,
                Err(e) => {
                    errors.lock().unwrap().push(format!(
                        "Failed to create directory for {}: {}",
                        item.original_path.display(),
                        e
                    ));
                    return;
                }
            };

            let mut target_path = target_dir.join(&item.new_name);

            // 重複ファイル名の処理（連番追加）
            let mut counter = 1;
            while target_path.exists() {
                let extension = item
                    .original_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("");
                let new_name = format!(
                    "{}_{:02}.{}",
                    date.format("%Y%m%d_%H%M%S"),
                    counter,
                    extension
                );
                target_path = target_dir.join(&new_name);
                counter += 1;
            }

            // ファイルをコピー
            match fs::copy(&item.original_path, &target_path) {
                Ok(_) => {
                    item.new_path = target_path;
                    *success_count.lock().unwrap() += 1;
                }
                Err(e) => {
                    errors.lock().unwrap().push(format!(
                        "Failed to copy {}: {}",
                        item.original_path.display(),
                        e
                    ));
                }
            }
        }
    };

    if options.parallel {
        media.par_iter_mut().for_each(processor);
    } else {
        media.iter_mut().for_each(processor);
    }

    let processed_files = *success_count.lock().unwrap();
    let errors_vec = Arc::try_unwrap(errors)
        .map(|mutex| mutex.into_inner().unwrap())
        .unwrap_or_else(|arc| arc.lock().unwrap().clone());

    Ok(ProcessResult {
        success: processed_files > 0,
        total_files,
        processed_files,
        media,
        errors: errors_vec,
    })
}
