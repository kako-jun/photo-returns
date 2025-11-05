mod photo_core;

use photo_core::{PhotoInfo, ProcessResult};
use std::path::PathBuf;

/// 指定ディレクトリの写真をスキャンして情報を取得
#[tauri::command]
fn scan_photos(input_dir: String) -> Result<Vec<PhotoInfo>, String> {
    let path = PathBuf::from(input_dir);
    photo_core::scan_photos(&path).map_err(|e| e.to_string())
}

/// 写真をリネームして出力ディレクトリに整理
#[tauri::command]
fn process_photos(input_dir: String, output_dir: String) -> Result<ProcessResult, String> {
    let input_path = PathBuf::from(input_dir);
    let output_path = PathBuf::from(output_dir);
    photo_core::process_photos(&input_path, &output_path).map_err(|e| e.to_string())
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
        .invoke_handler(tauri::generate_handler![greet, scan_photos, process_photos])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
