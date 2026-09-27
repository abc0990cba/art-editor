import { beforeEach, describe, expect, it } from 'vitest'

import { defaultDoc } from '../engine/doc.ts'
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
