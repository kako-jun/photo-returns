mod burst;
mod orientation;
mod photo_core;

use photo_core::{MediaInfo, ProcessOptions, ProcessResult};
use std::path::{Path, PathBuf};
use std::process::Command;

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

/// ファイルをファイラーで開く（ファイルを選択した状態）
#[tauri::command]
fn reveal_in_filemanager(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    // ファイルが存在しない場合は親ディレクトリを開く
    let target_path = if file_path.exists() {
        file_path
    } else if let Some(parent) = file_path.parent() {
        if parent.exists() {
            parent
        } else {
            return Err(format!("Path does not exist: {}", path));
        }
    } else {
        return Err(format!("Invalid path: {}", path));
    };

    #[cfg(target_os = "windows")]
    {
        if file_path.exists() {
            // ファイルが存在する場合は選択して開く
            Command::new("explorer")
                .args(["/select,", &path])
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        } else {
            // ディレクトリのみ開く
            Command::new("explorer")
                .arg(target_path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        if file_path.exists() {
            // ファイルが存在する場合は選択して開く
            Command::new("open")
                .args(["-R", &path])
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        } else {
            // ディレクトリのみ開く
            Command::new("open")
                .arg(target_path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Linuxでは複数のファイルマネージャーが存在するため、xdg-openを試す
        if file_path.exists() {
            // xdg-openはファイルを選択できないので、親ディレクトリを開く
            if let Some(parent) = file_path.parent() {
                Command::new("xdg-open")
                    .arg(parent)
                    .spawn()
                    .map_err(|e| format!("Failed to open file manager: {}", e))?;
            }
        } else {
            Command::new("xdg-open")
                .arg(target_path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }
    }

    Ok(())
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, scan_media, process_media, reveal_in_filemanager])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
