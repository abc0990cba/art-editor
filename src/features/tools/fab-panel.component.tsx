import { useState } from 'react'

import { circleBrush, checkerBrush, diamondBrush, squareBrush } from '../../engine/brush.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { QUICK_COLORS } from '../../shared/lib/quick-colors.util.ts'
import { ColorPicker } from '../../shared/ui/color-picker.component.tsx'
import { Chip, ColorSwatch, hexLuminance, Slider } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Desktop quick-access fab panel docked beside the tool rail (Fresco/Procreate pattern): current
 * brush color, pixel size and the tip shapes. Collapses to the color swatch; the full settings stay
 * in the right panel. Phones/tablets use the bottom strip instead.
 */
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

  const swatch = (side: string) => (
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

  const collapseBtn = (label: string, chevron: string) => (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={collapse}
        className="text-muted hover:bg-chip-active hover:text-body flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition"
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
    // collapsed: the current color dot plus an expand affordance, Fresco-style
    return (
      <div className="border-line bg-panel/95 absolute top-2 left-2 z-10 hidden flex-col items-center gap-1 rounded-xl border p-1 shadow-lg backdrop-blur lg:flex">
        <Tooltip label={t('panel.fabExpand')}>
          <button
            type="button"
            aria-label={t('panel.fabExpand')}
            onClick={toggleFab}
            className="hover:bg-chip-active flex h-8 w-8 items-center justify-center rounded-md p-1 transition"
          >
            {swatch('h-full w-full')}
          </button>
        </Tooltip>
        {collapseBtn(t('panel.fabExpand'), 'M6.5 4l4 4-4 4')}
      </div>
    )
  }

  return (
    <div className="border-line bg-panel/95 absolute top-2 left-2 z-10 hidden max-h-[calc(100%-1rem)] w-48 flex-col gap-2.5 overflow-y-auto rounded-xl border p-3 shadow-lg backdrop-blur lg:flex">
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
            {swatch('h-7 w-7')}
          </button>
        </Tooltip>
        <span className="text-body min-w-0 flex-1 truncate font-mono text-xs">{color}</span>
        {collapseBtn(t('panel.fabCollapse'), 'M9.5 4L5.5 8l4 4')}
      </div>
      {pickerOpen && <ColorPicker color={color} onChange={applyColor} />}

      <div className="grid grid-cols-6 gap-1">
        {QUICK_COLORS.map((c) => (
          <ColorSwatch
            key={c}
            hex={c}
            active={color.toLowerCase() === c}
            label={c}
            onPick={() => applyColor(c)}
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
          >
            {s}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted text-xs">{t('brush.tip')}</span>
        <div className="grid grid-cols-2 gap-1">
          <Chip title={t('brush.square')} onClick={() => setTip(squareBrush(brush.size).pattern)}>
            {t('brush.square')}
          </Chip>
          <Chip title={t('brush.circle')} onClick={() => setTip(circleBrush(brush.size).pattern)}>
            {t('brush.circle')}
          </Chip>
          <Chip title={t('brush.diamond')} onClick={() => setTip(diamondBrush(brush.size).pattern)}>
            {t('brush.diamond')}
          </Chip>
          <Chip title={t('brush.checker')} onClick={() => setTip(checkerBrush(brush.size).pattern)}>
            {t('brush.checker')}
          </Chip>
        </div>
      </div>
    </div>
  )
}
