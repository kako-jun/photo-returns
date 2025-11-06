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

/// 日付の取得元
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DateSource {
    /// EXIF撮影日時から取得
    Exif,
    /// ファイル名から抽出
    FileName,
    /// ファイル作成日時から取得
    FileCreated,
    /// ファイル変更日時から取得
    FileModified,
    /// 日付情報なし
    None,
}

/// メディアファイル情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub original_path: PathBuf,
    pub file_name: String,
    pub media_type: MediaType,
    pub date_taken: Option<DateTime<Local>>,
    pub subsec_time: Option<u32>, // ミリ秒（0-999）
    pub timezone: Option<String>, // タイムゾーンオフセット（例："+09:00", null=TZ情報なし）
    pub new_name: String,
    pub new_path: PathBuf,
    pub file_size: u64,
    /// バーストグループID（連続撮影グループ）
    pub burst_group_id: Option<usize>,
    /// バーストグループ内のインデックス（1始まり）
    pub burst_index: Option<usize>,
    /// 日付の取得元
    pub date_source: DateSource,
    /// EXIF orientation値（1-8、Noneは回転なし）
    pub exif_orientation: Option<u32>,
    /// 画像回転が適用されたか
    pub rotation_applied: bool,
    /// 画像の幅（ピクセル）
    pub width: Option<u32>,
    /// 画像の高さ（ピクセル）
    pub height: Option<u32>,
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

/// EXIF情報の詳細
#[derive(Debug, Clone)]
struct ExifInfo {
    date: Option<DateTime<Local>>,
    subsec: Option<u32>, // ミリ秒（0-999）
    timezone: Option<String>, // タイムゾーンオフセット（例："+09:00"）
    orientation: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
}

/// EXIF情報を取得
fn get_exif_info(path: &Path) -> Result<ExifInfo> {
    let file = fs::File::open(path)?;
    let mut bufreader = std::io::BufReader::new(&file);

    let exifreader = Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => exif,
        Err(_) => return Ok(ExifInfo {
            date: None,
            subsec: None,
            timezone: None,
            orientation: None,
            width: None,
            height: None,
        }),
    };

    let mut info = ExifInfo {
        date: None,
        subsec: None,
        timezone: None,
        orientation: None,
        width: None,
        height: None,
    };

    // DateTimeOriginal (撮影日時) を取得
    if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(datetime) = vec.first() {
                let datetime_str = String::from_utf8_lossy(datetime);
                if let Ok(naive) = NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S") {
                    info.date = Some(DateTime::from_naive_utc_and_offset(
                        naive,
                        *Local::now().offset(),
                    ));
                }
            }
        }
    }

    // DateTime も試す（DateTimeOriginalがない場合）
    if info.date.is_none() {
        if let Some(field) = exif.get_field(Tag::DateTime, In::PRIMARY) {
            if let exif::Value::Ascii(ref vec) = field.value {
                if let Some(datetime) = vec.first() {
                    let datetime_str = String::from_utf8_lossy(datetime);
                    if let Ok(naive) = NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S") {
                        info.date = Some(DateTime::from_naive_utc_and_offset(
                            naive,
                            *Local::now().offset(),
                        ));
                    }
                }
            }
        }
    }

    // SubSecTimeOriginal (ミリ秒) を取得
    if let Some(field) = exif.get_field(Tag::SubSecTimeOriginal, In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(subsec_bytes) = vec.first() {
                let subsec_str = String::from_utf8_lossy(subsec_bytes);
                if let Ok(subsec) = subsec_str.trim().parse::<u32>() {
                    info.subsec = Some(subsec);
                }
            }
        }
    }

    // SubSecTime も試す（SubSecTimeOriginalがない場合）
    if info.subsec.is_none() {
        if let Some(field) = exif.get_field(Tag::SubSecTime, In::PRIMARY) {
            if let exif::Value::Ascii(ref vec) = field.value {
                if let Some(subsec_bytes) = vec.first() {
                    let subsec_str = String::from_utf8_lossy(subsec_bytes);
                    if let Ok(subsec) = subsec_str.trim().parse::<u32>() {
                        info.subsec = Some(subsec);
                    }
                }
            }
        }
    }

    // OffsetTimeOriginal (タイムゾーンオフセット) を取得
    if let Some(field) = exif.get_field(Tag::OffsetTimeOriginal, In::PRIMARY) {
        if let exif::Value::Ascii(ref vec) = field.value {
            if let Some(offset_bytes) = vec.first() {
                let offset_str = String::from_utf8_lossy(offset_bytes).trim().to_string();
                if !offset_str.is_empty() {
                    info.timezone = Some(offset_str);
                }
            }
        }
    }

    // OffsetTime も試す（OffsetTimeOriginalがない場合）
    if info.timezone.is_none() {
        if let Some(field) = exif.get_field(Tag::OffsetTime, In::PRIMARY) {
            if let exif::Value::Ascii(ref vec) = field.value {
                if let Some(offset_bytes) = vec.first() {
                    let offset_str = String::from_utf8_lossy(offset_bytes).trim().to_string();
                    if !offset_str.is_empty() {
                        info.timezone = Some(offset_str);
                    }
                }
            }
        }
    }

    // Orientation を取得
    if let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        if let exif::Value::Short(ref vec) = field.value {
            if let Some(&orientation) = vec.first() {
                info.orientation = Some(orientation as u32);
            }
        }
    }

    // 画像サイズを取得
    if let Some(field) = exif.get_field(Tag::PixelXDimension, In::PRIMARY) {
        if let exif::Value::Long(ref vec) = field.value {
            if let Some(&width) = vec.first() {
                info.width = Some(width);
            }
        }
    }

    if let Some(field) = exif.get_field(Tag::PixelYDimension, In::PRIMARY) {
        if let exif::Value::Long(ref vec) = field.value {
            if let Some(&height) = vec.first() {
                info.height = Some(height);
            }
        }
    }

    Ok(info)
}

/// ファイル名から日付を抽出
fn extract_date_from_filename(filename: &str) -> Option<DateTime<Local>> {
    use regex::Regex;

    // パターン1: YYYYMMDD_HHMMSS (最も一般的)
    // 例: IMG_20250115_103000.jpg, Screenshot_20250115_103000.png
    let re1 = Regex::new(r"(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})").ok()?;
    if let Some(caps) = re1.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;
        let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
        let minute: u32 = caps.get(5)?.as_str().parse().ok()?;
        let second: u32 = caps.get(6)?.as_str().parse().ok()?;

        if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(hour, minute, second))
        {
            return Some(DateTime::from_naive_utc_and_offset(naive, *Local::now().offset()));
        }
    }

    // パターン2: YYYY-MM-DD_HH-MM-SS
    // 例: 2025-01-15_10-30-00.jpg
    let re2 = Regex::new(r"(\d{4})-(\d{2})-(\d{2})[_T](\d{2})-(\d{2})-(\d{2})").ok()?;
    if let Some(caps) = re2.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;
        let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
        let minute: u32 = caps.get(5)?.as_str().parse().ok()?;
        let second: u32 = caps.get(6)?.as_str().parse().ok()?;

        if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(hour, minute, second))
        {
            return Some(DateTime::from_naive_utc_and_offset(naive, *Local::now().offset()));
        }
    }

    // パターン3: YYYYMMDDのみ（時刻なし）
    // 例: IMG-20250115-WA0001.jpg (WhatsApp)
    let re3 = Regex::new(r"(\d{4})(\d{2})(\d{2})").ok()?;
    if let Some(caps) = re3.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;

        if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(0, 0, 0))
        {
            return Some(DateTime::from_naive_utc_and_offset(naive, *Local::now().offset()));
        }
    }

    None
}

/// ファイルの作成日時を取得
fn get_file_created_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;
    let created = metadata.created()?;
    Ok(DateTime::from(created))
}

/// ファイルの変更日時を取得
fn get_file_modified_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?;
    Ok(DateTime::from(modified))
}

/// 日時からファイル名を生成（YYYY-MM-DD_HH-mm-ss[-mmm]形式）
fn format_filename(date: &DateTime<Local>, subsec: Option<u32>, extension: &str) -> String {
    if let Some(ms) = subsec {
        // ミリ秒がある場合は3桁で追加
        format!("{}-{:03}.{}", date.format("%Y-%m-%d_%H-%M-%S"), ms, extension)
    } else {
        // ミリ秒がない場合は秒まで
        format!("{}.{}", date.format("%Y-%m-%d_%H-%M-%S"), extension)
    }
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
            // EXIF情報を取得
            let exif_info = get_exif_info(path).ok().unwrap_or(ExifInfo {
                date: None,
                subsec: None,
                timezone: None,
                orientation: None,
                width: None,
                height: None,
            });

            // ファイル名を取得
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            // 日付を決定（優先順位: EXIF > ファイル名 > ファイル作成日時 > ファイル変更日時）
            let (date_taken, date_source, subsec) = if let Some(exif_date) = exif_info.date {
                (Some(exif_date), DateSource::Exif, exif_info.subsec)
            } else if let Some(filename_date) = extract_date_from_filename(filename) {
                (Some(filename_date), DateSource::FileName, None)
            } else if let Ok(created_date) = get_file_created_date(path) {
                (Some(created_date), DateSource::FileCreated, None)
            } else if let Ok(modified_date) = get_file_modified_date(path) {
                (Some(modified_date), DateSource::FileModified, None)
            } else {
                (None, DateSource::None, None)
            };

            if let Some(date) = date_taken {
                let new_name = format_filename(&date, subsec, &extension);
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
                    subsec_time: subsec,
                    timezone: if date_source == DateSource::Exif {
                        exif_info.timezone.clone()
                    } else {
                        None
                    },
                    new_name,
                    new_path: PathBuf::new(),
                    file_size,
                    burst_group_id: None,
                    burst_index: None,
                    date_source,
                    exif_orientation: exif_info.orientation,
                    rotation_applied: false, // スキャン時はまだ回転していない
                    width: exif_info.width,
                    height: exif_info.height,
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

                    // ベースファイル名を生成（拡張子なし）
                    let base_name = if let Some(ms) = media_info.subsec_time {
                        format!("{}-{:03}", date.format("%Y-%m-%d_%H-%M-%S"), ms)
                    } else {
                        date.format("%Y-%m-%d_%H-%M-%S").to_string()
                    };

                    media_info.new_name = format!("{}_{:02}.{}", base_name, idx + 1, extension);
                }
            }
        }
    }

    Ok(result)
}

/// YYYY/YYYY-MM/YYYY-MM-DD の階層構造を作成
fn create_date_hierarchy(output_dir: &Path, date: &DateTime<Local>) -> Result<PathBuf> {
    let year = date.format("%Y").to_string();
    let year_month = date.format("%Y-%m").to_string();
    let year_month_day = date.format("%Y-%m-%d").to_string();

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

                // ベースファイル名を生成（ミリ秒を含む場合と含まない場合）
                let base_name = if let Some(ms) = item.subsec_time {
                    format!("{}-{:03}", date.format("%Y-%m-%d_%H-%M-%S"), ms)
                } else {
                    date.format("%Y-%m-%d_%H-%M-%S").to_string()
                };

                let new_name = format!("{}_{:02}.{}", base_name, counter, extension);
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
