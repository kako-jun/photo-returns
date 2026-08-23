import { describe, it, expect } from 'vitest';
import type { ExcludedSummary } from '../types';
import { excludedSummaryToLogEntries, excludedSummaryFooterText } from './excludedSummary';

describe('excludedSummaryToLogEntries', () => {
  it('total=0, by_rule=[], samples=[] のときは空配列を返す', () => {
    const summary: ExcludedSummary = { total: 0, by_rule: [], samples: [] };
    expect(excludedSummaryToLogEntries(summary)).toEqual([]);
  });

  it('RULE_LABELS に無い未知の rule 文字列はフォールバックでそのまま出る', () => {
    const summary: ExcludedSummary = {
      total: 1,
      by_rule: [{ rule: 'future_rule', count: 1 }],
      samples: [],
    };
    const entries = excludedSummaryToLogEntries(summary);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('future_rule: 1');
  });

  it('by_rule 行が先、samples 行が後という順序が維持される', () => {
    const summary: ExcludedSummary = {
      total: 3,
      by_rule: [
        { rule: 'trashed', count: 2 },
        { rule: 'nomedia', count: 1 },
      ],
      samples: ['DCIM/.trashed-1.jpg', 'DCIM/.trashed-2.jpg', 'DCIM/.nomedia'],
    };
    const entries = excludedSummaryToLogEntries(summary);
    expect(entries.map((e) => e.timestamp)).toEqual(['RULE', 'RULE', 'SAMPLE', 'SAMPLE', 'SAMPLE']);
  });
});

describe('excludedSummaryFooterText', () => {
  it('samples が total と同数（20件以下）のときは "SHOWING ALL N EXCLUDED FILES" を返す', () => {
    const summary: ExcludedSummary = {
      total: 3,
      by_rule: [{ rule: 'trashed', count: 3 }],
      samples: ['a', 'b', 'c'],
    };
    expect(excludedSummaryFooterText(summary)).toBe('SHOWING ALL 3 EXCLUDED FILES');
  });

  it('total が1件のときは単数形 FILE になる', () => {
    const summary: ExcludedSummary = {
      total: 1,
      by_rule: [{ rule: 'nomedia', count: 1 }],
      samples: ['DCIM/.nomedia'],
    };
    expect(excludedSummaryFooterText(summary)).toBe('SHOWING ALL 1 EXCLUDED FILE');
  });

  it('samples が20件で頭打ちになり total がそれを超えるときは "SHOWING 20 OF N" になる', () => {
    const summary: ExcludedSummary = {
      total: 142,
      by_rule: [{ rule: 'thumbnails', count: 142 }],
      samples: Array.from({ length: 20 }, (_, i) => `DCIM/.thumbnails/img${i}.jpg`),
    };
    expect(excludedSummaryFooterText(summary)).toBe('SHOWING 20 OF 142 EXCLUDED FILES');
  });
});
