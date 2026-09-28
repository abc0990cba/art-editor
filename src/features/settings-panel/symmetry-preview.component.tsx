import { useEffect, useRef } from 'react'

import { STAGE_THEMES } from '../../engine/doc.ts'
import { symmetryPoints, type RadialOpts } from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { useStore } from '../../state/editor.store.ts'

const GRID = 24
const CELL = 14

/** A small asymmetric doodle the symmetry is demonstrated on (top-left quadrant of the grid). */
const SEEDS: [number, number][] = [
  [5, 5],
  [6, 6],
  [7, 7],
  [8, 7],
  [8, 8],
  [11, 6],
  [6, 11],
  [9, 10],
]

/**
 * Live demo of the active symmetry mode: an accent doodle with all its symmetric copies (muted) on
 * a grid, redrawn from the current symmetry settings so every chip and slider change is instantly
 * visible. Stays an inline canvas on purpose — inside a Radix portal the content mounts one commit
 * after the component, and a draw-on-mount effect would run before the canvas exists.
 */
export function SymmetryPreview({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const symmetry = useStore((s) => s.symmetry)
  // the demo colors follow the theme: grid lines come from the canvas stage theme, seeds/copies
  // from the panel's accent/muted tokens — both flip with the resolved theme
  const resolvedTheme = useStore((s) => s.resolvedTheme)
  const stage = STAGE_THEMES[resolvedTheme]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // radial knobs as primitives, so the draw effect re-runs only on real changes (no per-render
  // options object in the dependency array)
  const isRadial = symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
  const fill = isRadial ? symmetry.fill : 0
  const phase = isRadial ? symmetry.phase : 0
  const twist = isRadial ? symmetry.twist : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = GRID * CELL
    canvas.height = GRID * CELL
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const radial: RadialOpts | undefined =
      symmetry.mode === 'radial' || symmetry.mode === 'kaleido' ? { fill, phase, twist } : undefined

    const cell = (x: number, y: number, color: string, inset = 1) => {
      ctx.fillStyle = color
      ctx.fillRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2)
    }

    // backdrop grid
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--chip').trim() ||
      'rgba(128,128,128,0.12)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = stage.pixelLine
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL, 0)
      ctx.lineTo(i * CELL, canvas.height)
      ctx.moveTo(0, i * CELL)
      ctx.lineTo(canvas.width, i * CELL)
      ctx.stroke()
    }

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent-text').trim() ||
      '#e63946'
    const copy =
      getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#888'
    const seen = new Set<string>()
    for (const [sx, sy] of SEEDS) {
      cell(sx, sy, accent)
      seen.add(`${sx}:${sy}`)
      for (const [px, py] of symmetryPoints(
        sx,
        sy,
        GRID,
        GRID,
        symmetry.mode,
        symmetry.n,
        symmetry.cell,
        radial,
      )) {
        if (seen.has(`${px}:${py}`)) continue
        seen.add(`${px}:${py}`)
        cell(px, py, copy)
      }
    }
  }, [symmetry.mode, symmetry.n, symmetry.cell, fill, phase, twist, stage])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={t('sym.preview.desc')}
      className={`border-line w-full rounded-lg border ${className}`}
    />
  )
}
