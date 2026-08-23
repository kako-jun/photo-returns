import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStorageValue, loadStorage, saveStorage } from './storage';

/**
 * テスト用の最小 in-memory localStorage 実装。
 *
 * このプロジェクトの vitest は jsdom を使わず node 環境で動くため、`localStorage` は
 * グローバルに存在しない（`typeof localStorage === 'undefined'`）。storage.ts の
 * try/catch 経由でしか動作確認できず、由来タグ（#29）の永続化を検証できないため、
 * `vi.stubGlobal` で最小の Storage 実装を差し込む。
 */
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('provenanceTag / provenanceFromFolder の永続化（#29）', () => {
  it('provenanceTag を保存すると loadStorage で読み戻せる', () => {
    saveStorage({ provenanceTag: 'takeout' });
    expect(loadStorage().provenanceTag).toBe('takeout');
  });

  it('provenanceFromFolder(true) を保存すると getStorageValue で読み戻せる', () => {
    saveStorage({ provenanceFromFolder: true });
    expect(getStorageValue('provenanceFromFolder')).toBe(true);
  });

  it('provenanceFromFolder(false) は falsy値でも取りこぼさず保存される', () => {
    // いったん true にしてから false で上書きし、「未設定に戻った」のではなく
    // 「明示的に false が保存された」ことを区別して確認する。
    saveStorage({ provenanceFromFolder: true });
    saveStorage({ provenanceFromFolder: false });
    expect(getStorageValue('provenanceFromFolder')).toBe(false);
  });

  it('provenanceTag/provenanceFromFolder の保存は他の既存キーを上書きしない', () => {
    saveStorage({ inputDir: '/in', outputDir: '/out' });
    saveStorage({ provenanceTag: 'line', provenanceFromFolder: true });
    const data = loadStorage();
    expect(data.inputDir).toBe('/in');
    expect(data.outputDir).toBe('/out');
    expect(data.provenanceTag).toBe('line');
    expect(data.provenanceFromFolder).toBe(true);
  });

  it('未保存なら provenanceTag/provenanceFromFolder は undefined', () => {
    expect(getStorageValue('provenanceTag')).toBeUndefined();
    expect(getStorageValue('provenanceFromFolder')).toBeUndefined();
  });
});
