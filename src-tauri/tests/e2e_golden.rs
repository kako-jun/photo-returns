//! e2e ゴールデンパステスト: 実際の写真フィクスチャ（EXIF Orientation 付き JPEG 等）を
//! 用意し、scan → ユーザー選択(overrides) → process → 出力 までの一気通貫を自動検証する。
//!
//! これにより #5(TZ補正) / #6(リトライ=サブセット処理) / #7(ロスレス回転・ミラーskip) /
//! #4(進捗イベント) の「実機でしか確認できない」とされていた golden path を、人手なしで
//! 機械検証する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use image::{DynamicImage, GenericImageView};
use img_parts::jpeg::Jpeg;
use img_parts::{Bytes, ImageEXIF};

use photo_returns_lib::orientation::{get_orientation, Orientation};
use photo_returns_lib::photo_core::{
    process_media_with_list, process_media_with_list_progress, scan_media, ProcessOptions,
    ProgressStatus,
};

/// テスト専用のユニークな入力/出力ディレクトリを作る（並列テストでも衝突しない）。
fn workspace(tag: &str) -> (PathBuf, PathBuf) {
    let base = std::env::temp_dir().join(format!("pr_e2e_{tag}_{}", std::process::id()));
    let input = base.join("in");
    let output = base.join("out");
    let _ = std::fs::remove_dir_all(&base);
    std::fs::create_dir_all(&input).unwrap();
    std::fs::create_dir_all(&output).unwrap();
    (input, output)
}

/// 単純な JPEG をフィクスチャとして書き出す。
fn write_plain_jpeg(dir: &Path, name: &str, w: u32, h: u32) -> PathBuf {
    let path = dir.join(name);
    DynamicImage::new_rgb8(w, h).save(&path).unwrap();
    path
}

/// EXIF Orientation タグ（1エントリの最小 TIFF）を持つ JPEG フィクスチャを書き出す。
fn write_jpeg_with_orientation(
    dir: &Path,
    name: &str,
    w: u32,
    h: u32,
    orientation: u16,
) -> PathBuf {
    let path = write_plain_jpeg(dir, name, w, h);
    let mut jpeg = Jpeg::from_bytes(std::fs::read(&path).unwrap().into()).unwrap();
    let [vlo, vhi] = orientation.to_le_bytes();
    let tiff: Vec<u8> = vec![
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, IFD0 offset = 8
        0x01, 0x00, // エントリ数 1
        0x12, 0x01, // タグ 0x0112 (Orientation) LE
        0x03, 0x00, // 型 SHORT
        0x01, 0x00, 0x00, 0x00, // カウント 1
        vlo, vhi, 0x00, 0x00, // 値（インライン）
        0x00, 0x00, 0x00, 0x00, // 次 IFD = 0
    ];
    jpeg.set_exif(Some(Bytes::from(tiff)));
    std::fs::write(&path, jpeg.encoder().bytes()).unwrap();
    path
}

/// 出力ディレクトリ配下の JPEG を再帰的に集める。
fn collect_output_jpegs(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for entry in walkdir_like(dir) {
        if entry.extension().and_then(|e| e.to_str()) == Some("jpg") {
            out.push(entry);
        }
    }
    out.sort();
    out
}

/// 依存を増やさないための簡易再帰列挙。
fn walkdir_like(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                files.extend(walkdir_like(&p));
            } else {
                files.push(p);
            }
        }
    }
    files
}

fn opts() -> ProcessOptions {
    ProcessOptions {
        parallel: false, // テストは決定論優先
        ..Default::default()
    }
}

// ---------------------------------------------------------------------------
// 基本: scan → process で日付階層へリネーム配置される
// ---------------------------------------------------------------------------
#[test]
fn e2e_scan_process_places_into_date_hierarchy() {
    let (input, output) = workspace("hierarchy");
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);

    let mut media = scan_media(&input, &opts()).unwrap();
    assert_eq!(media.len(), 1, "1ファイルがスキャンされる");
    let result = process_media_with_list(&mut media, &output, &opts()).unwrap();
    assert_eq!(result.processed_files, 1);

    let expected = output
        .join("2024")
        .join("2024-01")
        .join("2024-01-15")
        .join("2024-01-15_10-30-00.jpg");
    assert!(
        expected.exists(),
        "日付階層 + 命名で出力されるはず: {expected:?}"
    );
}

// ---------------------------------------------------------------------------
// #5: timezone_offset override が出力ファイル名・日付階層に反映される
// ---------------------------------------------------------------------------
#[test]
fn e2e_timezone_override_shifts_output_filename() {
    let (input, output) = workspace("tz");
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);

    let mut media = scan_media(&input, &opts()).unwrap();
    // ユーザーが "+00:00"（UTC と仮定）を選択 → JST(+9h) 基準へ補正
    media[0].overrides.timezone_offset = Some("+00:00".to_string());
    process_media_with_list(&mut media, &output, &opts()).unwrap();

    // 10:30 + 9h = 19:30（同日）
    let shifted = output
        .join("2024")
        .join("2024-01")
        .join("2024-01-15")
        .join("2024-01-15_19-30-00.jpg");
    assert!(
        shifted.exists(),
        "TZ補正後の名前で出力されるはず: {shifted:?}"
    );
    // 補正前の名前では出力されない
    let unshifted = output
        .join("2024")
        .join("2024-01")
        .join("2024-01-15")
        .join("2024-01-15_10-30-00.jpg");
    assert!(!unshifted.exists(), "補正前の名前で出力されてはいけない");
}

// ---------------------------------------------------------------------------
// #7: EXIF Orientation=6 をロスレス回転し、出力の Orientation が 1 にリセットされる
// ---------------------------------------------------------------------------
#[test]
fn e2e_lossless_rotation_resets_exif_orientation() {
    let (input, output) = workspace("rotate");
    write_jpeg_with_orientation(&input, "IMG_20240115_103000.jpg", 32, 16, 6);

    let mut media = scan_media(&input, &opts()).unwrap();
    assert_eq!(
        media[0].source.exif_orientation,
        Some(6),
        "スキャンで EXIF Orientation=6 が読めるはず"
    );
    media[0].overrides.rotation_mode = Some("exif".to_string());
    process_media_with_list(&mut media, &output, &opts()).unwrap();

    let out = output
        .join("2024")
        .join("2024-01")
        .join("2024-01-15")
        .join("2024-01-15_10-30-00.jpg");
    assert!(out.exists(), "出力ファイルが存在するはず");
    // 90度回転で 32x16 → 16x32
    assert_eq!(
        image::open(&out).unwrap().dimensions(),
        (16, 32),
        "ロスレス回転で寸法が入れ替わるはず"
    );
    // 二重回転防止: EXIF Orientation は 1(Normal) にリセットされている
    assert_eq!(
        get_orientation(&out).unwrap().orientation,
        Orientation::Normal,
        "回転後 EXIF Orientation=1 でなければならない（#7 致命バグ回帰）"
    );
}

// ---------------------------------------------------------------------------
// #7: ミラー系(2/4/5/7)は回転されず skip + ログ
// ---------------------------------------------------------------------------
#[test]
fn e2e_mirror_orientation_is_skipped_with_log() {
    let (input, output) = workspace("mirror");
    write_jpeg_with_orientation(&input, "IMG_20240115_103000.jpg", 32, 16, 2);

    let mut media = scan_media(&input, &opts()).unwrap();
    media[0].overrides.rotation_mode = Some("exif".to_string());
    let result = process_media_with_list(&mut media, &output, &opts()).unwrap();

    let out = output
        .join("2024")
        .join("2024-01")
        .join("2024-01-15")
        .join("2024-01-15_10-30-00.jpg");
    assert!(out.exists());
    // ミラーは回転しない → 寸法そのまま
    assert_eq!(
        image::open(&out).unwrap().dimensions(),
        (32, 16),
        "ミラー系は回転されないはず"
    );
    let logged = result.media[0]
        .logs
        .iter()
        .any(|l| l.message.contains("Mirror"));
    assert!(logged, "ミラー skip のログが残るはず");
}

// ---------------------------------------------------------------------------
// #6: リトライ相当＝渡したサブセットのみ処理し、対象外は出力されない
// ---------------------------------------------------------------------------
#[test]
fn e2e_processes_only_given_subset() {
    let (input, output) = workspace("subset");
    write_plain_jpeg(&input, "IMG_20240115_100000.jpg", 16, 16);
    write_plain_jpeg(&input, "IMG_20240115_110000.jpg", 16, 16);

    let media = scan_media(&input, &opts()).unwrap();
    assert_eq!(media.len(), 2);

    // 11:00 のファイル（B）だけをサブセットで処理（リトライで失敗ファイルのみ送る相当）
    let b = media
        .iter()
        .find(|m| m.derived.new_name.contains("11-00-00"))
        .cloned()
        .expect("B が見つかる");
    let mut subset = vec![b];
    let result = process_media_with_list(&mut subset, &output, &opts()).unwrap();
    assert_eq!(result.processed_files, 1, "サブセット1件のみ処理");

    let outputs = collect_output_jpegs(&output);
    assert_eq!(outputs.len(), 1, "出力は1件だけ（対象外Aは処理されない）");
    assert!(
        outputs[0].to_string_lossy().contains("2024-01-15_11-00-00"),
        "出力されたのは B（11:00）のはず"
    );
}

// ---------------------------------------------------------------------------
// #4: 進捗イベントがファイル1件ごとに1回ずつ、done=1..=total で発火する
// ---------------------------------------------------------------------------
#[test]
fn e2e_progress_events_fire_once_per_file() {
    let (input, output) = workspace("progress");
    for (i, hh) in ["09", "10", "11"].iter().enumerate() {
        write_plain_jpeg(
            &input,
            &format!("IMG_2024011{}_{}0000.jpg", i + 1, hh),
            16,
            16,
        );
    }

    let mut media = scan_media(&input, &opts()).unwrap();
    assert_eq!(media.len(), 3);

    let events = Arc::new(Mutex::new(Vec::new()));
    let ev2 = Arc::clone(&events);
    process_media_with_list_progress(&mut media, &output, &opts(), move |ev| {
        ev2.lock().unwrap().push(ev);
    })
    .unwrap();

    let evs = events.lock().unwrap();
    assert_eq!(evs.len(), 3, "1ファイル1イベント");
    assert!(evs.iter().all(|e| e.total == 3), "total は対象数3で一定");
    assert!(
        evs.iter().all(|e| e.status == ProgressStatus::Completed),
        "全て成功ステータス"
    );
    let mut dones: Vec<usize> = evs.iter().map(|e| e.done).collect();
    dones.sort_unstable();
    assert_eq!(dones, vec![1, 2, 3], "done は 1..=total を1度ずつ網羅する");
}
