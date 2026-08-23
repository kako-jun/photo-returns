// scan_media で除外されたシステム生成物（#28）の表示補助。
//
// `ExcludedSummary` は「件数の器」であって表示用の文字列ではないため、既存の
// `LogViewer`（`LogEntry[]` を受けてモーダル表示するだけの汎用コンポーネント）に
// そのまま渡せるよう `LogEntry[]` へ写像する。新規UIは作らず既存部品を再利用する。

import type { ExcludedSummary, LogEntry } from '../types';

/** Rust 側 `ExcludeRule::name()` の識別子 → 人間向けラベル。順序は仕様の表と対応。 */
const RULE_LABELS: Record<string, string> = {
  trashed: 'Android trashed (.trashed-*)',
  thumbnails: 'Thumbnails (.thumbnails/)',
  nomedia: 'Media scan marker (.nomedia)',
  apple_double: 'AppleDouble (._*)',
  os_metadata: 'OS metadata (.DS_Store / Thumbs.db)',
};

/** 未知のルール名が来た場合のフォールバック（表示は落とさない）。 */
function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule;
}

/**
 * 除外サマリを `LogViewer` にそのまま渡せる `LogEntry[]` に写す。
 * 先にルール別件数（`timestamp: 'RULE'`）、続けてサンプルパス（`timestamp: 'SAMPLE'`）を
 * 並べる。`LogViewer` は timestamp を単なるラベル欄として表示するだけなので、
 * ここで擬似的な見出し列として使う。
 */
export function excludedSummaryToLogEntries(summary: ExcludedSummary): LogEntry[] {
  const ruleEntries: LogEntry[] = summary.by_rule.map((rc) => ({
    timestamp: 'RULE',
    level: 'Warning',
    message: `${ruleLabel(rc.rule)}: ${rc.count}`,
  }));

  const sampleEntries: LogEntry[] = summary.samples.map((path) => ({
    timestamp: 'SAMPLE',
    level: 'Info',
    message: path,
  }));

  return [...ruleEntries, ...sampleEntries];
}
