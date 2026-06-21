import type { MediaInfo } from '../types';

/**
 * プラットフォーム依存のパス区切り（Windows の `\\` と POSIX の `/`）を吸収して
 * original_path を比較するための正規化。
 */
export function normalizePathForCompare(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * バックエンドの処理結果を全リストにマージする。
 *
 * `targets` は今回 `process_media_with_settings` に渡したサブセット（初回は全件、
 * リトライ時は失敗ファイルのみ）。**対象に含まれない項目（前回完了済みなど）は一切
 * 触らず据え置く**ことで、リトライが完了済みファイルを再処理扱いにする/誤って error
 * 化する不具合（#6）を防ぐ。
 *
 * 対象項目は結果（`resultMedia`）から status / new_path / logs を取り込む。結果に
 * 見つからなければ error 扱いにする。
 */
export function mergeProcessResults(
  fullList: MediaInfo[],
  targets: MediaInfo[],
  resultMedia: MediaInfo[]
): MediaInfo[] {
  const targetPaths = new Set(targets.map((t) => normalizePathForCompare(t.original_path)));

  return fullList.map((item) => {
    const key = normalizePathForCompare(item.original_path);
    if (!targetPaths.has(key)) {
      // 今回処理していない項目は不変（完了済みを再処理・誤判定しない）
      return item;
    }

    const processed = resultMedia.find((m) => normalizePathForCompare(m.original_path) === key);
    return {
      ...item,
      progress: 100,
      status: processed?.new_path ? ('completed' as const) : ('error' as const),
      new_path: processed?.new_path ?? '',
      // 結果のログを取り込む（リトライ対象の処理ログを LogViewer で確認できる）
      logs: processed?.logs ?? item.logs,
    };
  });
}

/**
 * リトライ対象（前回失敗した項目）を抽出する。
 */
export function selectRetryTargets(fullList: MediaInfo[]): MediaInfo[] {
  return fullList.filter((item) => item.status === 'error');
}
