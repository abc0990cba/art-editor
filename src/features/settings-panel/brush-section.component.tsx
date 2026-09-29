import { useEffect, useRef, useState } from 'react'

import {
  BRUSH_SHAPES,
  BUILT_IN_BRUSHES,
  detectBrushShape,
  TIP_MIN_SIZE,
  type Brush,
} from '../../engine/brush.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { ShapeTileGrid } from '../../shared/ui/shape-tiles.component.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import type { BrushPresetEntry } from '../../storage/brushes.ts'

/** Small canvas rendering of a brush tip (active cells in the accent color). */
function BrushPreview({ brush, box = 22 }: { brush: Brush; box?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(box * dpr)
    canvas.height = Math.round(box * dpr)
    canvas.style.width = `${box}px`
    canvas.style.height = `${box}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, box, box)
    ctx.fillStyle = '#818cf8'
    const pad = 1.5
    const cell = (box - pad * 2) / brush.size
    brush.pattern.forEach((on, i) => {
      if (!on) return
      const x = i % brush.size
      const y = Math.floor(i / brush.size)
      ctx.fillRect(
        pad + x * cell,
        pad + y * cell,
        Math.max(1, cell - 0.75),
        Math.max(1, cell - 0.75),
      )
    })
  }, [brush, box])
  return <canvas ref={ref} className="border-line shrink-0 rounded-sm border" />
}

const BUILTIN_LIST = BUILT_IN_BRUSHES.map((def) => ({ id: def.id, brush: def.make() }))

function brushNameKey(id: string): 'brushName.px1' {
  return `brushName.${id}` as 'brushName.px1'
}

/** Tip shape presets; shapes that degenerate at the current size are disabled with a hint. */
function TipChips({ brush, onPick }: { brush: Brush; onPick: (pattern: boolean[]) => void }) {
  const { t } = useI18n()
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {BRUSH_SHAPES.map(({ id, make }) => {
          const min = TIP_MIN_SIZE[id]
          const fits = brush.size >= min
          const name = t(`brush.${id}` as 'brush.square')
          return (
            <Chip
              key={id}
              active={detectBrushShape(brush) === id}
              disabled={!fits}
              title={fits ? name : `${name} — ${min}×${min}`}
              onClick={() => onPick(make(brush.size).pattern)}
            >
              {name}
            </Chip>
          )
        })}
        <Chip title={t('brush.invert')} onClick={() => onPick(brush.pattern.map((v) => !v))}>
          {t('brush.invert')}
        </Chip>
      </div>
      {BRUSH_SHAPES.some(({ id }) => TIP_MIN_SIZE[id] > brush.size) && (
        <p className="text-muted text-overline leading-snug">{t('brush.tipTooSmallHint')}</p>
      )}
    </>
  )
}

/** Brush section: pixel size, tip editor and the brush preset library. */
export function BrushSection() {
  const { t } = useI18n()
  const brush = useStore((s) => s.brush)
  const brushId = useStore((s) => s.brushId)
  const brushSnap = useStore((s) => s.brushSnap)
  const patchBrush = useStore((s) => s.patchBrush)
  const setBrushSnap = useStore((s) => s.setBrushSnap)
  const isSquare = useStore((s) => s.doc.gridType === 'square')
  const docStyle = useStore((s) => s.doc.style)
  const patchStyle = useStore((s) => s.patchStyle)
  const brushPresets = useStore((s) => s.brushPresets)
  const brushesReady = useStore((s) => s.brushesReady)
  const loadBrushes = useStore((s) => s.loadBrushes)
  const createBrush = useStore((s) => s.createBrush)
  const overwriteBrush = useStore((s) => s.overwriteBrush)
  const renameBrush = useStore((s) => s.renameBrush)
  const deleteBrushPreset = useStore((s) => s.deleteBrushPreset)
  const applyBrushPreset = useStore((s) => s.applyBrushPreset)

  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    void loadBrushes()
  }, [loadBrushes])

  const toggle = (i: number) => {
    const next = [...brush.pattern]
    next[i] = !next[i]
    patchBrush({ pattern: next })
  }

  const saveCurrent = () => {
    void createBrush(name)
    setName('')
  }

  const userRow = (p: BrushPresetEntry) => {
    const active = brushId === p.id
    return (
      <div
        key={p.id}
        className={`flex items-center gap-2 rounded-md border px-2 py-1 transition ${
          active ? 'border-accent-line bg-accent-soft' : 'border-line'
        }`}
      >
        <Tooltip label={t('brush.apply')}>
          <button type="button" onClick={() => applyBrushPreset(p.id, p.brush)}>
            <BrushPreview brush={p.brush} />
          </button>
        </Tooltip>
        {renaming?.id === p.id ? (
          <input
            autoFocus
            type="text"
            value={renaming.value}
            onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
            onBlur={() => {
              void renameBrush(p.id, renaming.value)
              setRenaming(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void renameBrush(p.id, renaming.value)
                setRenaming(null)
              }
              if (e.key === 'Escape') setRenaming(null)
            }}
            className="border-accent-line bg-chip text-body w-full min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs outline-none"
          />
        ) : (
          <Tooltip label={t('brush.rename')}>
            <button
              type="button"
              onClick={() => setRenaming({ id: p.id, value: p.name })}
              className="text-body hover:text-accent-text flex-1 truncate text-left text-xs"
            >
              {p.name}
            </button>
          </Tooltip>
        )}
        <Tooltip label={t('brush.overwrite')}>
          <button
            type="button"
            onClick={() => void overwriteBrush(p.id)}
            className="text-muted hover:text-body text-overline transition"
          >
            ↻
          </button>
        </Tooltip>
        {deleting === p.id ? (
          <Tooltip label={t('brush.confirmDelete')}>
            <button
              type="button"
              onClick={() => {
                void deleteBrushPreset(p.id)
                setDeleting(null)
              }}
              className="text-overline rounded border border-red-500/60 bg-red-500/10 px-1 text-red-400"
            >
              {t('brush.confirmDelete')}
            </button>
          </Tooltip>
        ) : (
          <Tooltip label={t('brush.delete')}>
            <button
              type="button"
              onClick={() => setDeleting(p.id)}
              className="text-muted text-overline transition hover:text-red-400"
            >
              ✕
            </button>
          </Tooltip>
        )}
      </div>
    )
  }

  return (
    <Section title={t('panel.brush')} icon="brush">
      <Slider
        label={t('brush.size')}
        title={t('brush.size.desc')}
        value={brush.size}
        min={1}
        max={16}
        display={(v) => `${v}×${v}`}
        onChange={(v) => patchBrush({ size: v })}
      />
      <div className="flex flex-wrap gap-1">
        {[1, 2, 3, 4, 5, 8].map((s) => (
          <Chip
            key={s}
            active={brush.size === s && brush.pattern.every(Boolean)}
            title={`${s}×${s}`}
            onClick={() => patchBrush({ size: s })}
          >
            {s}
          </Chip>
        ))}
      </div>

      {isSquare ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted text-xs">{t('brush.tip')}</span>
          <div
            className="grid w-full gap-px"
            style={{ gridTemplateColumns: `repeat(${brush.size}, minmax(0, 1fr))` }}
          >
            {brush.pattern.map((on, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={`border-line aspect-square min-w-0 border transition ${
                  on ? 'bg-indigo-400' : 'bg-chip hover:bg-chip-active'
                }`}
              />
            ))}
          </div>
          <TipChips brush={brush} onPick={(pattern) => patchBrush({ pattern })} />
        </div>
      ) : (
        <p className="text-muted text-label">{t('brush.squareOnly')}</p>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-muted text-xs" title={t('style.shape.desc')}>
          {t('style.shape')}
        </span>
        <ShapeTileGrid
          shape={brush.shape ?? docStyle.shape}
          onPick={(id) => {
            patchBrush({ shape: id })
            patchStyle({ shape: id })
          }}
          ariaLabel={t('style.shape')}
        />
      </div>

      <CheckRow
        label={t('brush.snap')}
        title={t('brush.snap.desc')}
        checked={brushSnap}
        onChange={setBrushSnap}
      />

      <div className="flex flex-col gap-1">
        <span className="text-muted flex items-center gap-2 text-xs">
          {t('brush.presets')}
          {brushId === null && (
            <span className="border-accent-line text-accent-text text-overline rounded border px-1">
              {t('brush.custom')}
            </span>
          )}
        </span>
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {BUILTIN_LIST.map(({ id, brush: b }) => (
            <button
              key={id}
              type="button"
              onClick={() => applyBrushPreset(id, b)}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 transition ${
                brushId === id
                  ? 'border-accent-line bg-accent-soft'
                  : 'border-line hover:border-chip-line'
              }`}
            >
              <BrushPreview brush={b} />
              <span className="text-body flex-1 truncate text-left text-xs">
                {t(brushNameKey(id))}
              </span>
              <Tooltip label={t('brush.builtin')}>
                <span className="text-muted text-overline">★</span>
              </Tooltip>
            </button>
          ))}
          {brushesReady && brushPresets.map(userRow)}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={name}
            placeholder={t('brush.savePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCurrent()
            }}
            className="border-line bg-chip text-body focus:border-accent-line min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none"
          />
          <Button type="button" onClick={saveCurrent} className="h-auto px-2.5 py-1 text-xs">
            {t('brush.save')}
          </Button>
        </div>
      </div>
    </Section>
  )
}
