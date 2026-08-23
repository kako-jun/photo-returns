use photo_returns_lib::photo_core::{
    self, DateSource, LogLevel, MediaInfo, MediaType, ProcessOptions, ProgressStatus,
};
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

fn tsv(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .replace('\\', "\\\\")
        .replace('\t', "\\t")
        .replace('\n', "\\n")
}

fn date_source_name(source: DateSource) -> &'static str {
    match source {
        DateSource::Exif => "Exif",
        DateSource::QuickTime => "QuickTime",
        DateSource::FileName => "FileName",
        DateSource::FileCreated => "FileCreated",
        DateSource::FileModified => "FileModified",
        DateSource::None => "None",
    }
}

fn write_selected(
    writer: &mut BufWriter<File>,
    item: &MediaInfo,
    confidence: &str,
) -> std::io::Result<()> {
    writeln!(
        writer,
        "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
        tsv(item.source.original_path.to_string_lossy()),
        tsv(&item.source.file_name),
        match item.source.media_type {
            MediaType::Photo => "Photo",
            MediaType::Video => "Video",
        },
        date_source_name(item.dates.date_source),
        item.dates
            .date_taken
            .map(|d| d.to_string())
            .unwrap_or_default(),
        tsv(&item.derived.new_name),
        confidence,
        item.source.file_size
    )
}

fn confidence(item: &MediaInfo) -> &'static str {
    let path = item.source.original_path.to_string_lossy();
    let name = item.source.file_name.as_str();
    let is_line = path.contains("/LINE")
        || name.starts_with("line_")
        || name.starts_with("LINE_")
        || name.starts_with("LINE_MOVIE_");
    let is_burst = path.contains("/Cshot/")
        || path.contains("/.medresframes/")
        || name.starts_with("med-res-frame")
        || name.starts_with("Burst_Cover")
        || name.contains("BURST");

    if is_line {
        "line_review"
    } else if is_burst {
        "burst_review"
    } else {
        match item.dates.date_source {
            DateSource::Exif | DateSource::QuickTime => "strong",
            DateSource::FileName => "filename",
            DateSource::FileCreated | DateSource::FileModified => "filesystem",
            DateSource::None => "undated",
        }
    }
}

fn read_file_list(path: &Path) -> std::io::Result<HashSet<PathBuf>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut paths = HashSet::new();
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        paths.insert(PathBuf::from(line));
    }
    Ok(paths)
}

fn usage() -> ! {
    eprintln!(
        "Usage: filelist_batch <output_dir> <selected.tsv> <file-list.txt> <input_dir> [<input_dir>...]"
    );
    std::process::exit(1);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 5 {
        usage();
    }

    let output_dir = PathBuf::from(&args[1]);
    let selected_path = PathBuf::from(&args[2]);
    let file_list_path = PathBuf::from(&args[3]);
    let input_dirs: Vec<PathBuf> = args.iter().skip(4).map(PathBuf::from).collect();

    let wanted = read_file_list(&file_list_path).unwrap_or_else(|err| {
        eprintln!("failed to read {}: {err}", file_list_path.display());
        std::process::exit(1);
    });

    let options = ProcessOptions {
        parallel: false,
        include_videos: true,
        backup_dir: None,
        timezone_offset: None,
        cleanup_temp: true,
        auto_correct_orientation: false,
        exclude_system_artifacts: true,
    };

    let selected_file = File::create(&selected_path).unwrap_or_else(|err| {
        eprintln!("failed to create {}: {err}", selected_path.display());
        std::process::exit(1);
    });
    let mut selected = BufWriter::new(selected_file);
    writeln!(
        selected,
        "path\tfile_name\tmedia_type\tdate_source\tdate_taken\tnew_name\tconfidence\tfile_size"
    )
    .expect("write selected header");

    let mut media_to_process = Vec::new();
    let mut selected_paths = HashSet::new();
    let mut total_scanned = 0usize;

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
            if !wanted.contains(&item.source.original_path) {
                continue;
            }
            if !selected_paths.insert(item.source.original_path.clone()) {
                continue;
            }
            item.overrides.timezone_offset = None;
            item.overrides.rotation_mode = Some("none".to_string());
            write_selected(&mut selected, &item, confidence(&item)).expect("write selected row");
            media_to_process.push(item);
        }
    }
    selected.flush().expect("flush selected tsv");

    eprintln!("Scanned: {total_scanned}");
    eprintln!("Requested: {}", wanted.len());
    eprintln!("Selected: {}", media_to_process.len());
    eprintln!("Output: {}", output_dir.display());

    if media_to_process.len() != wanted.len() {
        eprintln!(
            "warning: selected count differs from requested count ({} != {})",
            media_to_process.len(),
            wanted.len()
        );
    }

    let last_reported = AtomicUsize::new(0);
    let result = photo_core::process_media_with_list_progress(
        &mut media_to_process,
        &output_dir,
        &options,
        |ev| {
            if ev.done == ev.total
                || ev.done == 1
                || ev.done.saturating_sub(last_reported.load(Ordering::SeqCst)) >= 100
            {
                last_reported.store(ev.done, Ordering::SeqCst);
                let status = match ev.status {
                    ProgressStatus::Completed => "ok",
                    ProgressStatus::Error => "error",
                };
                eprintln!("Progress: {}/{} {status}", ev.done, ev.total);
            }
        },
    )
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
