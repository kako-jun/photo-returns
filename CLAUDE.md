# PhotoReturns: Take back your memories.

## プロジェクトの目的

Googleやアマゾンなどにバックアップされた写真を一括でスマホのSDカードにバックアップするツール。
**写真をユーザー自身の手に取り戻す。**

各デバイス上で**ローカルに完結**するGUIアプリ。サーバーへのアップロードやネットワーク通信は不要。

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
- `src-tauri/src/photo_core/` — Core processing, split by responsibility (tests live in `mod_tests.rs` / `dating_tests.rs`)
  - `mod.rs` — Public types (MediaInfo, ProcessOptions, ...) + pipeline (scan_media, process_media, process_media_with_list)
  - `dating.rs` — Filename/file-timestamp date extraction + `build_stem` (single source of truth for output filename stems)
  - `exif_info.rs` — EXIF extraction + image/video extension detection
  - `layout.rs` — Date-hierarchy directory creation, backup, unsorted dir
  - `exclude.rs` — System-artifact exclusion (`.trashed-*`, `.thumbnails`, etc.)
  - `provenance.rs` — Provenance-tag sanitize/resolve
- `src-tauri/src/burst.rs` — Burst detection algorithm
- `src-tauri/src/orientation.rs` — EXIF orientation handling + reset

## Key Conventions

- Pre-commit hooks: Husky + lint-staged (ESLint + Prettier for TS, rustfmt for Rust)。clippy はビルドを伴い遅いため pre-commit では実行せず CI に任せる
- **`git worktree` で作業ディレクトリを作ったら、そこで最初に `npm run prepare` を実行する。** husky v9 は hooks を `.husky/_`（gitignore 対象、`prepare`=`husky` コマンドが生成）に向けており、worktree にはこのディレクトリが存在しない。`node_modules` を共有クローンから symlink しただけでは `.husky/_` は生成されない（`prepare` は `npm install`/`npm ci` のライフサイクルでしか走らない）。この状態では git は pre-commit hook を**エラーも警告も出さずに黙って無視する**ため、rustfmt/lint-staged が一切走らず、未整形の Rust コードがそのままコミットできてしまう（#38 の「未整形コミット」を起こしうる別経路。忘れると気づかずに再発する）
- `chrono` requires `serde` feature for DateTime serialization
- `kamadak-exif` is imported as `exif`
- `img-parts` requires `use` for `ImageEXIF` trait
- ESLint 9.x uses flat config (`eslint.config.js`)
- All auto-features (burst, rotation, parallel) are enabled by default

## CI/CD

- **CI**: `.github/workflows/ci.yml` — push/PR to main は `frontend` job（`npm run build` / `npm test`）と `rust` job（`cargo fmt --check` / `cargo clippy -- -D warnings` / `cargo check` / `cargo test`）を並列実行。各 job 内でも独立して判定できるステップ（frontendのbuildとtest、rustのfmt/clippy/check）は互いの失敗に関わらず全て実行され、1回のCI実行で全ての失敗が見える（test だけは check の成功に依存）。いずれか1つでも失敗すれば job・CI全体が失敗になる
- **Release**: `.github/workflows/release.yml` — manual dispatch or tag `v*`, 3-OS matrix (macOS/Linux/Windows), tauri-action, draft release
- **Pre-commit**: Husky + lint-staged（`eslint --fix` + `prettier` for TS/JS、`prettier` for JSON/CSS/MD、`rustfmt --edition 2021` for Rust）。整形結果は lint-staged が自動で再ステージする。clippy は実行しない

## Design Decisions

- Errors don't halt processing; retry failed files individually
- No skip/dedup: use sequential numbering (`_01`, `_02`) for conflicts
- EXIF Orientation is reset to 1 after rotation to prevent double-rotation
- 写真のリネームルール: EXIF撮影日時 > ファイル名 > ファイル作成日時 > ファイル更新日時
- フォーマット: `YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN][_タグ].ext`（同名衝突時は末尾に `_NN` を追加。詳細は `docs/features.md`「由来タグ」参照）

## 機能概要

写真を収集し、日時でリネームし、`YYYY/YYYY-MM/YYYY-MM-DD`の階層構造に自動分類する。
ユーザーが写真を集めるHDDなどにコピーしてマージし蓄積していく。

### 元プロジェクト
- `D:\repos\2025\sandbox\y4m2d2`: 写真リネーム機能の完全実装（CLI版）。コアロジックを再利用
- `D:\repos\2024\photos_into_YYYY_YYYYMM_YYYYMMDD`: Tauri 1.xテンプレート

## Detailed Documentation

See `docs/development.md` for full implementation history, code structure details, and test checklists.

## Design System

When changing UI, follow `DESIGN.md`. Do not introduce unrelated colors, fonts,
spacing, or rounded card-heavy styling outside the project design system.
