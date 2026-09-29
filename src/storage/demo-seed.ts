/**
 * Demo projects in the library: the first-launch seed (poster into an empty library, exactly once
 * per install) and on-demand materialization for the home screen's «Примеры» section. Demo ids are
 * stable (`demo.`-prefixed), so re-materializing an existing demo just opens what's already there.
 */

import { POSTER_DEMO, DEMO_PROJECT_NAME, type DemoDef } from '../engine/demo-project.ts'
import { renderThumbnailDataURL } from '../engine/png.ts'
import { deserialize, type ProjectJSON } from '../engine/project.ts'
import {
  listProjects,
  loadProject,
  rememberOpenedProject,
  saveProject,
  type ProjectEntry,
} from './projects.ts'

const SEED_KEY = 'glyph.demoSeeded'

function seeded(): boolean {
  try {
    return localStorage.getItem(SEED_KEY) === '1'
  } catch {
    return false
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_KEY, '1')
  } catch {
    /* ignore — without localStorage every boot just re-checks the library */
  }
}

/**
 * Put a demo into the library as a real project entry and return its id. Idempotent: when the entry
 * already exists (perhaps renamed by the user), nothing is overwritten. The thumbnail render is
 * best-effort (no canvas in tests/SSR) — placeholder cards are fine for demos.
 */
export async function materializeDemo(def: DemoDef, name: string): Promise<string> {
  const existing = await loadProject(def.id)
  if (existing) return def.id
  const content = def.build()
  const now = Date.now()
  const base = { id: def.id, name, createdAt: now, updatedAt: now, thumbnail: '' }
  let entry: ProjectEntry
  if (content.kind === 'pixel') {
    let thumbnail = ''
    try {
      thumbnail = renderThumbnailDataURL(deserialize(content.doc))
    } catch {
      /* rendering failed — the placeholder card is fine for a demo */
    }
    entry = { ...base, kind: 'pixel', thumbnail, doc: content.doc as ProjectJSON }
  } else if (content.kind === 'vector') {
    entry = {
      ...base,
      kind: 'vector',
      source: content.source,
      sourceName: content.sourceName,
      params: content.params,
      svg: null,
      stats: null,
    }
  } else {
    entry = {
      ...base,
      kind: 'gradient',
      source: content.source,
      sourceName: content.sourceName,
      params: content.params,
      svg: null,
      stats: null,
    }
  }
  await saveProject(entry)
  return def.id
}

/**
 * Seed the demo poster when the library is still empty; idempotent, safe to call on every boot.
 * Never touches a library that already has projects.
 */
export async function seedDemoProject(): Promise<void> {
  if (seeded()) return
  try {
    if ((await listProjects()).length > 0) return
    const id = await materializeDemo(POSTER_DEMO, DEMO_PROJECT_NAME)
    rememberOpenedProject(id)
  } finally {
    markSeeded()
  }
}
