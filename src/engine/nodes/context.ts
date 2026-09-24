/**
 * Evaluation context services: deterministic randomness, palette resolution and the raster merge
 * rule. Everything future nodes might need (noise, scatter, sampling) should land here as a
 * service, so node definitions stay pure and portable.
 */

import type { Cells, EvalContext } from './types'

/** FNV-1a string hash → 32-bit uint (stable across sessions, unlike Math.random seeds). */
function hashStr(s: string): number {
  let h = 0x81_1c_9d_c5
  for (let i = 0; i < s.length; i++) {
    h ^= s.codePointAt(i) ?? 0
    h = Math.imul(h, 0x01_00_01_93)
  }
  return h >>> 0
}

/** Mulberry32: tiny deterministic PRNG, [0,1) from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * Bind the context's rng to one node: (node id, key) fully determines the value, so randomness
 * survives re-evaluation and stays stable across undo/redo.
 */
export function withNodeRng(
  base: Omit<EvalContext, 'rng'>,
  nodeId: string,
  op: string,
): EvalContext {
  const seed = hashStr(`${op}::${nodeId}`)
  return { ...base, rng: (key: string) => mulberry32(seed ^ hashStr(key))() }
}

/**
 * Merge `add` into the accumulated cells: union (paint-over), subtraction or intersection — the
 * boolean semantics of source nodes.
 */
export function combineCells(acc: Cells, add: Cells, mode: string): Cells {
  if (mode === 'subtract') {
    const out: Cells = new Map()
    for (const [i, v] of acc) if (!add.has(i)) out.set(i, v)
    return out
  }
  if (mode === 'intersect') {
    const out: Cells = new Map()
    for (const [i, v] of acc) if (add.has(i)) out.set(i, v)
    return out
  }
  const out = new Map(acc)
  for (const [i, v] of add) out.set(i, v)
  return out
}
