//! `mod.rs` のユニットテスト。god-module 肥大化対策として本体（`mod.rs`）から
//! 切り出したもの（doctrine: 1ファイル約300行上限）。振る舞い・テスト内容は変更せず、
//! `#[path = "mod_tests.rs"]` で `mod.rs` の `mod tests;` から読み込まれるだけの位置移動。

use super::exclude::ExcludedRuleCount;
use super::*;
use std::collections::BTreeSet;

/// フロントエンド契約の機械検証:
/// MediaInfo はサブ構造体に分割したが `#[serde(flatten)]` により
/// JSON は flat な 24 キーのまま（`src/types.ts` の `interface MediaInfo`。#29 で
/// `resolved_provenance_tag` が加わり 23→24 キーになった）。
/// このテストが落ちたらフロントが壊れるサイン。
#[test]
fn mediainfo_wire_format_is_flat_24_keys() {
    let info = MediaInfo {
        source: MediaSource {
            original_path: PathBuf::from("/tmp/in.jpg"),
            file_name: "in.jpg".to_string(),
            media_type: MediaType::Photo,
            file_size: 123,
            exif_orientation: Some(1),
            width: Some(640),
            height: Some(480),
        },
        dates: DateCandidates {
            date_taken: None,
            subsec_time: Some(42),
            timezone: Some("+09:00".to_string()),
            exif_date: None,
            filename_date: None,
            file_created_date: None,
            file_modified_date: None,
            date_source: DateSource::Exif,
        },
        derived: DerivedOutput {
            new_name: "out.jpg".to_string(),
            new_path: PathBuf::from("/tmp/out.jpg"),
            rotation_applied: false,
            burst_group_id: None,
            burst_index: None,
            resolved_provenance_tag: None,
        },
        overrides: UserOverrides {
            timezone_offset: None,
            rotation_mode: None,
        },
        logs: Vec::new(),
    };

    let value = serde_json::to_value(&info).expect("serialize MediaInfo");
    let obj = value
        .as_object()
        .expect("MediaInfo must serialize to a JSON object");

    let actual: BTreeSet<&str> = obj.keys().map(|k| k.as_str()).collect();
    let expected: BTreeSet<&str> = [
        "original_path",
        "file_name",
        "media_type",
        "date_taken",
        "subsec_time",
        "timezone",
        "exif_date",
        "filename_date",
        "file_created_date",
        "file_modified_date",
        "new_name",
        "new_path",
        "file_size",
        "burst_group_id",
        "burst_index",
        "resolved_provenance_tag",
        "date_source",
        "exif_orientation",
        "rotation_applied",
        "timezone_offset",
        "rotation_mode",
        "width",
        "height",
        "logs",
    ]
    .into_iter()
    .collect();

    assert_eq!(
        actual, expected,
        "MediaInfo の top-level JSON キーがフロント契約（24キー flat）と一致しません"
    );
    assert_eq!(
        actual.len(),
        24,
        "MediaInfo の top-level キーは 24 個のはず"
    );
}

/// フロントエンド契約の機械検証:
/// `process_media` コマンド（lib.rs）は `options: ProcessOptions` を構造体のまま受け取る。
/// ProcessOptions には `#[serde(rename_all = ...)]` が無いため、wire 上のキーは snake_case。
/// Tauri がトップレベル引数を camelCase 化するのは `input_dir`→`inputDir` 等だけで、
/// ネストした `options` の内部キーには適用されない。将来このコマンドを invoke で配線する際は
/// `options: { backup_dir, include_videos, ... }` と snake_case で渡す必要がある。
/// rename_all を足すと黙ってこの契約が変わるので、それを CI で射抜く。
#[test]
fn process_options_wire_keys_are_snake_case() {
    let value = serde_json::to_value(ProcessOptions::default()).expect("serialize ProcessOptions");
    let obj = value
        .as_object()
        .expect("ProcessOptions must serialize to a JSON object");

    let actual: BTreeSet<&str> = obj.keys().map(|k| k.as_str()).collect();
    let expected: BTreeSet<&str> = [
        "parallel",
        "backup_dir",
        "include_videos",
        "timezone_offset",
        "cleanup_temp",
        "auto_correct_orientation",
        "exclude_system_artifacts",
        "provenance_tag",
        "provenance_from_folder",
    ]
    .into_iter()
    .collect();

    assert_eq!(
        actual, expected,
        "ProcessOptions の JSON キーが snake_case 契約と一致しません（rename_all を足すとフロント配線が壊れる）"
    );
}

/// フロントエンド契約の機械検証（#28）:
/// `scan_media` コマンドの戻り値 `ScanOutcome` はフロントで
/// `const { media, excluded } = await invoke<ScanOutcome>(...)` と分割代入される
/// （`src/App.tsx`）。トップレベルキー名（media/excluded）と、その内側の
/// `ExcludedSummary`（total/by_rule/samples）・`ExcludedRuleCount`（rule/count）の
/// キー名変更をここで検知する。
#[test]
fn scan_outcome_wire_format_top_level_keys() {
    let outcome = ScanOutcome {
        media: Vec::new(),
        excluded: ExcludedSummary {
            total: 2,
            by_rule: vec![ExcludedRuleCount {
                rule: "trashed".to_string(),
                count: 2,
            }],
            samples: vec!["DCIM/.trashed-1.jpg".to_string()],
        },
    };
    let value = serde_json::to_value(&outcome).expect("serialize ScanOutcome");
    let obj = value
        .as_object()
        .expect("ScanOutcome must serialize to a JSON object");

    let keys: BTreeSet<&str> = obj.keys().map(|k| k.as_str()).collect();
    assert_eq!(
        keys,
        BTreeSet::from(["media", "excluded"]),
        "ScanOutcome のトップレベルキーは media/excluded のはず"
    );

    let excluded_obj = obj["excluded"]
        .as_object()
        .expect("excluded must be an object");
    let excluded_keys: BTreeSet<&str> = excluded_obj.keys().map(|k| k.as_str()).collect();
    assert_eq!(
        excluded_keys,
        BTreeSet::from(["total", "by_rule", "samples"]),
        "ExcludedSummary のキーは total/by_rule/samples のはず"
    );

    let rule_count_obj = excluded_obj["by_rule"][0]
        .as_object()
        .expect("by_rule[0] must be an object");
    let rule_count_keys: BTreeSet<&str> = rule_count_obj.keys().map(|k| k.as_str()).collect();
    assert_eq!(
        rule_count_keys,
        BTreeSet::from(["rule", "count"]),
        "ExcludedRuleCount のキーは rule/count のはず"
    );
}

/// `process_media_with_list` / `process_media_with_list_progress` は事前スキャン済みの
/// リストを受け取って処理するだけで自身は scan しないため、`exclude_system_artifacts` の
/// 値に関わらず `ProcessResult::excluded_files` は常に 0（#28）。この契約を固定する。
#[test]
fn process_media_with_list_excluded_files_is_always_zero() {
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_excluded_zero_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    // exclude_system_artifacts=true でも scan を伴わない経路では 0 のまま。
    let mut media = vec![tz_item(local_dt(2024, 1, 1, 12, 0, 0), None, None, None)];
    let options_on = ProcessOptions {
        parallel: false,
        exclude_system_artifacts: true,
        ..Default::default()
    };
    let result = process_media_with_list(&mut media, &out_dir, &options_on).unwrap();
    assert_eq!(
        result.excluded_files, 0,
        "exclude_system_artifacts=true でも0のはず"
    );

    // exclude_system_artifacts=false でも同様（進捗版でも同じ契約）。
    let mut media2 = vec![tz_item(local_dt(2024, 1, 1, 12, 0, 0), None, None, None)];
    let options_off = ProcessOptions {
        parallel: false,
        exclude_system_artifacts: false,
        ..Default::default()
    };
    let result2 =
        process_media_with_list_progress(&mut media2, &out_dir, &options_off, |_| {}).unwrap();
    assert_eq!(
        result2.excluded_files, 0,
        "exclude_system_artifacts=false でも0のはず"
    );

    let _ = fs::remove_dir_all(&tmp);
}

fn local_dt(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<Local> {
    Local.with_ymd_and_hms(y, mo, d, h, mi, s).single().unwrap()
}

/// 最小の MediaInfo を組み立てる汎用ヘルパー（#29）。`burst_index`/`tag` を明示指定できる。
/// `tz_item` はこれの薄いラッパー（burst_index/tag は常に None）として残す。
fn media_item(
    date: DateTime<Local>,
    subsec: Option<u32>,
    tz_override: Option<&str>,
    exif_tz: Option<&str>,
    burst_index: Option<usize>,
    tag: Option<&str>,
) -> MediaInfo {
    MediaInfo {
        source: MediaSource {
            original_path: PathBuf::from("/in/IMG.jpg"),
            file_name: "IMG.jpg".to_string(),
            media_type: MediaType::Photo,
            file_size: 0,
            exif_orientation: None,
            width: None,
            height: None,
        },
        dates: DateCandidates {
            date_taken: Some(date),
            subsec_time: subsec,
            timezone: exif_tz.map(|s| s.to_string()),
            exif_date: None,
            filename_date: None,
            file_created_date: None,
            file_modified_date: None,
            date_source: DateSource::Exif,
        },
        derived: DerivedOutput {
            new_name: format!(
                "{}.jpg",
                build_stem(Some(&date), subsec, burst_index, "", tag)
            ),
            new_path: PathBuf::new(),
            rotation_applied: false,
            burst_group_id: burst_index.map(|_| 0),
            burst_index,
            resolved_provenance_tag: tag.map(|s| s.to_string()),
        },
        overrides: UserOverrides {
            timezone_offset: tz_override.map(|s| s.to_string()),
            rotation_mode: None,
        },
        logs: Vec::new(),
    }
}

/// タイムゾーン補正テスト用に最小の MediaInfo を組み立てる（burst_index/tag なし）。
fn tz_item(
    date: DateTime<Local>,
    subsec: Option<u32>,
    tz_override: Option<&str>,
    exif_tz: Option<&str>,
) -> MediaInfo {
    media_item(date, subsec, tz_override, exif_tz, None, None)
}

// ---- #29 回帰(a): apply_timezone_correction がバースト連番・由来タグを落とさないこと ----
//
// 背景: apply_timezone_correction は以前、build_stem に一本化される前の旧 format_filename を
// 直呼びしていたため、TZ補正がかかると burst_index・resolved_provenance_tag が new_name に
// 反映されず黙って消えていた。既存の tz_correction_* テストは全て tz_item（burst_index=None,
// resolved_provenance_tag=None 固定）経由のため、この経路を一度も踏んでいなかった。

#[test]
fn tz_correction_preserves_burst_index_regression() {
    // (a) burst_index を持つ item が TZ補正後も new_name にバースト連番を残すこと。
    let mut item = media_item(
        local_dt(2024, 1, 1, 15, 0, 0),
        None,
        Some("+00:00"),
        None,
        Some(2),
        None,
    );
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 2, 0, 0, 0)
    );
    assert_eq!(
        item.derived.burst_index,
        Some(2),
        "burst_index フィールド自体は TZ補正で変化しないはず"
    );
    assert_eq!(
        item.derived.new_name, "2024-01-02_00-00-00_02.jpg",
        "TZ補正後の new_name にバースト連番 _02 が残っているはず"
    );
}

#[test]
fn tz_correction_preserves_provenance_tag_regression() {
    // (a) resolved_provenance_tag を持つ item が TZ補正後も new_name にタグを残すこと。
    let mut item = media_item(
        local_dt(2024, 1, 1, 15, 0, 0),
        None,
        Some("+00:00"),
        None,
        None,
        Some("takeout"),
    );
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.derived.resolved_provenance_tag.as_deref(),
        Some("takeout"),
        "resolved_provenance_tag フィールド自体は TZ補正で変化しないはず"
    );
    assert_eq!(
        item.derived.new_name, "2024-01-02_00-00-00_takeout.jpg",
        "TZ補正後の new_name にタグ _takeout が残っているはず"
    );
}

#[test]
fn tz_correction_preserves_burst_index_and_tag_together_regression() {
    // (a) burst かつ tag 両方ありでも、TZ補正後に「日時_バーストNN_タグ」の形を保つこと。
    let mut item = media_item(
        local_dt(2024, 1, 1, 15, 0, 0),
        None,
        Some("+00:00"),
        None,
        Some(2),
        Some("takeout"),
    );
    apply_timezone_correction(&mut item);
    assert_eq!(item.derived.new_name, "2024-01-02_00-00-00_02_takeout.jpg");
}

#[test]
fn parse_offset_seconds_handles_valid_and_invalid() {
    assert_eq!(parse_offset_seconds("+09:00"), Some(32400));
    assert_eq!(parse_offset_seconds("+00:00"), Some(0));
    assert_eq!(parse_offset_seconds("-05:30"), Some(-19800));
    assert_eq!(parse_offset_seconds("+14:00"), Some(50400));
    assert_eq!(parse_offset_seconds("-12:00"), Some(-43200));
    // 不正形式
    assert_eq!(parse_offset_seconds("none"), None);
    assert_eq!(parse_offset_seconds("0900"), None);
    assert_eq!(parse_offset_seconds("+9:00"), None);
    assert_eq!(parse_offset_seconds("+25:00"), None);
    assert_eq!(parse_offset_seconds("+09:60"), None);
    // 仕様レンジ（-12:00〜+14:00）外は弾く
    assert_eq!(parse_offset_seconds("+15:00"), None);
    assert_eq!(parse_offset_seconds("-13:00"), None);
}

#[test]
fn tz_correction_half_hour_offset() {
    // -05:30 → shift = 32400 - (-19800) = 52200s = +14:30
    let mut item = tz_item(local_dt(2024, 1, 1, 9, 0, 0), None, Some("-05:30"), None);
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 1, 23, 30, 0)
    );
    assert_eq!(item.derived.new_name, "2024-01-01_23-30-00.jpg");
}

#[test]
fn tz_correction_utc_assumed_shifts_plus_9h() {
    // +00:00 を選択＝UTC と仮定し JST へ補正（mock-data と一致）
    let mut item = tz_item(local_dt(2024, 1, 1, 15, 0, 0), None, Some("+00:00"), None);
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 2, 0, 0, 0)
    );
    assert_eq!(item.derived.new_name, "2024-01-02_00-00-00.jpg");
}

#[test]
fn tz_correction_jst_is_noop() {
    // +09:00（既に JST）→ shift 0 で無補正、ファイル名も不変
    let mut item = tz_item(local_dt(2024, 6, 1, 12, 30, 0), None, Some("+09:00"), None);
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 6, 1, 12, 30, 0)
    );
    assert_eq!(item.derived.new_name, "2024-06-01_12-30-00.jpg");
}

#[test]
fn tz_correction_none_and_unset_are_noop() {
    for sel in [Some("none"), None] {
        let mut item = tz_item(local_dt(2024, 1, 1, 10, 0, 0), None, sel, Some("+00:00"));
        apply_timezone_correction(&mut item);
        assert_eq!(
            item.dates.date_taken.unwrap(),
            local_dt(2024, 1, 1, 10, 0, 0)
        );
    }
}

#[test]
fn tz_correction_exif_uses_embedded_offset() {
    // exif 選択＋EXIF TZ +00:00 → +9h
    let mut item = tz_item(
        local_dt(2024, 1, 1, 15, 0, 0),
        None,
        Some("exif"),
        Some("+00:00"),
    );
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 2, 0, 0, 0)
    );
}

#[test]
fn tz_correction_exif_without_embedded_tz_is_noop() {
    let mut item = tz_item(local_dt(2024, 1, 1, 15, 0, 0), None, Some("exif"), None);
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 1, 15, 0, 0)
    );
}

#[test]
fn tz_correction_invalid_offset_is_noop() {
    let mut item = tz_item(local_dt(2024, 1, 1, 15, 0, 0), None, Some("garbage"), None);
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 1, 15, 0, 0)
    );
}

#[test]
fn tz_correction_negative_offset_and_subsec_preserved() {
    // -05:00 → shift = 32400 - (-18000) = 50400s = +14h
    let mut item = tz_item(
        local_dt(2024, 1, 1, 10, 0, 0),
        Some(123),
        Some("-05:00"),
        None,
    );
    apply_timezone_correction(&mut item);
    assert_eq!(
        item.dates.date_taken.unwrap(),
        local_dt(2024, 1, 2, 0, 0, 0)
    );
    // subsec はミリ秒なので TZ で動かず保持される
    assert_eq!(item.derived.new_name, "2024-01-02_00-00-00-123.jpg");
}

// ---- 進捗（#4）----

/// フロント契約: ProgressEvent は camelCase キー（done/total/path/status）、
/// status は snake_case の "completed"/"error"。`types.ts` の ProgressEvent と一致。
#[test]
fn progress_event_wire_format() {
    let ev = ProgressEvent {
        done: 2,
        total: 4,
        path: "/in/IMG.jpg".to_string(),
        status: ProgressStatus::Completed,
    };
    let value = serde_json::to_value(&ev).expect("serialize ProgressEvent");
    let obj = value.as_object().expect("object");
    let keys: BTreeSet<&str> = obj.keys().map(|k| k.as_str()).collect();
    assert_eq!(
        keys,
        BTreeSet::from(["done", "total", "path", "status"]),
        "ProgressEvent のキーは done/total/path/status（camelCase）のはず"
    );
    assert_eq!(obj["status"], serde_json::json!("completed"));

    let err = ProgressEvent {
        status: ProgressStatus::Error,
        ..ev
    };
    let v = serde_json::to_value(&err).unwrap();
    assert_eq!(v["status"], serde_json::json!("error"));
}

#[test]
fn progress_percent_basic_and_edges() {
    assert_eq!(progress_percent(0, 4), 0);
    assert_eq!(progress_percent(1, 4), 25);
    assert_eq!(progress_percent(2, 4), 50);
    assert_eq!(progress_percent(4, 4), 100);
    // 端数は切り捨て: 1/3 = 33%
    assert_eq!(progress_percent(1, 3), 33);
    assert_eq!(progress_percent(2, 3), 66);
    // total==0 は完了扱い（100）
    assert_eq!(progress_percent(0, 0), 100);
    // done > total でも 100 に丸める（防御的）
    assert_eq!(progress_percent(5, 4), 100);
}

/// 進捗 done は 1..=total を1度ずつ網羅し、ファイル数ぶん emit される。
/// 並列処理でも到着順に関係なく到達点（done の集合）が一致することを検証する。
#[test]
fn progress_emits_once_per_file_covering_1_to_total() {
    use std::collections::BTreeSet;
    use std::sync::Mutex as StdMutex;

    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_progress_test_{}",
        std::process::id()
    ));
    let in_dir = tmp.join("in");
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&in_dir).unwrap();
    fs::create_dir_all(&out_dir).unwrap();

    // 入力ファイルを4つ用意（中身は何でもよい。日付なし→unsorted へコピーされる）。
    let mut media = Vec::new();
    for i in 0..4 {
        let p = in_dir.join(format!("file{i}.jpg"));
        fs::write(&p, b"x").unwrap();
        media.push(tz_item(local_dt(2024, 1, 1, 0, 0, i), None, None, None));
        // original_path をこのファイルに差し替える（コピー元が実在する必要がある）
        let last = media.last_mut().unwrap();
        last.source.original_path = p.clone();
        last.source.file_name = format!("file{i}.jpg");
        last.dates.date_taken = Some(local_dt(2024, 1, 1, 0, 0, i));
    }

    let events: Arc<StdMutex<Vec<ProgressEvent>>> = Arc::new(StdMutex::new(Vec::new()));
    let events_cb = Arc::clone(&events);

    let options = ProcessOptions {
        parallel: true,
        ..Default::default()
    };
    let result = process_media_with_list_progress(&mut media, &out_dir, &options, move |ev| {
        events_cb.lock().unwrap().push(ev);
    })
    .unwrap();

    let collected = events.lock().unwrap();
    // ファイル数ぶん emit
    assert_eq!(collected.len(), 4, "1ファイル1イベントのはず");
    // total は全件
    assert!(collected.iter().all(|e| e.total == 4));
    // done は 1..=4 を1度ずつ網羅（並列でも採番が一意）
    let dones: BTreeSet<usize> = collected.iter().map(|e| e.done).collect();
    assert_eq!(dones, BTreeSet::from([1, 2, 3, 4]));
    // 全件成功（実在ファイルを out へコピー）
    assert!(collected
        .iter()
        .all(|e| e.status == ProgressStatus::Completed));
    assert_eq!(result.processed_files, 4);

    let _ = fs::remove_dir_all(&tmp);
}

/// コピー元が存在しないファイルは Error ステータスで emit され、進捗カウントは進む。
#[test]
fn progress_emits_error_status_on_failure() {
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_progress_err_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    // 実在しないコピー元 → fs::copy が失敗し Error になる
    let mut item = tz_item(local_dt(2024, 1, 1, 12, 0, 0), None, None, None);
    item.source.original_path = tmp.join("does_not_exist.jpg");
    let mut media = vec![item];

    let captured = Arc::new(Mutex::new(Vec::new()));
    let cb = Arc::clone(&captured);
    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    process_media_with_list_progress(&mut media, &out_dir, &options, move |ev| {
        cb.lock().unwrap().push(ev);
    })
    .unwrap();

    let evs = captured.lock().unwrap();
    assert_eq!(evs.len(), 1);
    assert_eq!(evs[0].status, ProgressStatus::Error);
    assert_eq!(evs[0].done, 1);
    assert_eq!(evs[0].total, 1);

    let _ = fs::remove_dir_all(&tmp);
}

// ---- #29 回帰(b): process_media_inner の衝突ループがバースト連番・由来タグを
// 無視して日付だけから名前を再構築していたバグの回帰 ----
//
// 背景: `while candidate.exists()` ループは以前、衝突時の再生成に日付のみを使っており、
// burst_index・resolved_provenance_tag が衝突サフィックス付与時に失われていた。
// 衝突ループを対象にしたテストは単体にも e2e にも1本も無かった。

/// コピー元として実在するファイルを作り、対応する MediaInfo を組み立てる
/// （`process_media_inner` はコピー元の存在チェックを行うため実ファイルが要る）。
/// `dir` はファイルごとに別ディレクトリにすること（同名ファイルが同一ディレクトリに
/// 共存できないため、日付なし衝突テストでは同じ `file_name` を複数用意する必要がある）。
fn collision_test_item(
    dir: &Path,
    file_name: &str,
    date: Option<DateTime<Local>>,
    burst_index: Option<usize>,
    tag: Option<&str>,
) -> MediaInfo {
    fs::create_dir_all(dir).unwrap();
    let path = dir.join(file_name);
    fs::write(&path, b"x").unwrap();

    let new_name = match date {
        Some(d) => format!("{}.jpg", build_stem(Some(&d), None, burst_index, "", tag)),
        None => {
            let fallback_stem = Path::new(file_name)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(file_name);
            format!(
                "{}.jpg",
                build_stem(None, None, burst_index, fallback_stem, tag)
            )
        }
    };

    MediaInfo {
        source: MediaSource {
            original_path: path,
            file_name: file_name.to_string(),
            media_type: MediaType::Photo,
            file_size: 1,
            exif_orientation: None,
            width: None,
            height: None,
        },
        dates: DateCandidates {
            date_taken: date,
            subsec_time: None,
            timezone: None,
            exif_date: None,
            filename_date: None,
            file_created_date: None,
            file_modified_date: None,
            date_source: if date.is_some() {
                DateSource::Exif
            } else {
                DateSource::None
            },
        },
        derived: DerivedOutput {
            new_name,
            new_path: PathBuf::new(),
            rotation_applied: false,
            burst_group_id: burst_index.map(|_| 0),
            burst_index,
            resolved_provenance_tag: tag.map(|s| s.to_string()),
        },
        overrides: UserOverrides {
            timezone_offset: None,
            rotation_mode: None,
        },
        logs: Vec::new(),
    }
}

/// 処理後の出力ファイル名（`new_path` のファイル名部分）を並び順どおりに集める。
fn processed_file_names(media: &[MediaInfo]) -> Vec<String> {
    media
        .iter()
        .map(|m| {
            m.derived
                .new_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string()
        })
        .collect()
}

#[test]
fn collision_same_tag_same_datetime_no_burst_gets_incrementing_suffixes() {
    // 衝突ループ2周目の基本形: 同一タグ・同一日時（burst無し）3枚は
    // 無サフィックス → _01 → _02 と増えていくはず。
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_collision_plain_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    let date = local_dt(2024, 5, 1, 9, 0, 0);
    let mut media = vec![
        collision_test_item(
            &tmp.join("src1"),
            "a.jpg",
            Some(date),
            None,
            Some("takeout"),
        ),
        collision_test_item(
            &tmp.join("src2"),
            "b.jpg",
            Some(date),
            None,
            Some("takeout"),
        ),
        collision_test_item(
            &tmp.join("src3"),
            "c.jpg",
            Some(date),
            None,
            Some("takeout"),
        ),
    ];

    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    let result = process_media_with_list(&mut media, &out_dir, &options).unwrap();
    assert_eq!(result.processed_files, 3);

    assert_eq!(
        processed_file_names(&media),
        vec![
            "2024-05-01_09-00-00_takeout.jpg",
            "2024-05-01_09-00-00_takeout_01.jpg",
            "2024-05-01_09-00-00_takeout_02.jpg",
        ]
    );

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn collision_burst_and_tag_together_regression() {
    // (b) の核心: burst_index・タグ両方ありの衝突は「日時_バーストNN_タグ_衝突NN」の
    // 4要素を全部保ったまま再構築されること。
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_collision_burst_tag_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    let date = local_dt(2024, 5, 1, 9, 0, 0);
    let mut media = vec![
        collision_test_item(
            &tmp.join("src1"),
            "a.jpg",
            Some(date),
            Some(1),
            Some("line"),
        ),
        collision_test_item(
            &tmp.join("src2"),
            "b.jpg",
            Some(date),
            Some(1),
            Some("line"),
        ),
    ];

    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    process_media_with_list(&mut media, &out_dir, &options).unwrap();

    let names = processed_file_names(&media);
    assert_eq!(names[0], "2024-05-01_09-00-00_01_line.jpg");
    assert_eq!(
        names[1], "2024-05-01_09-00-00_01_line_01.jpg",
        "バースト連番・タグ・衝突連番の4要素が揃うはず（(b)の核心）"
    );

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn collision_burst_without_tag_preserves_burst_index_regression() {
    // (b): タグ無しでも burst_index が衝突連番付与のたびに失われないこと。
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_collision_burst_only_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    let date = local_dt(2024, 5, 1, 9, 0, 0);
    let mut media = vec![
        collision_test_item(&tmp.join("src1"), "a.jpg", Some(date), Some(3), None),
        collision_test_item(&tmp.join("src2"), "b.jpg", Some(date), Some(3), None),
    ];

    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    process_media_with_list(&mut media, &out_dir, &options).unwrap();

    let names = processed_file_names(&media);
    assert_eq!(names[0], "2024-05-01_09-00-00_03.jpg");
    assert_eq!(
        names[1], "2024-05-01_09-00-00_03_01.jpg",
        "バースト連番 _03 が衝突連番付与後も失われないはず"
    );

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn collision_no_date_with_tag_uses_original_stem_regression() {
    // 日付なしファイル + タグの衝突は「<元のstem>_タグ_衝突NN」になること。
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_collision_no_date_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    let mut media = vec![
        collision_test_item(
            &tmp.join("src1"),
            "IMG_1234.jpg",
            None,
            None,
            Some("takeout"),
        ),
        collision_test_item(
            &tmp.join("src2"),
            "IMG_1234.jpg",
            None,
            None,
            Some("takeout"),
        ),
    ];

    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    process_media_with_list(&mut media, &out_dir, &options).unwrap();

    let names = processed_file_names(&media);
    assert_eq!(names[0], "IMG_1234_takeout.jpg");
    assert_eq!(names[1], "IMG_1234_takeout_01.jpg");

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn collision_only_happens_for_same_tag_different_tag_does_not_collide() {
    // #17: 異なるタグの同一日時ファイルは衝突しない。同一タグの同一日時は衝突連番になる。
    let tmp = std::env::temp_dir().join(format!(
        "photo_returns_collision_tag_scope_test_{}",
        std::process::id()
    ));
    let out_dir = tmp.join("out");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&out_dir).unwrap();

    let date = local_dt(2024, 5, 1, 9, 0, 0);
    let mut media = vec![
        collision_test_item(
            &tmp.join("src1"),
            "a.jpg",
            Some(date),
            None,
            Some("takeout"),
        ),
        collision_test_item(&tmp.join("src2"), "b.jpg", Some(date), None, Some("line")),
        collision_test_item(
            &tmp.join("src3"),
            "c.jpg",
            Some(date),
            None,
            Some("takeout"),
        ),
    ];

    let options = ProcessOptions {
        parallel: false,
        ..Default::default()
    };
    process_media_with_list(&mut media, &out_dir, &options).unwrap();

    let names = processed_file_names(&media);
    assert_eq!(
        names[0], "2024-05-01_09-00-00_takeout.jpg",
        "1件目は無サフィックス"
    );
    assert_eq!(
        names[1], "2024-05-01_09-00-00_line.jpg",
        "タグが違えば同一日時でも衝突しない（無サフィックス）"
    );
    assert_eq!(
        names[2], "2024-05-01_09-00-00_takeout_01.jpg",
        "同一タグ・同一日時は衝突連番になる"
    );

    let _ = fs::remove_dir_all(&tmp);
}
// ---- #29 統合・配線: scan_media の境界での由来タグ検証 ----

#[test]
fn scan_media_rejects_explicit_two_digit_provenance_tag() {
    // #14: sanitize_tag 単体ではなく scan_media の境界で Err が返ることを確認する。
    let base = std::env::temp_dir().join(format!(
        "photo_returns_scan_explicit_tag_rejected_test_{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).unwrap();

    let options = ProcessOptions {
        parallel: false,
        provenance_tag: Some("01".to_string()),
        ..Default::default()
    };
    let result = scan_media(&base, &options);
    assert!(
        result.is_err(),
        "明示ラベルが2桁純数字のときは scan_media がエラーを返すはず"
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn scan_media_rejected_folder_tag_logs_warning_on_media_info() {
    // #15: フォルダ由来タグがサニタイズで拒否されたとき、純粋関数の戻り値だけでなく
    // 配線側（scan_media）が実際に info.logs へ警告を積むことを確認する。
    let base = std::env::temp_dir().join(format!(
        "photo_returns_scan_folder_tag_rejected_test_{}",
        std::process::id()
    ));
    let sub = base.join("01");
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&sub).unwrap();
    fs::write(sub.join("IMG.jpg"), b"x").unwrap();

    let options = ProcessOptions {
        parallel: false,
        provenance_from_folder: true,
        ..Default::default()
    };
    let outcome = scan_media(&base, &options).unwrap();
    assert_eq!(outcome.media.len(), 1);
    assert_eq!(
        outcome.media[0].derived.resolved_provenance_tag, None,
        "2桁数字の親フォルダ名はサニタイズ拒否でタグなしになるはず"
    );
    let warned = outcome.media[0]
        .logs
        .iter()
        .any(|l| l.level == LogLevel::Warning && l.message.contains("01"));
    assert!(
        warned,
        "サニタイズ拒否時は info.logs に警告が積まれるはず（配線側の確認）: {:?}",
        outcome.media[0].logs
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn scan_media_input_dir_without_file_name_component_silently_has_no_tag() {
    // #16: input_dir のパス表現の最後の要素が ".." の場合 `Path::file_name()` は
    // None を返す（実ファイルシステム上は正常に親ディレクトリを指す）。このとき
    // 「入力ディレクトリ自身の名前」フォールバックの候補すら得られないため、
    // フォルダ由来タグは警告なしで静かにタグなしになるはず。
    let base = std::env::temp_dir().join(format!(
        "photo_returns_scan_no_filename_component_test_{}",
        std::process::id()
    ));
    let sub = base.join("sub");
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&sub).unwrap();
    // ファイルは base 直下（sub の中ではない）に置く: 相対パスの親が空 →
    // parent_folder_name も None になる。
    fs::write(base.join("IMG.jpg"), b"x").unwrap();

    // sub/.. は正規化前の文字列としては file_name() = None だが、実体としては base を指す。
    let input_dir = sub.join("..");

    let options = ProcessOptions {
        parallel: false,
        provenance_from_folder: true,
        ..Default::default()
    };
    let outcome = scan_media(&input_dir, &options).unwrap();
    assert_eq!(outcome.media.len(), 1);
    assert_eq!(
        outcome.media[0].derived.resolved_provenance_tag, None,
        "file_name() が取れない入力ディレクトリはタグなしになるはず"
    );
    assert!(
        outcome.media[0].logs.is_empty(),
        "候補が無い場合は警告ログも残らないはず（サニタイズ拒否の警告経路とは違う）: {:?}",
        outcome.media[0].logs
    );

    let _ = fs::remove_dir_all(&base);
}

#[test]
fn scan_media_different_tags_do_not_collide_same_tag_does() {
    // #17（scan_media 経由）: フォルダ由来タグが異なれば、同時刻でも new_name が
    // 別々になる。scan 時点では衝突連番はまだ付かない（付くのは process 時）ので、
    // ここでは new_name 自体が別文字列であることを確認する。
    let base = std::env::temp_dir().join(format!(
        "photo_returns_scan_tag_scope_test_{}",
        std::process::id()
    ));
    let takeout_dir = base.join("takeout");
    let line_dir = base.join("line");
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&takeout_dir).unwrap();
    fs::create_dir_all(&line_dir).unwrap();
    write_dummy_jpeg(&takeout_dir.join("IMG_20240115_103000.jpg"));
    write_dummy_jpeg(&line_dir.join("IMG_20240115_103000.jpg"));

    let options = ProcessOptions {
        parallel: false,
        provenance_from_folder: true,
        ..Default::default()
    };
    let outcome = scan_media(&base, &options).unwrap();
    assert_eq!(outcome.media.len(), 2);

    let names: Vec<&str> = outcome
        .media
        .iter()
        .map(|m| m.derived.new_name.as_str())
        .collect();
    assert!(names.contains(&"2024-01-15_10-30-00_takeout.jpg"));
    assert!(names.contains(&"2024-01-15_10-30-00_line.jpg"));
    assert_ne!(
        names[0], names[1],
        "異なるフォルダ由来タグは同時刻でも別名になるはず"
    );

    let _ = fs::remove_dir_all(&base);
}

/// 中身が空でも拡張子だけで media 判定される最小ダミーファイルを書く。
fn write_dummy_jpeg(path: &Path) {
    fs::write(path, b"x").unwrap();
}
