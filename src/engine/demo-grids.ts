/**
 * Grid-showcase demos: one per new lattice plus the rotated square — diamond bands, an isometric
 * harbor in outline mode, the octagon-and-gap tiling and a 45°-turned square mandala. Same
 * deterministic kit as every demo: pure functions, stable hashes, no clocks.
 */

import {
  hash01,
  makeGrid,
  makeLayer,
  makeObj,
  paintIdx,
  sceneHead,
  type InkGrid,
} from './demo-kit.ts'
import { defaultDoc } from './doc.ts'
import { makeGrid as makeLattice } from './grids.ts'
import type { ProjectJSON } from './project.ts'

const DIAMOND_COLS = 72
const DIAMOND_ROWS = 72
const DIAMOND_PALETTE = ['#12122b', '#3d348b', '#7678ed', '#f7b801', '#f18701', '#f35b04']

const ISO_COLS = 96
const ISO_ROWS = 52
const ISO_PALETTE = ['#0b3954', '#087e8b', '#bfd7ea', '#ff5a5f', '#c81d25']

const OCTA_COLS = 48
const OCTA_ROWS = 36
const OCTA_PALETTE = ['#20111b', '#5c1a3a', '#b9436e', '#f2a6b3', '#ffe3d8']

const ROT_COLS = 96
const ROT_ROWS = 96
const ROT_PALETTE = ['#071a12', '#0f4c37', '#2d9d63', '#a3e29f', '#f4ffe8']

function paintDiamondBloom(g: InkGrid): void {
  const grid = makeLattice('diamond', DIAMOND_COLS, DIAMOND_ROWS)
  const cx = grid.w / 2
  const cy = grid.h / 2
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const d = Math.abs(p.x - cx) + Math.abs(p.y - cy)
    const band = Math.floor(d / 5)
    let v = 1 + (band % (DIAMOND_PALETTE.length - 1))
    // golden accents where the hash spikes, so the rings sparkle
    if (hash01(i, 7) > 0.985) v = 4
    if (hash01(i, 11) > 0.995) v = 5
    paintIdx(g, i, v)
  }
}

function diamondProjectJSON(): ProjectJSON {
  const g = makeGrid(DIAMOND_COLS, DIAMOND_ROWS)
  paintDiamondBloom(g)
  const base = defaultDoc()
  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(DIAMOND_COLS, DIAMOND_ROWS, DIAMOND_PALETTE),
    gridType: 'diamond',
    bg: '#0d0d1f',
    style: { ...base.style, shape: 'circle', toneSize: true, toneSizeMin: 0.2 },
    layers: [makeLayer(nextId(), 'Bloom', [makeObj(nextId(), 'Rings', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}

function paintIsoHarbor(g: InkGrid): void {
  const grid = makeLattice('iso', ISO_COLS, ISO_ROWS)
  // water: broad noise bands over the lower half of the diamond, sky above
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const shore = grid.h * 0.42 + (hash01(Math.floor(p.x / 6), 3) - 0.5) * 6
    paintIdx(g, i, p.y < shore ? 3 : hash01(i, 5) > 0.94 ? 1 : 2)
  }
  // isometric blocks: an extruded footprint along the lattice axes (left-up and right-up)
  for (let k = 0; k < 26; k++) {
    const col = Math.floor(hash01(k, 21) * (ISO_COLS - 8)) + 2
    const row = Math.floor(ISO_ROWS * 0.45 + hash01(k, 22) * (ISO_ROWS * 0.4))
    const h = 2 + Math.floor(hash01(k, 23) * 5)
    const anchor = row * ISO_COLS + col
    if (anchor + h * ISO_COLS >= grid.count) continue
    for (let s = 1; s <= h; s++) {
      paintIdx(g, anchor - s * ISO_COLS - s, 4) // roof tile climbing the left axis
      if (s < h) paintIdx(g, anchor - s * ISO_COLS, 3)
    }
    paintIdx(g, anchor, 4)
  }
}

function isoProjectJSON(): ProjectJSON {
  const g = makeGrid(ISO_COLS, ISO_ROWS)
  paintIsoHarbor(g)
  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(ISO_COLS, ISO_ROWS, ISO_PALETTE),
    gridType: 'iso',
    bg: '#0a2a3d',
    renderMode: 'outline',
    style: { ...defaultDoc().style, radius: 0.14 },
    layers: [makeLayer(nextId(), 'Harbor', [makeObj(nextId(), 'Waterfront', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}

function paintOctaWeave(g: InkGrid): void {
  const grid = makeLattice('octasquare', OCTA_COLS, OCTA_ROWS)
  const octs = OCTA_COLS * OCTA_ROWS
  for (let i = 0; i < grid.count; i++) {
    const p = grid.center(i)
    const wave = Math.sin(p.x * 0.35) + Math.sin(p.y * 0.5 + Math.cos(p.x * 0.2))
    let v = 1 + Math.floor(((wave + 2) / 4) * (OCTA_PALETTE.length - 1))
    // the little gap squares flash light: the tiling reads as woven metal
    if (i >= octs) v = 5
    paintIdx(g, i, v)
  }
}

function octaProjectJSON(): ProjectJSON {
  const g = makeGrid(OCTA_COLS, OCTA_ROWS)
  paintOctaWeave(g)
  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(OCTA_COLS, OCTA_ROWS, OCTA_PALETTE),
    gridType: 'octasquare',
    bg: '#170b13',
    layers: [makeLayer(nextId(), 'Weave', [makeObj(nextId(), 'Brocade', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}

function paintRotMandala(g: InkGrid): void {
  const grid = makeLattice('square', ROT_COLS, ROT_ROWS)
  const cx = ROT_COLS / 2
  const cy = ROT_ROWS / 2
  for (let i = 0; i < grid.count; i++) {
    const x = (i % ROT_COLS) + 0.5
    const y = Math.floor(i / ROT_COLS) + 0.5
    const d = Math.hypot(x - cx, y - cy)
    const a = Math.atan2(y - cy, x - cx)
    const spokes = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 16)
    let v = 1 + ((Math.floor(d / 4) + spokes) % (ROT_PALETTE.length - 1))
    if (d < 4) v = 5
    if (hash01(i, 17) > 0.992) v = 4
    paintIdx(g, i, v)
  }
}

function rotProjectJSON(): ProjectJSON {
  const g = makeGrid(ROT_COLS, ROT_ROWS)
  paintRotMandala(g)
  const base = defaultDoc()
  let id = 0
  const nextId = () => ++id
  return {
    ...sceneHead(ROT_COLS, ROT_ROWS, ROT_PALETTE),
    gridType: 'square',
    gridRotation: 45,
    bg: '#04120c',
    style: { ...base.style, shape: 'circle', toneSize: true, toneSizeMin: 0.25 },
    layers: [makeLayer(nextId(), 'Mandala', [makeObj(nextId(), 'Sunburst', g)])],
    nextNodeId: id + 1,
    fuseObjects: true,
  }
}

export { diamondProjectJSON, isoProjectJSON, octaProjectJSON, rotProjectJSON }
