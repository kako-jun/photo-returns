//! 日付の抽出・取得・ファイル名生成（純粋寄りの日付ユーティリティ）

use anyhow::Result;
use chrono::{DateTime, Local, TimeZone};
use std::fs;
use std::path::Path;

/// ファイル名から日付を抽出
pub(crate) fn extract_date_from_filename(filename: &str) -> Option<DateTime<Local>> {
    use regex::Regex;

    // パターン1: YYYYMMDD_HHMMSS (最も一般的)
    // 例: IMG_20250115_103000.jpg, Screenshot_20250115_103000.png
    let re1 = Regex::new(r"(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})").ok()?;
    if let Some(caps) = re1.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;
        let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
        let minute: u32 = caps.get(5)?.as_str().parse().ok()?;
        let second: u32 = caps.get(6)?.as_str().parse().ok()?;

        if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(hour, minute, second))
        {
            return Local.from_local_datetime(&naive).single();
        }
    }

    // パターン2: YYYY-MM-DD_HH-MM-SS
    // 例: 2025-01-15_10-30-00.jpg
    let re2 = Regex::new(r"(\d{4})-(\d{2})-(\d{2})[_T](\d{2})-(\d{2})-(\d{2})").ok()?;
    if let Some(caps) = re2.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;
        let hour: u32 = caps.get(4)?.as_str().parse().ok()?;
        let minute: u32 = caps.get(5)?.as_str().parse().ok()?;
        let second: u32 = caps.get(6)?.as_str().parse().ok()?;

        if let Some(naive) = chrono::NaiveDate::from_ymd_opt(year, month, day)
            .and_then(|d| d.and_hms_opt(hour, minute, second))
        {
            return Local.from_local_datetime(&naive).single();
        }
    }

    // パターン3: Unixタイムスタンプ（ミリ秒、13桁）
    // 例: 1763020644906.jpg (Cshotバースト写真等)
    let re_ts = Regex::new(r"^(\d{13})").ok()?;
    if let Some(caps) = re_ts.captures(filename) {
        let ts_ms: i64 = caps.get(1)?.as_str().parse().ok()?;
        let ts_sec = ts_ms / 1000;
        if let Some(dt) = chrono::DateTime::from_timestamp(ts_sec, 0) {
            return Some(dt.with_timezone(&Local));
        }
    }

    // パターン4: YYYYMMDDのみ（時刻なし）
    // 例: IMG-20250115-WA0001.jpg (WhatsApp)
    let re3 = Regex::new(r"(\d{4})(\d{2})(\d{2})").ok()?;
    if let Some(caps) = re3.captures(filename) {
        let year: i32 = caps.get(1)?.as_str().parse().ok()?;
        let month: u32 = caps.get(2)?.as_str().parse().ok()?;
        let day: u32 = caps.get(3)?.as_str().parse().ok()?;

        if let Some(naive) =
            chrono::NaiveDate::from_ymd_opt(year, month, day).and_then(|d| d.and_hms_opt(0, 0, 0))
        {
            return Local.from_local_datetime(&naive).single();
        }
    }

    None
}

/// ファイルの作成日時を取得
pub(crate) fn get_file_created_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;
    let created = metadata.created()?;
    Ok(DateTime::from(created))
}

/// ファイルの変更日時を取得
pub(crate) fn get_file_modified_date(path: &Path) -> Result<DateTime<Local>> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?;
    Ok(DateTime::from(modified))
}

/// 日時＋サブ秒だけの stem（YYYY-MM-DD_HH-mm-ss[-mmm]）を組み立てる。
/// `build_stem` / `format_filename` の共通部分（単一の正本）。
fn format_datetime_stem(date: &DateTime<Local>, subsec: Option<u32>) -> String {
    if let Some(ms) = subsec {
        // ミリ秒がある場合は3桁で追加
        format!("{}-{:03}", date.format("%Y-%m-%d_%H-%M-%S"), ms)
    } else {
        // ミリ秒がない場合は秒まで
        date.format("%Y-%m-%d_%H-%M-%S").to_string()
    }
}

/// 出力ファイル名の stem（拡張子なし）を組み立てる単一の正本（#29）。
///
/// `mod.rs` 内に散在していた「日付＋サブ秒→base_name」の重複実装（scan 時の初期名・
/// バースト連番反映・衝突時の再生成の3箇所）をここへ集約する。組み立て順は
/// `YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN][_タグ]`（バースト連番の後、衝突連番の前に
/// タグを置く。衝突連番はこの関数の外＝呼び出し側が末尾に付与する）。
///
/// - `date` が `None`（撮影日時なし＝unsorted 行き）の場合は `fallback_stem`（通常は元ファイルの
///   ステム）をそのまま使う。この場合バースト連番は付与しない（バースト検出は日付ありの
///   ファイルにしか適用されないため）。
pub(crate) fn build_stem(
    date: Option<&DateTime<Local>>,
    subsec: Option<u32>,
    burst_index: Option<usize>,
    fallback_stem: &str,
    tag: Option<&str>,
) -> String {
    let mut stem = match date {
        Some(date) => format_datetime_stem(date, subsec),
        None => fallback_stem.to_string(),
    };
    if let Some(idx) = burst_index {
        stem.push_str(&format!("_{idx:02}"));
    }
    if let Some(tag) = tag {
        stem.push('_');
        stem.push_str(tag);
    }
    stem
}

/// `scan_media` の並列スキャン後の並びを決定的にするための比較関数（#29 確定仕様
/// 「同一入力・同一オプションなら常に同じ名前になる」＝決定性を担保する）。
///
/// `ProcessOptions.parallel` の並列スキャンはスレッドスケジューリング依存で、処理完了順が
/// 実行のたびに変わりうる。バースト検出（`detect_burst_groups`）はこのソート後の並びを前提に
/// 走るため、比較キーが弱いと「ソート前の非決定な並び」がタイの中に残ってしまう
/// （`sort_by` は安定ソートなので、タイは元の並び順のまま保持される）。
///
/// 優先順位:
///   1. `date_taken`（`None` は末尾。撮影日時なし＝unsorted 行きのため最後でよい）
///   2. `subsec_time`（`None` は `Some` より先。同一秒内はミリ秒昇順で並ぶ）
///   3. `original_path`（最終タイブレーク）。`date_taken`/`subsec_time` が両方 None で
///      揃うケースも含め、常にこれで一意に決まる。以前は `file_name` で比較していたが、
///      異なるディレクトリ間ではファイル名が重複しうるため、常に一意な `original_path` に
///      統一した。
pub(crate) fn compare_scan_order(
    a_date: Option<DateTime<Local>>,
    a_subsec: Option<u32>,
    a_path: &Path,
    b_date: Option<DateTime<Local>>,
    b_subsec: Option<u32>,
    b_path: &Path,
) -> std::cmp::Ordering {
    a_date
        .is_none()
        .cmp(&b_date.is_none())
        .then_with(|| a_date.cmp(&b_date))
        .then_with(|| a_subsec.cmp(&b_subsec))
        .then_with(|| a_path.cmp(b_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Local の決定的な日時を生成するヘルパー。
    /// `with_ymd_and_hms` は曖昧でない限り単一の結果を返すので、
    /// テスト内の比較対象は固定値で組み立てる。
    fn local(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Local> {
        Local.with_ymd_and_hms(y, mo, d, h, mi, s).single().unwrap()
    }

    // ===== extract_date_from_filename =====
    //
    // characterization: 実装が現に持つ4パターンを pin する。
    //   P1: (\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})  ← 区切りは _ または -
    //   P2: (\d{4})-(\d{2})-(\d{2})[_T](\d{2})-(\d{2})-(\d{2})
    //   P3: ^(\d{13})  Unix ミリ秒（先頭アンカー）
    //   P4: (\d{4})(\d{2})(\d{2})  8桁のみ（時刻なし→00:00:00）
    // パターンの評価順は P1→P2→P3→P4。

    #[test]
    fn extract_p1_img_underscore() {
        // 例: IMG_20250115_103000.jpg
        let got = extract_date_from_filename("IMG_20250115_103000.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    #[test]
    fn extract_p1_screenshot_underscore() {
        let got = extract_date_from_filename("Screenshot_20250115_103000.png");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    #[test]
    fn extract_p1_dash_separator() {
        // P1 の区切りは [_-] なので、YYYYMMDD-HHMMSS もマッチする
        let got = extract_date_from_filename("20250115-103000.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    #[test]
    fn extract_p1_embedded_in_longer_name() {
        // 前後に余計な文字があっても部分マッチで拾う（P1 はアンカー無し）
        let got = extract_date_from_filename("foo_20251231_235959_bar.jpeg");
        assert_eq!(got, Some(local(2025, 12, 31, 23, 59, 59)));
    }

    #[test]
    fn extract_p2_dashed_with_underscore() {
        // 例: 2025-01-15_10-30-00.jpg
        let got = extract_date_from_filename("2025-01-15_10-30-00.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    #[test]
    fn extract_p2_dashed_with_t_separator() {
        // P2 の日付↔時刻の区切りは [_T]
        let got = extract_date_from_filename("2025-01-15T10-30-00.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    #[test]
    fn extract_p3_unix_ms_timestamp_returns_some() {
        // 13桁 Unix ミリ秒（Cshot バースト等）。
        // P3 は from_timestamp→with_timezone(Local) で実行環境の TZ に依存するため
        // 壁時計の値は pin せず、Some を返すこと（パターンがマッチすること）だけを固定する。
        let got = extract_date_from_filename("1763020644906.jpg");
        assert!(got.is_some());
    }

    #[test]
    fn extract_p3_timestamp_must_be_at_start_falls_through_to_p4() {
        // quirk(characterization): P3 は先頭アンカー(^)なので、先頭に無い13桁は
        // P3 にマッチしない。しかし数字列 "1763020644906" は P4 の (\d{4})(\d{2})(\d{2})
        // に部分マッチし、1763-02-06 という（タイムスタンプ由来とは無関係な）日付として
        // 拾われる。実装の現状挙動をそのまま pin する。
        let got = extract_date_from_filename("x1763020644906.jpg");
        assert_eq!(got, Some(local(1763, 2, 6, 0, 0, 0)));
    }

    #[test]
    fn extract_p4_date_only_no_time() {
        // 例: IMG-20250115-WA0001.jpg (WhatsApp)。時刻なし→00:00:00
        let got = extract_date_from_filename("IMG-20250115-WA0001.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 0, 0, 0)));
    }

    #[test]
    fn extract_p4_plain_eight_digits() {
        let got = extract_date_from_filename("20250115.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 0, 0, 0)));
    }

    #[test]
    fn extract_none_when_no_digits() {
        let got = extract_date_from_filename("vacation_photo.jpg");
        assert_eq!(got, None);
    }

    #[test]
    fn extract_none_invalid_month() {
        // 13月は from_ymd_opt が None を返すため、P1 はマッチしても日付化に失敗。
        // 残る数字 "20251315" は P4 にもかかるが、これも month=13 で None。
        let got = extract_date_from_filename("IMG_20251315_103000.jpg");
        assert_eq!(got, None);
    }

    #[test]
    fn extract_none_invalid_day() {
        // 2月30日は存在しない。P1 失敗 → P4 でも 20250230 は不正日付で None。
        let got = extract_date_from_filename("IMG_20250230_103000.jpg");
        assert_eq!(got, None);
    }

    #[test]
    fn extract_p1_invalid_time_falls_through_to_p4() {
        // quirk: 時刻が不正(25時)でも、含まれる8桁日付が P4 で拾われる。
        // P1 は from_ymd...and_hms_opt(25,..) が None → P1 不成立。
        // 続いて P4 が "20250115" を拾い 00:00:00 として返す。
        let got = extract_date_from_filename("IMG_20250115_250000.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 0, 0, 0)));
    }

    #[test]
    fn extract_p1_preferred_over_p4_when_both_present() {
        // P1 が成立する場合は時刻付きの結果が返る（P4 の date-only より P1 優先）。
        let got = extract_date_from_filename("IMG_20250115_103000.jpg");
        assert_eq!(got, Some(local(2025, 1, 15, 10, 30, 0)));
    }

    // ===== build_stem の日時フォーマット characterization（旧 format_filename 相当）=====
    //
    // stem 部分: YYYY-MM-DD_HH-mm-ss[-mmm]。
    //   subsec あり: "-{:03}" でゼロ詰め3桁ミリ秒を付与。
    //   subsec なし: 秒まで。
    // 拡張子付与は呼び出し側（`format!("{stem}.{ext}")`）の責務で build_stem 自体は関知しない。

    #[test]
    fn format_with_subsec_three_digits() {
        let d = local(2025, 12, 31, 23, 59, 59);
        assert_eq!(
            build_stem(Some(&d), Some(906), None, "", None),
            "2025-12-31_23-59-59-906"
        );
    }

    #[test]
    fn format_with_subsec_over_three_digits_not_truncated() {
        // quirk: {:03} は最小幅3桁なので、3桁を超える値はそのまま出る（切り詰めない）。
        let d = local(2025, 1, 15, 10, 30, 0);
        assert_eq!(
            build_stem(Some(&d), Some(1234), None, "", None),
            "2025-01-15_10-30-00-1234"
        );
    }

    #[test]
    fn format_zero_pads_date_components() {
        // 1桁の月/日/時/分/秒はゼロ詰めされる。
        let d = local(2025, 3, 4, 5, 6, 7);
        assert_eq!(
            build_stem(Some(&d), None, None, "", None),
            "2025-03-04_05-06-07"
        );
    }

    #[test]
    fn roundtrip_p2_format_then_extract() {
        // build_stem の出力（subsec なし）+ 拡張子は P2 で読み戻せる。
        let d = local(2025, 1, 15, 10, 30, 0);
        let name = format!("{}.jpg", build_stem(Some(&d), None, None, "", None));
        let back = extract_date_from_filename(&name);
        assert_eq!(back, Some(d));
    }

    // ===== build_stem（#29: stem 生成の単一正本）=====
    //
    // 組み立て順は YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN][_タグ]。
    // 日付なし（unsorted）は fallback_stem[_タグ]。衝突連番はこの関数の外（呼び出し側）。

    #[test]
    fn build_stem_date_only_matches_format_filename_stem_part() {
        let d = local(2025, 4, 22, 20, 59, 15);
        assert_eq!(
            build_stem(Some(&d), None, None, "", None),
            "2025-04-22_20-59-15"
        );
    }

    #[test]
    fn build_stem_with_subsec() {
        let d = local(2025, 4, 22, 20, 59, 15);
        assert_eq!(
            build_stem(Some(&d), Some(250), None, "", None),
            "2025-04-22_20-59-15-250"
        );
    }

    #[test]
    fn build_stem_with_burst_index_zero_padded() {
        let d = local(2025, 4, 22, 20, 59, 15);
        assert_eq!(
            build_stem(Some(&d), None, Some(1), "", None),
            "2025-04-22_20-59-15_01"
        );
        assert_eq!(
            build_stem(Some(&d), None, Some(2), "", None),
            "2025-04-22_20-59-15_02"
        );
    }

    #[test]
    fn build_stem_with_tag_only() {
        let d = local(2025, 4, 22, 20, 59, 15);
        assert_eq!(
            build_stem(Some(&d), None, None, "", Some("takeout")),
            "2025-04-22_20-59-15_takeout"
        );
    }

    #[test]
    fn build_stem_burst_index_comes_before_tag() {
        // 仕様: タグの位置 = バースト連番の後・衝突連番の前
        let d = local(2025, 4, 22, 20, 59, 15);
        assert_eq!(
            build_stem(Some(&d), None, Some(1), "", Some("takeout")),
            "2025-04-22_20-59-15_01_takeout"
        );
        assert_eq!(
            build_stem(Some(&d), None, Some(2), "", Some("takeout")),
            "2025-04-22_20-59-15_02_takeout"
        );
    }

    #[test]
    fn build_stem_no_date_uses_fallback_stem_verbatim() {
        assert_eq!(build_stem(None, None, None, "IMG_1234", None), "IMG_1234");
    }

    #[test]
    fn build_stem_no_date_with_tag_appends_after_fallback_stem() {
        assert_eq!(
            build_stem(None, None, None, "IMG_1234", Some("takeout")),
            "IMG_1234_takeout"
        );
    }

    #[test]
    fn build_stem_no_date_ignores_burst_index() {
        // 日付なしのファイルに burst_index を渡しても素通しで付与される（date=None は
        // burst_index を無視/拒否しない）。`build_stem` はフィールド間の整合性を検証しない
        // 低レベルな純粋フォーマッタとして意図的にこの形にしてある——「契約」に格上げ
        // （＝date=None のとき burst_index を拒否/無視する）はしない。
        //
        // date=None かつ burst_index=Some の組み合わせは、現在の呼び出し側3箇所では
        // 構造的に到達不能:
        //   - `scan_media` 初期構築（mod.rs）: date=None の分岐では burst_index を渡していない
        //   - `scan_media` バースト反映ループ（mod.rs）: `if let Some(date) = ...` の中でしか
        //     `build_stem` を呼ばない
        //   - `apply_timezone_correction`（mod.rs）: 冒頭で `let Some(date) = ... else { return }`
        //   - `process_media_inner` 衝突ループ（mod.rs）: burst_index はそもそも scan 時に
        //     date=Some の写真にしか付与されない（`burst::detect_burst_groups` が
        //     `dates` の `None` 要素をどの `BurstGroup.photo_indices` にも含めないことは
        //     `burst::tests::none_dated_entries_are_never_included_in_any_group` で保証済み）
        // ここでは「実装のなりゆき」を正直に pin したまま、その安全性の根拠を上記の
        // 統合的な保証（burst.rs のテスト）に委ねる、という判断にした。
        assert_eq!(
            build_stem(None, None, Some(1), "IMG_1234", None),
            "IMG_1234_01"
        );
    }

    // ===== compare_scan_order =====

    #[test]
    fn compare_scan_order_same_second_orders_by_subsec_ascending() {
        // 同一秒・異なるサブ秒の3枚がサブ秒の昇順に並ぶ。
        let d = local(2025, 6, 1, 12, 0, 0);
        let mut items = [
            (Some(d), Some(500), Path::new("/in/c.jpg")),
            (Some(d), Some(100), Path::new("/in/a.jpg")),
            (Some(d), Some(300), Path::new("/in/b.jpg")),
        ];
        items.sort_by(|a, b| compare_scan_order(a.0, a.1, a.2, b.0, b.1, b.2));
        let subsecs: Vec<Option<u32>> = items.iter().map(|i| i.1).collect();
        assert_eq!(subsecs, vec![Some(100), Some(300), Some(500)]);
    }

    #[test]
    fn compare_scan_order_same_second_no_subsec_orders_by_original_path() {
        // 同一秒・サブ秒なしの3枚は original_path の昇順で安定して並ぶ。
        let d = local(2025, 6, 1, 12, 0, 0);
        let mut items = [
            (Some(d), None, Path::new("/in/z.jpg")),
            (Some(d), None, Path::new("/in/a.jpg")),
            (Some(d), None, Path::new("/in/m.jpg")),
        ];
        items.sort_by(|a, b| compare_scan_order(a.0, a.1, a.2, b.0, b.1, b.2));
        let paths: Vec<&Path> = items.iter().map(|i| i.2).collect();
        assert_eq!(
            paths,
            vec![
                Path::new("/in/a.jpg"),
                Path::new("/in/m.jpg"),
                Path::new("/in/z.jpg"),
            ]
        );
    }

    #[test]
    fn compare_scan_order_subsec_none_before_some_within_same_second() {
        // subsec の None は Some より先（同一秒内で「サブ秒情報なし」が先頭に来る）。
        let d = local(2025, 6, 1, 12, 0, 0);
        let mut items = [
            (Some(d), Some(1), Path::new("/in/with-subsec.jpg")),
            (Some(d), None, Path::new("/in/no-subsec.jpg")),
        ];
        items.sort_by(|a, b| compare_scan_order(a.0, a.1, a.2, b.0, b.1, b.2));
        assert_eq!(items[0].2, Path::new("/in/no-subsec.jpg"));
        assert_eq!(items[1].2, Path::new("/in/with-subsec.jpg"));
    }

    #[test]
    fn compare_scan_order_date_taken_none_sorts_last() {
        // date_taken が None のファイルは末尾に移動する（既存挙動を維持）。
        let d = local(2025, 6, 1, 12, 0, 0);
        let mut items = [
            (None, None, Path::new("/in/no-date.jpg")),
            (Some(d), None, Path::new("/in/dated.jpg")),
        ];
        items.sort_by(|a, b| compare_scan_order(a.0, a.1, a.2, b.0, b.1, b.2));
        assert_eq!(items[0].2, Path::new("/in/dated.jpg"));
        assert_eq!(items[1].2, Path::new("/in/no-date.jpg"));
    }
}
