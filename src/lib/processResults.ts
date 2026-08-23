import type { MediaInfo, ProgressEvent } from '../types';

/**
 * done/total から進捗パーセント（0-100, 整数）を求める。
 * `total === 0` は完了扱いで 100。端数は切り捨て、`done >= total` は 100 に丸める。
 * バックエンド（Rust `progress_percent`）と同じ式。
 */
export function progressPercent(done: number, total: number): number {
  if (total <= 0) return 100;
  const d = Math.min(done, total);
  return Math.floor((d * 100) / total);
}

/**
 * 1件分の進捗イベントを全リストにマージする（#4）。
 *
 * `event.path`（バックエンドの original_path）に一致する1行だけを更新する。完了したファイルは
 * status を completed / error にし、progress を成否で出し分ける（成功=100、失敗=0。失敗で 100%
 * にすると「失敗なのに100%」になるため）。一致しない行は同一参照のまま据え置く（再レンダー最小化）。
 *
 * 注: ここでは `new_path` / `logs` は触らない（それらは処理完了後の `mergeProcessResults` が
 * 確定値で上書きする）。本関数は処理中のライブ表示のみを担う。
 */
export function applyProgressEvent(fullList: MediaInfo[], event: ProgressEvent): MediaInfo[] {
  const key = normalizePathForCompare(event.path);
  let changed = false;
  const next = fullList.map((item) => {
    if (normalizePathForCompare(item.original_path) !== key) {
      return item;
    }
    changed = true;
    return {
      ...item,
      status: event.status === 'completed' ? ('completed' as const) : ('error' as const),
      progress: event.status === 'completed' ? 100 : 0,
    };
  });
  // 一致行が無ければ参照ごと不変を返す（無駄な再レンダーを避ける）
  return changed ? next : fullList;
}

/**
 * 処理対象 targets を「処理中」状態にリセットする（invoke 直前に呼ぶ、#4）。
 * 対象行だけ status=processing / progress=0 にし、対象外は据え置く。
 */
export function markTargetsProcessing(fullList: MediaInfo[], targets: MediaInfo[]): MediaInfo[] {
  const targetPaths = new Set(targets.map((t) => normalizePathForCompare(t.original_path)));
  return fullList.map((item) => {
    if (!targetPaths.has(normalizePathForCompare(item.original_path))) {
      return item;
    }
    return { ...item, status: 'processing' as const, progress: 0 };
  });
}

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
