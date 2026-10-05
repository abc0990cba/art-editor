import { useEffect, useState } from 'react'

import {
  FILTER_POPOVER_OPS,
  type FilterOp,
  type FilterParams,
} from '../../engine/effects/filters.ts'
import type { PixelOp, PixelOpParams } from '../../engine/effects/morpho.ts'
import { WARP_KINDS, type WarpKind } from '../../engine/effects/warp.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { SelectionFilterPopover } from './selection-filter-popover.component.tsx'
import { SelectionWarpPopover } from './selection-warp-popover.component.tsx'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/** Parameterized pixel ops open an inline options row; the rest apply in one click. */
const PIXEL_OP_OPTIONS: Partial<
  Record<PixelOp, { label: string; params: Partial<PixelOpParams> }[]>
> = {
  blockify: [2, 3, 4, 5, 6].map((n) => ({ label: `${n}×${n}`, params: { size: n } })),
  despeckle: [2, 3, 4, 5].map((n) => ({ label: `≥${n}`, params: { size: n } })),
  scanlines: [2, 3, 4, 5, 6].map((n) => ({ label: `${n}`, params: { size: n } })),
  dilate: [1, 2, 3, 4].map((n) => ({ label: `×${n}`, params: { steps: n } })),
  erode: [1, 2, 3, 4].map((n) => ({ label: `×${n}`, params: { steps: n } })),
  longShadow: [
    ['↘', { dx: 1, dy: 1 }],
    ['↙', { dx: -1, dy: 1 }],
    ['↗', { dx: 1, dy: -1 }],
    ['↖', { dx: -1, dy: -1 }],
  ].map(([label, params]) => ({
    label: label as string,
    params: params as Partial<PixelOpParams>,
  })),
}

const DIRECT_PIXEL_OPS = ['pixelPerfect', 'outlineOnly', 'silhouette'] as const

const PIXEL_OP_CHIPS: [PixelOp, string][] = [
  ['blockify', 'op.blockify'],
  ['pixelPerfect', 'op.pixelPerfect'],
  ['despeckle', 'op.despeckle'],
  ['outlineOnly', 'op.outlineOnly'],
  ['silhouette', 'op.silhouette'],
  ['longShadow', 'op.longShadow'],
  ['scanlines', 'op.scanlines'],
  ['dilate', 'op.dilate'],
  ['erode', 'op.erode'],
]

/** Generative filter groups: gooey / figures / organic — chips open a popover or a preset row. */
const FILTER_GROUPS: [string, [FilterOp, string][]][] = [
  [
    'fx.gooey',
    [
      ['blobify', 'filter.blobify'],
      ['smoothen', 'filter.smoothen'],
    ],
  ],
  [
    'fx.figures',
    [
      ['figurefy', 'filter.figurefy'],
      ['patternize', 'filter.patternize'],
    ],
  ],
  [
    'fx.organic',
    [
      ['drip', 'filter.drip'],
      ['dissolve', 'filter.dissolve'],
    ],
  ],
]

/** Preset rows of the one-click filters (popover ops never land here). */
const FILTER_PRESETS: Partial<
  Record<FilterOp, { label: string; params: Partial<FilterParams> }[]>
> = {
  smoothen: [1, 2, 3].map((n) => ({ label: `×${n}`, params: { passes: n } })),
  drip: (
    [
      ['↓', 0, 1],
      ['↑', 0, -1],
      ['→', 1, 0],
      ['←', -1, 0],
    ] as const
  ).map(([label, dx, dy]) => ({ label, params: { dx, dy } })),
  dissolve: [25, 50, 75].map((n) => ({ label: `${n}%`, params: { amount: n / 100 } })),
}

/**
 * The selection bar's "More" panel, grouped like a vector editor's effect menu: warp presets (each
 * opens a live-preview popover), one-click stylize ops, and the pixel-art morphology ops (each with
 * a parameter row or one click). Rendered inside the floating action bar; a click-away backdrop or
 * Escape closes it.
 */
export function SelectionFxMenu({
  staging,
  onClose,
}: {
  staging: TransformStaging
  onClose: () => void
}) {
  const { t } = useI18n()
  const [warpKind, setWarpKind] = useState<WarpKind | null>(null)
  const [pixelOp, setPixelOp] = useState<PixelOp | null>(null)
  const [filterOp, setFilterOp] = useState<FilterOp | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stylize = (op: 'outline' | 'shadow' | 'glow') => {
    useStore.getState().stylizeSelection(op)
    onClose()
  }

  const runPixelOp = (op: PixelOp, params?: Partial<PixelOpParams>) => {
    useStore.getState().pixelOpSelection(op, params)
    onClose()
  }

  const runFilter = (op: FilterOp, params?: Partial<FilterParams>) => {
    useStore.getState().filterSelection(op, params)
    onClose()
  }

  const opChip = ([op, key]: [PixelOp, string]) => {
    const direct = (DIRECT_PIXEL_OPS as readonly string[]).includes(op)
    return (
      <Chip
        key={op}
        className="max-lg:min-h-11"
        title={t(`op.${op}.desc` as 'op.blockify.desc')}
        onClick={() => (direct ? runPixelOp(op) : setPixelOp(op))}
      >
        {t(key as 'op.blockify')}
      </Chip>
    )
  }

  return (
    <>
      {/* click-away catcher; sits inside the bar's stacking context, under the panel */}
      <button
        type="button"
        aria-label={t('warp.cancel')}
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="border-line bg-panel/95 absolute top-full left-0 z-20 mt-1 max-h-[70vh] w-60 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border p-2 shadow-lg backdrop-blur max-lg:w-72">
        {warpKind === null && filterOp !== null ? (
          (FILTER_POPOVER_OPS as readonly string[]).includes(filterOp) ? (
            <SelectionFilterPopover
              op={filterOp}
              staging={staging}
              onBack={() => setFilterOp(null)}
              onClose={onClose}
            />
          ) : (
            <FilterPresetRow op={filterOp} onRun={runFilter} onBack={() => setFilterOp(null)} />
          )
        ) : warpKind === null ? (
          <>
            <MenuTitle label={t('fx.warp')} />
            <div className="grid grid-cols-3 gap-1">
              {WARP_KINDS.map((k) => (
                <Chip key={k} onClick={() => setWarpKind(k)} className="max-lg:min-h-11">
                  {t(`warp.${k}`)}
                </Chip>
              ))}
            </div>
            <MenuTitle label={t('fx.stylize')} />
            <div className="grid grid-cols-3 gap-1">
              <Chip onClick={() => stylize('outline')} className="max-lg:min-h-11">
                {t('fx.outline')}
              </Chip>
              <Chip onClick={() => stylize('shadow')} className="max-lg:min-h-11">
                {t('fx.shadow')}
              </Chip>
              <Chip onClick={() => stylize('glow')} className="max-lg:min-h-11">
                {t('fx.glow')}
              </Chip>
            </div>
            {pixelOp === null ? (
              <>
                <MenuTitle label={t('fx.pixels')} />
                <div className="grid grid-cols-3 gap-1">{PIXEL_OP_CHIPS.map(opChip)}</div>
                <FilterGroups onPick={setFilterOp} />
              </>
            ) : (
              <>
                <MenuTitle label={t(`op.${pixelOp}` as 'op.blockify')} />
                <div className="grid grid-cols-3 gap-1">
                  <Chip
                    className="max-lg:min-h-11"
                    aria-label={t('warp.cancel')}
                    title={t('warp.cancel')}
                    onClick={() => setPixelOp(null)}
                  >
                    ←
                  </Chip>
                  {PIXEL_OP_OPTIONS[pixelOp]?.map(({ label, params }) => (
                    <Chip
                      key={label}
                      className="max-lg:min-h-11"
                      onClick={() => runPixelOp(pixelOp, params)}
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <SelectionWarpPopover
            kind={warpKind}
            staging={staging}
            onBack={() => setWarpKind(null)}
            onClose={onClose}
          />
        )}
      </div>
    </>
  )
}

function MenuTitle({ label }: { label: string }) {
  return (
    <div className="text-muted text-overline px-0.5 pt-1.5 pb-1 font-medium tracking-wide uppercase first:pt-0">
      {label}
    </div>
  )
}

/** Preset row of one one-click filter: the back chip plus one chip per preset option. */
function FilterPresetRow({
  op,
  onRun,
  onBack,
}: {
  op: FilterOp
  onRun: (op: FilterOp, params?: Partial<FilterParams>) => void
  onBack: () => void
}) {
  const { t } = useI18n()
  return (
    <>
      <MenuTitle label={t(`filter.${op}` as 'filter.blobify')} />
      <div className="grid grid-cols-3 gap-1">
        <Chip
          className="max-lg:min-h-11"
          aria-label={t('warp.cancel')}
          title={t('warp.cancel')}
          onClick={onBack}
        >
          ←
        </Chip>
        {FILTER_PRESETS[op]?.map(({ label, params }) => (
          <Chip key={label} className="max-lg:min-h-11" onClick={() => onRun(op, params)}>
            {label}
          </Chip>
        ))}
      </div>
    </>
  )
}

/** The three generative groups (gooey / figures / organic) as chip grids. */
function FilterGroups({ onPick }: { onPick: (op: FilterOp) => void }) {
  const { t } = useI18n()
  return (
    <>
      {FILTER_GROUPS.map(([group, chips]) => (
        <div key={group}>
          <MenuTitle label={t(group as 'fx.warp')} />
          <div className="grid grid-cols-3 gap-1">
            {chips.map(([op, key]) => (
              <Chip
                key={op}
                className="max-lg:min-h-11"
                title={t(`filter.${op}.desc` as 'filter.blobify.desc')}
                onClick={() => onPick(op)}
              >
                {t(key as 'filter.blobify')}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
