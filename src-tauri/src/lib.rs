pub mod burst;
pub mod orientation;
pub mod photo_core;
pub mod video_metadata;

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

/// メディアファイルをリネームして出力ディレクトリに整理（再スキャンあり版、後方互換用）
//
// 処理オプションは `ProcessOptions` を正本とし、コマンド境界でも構造体のまま受け取る。
// 以前はフィールドをフラットな引数に展開して即再構築していたが、option セットの定義が
// 二重化し clippy::too_many_arguments を抑止する羽目になっていた。構造体で受けることで
// 正本を 1 箇所に集約し、抑止属性を不要にする（#8）。`ProcessOptions` は Serialize/Deserialize
// 済みのため wire 契約は `{ inputDir, outputDir, options: { ... } }` となる。
#[tauri::command]
fn process_media(
    input_dir: String,
    output_dir: String,
    options: ProcessOptions,
) -> Result<ProcessResult, String> {
    let input_path = PathBuf::from(input_dir);
    let output_path = PathBuf::from(output_dir);

    photo_core::process_media(&input_path, &output_path, &options).map_err(|e| e.to_string())
}

/// 事前スキャン済みメディアリストを使って処理（UIの設定を尊重）
#[tauri::command]
fn process_media_with_settings(
    media_list: Vec<MediaInfo>,
    output_dir: String,
    backup_dir: Option<String>,
    parallel: bool,
    include_videos: bool,
    cleanup_temp: bool,
) -> Result<ProcessResult, String> {
    let output_path = PathBuf::from(output_dir);
    let backup_path = backup_dir.map(PathBuf::from);

    let options = ProcessOptions {
        parallel,
        include_videos,
        backup_dir: backup_path,
        timezone_offset: None,
        cleanup_temp,
        auto_correct_orientation: false, // rotation_mode は各 MediaInfo に含まれる
    };

    let mut media = media_list;
    photo_core::process_media_with_list(&mut media, &output_path, &options)
        .map_err(|e| e.to_string())
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
            return Err(format!("Path does not exist: {path}"));
        }
    } else {
        return Err(format!("Invalid path: {path}"));
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
                    .map_err(|e| format!("Failed to open file manager: {e}"))?;
            }
        } else {
            Command::new("xdg-open")
                .arg(target_path)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {e}"))?;
        }
    }

    Ok(())
}

/// テスト用のgreetコマンド
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scan_media,
            process_media,
            process_media_with_settings,
            reveal_in_filemanager
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
