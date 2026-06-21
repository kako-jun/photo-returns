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
 * 触らず（同一参照のまま）据え置く**ことで、リトライが完了済みファイルを再処理扱いに
 * する/誤って error 化する不具合（#6）を防ぐ。
 *
 * 対象項目は結果（`resultMedia`）から new_path / logs を取り込む。成否は **new_path の
 * 有無**で判定する（現行バックエンドは成功時のみ new_path をセットし、失敗は early-return。
 * `status` フィールドは返さない）。
 *
 * 前提:
 * - `targets` は未処理/失敗の項目に限る（`selectRetryTargets` 経由なら error のみ）。
 *   `no_change`（移動不要で正常終了）は現行バックエンドに存在せず targets にも入らないが、
 *   将来導入する場合はこの new_path ベース判定が誤 error 化し得るので注意。
 * - `original_path` は scan が一意に列挙するためキーとして衝突しない。
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
    const succeeded = Boolean(processed?.new_path);
    return {
      ...item,
      // 失敗時に progress=100 とすると「失敗なのに100%」になるため成否で出し分ける
      progress: succeeded ? 100 : 0,
      status: succeeded ? ('completed' as const) : ('error' as const),
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
