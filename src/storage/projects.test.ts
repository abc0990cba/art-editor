import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearProjectsForTests,
  deleteProject,
  duplicateName,
  lastOpenedProjectId,
  listProjects,
  loadProject,
  newProjectId,
  normalizeName,
  normalizeProject,
  rememberOpenedProject,
  saveProject,
  sortEntries,
  type PixelProjectEntry,
  type ProjectEntry,
} from './projects.ts'
import { stubStorage } from './test-storage.util.ts'

function entry(id: string, name: string, updatedAt: number): PixelProjectEntry {
  return {
    id,
    name,
    kind: 'pixel',
    createdAt: updatedAt,
    updatedAt,
    thumbnail: '',
    doc: {
      v: 3,
      cols: 4,
      rows: 4,
      sub: 1,
      radialEven: false,
      cells: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      links: [],
      palette: ['#111111'],
      style: {
        radius: 0.3,
        corners: { tl: null, tr: null, br: null, bl: null },
        sizeX: 1,
        sizeY: 1,
        convexRadius: 0.3,
        concaveRadius: 0.2,
        cornerStyle: 'arc',
        squareEdges: false,
      },
      gridType: 'square',
      renderMode: 'pixels',
      connectivity: 'edge',
      metaball: { strength: 40, perColor: true, quality: 4, squareEdges: false },
      texture: {
        effect: 'none',
        amount: 40,
        scale: 1,
        sizeMin: 0.12,
        sizeMax: 0.35,
        shape: 'square',
        edge: 100,
        dist: 'scatter',
        gap: 0,
        angle: 45,
        seed: 1,
        jitter: 0,
        variation: 0,
        wobble: 0,
        merge: 0,
        dropout: 0,
        spray: 0,
        ramp: 0,
      },
      bg: '',
      connectorWidth: 0.3,
    },
  }
}

describe('normalizeProject', () => {
  it('accepts typed pixel and vector entries', () => {
    const pixel = normalizeProject(entry('p1', 'One', 100))
    expect(pixel?.kind).toBe('pixel')
    const vector = normalizeProject({
      id: 'v1',
      name: 'Trace',
      kind: 'vector',
      createdAt: 1,
      updatedAt: 2,
      thumbnail: '',
      source: { width: 2, height: 2, data: new ArrayBuffer(16) },
      sourceName: 'a.png',
      params: { processor: 'photo' },
      svg: '<svg/>',
      stats: { clusters: 1 },
    })
    expect(vector?.kind).toBe('vector')
    if (vector?.kind === 'vector') {
      expect(vector.svg).toBe('<svg/>')
      expect(vector.source?.width).toBe(2)
    }
  })

  it('upgrades kind-less legacy records to pixel entries', () => {
    const legacy = entry('old', 'Legacy', 100)
    const raw = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>
    delete raw['kind']
    const normalized = normalizeProject(raw)
    expect(normalized?.kind).toBe('pixel')
    if (normalized?.kind === 'pixel') expect(normalized.doc.cols).toBe(4)
  })

  it('rejects records without id or document, and degrades broken vector sources', () => {
    expect(normalizeProject({ name: 'no id' })).toBeNull()
    const noDoc = entry('p', 'P', 1)
    const raw = JSON.parse(JSON.stringify(noDoc)) as Record<string, unknown>
    delete raw['doc']
    expect(normalizeProject(raw)).toBeNull()
    // a corrupt source degrades to "awaits import" instead of dropping the project
    const broken = normalizeProject({
      id: 'v',
      kind: 'vector',
      source: { width: 2, height: 2, data: new ArrayBuffer(3) },
    })
    expect(broken?.kind).toBe('vector')
    if (broken?.kind === 'vector') expect(broken.source).toBeNull()
    expect(normalizeProject('junk')).toBeNull()
  })
})

describe('project storage helpers', () => {
  it('sortEntries orders newest first', () => {
    const sorted = sortEntries([entry('a', 'A', 100), entry('b', 'B', 300), entry('c', 'C', 200)])
    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('normalizeName trims, collapses whitespace, caps length', () => {
    expect(normalizeName('  My   Project ')).toBe('My Project')
    expect(normalizeName('')).toBe('Untitled')
    expect(normalizeName('x'.repeat(60)).length).toBeLessThanOrEqual(40)
    expect(normalizeName('x'.repeat(60)).endsWith('…')).toBe(true)
  })

  it('duplicateName disambiguates copies', () => {
    expect(duplicateName('Sketch', [])).toBe('Sketch')
    expect(duplicateName('Sketch', ['Sketch'])).toBe('Sketch copy')
    expect(duplicateName('Sketch', ['Sketch', 'Sketch copy', 'Sketch copy 2'])).toBe(
      'Sketch copy 3',
    )
  })

  it('newProjectId returns unique ids', () => {
    expect(newProjectId()).not.toBe(newProjectId())
  })

  it('rememberOpenedProject keeps the last id', () => {
    stubStorage()
    expect(lastOpenedProjectId()).toBeNull()
    rememberOpenedProject('abc')
    expect(lastOpenedProjectId()).toBe('abc')
    rememberOpenedProject('def')
    expect(lastOpenedProjectId()).toBe('def')
  })
})

describe('project store (in-memory fallback)', () => {
  beforeEach(() => clearProjectsForTests())

  it('save/list/load/delete round trip', async () => {
    await saveProject(entry('p1', 'One', 100))
    await saveProject(entry('p2', 'Two', 200))
    const list = await listProjects()
    expect(list.map((e) => e.id)).toEqual(['p2', 'p1'])
    const loaded = await loadProject('p1')
    expect(loaded?.name).toBe('One')
    expect(loaded?.kind).toBe('pixel')
    if (loaded?.kind === 'pixel') expect(loaded.doc.cells?.[1]).toBe(1)
    await deleteProject('p1')
    expect(await loadProject('p1')).toBeUndefined()
    expect((await listProjects()).length).toBe(1)
  })

  it('saveProject overwrites an existing id', async () => {
    await saveProject(entry('same', 'Old', 100))
    await saveProject(entry('same', 'New', 200))
    const list: ProjectEntry[] = await listProjects()
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('New')
  })
})
