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

## CI/CD

- **CI**: `.github/workflows/ci.yml` — push/PR to main triggers `cargo fmt --check` / `cargo clippy` / `cargo check` + `npm run build`
- **Release**: `.github/workflows/release.yml` — manual dispatch or tag `v*`, 3-OS matrix (macOS/Linux/Windows), tauri-action, draft release
- **Pre-commit**: Husky + lint-staged (`eslint --fix` + `prettier` for TS/JS, `prettier` for JSON/CSS/MD) + `cargo fmt`

## Design Decisions

- Errors don't halt processing; retry failed files individually
- No skip/dedup: use sequential numbering (`_01`, `_02`) for conflicts
- EXIF Orientation is reset to 1 after rotation to prevent double-rotation
- 写真のリネームルール: EXIF撮影日時 > ファイル作成日時 > ファイル更新日時
- フォーマット: `YYYYMMDD_HHmmss.ext`

## 機能概要

写真を収集し、日時でリネームし、`YYYY/YYYYMM/YYYYMMDD`の階層構造に自動分類する。
ユーザーが写真を集めるHDDなどにコピーしてマージし蓄積していく。

### 元プロジェクト
- `D:\repos\2025\sandbox\y4m2d2`: 写真リネーム機能の完全実装（CLI版）。コアロジックを再利用
- `D:\repos\2024\photos_into_YYYY_YYYYMM_YYYYMMDD`: Tauri 1.xテンプレート

## Detailed Documentation

See `docs/development.md` for full implementation history, code structure details, and test checklists.


## デザインシステム

UIの生成・修正時は `DESIGN.md` に定義されたデザインシステムに従うこと。定義外の色・フォント・スペーシングを勝手に使わない。
