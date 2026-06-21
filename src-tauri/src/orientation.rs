/// 画像の向き検出・修正機能
use anyhow::{anyhow, Context, Result};
use exif::{In, Reader, Tag};
use image::{self, DynamicImage};
use img_parts::jpeg::Jpeg;
use img_parts::{Bytes, ImageEXIF};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use turbojpeg::{Transform, TransformOp};

/// 画像の向き（EXIF Orientation値）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Orientation {
    /// 1: 正常（回転不要）
    Normal,
    /// 3: 180度回転
    Rotate180,
    /// 6: 90度時計回りに回転（右に90度）
    Rotate90CW,
    /// 8: 90度反時計回りに回転（左に90度）
    Rotate90CCW,
    /// その他/不明
    Unknown,
}

impl From<u32> for Orientation {
    fn from(value: u32) -> Self {
        match value {
            1 => Orientation::Normal,
            3 => Orientation::Rotate180,
            6 => Orientation::Rotate90CW,
            8 => Orientation::Rotate90CCW,
            _ => Orientation::Unknown,
        }
    }
}

/// 画像の向き情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrientationInfo {
    /// EXIF Orientation値
    pub orientation: Orientation,
    /// 修正が必要かどうか
    pub needs_correction: bool,
}

/// EXIF情報から画像の向きを取得
pub fn get_orientation(path: &Path) -> Result<OrientationInfo> {
    let file = fs::File::open(path)?;
    let mut bufreader = std::io::BufReader::new(&file);

    let exifreader = Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => exif,
        Err(_) => {
            return Ok(OrientationInfo {
                orientation: Orientation::Normal,
                needs_correction: false,
            });
        }
    };

    // Orientation タグを取得
    if let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        if let exif::Value::Short(ref values) = field.value {
            if let Some(&orientation_value) = values.first() {
                let orientation = Orientation::from(orientation_value as u32);
                let needs_correction = orientation != Orientation::Normal;

                return Ok(OrientationInfo {
                    orientation,
                    needs_correction,
                });
            }
        }
    }

    // Orientationタグがない場合は正常とみなす
    Ok(OrientationInfo {
        orientation: Orientation::Normal,
        needs_correction: false,
    })
}

/// 画像を向きに応じて回転
#[allow(dead_code)]
pub fn correct_orientation(img: DynamicImage, orientation: Orientation) -> DynamicImage {
    match orientation {
        Orientation::Normal => img,
        Orientation::Rotate90CW => img.rotate90(),
        Orientation::Rotate180 => img.rotate180(),
        Orientation::Rotate90CCW => img.rotate270(),
        Orientation::Unknown => img,
    }
}

/// 画像ファイルの向きを修正して保存
#[allow(dead_code)]
pub fn correct_image_file(input_path: &Path, output_path: &Path) -> Result<bool> {
    // 向き情報を取得
    let info = get_orientation(input_path)?;

    // 修正が不要ならfalseを返す
    if !info.needs_correction {
        return Ok(false);
    }

    // 画像を読み込み
    let img = image::open(input_path)?;

    // 向きを修正
    let corrected = correct_orientation(img, info.orientation);

    // 保存
    corrected.save(output_path)?;

    Ok(true)
}

/// 画像ファイルのEXIF Orientationを1（Normal）にリセット
///
/// 画像を物理的に回転させた後、EXIF Orientationフィールドを1（正常）に上書きします。
/// これにより、画像ビューアーで二重に回転されることを防ぎます。
pub fn reset_exif_orientation(image_path: &Path) -> Result<()> {
    // JPEGファイルのみ対応（PNGにはEXIF Orientationがないことが多い）
    let extension = image_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    if !matches!(extension.to_lowercase().as_str(), "jpg" | "jpeg") {
        // JPEG以外はスキップ（エラーではない）
        return Ok(());
    }

    // JPEGファイルを読み込み
    let jpeg_bytes = fs::read(image_path).context("Failed to read JPEG file for EXIF reset")?;

    let mut jpeg = Jpeg::from_bytes(jpeg_bytes.into()).context("Failed to parse JPEG structure")?;

    // EXIFセグメントを取得
    if let Some(exif_segment) = jpeg.exif() {
        // EXIF データを取得（Bytes型をVec<u8>に変換）
        let exif_data = exif_segment.to_vec();

        // EXIF ヘッダーをスキップ（"Exif\0\0" = 6バイト）
        if exif_data.len() < 6 {
            // EXIFデータが短すぎる場合はスキップ
            return Ok(());
        }

        // img-parts の jpeg.exif() は "Exif\0\0"(6バイト)プレフィックスを既に剥がした
        // TIFF データを返す（segment.rs の slice(EXIF_DATA_PREFIX.len()..)）。
        // よって exif_data の先頭がそのまま TIFF ヘッダー（"II"/"MM"）になる。
        let tiff_data = &exif_data[..];

        // バイトオーダーを確認（"II" = Little Endian, "MM" = Big Endian）
        if tiff_data.len() < 2 {
            return Ok(());
        }

        let is_little_endian = &tiff_data[0..2] == b"II";

        // Orientation タグを探して書き換え
        // タグ 0x0112 (274) = Orientation
        // 型: SHORT (3), カウント: 1, 値: 1
        let mut modified_data = exif_data.to_vec();

        // 簡易実装：TIFFヘッダーを解析してOrientationタグを探し、値を1に変更
        // より堅牢な実装にするには、TIFFフォーマットを完全にパースする必要があります
        // ここでは、既存のOrientationタグが見つかった場合のみ書き換えます

        let orientation_tag: u16 = 0x0112;
        let orientation_bytes = if is_little_endian {
            orientation_tag.to_le_bytes()
        } else {
            orientation_tag.to_be_bytes()
        };

        // TIFFデータ内でOrientationタグを検索
        // modified_data は exif_data（= TIFF データそのもの）のコピー。
        // tiff_data = &exif_data[..] なので、tiff_data の index i は
        // modified_data の index i にそのまま対応する。
        // IFDエントリ構造: タグ(2) + 型(2) + カウント(4) + 値/オフセット(4)
        // 値フィールドは エントリ先頭から 8バイト後ろ → modified_data[(i + 8)..]
        let mut found = false;
        for i in 0..tiff_data.len().saturating_sub(12) {
            if tiff_data[i..i + 2] == orientation_bytes {
                // IFDエントリの型フィールド（タグの直後2バイト）を確認して誤検知を除外する
                // SHORT型 = 0x0003
                let type_offset = i + 2;
                if type_offset + 2 > tiff_data.len() {
                    continue;
                }
                let entry_type = if is_little_endian {
                    u16::from_le_bytes([tiff_data[type_offset], tiff_data[type_offset + 1]])
                } else {
                    u16::from_be_bytes([tiff_data[type_offset], tiff_data[type_offset + 1]])
                };
                // Orientation は SHORT型 (3) でなければ誤検知
                if entry_type != 3 {
                    continue;
                }

                // 値フィールドの位置: modified_data 上の絶対オフセット
                // = tiff_data内のエントリ先頭(i) + タグ(2) + 型(2) + カウント(4)
                let value_offset = i + 8;

                if value_offset + 2 <= modified_data.len() {
                    // 値を1（Normal）に設定（SHORT型なので2バイト）
                    if is_little_endian {
                        modified_data[value_offset] = 1;
                        modified_data[value_offset + 1] = 0;
                    } else {
                        modified_data[value_offset] = 0;
                        modified_data[value_offset + 1] = 1;
                    }
                    found = true;
                    break;
                }
            }
        }

        if found {
            // 修正したEXIFデータを再設定（Bytes型として）
            jpeg.set_exif(Some(Bytes::from(modified_data)));

            // ファイルに書き戻し
            fs::write(image_path, jpeg.encoder().bytes())
                .context("Failed to write JPEG with reset EXIF orientation")?;
        }
    }

    Ok(())
}

/// EXIF Orientation 値がミラー系（2/4/5/7）かを判定する。
///
/// 現実のカメラ・スマホは回転（1/3/6/8）しか付けないため、ミラー系は非対応として
/// スキップ＋ログ記録する（#7 仕様）。
pub fn is_mirror_orientation(value: u32) -> bool {
    matches!(value, 2 | 4 | 5 | 7)
}

/// EXIF Orientation 値を、正しい向きにするための時計回り回転角（度）へ写像する。
///
/// 対応するのは回転のみ（1=0° / 3=180° / 6=90° / 8=270°）。`1`（正常）・ミラー系・
/// 不明値はすべて 0（回転なし）を返す。
pub fn exif_orientation_to_degrees(value: u32) -> u32 {
    match value {
        3 => 180,
        6 => 90,
        8 => 270,
        _ => 0, // 1（正常）/ ミラー系 / 不明
    }
}

/// 画像ファイルをその場で `degrees`（90/180/270）だけロスレス回転する。
///
/// - JPEG は **turbojpeg**（libjpeg-turbo の DCT 領域変換）で無劣化回転する。`copy_none=false`
///   で EXIF/ICC を保持するため日付・GPS は失われない。回転後にピクセルが物理的に回っているので
///   `reset_exif_orientation` で Orientation を 1 に上書きし、ビューアでの二重回転を防ぐ。
/// - JPEG 以外（PNG 等のロスレス形式）は `image` クレートで回転する。
///
/// `degrees` が 0 や非対応値なら何もしない。
pub fn rotate_file_in_place(path: &Path, degrees: u32) -> Result<()> {
    let op = match degrees {
        90 => TransformOp::Rot90,
        180 => TransformOp::Rot180,
        270 => TransformOp::Rot270,
        _ => return Ok(()),
    };

    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if matches!(extension.as_str(), "jpg" | "jpeg") {
        let bytes = fs::read(path).context("Failed to read JPEG for lossless rotation")?;
        // perfect=false（既定）で非MCU境界でもエラーにせず標準ロスレス回転、
        // copy_none=false（既定）で EXIF/ICC マーカーを出力へ引き継ぐ。
        let transform = Transform::op(op);
        let rotated = turbojpeg::transform(&transform, &bytes)
            .map_err(|e| anyhow!("Lossless JPEG rotation failed: {e}"))?;
        fs::write(path, rotated.as_ref()).context("Failed to write rotated JPEG")?;
        // コピーされた古い Orientation 値を 1（Normal）へ上書きする。
        reset_exif_orientation(path)?;
    } else {
        let img = image::open(path).context("Failed to open image for rotation")?;
        let rotated = match degrees {
            90 => img.rotate90(),
            180 => img.rotate180(),
            270 => img.rotate270(),
            _ => img,
        };
        rotated.save(path).context("Failed to save rotated image")?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::GenericImageView;

    #[test]
    fn test_orientation_from_u32() {
        assert_eq!(Orientation::from(1), Orientation::Normal);
        assert_eq!(Orientation::from(3), Orientation::Rotate180);
        assert_eq!(Orientation::from(6), Orientation::Rotate90CW);
        assert_eq!(Orientation::from(8), Orientation::Rotate90CCW);
        assert_eq!(Orientation::from(99), Orientation::Unknown);
    }

    #[test]
    fn test_correct_orientation() {
        // 簡易的なテスト：実際の画像がないため、関数が呼び出せることを確認
        let img = DynamicImage::new_rgb8(100, 100);

        let result = correct_orientation(img.clone(), Orientation::Normal);
        assert_eq!(result.dimensions(), (100, 100));

        let result = correct_orientation(img.clone(), Orientation::Rotate90CW);
        // 90度回転すると、幅と高さが入れ替わる
        assert_eq!(result.dimensions(), (100, 100));
    }

    #[test]
    fn mirror_orientations_are_detected() {
        // ミラー系（2/4/5/7）は非対応 → true
        for v in [2, 4, 5, 7] {
            assert!(is_mirror_orientation(v), "{v} should be mirror");
        }
        // 回転系（1/3/6/8）と不明値は false
        for v in [1, 3, 6, 8, 0, 99] {
            assert!(!is_mirror_orientation(v), "{v} should not be mirror");
        }
    }

    #[test]
    fn exif_orientation_maps_to_clockwise_degrees() {
        // 対応値 1/3/6/8
        assert_eq!(exif_orientation_to_degrees(1), 0);
        assert_eq!(exif_orientation_to_degrees(3), 180);
        assert_eq!(exif_orientation_to_degrees(6), 90);
        assert_eq!(exif_orientation_to_degrees(8), 270);
        // ミラー系・不明は回転しない
        assert_eq!(exif_orientation_to_degrees(2), 0);
        assert_eq!(exif_orientation_to_degrees(5), 0);
        assert_eq!(exif_orientation_to_degrees(99), 0);
    }

    /// テスト用に MCU 境界（16x16）に整列した JPEG を temp に書き出す。
    fn write_test_jpeg(name: &str, width: u32, height: u32) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("photo_returns_tz_{name}.jpg"));
        let img = DynamicImage::new_rgb8(width, height);
        img.save(&path).expect("save test jpeg");
        path
    }

    #[test]
    fn lossless_rotate_jpeg_90_swaps_dimensions() {
        let path = write_test_jpeg("rot90", 32, 16);
        rotate_file_in_place(&path, 90).expect("lossless rotate 90");
        // 90度回転で幅と高さが入れ替わる。再デコードできる＝有効な JPEG。
        let dims = image::open(&path)
            .expect("reopen rotated jpeg")
            .dimensions();
        assert_eq!(dims, (16, 32));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn lossless_rotate_jpeg_180_keeps_dimensions() {
        let path = write_test_jpeg("rot180", 32, 16);
        rotate_file_in_place(&path, 180).expect("lossless rotate 180");
        let dims = image::open(&path)
            .expect("reopen rotated jpeg")
            .dimensions();
        assert_eq!(dims, (32, 16));
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rotate_zero_degrees_is_noop() {
        let path = write_test_jpeg("rot0", 32, 16);
        let before = fs::read(&path).unwrap();
        rotate_file_in_place(&path, 0).expect("noop");
        let after = fs::read(&path).unwrap();
        assert_eq!(before, after, "0度はファイルを変更しない");
        let _ = fs::remove_file(&path);
    }

    /// Orientation=6 の実 EXIF タグを持つ JPEG を作るヘルパー。
    /// 最小の TIFF（II / IFD0 に Orientation=SHORT=6 の1エントリ）を img-parts で付与する。
    fn write_jpeg_with_orientation(name: &str, value: u16) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("photo_returns_ori_{name}.jpg"));
        DynamicImage::new_rgb8(16, 16).save(&path).unwrap();
        let mut jpeg = Jpeg::from_bytes(fs::read(&path).unwrap().into()).unwrap();
        let [vlo, vhi] = value.to_le_bytes();
        let tiff: Vec<u8> = vec![
            0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, IFD0 offset = 8
            0x01, 0x00, // エントリ数 1
            0x12, 0x01, // タグ 0x0112 (Orientation) LE
            0x03, 0x00, // 型 SHORT (3)
            0x01, 0x00, 0x00, 0x00, // カウント 1
            vlo, vhi, 0x00, 0x00, // 値（インライン）
            0x00, 0x00, 0x00, 0x00, // 次 IFD = 0
        ];
        jpeg.set_exif(Some(Bytes::from(tiff)));
        fs::write(&path, jpeg.encoder().bytes()).unwrap();
        path
    }

    #[test]
    fn reset_exif_orientation_actually_sets_normal() {
        let path = write_jpeg_with_orientation("reset6", 6);
        // 前提: 付与した Orientation=6 が読める（=テスト土台が正しい）
        assert_eq!(
            get_orientation(&path).unwrap().orientation,
            Orientation::Rotate90CW,
            "テスト用 JPEG に Orientation=6 が付いているはず"
        );

        reset_exif_orientation(&path).expect("reset");

        // 検証: リセット後は Normal(1)。img-parts の [6..] バグ時はここが 6 のまま落ちる。
        assert_eq!(
            get_orientation(&path).unwrap().orientation,
            Orientation::Normal,
            "reset_exif_orientation 後は Orientation=1 でなければならない"
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rotate_jpeg_with_orientation_resets_to_normal() {
        // ロスレス回転の golden path: 回転後に EXIF Orientation が 1 になる（二重回転防止）。
        let path = write_jpeg_with_orientation("rot_reset8", 8);
        rotate_file_in_place(&path, 270).expect("lossless rotate");
        assert_eq!(
            get_orientation(&path).unwrap().orientation,
            Orientation::Normal,
            "回転後は EXIF Orientation=1 でなければならない"
        );
        let _ = fs::remove_file(&path);
    }
}
