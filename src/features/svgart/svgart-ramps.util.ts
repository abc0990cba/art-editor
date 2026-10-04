/**
 * Built-in stop ramps for one-tap gradient looks. Plain sRGB lists — the serializer bakes them into
 * stops, so nothing here leaves the AI-safe subset.
 */

import { mustHex, type RGB } from '../../engine/svgart/index.ts'

export interface StopRamp {
  id: string
  colors: RGB[]
}

export const STOP_RAMPS: StopRamp[] = [
  { id: 'sunset', colors: ['#ff9a3c', '#ff5f6d', '#7b2ff7'].map(mustHex) },
  { id: 'ocean', colors: ['#0bd3d3', '#3a7bd5', '#1a2966'].map(mustHex) },
  { id: 'copper', colors: ['#fff3d6', '#e2882a', '#6e3a10'].map(mustHex) },
  { id: 'violet', colors: ['#e0c3fc', '#8ec5fc', '#5b4a8a'].map(mustHex) },
  { id: 'moss', colors: ['#d4fc79', '#96e6a1', '#2e7d5b'].map(mustHex) },
  { id: 'candy', colors: ['#ff6ec7', '#ffd54d', '#4fc3ff'].map(mustHex) },
]
