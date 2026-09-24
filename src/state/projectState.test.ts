import { beforeEach, describe, expect, it } from 'vitest'

import { defaultDoc } from '../engine/doc'
import { ensureScene } from '../engine/scene'
import { useStore } from './store'

const state = () => useStore.getState()

describe('project save state (top-bar Save button)', () => {
  beforeEach(() => {
    useStore.setState({
      doc: ensureScene(defaultDoc()),
      selection: [],
      activeLayerId: null,
      projectId: null,
      savedDoc: null,
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
    // restyling without touching the doc (palette only) does not re-dirty it
    expect(state().projectDirty).toBe(true)
  })

  it('detaching from a project (null id) means unsaved work', () => {
    state().markProjectSaved()
    state().setCurrentProject(null, 'test')
    expect(state().projectDirty).toBe(true)
  })

  it('clear also dirties the project', () => {
    state().markProjectSaved()
    state().clear()
    expect(state().projectDirty).toBe(true)
  })
})
