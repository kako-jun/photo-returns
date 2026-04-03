/// PhotoReturns CLI - Rust バックエンドのテスト用
use photo_returns_lib::photo_core::{self, ProcessOptions};
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 3 {
        eprintln!(
            "Usage: cli <input_dir> <output_dir> [--scan-only] [--no-parallel] [--no-videos]"
        );
        eprintln!("Example: cli /mnt/sd/20251114/photo ~/Desktop/photo_test");
        std::process::exit(1);
    }

    let input_dir = PathBuf::from(&args[1]);
    let output_dir = PathBuf::from(&args[2]);
    let scan_only = args.iter().any(|a| a == "--scan-only");
    let no_parallel = args.iter().any(|a| a == "--no-parallel");
    let no_videos = args.iter().any(|a| a == "--no-videos");

    if !input_dir.exists() {
        eprintln!(
            "Error: Input directory does not exist: {}",
            input_dir.display()
        );
        std::process::exit(1);
    }

    let options = ProcessOptions {
        parallel: !no_parallel,
        include_videos: !no_videos,
        backup_dir: None,
        timezone_offset: None,
        cleanup_temp: false,
        auto_correct_orientation: false,
    };

    println!("Input:  {}", input_dir.display());
    println!("Output: {}", output_dir.display());
    println!(
        "Options: parallel={}, videos={}",
        options.parallel, options.include_videos
    );
    println!();

    if scan_only {
        println!("=== Scan Only Mode ===");
        match photo_core::scan_media(&input_dir, &options) {
            Ok(media) => {
                println!("Found {} media files", media.len());
                println!();

                let photos = media
                    .iter()
                    .filter(|m| m.media_type == photo_core::MediaType::Photo)
                    .count();
                let videos = media
                    .iter()
                    .filter(|m| m.media_type == photo_core::MediaType::Video)
                    .count();
                println!("  Photos: {}", photos);
                println!("  Videos: {}", videos);
                println!();

                // Date source statistics
                let exif_count = media
                    .iter()
                    .filter(|m| m.date_source == photo_core::DateSource::Exif)
                    .count();
                let filename_count = media
                    .iter()
                    .filter(|m| m.date_source == photo_core::DateSource::FileName)
                    .count();
                let created_count = media
                    .iter()
                    .filter(|m| m.date_source == photo_core::DateSource::FileCreated)
                    .count();
                let modified_count = media
                    .iter()
                    .filter(|m| m.date_source == photo_core::DateSource::FileModified)
                    .count();
                let none_count = media
                    .iter()
                    .filter(|m| m.date_source == photo_core::DateSource::None)
                    .count();
                println!("Date sources:");
                println!("  EXIF/QuickTime: {}", exif_count);
                println!("  FileName:       {}", filename_count);
                println!("  FileCreated:    {}", created_count);
                println!("  FileModified:   {}", modified_count);
                println!("  None:           {}", none_count);
                println!();

                // Show timezone info for videos
                let videos_with_tz: Vec<_> = media
                    .iter()
                    .filter(|m| m.media_type == photo_core::MediaType::Video)
                    .collect();
                if !videos_with_tz.is_empty() {
                    println!("=== Video Timezone Analysis ===");
                    for (i, v) in videos_with_tz.iter().take(20).enumerate() {
                        println!("  [{}] {} -> {}", i, v.file_name, v.new_name);
                        println!("      date_taken: {:?}", v.date_taken);
                        println!("      timezone:   {:?}", v.timezone);
                        println!("      date_source: {:?}", v.date_source);
                    }
                    if videos_with_tz.len() > 20 {
                        println!("  ... and {} more videos", videos_with_tz.len() - 20);
                    }
                    println!();
                }

                // Show first 20 files
                println!("=== First 20 files ===");
                for (i, m) in media.iter().take(20).enumerate() {
                    let tz_info = m.timezone.as_deref().unwrap_or("no-tz");
                    let type_str = match m.media_type {
                        photo_core::MediaType::Photo => "Photo",
                        photo_core::MediaType::Video => "Video",
                    };
                    println!(
                        "  [{}] {} ({}) [{}] [tz:{}]",
                        i, m.file_name, type_str, m.new_name, tz_info
                    );
                }

                // Show burst groups
                let burst_files: Vec<_> = media
                    .iter()
                    .filter(|m| m.burst_group_id.is_some())
                    .collect();
                if !burst_files.is_empty() {
                    println!();
                    println!("=== Burst Groups ({} files) ===", burst_files.len());
                    for m in burst_files.iter().take(30) {
                        println!(
                            "  Group {} #{}: {} -> {}",
                            m.burst_group_id.unwrap(),
                            m.burst_index.unwrap(),
                            m.file_name,
                            m.new_name
                        );
                    }
                }
            }
            Err(e) => {
                eprintln!("Scan failed: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        println!("=== Process Mode ===");
        match photo_core::process_media(&input_dir, &output_dir, &options) {
            Ok(result) => {
                println!("Done!");
                println!("  Total:     {}", result.total_files);
                println!("  Processed: {}", result.processed_files);
                println!("  Errors:    {}", result.errors.len());
                if !result.errors.is_empty() {
                    println!();
                    println!("Errors:");
                    for e in &result.errors {
                        println!("  - {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Processing failed: {}", e);
                std::process::exit(1);
            }
        }
    }
}
