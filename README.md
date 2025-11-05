# PhotoReturns

**Take back your memories - 思い出を取り戻そう**

PhotoReturns は、EXIFメタデータに基づいて写真や動画を整理・リネームするクロスプラットフォームアプリケーションです。クラウドサービスからデジタルな思い出の所有権を取り戻しましょう。

## 機能

### コア機能
- **EXIF ベースのリネーム** - 撮影日時メタデータを使って自動的にファイルをリネーム
- **ディレクトリ階層** - `YYYY/YYYYMM/YYYYMMDD` 構造でファイルを整理
- **マルチフォーマット対応**
  - 画像10形式: JPG, PNG, GIF, BMP, HEIC, HEIF, WebP, TIFF
  - 動画11形式: MP4, MOV, AVI, MKV, WMV, FLV, WebM, M4V, 3GP, MPG, MPEG

### 自動機能
- **バースト検出** - 連続撮影写真（3秒以内に3枚以上）を識別して連番を付与
- **向き修正** - EXIF の向き情報に基づいて自動的に画像を回転
- **並列処理** - マルチスレッドによる高速スキャン・処理
- **一時ファイルクリーンアップ** - 処理後に一時ファイルを自動削除

### ユーザーインターフェース
- **フォルダ選択** - 入力・出力ディレクトリの簡単な選択ダイアログ
- **リアルタイムプレビュー** - 処理前に全ファイルを表示するデータグリッド
- **進捗追跡** - ファイル毎のステータスとプログレスバー
- **ダークモード** - 自動的なダーク/ライトテーマ対応
- **レスポンシブデザイン** - モダンな Tailwind CSS スタイリング

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Tailwind CSS v4
- **バックエンド**: Rust (Tauri 2.0)
- **UI コンポーネント**: TanStack Table
- **ビルドツール**: Vite
- **プラットフォーム**: クロスプラットフォーム (Windows, macOS, Linux, Android, iOS)

## インストール

### 前提条件
- Node.js (v18+)
- Rust (最新安定版)
- npm または yarn

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/kako-jun/photo-returns.git
cd photo-returns

# 依存関係をインストール
npm install

# 開発モードで実行
npm run tauri:dev

# リリースバージョンをビルド
npm run tauri:build
```

## 使い方

1. **入力ディレクトリを選択** - 写真・動画が入っているフォルダを選択
2. **出力ディレクトリを選択** - 整理されたファイルを保存する場所を選択
3. **メディアファイルをスキャン** - クリックして全メディアファイルをスキャン・プレビュー
4. **処理 & リネーム** - クリックしてファイルを整理・リネーム

すべての高度な機能（バースト検出、向き修正など）は自動的に実行されます。

## 出力形式

### ファイル名
- **通常の写真**: `YYYYMMDD_HHmmss.ext`
- **バースト写真**: `YYYYMMDD_HHmmss_01.ext`, `_02.ext`, `_03.ext`, ...

### ディレクトリ構造
```
output/
├── 2025/
│   ├── 202501/
│   │   ├── 20250101/
│   │   │   ├── 20250101_120000.jpg
│   │   │   ├── 20250101_120001_01.jpg  # バースト
│   │   │   ├── 20250101_120001_02.jpg  # バースト
│   │   │   └── 20250101_143000.mp4
│   │   └── 20250102/
│   └── 202502/
```

## 開発

### プロジェクト構造
```
photo-returns/
├── src/                 # React フロントエンド
│   ├── App.tsx         # メインコンポーネント
│   └── App.css         # Tailwind ディレクティブ
├── src-tauri/          # Rust バックエンド
│   ├── src/
│   │   ├── lib.rs      # Tauri コマンド
│   │   ├── photo_core.rs   # コア処理ロジック
│   │   ├── burst.rs    # バースト検出
│   │   └── orientation.rs  # 向き修正
│   └── capabilities/   # パーミッション設定
└── package.json
```

### 利用可能なスクリプト

```bash
# フロントエンド開発
npm run dev              # Vite 開発サーバー起動
npm run build            # フロントエンドビルド

# Tauri 開発
npm run tauri:dev        # 開発モードで Tauri を実行
npm run tauri:build      # リリースバイナリをビルド
```

### 主要な依存関係

**フロントエンド:**
- `react` - UI フレームワーク
- `@tauri-apps/api` - Tauri JavaScript API
- `@tauri-apps/plugin-dialog` - フォルダ選択
- `@tanstack/react-table` - データグリッド
- `tailwindcss` - スタイリング

**バックエンド:**
- `tauri` - アプリケーションフレームワーク
- `kamadak-exif` - EXIF メタデータ読み取り
- `image` - 画像処理
- `chrono` - 日時処理
- `rayon` - 並列処理
- `walkdir` - ディレクトリ走査

## 設定

### バースト検出設定
デフォルト設定（`burst.rs` 内）:
- 最大間隔: 3秒
- 最小枚数: 3枚

### 処理オプション
すべてデフォルトで有効:
- `parallel: true` - マルチスレッド処理
- `include_videos: true` - 動画ファイルも処理
- `cleanup_temp: true` - 一時ファイル削除
- `auto_correct_orientation: true` - 画像回転修正

## 哲学

写真と思い出はあなたのものであり、巨大テック企業のものではありません。PhotoReturns は、標準化されたクラウド非依存のフォーマットでメディアファイルを整理することで、デジタルライフのコントロールを維持するのを支援します。

## ライセンス

詳細は LICENSE ファイルを参照してください。

## 作者

kako-jun

## 謝辞

`y4m2d2` プロジェクトの機能に基づき、クロスプラットフォーム対応のために完全に再実装されました。
