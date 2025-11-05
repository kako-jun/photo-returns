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
- image クレート（画像処理）
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
- ファイルリネーム（YYYYMMDD_HHmmss 形式）
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
- TanStack Table データグリッド（7列）：
  - Type（写真/動画バッジ）
  - Original Name（元のファイル名）
  - New Name（新しいファイル名）
  - Date Taken（撮影日時）
  - Size（ファイルサイズ）
  - Status（pending/processing/completed/error）
  - Progress（ファイル毎のプログレスバー）
- 処理サマリー表示
- Tailwind CSS スタイリング
- ダークモード対応

### Phase 4: 統合・仕上げ ✅
- すべての自動機能をデフォルト有効化
- バースト写真の連番付与
- ダイアログのパーミッション設定
- dev/build 用 npm スクリプト
- 完全なドキュメント

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

3. **並列処理**
   - rayon によるマルチスレッドスキャン/処理
   - 大量の写真コレクションで大幅に高速化

4. **一時ファイルクリーンアップ**
   - 処理後に一時ファイルを削除
   - 作業ディレクトリをクリーンに保つ

### 出力形式

**通常ファイル:**
```
YYYYMMDD_HHmmss.ext
20250101_120000.jpg
```

**バースト写真:**
```
YYYYMMDD_HHmmss_01.ext
YYYYMMDD_HHmmss_02.ext
20250101_120000_01.jpg
20250101_120000_02.jpg
```

**ディレクトリ構造:**
```
output/
└── 2025/
    └── 202501/
        └── 20250101/
            ├── 20250101_120000.jpg
            ├── 20250101_120001_01.jpg  # バースト
            ├── 20250101_120001_02.jpg  # バースト
            └── 20250101_143000.mp4
```

## コード構造

### フロントエンド (src/)
- `App.tsx` - UI ロジックを含むメイン React コンポーネント
- `App.css` - Tailwind CSS ディレクティブのみ

### バックエンド (src-tauri/src/)
- `lib.rs` - Tauri コマンド定義（scan_media, process_media）
- `photo_core.rs` - コア処理ロジック（335行）
  - メディアスキャン
  - EXIF 抽出
  - ファイルリネーム
  - ディレクトリ作成
  - バースト統合
- `burst.rs` - バースト検出アルゴリズム（213行）
  - 時間ベースのグループ化
  - 設定可能な閾値
- `orientation.rs` - 画像向き処理（144行）
  - EXIF orientation 読み取り
  - 画像回転

### 設定ファイル
- `src-tauri/capabilities/default.json` - パーミッション設定
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

## 既知の問題と解決策

### 問題1: ダイアログパーミッションエラー
**エラー:** `dialog.open not allowed`
**解決策:** `capabilities/default.json` に `dialog:default` と `dialog:allow-open` を追加

### 問題2: 未使用関数の警告
**警告:** `create_photo_to_group_map` が未使用
**状態:** 非クリティカルなヘルパー関数、将来の使用のため保持

## テストチェックリスト

- [ ] フォルダ選択ダイアログが動作する
- [ ] メディアスキャンがファイルを正しく表示する
- [ ] Process & Rename が正しいディレクトリ構造を作成する
- [ ] バースト写真に連番が付く
- [ ] 画像が正しく回転される
- [ ] プログレスバーがスムーズに更新される
- [ ] ダークモードが正しく切り替わる
- [ ] ビルドがエラーなく成功する

## 今後の拡張機能（オプション）

### 潜在的な機能
- リアルタイム進捗ストリーミング（現在は0%か100%のみ）
- バックアップディレクトリオプション（UI統合）
- カスタム日付フォーマット設定
- 重複検出
- 選択的ファイル処理（チェックボックス）
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

### 重要な依存関係
- `tauri` - アプリケーションフレームワーク
- `kamadak-exif` - EXIF パース（注：`exif` としてインポート、`kamadak_exif` ではない）
- `image` - 画像操作
- `chrono` - 日時処理（"serde" feature を有効化必須）
- `rayon` - 並列処理
- `walkdir` - ディレクトリ走査

### フロントエンド依存関係
- `react` + `react-dom` - UI フレームワーク
- `@tauri-apps/api` - Tauri JS API
- `@tauri-apps/plugin-dialog` - ファイルダイアログ
- `@tanstack/react-table` - データグリッド
- `tailwindcss` + `@tailwindcss/postcss` - スタイリング

## 学んだベストプラクティス

1. **chrono に必ず serde feature を追加** - DateTime のシリアライズに必要
2. **正しいインポート名を使用** - kamadak-exif クレートは `exif` としてインポート
3. **Tailwind の content パスを設定** - config にすべての .tsx ファイルを含める
4. **パーミッションを明示的に設定** - Tauri 2.0 は capability 設定が必要
5. **実際の写真コレクションでテスト** - 実際の EXIF データでエッジケースが現れる
6. **Arc<Mutex<>> を慎重に使用** - 並列処理の適切な unwrap パターン

## コミット履歴のハイライト

主要マイルストーン：
- `fba6503` - 初期 Tauri 2.0 セットアップ
- `472e368` - y4m2d2 からのコア移行
- `7d424b7` - すべての機能（向き、バースト、タイムゾーン）
- `76a6189` - データグリッド付き完全な GUI
- `7e7fa07` - Tailwind CSS 移行
- `6121b95` - すべての自動機能を有効化
- `44482eb` - ダイアログパーミッション修正

## 参考資料

- [Tauri 2.0 ドキュメント](https://v2.tauri.app/)
- [TanStack Table](https://tanstack.com/table/latest)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [kamadak-exif docs](https://docs.rs/kamadak-exif/)

## 今後の開発のためのメモ

- Rust の警告を0に保つ（現在1つの未使用関数）
- クロスプラットフォーム互換性を維持
- すべての機能は自動で動作すべき
- UI はシンプルで直感的に保つ
- 破壊的変更は CLAUDE.md に記録する
