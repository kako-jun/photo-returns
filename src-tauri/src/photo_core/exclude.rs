//! システム生成物（Android の削除済みファイル・サムネイル・OS メタデータ等）の除外判定（#28）。
//!
//! スマホ写真移行では Android/Google フォトが DCIM に `.trashed-*` という削除済みファイルを
//! 残すことがある。これを PhotoReturns がスキャン・取り込むと、削除したはずの写真が
//! リネームされて永久アーカイブに復活してしまう。`.thumbnails` 配下や `.nomedia` も
//! ユーザーの写真ではないため既定で取り込むべきではない。
//!
//! 判定は `scan_media` の入口（拡張子判定・EXIF読み・日付抽出・バースト検出より前）で行う。
//! 除外されたファイルは `MediaInfo` を作らないため、バースト検出のインデックスにも混ざらない。

use std::collections::HashMap;
use std::path::Path;

use walkdir::DirEntry;

use super::{ExcludedRuleCount, ExcludedSummary};

/// 除外ルール。バリアントの並び順が仕様の表の順であり、`ExcludedSummary::by_rule` の
/// 表示順を決める。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum ExcludeRule {
    /// Android 削除済み（ベース名の前方一致 `.trashed-`）
    Trashed,
    /// 端末生成サムネイル（パス成分のいずれかが `.thumbnails`）
    Thumbnails,
    /// メディアスキャン抑止マーカー（ベース名が `.nomedia`）
    Nomedia,
    /// AppleDouble（ベース名の前方一致 `._`）
    AppleDouble,
    /// OS 生成物（ベース名が `.DS_Store` または `Thumbs.db`）
    OsMetadata,
}

impl ExcludeRule {
    /// 仕様の表の順序で全バリアントを返す。`ExcludedSummary::by_rule` の並び順の正本。
    fn all() -> [ExcludeRule; 5] {
        [
            ExcludeRule::Trashed,
            ExcludeRule::Thumbnails,
            ExcludeRule::Nomedia,
            ExcludeRule::AppleDouble,
            ExcludeRule::OsMetadata,
        ]
    }

    /// ログ・サマリ表示用のルール名。
    fn name(self) -> &'static str {
        match self {
            ExcludeRule::Trashed => "trashed",
            ExcludeRule::Thumbnails => "thumbnails",
            ExcludeRule::Nomedia => "nomedia",
            ExcludeRule::AppleDouble => "apple_double",
            ExcludeRule::OsMetadata => "os_metadata",
        }
    }
}

/// 入力ディレクトリからの相対パスに対し、システム生成物として除外すべきかを判定する純粋関数。
///
/// 必ず「入力ディレクトリからの相対パス」を渡すこと。入力ディレクトリ自身の絶対パスに
/// `.thumbnails` 等の語が含まれていても、それを理由に全件除外してはならない。
pub(crate) fn classify_excluded(relative_path: &Path) -> Option<ExcludeRule> {
    let file_name = relative_path.file_name().and_then(|n| n.to_str())?;

    if file_name.starts_with(".trashed-") {
        return Some(ExcludeRule::Trashed);
    }
    if relative_path
        .components()
        .any(|c| c.as_os_str() == ".thumbnails")
    {
        return Some(ExcludeRule::Thumbnails);
    }
    if file_name == ".nomedia" {
        return Some(ExcludeRule::Nomedia);
    }
    if file_name.starts_with("._") {
        return Some(ExcludeRule::AppleDouble);
    }
    if file_name == ".DS_Store" || file_name == "Thumbs.db" {
        return Some(ExcludeRule::OsMetadata);
    }

    None
}

/// WalkDir のエントリ列を除外対象とそれ以外に振り分ける。
///
/// 除外対象はルール別件数（仕様の表の順、0件のルールは含めない）と、除外された相対パスの
/// サンプル（先頭20件）に集計して `ExcludedSummary` として返す。
pub(crate) fn partition(
    input_dir: &Path,
    entries: Vec<DirEntry>,
) -> (Vec<DirEntry>, ExcludedSummary) {
    const MAX_SAMPLES: usize = 20;

    let mut kept = Vec::with_capacity(entries.len());
    let mut counts: HashMap<ExcludeRule, usize> = HashMap::new();
    let mut samples = Vec::new();

    for entry in entries {
        // owned PathBuf にしておくことで、除外されなかった場合に entry をそのまま
        // kept へ move できる（relative は entry.path() を借用したままにしない）。
        let relative = entry
            .path()
            .strip_prefix(input_dir)
            .unwrap_or_else(|_| entry.path())
            .to_path_buf();
        match classify_excluded(&relative) {
            Some(rule) => {
                *counts.entry(rule).or_insert(0) += 1;
                if samples.len() < MAX_SAMPLES {
                    samples.push(relative.to_string_lossy().to_string());
                }
            }
            None => kept.push(entry),
        }
    }

    let total = counts.values().sum();
    let by_rule = ExcludeRule::all()
        .into_iter()
        .filter_map(|rule| {
            counts.get(&rule).map(|&count| ExcludedRuleCount {
                rule: rule.name().to_string(),
                count,
            })
        })
        .collect();

    (
        kept,
        ExcludedSummary {
            total,
            by_rule,
            samples,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_trashed_by_filename_prefix() {
        assert_eq!(
            classify_excluded(Path::new("DCIM/.trashed-1234567890.jpg")),
            Some(ExcludeRule::Trashed)
        );
    }

    #[test]
    fn classifies_thumbnails_by_path_component() {
        assert_eq!(
            classify_excluded(Path::new("DCIM/.thumbnails/IMG_0001.jpg")),
            Some(ExcludeRule::Thumbnails)
        );
    }

    #[test]
    fn classifies_nomedia_by_exact_filename() {
        assert_eq!(
            classify_excluded(Path::new("DCIM/.nomedia")),
            Some(ExcludeRule::Nomedia)
        );
    }

    #[test]
    fn classifies_apple_double_by_filename_prefix() {
        assert_eq!(
            classify_excluded(Path::new("DCIM/._IMG_1234.JPG")),
            Some(ExcludeRule::AppleDouble)
        );
    }

    #[test]
    fn classifies_os_metadata_by_exact_filename() {
        assert_eq!(
            classify_excluded(Path::new("DCIM/.DS_Store")),
            Some(ExcludeRule::OsMetadata)
        );
        assert_eq!(
            classify_excluded(Path::new("DCIM/Thumbs.db")),
            Some(ExcludeRule::OsMetadata)
        );
    }

    #[test]
    fn ordinary_media_file_is_not_excluded() {
        assert_eq!(classify_excluded(Path::new("DCIM/IMG_0001.jpg")), None);
    }
}
