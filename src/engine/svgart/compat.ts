/**
 * Illustrator compatibility labels for studio features. Source of truth: docs/research/ai-import.md +
 * the two spike sheets in samples/. The studio emits only safe constructs; `verify` marks the one
 * construct the community reports as mostly-alive but that every user should confirm in their own
 * Illustrator (radial focus fx/fy).
 */

import type { Paint } from './types.ts'

export type AiStatus = 'safe' | 'verify'

export interface CompatInfo {
  status: AiStatus
  /** Spike sheet row to check for the manual verdict. */
  sheet: string
}

const LINEAR: CompatInfo = { status: 'safe', sheet: 'studio sheet row 1' }
const RADIAL: CompatInfo = { status: 'safe', sheet: 'studio sheet rows 4–5' }
const FOCUS: CompatInfo = { status: 'verify', sheet: 'studio sheet row 4' }

/** Compatibility of a paint as authored (the focus pushes it to `verify`). */
export function paintCompat(paint: Paint): CompatInfo {
  if (paint.kind === 'linear') return LINEAR
  if (paint.kind === 'solid') return RADIAL
  return paint.fx !== null && paint.fy !== null ? FOCUS : RADIAL
}
