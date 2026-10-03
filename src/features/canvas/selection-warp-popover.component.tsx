import { useCallback, useEffect, useRef, useState } from 'react'

import { bufferWidth } from '../../engine/core/doc.ts'
import { selectionBox, type CellBox, type InkCell } from '../../engine/effects/selection-xform.ts'
import {
  DEFAULT_WARP_PARAMS,
  isReversibleWarp,
  warpInk,
  type WarpKind,
  type WarpParams,
} from '../../engine/effects/warp.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/**
 * Parameter popover of one warp preset with a live ghost: every slider repaints the selection's ink
 * warped through the engine field — via the same staging surface the transform drag uses — and
 * Apply commits one undoable `warpSelection` (plain objects bake, the ghost is discarded).
 */

interface Snap {
  src: Map<number, InkCell>
  box: CellBox
  bw: number
  bh: number
}

export function SelectionWarpPopover({
  kind,
  staging,
  onBack,
  onClose,
}: {
  kind: WarpKind
  staging: TransformStaging
  /** Back to the preset list */
  onBack: () => void
  /** Close the whole menu */
  onClose: () => void
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const [params, setParams] = useState<WarpParams>(DEFAULT_WARP_PARAMS)
  const snapRef = useRef<Snap | null>(null)

  // the ghost painter closes over the current kind/params; snapshotting stays out of it so
  // slider ticks repaint without rescanning the buffer
  const paintGhost = useCallback(() => {
    const st = staging.ensureStaging()
    st.cells.clear()
    st.objs?.clear()
    const snap = snapRef.current
    if (snap) {
      for (const i of snap.src.keys()) {
        st.cells.set(i, null)
        st.objs?.set(i, null)
      }
      const mapped = warpInk(snap.src, kind, params, { box: snap.box, bw: snap.bw, bh: snap.bh })
      for (const [i, cell] of mapped) {
        st.cells.set(i, cell.v)
        st.objs?.set(i, cell.o)
      }
    }
    staging.scheduleStaging()
  }, [staging, kind, params])

  // the doc/selection pair is stable while the popover lives: snapshot once on open
  useEffect(() => {
    if (!doc.cellObj || selection.length === 0) return
    const bw = bufferWidth(doc)
    const bh = doc.rows * doc.sub
    const sel = new Set(selection)
    const src = new Map<number, InkCell>()
    for (let i = 0; i < doc.cellObj.length; i++) {
      const o = doc.cellObj[i]
      if (o > 0 && sel.has(o) && doc.cells[i] > 0) src.set(i, { v: doc.cells[i], o })
    }
    const box = src.size > 0 ? selectionBox(doc.cells, doc.cellObj, selection, bw, bh) : null
    snapRef.current = box ? { src, box, bw, bh } : null
  }, [doc, selection])

  // paint on mount and on every kind/param change
  useEffect(() => {
    paintGhost()
  }, [paintGhost])

  // unmount (Apply, Cancel, selection lost): drop the ghost, the committed doc renders again
  useEffect(
    () => () => {
      const st = staging.ensureStaging()
      st.cells.clear()
      st.objs?.clear()
      staging.scheduleStaging()
    },
    [staging],
  )

  const apply = () => {
    useStore.getState().warpSelection(kind, params)
    onClose()
  }

  const patch = (p: Partial<WarpParams>) => setParams((v) => ({ ...v, ...p }))
  const polar = kind === 'polar' || kind === 'unpolar'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('warp.back')}
          onClick={onBack}
          className="text-muted hover:bg-chip-active hover:text-body flex h-8 w-8 shrink-0 items-center justify-center rounded max-lg:h-11 max-lg:w-11"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3.5L5.5 8l4.5 4.5" />
          </svg>
        </button>
        <span className="text-body text-xs font-medium">{t(`warp.${kind}`)}</span>
      </div>
      {!polar && (
        <Slider
          label={t('warp.amount')}
          value={params.amount}
          min={-100}
          max={100}
          onChange={(v) => patch({ amount: v })}
        />
      )}
      {(kind === 'bulge' || kind === 'fisheye' || kind === 'twirl') && (
        <Slider
          label={t('warp.radius')}
          value={params.radiusPct}
          min={10}
          max={200}
          display={(v) => `${v}%`}
          onChange={(v) => patch({ radiusPct: v })}
        />
      )}
      {(kind === 'waveH' || kind === 'waveV' || kind === 'zigzag') && (
        <Slider
          label={t('warp.wavelength')}
          value={params.wavelength}
          min={2}
          max={64}
          onChange={(v) => patch({ wavelength: v })}
        />
      )}
      {kind === 'roughen' && (
        <Slider
          label={t('warp.seed')}
          value={params.seed}
          min={0}
          max={99}
          onChange={(v) => patch({ seed: v })}
        />
      )}
      {isReversibleWarp(kind) && params.amount === 0 && (
        <span className="text-muted text-xs">{t('warp.identityHint')}</span>
      )}
      <div className="flex justify-end gap-1">
        <Chip onClick={onClose}>{t('warp.cancel')}</Chip>
        <Chip active onClick={apply}>
          {t('warp.apply')}
        </Chip>
      </div>
    </div>
  )
}
