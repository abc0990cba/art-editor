/**
 * Bounded LRU of emitted region texture fragments. The scan is pure and seeded, so the exact same
 * (settings, palette value, region content) always emits the exact same path string — a cache hit
 * replaces the whole lattice scan + fleck emission with a string return. This is what keeps texture
 * rebuilds off the hot path for commits, undos, zooms and unrelated edits that re-run
 * `buildGeometry` on a doc whose texture did not change.
 *
 * Budget: total cached characters (path strings dominate; 8 M chars ≈ several full-canvas regions
 * or thousands of small ones). Eviction is insertion-order LRU with touch-on-read.
 */

const MAX_CHARS = 8_000_000

const store = new Map<string, string>()
let total = 0

/** Touch and return the cached fragment, or undefined. */
export function cachedFragments(key: string): string | undefined {
  const hit = store.get(key)
  if (hit === undefined) return undefined
  store.delete(key)
  store.set(key, hit)
  return hit
}

/** Insert a fragment, evicting least-recently-used entries while over budget. */
export function storeFragments(key: string, frag: string): void {
  if (frag.length > MAX_CHARS || store.has(key)) return
  store.set(key, frag)
  total += frag.length
  while (total > MAX_CHARS) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    const old = store.get(oldest)
    total -= old === undefined ? 0 : old.length
    store.delete(oldest)
  }
}
