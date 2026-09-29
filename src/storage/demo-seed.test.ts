import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEMO_PROJECTS } from '../engine/demo-project.ts'
import type { ProjectJSON } from '../engine/project.ts'
import { materializeDemo, seedDemoProject } from './demo-seed.ts'
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

describe('seedDemoProject', () => {
  it('seeds the demo poster into an empty library and marks it Continue', async () => {
    await seedDemoProject()
    const list = await listProjects()
    expect(list).toHaveLength(1)
    expect(list[0]?.kind).toBe('pixel')
    expect(list[0]?.name).toBe('Ditherlab Demo')
    if (list[0]?.kind === 'pixel') {
      expect(list[0]!.doc.cols).toBe(200)
      expect(list[0]!.doc.layers?.length).toBe(4)
    }
    expect(lastOpenedProjectId()).toBe(list[0]?.id)
  })

  it('runs once: the marker suppresses re-seeding on the next boot', async () => {
    await seedDemoProject()
    // a library the marker considers seeded stays untouched even after wiping projects
    clearProjectsForTests()
    await seedDemoProject()
    expect(await listProjects()).toHaveLength(0)
  })

  it('never intrudes into a library that already has projects', async () => {
    await saveProject({
      id: 'p1',
      name: 'Mine',
      kind: 'pixel',
      createdAt: 1,
      updatedAt: 1,
      thumbnail: '',
      doc: { v: 3, cols: 8 } as unknown as ProjectJSON,
    })
    await seedDemoProject()
    const list = await listProjects()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Mine')
    expect(lastOpenedProjectId()).toBeNull()
  })
})

describe('materializeDemo', () => {
  it('creates a pixel entry under the stable demo id, localized name included', async () => {
    const def = DEMO_PROJECTS.find((d) => d.id === 'demo.mandala')!
    const id = await materializeDemo(def, 'Мандала · 128×128')
    expect(id).toBe('demo.mandala')
    const entry = await loadProject(id)
    expect(entry?.kind).toBe('pixel')
    expect(entry?.name).toBe('Мандала · 128×128')
  })

  it('is idempotent: an existing entry is never rebuilt or renamed', async () => {
    const def = DEMO_PROJECTS.find((d) => d.id === 'demo.mandala')!
    await materializeDemo(def, 'First')
    await saveProject({
      id: 'demo.mandala',
      name: 'Renamed by user',
      kind: 'pixel',
      createdAt: 1,
      updatedAt: 1,
      thumbnail: '',
      doc: { v: 3, cols: 8 } as unknown as ProjectJSON,
    })
    await materializeDemo(def, 'Second')
    expect((await loadProject('demo.mandala'))?.name).toBe('Renamed by user')
    expect(await listProjects()).toHaveLength(1)
  })

  it('materializes trace demos with their source raster and default params', async () => {
    for (const kind of ['demo.vector', 'demo.gradient'] as const) {
      const def = DEMO_PROJECTS.find((d) => d.id === kind)!
      await materializeDemo(def, kind)
      const entry = await loadProject(def.id)
      expect(entry?.kind, kind).toBe(kind.replace('demo.', ''))
      if (entry && entry.kind !== 'pixel') {
        expect(entry.source?.data.byteLength).toBe(128 * 128 * 4)
        expect(entry.svg).toBeNull()
        expect(entry.params).toBeTypeOf('object')
      }
    }
  })
})
