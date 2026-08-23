import { describe, it, expect } from 'vitest';
import type { MediaInfo } from '../types';
import {
  isMirrorOrientation,
  supportsLosslessRotation,
  exifDegrees,
  effectiveRotationMode,
  rotationDisplayDegrees,
  selectOrientationQueue,
  directionDelta,
  resolveRotationMode,
  type OrientationDirection,
} from './orientationQueue';

/**
 * テスト用に MediaInfo を最小フィールドで組み立てる。
 * `supports_lossless_rotation` の既定値は path の拡張子（heic/heif/avif なら false）から
 * 推定する。バックエンドがスキャン時に計算する値のテスト用スタンドインであり、
 * orientationQueue.ts 自身はもう拡張子解析をしない（#31 セルフレビュー S2）。
 */
function media(path: string, over: Partial<MediaInfo> = {}): MediaInfo {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return {
    original_path: path,
    file_name: path.split(/[\\/]/).pop() ?? path,
    media_type: 'Photo',
    date_taken: null,
    subsec_time: null,
    timezone: null,
    exif_date: null,
    filename_date: null,
    file_created_date: null,
    file_modified_date: null,
    new_name: '',
    new_path: '',
    file_size: 0,
    burst_group_id: null,
    burst_index: null,
    resolved_provenance_tag: null,
    date_source: 'None',
    exif_orientation: null,
    rotation_applied: false,
    width: null,
    height: null,
    supports_lossless_rotation: !['heic', 'heif', 'avif'].includes(extension),
    logs: [],
    ...over,
  };
}

describe('isMirrorOrientation', () => {
  it('2/4/5/7 はミラー、それ以外（1/3/6/8/null）は非ミラー', () => {
    expect([2, 4, 5, 7].map(isMirrorOrientation)).toEqual([true, true, true, true]);
    expect([1, 3, 6, 8].map(isMirrorOrientation)).toEqual([false, false, false, false]);
    expect(isMirrorOrientation(null)).toBe(false);
  });
});

describe('supportsLosslessRotation', () => {
  // 拡張子リストの正本は Rust（`orientation::supports_lossless_rotation`）単独（#31 S2）。
  // ここでは「バックエンドが載せた値をそのまま読むだけ」であることだけを確認する。
  it('media.supports_lossless_rotation の値をそのまま返す', () => {
    expect(supportsLosslessRotation(media('/a.heic', { supports_lossless_rotation: false }))).toBe(
      false
    );
    expect(supportsLosslessRotation(media('/a.jpg', { supports_lossless_rotation: true }))).toBe(
      true
    );
  });
});

describe('exifDegrees', () => {
  it('3→180, 6→90, 8→270, それ以外→0', () => {
    expect(exifDegrees(3)).toBe(180);
    expect(exifDegrees(6)).toBe(90);
    expect(exifDegrees(8)).toBe(270);
  });

  it('1・ミラー系・null は 0（補正不要扱い）', () => {
    expect(exifDegrees(1)).toBe(0);
    expect(exifDegrees(2)).toBe(0);
    expect(exifDegrees(5)).toBe(0);
    expect(exifDegrees(null)).toBe(0);
  });
});

describe('effectiveRotationMode', () => {
  it('非対応形式（HEIC/HEIF/AVIF）は明示選択があっても常に none（#31）', () => {
    expect(effectiveRotationMode(media('/a.heic', { exif_orientation: 6 }))).toBe('none');
    expect(
      effectiveRotationMode(media('/a.HEIF', { exif_orientation: 3, rotation_mode: '180' }))
    ).toBe('none');
    expect(
      effectiveRotationMode(media('/a.avif', { rotation_mode: 'exif', exif_orientation: 8 }))
    ).toBe('none');
  });

  it('対応形式で明示選択があればそれを優先する', () => {
    expect(
      effectiveRotationMode(media('/a.jpg', { rotation_mode: '90', exif_orientation: 6 }))
    ).toBe('90');
    expect(
      effectiveRotationMode(media('/a.jpg', { rotation_mode: 'none', exif_orientation: 6 }))
    ).toBe('none');
  });

  it('対応形式で明示選択がなければ EXIF Orientation≠1 の時だけ exif を既定にする', () => {
    expect(effectiveRotationMode(media('/a.jpg', { exif_orientation: 6 }))).toBe('exif');
    expect(effectiveRotationMode(media('/a.jpg', { exif_orientation: 1 }))).toBe('none');
    expect(effectiveRotationMode(media('/a.jpg', { exif_orientation: null }))).toBe('none');
  });
});

describe('rotationDisplayDegrees', () => {
  it('非対応形式は rotation_mode を明示していても常に 0（回して見せない、#31）', () => {
    expect(rotationDisplayDegrees(media('/a.heic', { exif_orientation: 6 }))).toBe(0);
    expect(
      rotationDisplayDegrees(media('/a.heic', { exif_orientation: 6, rotation_mode: '90' }))
    ).toBe(0);
  });

  it('exif モードは EXIF Orientation から角度を導く', () => {
    expect(rotationDisplayDegrees(media('/a.jpg', { exif_orientation: 6 }))).toBe(90);
    expect(rotationDisplayDegrees(media('/a.jpg', { exif_orientation: 3 }))).toBe(180);
    expect(rotationDisplayDegrees(media('/a.jpg', { exif_orientation: 8 }))).toBe(270);
  });

  it('絶対角の明示選択はそのまま角度になる、none は 0', () => {
    expect(rotationDisplayDegrees(media('/a.jpg', { rotation_mode: '90' }))).toBe(90);
    expect(rotationDisplayDegrees(media('/a.jpg', { rotation_mode: '180' }))).toBe(180);
    expect(rotationDisplayDegrees(media('/a.jpg', { rotation_mode: '270' }))).toBe(270);
    expect(
      rotationDisplayDegrees(media('/a.jpg', { rotation_mode: 'none', exif_orientation: 6 }))
    ).toBe(0);
  });
});

describe('selectOrientationQueue', () => {
  it('写真 かつ Orientation≠1 かつ 非ミラー かつ ロスレス回転対応形式 だけを残す', () => {
    const list = [
      media('/a.jpg', { exif_orientation: 6 }), // ○ 写真・回転あり
      media('/b.jpg', { exif_orientation: 1 }), // × 直立（手動 dropdown に任せる）
      media('/c.jpg', { exif_orientation: null }), // × Orientation 不明
      media('/d.jpg', { exif_orientation: 2 }), // × ミラー
      media('/e.jpg', { exif_orientation: 7 }), // × ミラー
      media('/f.mp4', { media_type: 'Video', exif_orientation: 6 }), // × 動画は対象外
      media('/g.jpg', { exif_orientation: 3 }), // ○
      media('/h.jpg', { exif_orientation: 8 }), // ○
      media('/i.heic', { exif_orientation: 6 }), // × HEIC は回転 skip 対象（#31）
      media('/j.HEIF', { exif_orientation: 3 }), // × HEIF（大文字）も同様
      media('/k.avif', { exif_orientation: 8 }), // × AVIF も同様
    ];

    expect(selectOrientationQueue(list).map((m) => m.original_path)).toEqual([
      '/a.jpg',
      '/g.jpg',
      '/h.jpg',
    ]);
  });

  it('対象なしなら空配列', () => {
    expect(selectOrientationQueue([media('/x.jpg', { exif_orientation: 1 })])).toEqual([]);
    expect(selectOrientationQueue([])).toEqual([]);
  });

  it('元配列を破壊せず、要素の参照はそのまま渡す', () => {
    const item = media('/a.jpg', { exif_orientation: 6 });
    const list = [item];
    const out = selectOrientationQueue(list);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(item); // 参照同一（rotation_mode 更新の引き当てに使える）
    expect(list).toHaveLength(1); // 元配列は不変
  });
});

describe('directionDelta', () => {
  it('↑+0 / ←+90 / →-90 / ↓+180（CW 正、左右の符号はGUI実機で確認する唯一点）', () => {
    expect(directionDelta('up')).toBe(0);
    expect(directionDelta('left')).toBe(90);
    expect(directionDelta('right')).toBe(-90);
    expect(directionDelta('down')).toBe(180);
  });
});

describe('resolveRotationMode', () => {
  const dirs: OrientationDirection[] = ['up', 'left', 'right', 'down'];

  it('初期 0°（EXIF=1 相当）: ↑none / ←90 / →270 / ↓180', () => {
    expect(dirs.map((d) => resolveRotationMode(0, d))).toEqual(['none', '90', '270', '180']);
  });

  it('初期 90°（EXIF=6）: ↑90 / ←180 / →none / ↓270', () => {
    expect(dirs.map((d) => resolveRotationMode(90, d))).toEqual(['90', '180', 'none', '270']);
  });

  it('初期 180°（EXIF=3）: ↑180 / ←270 / →90 / ↓none', () => {
    expect(dirs.map((d) => resolveRotationMode(180, d))).toEqual(['180', '270', '90', 'none']);
  });

  it('初期 270°（EXIF=8）: ↑270 / ←none / →180 / ↓90', () => {
    expect(dirs.map((d) => resolveRotationMode(270, d))).toEqual(['270', 'none', '180', '90']);
  });

  it('初期表示で ↑（=正しい）を押すと、初期角がそのまま絶対角になる', () => {
    // EXIF が正しい場合: 初期 = exifDegrees、↑ で確定 → exif と同じ絶対角に落ちる。
    expect(resolveRotationMode(exifDegrees(6), 'up')).toBe('90');
    expect(resolveRotationMode(exifDegrees(3), 'up')).toBe('180');
    expect(resolveRotationMode(exifDegrees(8), 'up')).toBe('270');
    expect(resolveRotationMode(exifDegrees(1), 'up')).toBe('none');
  });

  it('負値・360 超も 0/90/180/270 に正規化する', () => {
    expect(resolveRotationMode(270, 'right')).toBe('180'); // 270 + (-90) = 180
    expect(resolveRotationMode(0, 'right')).toBe('270'); // 0 + (-90) = -90 → 270
    expect(resolveRotationMode(270, 'down')).toBe('90'); // 270 + 180 = 450 → 90
  });
});
