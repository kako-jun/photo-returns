import { describe, it, expect } from 'vitest';
import { shouldShowFallback } from './imageFallback';

describe('shouldShowFallback', () => {
  it('まだ何も失敗していなければプレースホルダを出さない', () => {
    expect(shouldShowFallback('/a.heic', null)).toBe(false);
  });

  it('表示対象と同じ src が失敗していればプレースホルダを出す', () => {
    expect(shouldShowFallback('/a.heic', '/a.heic')).toBe(true);
  });

  it('別の src が過去に失敗していても、今の表示対象と違えばプレースホルダを出さない（M1回帰）', () => {
    // LightBox で HEIC(onError発火) → Next で正常な JPG へ移動した状況を模す。
    // 直接 DOM 操作版は failedSrc に相当する状態を持たず display:none を書き戻せなかったため
    // ここが壊れていた（#31 セルフレビュー M1）。
    expect(shouldShowFallback('/b.jpg', '/a.heic')).toBe(false);
  });

  it('失敗した src に戻ってくれば再びプレースホルダを出す', () => {
    expect(shouldShowFallback('/a.heic', '/a.heic')).toBe(true);
    // Prev で a に戻る → 同じ形式なのでまた失敗する想定 → 再度 fallback 表示が正しい
    expect(shouldShowFallback('/a.heic', '/a.heic')).toBe(true);
  });
});
