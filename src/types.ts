// Log level enum
export type LogLevel = 'Info' | 'Warning' | 'Error';

// Log entry structure
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

// Rust側のMediaInfo型に対応
export interface MediaInfo {
  original_path: string;
  file_name: string;
  media_type: 'Photo' | 'Video';
  date_taken: string | null;
  subsec_time: number | null; // ミリ秒（0-999）
  timezone: string | null; // タイムゾーンオフセット（例："+09:00", null=TZ情報なし）
  // 利用可能な日付候補（ユーザー選択用）
  exif_date: string | null;
  filename_date: string | null;
  file_created_date: string | null;
  file_modified_date: string | null;
  new_name: string;
  new_path: string;
  file_size: number;
  burst_group_id: number | null;
  burst_index: number | null;
  // scan 時に解決された由来タグ（#29）。明示ラベル、またはフォルダ名フォールバックから
  // サニタイズ済みで決まった最終値。new_name に反映済み。付いていなければ null。
  resolved_provenance_tag: string | null;
  date_source: 'Exif' | 'QuickTime' | 'FileName' | 'FileCreated' | 'FileModified' | 'None';
  exif_orientation: number | null;
  rotation_applied: boolean;
  // ユーザー選択：TZオフセット補正（例："+09:00", "none"）
  timezone_offset?: string;
  // ユーザー選択：回転方法（"none", "exif", "90", "180", "270"）
  rotation_mode?: 'none' | 'exif' | '90' | '180' | '270';
  width: number | null;
  height: number | null;
  // ロスレス回転に対応した拡張子かどうか（HEIC/HEIF/AVIF は false）。バックエンド
  // （`orientation::supports_lossless_rotation`）がスキャン時に1回だけ計算する。拡張子の
  // 対応リストは Rust 単独が正本で、フロントは文字列解析をせずこの値を読むだけにする（#31）。
  supports_lossless_rotation: boolean;
  progress?: number; // 進捗（0-100）
  status?: 'pending' | 'processing' | 'completed' | 'error' | 'no_change';
  error_message?: string;
  logs: LogEntry[]; // 処理ログ
}

export interface ProcessResult {
  success: boolean;
  total_files: number;
  processed_files: number;
  media: MediaInfo[];
  errors: string[];
  // scan 時にシステム生成物として除外されたファイル数（#28）。
  // 事前スキャン済みリストを処理するだけの経路（リトライ等）では常に 0。
  excluded_files: number;
}

// 除外ルール1件分の件数（#28）。並び順は仕様の表の順（0件のルールは含まない）。
export interface ExcludedRuleCount {
  rule: string;
  count: number;
}

// scan_media で除外されたファイルのサマリ（#28）。
export interface ExcludedSummary {
  total: number;
  by_rule: ExcludedRuleCount[];
  samples: string[]; // 除外された相対パスのサンプル（先頭20件まで）
}

// scan_media の戻り値。スキャンされたメディアと除外サマリを両方持つ（#28）。
export interface ScanOutcome {
  media: MediaInfo[];
  excluded: ExcludedSummary;
}

// ファイル1件完了ごとにバックエンド（Rust）から Channel 経由で届く進捗イベント（#4）。
// Rust 側 `ProgressEvent`（serde rename_all = "camelCase"）と対応する。
export interface ProgressEvent {
  done: number; // 完了済み件数（1..=total、このイベント分を含む）
  total: number; // 今回処理する総件数（リトライ時は失敗ファイル数）
  path: string; // 完了したファイルの original_path（行引き当てキー）
  status: 'completed' | 'error'; // Rust 側 ProgressStatus（snake_case）
}
