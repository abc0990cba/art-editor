import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectJSON } from '../engine/project.ts'
import { migrateLegacySession } from './migrate.ts'
import {
  clearProjectsForTests,
  lastOpenedProjectId,
  listProjects,
  loadProject,
  saveProject,
} from './projects.ts'

/** Minimal localStorage double: the vitest node environment has no web storage to stub against. */
function stubStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
}

beforeEach(() => {
  stubStorage()
  clearProjectsForTests()
})
afterEach(() => vi.unstubAllGlobals())

/** A minimal (invalid but shaped) serialized doc — storage only persists it verbatim. */
const doc = (cols: number): ProjectJSON => ({ v: 3, cols }) as unknown as ProjectJSON

describe('migrateLegacySession', () => {
  it('runs only once: the marker suppresses re-claiming on the next boot', async () => {
    localStorage.setItem('glyph.doc', JSON.stringify(doc(8)))
    await migrateLegacySession()
    expect(await listProjects()).toHaveLength(1)
    await migrateLegacySession()
    expect(await listProjects()).toHaveLength(1)
  })

  it('claims a legacy draft as a fresh Untitled pixel project and marks it Continue', async () => {
    localStorage.setItem('glyph.doc', JSON.stringify(doc(8)))
    await migrateLegacySession()
    const list = await listProjects()
    expect(list).toHaveLength(1)
    expect(list[0]?.kind).toBe('pixel')
    expect(list[0]?.name).toBe('Untitled')
    if (list[0]?.kind === 'pixel') expect(list[0]!.doc).toEqual(doc(8))
    expect(lastOpenedProjectId()).toBe(list[0]?.id)
  })

  it('writes a legacy draft into the bound pixel entry instead of duplicating it', async () => {
    await saveProject({
      id: 'p1',
      name: 'Mine',
      kind: 'pixel',
      createdAt: 1,
      updatedAt: 1,
      thumbnail: '',
      doc: doc(4),
    })
    localStorage.setItem('glyph.doc', JSON.stringify(doc(9)))
    localStorage.setItem('glyph.projectId', 'p1')
    await migrateLegacySession()
    const list = await listProjects()
    expect(list).toHaveLength(1)
    if (list[0]?.kind === 'pixel') expect(list[0].doc).toEqual(doc(9))
    expect(list[0]?.name).toBe('Mine')
    expect(lastOpenedProjectId()).toBe('p1')
  })

  it('creates a draft when the bound entry is not a pixel project', async () => {
    await saveProject({
      id: 'v1',
      name: 'Trace',
      kind: 'vector',
      createdAt: 1,
      updatedAt: 1,
      thumbnail: '',
      source: null,
      sourceName: '',
      params: null,
      svg: null,
      stats: null,
    })
    localStorage.setItem('glyph.doc', JSON.stringify(doc(4)))
    localStorage.setItem('glyph.projectId', 'v1')
    await migrateLegacySession()
    const list = await listProjects()
    expect(list).toHaveLength(2)
    expect((await loadProject('v1'))?.kind).toBe('vector')
    expect(lastOpenedProjectId()).not.toBe('v1')
  })

  it('drops the dead glyph.mode preference and no-ops without a draft', async () => {
    localStorage.setItem('glyph.mode', 'vector')
    await migrateLegacySession()
    expect(localStorage.getItem('glyph.mode')).toBeNull()
    expect(await listProjects()).toHaveLength(0)
  })

  it('ignores a corrupted autosave payload', async () => {
    localStorage.setItem('glyph.doc', 'not json')
    await migrateLegacySession()
    expect(await listProjects()).toHaveLength(0)
  })
})
