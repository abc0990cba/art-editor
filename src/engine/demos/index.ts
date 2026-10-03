/**
 * The demo project registry: ready-made examples the home screen offers in its «Примеры» section.
 * Each def has a stable id (the library entry id, `demo.`-prefixed) and a lazy build, so nothing is
 * computed until a thumbnail or an open click needs it. Poster seeding on first launch lives in
 * storage/demo-seed.ts and reuses the `demo.poster` def.
 */

import type { ProjectJSON } from '../core/project.ts'
import type { GradientParams } from '../gradient/params.ts'
import { DEFAULT_GRADIENT_PARAMS } from '../gradient/params.ts'
import type { TraceParams } from '../trace/params.ts'
import { DEFAULT_TRACE_PARAMS } from '../trace/params.ts'
import { cascadeProjectJSON } from './cascade.ts'
import { confettiProjectJSON } from './confetti.ts'
import { constellationProjectJSON } from './constellation.ts'
import { cubistProjectJSON } from './cubist.ts'
import { dollarProjectJSON } from './dollar.ts'
import { galaxyProjectJSON } from './galaxy.ts'
import { diamondProjectJSON, isoProjectJSON, octaProjectJSON, rotProjectJSON } from './grids.ts'
import { hexreefProjectJSON } from './hexreef.ts'
import { invaderProjectJSON } from './invader.ts'
import { kaleidoProjectJSON } from './kaleido.ts'
import { landscapeProjectJSON } from './landscape.ts'
import { lavaProjectJSON } from './lava.ts'
import { mandalaProjectJSON } from './mandala.ts'
import { gradientDemoSource, vectorDemoSource, type DemoSource } from './media.ts'
import { neonCityProjectJSON } from './neoncity.ts'
import { nodeGardenProjectJSON } from './nodegarden.ts'
import { portraitProjectJSON } from './portrait.ts'
import { demoProjectJSON, DEMO_PROJECT_NAME } from './poster.ts'
import { toneProjectJSON } from './tone.ts'
import { tripeaksProjectJSON } from './tripeaks.ts'
import { wallpaperProjectJSON } from './wallpaper.ts'

export { demoProjectJSON, DEMO_PROJECT_NAME, COLS, ROWS } from './poster.ts'

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
    id: 'demo.confetti',
    name: 'Confetti 64',
    build: () => ({ kind: 'pixel', doc: confettiProjectJSON() }),
  },
  {
    id: 'demo.tone',
    name: 'Tone Sun 96',
    build: () => ({ kind: 'pixel', doc: toneProjectJSON() }),
  },
  {
    id: 'demo.hexreef',
    name: 'Hex Reef 96',
    build: () => ({ kind: 'pixel', doc: hexreefProjectJSON() }),
  },
  {
    id: 'demo.diamond',
    name: 'Diamond Bloom 72',
    build: () => ({ kind: 'pixel', doc: diamondProjectJSON() }),
  },
  {
    id: 'demo.iso',
    name: 'Iso Harbor 96',
    build: () => ({ kind: 'pixel', doc: isoProjectJSON() }),
  },
  {
    id: 'demo.octa',
    name: 'Octagon Weave 48',
    build: () => ({ kind: 'pixel', doc: octaProjectJSON() }),
  },
  {
    id: 'demo.rot',
    name: 'Turned Mandala 96',
    build: () => ({ kind: 'pixel', doc: rotProjectJSON() }),
  },
  {
    id: 'demo.mandala',
    name: 'Mandala 128',
    build: () => ({ kind: 'pixel', doc: mandalaProjectJSON() }),
  },
  {
    id: 'demo.kaleido',
    name: 'Kaleido Bloom 128',
    build: () => ({ kind: 'pixel', doc: kaleidoProjectJSON() }),
  },
  {
    id: 'demo.galaxy',
    name: 'Radial Galaxy 128',
    build: () => ({ kind: 'pixel', doc: galaxyProjectJSON() }),
  },
  {
    id: 'demo.cubist',
    name: 'Cubist Portrait 128',
    build: () => ({ kind: 'pixel', doc: cubistProjectJSON() }),
  },
  {
    id: 'demo.wallpaper',
    name: 'Suzani Tile 128',
    build: () => ({ kind: 'pixel', doc: wallpaperProjectJSON() }),
  },
  {
    id: 'demo.nodegarden',
    name: 'Node Garden 128',
    build: () => ({ kind: 'pixel', doc: nodeGardenProjectJSON() }),
  },
  {
    id: 'demo.constellation',
    name: 'Constellations 128',
    build: () => ({ kind: 'pixel', doc: constellationProjectJSON() }),
  },
  {
    id: 'demo.neoncity',
    name: 'Neon City 128',
    build: () => ({ kind: 'pixel', doc: neonCityProjectJSON() }),
  },
  {
    id: 'demo.tripeaks',
    name: 'Triangle Peaks 128',
    build: () => ({ kind: 'pixel', doc: tripeaksProjectJSON() }),
  },
  {
    id: 'demo.cascade',
    name: 'Checker Cascade 96',
    build: () => ({ kind: 'pixel', doc: cascadeProjectJSON() }),
  },
  {
    id: 'demo.lava',
    name: 'Lava Blobs 96',
    build: () => ({ kind: 'pixel', doc: lavaProjectJSON() }),
  },
  {
    id: 'demo.dollar',
    name: 'Banknote 192',
    build: () => ({ kind: 'pixel', doc: dollarProjectJSON() }),
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
