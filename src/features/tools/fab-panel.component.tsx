import { useState, type ReactElement } from 'react'

import {
  BRUSH_SHAPES,
  detectBrushShape,
  type Brush,
  type BrushShapeId,
} from '../../engine/brush.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { QUICK_COLORS } from '../../shared/lib/quick-colors.util.ts'
import { ColorPicker } from '../../shared/ui/color-picker.component.tsx'
import { Chip, ColorSwatch, hexLuminance, Slider } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Quick-access fab panel docked at the top-left of the canvas on every breakpoint (Fresco/Procreate
 * pattern): current brush color, pixel size and the tip shapes. Collapses to the current tip drawn
 * in the working color; the full settings stay in the right panel. Mobile hit targets follow the
 * 44px rule, desktop keeps the compact 28px plates.
 */
/** Silhouette glyphs of the built-in tip shapes (stroke shapes keep `fill="none"`). */
const TIP_SHAPE_GLYPHS: Record<BrushShapeId, ReactElement> = {
  square: <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />,
  circle: <circle cx="8" cy="8" r="5.5" />,
  diamond: <path d="M8 1.8L14.2 8 8 14.2 1.8 8z" />,
  checker: (
    <>
      <rect x="2" y="2" width="5.6" height="5.6" rx="1" />
      <rect x="8.4" y="8.4" width="5.6" height="5.6" rx="1" />
      <rect x="8.4" y="2" width="5.6" height="5.6" rx="1" opacity=".4" />
      <rect x="2" y="8.4" width="5.6" height="5.6" rx="1" opacity=".4" />
    </>
  ),
  ring: <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="3" />,
  frame: (
    <rect
      x="3.5"
      y="3.5"
      width="9"
      height="9"
      rx="1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    />
  ),
  cross: <path d="M6.4 2h3.2v4.4H14v3.2H9.6V14H6.4V9.6H2V6.4h4.4z" />,
  diag: (
    <path
      d="M3.2 12.8L12.8 3.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
    />
  ),
}

/** Silhouette of one built-in tip shape. */
function TipShapeGlyph({ shape }: { shape: BrushShapeId }) {
  return TIP_SHAPE_GLYPHS[shape]
}

/** The current tip as a glyph: the shape silhouette, or the real lattice for hand-edited tips. */
function FabTipGlyph({
  brush,
  color,
  className,
}: {
  brush: Brush
  color: string
  className?: string
}) {
  const shape = detectBrushShape(brush)
  if (shape === 'custom') {
    return (
      <svg
        viewBox={`0 0 ${brush.size} ${brush.size}`}
        className={className}
        style={{ color }}
        fill="currentColor"
        shapeRendering="crispEdges"
        aria-hidden
      >
        {brush.pattern.map((on, i) =>
          on ? (
            <rect
              key={i}
              x={i % brush.size}
              y={Math.floor(i / brush.size)}
              width="0.94"
              height="0.94"
            />
          ) : null,
        )}
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      style={{ color }}
      fill="currentColor"
      aria-hidden
    >
      <TipShapeGlyph shape={shape} />
    </svg>
  )
}
/** The color plate of the fab, auto-contrasted with an inner hairline. */
function FabSwatch({ color, side }: { color: string; side: string }) {
  return (
    <span
      className={`block ${side} rounded-md transition`}
      style={{
        background: color,
        boxShadow: `inset 0 0 0 1px ${
          hexLuminance(color) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)'
        }`,
      }}
    />
  )
}

/** Collapsed fab: the current tip drawn in the working color plus an expand affordance. */
function FabCollapsed({
  brush,
  color,
  expandLabel,
  onExpand,
}: {
  brush: Brush
  color: string
  expandLabel: string
  onExpand: () => void
}) {
  return (
    <div className="border-line bg-panel/95 absolute top-2 left-2 z-10 flex flex-col items-center gap-1 rounded-xl border p-1 shadow-lg backdrop-blur">
      <Tooltip label={expandLabel}>
        <button
          type="button"
          aria-label={expandLabel}
          onClick={onExpand}
          className="hover:bg-chip-active flex h-11 w-11 items-center justify-center rounded-md p-1 transition lg:h-8 lg:w-8"
        >
          <span
            className="block h-full w-full"
            style={{
              filter: `drop-shadow(0 0 1px ${
                hexLuminance(color) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
              })`,
            }}
          >
            <FabTipGlyph brush={brush} color={color} className="h-full w-full" />
          </span>
        </button>
      </Tooltip>
      <Tooltip label={expandLabel}>
        <button
          type="button"
          aria-label={expandLabel}
          onClick={onExpand}
          className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition lg:h-7 lg:w-7"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6.5 4l4 4-4 4" />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}

export function FabPanel() {
  const { t } = useI18n()
  const fabOpen = useStore((s) => s.fabOpen)
  const toggleFab = useStore((s) => s.toggleFab)
  const color = useStore((s) => s.color)
  const setColor = useStore((s) => s.setColor)
  const selection = useStore((s) => s.selection)
  const fillSelection = useStore((s) => s.fillSelection)
  const brush = useStore((s) => s.brush)
  const patchBrush = useStore((s) => s.patchBrush)
  const [pickerOpen, setPickerOpen] = useState(false)
  // picking with a selection active re-fills it — same behavior as the right panel
  const applyColor = (h: string) => {
    setColor(h)
    if (selection.length > 0) fillSelection()
  }
  const setTip = (pattern: boolean[]) => patchBrush({ pattern })
  const collapse = () => {
    setPickerOpen(false)
    toggleFab()
  }

  const collapseBtn = (label: string, chevron: string) => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={collapse}
        className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition lg:h-7 lg:w-7"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={chevron} />
        </svg>
      </button>
    </Tooltip>
  )

  if (!fabOpen) {
    return (
      <FabCollapsed
        brush={brush}
        color={color}
        expandLabel={t('panel.fabExpand')}
        onExpand={toggleFab}
      />
    )
  }

  return (
    <div className="border-line bg-panel/95 absolute top-2 left-2 z-10 flex max-h-[calc(100%-1rem)] w-48 flex-col gap-2.5 overflow-y-auto rounded-xl border p-3 shadow-lg backdrop-blur">
      <div className="flex items-center gap-2">
        <Tooltip label={t('picker.brush')}>
          <button
            type="button"
            aria-label={t('picker.brush')}
            aria-pressed={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
            className={`shrink-0 rounded-md transition ${
              pickerOpen ? 'ring-accent-text ring-offset-panel ring-2 ring-offset-1' : ''
            }`}
          >
            <FabSwatch color={color} side="h-11 w-11 lg:h-7 lg:w-7" />
          </button>
        </Tooltip>
        <span className="text-body min-w-0 flex-1 truncate font-mono text-xs">{color}</span>
        {collapseBtn(t('panel.fabCollapse'), 'M9.5 4L5.5 8l4 4')}
      </div>
      {pickerOpen && <ColorPicker color={color} onChange={applyColor} />}

      <div className="grid grid-cols-4 gap-1 lg:grid-cols-6">
        {QUICK_COLORS.map((c) => (
          <ColorSwatch
            key={c}
            hex={c}
            active={color.toLowerCase() === c}
            label={c}
            onPick={() => applyColor(c)}
            className="max-lg:h-11"
          />
        ))}
      </div>

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
            className="h-11 lg:h-auto"
          >
            {s}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted text-xs">{t('brush.tip')}</span>
        <div className="grid grid-cols-4 gap-1">
          {BRUSH_SHAPES.map(({ id, make }) => (
            <Chip
              key={id}
              active={detectBrushShape(brush) === id}
              title={t(`brush.${id}` as 'brush.square')}
              ariaLabel={t(`brush.${id}` as 'brush.square')}
              onClick={() => setTip(make(brush.size).pattern)}
              className="h-11 lg:h-auto"
            >
              <span className="flex items-center justify-center">
                <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <TipShapeGlyph shape={id} />
                </svg>
              </span>
            </Chip>
          ))}
        </div>
      </div>
    </div>
  )
}
