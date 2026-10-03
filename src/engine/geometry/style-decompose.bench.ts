import { bench, describe } from 'vitest'

import { flatBenchDoc, flatRunsBenchDoc } from '../bench-doc.util.ts'
import { buildGeometry } from './index.ts'

/**
 * Per-cell style spike — PERFLOG 2026-09-29: cell forms (circles) disable run merging and pay
 * per-cell path strings (512² 50% runs: 1.07 → 121.7 ms, ×114). This spike decomposes where the
 * cost sits and sizes the two engine-side candidates:
 *
 * - `integer coords` — same per-cell silhouette, but cell coordinates are already integers, so the
 *   3-decimal formatting pass (Math.round(v*1000)/1000 per coordinate) disappears;
 * - `stadium per run` — one merged capsule fragment per horizontal run instead of per cell (~1024
 *   fragments instead of 131k). APPEARANCE CHANGE: adjacent circles touch into capsules — viable
 *   only as a separate "merged forms" style, noted in docs/research/performance.md.
 *
 * The emitters are bench-local string measurements of the emission stage (scan → fragment strings →
 * join), not a production pipeline; they bound what a pipeline change can save.
 */

const runs512 = flatRunsBenchDoc(512, 512, 0.5)
const circles512 = { ...runs512, style: { ...runs512.style, shape: 'circle' as const } }
const cells = runs512.cells
const SIZE = 512

describe('style spike — full rebuild (production pipeline)', () => {
  bench(
    'status quo: per-cell circle fragments, 3-decimal coords',
    () => {
      buildGeometry(circles512)
    },
    { iterations: 6, warmupIterations: 1 },
  )
  bench(
    'scan reference: squares with run merging',
    () => {
      buildGeometry(runs512)
    },
    { iterations: 12, warmupIterations: 1 },
  )
})

describe('style spike — string emission emulation (131k cells)', () => {
  bench(
    'per-cell circle, 3-decimal coords (current shape of the cost)',
    () => {
      const out: string[] = []
      for (let y = 0; y < SIZE; y++) {
        const row = y * SIZE
        for (let x = 0; x < SIZE; x++) {
          if (cells[row + x] === 0) continue
          const cx = Math.round(x * 1000) / 1000
          const cy = Math.round(y * 1000) / 1000
          out.push(`M${cx} ${cy}a0.5 0.5 0 1 0 0.001 0z`)
        }
      }
      out.join('')
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'per-cell circle, integer coords (candidate: skip formatting)',
    () => {
      const out: string[] = []
      for (let y = 0; y < SIZE; y++) {
        const row = y * SIZE
        for (let x = 0; x < SIZE; x++) {
          if (cells[row + x] === 0) continue
          out.push(`M${x} ${y}a.5.5 0 1 0 .001 0z`)
        }
      }
      out.join('')
    },
    { iterations: 8, warmupIterations: 1 },
  )
  bench(
    'stadium per run (~1024 fragments instead of 131k; merged silhouette)',
    () => {
      const out: string[] = []
      for (let y = 0; y < SIZE; y++) {
        const row = y * SIZE
        let x = 0
        while (x < SIZE) {
          const v = cells[row + x]
          if (v === 0) {
            x++
            continue
          }
          let end = x + 1
          while (end < SIZE && cells[row + end] === v) end++
          const len = end - x
          out.push(`M${x} ${y}h${len}a.5.5 0 0 1 0 1h-${len}a.5.5 0 0 1 0-1z`)
          x = end
        }
      }
      out.join('')
    },
    { iterations: 8, warmupIterations: 1 },
  )
})

/** Scatter ink is the pessimistic reference for the same emulations (runs are single cells). */
const flat512 = flatBenchDoc(512, 512, 0.05)
const scatterCircles = { ...flat512, style: { ...flat512.style, shape: 'circle' as const } }

describe('style spike — scatter reference (512², 5%)', () => {
  bench(
    'status quo: per-cell circle fragments on scatter ink',
    () => {
      buildGeometry(scatterCircles)
    },
    { iterations: 12, warmupIterations: 1 },
  )
})
