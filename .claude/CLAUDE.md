# PhotoReturns - Project Instructions

## Tech Stack

- **Frontend**: React 19 + TypeScript, Tailwind CSS v4, TanStack Table, Vite
- **Backend**: Rust (Tauri 2.0), kamadak-exif, image crate, img-parts, chrono/chrono-tz, rayon
- **Target**: Windows, macOS, Linux, Android, iOS

## Dev Commands

```bash
npm run tauri:dev       # Dev mode with hot reload
npm run tauri:build     # Release build
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
npm run format          # Prettier format
npm run lint:rust       # clippy check
npm run format:rust     # rustfmt format
cd src-tauri && cargo test  # Rust tests
```

## Architecture

- `App.tsx` — Business logic only (state, handlers)
- `src/components/MainLayout.tsx` — Presentation layer
- `src/hooks/useMediaTableColumns.tsx` — TanStack Table column definitions
- `src-tauri/src/photo_core.rs` — Core processing (scan, EXIF, rename, rotate, logs)
- `src-tauri/src/burst.rs` — Burst detection algorithm
- `src-tauri/src/orientation.rs` — EXIF orientation handling + reset

## Key Conventions

- Pre-commit hooks: Husky + lint-staged (ESLint + Prettier for TS, rustfmt + clippy for Rust)
- `chrono` requires `serde` feature for DateTime serialization
- `kamadak-exif` is imported as `exif`
- `img-parts` requires `use` for `ImageEXIF` trait
- ESLint 9.x uses flat config (`eslint.config.js`)
- All auto-features (burst, rotation, parallel) are enabled by default

## Design Decisions

- Errors don't halt processing; retry failed files individually
- No skip/dedup: use sequential numbering (`_01`, `_02`) for conflicts
- EXIF Orientation is reset to 1 after rotation to prevent double-rotation

## Detailed Documentation

See `docs/development.md` for full implementation history, code structure details, and test checklists.
