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

/// EXIF を持つ JPEG フィクスチャを書き出す。IFD0 に Orientation と、保全検証用の
/// ResolutionUnit(=2) の2エントリを入れる（回転後に Orientation 以外が残るかを確かめるため）。
fn write_jpeg_with_orientation(
    dir: &Path,
    name: &str,
    w: u32,
    h: u32,
    orientation: u16,
) -> PathBuf {
    let path = write_plain_jpeg(dir, name, w, h);
    let mut jpeg = Jpeg::from_bytes(std::fs::read(&path).unwrap().into()).unwrap();
    let [olo, ohi] = orientation.to_le_bytes();
    let tiff: Vec<u8> = vec![
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, // "II", 42, IFD0 offset = 8
        0x02, 0x00, // エントリ数 2
        // Orientation (0x0112) SHORT count 1 = orientation
        0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, olo, ohi, 0x00, 0x00,
        // ResolutionUnit (0x0128) SHORT count 1 = 2（保全検証用の無害なタグ）
        0x28, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, // 次 IFD = 0
    ];
    jpeg.set_exif(Some(Bytes::from(tiff)));
    std::fs::write(&path, jpeg.encoder().bytes()).unwrap();
    path
}

/// EXIF の ResolutionUnit(SHORT) を読む。EXIF が丸ごと失われていれば None。
fn read_resolution_unit(path: &Path) -> Option<u16> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(&file);
    let exif = exif::Reader::new().read_from_container(&mut reader).ok()?;
    let field = exif.get_field(exif::Tag::ResolutionUnit, exif::In::PRIMARY)?;
    match &field.value {
        exif::Value::Short(v) => v.first().copied(),
        _ => None,
    }
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

    let mut media = scan_media(&input, &opts()).unwrap().media;
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

    let mut media = scan_media(&input, &opts()).unwrap().media;
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

    let mut media = scan_media(&input, &opts()).unwrap().media;
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
    // メタデータ保全: Orientation 以外の EXIF（ここでは ResolutionUnit）が残ること。
    // turbojpeg copy_none=false の保証。将来 EXIF 丸ごと破棄に退行すると None になり落ちる。
    assert_eq!(
        read_resolution_unit(&out),
        Some(2),
        "回転後も Orientation 以外の EXIF（date/GPS 相当）が保全されるべき"
    );
}

// ---------------------------------------------------------------------------
// #7: ミラー系(2/4/5/7)は回転されず skip + ログ
// ---------------------------------------------------------------------------
#[test]
fn e2e_mirror_orientation_is_skipped_with_log() {
    let (input, output) = workspace("mirror");
    write_jpeg_with_orientation(&input, "IMG_20240115_103000.jpg", 32, 16, 2);

    let mut media = scan_media(&input, &opts()).unwrap().media;
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

    let media = scan_media(&input, &opts()).unwrap().media;
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

    let mut media = scan_media(&input, &opts()).unwrap().media;
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

// ---------------------------------------------------------------------------
// #28: システム生成物（Android trashed / thumbnails / nomedia / AppleDouble / OS メタデータ）
// は既定で scan 対象から除外され、出力に混入せず ExcludedSummary に集計される
// ---------------------------------------------------------------------------
#[test]
fn e2e_exclude_system_artifacts_default_on() {
    let (input, output) = workspace("exclude_default");
    // 本物の写真
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);

    // ゴミ（各ルール1件ずつ）
    write_plain_jpeg(&input, ".trashed-1699999999.jpg", 16, 16);
    let thumbs_dir = input.join(".thumbnails");
    std::fs::create_dir_all(&thumbs_dir).unwrap();
    write_plain_jpeg(&thumbs_dir, "IMG_0001.jpg", 8, 8);
    std::fs::write(input.join(".nomedia"), b"").unwrap();
    write_plain_jpeg(&input, "._IMG_1234.JPG", 16, 16);
    std::fs::write(input.join(".DS_Store"), b"").unwrap();

    let outcome = scan_media(&input, &opts()).unwrap();
    assert_eq!(outcome.media.len(), 1, "本物の写真だけがスキャンされるはず");
    assert_eq!(outcome.excluded.total, 5, "5件のゴミが除外されるはず");

    let rules: Vec<&str> = outcome
        .excluded
        .by_rule
        .iter()
        .map(|rc| rc.rule.as_str())
        .collect();
    assert_eq!(
        rules,
        vec![
            "trashed",
            "thumbnails",
            "nomedia",
            "apple_double",
            "os_metadata"
        ],
        "ルール別内訳は仕様の表の順で並ぶはず"
    );
    assert!(
        outcome.excluded.by_rule.iter().all(|rc| rc.count == 1),
        "各ルール1件ずつ"
    );

    let mut media = outcome.media;
    let result = process_media_with_list(&mut media, &output, &opts()).unwrap();
    assert_eq!(result.processed_files, 1);

    let outputs = collect_output_jpegs(&output);
    assert_eq!(outputs.len(), 1, "ゴミは出力に混入しないはず");
}

// ---------------------------------------------------------------------------
// #28: exclude_system_artifacts=false なら従来どおりゴミも拾う（後方互換）
// ---------------------------------------------------------------------------
#[test]
fn e2e_exclude_system_artifacts_disabled_includes_trashed() {
    let (input, _output) = workspace("exclude_disabled");
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);
    write_plain_jpeg(&input, ".trashed-1699999999.jpg", 16, 16);

    let options = ProcessOptions {
        parallel: false,
        exclude_system_artifacts: false,
        ..Default::default()
    };
    let outcome = scan_media(&input, &options).unwrap();
    assert_eq!(
        outcome.media.len(),
        2,
        "exclude_system_artifacts=false なら trashed も拾うはず"
    );
    assert_eq!(outcome.excluded.total, 0, "除外は行われないはず");
}

// ---------------------------------------------------------------------------
// #28: exclude_system_artifacts=false なら .thumbnails 配下も拾う（後方互換）
// ---------------------------------------------------------------------------
#[test]
fn e2e_exclude_system_artifacts_disabled_includes_thumbnails() {
    let (input, _output) = workspace("exclude_disabled_thumbnails");
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);
    let thumbs_dir = input.join(".thumbnails");
    std::fs::create_dir_all(&thumbs_dir).unwrap();
    write_plain_jpeg(&thumbs_dir, "IMG.jpg", 8, 8);

    let options = ProcessOptions {
        parallel: false,
        exclude_system_artifacts: false,
        ..Default::default()
    };
    let outcome = scan_media(&input, &options).unwrap();
    assert_eq!(
        outcome.media.len(),
        2,
        "exclude_system_artifacts=false なら .thumbnails 配下も拾うはず"
    );
    assert_eq!(outcome.excluded.total, 0, "除外は行われないはず");
}

// ---------------------------------------------------------------------------
// #28: exclude_system_artifacts=false なら AppleDouble（._*）も拾う（後方互換）
// ---------------------------------------------------------------------------
#[test]
fn e2e_exclude_system_artifacts_disabled_includes_apple_double() {
    let (input, _output) = workspace("exclude_disabled_apple_double");
    write_plain_jpeg(&input, "IMG_20240115_103000.jpg", 16, 16);
    write_plain_jpeg(&input, "._IMG.JPG", 16, 16);

    let options = ProcessOptions {
        parallel: false,
        exclude_system_artifacts: false,
        ..Default::default()
    };
    let outcome = scan_media(&input, &options).unwrap();
    assert_eq!(
        outcome.media.len(),
        2,
        "exclude_system_artifacts=false なら AppleDouble も拾うはず"
    );
    assert_eq!(outcome.excluded.total, 0, "除外は行われないはず");
}

// ---------------------------------------------------------------------------
// #28: 入力ディレクトリ自身が ".thumbnails" という名前でも、直下の通常写真を
// 誤って全除外してはいけない（strip_prefix で入力ディレクトリ自身の名前は相対パスに
// 現れないことの安全確認。classify_excluded の単体テストは常に「既に相対パス化された
// 文字列」しか渡していないため、この経路は partition() を通さないと検証できない）。
// ---------------------------------------------------------------------------
#[test]
fn e2e_input_dir_itself_named_thumbnails_does_not_exclude_everything() {
    let base = std::env::temp_dir().join(format!(
        "pr_e2e_input_self_thumbnails_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&base);
    let input = base.join(".thumbnails");
    std::fs::create_dir_all(&input).unwrap();
    write_plain_jpeg(&input, "IMG_0001.jpg", 16, 16);

    let outcome = scan_media(&input, &opts()).unwrap();
    assert_eq!(
        outcome.excluded.total, 0,
        "入力ディレクトリ自身の名前を理由に誤って全除外してはいけない"
    );
    assert_eq!(outcome.media.len(), 1, "直下の通常写真はスキャンされるはず");

    let _ = std::fs::remove_dir_all(&base);
}

// ---------------------------------------------------------------------------
// #28: 入力ディレクトリ自身が "._" で始まる名前（例 "._icloud_backup"）でも、
// 直下の通常写真を誤って全除外してはいけない
// ---------------------------------------------------------------------------
#[test]
fn e2e_input_dir_itself_named_apple_double_prefix_does_not_exclude_everything() {
    let base = std::env::temp_dir().join(format!(
        "pr_e2e_input_self_appledouble_{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&base);
    let input = base.join("._icloud_backup");
    std::fs::create_dir_all(&input).unwrap();
    write_plain_jpeg(&input, "IMG_0001.jpg", 16, 16);

    let outcome = scan_media(&input, &opts()).unwrap();
    assert_eq!(
        outcome.excluded.total, 0,
        "入力ディレクトリ自身の名前を理由に誤って全除外してはいけない"
    );
    assert_eq!(outcome.media.len(), 1, "直下の通常写真はスキャンされるはず");

    let _ = std::fs::remove_dir_all(&base);
}

// ---------------------------------------------------------------------------
// #28: バースト検出と除外の共存。連続バースト写真の時系列に .trashed-* を紛れ込ませても、
// 除外後の burst_group_id / burst_index が正しく 1..3 の連番になる
// （Issue本文が名指しした「burstに干渉しないこと」の回帰テスト）
// ---------------------------------------------------------------------------
#[test]
fn e2e_exclusion_does_not_interfere_with_burst_detection() {
    let (input, _output) = workspace("exclude_burst");
    // 3枚のバースト写真（1秒間隔。burst設定既定: max_interval_seconds=3, min_count=3）
    write_plain_jpeg(&input, "IMG_20240115_100000.jpg", 16, 16);
    write_plain_jpeg(&input, "IMG_20240115_100001.jpg", 16, 16);
    write_plain_jpeg(&input, "IMG_20240115_100002.jpg", 16, 16);
    // 時系列の間に紛れ込むゴミ。除外され、バーストの並びに影響しないはず。
    write_plain_jpeg(&input, ".trashed-1699999999.jpg", 16, 16);

    let outcome = scan_media(&input, &opts()).unwrap();
    assert_eq!(outcome.media.len(), 3, "バースト3枚だけが残るはず");
    assert_eq!(outcome.excluded.total, 1, "ゴミ1件が除外されるはず");

    let burst_group_ids: Vec<Option<usize>> = outcome
        .media
        .iter()
        .map(|m| m.derived.burst_group_id)
        .collect();
    assert!(
        burst_group_ids.iter().all(|gid| *gid == Some(0)),
        "3枚とも同じバーストグループのはず: {burst_group_ids:?}"
    );

    let mut burst_indices: Vec<usize> = outcome
        .media
        .iter()
        .map(|m| m.derived.burst_index.expect("burst_index はあるはず"))
        .collect();
    burst_indices.sort_unstable();
    assert_eq!(
        burst_indices,
        vec![1, 2, 3],
        "除外後も burst_index は 1..3 の連番のはず"
    );
}
