// Rust側のMediaInfo型に対応
export interface MediaInfo {
  original_path: string;
  file_name: string;
  media_type: "Photo" | "Video";
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
  date_source: "Exif" | "FileName" | "FileCreated" | "FileModified" | "None";
  exif_orientation: number | null;
  rotation_applied: boolean;
  // ユーザー選択：TZオフセット補正（例："+09:00", "none"）
  timezone_offset?: string;
  // ユーザー選択：回転方法（"none", "exif", "90", "180", "270"）
  rotation_mode?: "none" | "exif" | "90" | "180" | "270";
  width: number | null;
  height: number | null;
  progress?: number; // 進捗（0-100）
  status?: "pending" | "processing" | "completed" | "error" | "no_change";
  error_message?: string;
}

export interface ProcessResult {
  success: boolean;
  total_files: number;
  processed_files: number;
  media: MediaInfo[];
  errors: string[];
}
