import { describe, it, expect } from 'vitest';
import type { MediaInfo } from '../types';
import {
  isMirrorOrientation,
  exifDegrees,
  selectOrientationQueue,
  directionDelta,
  resolveRotationMode,
  type OrientationDirection,
} from './orientationQueue';

/** テスト用に MediaInfo を最小フィールドで組み立てる。 */
function media(path: string, over: Partial<MediaInfo> = {}): MediaInfo {
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
    date_source: 'None',
    exif_orientation: null,
    rotation_applied: false,
    width: null,
    height: null,
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

describe('selectOrientationQueue', () => {
  it('写真 かつ Orientation≠1 かつ 非ミラー だけを残す', () => {
    const list = [
      media('/a.jpg', { exif_orientation: 6 }), // ○ 写真・回転あり
      media('/b.jpg', { exif_orientation: 1 }), // × 直立（手動 dropdown に任せる）
      media('/c.jpg', { exif_orientation: null }), // × Orientation 不明
      media('/d.jpg', { exif_orientation: 2 }), // × ミラー
      media('/e.jpg', { exif_orientation: 7 }), // × ミラー
      media('/f.mp4', { media_type: 'Video', exif_orientation: 6 }), // × 動画は対象外
      media('/g.jpg', { exif_orientation: 3 }), // ○
      media('/h.jpg', { exif_orientation: 8 }), // ○
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
