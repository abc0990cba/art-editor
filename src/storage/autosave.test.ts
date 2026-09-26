import { describe, expect, it } from 'vitest'

import { loadAutosave, saveAutosave } from './autosave.ts'

// In the vitest node environment there is no indexedDB: openDb() resolves null and the module
// degrades to the no-storage fallback, exactly like the memory-only browser path.
describe('autosave store (no IndexedDB available)', () => {
  it('reports failure on save and null on load', async () => {
    await expect(saveAutosave('{"v":3}')).resolves.toBe(false)
    await expect(loadAutosave()).resolves.toBeNull()
  })
})
