/**
 * The demo project registry: ready-made examples the home screen offers in its «Примеры» section.
 * Each def has a stable id (the library entry id, `demo.`-prefixed) and a lazy build, so nothing is
 * computed until a thumbnail or an open click needs it. Poster seeding on first launch lives in
 * storage/demo-seed.ts and reuses the `demo.poster` def.
 */

import { invaderProjectJSON } from './demo-invader.ts'
import { landscapeProjectJSON } from './demo-landscape.ts'
import { mandalaProjectJSON } from './demo-mandala.ts'
import { gradientDemoSource, vectorDemoSource, type DemoSource } from './demo-media.ts'
import { portraitProjectJSON } from './demo-portrait.ts'
import { demoProjectJSON, DEMO_PROJECT_NAME } from './demo-poster.ts'
import type { GradientParams } from './gradient/params.ts'
import { DEFAULT_GRADIENT_PARAMS } from './gradient/params.ts'
import type { ProjectJSON } from './project.ts'
import type { TraceParams } from './trace/params.ts'
import { DEFAULT_TRACE_PARAMS } from './trace/params.ts'

export { demoProjectJSON, DEMO_PROJECT_NAME, COLS, ROWS } from './demo-poster.ts'

/** What materializing a demo puts into the library, by project kind. */
export type DemoContent =
  | { kind: 'pixel'; doc: ProjectJSON }
  | {
      kind: 'vector'
      source: { width: number; height: number; data: ArrayBuffer }
      sourceName: string
      params: TraceParams
    }
  | {
      kind: 'gradient'
      source: { width: number; height: number; data: ArrayBuffer }
      sourceName: string
      params: GradientParams
    }

export interface DemoDef {
  /** Stable library-entry id — materializing is idempotent per id. */
  id: string
  /** Data fallback name; the home screen shows a localized label instead. */
  name: string
  build: () => DemoContent
}

const rasterSource = (src: DemoSource): { width: number; height: number; data: ArrayBuffer } => ({
  width: src.width,
  height: src.height,
  data: src.rgba.buffer.slice(
    src.rgba.byteOffset,
    src.rgba.byteOffset + src.rgba.byteLength,
  ) as ArrayBuffer,
})

/** All examples in display order: the poster, growing grid scales, then the trace sources. */
export const POSTER_DEMO: DemoDef = {
  id: 'demo.poster',
  name: DEMO_PROJECT_NAME,
  build: () => ({ kind: 'pixel', doc: demoProjectJSON() }),
}

export const DEMO_PROJECTS: readonly DemoDef[] = [
  POSTER_DEMO,
  {
    id: 'demo.invader',
    name: 'Invader 32',
    build: () => ({ kind: 'pixel', doc: invaderProjectJSON() }),
  },
  {
    id: 'demo.portrait',
    name: 'Portrait 64',
    build: () => ({ kind: 'pixel', doc: portraitProjectJSON() }),
  },
  {
    id: 'demo.mandala',
    name: 'Mandala 128',
    build: () => ({ kind: 'pixel', doc: mandalaProjectJSON() }),
  },
  {
    id: 'demo.landscape',
    name: 'Landscape 512',
    build: () => ({ kind: 'pixel', doc: landscapeProjectJSON() }),
  },
  {
    id: 'demo.vector',
    name: 'Vector Shapes',
    build: () => ({
      kind: 'vector',
      source: rasterSource(vectorDemoSource()),
      sourceName: 'demo-shapes.png',
      params: DEFAULT_TRACE_PARAMS,
    }),
  },
  {
    id: 'demo.gradient',
    name: 'Gradient Field',
    build: () => ({
      kind: 'gradient',
      source: rasterSource(gradientDemoSource()),
      sourceName: 'demo-gradient.png',
      params: DEFAULT_GRADIENT_PARAMS,
    }),
  },
]
