import { beforeEach, describe, expect, it } from 'vitest'

import { defaultDoc } from '../engine/doc.ts'
import { BUILT_IN_GLYPH_SETS } from '../engine/glyph-builtins.ts'
import { ensureScene } from '../engine/scene.ts'
import { useStore } from './editor.store'

const state = () => useStore.getState()

describe('project dirty state (ambient autosave)', () => {
  beforeEach(() => {
    useStore.setState({
      doc: ensureScene(defaultDoc()),
      selection: [],
      activeLayerId: null,
      projectId: null,
      savedDoc: null,
      boundEntry: null,
      projectDirty: true,
    })
  })

  it('starts dirty without a bound project; explicit save point marks it clean', () => {
    expect(state().projectDirty).toBe(true)
    state().markProjectSaved()
    expect(state().projectDirty).toBe(false)
  })

  it('any document change flips the project back to dirty', () => {
    state().markProjectSaved()
    expect(state().projectDirty).toBe(false)
    state().paintCells(new Map([[0, 1]]), '#ff0000')
    expect(state().projectDirty).toBe(true)
  })

  it('detaching from a project means unsaved work', () => {
    state().markProjectSaved()
    state().detachProject()
    expect(state().projectDirty).toBe(true)
  })

  it('clear also dirties the project', () => {
    state().markProjectSaved()
    state().clear()
    expect(state().projectDirty).toBe(true)
  })
})

describe('forms-family glyph apply pairs the cell form', () => {
  beforeEach(() => {
    useStore.setState({ doc: ensureScene(defaultDoc()) })
  })

  it('applying «Кольцо» by id switches the pixel form to ring', () => {
    const entry = BUILT_IN_GLYPH_SETS.find((b) => b.id === 'glyph-form-ring12')!
    state().applyGlyphSet(entry.id, entry.set)
    expect(state().glyphDraft.name).toBe('Кольцо')
    expect(state().doc.style.shape).toBe('ring')
  })

  it('the gallery path passes builtin sets without an id — identity still pairs', () => {
    const entry = BUILT_IN_GLYPH_SETS.find((b) => b.id === 'glyph-form-heart12')!
    state().applyGlyphSet(null, entry.set)
    expect(state().doc.style.shape).toBe('heart')
  })

  it('non-form glyphs never touch the pixel style', () => {
    const bayer = BUILT_IN_GLYPH_SETS.find((b) => b.id === 'glyph-bayer8')!
    state().applyGlyphSet(null, bayer.set)
    expect(state().doc.style.shape).toBe('square')
  })
})
