import { vi } from 'vitest'

/**
 * Minimal localStorage double for the vitest node environment, where web storage is unavailable and
 * every storage-layer call would silently degrade to its catch path.
 */
export function stubStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
}
