mod burst;
mod orientation;
mod photo_core;

use photo_core::{MediaInfo, ProcessOptions, ProcessResult};
use std::path::PathBuf;

/// 指定ディレクトリのメディアファイルをスキャンして情報を取得
#[tauri::command]
fn scan_media(
    input_dir: String,
    include_videos: bool,
    parallel: bool,
) -> Result<Vec<MediaInfo>, String> {
    let path = PathBuf::from(input_dir);
    let options = ProcessOptions {
        parallel,
        include_videos,
        ..Default::default()
    };
    photo_core::scan_media(&path, &options).map_err(|e| e.to_string())
}

/// メディアファイルをリネームして出力ディレクトリに整理
#[tauri::command]
fn process_media(
    input_dir: String,
    output_dir: String,
    backup_dir: Option<String>,
    include_videos: bool,
    parallel: bool,
    timezone_offset: Option<i32>,
    cleanup_temp: bool,
    auto_correct_orientation: bool,
) -> Result<ProcessResult, String> {
    let input_path = PathBuf::from(input_dir);
    let output_path = PathBuf::from(output_dir);
    let backup_path = backup_dir.map(PathBuf::from);

    let options = ProcessOptions {
        parallel,
        include_videos,
        backup_dir: backup_path,
        timezone_offset,
        cleanup_temp,
        auto_correct_orientation,
    };

    photo_core::process_media(&input_path, &output_path, &options).map_err(|e| e.to_string())
}

/// テスト用のgreetコマンド
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, scan_media, process_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
