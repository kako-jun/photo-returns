# Lint & Format セットアップガイド

PhotoReturns プロジェクトには、コードの品質を保つための自動 lint とフォーマット機能が設定されています。

## 概要

- **フロントエンド (TypeScript/React)**: ESLint + Prettier
- **バックエンド (Rust)**: rustfmt + clippy
- **Pre-commit フック**: Husky + lint-staged
- **CI/CD**: GitHub Actions でのビルド前チェック

## 使用可能なコマンド

### フロントエンド

```bash
# TypeScript/React のlintチェック
npm run lint

# 自動修正
npm run lint:fix

# フォーマットチェック
npm run format:check

# 自動フォーマット
npm run format
```

### バックエンド

```bash
# Rust のlintチェック（clippy）
npm run lint:rust

# Rust のフォーマットチェック
npm run format:rust:check

# 自動フォーマット
npm run format:rust
```

### 全体

```bash
# すべてのlintとフォーマットを実行
npm run lint && npm run format:check && npm run lint:rust && npm run format:rust:check
```

## Pre-commit フック

コミット時に自動的に以下が実行されます：

### TypeScript/React ファイル (.ts, .tsx)
1. **ESLint** で自動修正（`--fix`）
2. **Prettier** で自動フォーマット

### CSS ファイル
1. **Prettier** で自動フォーマット

### Rust ファイル (.rs)
1. **rustfmt** で自動フォーマット
2. **clippy** でlintチェック

### 動作確認

実際にコミットしてみてください：

```bash
# ファイルを変更
git add .

# コミット（pre-commitフックが自動実行される）
git commit -m "test commit"
```

フックが失敗した場合、自動修正されたファイルを再度 `git add` してからコミットしてください。

## CI/CD ワークフロー

### PR/Push 時のチェック (.github/workflows/ci.yml)

`main` ブランチへの Push または PR 時に以下が実行されます：

1. フロントエンド lint チェック
2. フロントエンド フォーマットチェック
3. Rust フォーマットチェック
4. Rust lint チェック（警告のみ）
5. TypeScript ビルドチェック

### リリースビルド時のチェック (.github/workflows/build-release.yml)

リリースビルド時にも同様のチェックが実行されます。

## 設定ファイル

### フロントエンド

- **eslint.config.js**: ESLint 設定（Flat Config 形式）
  - TypeScript/React のルール
  - ブラウザグローバル変数の定義
  - 推奨ルールセット適用

- **.prettierrc.json**: Prettier 設定
  - セミコロン: あり
  - シングルクォート: あり
  - 行幅: 100文字
  - Tailwind CSS プラグイン対応

- **.prettierignore**: Prettier 除外ファイル
  - dist, node_modules, src-tauri/target
  - Markdown, JSON ファイル

### バックエンド

- **src-tauri/rustfmt.toml**: rustfmt 設定
  - Edition: 2021
  - 行幅: 100文字
  - Tab: 4スペース
  - 改行スタイル: Unix

- **src-tauri/clippy.toml**: clippy 設定
  - ワイルドカードインポートの警告

### Pre-commit

- **.husky/pre-commit**: Husky フック
  - `lint-staged` を実行

- **package.json**: lint-staged 設定
  - ファイルタイプごとの処理定義

## トラブルシューティング

### Pre-commit フックが動作しない

```bash
# Husky を再インストール
npm run prepare
```

### ESLint エラー

```bash
# 自動修正を試す
npm run lint:fix
```

### Rust フォーマットエラー

```bash
# 自動フォーマットを実行
npm run format:rust
```

### フックをスキップ（緊急時のみ）

```bash
git commit --no-verify -m "message"
```

## 既知の警告

以下の警告は既知の問題で、将来の使用のために保持されています：

### Rust

- `create_photo_to_group_map` 関数が未使用
- `duration_ms` フィールドが未使用

### TypeScript

- 一部で `any` 型を使用（警告レベル）

これらは開発に影響しないため、現状のままとしています。

## 参考リンク

- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)
- [rustfmt](https://github.com/rust-lang/rustfmt)
- [clippy](https://github.com/rust-lang/rust-clippy)
