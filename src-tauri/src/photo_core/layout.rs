//! 出力先ディレクトリの構築とバックアップ。

use anyhow::Result;
use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};

/// YYYY/YYYY-MM/YYYY-MM-DD の階層構造を作成
pub(crate) fn create_date_hierarchy(output_dir: &Path, date: &DateTime<Local>) -> Result<PathBuf> {
    let year = date.format("%Y").to_string();
    let year_month = date.format("%Y-%m").to_string();
    let year_month_day = date.format("%Y-%m-%d").to_string();

    let target_dir = output_dir
        .join(&year)
        .join(&year_month)
        .join(&year_month_day);
    fs::create_dir_all(&target_dir)?;

    Ok(target_dir)
}

/// バックアップを作成
pub(crate) fn create_backup(original_path: &Path, backup_dir: &Path) -> Result<()> {
    if let Some(file_name) = original_path.file_name() {
        let backup_path = backup_dir.join(file_name);

        // バックアップディレクトリが存在しない場合は作成
        fs::create_dir_all(backup_dir)?;

        // 既存のバックアップがある場合は上書き
        fs::copy(original_path, backup_path)?;
    }
    Ok(())
}

/// "unsorted" ディレクトリを作成して返す
pub(crate) fn create_unsorted_dir(output_dir: &Path) -> Result<PathBuf> {
    let unsorted_dir = output_dir.join("unsorted");
    fs::create_dir_all(&unsorted_dir)?;
    Ok(unsorted_dir)
}
