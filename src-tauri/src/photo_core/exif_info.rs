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

    /// DateTimeOriginal / OffsetTimeOriginal / SubSecTimeOriginal / Orientation /
    /// PixelXDimension / PixelYDimension を含む、HEIC/HEIF/AVIF 共通の Exif TIFF
    /// （リトルエンディアン）を組み立てる。
    ///
    /// 実機での実測（#31 セルフレビュー S3。kamadak-exif 同梱の `tests/exif.heic` と、
    /// iPhone 実機の HEIC 1837枚から均等抽出した307枚に `get_exif_info` を実行、一時検証
    /// コードでの確認・非コミット）で、iPhone 実機 HEIC は全件（307/307）date/orientation/
    /// width/height が読めることを確認済み。個人写真のためこのフィクスチャには使えず、
    /// 手組みのまま維持する。
    fn build_exif_tiff() -> Vec<u8> {
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

        tiff
    }

    /// `tiff`（Exif TIFF 本体）を `idat`/`iloc`/`iinf` にラップした `meta` ボックスを組み立てる。
    /// HEIC/HEIF/AVIF で共通（kamadak-exif は `ftyp` の brand を見るだけで `meta` の中身の
    /// 解釈は形式で分岐しない）。
    fn build_meta_box(tiff: &[u8]) -> Vec<u8> {
        // --- idat: 先頭4バイトのオフセット(0)＋TIFF本体 ---
        let mut idat_body = vec![0u8; 4];
        idat_body.extend_from_slice(tiff);
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
        build_box(b"meta", &meta_body)
    }

    /// `ftyp` ボックスを組み立てる。`major_brand` は HEIC="mif1"（従来の骨格を維持）/
    /// HEIF="heix"（実在する ISO HEIF の単画像 brand）/ AVIF="avif" で差し替える。
    ///
    /// kamadak-exif の isobmff パーサは major_brand 自体は見ず、`compatible_brands` に
    /// "mif1"/"msf1" が含まれるかだけで HEIF ファミリーと判定する
    /// （kamadak-exif-0.6.1 `src/isobmff.rs` の `HEIF_BRANDS`/`parse_ftyp`）。そのため
    /// AVIF フィクスチャの compatible_brands にも "mif1" を含める（実在の AVIF ファイルも
    /// HEIF 対応リーダーとの互換のため "mif1" を compatible brand に含めるのが通例）。
    fn build_ftyp_box(major_brand: &[u8; 4], compatible_brands: &[&[u8; 4]]) -> Vec<u8> {
        let mut ftyp_body = Vec::new();
        ftyp_body.extend_from_slice(major_brand);
        ftyp_body.extend_from_slice(&[0, 0, 0, 0]); // minor_version
        for brand in compatible_brands {
            ftyp_body.extend_from_slice(*brand);
        }
        build_box(b"ftyp", &ftyp_body)
    }

    /// kamadak-exif が受理する最小の HEIC/HEIF/AVIF（ISO BMFF/HEIF）ファイルを手で組み立てる。
    ///
    /// 構成は kamadak-exif 自身のユニットテスト（`isobmff.rs` の `unknown_before_ftyp`）と
    /// 同じ `ftyp` + `meta{iloc,iinf,idat}` の最小骨格を土台にする。3形式の差は `ftyp` の
    /// brand だけで、EXIF ペイロード（`build_exif_tiff`）は共通（#31 セルフレビュー S3）。
    fn build_heif_family_with_exif(
        major_brand: &[u8; 4],
        compatible_brands: &[&[u8; 4]],
    ) -> Vec<u8> {
        let tiff = build_exif_tiff();
        let meta = build_meta_box(&tiff);
        let ftyp = build_ftyp_box(major_brand, compatible_brands);

        let mut file = Vec::new();
        file.extend_from_slice(&ftyp);
        file.extend_from_slice(&meta);
        file
    }

    fn build_heic_with_exif() -> Vec<u8> {
        build_heif_family_with_exif(b"mif1", &[b"mif1"])
    }

    fn build_heif_with_exif() -> Vec<u8> {
        build_heif_family_with_exif(b"heix", &[b"mif1"])
    }

    fn build_avif_with_exif() -> Vec<u8> {
        build_heif_family_with_exif(b"avif", &[b"avif", b"mif1"])
    }

    /// 3形式共通の期待値を検証する。`build_heif_family_with_exif` が同じ `build_exif_tiff`
    /// を使うため、date/subsec/timezone/orientation/width/height は形式によらず同じになる。
    fn assert_probe_fixture_exif(info: &ExifInfo) {
        assert_eq!(
            info.date,
            Local
                .from_local_datetime(
                    &NaiveDateTime::parse_from_str("2025:06:15 12:34:56", "%Y:%m:%d %H:%M:%S")
                        .unwrap()
                )
                .single(),
            "DateTimeOriginal should be parsed"
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
    }

    #[test]
    fn get_exif_info_reads_date_orientation_and_dimensions_from_heic() {
        let path = std::env::temp_dir().join("photo_returns_heic_exif_fixture.heic");
        fs::write(&path, build_heic_with_exif()).expect("write HEIC fixture");

        let info = get_exif_info(&path).expect("get_exif_info should not error on valid HEIC");
        assert_probe_fixture_exif(&info);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn get_exif_info_reads_date_orientation_and_dimensions_from_heif() {
        // major_brand="heix"（HEIC の "mif1" と異なる）でも kamadak-exif は
        // compatible_brands の "mif1" だけを見るため同じように読める（#31 S3）。
        let path = std::env::temp_dir().join("photo_returns_heif_exif_fixture.heif");
        fs::write(&path, build_heif_with_exif()).expect("write HEIF fixture");

        let info = get_exif_info(&path).expect("get_exif_info should not error on valid HEIF");
        assert_probe_fixture_exif(&info);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn get_exif_info_reads_date_orientation_and_dimensions_from_avif() {
        // AVIF は major_brand が "avif" で HEIC/HEIF と異なる（レビュー指摘）。
        // compatible_brands に "mif1" を含めれば kamadak-exif は同じ経路で読める。
        let path = std::env::temp_dir().join("photo_returns_avif_exif_fixture.avif");
        fs::write(&path, build_avif_with_exif()).expect("write AVIF fixture");

        let info = get_exif_info(&path).expect("get_exif_info should not error on valid AVIF");
        assert_probe_fixture_exif(&info);

        let _ = fs::remove_file(&path);
    }
}
