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
    // 例: LINE_MOVIE_1540357476150.mp4
    //
    // 長い数字IDの一部を誤認しないよう、13桁の直後が数字でないことを要求する。
    let re_ts = Regex::new(r"(?:^|[_\-\s])(\d{13})(?:\D|$)").ok()?;
    if let Some(caps) = re_ts.captures(filename) {
        let ts_ms: i64 = caps.get(1)?.as_str().parse().ok()?;
        let ts_sec = ts_ms / 1000;
        if let Some(dt) = chrono::DateTime::from_timestamp(ts_sec, 0) {
            return Some(dt.with_timezone(&Local));
        }
    }

    // パターン4: YYYYMMDDのみ（時刻なし）
    // 例: IMG-20250115-WA0001.jpg (WhatsApp)
    //
    // 長い数字IDの途中を日付として誤認しないよう、前後が数字でないことを要求する。
    // 例: line_314408166989840.jpg は 3144-08-16 として扱ってはいけない。
    let re3 = Regex::new(r"(?:^|\D)(\d{4})(\d{2})(\d{2})(?:\D|$)").ok()?;
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
#[path = "dating_tests.rs"]
mod tests;
