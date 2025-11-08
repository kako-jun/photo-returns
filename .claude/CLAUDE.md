# PhotoReturns - 開発メモ

## プロジェクト概要

**名称**: PhotoReturns
**キャッチコピー**: Take back your memories
**目的**: EXIF メタデータに基づいて写真・動画を整理・リネームするクロスプラットフォームアプリケーション

## 背景

このプロジェクトは `y4m2d2` の機能を Tauri 2.0 を使って完全に再実装したものです。真のクロスプラットフォーム対応（Windows、macOS、Linux、Android、iOS）を実現しています。

### 哲学

写真と思い出はユーザーのものであり、巨大テック企業のものではありません。PhotoReturns は以下によってユーザーがデジタルライフをコントロールできるよう支援します：
- メディアファイルを自分のデバイス上でローカルに整理
- 標準化されたクラウド非依存のディレクトリ構造を使用
- オリジナルファイルを保持しながら整理されたコピーを作成
- 完全にオフラインで動作し、データ収集なし

## アーキテクチャ

### 技術スタック

**フロントエンド:**
- React 19 + TypeScript
- Tailwind CSS v4（ユーティリティファースト）
- TanStack Table（データグリッド）
- Vite（ビルドツール）

**バックエンド:**
- Rust（Tauri 2.0）
- kamadak-exif（EXIF読み取り）
- image クレート（画像処理・回転）
- img-parts（JPEG EXIF書き換え）
- chrono + chrono-tz（日時処理）
- rayon（並列処理）

**重要な決定: なぜ Tauri 2.0？**
- モバイル含むクロスプラットフォーム対応（Android/iOS）
- Electron より小さいバイナリサイズ
- より良いセキュリティモデル
- Rust バックエンドによるネイティブパフォーマンス
- ローカルファースト設計（Web サーバー不要）

## 実装状況

### Phase 1: コアセットアップ ✅
- Tauri 2.0 プロジェクト初期化
- 基本フォルダ構造
- 依存関係設定

### Phase 2: コア機能 ✅
- EXIF 日付抽出
- ファイルリネーム（YYYY-MM-DD_HH-MM-SS 形式）
- ディレクトリ階層作成（YYYY/YYYYMM/YYYYMMDD）
- マルチフォーマット対応（画像10種、動画11種）
- rayon による並列処理
- 画像向き検出・修正
- バースト写真検出（3秒以内に3枚以上）
- タイムゾーン対応
- 一時ファイルクリーンアップ

### Phase 3: GUI 実装 ✅
- React + TypeScript フロントエンド
- フォルダ選択ダイアログ
- メディアスキャン機能
- TanStack Table データグリッド（11列）：
  - Expander（展開ボタン）
  - Index（行番号）
  - Before（回転前プレビュー）
  - Type（写真/動画バッジ + EXIFアイコン）
  - Original Name（元のファイル名、クリックでファイルマネージャー表示）
  - Date Source（ドロップダウンで日付ソース選択）
  - Date Taken（撮影日時 + タイムゾーン補正ドロップダウン）
  - Burst（バーストグループ情報）
  - Resolution（解像度 + ファイルサイズ + 向きアイコン）
  - Rotation（回転選択ドロップダウン + EXIF表示）
  - After（回転後プレビュー）
  - New Name（新しいファイル名、クリックでファイルマネージャー表示）
  - Status（pending/processing/completed/error/no_change）
  - Progress（ファイル毎のプログレスバー）
- 行展開でProcessingFlow詳細表示
- Tailwind CSS スタイリング
- ダークモード対応
- Lightbox画像表示

### Phase 4: 統合・仕上げ ✅
- すべての自動機能をデフォルト有効化
- バースト写真の連番付与
- ダイアログのパーミッション設定
- dev/build 用 npm スクリプト

### Phase 5: リファクタリングとログ機能 ✅
- App.tsx を1071行から297行に削減
- コンポーネント分割：
  - MainLayout（レイアウト専用、248行）
  - DirectorySelection（ディレクトリ選択UI）
  - DefaultSettings（デフォルト設定UI）
  - ProcessingFlow（処理フロー表示、255行）
  - ProcessSummary（処理サマリー）
  - LogViewer（ログ表示モーダル、135行）
  - Header/Footer
  - ScrollToTopButton
  - LightBox
- カスタムフック：
  - useMediaTableColumns（テーブル列定義、600+行）
- ログ機能実装：
  - Rust側でLogLevel（Info/Warning/Error）とLogEntry構造体
  - 処理の各ステップでログ記録（7箇所）
  - フロントエンドでLogViewerモーダル表示
  - ログのクリップボードコピー機能

### Phase 6: EXIF回転補正機能 ✅
- Before/After列の追加（回転前後のプレビュー）
- CSS transformによるリアルタイム回転プレビュー
- rotation_mode/timezone_offset フィールド追加
- EXIF Orientation自動リセット機能：
  - img-partsクレートでJPEG EXIF操作
  - TIFFヘッダー解析とOrientationタグ書き換え
  - 画像回転後にOrientation=1（Normal）に設定
  - 二重回転防止
- Rotation列にEXIF情報表示（"EXIF: 90°"）

### Phase 7: エラーハンドリングとサマリー ✅
- ディレクトリ検証：
  - 入力=出力時に警告ダイアログ（上書きモード）
  - 出力が入力内部時にエラー（無限ループ防止）
- エラー継続処理（エラーで中断しない）
- Processing Summary UI：
  - Processed/Skipped/Failed件数表示
  - Failed Filesリスト（クリックでスクロール）
  - Retry Failed Filesボタン
- エラーファイルのみ再処理機能

## 主要機能

### 自動実行される操作

すべての高度な機能はユーザー設定なしで自動実行されます：

1. **バースト検出**
   - 3秒以内に3枚以上の写真を検出
   - 連番を追加: `_01.ext`, `_02.ext`, `_03.ext`
   - `burst.rs` で設定可能

2. **向き修正**
   - EXIF orientation タグを読み取り
   - 自動的に画像を正しい向きに回転
   - 値 1, 3, 6, 8 に対応
   - **処理後にEXIF Orientation=1にリセット**

3. **並列処理**
   - rayon によるマルチスレッドスキャン/処理
   - 大量の写真コレクションで大幅に高速化

4. **一時ファイルクリーンアップ**
   - 処理後に一時ファイルを削除
   - 作業ディレクトリをクリーンに保つ

5. **詳細ログ記録**
   - 処理の各ステップをログに記録
   - LogViewerモーダルで確認可能
   - クリップボードコピー対応

### ユーザー調整可能な機能

1. **日付ソース選択**（ファイル毎）
   - EXIF / FileName / FileCreated / FileModified
   - ドロップダウンで切り替え

2. **タイムゾーン補正**（ファイル毎）
   - -12:00 〜 +14:00、EXIF、Noneから選択
   - 日本時間（UTC+9）基準で補正

3. **回転設定**（ファイル毎）
   - None / EXIF / 90° / 180° / 270°
   - Before/After列でプレビュー確認
   - EXIF情報を列上部に表示

4. **デフォルト設定**
   - 写真用・動画用それぞれにデフォルト設定可能
   - 新規スキャン時に適用

### エラーハンドリング

- **エラーで中断しない**: 全ファイル処理継続
- **個別ログ記録**: 各エラーをログに記録
- **Retry機能**: エラーファイルのみ再処理
- **ディレクトリ検証**: 危険な設定を事前に警告

### 出力形式

**通常ファイル:**
```
YYYY-MM-DD_HH-MM-SS.ext
2025-01-15_10-30-00.jpg
```

**ミリ秒付き:**
```
YYYY-MM-DD_HH-MM-SS-mmm.ext
2025-01-15_10-30-00-123.jpg
```

**バースト写真:**
```
YYYY-MM-DD_HH-MM-SS-mmm_01.ext
YYYY-MM-DD_HH-MM-SS-mmm_02.ext
2025-01-15_10-30-00-123_01.jpg
2025-01-15_10-30-00-123_02.jpg
```

**ディレクトリ構造:**
```
output/
└── 2025/
    └── 2025-01/
        └── 2025-01-15/
            ├── 2025-01-15_10-30-00.jpg
            ├── 2025-01-15_10-30-01-456_01.jpg  # バースト
            ├── 2025-01-15_10-30-01-456_02.jpg  # バースト
            └── 2025-01-15_14-30-00.mp4
```

## コード構造

### フロントエンド (src/)

**メインファイル:**
- `App.tsx` (297行) - ビジネスロジックのみ（state管理、関数定義）
- `App.css` - Tailwind CSS ディレクティブ

**コンポーネント (src/components/):**
- `MainLayout.tsx` (248行) - レイアウト・プレゼンテーション層
- `DirectorySelection.tsx` - ディレクトリ選択UI
- `DefaultSettings.tsx` - デフォルト設定パネル
- `ProcessingFlow.tsx` (255行) - 処理フロー詳細表示（9ステップ）
- `ProcessSummary.tsx` - 処理結果サマリー + Retryボタン
- `LogViewer.tsx` (135行) - ログ表示モーダル
- `LightBox.tsx` - 画像ライトボックス
- `Header.tsx` / `Footer.tsx` - ヘッダー/フッター
- `ScrollToTopButton.tsx` - トップへスクロール

**カスタムフック (src/hooks/):**
- `useMediaTableColumns.tsx` (600+行) - TanStack Table列定義

**型定義:**
- `types.ts` - MediaInfo, ProcessResult, LogEntry等

### バックエンド (src-tauri/src/)

**コアファイル:**
- `lib.rs` - Tauri コマンド定義（scan_media, process_media, reveal_in_filemanager）
- `photo_core.rs` (740+行) - コア処理ロジック
  - メディアスキャン
  - EXIF 抽出
  - ファイルリネーム
  - ディレクトリ作成
  - バースト統合
  - **画像回転処理**
  - **EXIF Orientation書き換え呼び出し**
  - **詳細ログ記録**
- `burst.rs` (213行) - バースト検出アルゴリズム
- `orientation.rs` (220+行) - 画像向き処理
  - EXIF orientation 読み取り
  - 画像回転
  - **reset_exif_orientation()関数**（EXIF書き換え）
- `video_metadata.rs` - 動画メタデータ抽出

**設定ファイル:**
- `src-tauri/capabilities/default.json` - パーミッション設定
- `Cargo.toml` - Rust依存関係
- `tailwind.config.js` - Tailwind 設定
- `postcss.config.js` - PostCSS 設定

## 開発ワークフロー

### アプリの起動
```bash
npm run tauri:dev      # ホットリロード付き開発モード
npm run tauri:build    # リリースビルド
```

### 主要コマンド
```bash
npm install            # 依存関係インストール
npm run dev            # Vite 開発サーバーのみ
npm run build          # フロントエンドビルド
cd src-tauri && cargo check  # Rust コードチェック
cd src-tauri && cargo test   # Rust テスト実行
```

### ビルド & リリース

プロジェクトには自動ビルド&リリース用のGitHub Actionsワークフローが含まれています。

**手動でリリースを作成:**
1. GitHubリポジトリの「Actions」タブを開く
2. 「Release Build」ワークフローを選択
3. 「Run workflow」をクリック
4. バージョン番号を入力（例: `v0.1.0`）
5. 「Run workflow」で実行

**ビルド成果物:**
- **Windows**: `.msi` および `.exe` インストーラー
- **macOS**: `.dmg` ファイル（Universal - ARM64 + Intel両対応）
- **Linux**: `.AppImage` および `.deb` パッケージ

リリースはドラフトとして作成されるため、公開前に内容を確認・編集できます。

**設定ファイル:**
- `.github/workflows/build-release.yml` - ビルドワークフロー定義
- `src-tauri/tauri.conf.json` - アプリ設定（バージョン、識別子等）

## 既知の問題と解決策

### 問題1: ダイアログパーミッションエラー
**エラー:** `dialog.open not allowed`
**解決策:** `capabilities/default.json` に `dialog:default` と `dialog:allow-open` を追加

### 問題2: 未使用関数の警告
**警告:** `create_photo_to_group_map`, `duration_ms` が未使用
**状態:** 非クリティカル、将来の使用のため保持

## テストチェックリスト

- [ ] フォルダ選択ダイアログが動作する
- [ ] メディアスキャンがファイルを正しく表示する
- [ ] Process & Rename が正しいディレクトリ構造を作成する
- [ ] バースト写真に連番が付く
- [ ] 画像が正しく回転される（Before/Afterプレビュー）
- [ ] EXIF Orientation が1にリセットされる
- [ ] ログが正しく記録・表示される
- [ ] エラーファイルのRetryが動作する
- [ ] ディレクトリ検証が正しく警告する
- [ ] プログレスバーがスムーズに更新される
- [ ] ダークモードが正しく切り替わる
- [ ] ビルドがエラーなく成功する

## 設計決定事項

### スキップ機能を実装しない理由
- 画像加工後のハッシュ比較が必要（コスト高）
- 既存ファイルは連番追加で対応（`_01`, `_02`...）
- 「何度も実行」でエラーが減っていく方式
- Retry Failed Files機能で十分カバー

### エラーハンドリング方針
- **エラーで中断しない**: 1つのエラーで全体が止まらない
- **詳細ログ**: デバッグ用に全ステップ記録
- **リトライ機能**: エラーファイルのみ再処理可能

## 今後の拡張機能（オプション）

### 潜在的な機能
- リアルタイム進捗ストリーミング（現在は0%か100%のみ）
- バックアップディレクトリオプション（UI統合）
- カスタム日付フォーマット設定
- 重複検出（ハッシュベース）
- 取り消し/ロールバック機能
- ログファイルエクスポート
- バッチ処理履歴

### モバイル考慮事項
Android/iOS ビルド時：
- タッチインタラクションのテスト
- テーブルスクロールの最適化
- モバイル向けフォントサイズ調整
- モバイル固有のパーミッション追加
- モバイルでのファイルシステムアクセステスト

## 依存関係

### 重要な依存関係（Rust）
- `tauri` - アプリケーションフレームワーク
- `kamadak-exif` - EXIF パース（注：`exif` としてインポート）
- `image` - 画像読み込み・回転
- `img-parts` - JPEG/PNG EXIF書き換え
- `chrono` - 日時処理（"serde" feature必須）
- `chrono-tz` - タイムゾーン処理
- `rayon` - 並列処理
- `walkdir` - ディレクトリ走査
- `mp4` - MP4/QuickTimeメタデータ
- `anyhow` - エラーハンドリング

### フロントエンド依存関係
- `react` (19) + `react-dom` - UI フレームワーク
- `@tauri-apps/api` - Tauri JS API
- `@tauri-apps/plugin-dialog` - ファイルダイアログ
- `@tanstack/react-table` - データグリッド
- `tailwindcss` + `@tailwindcss/postcss` - スタイリング
- `react-icons` - アイコン（HeroIcons 2）

## 学んだベストプラクティス

1. **chrono に必ず serde feature を追加** - DateTime のシリアライズに必要
2. **正しいインポート名を使用** - kamadak-exif クレートは `exif` としてインポート
3. **Tailwind の content パスを設定** - config にすべての .tsx ファイルを含める
4. **パーミッションを明示的に設定** - Tauri 2.0 は capability 設定が必要
5. **実際の写真コレクションでテスト** - 実際の EXIF データでエッジケースが現れる
6. **Arc<Mutex<>> を慎重に使用** - 並列処理の適切な unwrap パターン
7. **コンポーネント分割** - App.tsxはロジックのみ、MainLayoutはプレゼンテーションのみ
8. **img-partsのImageEXIFトレイト** - use文でトレイトをインポート必須

## コミット履歴のハイライト

主要マイルストーン：
- `fba6503` - 初期 Tauri 2.0 セットアップ
- `472e368` - y4m2d2 からのコア移行
- `7d424b7` - すべての機能（向き、バースト、タイムゾーン）
- `76a6189` - データグリッド付き完全な GUI
- `7e7fa07` - Tailwind CSS 移行
- `6121b95` - すべての自動機能を有効化
- `44482eb` - ダイアログパーミッション修正
- `c252ed4` - 日本語ドキュメント追加
- `3f89c6c` - App.tsx大規模リファクタリング（MainLayout分離）
- `767af04` - ログ機能実装（LogViewer + 詳細ログ）
- `b901f36` - EXIF回転補正機能（Before/After + EXIF書き換え）
- `7f967de` - エラーハンドリング + Processing Summary + Retry機能

## 参考資料

- [Tauri 2.0 ドキュメント](https://v2.tauri.app/)
- [TanStack Table](https://tanstack.com/table/latest)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [kamadak-exif docs](https://docs.rs/kamadak-exif/)
- [img-parts docs](https://docs.rs/img-parts/)
- [image crate docs](https://docs.rs/image/)

## 今後の開発のためのメモ

- Rust の警告を最小限に保つ（現在2つの未使用警告）
- クロスプラットフォーム互換性を維持
- すべての自動機能はデフォルトで有効
- UI はシンプルで直感的に保つ
- エラーで中断しない設計
- ログは詳細に、UIはシンプルに
- 破壊的変更は CLAUDE.md に記録する
