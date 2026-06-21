//! EXIF 情報の取得と画像/動画拡張子の判定。
//!
//! Note: モジュール名を `exif` にすると kamadak-exif の `exif` クレートと
//! 衝突するため `exif_info` とする。

use anyhow::Result;
use chrono::{Local, NaiveDateTime, TimeZone};
use exif::{In, Reader, Tag};
use std::fs;
use std::path::Path;

use chrono::DateTime;

/// 画像拡張子のチェック
/// Note: HEIC/HEIF は kamadak-exif / image crate が未対応のため除外
pub(crate) fn is_image_file(extension: &str) -> bool {
    matches!(
        extension,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" | "tif"
    )
}

/// 動画拡張子のチェック
/// Note: mp4 crate は MP4/MOV/M4V (QuickTime系) のみ対応。
/// AVI/MKV/WMV/FLV/3GP/MPG/MPEG はメタデータ抽出できないため除外
pub(crate) fn is_video_file(extension: &str) -> bool {
    matches!(extension, "mp4" | "mov" | "m4v" | "webm")
}

/// EXIF情報の詳細
#[derive(Debug, Clone)]
pub(crate) struct ExifInfo {
    pub(crate) date: Option<DateTime<Local>>,
    pub(crate) subsec: Option<u32>,      // ミリ秒（0-999）
    pub(crate) timezone: Option<String>, // タイムゾーンオフセット（例："+09:00"）
    pub(crate) orientation: Option<u32>,
    pub(crate) width: Option<u32>,
    pub(crate) height: Option<u32>,
}

/// EXIF情報を取得
pub(crate) fn get_exif_info(path: &Path) -> Result<ExifInfo> {
    let file = fs::File::open(path)?;
    let mut bufreader = std::io::BufReader::new(&file);

    let exifreader = Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => exif,
        Err(_) => {
            return Ok(ExifInfo {
                date: None,
                subsec: None,
                timezone: None,
                orientation: None,
                width: None,
                height: None,
            })
        }
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
                if let Ok(naive) = NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S")
                {
                    info.date = Local.from_local_datetime(&naive).single();
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
                    if let Ok(naive) =
                        NaiveDateTime::parse_from_str(&datetime_str, "%Y:%m:%d %H:%M:%S")
                    {
                        info.date = Local.from_local_datetime(&naive).single();
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
