import { useState } from 'react'

import type { ImportResult } from '../../engine/import/index.ts'
import type { PaletteEdit } from '../../engine/import/palette.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { ColorPicker } from '../../shared/ui/color-picker.component.tsx'
import { Chip, ColorSwatch } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Editor of the converted palette — the exact color set the import will put into the document. Tap
 * a swatch to recolor it with the full picker, drop it from the palette (its pixels remap to the
 * nearest survivor), mark one color transparent (its pixels become empty), add and reset. Pure
 * post-processing: nothing here re-runs the conversion.
 */
export function ImportPaletteEditor({
  result,
  edit,
  onChange,
}: {
  result: ImportResult | null
  edit: PaletteEdit | null
  onChange: (edit: PaletteEdit | null) => void
}) {
  const { t } = useI18n()
  const brushColor = useStore((s) => s.color)
  const colors = edit?.colors ?? result?.palette ?? []
  const transparent = edit?.transparent ?? null
  // the selection is an index, so the picker survives recoloring of its own slot
  const [selected, setSelected] = useState<number | null>(null)

  if (!result || colors.length === 0) return null

  const update = (colors: string[], transparent: string | null): void =>
    onChange({ colors, transparent })

  const remove = (i: number): void => {
    update(
      colors.filter((_, k) => k !== i),
      transparent?.toLowerCase() === colors[i].toLowerCase() ? null : transparent,
    )
    setSelected(null)
  }

  const toggleTransparent = (i: number): void => {
    const hex = colors[i]
    if (transparent?.toLowerCase() === hex.toLowerCase()) {
      update([...colors, hex], null)
      return
    }
    update(
      colors.filter((_, k) => k !== i),
      hex,
    )
    setSelected(null)
  }

  const selectedColor = selected == null ? null : (colors[selected] ?? null)
  const isTransparentSel = selectedColor != null && transparent?.toLowerCase() === selectedColor

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">
          {t('import.paletteEdit.title')}
          <span className="text-overline ml-1.5 tabular-nums">{colors.length}</span>
        </span>
        <div className="flex items-center gap-1">
          {edit && (
            <Tooltip label={t('import.paletteEdit.reset.desc')}>
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setSelected(null)
                }}
                className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:min-h-11"
              >
                {t('import.paletteEdit.reset')}
              </button>
            </Tooltip>
          )}
          <Tooltip label={t('import.paletteEdit.add.desc')}>
            <button
              type="button"
              onClick={() => {
                update([...colors, brushColor], transparent)
                setSelected(colors.length)
              }}
              className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-2 py-1 text-xs transition max-lg:min-h-11 max-lg:px-3"
            >
              + {t('import.paletteEdit.add')}
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-1 max-lg:grid-cols-6">
        {colors.map((hex, i) => (
          <ColorSwatch
            key={`${hex}-${i}`}
            hex={hex}
            active={selected === i}
            label={
              transparent?.toLowerCase() === hex.toLowerCase()
                ? `${hex} — ${t('import.paletteEdit.transparent')}`
                : hex
            }
            onPick={() => setSelected((cur) => (cur === i ? null : i))}
            className="h-7 max-lg:h-11"
          />
        ))}
      </div>
      {transparent && (
        <span className="text-muted text-overline">
          {t('import.paletteEdit.transparentOn')}: <span className="font-mono">{transparent}</span>
        </span>
      )}

      {selected != null && selectedColor && (
        <div className="border-line flex flex-col gap-2 rounded-md border p-2">
          <ColorPicker
            key={selected}
            color={selectedColor}
            onChange={(hex) =>
              update(
                colors.map((c, k) => (k === selected ? hex : c)),
                transparent,
              )
            }
          />
          <div className="flex flex-wrap items-center gap-1">
            <Chip
              active={isTransparentSel}
              title={t('import.paletteEdit.transparent.desc')}
              onClick={() => toggleTransparent(selected)}
            >
              {t('import.paletteEdit.transparent')}
            </Chip>
            <button
              type="button"
              onClick={() => remove(selected)}
              className="rounded border border-red-500/60 bg-red-500/10 px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/20 max-lg:min-h-11 max-lg:px-3"
            >
              {t('import.paletteEdit.remove')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
