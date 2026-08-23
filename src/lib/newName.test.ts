import { describe, it, expect } from 'vitest';
import type { MediaInfo } from '../types';
import { calculateNewName } from './newName';

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
    resolved_provenance_tag: null,
    date_source: 'None',
    exif_orientation: null,
    rotation_applied: false,
    width: null,
    height: null,
    logs: [],
    ...over,
  };
}

describe('calculateNewName', () => {
  it('date_taken が無ければ unknown_date を返す', () => {
    expect(calculateNewName(media('/in/IMG_0001.jpg'))).toBe('unknown_date');
  });

  it('日付のみ（burst/tag 無し）は日時 stem + 拡張子', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15.jpg');
  });

  it('subsec_time があればミリ秒3桁を付与する', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      subsec_time: 250,
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15-250.jpg');
  });

  it('burst_index はゼロ埋め2桁で日時の後に付与する', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      burst_index: 1,
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15_01.jpg');
  });

  it('resolved_provenance_tag は末尾（burst の後）に付与する', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      resolved_provenance_tag: 'takeout',
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15_takeout.jpg');
  });

  it('burst_index と resolved_provenance_tag は 日時→burst→tag の順で両方付与する', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      burst_index: 2,
      resolved_provenance_tag: 'line',
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15_02_line.jpg');
  });

  it('日時+ミリ秒+burst+tag が全部揃っても同じ順で連結する（backend build_stem と対応）', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      subsec_time: 5,
      burst_index: 3,
      resolved_provenance_tag: 'line',
    });
    expect(calculateNewName(m)).toBe('2025-04-22_20-59-15-005_03_line.jpg');
  });

  it('拡張子はファイル名から取り、空文字なら jpg にフォールバックする', () => {
    const m = media('/in/clip.mov', {
      date_taken: '2025-01-01T00:00:00',
    });
    expect(calculateNewName(m)).toBe('2025-01-01_00-00-00.mov');

    // file_name が空文字（split('.').pop() が '' で falsy になるケース）だけが
    // フォールバック対象。ドット無しファイル名（"noext" 等）は split('.').pop() が
    // ファイル名そのものを返す（既存挙動、#29 の対象外）。
    const emptyName = media('', {
      date_taken: '2025-01-01T00:00:00',
      file_name: '',
    });
    expect(calculateNewName(emptyName)).toBe('2025-01-01_00-00-00.jpg');
  });

  it('timezone_offset の明示指定（+/-）は日時に反映される', () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      timezone_offset: '+09:00',
    });
    expect(calculateNewName(m)).toBe('2025-04-23_05-59-15.jpg');
  });

  it("timezone_offset='exif' は media.timezone を使う", () => {
    const m = media('/in/IMG_0001.jpg', {
      date_taken: '2025-04-22T20:59:15',
      timezone_offset: 'exif',
      timezone: '-05:00',
    });
    expect(calculateNewName(m)).toBe('2025-04-22_15-59-15.jpg');
  });
});
