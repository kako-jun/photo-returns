import { describe, it, expect } from 'vitest';
import type { MediaInfo, LogEntry, ProgressEvent } from '../types';
import {
  mergeProcessResults,
  normalizePathForCompare,
  selectRetryTargets,
  progressPercent,
  applyProgressEvent,
  markTargetsProcessing,
} from './processResults';

const log = (message: string): LogEntry => ({
  timestamp: '2026-01-01T00:00:00Z',
  level: 'Info',
  message,
});

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

describe('normalizePathForCompare', () => {
  it('Windows の \\ を / に統一する', () => {
    expect(normalizePathForCompare('C:\\photos\\a.jpg')).toBe('C:/photos/a.jpg');
  });
});

describe('selectRetryTargets', () => {
  it('status==="error" の項目だけ返す', () => {
    const list = [
      media('/a.jpg', { status: 'completed' }),
      media('/b.jpg', { status: 'error' }),
      media('/c.jpg', { status: 'pending' }),
      media('/d.jpg', { status: 'error' }),
    ];
    expect(selectRetryTargets(list).map((m) => m.original_path)).toEqual(['/b.jpg', '/d.jpg']);
  });
});

describe('mergeProcessResults', () => {
  it('対象外（完了済み）の項目は一切触らない＝リトライで再処理・誤error化しない', () => {
    const completed = media('/done.jpg', {
      status: 'completed',
      new_path: '/out/2026/done.jpg',
      logs: [log('done earlier')],
    });
    const failed = media('/fail.jpg', { status: 'pending' });
    const full = [completed, failed];

    // リトライ: 失敗ファイルのみを対象に送る
    const targets = [failed];
    // バックエンドは対象分のみ返す（完了済みは含まれない）
    const resultMedia = [
      media('/fail.jpg', { new_path: '/out/2026/fail.jpg', logs: [log('retried ok')] }),
    ];

    const merged = mergeProcessResults(full, targets, resultMedia);

    // 完了済みは参照ごと不変
    expect(merged[0]).toBe(completed);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].new_path).toBe('/out/2026/done.jpg');

    // 失敗ファイルは完了に更新され、ログも取り込まれる
    expect(merged[1].status).toBe('completed');
    expect(merged[1].new_path).toBe('/out/2026/fail.jpg');
    expect(merged[1].logs.map((l) => l.message)).toContain('retried ok');
  });

  it('対象だが結果に無い項目は error 扱い・progress は 0', () => {
    const item = media('/x.jpg', { status: 'pending', progress: 0 });
    const merged = mergeProcessResults([item], [item], []);
    expect(merged[0].status).toBe('error');
    expect(merged[0].new_path).toBe('');
    expect(merged[0].progress).toBe(0); // 失敗なのに100%にしない
  });

  it('targets が空なら全項目を参照ごと据え置く（初回スキャン直後など）', () => {
    const a = media('/a.jpg', { status: 'completed', new_path: '/out/a.jpg' });
    const b = media('/b.jpg', { status: 'error' });
    const merged = mergeProcessResults([a, b], [], []);
    expect(merged[0]).toBe(a);
    expect(merged[1]).toBe(b);
  });

  it('no_change の項目は targets 外なら触らない（誤 error 化しない）', () => {
    const noChange = media('/keep.jpg', { status: 'no_change', new_path: '' });
    const failed = media('/fail.jpg', { status: 'pending' });
    const merged = mergeProcessResults(
      [noChange, failed],
      [failed],
      [media('/fail.jpg', { new_path: '/out/fail.jpg' })]
    );
    expect(merged[0]).toBe(noChange); // no_change は据え置き
    expect(merged[0].status).toBe('no_change');
    expect(merged[1].status).toBe('completed');
  });

  it('プラットフォーム差のあるパスでも一致させる', () => {
    const item = media('C:\\photos\\x.jpg', { status: 'pending' });
    const resultMedia = [media('C:/photos/x.jpg', { new_path: 'C:/out/x.jpg' })];
    const merged = mergeProcessResults([item], [item], resultMedia);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].new_path).toBe('C:/out/x.jpg');
  });
});

describe('progressPercent', () => {
  it('done/total を 0-100 整数で返し、端数は切り捨てる', () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(4, 4)).toBe(100);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(66);
  });

  it('total<=0 は完了扱いで 100、done>total は 100 に丸める', () => {
    expect(progressPercent(0, 0)).toBe(100);
    expect(progressPercent(3, 0)).toBe(100);
    expect(progressPercent(5, 4)).toBe(100);
  });

  it('バックエンド progress_percent と同じ値（同式）', () => {
    // Rust 側 progress_percent と一致することを代表点で固定
    for (const [d, t, p] of [
      [0, 4, 0],
      [2, 4, 50],
      [1, 3, 33],
      [2, 3, 66],
    ] as const) {
      expect(progressPercent(d, t)).toBe(p);
    }
  });
});

describe('applyProgressEvent', () => {
  const ev = (path: string, status: 'completed' | 'error', done = 1, total = 1): ProgressEvent => ({
    done,
    total,
    path,
    status,
  });

  it('completed イベントで該当行を completed/progress=100 にする', () => {
    const a = media('/a.jpg', { status: 'processing', progress: 0 });
    const b = media('/b.jpg', { status: 'processing', progress: 0 });
    const next = applyProgressEvent([a, b], ev('/a.jpg', 'completed'));
    expect(next[0].status).toBe('completed');
    expect(next[0].progress).toBe(100);
    // 他の行は参照ごと不変
    expect(next[1]).toBe(b);
  });

  it('error イベントで該当行を error/progress=0 にする（失敗で100%にしない）', () => {
    const a = media('/a.jpg', { status: 'processing', progress: 0 });
    const next = applyProgressEvent([a], ev('/a.jpg', 'error'));
    expect(next[0].status).toBe('error');
    expect(next[0].progress).toBe(0);
  });

  it('一致行が無ければ配列を参照ごと据え置く（無駄な再レンダー回避）', () => {
    const list = [media('/a.jpg', { status: 'processing' })];
    const next = applyProgressEvent(list, ev('/zzz.jpg', 'completed'));
    expect(next).toBe(list);
  });

  it('プラットフォーム差のあるパスでも一致させる', () => {
    const a = media('C:\\photos\\x.jpg', { status: 'processing' });
    const next = applyProgressEvent([a], ev('C:/photos/x.jpg', 'completed'));
    expect(next[0].status).toBe('completed');
  });

  it('new_path / logs は触らない（ライブ表示のみ。最終確定は merge が担う）', () => {
    const a = media('/a.jpg', { status: 'processing', new_path: '', logs: [log('scan')] });
    const next = applyProgressEvent([a], ev('/a.jpg', 'completed'));
    expect(next[0].new_path).toBe('');
    expect(next[0].logs.map((l) => l.message)).toEqual(['scan']);
  });
});

describe('markTargetsProcessing', () => {
  it('対象行のみ processing/progress=0 にし、対象外は参照ごと据え置く', () => {
    const a = media('/a.jpg', { status: 'completed', progress: 100, new_path: '/out/a.jpg' });
    const b = media('/b.jpg', { status: 'error', progress: 0 });
    const c = media('/c.jpg', { status: 'pending' });
    const next = markTargetsProcessing([a, b, c], [b]);
    // 対象外は不変参照
    expect(next[0]).toBe(a);
    expect(next[2]).toBe(c);
    // 対象は processing にリセット
    expect(next[1].status).toBe('processing');
    expect(next[1].progress).toBe(0);
  });

  it('対象が空なら全行を参照ごと据え置く', () => {
    const a = media('/a.jpg', { status: 'completed' });
    const next = markTargetsProcessing([a], []);
    expect(next[0]).toBe(a);
  });
});
