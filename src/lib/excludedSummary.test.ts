import { describe, it, expect } from 'vitest';
import type { ExcludedSummary } from '../types';
import { excludedSummaryToLogEntries } from './excludedSummary';

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
    expect(entries.map((e) => e.timestamp)).toEqual([
      'RULE',
      'RULE',
      'SAMPLE',
      'SAMPLE',
      'SAMPLE',
    ]);
  });
});
