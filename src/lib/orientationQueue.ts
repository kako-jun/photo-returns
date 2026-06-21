// Phase C: 方向確認ポップアップ（眼科Cの4方向ピッカー）の純粋ロジック（#7）。
//
// 設計（kako-jun と合意済み）:
// - EXIF は「どれを人間に見せるか」の篩としてだけ使う。回転の正解は人間が決める。
// - ポップアップのキュー = 写真(media_type==='Photo') かつ EXIF Orientation≠1 かつ非ミラー。
// - 初期表示の見え方 = EXIF補正済み（生ピクセル＋CSS rotate(exifDegrees)・imageOrientation:'none'）。
// - 人間が4方向で「こっちが上」を1回指定 → 絶対角を確定 → rotation_mode を絶対角に設定 →
//   既存 backend がロスレス回転＋Orientation=1。
//
// ここはGUIを持たない純粋関数だけを置き、vitest で固定する。

import type { MediaInfo } from '../types';

/** 4方向ピッカーの操作。「現在表示中の画像の"上"は実際にはどの辺か」を意味する。 */
export type OrientationDirection = 'up' | 'left' | 'right' | 'down';

/** rotation_mode のうち、Phase C が確定で設定する絶対角の集合。 */
export type AbsoluteRotationMode = 'none' | '90' | '180' | '270';

/**
 * EXIF Orientation のミラー（鏡像反転を含む）系かどうか。
 * 2/4/5/7 がミラー。現実のカメラではまず発生せず、backend もロスレス回転を skip するため、
 * ポップアップのキューからも除外する。
 */
export function isMirrorOrientation(orientation: number | null): boolean {
  return orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7;
}

/**
 * EXIF Orientation → 生ピクセルを正立させるための CW（時計回り）回転角。
 * 非ミラーの回転系のみ対応: 3→180, 6→90, 8→270。1 を含むそれ以外は 0。
 * useMediaTableColumns / backend の写像と一致させる。
 */
export function exifDegrees(orientation: number | null): number {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return 0;
  }
}

/**
 * ポップアップで人間に確認させる対象を抽出する。
 * 条件 = 写真 かつ EXIF Orientation≠1（=回転の疑いがある）かつ 非ミラー。
 * EXIF=1（直立扱い）は取りこぼしの受け皿として既存の手動 dropdown に任せる（仕様）。
 * 動画はロスレス画素回転ができないため対象外（別 issue follow-up）。
 */
export function selectOrientationQueue(media: MediaInfo[]): MediaInfo[] {
  return media.filter(
    (m) =>
      m.media_type === 'Photo' &&
      m.exif_orientation !== null &&
      m.exif_orientation !== 1 &&
      !isMirrorOrientation(m.exif_orientation)
  );
}

/**
 * 4方向の指定を「初期表示（EXIF補正済み）からの追加 CW 回転角」に写す。
 * 操作の意味 = 「現在表示中の画像の"上"は実際にはどの辺か」。CW（時計回り）を正とする:
 *   - ↑ (上が上=正しい):   +0
 *   - ← (上は左辺):        +90
 *   - → (上は右辺):        -90（=+270）
 *   - ↓ (上は下辺=逆さ):   +180
 *
 * 注意（GUI未確認の唯一点）: 左右の符号が実機で逆だったら、ここの 'left'/'right' の
 * +90/-90 を入れ替えるだけでよい。回転の見た目の正しさは Tauri デスクトップでの目視が要る。
 */
export function directionDelta(direction: OrientationDirection): number {
  switch (direction) {
    case 'up':
      return 0;
    case 'left':
      return 90;
    case 'right':
      return -90;
    case 'down':
      return 180;
  }
}

/** 角度を 0/90/180/270 のいずれかへ正規化する（負値・360 超も丸める）。 */
function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 正規化済みの絶対角 → rotation_mode。 */
function degreesToRotationMode(deg: number): AbsoluteRotationMode {
  switch (normalizeDegrees(deg)) {
    case 90:
      return '90';
    case 180:
      return '180';
    case 270:
      return '270';
    default:
      return 'none';
  }
}

/**
 * 初期角（生ピクセル基準の CW 度・通常は exifDegrees(orientation)）と人間の4方向指定から、
 * backend に渡す絶対 rotation_mode を確定する。
 * 最終 D = ((初期D + 追加) % 360 + 360) % 360 → 0/90/180/270 → none/90/180/270。
 */
export function resolveRotationMode(
  initialDeg: number,
  direction: OrientationDirection
): AbsoluteRotationMode {
  return degreesToRotationMode(initialDeg + directionDelta(direction));
}
