import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearProjectsForTests,
  deleteProject,
  duplicateName,
  listProjects,
  loadProject,
  newProjectId,
  normalizeName,
  saveProject,
  sortEntries,
  type ProjectEntry,
} from './projects'

function entry(id: string, name: string, updatedAt: number): ProjectEntry {
  return {
    id,
    name,
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
    expect(loaded?.doc.cells?.[1]).toBe(1)
    await deleteProject('p1')
    expect(await loadProject('p1')).toBeUndefined()
    expect((await listProjects()).length).toBe(1)
  })

  it('saveProject overwrites an existing id', async () => {
    await saveProject(entry('same', 'Old', 100))
    await saveProject(entry('same', 'New', 200))
    const list = await listProjects()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('New')
  })
})
