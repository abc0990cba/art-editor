import { useEffect, useRef } from 'react'

import { symmetryPoints, type RadialOpts } from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
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
 * Modal preview of the selected symmetry mode: a demo doodle (accent) with all its symmetric copies
 * (muted) rendered on a grid, so the effect of the mode is visible at a glance.
 */
export function SymmetryPreviewDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const symmetry = useStore((s) => s.symmetry)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const radial: RadialOpts | undefined =
    symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
      ? { fill: symmetry.fill, phase: symmetry.phase, twist: symmetry.twist }
      : undefined

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = GRID * CELL
    canvas.height = GRID * CELL
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cell = (x: number, y: number, color: string, inset = 1) => {
      ctx.fillStyle = color
      ctx.fillRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2)
    }

    // backdrop grid
    ctx.fillStyle =
      getComputedStyle(document.documentElement).getPropertyValue('--chip').trim() ||
      'rgba(128,128,128,0.12)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = 'rgba(128,128,128,0.25)'
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
  }, [
    symmetry.mode,
    symmetry.n,
    symmetry.cell,
    symmetry.fill,
    symmetry.phase,
    symmetry.twist,
    radial,
  ])

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 p-4 lg:max-w-md lg:rounded-xl">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t(`sym.${symmetry.mode}` as 'sym.none')}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dialog.close')}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
          >
            ✕
          </button>
        </div>
        <canvas ref={canvasRef} className="border-line w-full rounded-lg border" />
        <p className="text-muted text-overline leading-snug">
          {t(`sym.${symmetry.mode}.desc` as 'sym.none.desc')}
        </p>
      </DialogContent>
    </Dialog>
  )
}
