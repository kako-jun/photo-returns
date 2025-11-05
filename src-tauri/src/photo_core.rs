/// 写真リネームのコア機能
/// y4m2d2のシンプル版として実装
use anyhow::Result;
use chrono::{DateTime, Local, NaiveDateTime};
use exif::{In, Reader, Tag};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoInfo {
    pub original_path: PathBuf,
    pub file_name: String,
    pub date_taken: Option<DateTime<Local>>,
    pub new_name: String,
    pub new_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub success: bool,
    pub photos: Vec<PhotoInfo>,
    pub errors: Vec<String>,
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
                    return Ok(Some(DateTime::from_naive_utc_and_offset(naive, *Local::now().offset())));
                }
            }
        }
    }

    Ok(None)
}

/// ファイルの作成日時を取得（フォールバック）
fn get_file_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?;
    Ok(DateTime::from(modified))
}

/// 日時からファイル名を生成（YYYYMMDD_HHmmss形式）
fn format_filename(date: &DateTime<Local>, extension: &str) -> String {
    format!("{}.{}", date.format("%Y%m%d_%H%M%S"), extension)
}

/// 対象ディレクトリ内の画像ファイルをスキャン
pub fn scan_photos(input_dir: &Path) -> Result<Vec<PhotoInfo>> {
    let mut photos = Vec::new();

    for entry in WalkDir::new(input_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        // 対応する画像拡張子
        if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "heic" | "heif") {
            continue;
        }

        // EXIF日時 or ファイル日時を取得
        let date_taken = get_exif_date(path)
            .ok()
            .flatten()
            .or_else(|| get_file_date(path).ok());

        if let Some(date) = date_taken {
            let new_name = format_filename(&date, &extension);

            photos.push(PhotoInfo {
                original_path: path.to_path_buf(),
                file_name: path.file_name().unwrap().to_string_lossy().to_string(),
                date_taken: Some(date),
                new_name: new_name.clone(),
                new_path: PathBuf::new(), // 後で設定
            });
        }
    }

    Ok(photos)
}

/// YYYY/YYYYMM/YYYYMMDD の階層構造を作成
fn create_date_hierarchy(output_dir: &Path, date: &DateTime<Local>) -> Result<PathBuf> {
    let year = date.format("%Y").to_string();
    let year_month = date.format("%Y%m").to_string();
    let year_month_day = date.format("%Y%m%d").to_string();

    let target_dir = output_dir.join(&year).join(&year_month).join(&year_month_day);
    fs::create_dir_all(&target_dir)?;

    Ok(target_dir)
}

/// 写真をリネームして階層構造にコピー
pub fn process_photos(input_dir: &Path, output_dir: &Path) -> Result<ProcessResult> {
    let mut photos = scan_photos(input_dir)?;
    let mut errors = Vec::new();
    let mut success_count = 0;

    for photo in &mut photos {
        if let Some(date) = photo.date_taken {
            match create_date_hierarchy(output_dir, &date) {
                Ok(target_dir) => {
                    let mut target_path = target_dir.join(&photo.new_name);

                    // 重複ファイル名の処理（連番追加）
                    let mut counter = 1;
                    while target_path.exists() {
                        let extension = photo.original_path
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
                    match fs::copy(&photo.original_path, &target_path) {
                        Ok(_) => {
                            photo.new_path = target_path;
                            success_count += 1;
                        }
                        Err(e) => {
                            errors.push(format!(
                                "Failed to copy {}: {}",
                                photo.original_path.display(),
                                e
                            ));
                        }
                    }
                }
                Err(e) => {
                    errors.push(format!(
                        "Failed to create directory for {}: {}",
                        photo.original_path.display(),
                        e
                    ));
                }
            }
        }
    }

    Ok(ProcessResult {
        success: success_count > 0,
        photos,
        errors,
    })
}
