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
- image クレート（画像処理・PNG等の回転）
- turbojpeg（JPEG のロスレス回転 / libjpeg-turbo の DCT 領域変換）
- img-parts（JPEG EXIF書き換え）
- chrono + chrono-tz（日時処理）
- rayon（並列処理）

**ローカルビルドの前提（turbojpeg / libjpeg-turbo）:**

`turbojpeg` crate は libjpeg-turbo にリンクするため、ビルド時に検出が必要。

- Linux: `sudo apt-get install -y pkg-config libturbojpeg0-dev`（pkg-config が自動検出）
- macOS（Homebrew・keg-only）:
  ```sh
  brew install jpeg-turbo
  export TURBOJPEG_SOURCE=explicit
  export TURBOJPEG_LIB_DIR=/opt/homebrew/opt/jpeg-turbo/lib       # Intel は /usr/local/opt/...
  export TURBOJPEG_INCLUDE_PATH=/opt/homebrew/opt/jpeg-turbo/include
  ```
  （または `export PKG_CONFIG_PATH=/opt/homebrew/opt/jpeg-turbo/lib/pkgconfig` でも可）
- Windows / 各OSのリリースビルド（3OS）の native dep 設定はフォローアップ（#7 コメント参照）

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
- ディレクトリ階層作成（YYYY/YYYY-MM/YYYY-MM-DD）
- マルチフォーマット対応（画像11種、動画4種）
- rayon による並列処理
- 画像向き検出・修正
- バースト写真検出（3秒以内に3枚以上）
- タイムゾーン対応
- 一時ファイルクリーンアップ

### Phase 3: GUI 実装 ✅
- React + TypeScript フロントエンド
- フォルダ選択ダイアログ
- メディアスキャン機能
- TanStack Table データグリッド（14列）：
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
  - Status（pending/processing/completed/error）
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

### Phase 8: 方向確認ポップアップ（#7 Phase C）✅
- 眼科Cの4方向ピッカー。EXIF は「どれを見せるか」の篩としてだけ使い、回転の正解は人間が決める
- 純粋ロジック `src/lib/orientationQueue.ts`（vitest 固定）：
  - `selectOrientationQueue`：写真かつ Orientation≠1 かつ非ミラー（2/4/5/7 除外）を抽出
  - `exifDegrees`：3→180 / 6→90 / 8→270 / その他→0（生ピクセルを正立させる CW 度）
  - `resolveRotationMode(initialDeg, direction)`：初期角＋4方向の追加回転 → 絶対 `'none'|'90'|'180'|'270'`
  - 4方向の追加回転（CW 正）：↑ +0 / ← +90 / → −90 / ↓ +180
- `OrientationConfirm.tsx` モーダル：生ピクセル＋`imageOrientation:'none'`＋`transform:rotate(initialDeg)` で
  EXIF 補正済みの見え方を初期表示。矢印キー(↑→↓←)/クリックで「こっちが上」を1回指定→即確定→auto-advance。
  Space=スキップ（rotation_mode 据え置き）、Esc/×=途中終了。進捗 n/total
- `App.tsx` 配線：scan 後にキューが1件以上なら「向きを確認 (N)」ボタンで起動（自動起動はしない＝安全側）。
  確定で該当 item の `rotation_mode` を絶対角に更新→既存ロスレス回転が適用。既存 dropdown/Before-After は不変
- backend は不変（フロントのみ）。**回転方向の左右の符号は GUI 実機での目視が要る唯一の点**（逆なら ←/→ の +90/−90 を入替）

### Phase 9: システム生成物の自動除外（#28）✅
- Android/Google フォトの削除済み（`.trashed-*`）をそのまま取り込むと、削除済み写真が
  永久アーカイブに復活してしまう問題への対応。`.thumbnails` / `.nomedia` / AppleDouble
  （`._*`）/ OS メタデータ（`.DS_Store` / `Thumbs.db`）も同様に既定で除外する
- `ProcessOptions.exclude_system_artifacts: bool`（既定 `true`）。`scan_media` の入口
  （拡張子判定・EXIF読み・日付抽出・バースト検出より前）で判定するため、除外分は
  `MediaInfo` を作らずバースト検出のインデックスにも混ざらない
- 判定は `photo_core/exclude.rs` の純粋関数 `classify_excluded`（入力ディレクトリからの
  相対パスを受ける）と `partition`（WalkDir エントリを kept/excluded に振り分け、
  ルール別件数とサンプルパス20件を集計）
- `scan_media` の戻り値は `ScanOutcome { media: Vec<MediaInfo>, excluded: ExcludedSummary }`
  に変更（`MediaInfo` 自体の wire 契約は不変）。`ExcludedSummary { total, by_rule, samples }`
- フロントはスキャン結果パネルに除外が1件以上のときだけ「EXCLUDED: N」を表示し、押すと
  `LogViewer` を再利用してルール別内訳＋サンプルパスを見られる（`lib/excludedSummary.ts`
  が `ExcludedSummary` → `LogEntry[]` に写像）
- CLI (`cli.rs`) は既定で除外、`--include-system-artifacts` を渡すと従来どおり全部拾う
- テスト: `exclude.rs` 内のルール別判定表（vitest 相当の cargo test）＋
  `tests/e2e_golden.rs` の `e2e_exclude_system_artifacts_default_on` /
  `e2e_exclude_system_artifacts_disabled_includes_trashed`（ゴミ混じりフィクスチャで
  scan→process の出力に混入しないこと・`ExcludedSummary` の件数を機械検証）

### Phase 10: HEIC/HEIF/AVIF 対応（#31）✅
- `is_image_file` が `heic`/`heif`/`avif` を認識するようになった（従来はスキャン対象外で、
  存在しなかったことになっていた）。EXIF 抽出は `kamadak-exif` の ISO BMFF パーサ
  （`isobmff.rs`）が既に対応しており、追加依存なしで撮影日時・サブ秒・TZ・Orientation・
  寸法を JPEG と同じ `get_exif_info` で取得できる。手組みの HEIC/HEIF/AVIF フィクスチャ
  （`exif_info.rs` テスト、`build_heif_family_with_exif`）に加え、実機の HEIC でも実測済み:
  kamadak-exif 同梱の `tests/exif.heic` と、iPhone 実機の HEIC 1837枚から均等抽出した307枚に
  `get_exif_info` を実行し、iPhone 実機 HEIC は全件（307/307）で date/orientation/width/height
  が読めることを確認した（個人写真のためコミットはできず、セルフレビュー時の一時検証コードで
  確認・非コミット。#31 セルフレビュー S3）。kamadak-exif の isobmff パーサは `ftyp` の
  major_brand は見ず compatible_brands の "mif1"/"msf1" だけで判定するため、HEIC/HEIF/AVIF で
  EXIF 抽出ロジックに分岐はない
- ロスレス回転は非対応（`image` crate 0.24 が HEIF をデコードできない）。
  `orientation::supports_lossless_rotation(extension)` で事前に判定し、`image::open` を
  呼んでエラーにする代わりに警告ログを残してスキップする。ミラー系 Orientation の
  スキップと同じ粒度・同じ呼び出し箇所（`photo_core::mod` の回転処理）で判定し、この配線は
  `tests/e2e_golden.rs` の `e2e_heic_rotation_is_skipped_with_log`（ミラー系スキップの
  `e2e_mirror_orientation_is_skipped_with_log` と同型）で機械検証する
- 拡張子ごとの対応可否は **Rust 単独が正本**。`MediaSource.supports_lossless_rotation`
  としてスキャン時に1回だけ計算して JSON に載せ、フロントは文字列解析をせずこの値を読むだけ
  にする（#31 セルフレビュー S2）。以前はフロント `orientationQueue.ts` 側でも拡張子文字列を
  直接パースしており、2言語に正本が分かれるドリフトリスクがあった
- フロント `lib/orientationQueue.ts` の `selectOrientationQueue` は `supportsLosslessRotation`
  でも絞り込み、HEIC/HEIF/AVIF を方向確認ポップアップの対象から除外する（対象に出すと
  人間が4方向を確定しても回転が適用されず「何も起きない」体験になるため）
- Rotate 列・After プレビューも `supportsLosslessRotation` を参照する。`orientationQueue.ts`
  の `effectiveRotationMode` / `rotationDisplayDegrees`（`useMediaTableColumns.tsx` と共通の
  ソース、vitest 固定）が HEIC/HEIF/AVIF では常に `'none'` / 0° を返すため、Rotate 列は
  既定値が「回転なし」になりドロップダウンは「NO ROTATE (FMT)」表示で disable、After
  プレビューにも CSS 回転が乗らない。#31 のセルフレビューで発覚した穴（backend は
  回転をスキップするのに UI は「EXIF (90°)」と表示・プレビューも回って見える不整合）を塞ぐ
- サムネイル/ライトボックス/方向確認ポップアップ（Before・After 列・`LightBox.tsx`・
  `OrientationConfirm.tsx` の4箇所）は、共通コンポーネント `ImageWithFallback.tsx` 経由で
  `<img>` の decode エラーをプレースホルダへ差し替える。直接 DOM 操作
  （`e.currentTarget.style.display = 'none'`）はせず、「失敗した src」を state に持つ設計に
  することで、React の再レンダーで書き戻せず表示が残留するバグ（LightBox で Next/Prev した
  ときにプレースホルダが消えない）を構造的に防ぐ（`src/lib/imageFallback.ts` の
  `shouldShowFallback`、vitest 固定。#31 セルフレビュー M1/S4/S5。Linux WebKitGTK での
  表示可否自体は未検証）
- 新しい画像デコードライブラリ（libheif 等）は追加しない。ロスレス回転・トランスコードは
  スコープ外（元ファイルをそのまま安全な場所へ移すツールという方針を維持）

### Phase 11: 由来タグ（#29）✅
- 複数ソース（Google Takeout / LINE 保存分 / 既存アーカイブ / 別端末）から写真を1つの
  ライブラリへ集約する際、現行の命名（`YYYY-MM-DD_HH-MM-SS[-mmm].ext` ＋ 日付階層）では
  「どこから来たファイルか」が失われる問題への対応。ファイル名自体に由来タグを残す
- タグの決め方は「明示ラベル優先＋フォルダ由来フォールバック」。`ProcessOptions.provenance_tag:
  Option<String>`（実行ごとの明示ラベル）が非空ならそれを全ファイルに使う。未入力かつ
  `ProcessOptions.provenance_from_folder: bool` が有効なら、ファイルの直上の親フォルダ名
  （入力ディレクトリ直下のファイルは入力ディレクトリ自身の名前）を使う。既定は両方 OFF
  （`None` / `false`）＝タグなし＝出力は #29 導入前と1バイトも変わらない
- タグの位置は「バースト連番の後・衝突連番の前」: `stem = YYYY-MM-DD_HH-MM-SS[-mmm]
  [_バーストNN][_タグ]`、出力は `stem.ext`（衝突なし）/ `stem_NN.ext`（衝突時のみ）
- **stem 生成の一本化**: 従来 `dating::format_filename`（通常時）・`scan_media` 内の
  バースト反映ループ・`process_media_inner` の衝突ループの3箇所に重複していた
  「日付＋サブ秒→base_name」の組み立てロジックを `dating::build_stem(date, subsec,
  burst_index, fallback_stem, tag)` に集約した。TZ補正（`apply_timezone_correction`）も
  同じ関数を使うよう変更し、TZ補正で日時が変わってもバースト連番・タグが消えないようにした
  （旧実装は TZ補正時に `format_filename` を直呼びしておりバースト連番が失われる潜在バグが
  あった）。衝突ループも同様にバースト連番・タグを保持したまま衝突連番を末尾に付与するよう
  修正（旧実装は衝突時に日付のみへ巻き戻っており、バースト写真同士が衝突すると取り違えかね
  なかった）
- タグのサニタイズ・解決は純粋関数として `photo_core/provenance.rs` に切り出した
  （`mod.rs` を太らせないため）: `sanitize_tag`（パス区切り・予約文字・空白・`_` を `-` に
  置換、連続する `-` を1個に畳み先頭末尾を除去、最大32文字、非ASCII保持、空または2桁純数字
  （全角数字・半角全角混在を含む。`char::is_numeric()` と `chars().count()` で判定し
  ASCII に限定しない）なら `None`）・`parent_folder_name`（相対パスから直上の親フォルダ名を抽出）・
  `resolve_tag_for_file`（明示ラベル優先＋フォルダ由来フォールバックの解決。フォルダ由来が
  サニタイズで拒否されたら警告ログを出してタグなしにフォールバック、明示ラベルの不正は
  `scan_media` がエラーを返す）
- タグ解決は `scan_media` の中で行い `derived.resolved_provenance_tag`（`MediaInfo` の派生
  フィールド。`ProcessOptions.provenance_tag` ＝生の明示ラベル設定とは別物）に確定値を保持
  したまま `new_name` に反映する。scan-only（CLIの `--scan-only`）でもプレビューに出る
- 配線: `ProcessOptions` に `provenance_tag: Option<String>` / `provenance_from_folder: bool`
  を追加（既定 `None` / `false`）。`scan_media` Tauri コマンドに `provenanceTag` /
  `provenanceFromFolder` 引数を追加（トップレベル引数なので camelCase）。CLI に `--tag
  <LABEL>` / `--tag-from-folder` を追加
- UI: `DefaultSettings.tsx` に写真/動画どちらのチャンネルにも属さない全体設定として、
  ラベル入力欄（`input-recessed`）＋「ラベル未指定時はフォルダ名を使う」トグル
  （`checkbox-hardware`。#28 の EXCLUDE SYSTEM ARTIFACTS と同じ流儀）を追加。値は
  `storage.ts` の `provenanceTag` / `provenanceFromFolder` で永続化
- テスト: `dating.rs`（`build_stem` の日付＋サブ秒＋バースト＋タグ組み立て）・
  `provenance.rs`（`sanitize_tag` / `parent_folder_name` / `resolve_tag_for_file` の
  ユニットテスト）。CLI 実機で golden path（通常・バースト・衝突・日付なし・フォルダ由来
  ネスト/直下・2桁数字拒否・既定OFF不変）を確認済み
- 独立QAレビュー修正1: `is_pure_two_digit` の全角数字すり抜け（`"０１"` が2桁拒否をすり抜け
  タグ採用されていた）を修正。`char::is_numeric()` + `chars().count()` で全角・半角混在も拒否
- 独立QAレビュー修正2: `scan_media` の並列スキャン後のソートが `date_taken` のみを比較キーに
  しており、同一秒内バースト写真のタイブレークがスレッドスケジューリング依存の非決定順の
  まま残っていた（#29 確定仕様「同一入力・同一オプションなら常に同じ名前になる」に違反）。
  `dating::compare_scan_order`（`date_taken` → `subsec_time` → `original_path` の順で
  完全に決定的）を新設し `sort_by` に適用

## 主要機能

### 自動実行される操作

すべての高度な機能はユーザー設定なしで自動実行されます：

1. **バースト検出**
   - 3秒以内に3枚以上の写真を検出
   - 連番を追加: `_01.ext`, `_02.ext`, `_03.ext`
   - `burst.rs` で設定可能

2. **向き修正（ロスレス）**
   - EXIF orientation タグを読み取り
   - 値 1/3/6/8（回転）のみ対応。ミラー系 2/4/5/7 は非対応でスキップ＋ログ
   - HEIC/HEIF/AVIF は `image` crate がデコードできないため形式単位で非対応。事前判定で
     スキップ＋ログ（EXIF の日時・向き・寸法自体は読める。#31）
   - JPEG は turbojpeg(libjpeg-turbo) の DCT 領域変換で**無劣化**回転（EXIF/ICC を保持）。PNG 等は image クレート
   - **処理後にEXIF Orientation=1にリセット**（date/GPS は保持したまま二重回転を防ぐ）
   - 実装: `orientation::rotate_file_in_place` / `exif_orientation_to_degrees` / `is_mirror_orientation` /
     `supports_lossless_rotation`

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

**由来タグ付き（#29、既定OFF）:**
```
YYYY-MM-DD_HH-MM-SS[-mmm][_バーストNN]_タグ.ext
2025-04-22_20-59-15_takeout.jpg          # 通常
2025-04-22_20-59-15_01_takeout.jpg       # バースト（連番の後にタグ）
2025-04-22_20-59-15_takeout_01.jpg       # 衝突（タグの後に衝突連番）
```
詳細は `docs/features.md`「由来タグ」を参照。

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
- `App.tsx` (559行) - ビジネスロジックのみ（state管理、関数定義）
- `App.css` - Tailwind CSS ディレクティブ

**コンポーネント (src/components/):**
- `MainLayout.tsx` (442行) - レイアウト・プレゼンテーション層
- `DirectorySelection.tsx` - ディレクトリ選択UI
- `DefaultSettings.tsx` - デフォルト設定パネル
- `ProcessingFlow.tsx` (265行) - 処理フロー詳細表示（9ステップ）
- `ProcessSummary.tsx` - 処理結果サマリー + Retryボタン
- `LogViewer.tsx` (193行) - ログ表示モーダル
- `LightBox.tsx` - 画像ライトボックス
- `OrientationConfirm.tsx` - 方向確認ポップアップ（眼科Cの4方向ピッカー・#7 Phase C）
- `Header.tsx` / `Footer.tsx` - ヘッダー/フッター
- `ScrollToTopButton.tsx` - トップへスクロール

**カスタムフック (src/hooks/):**
- `useMediaTableColumns.tsx` (775行) - TanStack Table列定義

**純粋ロジック (src/lib/):**
- `processResults.ts` - 処理結果マージ・進捗・リトライ対象抽出（vitest 固定）
- `orientationQueue.ts` - 方向確認の対象抽出・4方向→絶対回転角の写像（vitest 固定・#7 Phase C）
- `newName.ts` - New Name 列プレビュー用 stem 組み立て（backend `build_stem` と同じ順序。vitest 固定・#29）

**型定義:**
- `types.ts` - MediaInfo, ProcessResult, LogEntry等

### バックエンド (src-tauri/src/)

**コアファイル:**
- `lib.rs` - Tauri コマンド定義（scan_media, process_media, process_media_with_settings, reveal_in_filemanager）。`process_media_with_settings` は `Channel<ProgressEvent>` でリアルタイム進捗を送る（#4）
- `photo_core/` - コア処理ロジック（責務別モジュール）
  - `mod.rs` (997行) - 公開型（MediaInfo / ProcessOptions / ProcessResult / MediaType / DateSource 等）とパイプライン（scan_media / process_media / process_media_with_list）。テストは `mod_tests.rs`（1092行）に分離（god-module 対策。パイプライン本体のさらなる分割は #12 で別途）
    - メディアスキャン
    - ファイルリネーム
    - バースト統合
    - **画像回転処理**
    - **EXIF Orientation書き換え呼び出し**
    - **詳細ログ記録**
  - `dating.rs` (173行) - ファイル名からの日付抽出 / ファイル作成・変更日時取得 / stem 生成の単一正本（`build_stem`。日付＋サブ秒＋バースト連番＋由来タグを組み立てる。#29）。テストは `dating_tests.rs`（347行）に分離
  - `exif_info.rs` - EXIF 抽出 / 画像・動画拡張子判定（モジュール名は exif クレートとの衝突回避のため exif_info）
  - `layout.rs` - 日付階層ディレクトリ作成 / バックアップ / unsorted ディレクトリ作成
  - `provenance.rs` (338行) - 由来タグのサニタイズ・解決（`sanitize_tag` / `parent_folder_name` / `resolve_tag_for_file`。#29）
  - 外部参照パス（`photo_core::scan_media` 等）は従来どおり有効
- `burst.rs` (248行) - バースト検出アルゴリズム
- `orientation.rs` (492行) - 画像向き処理
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

### Lint & Format コマンド

**フロントエンド:**
```bash
npm run lint           # ESLint チェック
npm run lint:fix       # ESLint 自動修正
npm run format         # Prettier 自動フォーマット
npm run format:check   # Prettier チェック
```

**バックエンド:**
```bash
npm run lint:rust      # clippy チェック
npm run format:rust    # rustfmt 自動フォーマット
npm run format:rust:check  # rustfmt チェック
```

**Pre-commit フック:**
- **Husky + lint-staged** によりコミット時に自動実行
- TypeScript/React: ESLint + Prettier
- Rust: rustfmt + clippy
- 詳細は `LINT_SETUP.md` を参照

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

### リアルタイム進捗（Channel 方式 / #4）

処理は `process_media_with_settings` コマンドで実行し、進捗を Tauri 2 の
`tauri::ipc::Channel<ProgressEvent>` でファイル1件完了ごとにフロントへ送る。フェイクの
0%→100% は廃止した。

- **バックエンド (`photo_core/mod.rs`)**
  - `ProgressEvent { done, total, path, status }`（`done` は完了済み件数 1..=total、
    `status` は `completed` / `error`）を1ファイルの処理が終わるたびに1回 emit する。
  - 並列(rayon)処理でも `done` は `Arc<AtomicUsize>` の `fetch_add` で採番するため、
    到着順に関係なく 1..=total を1度ずつ網羅する（取りこぼし・重複なし）。
  - 処理本体は `process_one(item) -> ProgressStatus` に切り出し、早期 return（バックアップ
    失敗・ディレクトリ作成失敗など）もステータスを返して抜けることで、結果を問わず
    「1ファイル1イベント」を構造的に保証する（return 漏れによるカウント取りこぼし防止）。
  - 進捗パーセントは純関数 `progress_percent(done, total)`（0-100整数、端数切り捨て、
    `total==0` は 100）で計算し、フロントの `progressPercent` と同式。
- **コマンド境界 (`lib.rs`)**
  - `process_media_with_settings(..., on_progress: Channel<ProgressEvent>)`。チャネル送信
    失敗（フロントが listener を破棄した等）は処理継続を妨げないため握り潰す。
- **フロントエンド (`App.tsx` / `lib/processResults.ts`)**
  - invoke 時に `new Channel<ProgressEvent>()` を渡し、`onmessage` で `applyProgressEvent`
    により該当行の `status`/`progress` をライブ更新する。`setMediaList` は関数更新形を使い
    stale closure を避ける。
  - invoke 直前に `markTargetsProcessing` で対象行を `processing`/`progress=0` にリセット。
  - 全体進捗バーは `MainLayout` に表示（`progressPercent(done, total)`）。`done` は単調増加で
    更新する。
  - 処理完了後、`new_path`/`logs` 等の確定値は従来どおり `mergeProcessResults`（#6）で
    上書きする。ライブ進捗（`applyProgressEvent`）は表示のみで `new_path`/`logs` を触らない。
  - **リトライ**（失敗ファイルのみ再処理）でも `total = targets.length` なので進捗が正しく出る。

## 今後の拡張機能（オプション）

### 潜在的な機能
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

### 開発ツール依存関係
- `eslint` + `@typescript-eslint/*` - TypeScript linter
- `prettier` + `prettier-plugin-tailwindcss` - コードフォーマッター
- `husky` - Git hooks 管理
- `lint-staged` - ステージングファイルのlint実行

## 学んだベストプラクティス

1. **chrono に必ず serde feature を追加** - DateTime のシリアライズに必要
2. **正しいインポート名を使用** - kamadak-exif クレートは `exif` としてインポート
3. **Tailwind の content パスを設定** - config にすべての .tsx ファイルを含める
4. **パーミッションを明示的に設定** - Tauri 2.0 は capability 設定が必要
5. **実際の写真コレクションでテスト** - 実際の EXIF データでエッジケースが現れる
6. **Arc<Mutex<>> を慎重に使用** - 並列処理の適切な unwrap パターン
7. **コンポーネント分割** - App.tsxはロジックのみ、MainLayoutはプレゼンテーションのみ
8. **img-partsのImageEXIFトレイト** - use文でトレイトをインポート必須
9. **ESLint 9.x は Flat Config 形式** - eslint.config.js を使用、.eslintrc.json は非推奨
10. **Husky + lint-staged で自動整形** - コミット時に自動的にlintとフォーマットを実行
11. **clippy の警告を適切に管理** - `-D warnings` は既知の警告がある場合に問題になる

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
- (未コミット) - Lint & Format セットアップ（ESLint + Prettier + Husky + clippy）

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
