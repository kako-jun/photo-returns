use photo_returns_lib::photo_core::{
    self, DateSource, LogLevel, MediaInfo, MediaType, ProcessOptions,
};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

fn tsv(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .replace('\\', "\\\\")
        .replace('\t', "\\t")
        .replace('\n', "\\n")
}

fn is_line(item: &MediaInfo) -> bool {
    let path = item.source.original_path.to_string_lossy();
    let name = item.source.file_name.as_str();
    path.contains("/LINE")
        || name.starts_with("line_")
        || name.starts_with("LINE_")
        || name.starts_with("LINE_MOVIE_")
}

fn is_burst_or_derived_frame(item: &MediaInfo) -> bool {
    let path = item.source.original_path.to_string_lossy();
    let name = item.source.file_name.as_str();
    path.contains("/Cshot/")
        || path.contains("/.medresframes/")
        || name.starts_with("med-res-frame")
        || name.starts_with("Burst_Cover")
        || name.contains("BURST")
}

fn skip_reason(item: &MediaInfo) -> Option<&'static str> {
    if is_line(item) {
        return Some("line_or_line_movie");
    }
    if is_burst_or_derived_frame(item) {
        return Some("burst_or_derived_frame");
    }
    match item.source.media_type {
        MediaType::Photo if item.dates.date_source != DateSource::Exif => {
            Some("photo_without_exif")
        }
        MediaType::Video if item.dates.date_source != DateSource::QuickTime => {
            Some("video_without_quicktime")
        }
        _ => None,
    }
}

fn write_skipped(
    writer: &mut BufWriter<File>,
    input_dir: &Path,
    item: &MediaInfo,
    reason: &str,
) -> std::io::Result<()> {
    writeln!(
        writer,
        "{}\t{}\t{}\t{}\t{}\t{}\t{}",
        tsv(input_dir.to_string_lossy()),
        tsv(item.source.original_path.to_string_lossy()),
        tsv(&item.source.file_name),
        match item.source.media_type {
            MediaType::Photo => "Photo",
            MediaType::Video => "Video",
        },
        reason,
        item.dates
            .date_taken
            .map(|d| d.to_string())
            .unwrap_or_default(),
        tsv(&item.derived.new_name),
    )
}

fn usage() -> ! {
    eprintln!("Usage: safe_batch <output_dir> <skipped.tsv> <input_dir> [<input_dir>...]");
    std::process::exit(1);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        usage();
    }

    let output_dir = PathBuf::from(&args[1]);
    let skipped_path = PathBuf::from(&args[2]);
    let input_dirs: Vec<PathBuf> = args.iter().skip(3).map(PathBuf::from).collect();

    let options = ProcessOptions {
        parallel: true,
        include_videos: true,
        backup_dir: None,
        timezone_offset: None,
        cleanup_temp: true,
        auto_correct_orientation: false,
        exclude_system_artifacts: true,
        provenance_tag: None,
        provenance_from_folder: false,
    };

    let skipped_file = File::create(&skipped_path).unwrap_or_else(|err| {
        eprintln!("failed to create {}: {err}", skipped_path.display());
        std::process::exit(1);
    });
    let mut skipped = BufWriter::new(skipped_file);
    writeln!(
        skipped,
        "input_dir\tpath\tfile_name\tmedia_type\treason\tdate_taken\tnew_name"
    )
    .expect("write skipped header");

    let mut media_to_process = Vec::new();
    let mut total_scanned = 0usize;
    let mut total_skipped = 0usize;

    for input_dir in &input_dirs {
        eprintln!("Scanning {}", input_dir.display());
        let media = match photo_core::scan_media(input_dir, &options) {
            Ok(outcome) => outcome.media,
            Err(err) => {
                eprintln!("scan failed for {}: {err}", input_dir.display());
                continue;
            }
        };
        total_scanned += media.len();

        for mut item in media {
            if let Some(reason) = skip_reason(&item) {
                total_skipped += 1;
                write_skipped(&mut skipped, input_dir, &item, reason).expect("write skipped row");
                continue;
            }
            item.overrides.timezone_offset = None;
            item.overrides.rotation_mode = Some("none".to_string());
            media_to_process.push(item);
        }
    }
    skipped.flush().expect("flush skipped tsv");

    eprintln!("Scanned: {total_scanned}");
    eprintln!("Selected: {}", media_to_process.len());
    eprintln!("Skipped: {total_skipped}");
    eprintln!("Output: {}", output_dir.display());

    let result = photo_core::process_media_with_list(&mut media_to_process, &output_dir, &options)
        .unwrap_or_else(|err| {
            eprintln!("processing failed: {err}");
            std::process::exit(1);
        });

    println!("Done");
    println!("  Total selected: {}", result.total_files);
    println!("  Processed:      {}", result.processed_files);
    println!("  Errors:         {}", result.errors.len());
    if !result.errors.is_empty() {
        for err in &result.errors {
            println!("  - {err}");
        }
    }

    let warning_count = result
        .media
        .iter()
        .flat_map(|m| &m.logs)
        .filter(|log| matches!(log.level, LogLevel::Warning))
        .count();
    println!("  Warnings:       {warning_count}");
}
