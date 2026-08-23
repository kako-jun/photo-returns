/// 写真・動画リネームのコア機能
/// y4m2d2の完全移植版
use anyhow::Result;
use chrono::{DateTime, Duration, Local, TimeZone};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

use crate::burst::{detect_burst_groups, BurstDetectorConfig};
use crate::orientation;
use crate::video_metadata;

mod dating;
mod exclude;
mod exif_info;
mod layout;
mod provenance;

use dating::{
    build_stem, compare_scan_order, extract_date_from_filename, get_file_created_date,
    get_file_modified_date,
};
use exif_info::{get_exif_info, is_image_file, is_video_file, ExifInfo};
use layout::{create_backup, create_date_hierarchy, create_unsorted_dir};

// `ExcludedRuleCount` / `ExcludedSummary` は `exclude.rs` が生成するデータなので定義もそちらに
// 置く（#28 self-review S1）。外部から見える型パス（`photo_core::ExcludedSummary` 等）と
// serde の wire 契約は変えないため、ここで再輸出する。`ExcludedRuleCount` は本体コードから
// 直接使わない（`tests` サブモジュールでのみ使用）ため、非 test ビルドで unused import に
// ならないよう `ExcludedSummary` だけを再輸出する。
pub(crate) use exclude::ExcludedSummary;

/// 処理オプション
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessOptions {
    /// 並列処理を有効化
    pub parallel: bool,
    /// バックアップディレクトリ（Noneの場合はバックアップしない）
    pub backup_dir: Option<PathBuf>,
    /// 動画ファイルも処理する
    pub include_videos: bool,
    /// タイムゾーンオフセット（秒、Noneの場合はローカルタイム）
    pub timezone_offset: Option<i32>,
    /// 処理後に一時ファイルをクリーンアップ
    pub cleanup_temp: bool,
    /// 画像の向きを自動修正
    pub auto_correct_orientation: bool,
    /// システム生成物（Android の `.trashed-*`、`.thumbnails`、`.nomedia`、AppleDouble、
    /// OS メタデータ）を scan_media の入口で除外する（#28）。既定 ON。
    pub exclude_system_artifacts: bool,
    /// 由来タグの明示ラベル（#29）。非空なら全ファイルの出力名にこのタグを使う。
    /// サニタイズ後に空、または2桁の純数字になる値は `scan_media` がエラーを返す。既定 `None`。
    pub provenance_tag: Option<String>,
    /// `provenance_tag` が未指定のとき、ファイルの直上の親フォルダ名（入力ディレクトリ直下
    /// なら入力ディレクトリ自身の名前）を由来タグとして使うフォールバックを有効にする（#29）。
    /// 既定 `false`（＝タグは付かず、出力は #29 導入前と1バイトも変わらない）。
    pub provenance_from_folder: bool,
}

impl Default for ProcessOptions {
    fn default() -> Self {
        Self {
            parallel: true,
            include_videos: true,
            backup_dir: None,
            timezone_offset: None,
            cleanup_temp: false,
            auto_correct_orientation: false,
            exclude_system_artifacts: true,
            provenance_tag: None,
            provenance_from_folder: false,
        }
    }
}

/// メディアファイルの種類
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MediaType {
    Photo,
    Video,
}

/// 日付の取得元
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DateSource {
    /// EXIF撮影日時から取得
    Exif,
    /// QuickTime/MP4メタデータから取得（動画）
    QuickTime,
    /// ファイル名から抽出
    FileName,
    /// ファイル作成日時から取得
    FileCreated,
    /// ファイル変更日時から取得
    FileModified,
    /// 日付情報なし
    None,
}

/// ログレベル
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LogLevel {
    Info,
    Warning,
    Error,
}

/// ログエントリ
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
}

/// 不変な入力メタデータ（スキャン時に確定し、以後変化しない）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaSource {
    pub original_path: PathBuf,
    pub file_name: String,
    pub media_type: MediaType,
    pub file_size: u64,
    /// EXIF orientation値（1-8、Noneは回転なし）
    pub exif_orientation: Option<u32>,
    /// 画像の幅（ピクセル）
    pub width: Option<u32>,
    /// 画像の高さ（ピクセル）
    pub height: Option<u32>,
}

/// 日付候補（複数ソースから派生。ユーザー選択用に全候補を保持）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateCandidates {
    pub date_taken: Option<DateTime<Local>>,
    pub subsec_time: Option<u32>, // ミリ秒（0-999）
    pub timezone: Option<String>, // タイムゾーンオフセット（例："+09:00", null=TZ情報なし）
    /// 利用可能な日付候補（ユーザー選択用）
    pub exif_date: Option<DateTime<Local>>,
    pub filename_date: Option<DateTime<Local>>,
    pub file_created_date: Option<DateTime<Local>>,
    pub file_modified_date: Option<DateTime<Local>>,
    /// 日付の取得元
    pub date_source: DateSource,
}

/// 処理によって埋まる派生出力（リネーム・コピー・回転・バースト）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DerivedOutput {
    pub new_name: String,
    pub new_path: PathBuf,
    /// 画像回転が適用されたか
    pub rotation_applied: bool,
    /// バーストグループID（連続撮影グループ）
    pub burst_group_id: Option<usize>,
    /// バーストグループ内のインデックス（1始まり）
    pub burst_index: Option<usize>,
    /// この1件に対して解決済みの由来タグ（#29）。`ProcessOptions.provenance_tag`（生の明示
    /// ラベル設定）とは別物: こちらは scan 時に明示ラベル／フォルダ由来フォールバックから
    /// 実際に決まった、サニタイズ済みの最終値。`new_name` に反映済みだが、TZ補正・衝突時の
    /// ファイル名再生成でも一貫してこの値を使うために保持する。
    pub resolved_provenance_tag: Option<String>,
}

/// ユーザー選択（フロントエンドで設定）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserOverrides {
    /// ユーザー選択：TZオフセット補正（例："+09:00", "none", "exif"）
    pub timezone_offset: Option<String>,
    /// ユーザー選択：回転方法（"none", "exif", "90", "180", "270"）
    pub rotation_mode: Option<String>,
}

/// メディアファイル情報
///
/// 内部は責務ごとにサブ構造体へ分離しているが、`#[serde(flatten)]` により
/// JSON 表現は flat なまま（フロントエンドの `types.ts` の契約を維持）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    /// 不変入力メタ
    #[serde(flatten)]
    pub source: MediaSource,
    /// 日付候補（派生）
    #[serde(flatten)]
    pub dates: DateCandidates,
    /// 処理で埋まる派生出力
    #[serde(flatten)]
    pub derived: DerivedOutput,
    /// ユーザー選択
    #[serde(flatten)]
    pub overrides: UserOverrides,
    /// 処理ログ（実行時に追記される）
    pub logs: Vec<LogEntry>,
}

/// 処理結果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessResult {
    pub success: bool,
    pub total_files: usize,
    pub processed_files: usize,
    pub media: Vec<MediaInfo>,
    pub errors: Vec<String>,
    /// scan 時にシステム生成物として除外されたファイル数（#28）。
    /// `process_media_with_list` / `process_media_with_list_progress` は事前スキャン済みの
    /// リストを受け取るだけで自身は scan しないため常に 0。scan から行う `process_media` のみ
    /// scan 結果の `ExcludedSummary::total` を反映する。
    ///
    /// GUI（`process_media_with_settings` 経由）は事前スキャン済みリストを処理する経路のため
    /// **常に 0**。GUI が除外件数を表示したい場合はこのフィールドではなく、scan 時に
    /// 受け取った `ScanOutcome.excluded` を見ること（`src/App.tsx` の `excludedSummary` 参照）。
    pub excluded_files: usize,
}

/// `scan_media` の戻り値。スキャンされたメディアと除外サマリを両方持つ（#28）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanOutcome {
    pub media: Vec<MediaInfo>,
    pub excluded: ExcludedSummary,
}

/// 進捗イベント（ファイル1件完了ごとにフロントへ送る、#4）
///
/// `process_media_with_list` の処理ループから各ファイルの完了時（成功/失敗の両方）に
/// 1 回ずつ emit する。`done` は「完了済み件数」（このイベント自身を含む。並列処理では
/// `Arc<AtomicUsize>` で採番するため到着順とは無関係に 1..=total を1度ずつ網羅する）。
/// フロントは `original_path` で該当行を引き当て、`done`/`total` から全体進捗を更新する。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    /// 完了済み件数（1..=total）。このイベントの分を含む。
    pub done: usize,
    /// 総件数（今回処理する対象数。リトライ時は失敗ファイル数）。
    pub total: usize,
    /// 完了したファイルの元パス（フロントの行引き当てキー）。
    pub path: String,
    /// このファイルの結果（"completed" / "error"）。
    pub status: ProgressStatus,
}

/// 進捗イベントのファイル単位ステータス
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStatus {
    Completed,
    Error,
}

/// done/total から進捗パーセント（0-100, 整数）を求める純関数。
///
/// `total == 0` のときは 100 を返す（処理対象ゼロ＝完了扱い）。端数は切り捨て、
/// `done >= total` は 100 に丸める。フロント/バックエンドで同じ式を使うため切り出す。
pub fn progress_percent(done: usize, total: usize) -> u32 {
    if total == 0 {
        return 100;
    }
    let done = done.min(total);
    ((done as u64 * 100) / total as u64) as u32
}

/// ログエントリを追加するヘルパー
impl MediaInfo {
    fn add_log(&mut self, level: LogLevel, message: impl Into<String>) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        self.logs.push(LogEntry {
            timestamp,
            level,
            message: message.into(),
        });
    }
}

/// 対象ディレクトリ内のメディアファイルをスキャン
///
/// `options.exclude_system_artifacts`（既定 true）が有効な場合、Android の `.trashed-*`・
/// `.thumbnails` 配下・`.nomedia`・AppleDouble（`._*`）・OS メタデータ（`.DS_Store` /
/// `Thumbs.db`）を、拡張子判定・EXIF読み・日付抽出・バースト検出より前に除外する（#28）。
/// 除外されたファイルは `MediaInfo` を作らないため、バースト検出のインデックスにも混ざらない。
/// 判定は入力ディレクトリからの相対パスに対して行う（`exclude::partition` 参照）。
pub fn scan_media(input_dir: &Path, options: &ProcessOptions) -> Result<ScanOutcome> {
    let all_entries: Vec<_> = WalkDir::new(input_dir)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .collect();

    let (files, excluded_summary) = if options.exclude_system_artifacts {
        exclude::partition(input_dir, all_entries)
    } else {
        (all_entries, ExcludedSummary::default())
    };

    // 由来タグの明示ラベル（#29）は実行全体で1回だけ検証する。非空なのにサニタイズ後に
    // 使えない値（空になる／2桁の純数字）ならスキャン自体をエラーにする（フォルダ由来の
    // 自動導出と違い、明示入力の不正はユーザーに直接気づいてほしいため握り潰さない）。
    let explicit_provenance_tag: Option<String> = match options
        .provenance_tag
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(raw) => match provenance::sanitize_tag(raw) {
            Some(tag) => Some(tag),
            None => {
                return Err(anyhow::anyhow!(
                    "由来タグ '{raw}' は使用できません（サニタイズ後に空になるか、衝突/バースト連番と紛らわしい2桁の純数字になるため）"
                ));
            }
        },
        None => None,
    };

    let media = Arc::new(Mutex::new(Vec::new()));

    let processor = |entry: &walkdir::DirEntry| {
        let path = entry.path();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let media_type = if is_image_file(&extension) {
            Some(MediaType::Photo)
        } else if options.include_videos && is_video_file(&extension) {
            Some(MediaType::Video)
        } else {
            None
        };

        if let Some(mtype) = media_type {
            // 画像の場合はEXIF、動画の場合はQuickTimeメタデータを取得
            let (exif_info, video_meta) = match mtype {
                MediaType::Photo => {
                    let exif = get_exif_info(path).ok().unwrap_or(ExifInfo {
                        date: None,
                        subsec: None,
                        timezone: None,
                        orientation: None,
                        width: None,
                        height: None,
                    });
                    (exif, None)
                }
                MediaType::Video => {
                    let video = video_metadata::extract_video_metadata(path).ok();
                    let empty_exif = ExifInfo {
                        date: None,
                        subsec: None,
                        timezone: None,
                        orientation: None,
                        width: None,
                        height: None,
                    };
                    (empty_exif, video)
                }
            };

            // ファイル名を取得
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            // 由来タグを解決（#29）。明示ラベルが最優先、無ければ options.provenance_from_folder
            // が有効なときだけフォルダ由来（直上の親フォルダ名、入力ディレクトリ直下なら
            // 入力ディレクトリ自身の名前）にフォールバックする。
            let relative_for_tag = path.strip_prefix(input_dir).unwrap_or(path);
            let folder_tag_candidate =
                provenance::parent_folder_name(relative_for_tag).or_else(|| {
                    input_dir
                        .file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                });
            let (provenance_tag, provenance_tag_warning) = provenance::resolve_tag_for_file(
                explicit_provenance_tag.as_deref(),
                options.provenance_from_folder,
                folder_tag_candidate.as_deref(),
            );

            // 各候補の日付を取得
            let exif_date = exif_info.date;
            let video_date = video_meta
                .as_ref()
                .map(|v| DateTime::<Local>::from(v.creation_time));
            let filename_date = extract_date_from_filename(filename);
            let file_created_date = get_file_created_date(path).ok();
            let file_modified_date = get_file_modified_date(path).ok();

            // 日付を決定（優先順位: EXIF/QuickTime > ファイル名 > ファイル作成日時 > ファイル変更日時）
            let (date_taken, date_source, subsec) = if let Some(exif_date) = exif_date {
                (Some(exif_date), DateSource::Exif, exif_info.subsec)
            } else if let Some(video_date) = video_date {
                // 動画のQuickTimeメタデータ
                (Some(video_date), DateSource::QuickTime, None)
            } else if let Some(filename_date) = filename_date {
                (Some(filename_date), DateSource::FileName, None)
            } else if let Some(created_date) = file_created_date {
                (Some(created_date), DateSource::FileCreated, None)
            } else if let Some(modified_date) = file_modified_date {
                (Some(modified_date), DateSource::FileModified, None)
            } else {
                (None, DateSource::None, None)
            };

            {
                let new_name = match (date_taken, &provenance_tag) {
                    (Some(date), _) => {
                        format!(
                            "{}.{extension}",
                            build_stem(Some(&date), subsec, None, "", provenance_tag.as_deref())
                        )
                    }
                    // 日付なし・タグなし: 元のファイル名をそのまま使用（#29 既定OFF互換。
                    // unsortedフォルダへ）
                    (None, None) => filename.to_string(),
                    // 日付なし・タグあり: 元ファイルの stem にタグだけ付与する
                    (None, Some(tag)) => {
                        let fallback_stem = Path::new(filename)
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or(filename);
                        let stem = build_stem(None, None, None, fallback_stem, Some(tag));
                        match Path::new(filename).extension().and_then(|e| e.to_str()) {
                            Some(ext) => format!("{stem}.{ext}"),
                            None => stem,
                        }
                    }
                };
                let file_size = fs::metadata(path).ok().map(|m| m.len()).unwrap_or(0);

                let mut info = MediaInfo {
                    source: MediaSource {
                        original_path: path.to_path_buf(),
                        file_name: path.file_name().unwrap().to_string_lossy().to_string(),
                        media_type: mtype,
                        file_size,
                        exif_orientation: exif_info.orientation,
                        width: video_meta.as_ref().map(|v| v.width).or(exif_info.width),
                        height: video_meta.as_ref().map(|v| v.height).or(exif_info.height),
                    },
                    dates: DateCandidates {
                        date_taken,
                        subsec_time: subsec,
                        // タイムゾーンはEXIFデータがある画像のみ（動画のQuickTimeはUTC固定のためNone）
                        timezone: if date_source == DateSource::Exif {
                            exif_info.timezone.clone()
                        } else {
                            None
                        },
                        // 各候補の日付を保存
                        exif_date,
                        filename_date,
                        file_created_date,
                        file_modified_date,
                        date_source,
                    },
                    derived: DerivedOutput {
                        new_name,
                        new_path: PathBuf::new(),
                        rotation_applied: false, // スキャン時はまだ回転していない
                        burst_group_id: None,
                        burst_index: None,
                        resolved_provenance_tag: provenance_tag,
                    },
                    overrides: UserOverrides {
                        timezone_offset: None, // ユーザー未選択（フロントエンドで設定）
                        rotation_mode: None,   // ユーザー未選択（フロントエンドで設定）
                    },
                    logs: Vec::new(), // ログは空で初期化
                };
                // フォルダ由来のタグ候補がサニタイズで拒否された場合はここで警告ログを残す
                // （タグなしへフォールバック済み、処理は継続する）。
                if let Some(warning) = provenance_tag_warning {
                    info.add_log(LogLevel::Warning, warning);
                }

                media.lock().unwrap().push(info);
            }
        }
    };

    if options.parallel {
        files.par_iter().for_each(processor);
    } else {
        files.iter().for_each(processor);
    }

    let mut result = Arc::try_unwrap(media)
        .map(|mutex| mutex.into_inner().unwrap())
        .unwrap_or_else(|arc| arc.lock().unwrap().clone());

    // 並列処理後は順序が不定のため、撮影日時でソートしてからバースト検出を行う。
    // date_taken だけでは同一秒内バースト写真が全てタイになり、安定ソートの性質上
    // 非決定な処理完了順がそのまま残ってしまう（#29 決定性仕様違反）ため、
    // subsec_time → original_path で完全に決定的なタイブレークを行う
    // （`compare_scan_order` 参照）。
    result.sort_by(|a, b| {
        compare_scan_order(
            a.dates.date_taken,
            a.dates.subsec_time,
            &a.source.original_path,
            b.dates.date_taken,
            b.dates.subsec_time,
            &b.source.original_path,
        )
    });

    // バースト検出を実行
    let dates: Vec<Option<DateTime<Local>>> = result.iter().map(|m| m.dates.date_taken).collect();
    let burst_config = BurstDetectorConfig::default();
    let burst_groups = detect_burst_groups(&dates, &burst_config);

    // バースト情報をMediaInfoに反映
    for group in &burst_groups {
        for (idx, &photo_idx) in group.photo_indices.iter().enumerate() {
            if let Some(media_info) = result.get_mut(photo_idx) {
                media_info.derived.burst_group_id = Some(group.id);
                media_info.derived.burst_index = Some(idx + 1); // 1始まり

                // ファイル名に連番を追加（#29: stem 生成は build_stem に一本化。タグは
                // バースト連番の後に付く）
                if let Some(date) = media_info.dates.date_taken {
                    let extension = media_info
                        .source
                        .original_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("jpg");

                    let stem = build_stem(
                        Some(&date),
                        media_info.dates.subsec_time,
                        Some(idx + 1),
                        "",
                        media_info.derived.resolved_provenance_tag.as_deref(),
                    );
                    media_info.derived.new_name = format!("{stem}.{extension}");
                }
            }
        }
    }

    Ok(ScanOutcome {
        media: result,
        excluded: excluded_summary,
    })
}

/// タイムゾーン補正の基準オフセット（秒）。
/// docs/development.md「日本時間（UTC+9）基準で補正」に基づき JST を正本とする。
const JST_OFFSET_SECONDS: i64 = 9 * 3600;

/// "+09:00" / "-05:30" 形式のオフセット文字列を秒に変換する。形式不正は None。
///
/// 受理する範囲は実在するタイムゾーンと UI ドロップダウン（docs/development.md）に合わせ
/// `-12:00`（-43200s）〜 `+14:00`（+50400s）。範囲外は None。
fn parse_offset_seconds(s: &str) -> Option<i64> {
    const MIN_OFFSET: i64 = -12 * 3600; // -12:00
    const MAX_OFFSET: i64 = 14 * 3600; // +14:00

    let bytes = s.as_bytes();
    if bytes.len() != 6 || bytes[3] != b':' {
        return None;
    }
    let sign = match bytes[0] {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let hh: i64 = s.get(1..3)?.parse().ok()?;
    let mm: i64 = s.get(4..6)?.parse().ok()?;
    if hh > 23 || mm > 59 {
        return None;
    }
    let total = sign * (hh * 3600 + mm * 60);
    if !(MIN_OFFSET..=MAX_OFFSET).contains(&total) {
        return None;
    }
    Some(total)
}

/// ユーザー選択の `overrides.timezone_offset` に従い、撮影日時を JST(UTC+9) 基準へ補正する。
///
/// - `None` / `"none"` → 補正しない
/// - `"exif"` → EXIF 埋め込みの TZ（`dates.timezone`）を元オフセットとみなす。不明なら補正しない
/// - `"+HH:MM"` / `"-HH:MM"` → その値を元オフセットとみなす。不正値なら補正しない
///
/// 補正量 = `JST_OFFSET_SECONDS - source_offset` を撮影日時の wall-clock に加算する。
/// naive wall-clock 上で加算するためマシンのローカル TZ に依存しない。補正に伴い
/// `derived.new_name` を作り直す。
fn apply_timezone_correction(item: &mut MediaInfo) {
    let Some(date) = item.dates.date_taken else {
        return;
    };
    let source_offset = match item.overrides.timezone_offset.as_deref() {
        None | Some("none") => return,
        Some("exif") => match item
            .dates
            .timezone
            .as_deref()
            .and_then(parse_offset_seconds)
        {
            Some(off) => off,
            None => return,
        },
        Some(other) => match parse_offset_seconds(other) {
            Some(off) => off,
            None => return,
        },
    };

    let shift = JST_OFFSET_SECONDS - source_offset;
    if shift == 0 {
        return;
    }

    let corrected_naive = date.naive_local() + Duration::seconds(shift);
    let Some(corrected) = Local.from_local_datetime(&corrected_naive).single() else {
        // ローカル TZ の DST gap/fold に当たり一意に解決できなかった場合は無補正にする
        // （JST は DST 無しなので通常は発生しない）。
        item.add_log(
            LogLevel::Warning,
            format!("Timezone correction skipped: ambiguous local time after shift {shift}s"),
        );
        return;
    };

    item.dates.date_taken = Some(corrected);
    let extension = item
        .source
        .original_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    // #29: build_stem に一本化。TZ補正で日時が変わっても、scan時に確定した
    // バースト連番・由来タグはそのまま引き継ぐ（そうしないと再構築のたびに消えてしまう）。
    let stem = build_stem(
        Some(&corrected),
        item.dates.subsec_time,
        item.derived.burst_index,
        "",
        item.derived.resolved_provenance_tag.as_deref(),
    );
    item.derived.new_name = format!("{stem}.{extension}");
    item.add_log(
        LogLevel::Info,
        format!(
            "Timezone correction applied (source offset {source_offset}s -> JST, shift {shift}s)"
        ),
    );
}

/// 事前スキャン済みのメディアリストを使って処理する
/// フロントエンドでユーザーが設定した date_source / timezone_offset / rotation_mode を尊重する
pub fn process_media_with_list(
    media: &mut Vec<MediaInfo>,
    output_dir: &Path,
    options: &ProcessOptions,
) -> Result<ProcessResult> {
    process_media_inner(media, output_dir, options, |_| {})
}

/// 進捗コールバック付きで事前スキャン済みのメディアリストを処理する（#4）。
///
/// `on_progress` はファイル1件の処理が終わるたび（成功/失敗の両方）に1回ずつ呼ばれる。
/// 並列処理時は複数スレッドから呼ばれ得るので、コールバック側はスレッドセーフであること
/// （Tauri の `ipc::Channel` は `Send + Sync` で、内部で順序づけて送る）。
pub fn process_media_with_list_progress<F>(
    media: &mut Vec<MediaInfo>,
    output_dir: &Path,
    options: &ProcessOptions,
    on_progress: F,
) -> Result<ProcessResult>
where
    F: Fn(ProgressEvent) + Sync + Send,
{
    process_media_inner(media, output_dir, options, on_progress)
}

/// メディアファイルをリネームして階層構造にコピー（再スキャンあり版、CLI用）
///
/// scan 時に除外されたシステム生成物の件数（#28）は `ProcessResult::excluded_files` に載せる。
pub fn process_media(
    input_dir: &Path,
    output_dir: &Path,
    options: &ProcessOptions,
) -> Result<ProcessResult> {
    let ScanOutcome {
        mut media,
        excluded,
    } = scan_media(input_dir, options)?;
    let mut result = process_media_inner(&mut media, output_dir, options, |_| {})?;
    result.excluded_files = excluded.total;
    Ok(result)
}

/// メディアファイルをリネームして階層構造にコピー（内部実装）
///
/// `on_progress` はファイル1件完了ごと（成功/失敗の両方）に呼ばれる。並列(rayon)時は
/// 複数スレッドから同時に呼ばれるため `Sync + Send` を要求する。`done` カウンタは
/// `Arc<AtomicUsize>` で採番し、到着順に関係なく 1..=total を1度ずつ網羅する。
fn process_media_inner<F>(
    media: &mut Vec<MediaInfo>,
    output_dir: &Path,
    options: &ProcessOptions,
    on_progress: F,
) -> Result<ProcessResult>
where
    F: Fn(ProgressEvent) + Sync + Send,
{
    let total_files = media.len();

    let errors = Arc::new(Mutex::new(Vec::new()));
    let success_count = Arc::new(Mutex::new(0_usize));
    // 完了済み件数（成功/失敗を問わない）。並列でも競合しないよう Atomic で採番する。
    let done_count = Arc::new(AtomicUsize::new(0));

    // TOCTOU競合防止: ファイル名スロット割り当てとコピーをアトミックに行うためのロック。
    // 並列処理時に複数スレッドが同じ出力パスへ同時書き込みするのを防ぐ。
    let file_slot_lock = Arc::new(Mutex::new(()));

    // ファイル1件の処理が終わるたびに進捗イベントを1回送る。
    let emit_progress = |item: &MediaInfo, status: ProgressStatus| {
        // fetch_add は加算前の値を返すので +1 が「このファイルを含む完了件数」。
        let done = done_count.fetch_add(1, Ordering::SeqCst) + 1;
        on_progress(ProgressEvent {
            done,
            total: total_files,
            path: item.source.original_path.to_string_lossy().to_string(),
            status,
        });
    };

    // 1ファイルを処理し、結果ステータス（Completed / Error）を返す。
    // 進捗イベントは呼び出し側で「結果を問わず1回だけ」emit するため、ここでは早期 return も
    // ステータスを返して抜ける（return 漏れによる進捗カウント取りこぼしを構造的に防ぐ）。
    let process_one = |item: &mut MediaInfo| -> ProgressStatus {
        {
            item.add_log(
                LogLevel::Info,
                format!("Processing started: {}", item.source.file_name),
            );

            // ユーザー選択のタイムゾーン補正を撮影日時へ適用してから
            // 出力ディレクトリ階層・ファイル名を決定する（#5）。
            apply_timezone_correction(item);

            // バックアップ作成
            if let Some(ref backup_dir) = options.backup_dir {
                if let Err(e) = create_backup(&item.source.original_path, backup_dir) {
                    let msg = format!(
                        "Failed to backup {}: {}",
                        item.source.original_path.display(),
                        e
                    );
                    item.add_log(LogLevel::Error, &msg);
                    errors.lock().unwrap().push(msg);
                    return ProgressStatus::Error;
                } else {
                    item.add_log(LogLevel::Info, "Backup created successfully");
                }
            }

            // 出力ディレクトリ作成（日付があれば階層構造、なければunsorted）
            let target_dir = if let Some(date) = item.dates.date_taken {
                match create_date_hierarchy(output_dir, &date) {
                    Ok(dir) => {
                        item.add_log(
                            LogLevel::Info,
                            format!("Created directory: {}", dir.display()),
                        );
                        dir
                    }
                    Err(e) => {
                        let msg = format!(
                            "Failed to create directory for {}: {}",
                            item.source.original_path.display(),
                            e
                        );
                        item.add_log(LogLevel::Error, &msg);
                        errors.lock().unwrap().push(msg);
                        return ProgressStatus::Error;
                    }
                }
            } else {
                // 日付なし → unsortedフォルダへ
                item.add_log(
                    LogLevel::Warning,
                    "No date information found, moving to unsorted folder",
                );
                match create_unsorted_dir(output_dir) {
                    Ok(dir) => dir,
                    Err(e) => {
                        let msg = format!(
                            "Failed to create unsorted directory for {}: {}",
                            item.source.original_path.display(),
                            e
                        );
                        item.add_log(LogLevel::Error, &msg);
                        errors.lock().unwrap().push(msg);
                        return ProgressStatus::Error;
                    }
                }
            };

            // ファイル名スロット割り当てとコピーをアトミックに行う（TOCTOU競合防止）
            // ロック保持中に exists() チェック → コピーまで完了させることで、
            // 別スレッドが同じ名前のファイルを二重コピーするのを防ぐ。
            let copy_result: Result<PathBuf, String> = {
                let _guard = file_slot_lock.lock().unwrap();

                let mut candidate = target_dir.join(&item.derived.new_name);
                let mut counter = 1u32;

                // #29: base_name（stem）の生成は build_stem に一本化。バースト連番・由来タグを
                // 含めたまま衝突連番を末尾に付与する（そうしないと衝突時にタグ・バーストが
                // 消えて別ファイルの名前と再衝突しかねない）。
                while candidate.exists() {
                    let extension = item
                        .source
                        .original_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    // 日付なし: 元のファイル名のステム部分をフォールバックに使う
                    let fallback_stem = item
                        .source
                        .original_path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("unknown");

                    let stem = build_stem(
                        item.dates.date_taken.as_ref(),
                        item.dates.subsec_time,
                        item.derived.burst_index,
                        fallback_stem,
                        item.derived.resolved_provenance_tag.as_deref(),
                    );

                    candidate = target_dir.join(format!("{stem}_{counter:02}.{extension}"));
                    counter += 1;
                }

                if counter > 1 {
                    item.add_log(
                        LogLevel::Warning,
                        format!(
                            "File name conflict detected, using suffix: _{:02}",
                            counter - 1
                        ),
                    );
                }

                // ロック保持中にコピーしてスロットを確保する
                fs::copy(&item.source.original_path, &candidate)
                    .map(|_| candidate)
                    .map_err(|e| {
                        format!(
                            "Failed to copy {}: {}",
                            item.source.original_path.display(),
                            e
                        )
                    })
                // ロック解放
            };

            match copy_result {
                Ok(target_path) => {
                    item.derived.new_path = target_path.clone();
                    item.add_log(
                        LogLevel::Info,
                        format!("File copied successfully to: {}", target_path.display()),
                    );

                    // 画像回転処理（rotation_mode に基づく・ロスレス）
                    if item.source.media_type == MediaType::Photo {
                        let rotation_mode =
                            item.overrides.rotation_mode.as_deref().unwrap_or("none");

                        if rotation_mode != "none" {
                            // 回転角度を計算（exif はミラー系 2/4/5/7 を skip + ログ）
                            let degrees = match rotation_mode {
                                "exif" => match item.source.exif_orientation {
                                    Some(ori) if orientation::is_mirror_orientation(ori) => {
                                        item.add_log(
                                            LogLevel::Warning,
                                            format!(
                                                "Mirror orientation ({ori}) is not supported, skipping rotation"
                                            ),
                                        );
                                        0
                                    }
                                    Some(ori) => orientation::exif_orientation_to_degrees(ori),
                                    None => 0,
                                },
                                "90" => 90,
                                "180" => 180,
                                "270" => 270,
                                _ => 0,
                            };

                            if degrees != 0 {
                                item.add_log(
                                    LogLevel::Info,
                                    format!("Applying lossless rotation: {degrees}°"),
                                );
                                match orientation::rotate_file_in_place(&target_path, degrees) {
                                    Ok(()) => {
                                        item.derived.rotation_applied = true;
                                        item.add_log(LogLevel::Info, "Image rotated losslessly");
                                    }
                                    Err(e) => {
                                        item.add_log(
                                            LogLevel::Error,
                                            format!("Failed to rotate image: {e}"),
                                        );
                                    }
                                }
                            }
                        }
                    }

                    *success_count.lock().unwrap() += 1;
                    ProgressStatus::Completed
                }
                Err(msg) => {
                    item.add_log(LogLevel::Error, &msg);
                    errors.lock().unwrap().push(msg);
                    ProgressStatus::Error
                }
            }
        }
    };

    // 1ファイル処理 → 結果を問わず進捗を1回 emit する。
    let processor = |item: &mut MediaInfo| {
        let status = process_one(item);
        emit_progress(item, status);
    };

    if options.parallel {
        media.par_iter_mut().for_each(processor);
    } else {
        media.iter_mut().for_each(processor);
    }

    let processed_files = *success_count.lock().unwrap();
    let errors_vec = Arc::try_unwrap(errors)
        .map(|mutex| mutex.into_inner().unwrap())
        .unwrap_or_else(|arc| arc.lock().unwrap().clone());

    Ok(ProcessResult {
        success: processed_files > 0,
        total_files,
        processed_files,
        media: media.clone(),
        errors: errors_vec,
        // scan を伴わない呼び出し（事前スキャン済みリストを処理するだけ）では常に 0。
        // `process_media` はこの後 scan 結果の `ExcludedSummary::total` で上書きする。
        excluded_files: 0,
    })
}

#[cfg(test)]
mod tests {
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
        let value =
            serde_json::to_value(ProcessOptions::default()).expect("serialize ProcessOptions");
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

    /// タイムゾーン補正テスト用に最小の MediaInfo を組み立てる。
    fn tz_item(
        date: DateTime<Local>,
        subsec: Option<u32>,
        tz_override: Option<&str>,
        exif_tz: Option<&str>,
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
                new_name: format!("{}.jpg", build_stem(Some(&date), subsec, None, "", None)),
                new_path: PathBuf::new(),
                rotation_applied: false,
                burst_group_id: None,
                burst_index: None,
                resolved_provenance_tag: None,
            },
            overrides: UserOverrides {
                timezone_offset: tz_override.map(|s| s.to_string()),
                rotation_mode: None,
            },
            logs: Vec::new(),
        }
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
}
