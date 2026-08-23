//! 由来タグ（#29）: 出力ファイル名にどのソースから来た写真かを残すためのタグ解決。
//!
//! 解決順位: 明示ラベル（`ProcessOptions.provenance_tag`）が非空なら最優先で全ファイルに使う。
//! ラベル未入力かつ `ProcessOptions.provenance_from_folder` が有効なら、ファイルの直上の
//! 親フォルダ名（入力ディレクトリ直下のファイルは入力ディレクトリ自身の名前）を使う。
//! どちらも無ければタグなし（既定 OFF。#29 要件「タグを付けない限り出力は現行と1バイトも
//! 変わらない」はこの2条件を両方満たさない限りタグ解決が一切発火しないことで担保する）。
//!
//! stem（`YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN][_タグ]`）への合成は `dating::build_stem` が
//! 担う。ここでは「どの文字列をタグとして使うか」だけを決める純粋関数を提供する。

use std::path::Path;

/// サニタイズ後の最大文字数。
const MAX_TAG_LEN: usize = 32;

/// タグのサニタイズ規則（#29 仕様）:
/// - パス区切り・`\ / : * ? " < > |`・空白・`_` を `-` に置換（`_` は命名の区切り記号のため潰す）
/// - 連続する `-` を1個に畳み、先頭末尾の `-` を除去
/// - 最大 `MAX_TAG_LEN` 文字で切り詰め（切り詰めで末尾に `-` が残ったら除去）
/// - 非 ASCII（日本語等）は保持する
/// - 結果が空、または2桁の純数字（"01" 等。衝突連番・バースト連番と見分けがつかない。
///   全角数字（"０１" 等）や半角全角混在（"0１" 等）も対象）なら `None`（タグなし扱い）
pub(crate) fn sanitize_tag(raw: &str) -> Option<String> {
    let mut collapsed = String::with_capacity(raw.len());
    let mut prev_dash = false;
    for ch in raw.chars() {
        let mapped = if is_replaced_char(ch) { '-' } else { ch };
        if mapped == '-' {
            if prev_dash {
                continue;
            }
            prev_dash = true;
        } else {
            prev_dash = false;
        }
        collapsed.push(mapped);
    }

    let trimmed = collapsed.trim_matches('-');
    if trimmed.is_empty() {
        return None;
    }

    let truncated: String = trimmed.chars().take(MAX_TAG_LEN).collect();
    let truncated = truncated.trim_end_matches('-');
    if truncated.is_empty() {
        return None;
    }

    if is_pure_two_digit(truncated) {
        return None;
    }

    Some(truncated.to_string())
}

/// サニタイズで `-` に置換する文字（パス区切り・予約文字・空白・`_`）。
fn is_replaced_char(ch: char) -> bool {
    matches!(
        ch,
        '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '_'
    ) || ch.is_whitespace()
}

/// 2桁の純数字（"00"〜"99"）か。衝突連番・バースト連番（`_NN`）と見分けがつかないため拒否する。
/// 全角数字（`０`〜`９`等）も対象に含める。半角と紛らわしく `_01` に読み違えられるため、
/// 文字種は ASCII に絞らず `char::is_numeric()` で判定する。バイト長では全角1文字が
/// 3バイトになり誤判定するため、`chars().count()` で文字数として2桁を数える。
fn is_pure_two_digit(s: &str) -> bool {
    s.chars().count() == 2 && s.chars().all(char::is_numeric)
}

/// ファイルの直上の親フォルダ名を返す純粋関数（入力ディレクトリからの相対パスを受け取る）。
/// 相対パスの親が空（入力ディレクトリ直下のファイル）なら `None`。この場合の
/// 「入力ディレクトリ自身の名前」フォールバックは呼び出し側（`scan_media`）が補う。
pub(crate) fn parent_folder_name(relative_path: &Path) -> Option<String> {
    let parent = relative_path.parent()?;
    if parent.as_os_str().is_empty() {
        return None;
    }
    parent.file_name()?.to_str().map(str::to_string)
}

/// 1ファイル分のタグを解決する。戻り値は `(採用タグ, 警告メッセージ)`。
///
/// - `explicit_tag`（呼び出し側が実行開始時に一度だけ `sanitize_tag` で検証済みの明示ラベル）
///   があれば最優先でそのまま採用する。
/// - 無ければ `from_folder` が true のときだけ `folder_candidate` をサニタイズして使う。
///   サニタイズで拒否された場合は `(None, Some(警告メッセージ))` を返す（タグなしにフォールバック。
///   明示ラベルと違いフォルダ由来は自動導出のため、ここでは実行を止めずログだけ残す）。
/// - どちらも無ければ `(None, None)`。
pub(crate) fn resolve_tag_for_file(
    explicit_tag: Option<&str>,
    from_folder: bool,
    folder_candidate: Option<&str>,
) -> (Option<String>, Option<String>) {
    if let Some(tag) = explicit_tag {
        return (Some(tag.to_string()), None);
    }
    if !from_folder {
        return (None, None);
    }
    let Some(candidate) = folder_candidate else {
        return (None, None);
    };
    match sanitize_tag(candidate) {
        Some(tag) => (Some(tag), None),
        None => (
            None,
            Some(format!(
                "由来タグ候補 '{candidate}' はサニタイズ後に使用できないため、タグなしにフォールバックしました"
            )),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== sanitize_tag =====

    #[test]
    fn sanitize_plain_ascii_is_unchanged() {
        assert_eq!(sanitize_tag("takeout"), Some("takeout".to_string()));
    }

    #[test]
    fn sanitize_replaces_forbidden_chars_with_dash() {
        assert_eq!(
            sanitize_tag("a/b\\c:d*e?f\"g<h>i|j"),
            Some("a-b-c-d-e-f-g-h-i-j".to_string())
        );
    }

    #[test]
    fn sanitize_replaces_underscore_with_dash() {
        assert_eq!(
            sanitize_tag("google_photos"),
            Some("google-photos".to_string())
        );
    }

    #[test]
    fn sanitize_replaces_whitespace_with_dash() {
        assert_eq!(
            sanitize_tag("my label here"),
            Some("my-label-here".to_string())
        );
    }

    #[test]
    fn sanitize_collapses_consecutive_dashes() {
        assert_eq!(sanitize_tag("a---b"), Some("a-b".to_string()));
        assert_eq!(sanitize_tag("a  //  b"), Some("a-b".to_string()));
    }

    #[test]
    fn sanitize_trims_leading_and_trailing_dashes() {
        assert_eq!(sanitize_tag("--takeout--"), Some("takeout".to_string()));
        assert_eq!(sanitize_tag("/takeout/"), Some("takeout".to_string()));
    }

    #[test]
    fn sanitize_keeps_non_ascii() {
        assert_eq!(
            sanitize_tag("お母さんのiPhone"),
            Some("お母さんのiPhone".to_string())
        );
    }

    #[test]
    fn sanitize_truncates_to_32_chars() {
        let raw = "a".repeat(50);
        let got = sanitize_tag(&raw).unwrap();
        assert_eq!(got.chars().count(), 32);
        assert_eq!(got, "a".repeat(32));
    }

    #[test]
    fn sanitize_truncation_trims_trailing_dash_at_boundary() {
        // 32文字目がちょうど '-' になるケースでも末尾ダッシュは残らない。
        let raw = format!("{}-{}", "a".repeat(31), "b".repeat(10));
        let got = sanitize_tag(&raw).unwrap();
        assert_eq!(got, "a".repeat(31));
    }

    #[test]
    fn sanitize_empty_after_processing_is_none() {
        assert_eq!(sanitize_tag(""), None);
        assert_eq!(sanitize_tag("___"), None);
        assert_eq!(sanitize_tag("///"), None);
        assert_eq!(sanitize_tag("   "), None);
    }

    #[test]
    fn sanitize_rejects_pure_two_digit() {
        assert_eq!(sanitize_tag("01"), None);
        assert_eq!(sanitize_tag("99"), None);
        assert_eq!(sanitize_tag("00"), None);
    }

    #[test]
    fn sanitize_allows_non_two_digit_numerics() {
        assert_eq!(sanitize_tag("1"), Some("1".to_string()));
        assert_eq!(sanitize_tag("100"), Some("100".to_string()));
        assert_eq!(sanitize_tag("2024"), Some("2024".to_string()));
    }

    #[test]
    fn sanitize_two_digit_after_replacement_is_rejected() {
        // 置換・畳み込み後に2桁純数字になるケースも拒否される（先頭末尾の `-` が
        // trim され "01" だけが残るパターン）。
        assert_eq!(sanitize_tag("_01_"), None);
        assert_eq!(sanitize_tag("/01/"), None);
    }

    #[test]
    fn sanitize_rejects_full_width_two_digit() {
        // 全角2桁は機械的には ASCII "01" と別物だが、人間が読むと "_01" と紛らわしいため拒否する。
        assert_eq!(sanitize_tag("０１"), None);
    }

    #[test]
    fn sanitize_rejects_mixed_width_two_digit() {
        // 半角＋全角の混在2桁も同様に拒否する。
        assert_eq!(sanitize_tag("0１"), None);
    }

    #[test]
    fn sanitize_allows_two_char_non_numeric() {
        // 2文字でも数字でなければ許可される（"jp" 等の言語コードのようなタグ）。
        assert_eq!(sanitize_tag("jp"), Some("jp".to_string()));
    }

    // ===== parent_folder_name =====

    #[test]
    fn parent_folder_name_returns_immediate_parent() {
        assert_eq!(
            parent_folder_name(Path::new("Takeout/Google フォト/2015-06-01/x.jpg")),
            Some("2015-06-01".to_string())
        );
    }

    #[test]
    fn parent_folder_name_none_when_file_is_at_root() {
        assert_eq!(parent_folder_name(Path::new("x.jpg")), None);
    }

    #[test]
    fn parent_folder_name_single_level() {
        assert_eq!(
            parent_folder_name(Path::new("pixel8/IMG_0001.jpg")),
            Some("pixel8".to_string())
        );
    }

    // ===== resolve_tag_for_file =====

    #[test]
    fn resolve_prefers_explicit_over_folder() {
        let (tag, warn) = resolve_tag_for_file(Some("takeout"), true, Some("2015-06-01"));
        assert_eq!(tag, Some("takeout".to_string()));
        assert_eq!(warn, None);
    }

    #[test]
    fn resolve_uses_folder_when_no_explicit_and_enabled() {
        let (tag, warn) = resolve_tag_for_file(None, true, Some("2015-06-01"));
        assert_eq!(tag, Some("2015-06-01".to_string()));
        assert_eq!(warn, None);
    }

    #[test]
    fn resolve_no_tag_when_folder_fallback_disabled() {
        let (tag, warn) = resolve_tag_for_file(None, false, Some("2015-06-01"));
        assert_eq!(tag, None);
        assert_eq!(warn, None);
    }

    #[test]
    fn resolve_no_tag_when_no_folder_candidate() {
        let (tag, warn) = resolve_tag_for_file(None, true, None);
        assert_eq!(tag, None);
        assert_eq!(warn, None);
    }

    #[test]
    fn resolve_falls_back_with_warning_when_folder_candidate_rejected() {
        let (tag, warn) = resolve_tag_for_file(None, true, Some("01"));
        assert_eq!(tag, None);
        assert!(warn.is_some());
        assert!(warn.unwrap().contains("01"));
    }
}
