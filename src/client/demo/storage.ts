export const DEMO_STORAGE_NAMESPACE = "tehnadzor-demo:v1:";

export interface StorageLike {
  readonly length: number;
  clear(): void;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface DemoStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  clearNamespace(): void;
  listKeys(): string[];
}

export function createDemoStorage(
  storage: StorageLike,
  namespace = DEMO_STORAGE_NAMESPACE
): DemoStorage {
  const scopedKey = (key: string) => `${namespace}${key}`;

  const listKeys = () => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(namespace)) keys.push(key);
    }
    return keys.sort();
  };

  return {
    get: (key) => storage.getItem(scopedKey(key)),
    set: (key, value) => storage.setItem(scopedKey(key), value),
    remove: (key) => storage.removeItem(scopedKey(key)),
    clearNamespace: () => {
      for (const key of listKeys()) storage.removeItem(key);
    },
    listKeys
  };
}
