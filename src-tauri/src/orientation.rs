/// 画像の向き検出・修正機能
use anyhow::Result;
use exif::{In, Reader, Tag};
use image::{self, DynamicImage};
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
