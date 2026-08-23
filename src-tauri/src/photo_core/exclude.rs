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
    use std::path::PathBuf;
    use walkdir::WalkDir;

    /// テスト専用の一時ディレクトリを作る（既存があれば削除してから作り直す）。
    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("pr_exclude_unit_{tag}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 実ファイルを書いたディレクトリを WalkDir で辿り、`partition` の入力用 DirEntry 列を返す。
    /// `DirEntry` は walkdir がディスク走査でしか作れないため、`partition` 単体テストは
    /// 実ファイルを介する必要がある。
    fn walk_files(dir: &Path) -> Vec<DirEntry> {
        WalkDir::new(dir)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .collect()
    }

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

    /// ルール優先順位の交差（1ファイルが複数ルールに該当し得るとき、どのルール名で集計
    /// されるか）を固定する回帰テスト。実装の if-else 順（trashed → thumbnails →
    /// nomedia → apple_double → os_metadata）に依存する暗黙知なので、if 文の並び替えで
    /// 静かに挙動が変わるのをここで検知する。
    #[test]
    fn rule_priority_when_multiple_rules_could_match() {
        let cases: [(&str, ExcludeRule); 5] = [
            (".thumbnails/.trashed-123.jpg", ExcludeRule::Trashed),
            (".thumbnails/.nomedia", ExcludeRule::Thumbnails),
            (".thumbnails/._IMG.jpg", ExcludeRule::Thumbnails),
            (".thumbnails/Thumbs.db", ExcludeRule::Thumbnails),
            (".thumbnails/.DS_Store", ExcludeRule::Thumbnails),
        ];
        for (path, expected) in cases {
            assert_eq!(
                classify_excluded(Path::new(path)),
                Some(expected),
                "path={path} の分類ルールが期待と食い違う"
            );
        }
    }

    /// 大文字表記は除外されないことを意図的仕様として固定する（Issue で合意済みの
    /// case-sensitive 判定）。将来「大文字小文字を無視する」修正が無自覚に入るのを検知する。
    #[test]
    fn uppercase_variants_are_not_excluded_case_sensitive_by_design() {
        assert_eq!(classify_excluded(Path::new("DCIM/.TRASHED-123.jpg")), None);
        assert_eq!(
            classify_excluded(Path::new("DCIM/.Thumbnails/foo.jpg")),
            None
        );
    }

    /// サンプル配列20件の境界値。`<` と `<=` の取り違えを狙い撃つ核心テスト。
    /// samples は先頭20件で頭打ちになるが、total / by_rule の count はそれとは独立に
    /// 正確な件数を保つはず。
    #[test]
    fn partition_caps_samples_at_20_but_total_and_by_rule_stay_exact() {
        for (n, expected_samples) in [(19usize, 19usize), (20, 20), (21, 20)] {
            let dir = temp_dir(&format!("samples_{n}"));
            for i in 0..n {
                std::fs::write(dir.join(format!(".trashed-{i:03}.jpg")), b"x").unwrap();
            }

            let (kept, summary) = partition(&dir, walk_files(&dir));

            assert!(
                kept.is_empty(),
                "trashed だけなので kept は空のはず (n={n})"
            );
            assert_eq!(
                summary.total, n,
                "total は samples 上限と独立に正確 (n={n})"
            );
            assert_eq!(
                summary.samples.len(),
                expected_samples,
                "samples は20件で頭打ちのはず (n={n})"
            );
            assert_eq!(summary.by_rule.len(), 1);
            assert_eq!(
                summary.by_rule[0].count, n,
                "by_rule の count も samples 上限と無関係に正確 (n={n})"
            );

            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    /// `by_rule` の合計と `total` の不変条件。将来ルール追加時に `ExcludeRule::all()` の
    /// 更新漏れで `total` と `by_rule` の合計が静かにズレるのを防ぐ回帰テスト。
    #[test]
    fn by_rule_counts_sum_to_total() {
        let dir = temp_dir("sum_invariant");
        std::fs::write(dir.join(".trashed-1.jpg"), b"x").unwrap();
        std::fs::write(dir.join(".trashed-2.jpg"), b"x").unwrap();
        let thumbs = dir.join(".thumbnails");
        std::fs::create_dir_all(&thumbs).unwrap();
        std::fs::write(thumbs.join("a.jpg"), b"x").unwrap();
        std::fs::write(dir.join(".nomedia"), b"x").unwrap();
        std::fs::write(dir.join("._IMG.jpg"), b"x").unwrap();
        std::fs::write(dir.join(".DS_Store"), b"x").unwrap();
        std::fs::write(dir.join("Thumbs.db"), b"x").unwrap();
        std::fs::write(dir.join("IMG_0001.jpg"), b"x").unwrap(); // 通常ファイル（除外されない）

        let (kept, summary) = partition(&dir, walk_files(&dir));

        assert_eq!(kept.len(), 1, "通常ファイル1件だけ kept されるはず");
        let sum: usize = summary.by_rule.iter().map(|rc| rc.count).sum();
        assert_eq!(
            sum, summary.total,
            "by_rule の合計は total と一致するはず（ルール追加漏れの回帰検知）"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 日本語ファイル名混在。`.thumbnails/思い出の写真.jpg` のような非ASCIIを含む相対パスで
    /// 判定（thumbnails ルール）とサンプル文字列化（to_string_lossy）が壊れないこと。
    #[test]
    fn japanese_filename_is_classified_and_sampled_without_corruption() {
        let dir = temp_dir("japanese");
        let thumbs = dir.join(".thumbnails");
        std::fs::create_dir_all(&thumbs).unwrap();
        std::fs::write(thumbs.join("思い出の写真.jpg"), b"x").unwrap();

        let (kept, summary) = partition(&dir, walk_files(&dir));

        assert!(kept.is_empty());
        assert_eq!(summary.total, 1);
        assert_eq!(summary.by_rule[0].rule, "thumbnails");
        assert!(
            summary
                .samples
                .iter()
                .any(|s| s.contains("思い出の写真.jpg")),
            "日本語ファイル名がサンプルに文字化けせず残るはず: {:?}",
            summary.samples
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
