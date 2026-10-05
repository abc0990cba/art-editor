import { useEffect, useState } from 'react'

import type { MetaballFalloff } from '../../engine/core/doc.ts'
import {
  DEFAULT_FILTER_PARAMS,
  FILTER_PATTERNS,
  filterInk,
  type FilterOp,
  type FilterParams,
} from '../../engine/effects/filters.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Slider } from '../../shared/ui/index.tsx'
import { ShapeTileGrid } from '../../shared/ui/shape-tiles.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { useSelectionInkPreview } from './use-selection-ink-preview.hook.ts'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/**
 * Parameter popover of one generative filter (blobify / figurefy / patternize) with a live ghost:
 * every knob repaints the selection's ink regenerated through `filterInk` — via the shared
 * ink-preview staging hook — and Apply commits one undoable `filterSelection`.
 */

const FALLOFFS: readonly MetaballFalloff[] = ['tight', 'smooth', 'gooey']

export function SelectionFilterPopover({
  op,
  staging,
  onBack,
  onClose,
}: {
  op: FilterOp
  staging: TransformStaging
  /** Back to the filter list */
  onBack: () => void
  /** Close the whole menu */
  onClose: () => void
}) {
  const { t } = useI18n()
  const [params, setParams] = useState<FilterParams>(DEFAULT_FILTER_PARAMS)
  const paintGhost = useSelectionInkPreview(staging)

  useEffect(() => {
    paintGhost((snap) =>
      filterInk(op, snap.src, params, { box: snap.box, bw: snap.bw, bh: snap.bh }),
    )
  }, [paintGhost, op, params])

  const apply = () => {
    useStore.getState().filterSelection(op, params)
    onClose()
  }

  const patch = (p: Partial<FilterParams>) => setParams((v) => ({ ...v, ...p }))
  const pct = (v: number) => `${v}%`

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
        <span className="text-body text-xs font-medium">
          {t(`filter.${op}` as 'filter.blobify')}
        </span>
      </div>
      {op === 'blobify' && (
        <>
          <Slider
            label={t('filter.radius')}
            value={params.radius}
            min={1}
            max={8}
            onChange={(v) => patch({ radius: v })}
          />
          <Slider
            label={t('filter.iso')}
            value={Math.round(params.iso * 100)}
            min={20}
            max={90}
            display={pct}
            onChange={(v) => patch({ iso: v / 100 })}
          />
          <ChipRow
            options={FALLOFFS.map(
              (f) => [f, t(`filter.falloff.${f}` as 'filter.falloff.smooth')] as const,
            )}
            active={params.falloff}
            onPick={(f) => patch({ falloff: f })}
          />
        </>
      )}
      {op === 'figurefy' && (
        <>
          <Slider
            label={t('filter.scale')}
            value={params.scale}
            min={2}
            max={6}
            display={(v) => `${v}×${v}`}
            onChange={(v) => patch({ scale: v })}
          />
          <ShapeTileGrid
            shape={params.figure}
            onPick={(figure) => patch({ figure })}
            ariaLabel={t('filter.figure')}
          />
          <ChipRow
            options={
              [
                ['figure', t('filter.mode.figure')],
                ['cut', t('filter.mode.cut')],
              ] as const
            }
            active={params.mode}
            onPick={(mode) => patch({ mode })}
          />
        </>
      )}
      {op === 'patternize' && (
        <>
          <ChipRow
            options={FILTER_PATTERNS.map(
              (id) => [id, t(`fill.pattern.${id}` as 'fill.pattern.checker')] as const,
            )}
            active={params.pattern}
            onPick={(pattern) => patch({ pattern })}
          />
          <Slider
            label={t('filter.scale')}
            value={params.scale}
            min={1}
            max={8}
            onChange={(v) => patch({ scale: v })}
          />
          <Slider
            label={t('filter.density')}
            value={Math.round(params.density * 100)}
            min={5}
            max={95}
            display={pct}
            onChange={(v) => patch({ density: v / 100 })}
          />
          <CheckRow
            label={t('filter.invert')}
            checked={params.invert}
            onChange={(invert) => patch({ invert })}
          />
        </>
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

/** One row of choice chips (falloff curves, figurefy modes, patternize patterns). */
function ChipRow<K extends string>({
  options,
  active,
  onPick,
}: {
  options: readonly (readonly [K, string])[]
  active: K
  onPick: (v: K) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([value, label]) => (
        <Chip
          key={value}
          active={active === value}
          onClick={() => onPick(value)}
          className="max-lg:min-h-11"
        >
          {label}
        </Chip>
      ))}
    </div>
  )
}
