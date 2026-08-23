use photo_returns_lib::photo_core::{self, DateSource, ProcessOptions};
use std::path::PathBuf;

fn cell<T: ToString>(value: Option<T>) -> String {
    value.map(|v| v.to_string()).unwrap_or_default()
}

fn source_name(source: DateSource) -> &'static str {
    match source {
        DateSource::Exif => "Exif",
        DateSource::QuickTime => "QuickTime",
        DateSource::FileName => "FileName",
        DateSource::FileCreated => "FileCreated",
        DateSource::FileModified => "FileModified",
        DateSource::None => "None",
    }
}

fn tsv(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .replace('\\', "\\\\")
        .replace('\t', "\\t")
        .replace('\n', "\\n")
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: audit <input_dir> [<input_dir>...]");
        std::process::exit(1);
    }

    println!(
        "input_dir\tpath\tfile_name\tmedia_type\tdate_source\tdate_taken\texif_date\tfilename_date\tfile_created_date\tfile_modified_date\ttimezone\tnew_name\texif_orientation\twidth\theight\tfile_size"
    );

    let options = ProcessOptions {
        parallel: true,
        include_videos: true,
        backup_dir: None,
        timezone_offset: None,
        cleanup_temp: false,
        auto_correct_orientation: false,
        exclude_system_artifacts: true,
        provenance_tag: None,
        provenance_from_folder: false,
    };

    for input in args.iter().skip(1) {
        let input_dir = PathBuf::from(input);
        let media = match photo_core::scan_media(&input_dir, &options) {
            Ok(outcome) => outcome.media,
            Err(err) => {
                eprintln!("scan failed for {}: {err}", input_dir.display());
                continue;
            }
        };

        for item in media {
            println!(
                "{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}\t{}",
                tsv(input),
                tsv(item.source.original_path.to_string_lossy()),
                tsv(&item.source.file_name),
                match item.source.media_type {
                    photo_core::MediaType::Photo => "Photo",
                    photo_core::MediaType::Video => "Video",
                },
                source_name(item.dates.date_source),
                cell(item.dates.date_taken),
                cell(item.dates.exif_date),
                cell(item.dates.filename_date),
                cell(item.dates.file_created_date),
                cell(item.dates.file_modified_date),
                cell(item.dates.timezone),
                tsv(&item.derived.new_name),
                cell(item.source.exif_orientation),
                cell(item.source.width),
                cell(item.source.height),
                item.source.file_size
            );
        }
    }
}
