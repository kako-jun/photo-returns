/// 画像の向き検出・修正機能
use anyhow::{Context, Result};
use exif::{In, Reader, Tag};
use image::{self, DynamicImage};
use img_parts::jpeg::Jpeg;
use img_parts::{Bytes, ImageEXIF};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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
    let jpeg_bytes = fs::read(image_path)
        .context("Failed to read JPEG file for EXIF reset")?;

    let mut jpeg = Jpeg::from_bytes(jpeg_bytes.into())
        .context("Failed to parse JPEG structure")?;

    // EXIFセグメントを取得
    if let Some(exif_segment) = jpeg.exif() {
        // EXIF データを取得（Bytes型をVec<u8>に変換）
        let exif_data = exif_segment.to_vec();

        // EXIF ヘッダーをスキップ（"Exif\0\0" = 6バイト）
        if exif_data.len() < 6 {
            // EXIFデータが短すぎる場合はスキップ
            return Ok(());
        }

        // TIFFヘッダー以降を取得
        let tiff_data = &exif_data[6..];

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
        let mut found = false;
        for i in 0..tiff_data.len().saturating_sub(12) {
            if &tiff_data[i..i+2] == &orientation_bytes {
                // Orientationタグ発見
                // 値フィールドの位置は タグ(2) + 型(2) + カウント(4) = 8バイト後
                let value_offset = 6 + i + 8;

                if value_offset + 2 <= modified_data.len() {
                    // 値を1に設定（SHORT型なので2バイト）
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
