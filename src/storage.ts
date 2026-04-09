/**
 * localStorage ユーティリティ
 *
 * すべての設定を "photo-returns" という単一キーの JSON オブジェクトに格納する。
 */

const STORAGE_KEY = 'photo-returns';

export interface StorageData {
  theme?: 'dark' | 'light';
  inputDir?: string;
  outputDir?: string;
}

/** localStorage から全データを読み込む */
export function loadStorage(): StorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StorageData;
  } catch {
    return {};
  }
}

/** localStorage に全データを書き込む（マージ） */
export function saveStorage(partial: Partial<StorageData>): void {
  try {
    const current = loadStorage();
    const merged = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

/** 個別の値を取得するヘルパー */
export function getStorageValue<K extends keyof StorageData>(key: K): StorageData[K] {
  return loadStorage()[key];
}
