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
/// Note: HEIC/HEIF/AVIF の EXIF 抽出は kamadak-exif の ISO BMFF パーサ（isobmff.rs）が
/// 対応済みのため対象に含む（#31）。ただし `image` crate 0.24 は HEIF をデコードできないため、
/// ロスレス回転は `orientation::supports_lossless_rotation` で事前にスキップする。
pub(crate) fn is_image_file(extension: &str) -> bool {
    matches!(
        extension,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" | "tif" | "heic" | "heif" | "avif"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_image_file_accepts_heic_family() {
        for ext in ["heic", "heif", "avif"] {
            assert!(is_image_file(ext), "{ext} should be recognized as image");
        }
    }

    #[test]
    fn is_image_file_still_accepts_existing_formats() {
        for ext in ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif"] {
            assert!(is_image_file(ext), "{ext} should remain recognized");
        }
    }

    #[test]
    fn is_image_file_rejects_unknown_extension() {
        for ext in ["mp4", "txt", "", "heicx"] {
            assert!(!is_image_file(ext), "{ext} should not be recognized");
        }
    }

    /// `box_type` + `body` から ISO BMFF ボックス（サイズ8バイトヘッダ込み）を組み立てる。
    fn build_box(box_type: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(8 + body.len());
        out.extend_from_slice(&((8 + body.len()) as u32).to_be_bytes());
        out.extend_from_slice(box_type);
        out.extend_from_slice(body);
        out
    }

    /// kamadak-exif が受理する最小の HEIC（ISO BMFF/HEIF）ファイルを手で組み立てる。
    ///
    /// 構成は kamadak-exif 自身のユニットテスト（`isobmff.rs` の `unknown_before_ftyp`）と
    /// 同じ `ftyp` + `meta{iloc,iinf,idat}` の最小骨格を土台にする。`idat`
    /// （construction_method=1、offset/length=0=ボディ全体）に、DateTimeOriginal /
    /// OffsetTimeOriginal / SubSecTimeOriginal / Orientation / PixelXDimension /
    /// PixelYDimension を含む自前の Exif TIFF（リトルエンディアン）を埋め込む。
    /// 実機の HEIC ファイルを用意できなかったため、この手組みフィクスチャで実測する。
    fn build_heic_with_exif() -> Vec<u8> {
        // --- Exif TIFF (little endian) ---
        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"II");
        tiff.extend_from_slice(&0x002Au16.to_le_bytes());
        tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset

        // IFD0: エントリ2件（Orientation, ExifIFDPointer）
        tiff.extend_from_slice(&2u16.to_le_bytes());
        // Orientation (0x0112, SHORT, count=1, value=6)
        tiff.extend_from_slice(&0x0112u16.to_le_bytes());
        tiff.extend_from_slice(&3u16.to_le_bytes());
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&[6, 0, 0, 0]);
        // ExifIFDPointer (0x8769, LONG, count=1, value=38=Exif subIFDのオフセット)
        tiff.extend_from_slice(&0x8769u16.to_le_bytes());
        tiff.extend_from_slice(&4u16.to_le_bytes());
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&38u32.to_le_bytes());
        // 次のIFDなし
        tiff.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(tiff.len(), 38, "IFD0 は Exif subIFD の直前で終わる");

        // Exif subIFD: エントリ5件
        tiff.extend_from_slice(&5u16.to_le_bytes());
        // DateTimeOriginal (0x9003, ASCII, count=20) → 外部データ @104
        tiff.extend_from_slice(&0x9003u16.to_le_bytes());
        tiff.extend_from_slice(&2u16.to_le_bytes());
        tiff.extend_from_slice(&20u32.to_le_bytes());
        tiff.extend_from_slice(&104u32.to_le_bytes());
        // OffsetTimeOriginal (0x9011, ASCII, count=7) → 外部データ @124
        tiff.extend_from_slice(&0x9011u16.to_le_bytes());
        tiff.extend_from_slice(&2u16.to_le_bytes());
        tiff.extend_from_slice(&7u32.to_le_bytes());
        tiff.extend_from_slice(&124u32.to_le_bytes());
        // SubSecTimeOriginal (0x9291, ASCII, count=4) → インライン "123\0"
        tiff.extend_from_slice(&0x9291u16.to_le_bytes());
        tiff.extend_from_slice(&2u16.to_le_bytes());
        tiff.extend_from_slice(&4u32.to_le_bytes());
        tiff.extend_from_slice(b"123\0");
        // PixelXDimension (0xA002, LONG, count=1, value=1920)
        tiff.extend_from_slice(&0xA002u16.to_le_bytes());
        tiff.extend_from_slice(&4u16.to_le_bytes());
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&1920u32.to_le_bytes());
        // PixelYDimension (0xA003, LONG, count=1, value=1080)
        tiff.extend_from_slice(&0xA003u16.to_le_bytes());
        tiff.extend_from_slice(&4u16.to_le_bytes());
        tiff.extend_from_slice(&1u32.to_le_bytes());
        tiff.extend_from_slice(&1080u32.to_le_bytes());
        // 次のIFDなし
        tiff.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(
            tiff.len(),
            104,
            "Exif subIFD は外部データ領域の直前で終わる"
        );

        // 外部データ（ASCII文字列本体、NUL終端込み）
        tiff.extend_from_slice(b"2025:06:15 12:34:56\0"); // 20バイト @104
        tiff.extend_from_slice(b"+09:00\0"); // 7バイト @124
        assert_eq!(tiff.len(), 131);

        // --- idat: 先頭4バイトのオフセット(0)＋TIFF本体 ---
        let mut idat_body = vec![0u8; 4];
        idat_body.extend_from_slice(&tiff);
        let idat = build_box(b"idat", &idat_body);

        // --- iloc: item_id=0x1e1d, construction_method=1（idat参照）、offset/length=0=全体 ---
        let iloc_body: Vec<u8> = vec![
            0x01, 0x00, 0x00, 0x00, // version=1, flags=0
            0x00, 0x00, // offset_size/length_size/base_offset_size/index_size = すべて0
            0x00, 0x01, // item_count=1
            0x1e, 0x1d, // item_id
            0x00, 0x01, // construction_method=1（下位ニブル）
            0x00, 0x00, // data_reference_index
            0x00, 0x01, // extent_count=1
        ];
        let iloc = build_box(b"iloc", &iloc_body);

        // --- iinf/infe: item_id=0x1e1d, item_type="Exif" ---
        let infe_body: Vec<u8> = vec![
            0x02, 0x00, 0x00, 0x00, // version=2, flags=0
            0x1e, 0x1d, // item_id
            0x00, 0x00, // item_protection_index
            b'E', b'x', b'i', b'f',
        ];
        let infe = build_box(b"infe", &infe_body);
        let mut iinf_body: Vec<u8> = vec![0x00, 0x00, 0x00, 0x00, 0x00, 0x01]; // fullbox header + entry_count=1
        iinf_body.extend_from_slice(&infe);
        let iinf = build_box(b"iinf", &iinf_body);

        let mut meta_body: Vec<u8> = vec![0x00, 0x00, 0x00, 0x00]; // fullbox header
        meta_body.extend_from_slice(&iloc);
        meta_body.extend_from_slice(&iinf);
        meta_body.extend_from_slice(&idat);
        let meta = build_box(b"meta", &meta_body);

        let mut ftyp_body = Vec::new();
        ftyp_body.extend_from_slice(b"mif1"); // major_brand
        ftyp_body.extend_from_slice(&[0, 0, 0, 0]); // minor_version
        ftyp_body.extend_from_slice(b"mif1"); // compatible_brands
        let ftyp = build_box(b"ftyp", &ftyp_body);

        let mut file = Vec::new();
        file.extend_from_slice(&ftyp);
        file.extend_from_slice(&meta);
        file
    }

    #[test]
    fn get_exif_info_reads_date_orientation_and_dimensions_from_heic() {
        let path = std::env::temp_dir().join("photo_returns_heic_exif_fixture.heic");
        fs::write(&path, build_heic_with_exif()).expect("write HEIC fixture");

        let info = get_exif_info(&path).expect("get_exif_info should not error on valid HEIC");

        assert_eq!(
            info.date,
            Local
                .from_local_datetime(
                    &NaiveDateTime::parse_from_str("2025:06:15 12:34:56", "%Y:%m:%d %H:%M:%S")
                        .unwrap()
                )
                .single(),
            "DateTimeOriginal should be parsed from the HEIC Exif TIFF"
        );
        assert_eq!(info.subsec, Some(123), "SubSecTimeOriginal should be read");
        assert_eq!(
            info.timezone,
            Some("+09:00".to_string()),
            "OffsetTimeOriginal should be read"
        );
        assert_eq!(info.orientation, Some(6), "Orientation should be read");
        assert_eq!(info.width, Some(1920), "PixelXDimension should be read");
        assert_eq!(info.height, Some(1080), "PixelYDimension should be read");

        let _ = fs::remove_file(&path);
    }
}
