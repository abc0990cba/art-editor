import { describe, expect, it } from 'vitest'

import type { Doc } from '../../engine/core/doc.ts'
import type { SceneGroup, SceneLayer, SceneObj } from '../../engine/core/scene.ts'
import { groupAncestorOf, objIdsWithin } from '../../engine/core/scene.ts'
import { clickSelectionIds } from './select-hit.util.ts'

function obj(id: number): SceneObj {
  return {
    kind: 'obj',
    id,
    name: '',
    visible: true,
    locked: false,
    style: {} as SceneObj['style'],
    cells: new Map(),
    links: [],
  }
}

function group(id: number, children: SceneObj[], nested?: SceneGroup): SceneGroup {
  const kids: (SceneObj | SceneGroup)[] = nested ? [...children, nested] : [...children]
  return { kind: 'group', id, name: '', visible: true, locked: false, children: kids }
}

function docWith(layers: SceneLayer[] | null): Doc {
  return { layers } as unknown as Doc
}

describe('groupAncestorOf', () => {
  const inner = group(20, [obj(3), obj(4)])
  const outer = group(10, [obj(1), obj(2)], inner)
  const layers: SceneLayer[] = [
    { kind: 'layer', id: 100, name: '', visible: true, locked: false, children: [outer, obj(5)] },
  ]

  it('resolves the outermost group for a deeply nested object', () => {
    expect(groupAncestorOf(layers, 3)?.id).toBe(10)
    expect(groupAncestorOf(layers, 2)?.id).toBe(10)
  })

  it('returns null for objects sitting directly in a layer', () => {
    expect(groupAncestorOf(layers, 5)).toBeNull()
  })

  it('returns null for unknown ids', () => {
    expect(groupAncestorOf(layers, 99)).toBeNull()
  })
})

describe('objIdsWithin', () => {
  it('collects every object id of the subtree in tree order', () => {
    const g = group(10, [obj(1)], group(20, [obj(2), obj(3)]))
    expect(objIdsWithin(g)).toEqual([1, 2, 3])
  })
})

describe('clickSelectionIds', () => {
  const inner = group(20, [obj(3)])
  const outer = group(10, [obj(1)], inner)
  const layers: SceneLayer[] = [
    { kind: 'layer', id: 100, name: '', visible: true, locked: false, children: [outer, obj(5)] },
  ]

  it('a click inside a group selects the whole outermost group', () => {
    expect(clickSelectionIds(docWith(layers), 3)).toEqual([1, 3])
  })

  it('a click on a layer-level object selects just that object', () => {
    expect(clickSelectionIds(docWith(layers), 5)).toEqual([5])
  })

  it('flat legacy docs select the bare object', () => {
    expect(clickSelectionIds(docWith(null), 7)).toEqual([7])
  })
})
