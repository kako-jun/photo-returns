use std::fs::File;
use std::path::Path;
use anyhow::{Result, Context};
use chrono::{DateTime, Utc};

/// 動画ファイルからメタデータを抽出
pub fn extract_video_metadata(path: &Path) -> Result<VideoMetadata> {
    let file = File::open(path).context("Failed to open video file")?;
    let size = file.metadata()?.len();
    let reader = std::io::BufReader::new(file);

    let mp4 = mp4::Mp4Reader::read_header(reader, size)
        .context("Failed to parse MP4 file")?;

    // QuickTimeメタデータから作成日時を取得
    let creation_time = mp4.moov.mvhd.creation_time;

    // QuickTime epoch (1904-01-01) からUnix epoch (1970-01-01) への変換
    // QuickTimeは1904年1月1日を基準とし、Unixは1970年1月1日を基準とする
    const QUICKTIME_EPOCH_OFFSET: i64 = 2082844800; // 1904-01-01 to 1970-01-01
    let unix_timestamp = creation_time as i64 - QUICKTIME_EPOCH_OFFSET;

    let datetime = DateTime::from_timestamp(unix_timestamp, 0)
        .context("Invalid timestamp in video metadata")?;

    // 動画の幅と高さを取得
    let (width, height) = if let Some(track) = mp4.tracks().get(&1) {
        (track.width() as u32, track.height() as u32)
    } else {
        (0, 0)
    };

    Ok(VideoMetadata {
        creation_time: datetime,
        width,
        height,
        duration_ms: mp4.duration().as_millis() as u64,
    })
}

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub creation_time: DateTime<Utc>,
    pub width: u32,
    pub height: u32,
    pub duration_ms: u64,
}
