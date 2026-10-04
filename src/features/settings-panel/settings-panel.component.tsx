import { useEffect, useRef, useState } from 'react'

import { PALETTES, matchedPresetId } from '../../engine/color/index.ts'
import { serializeGpl, serializeHex } from '../../engine/color/palette-io.ts'
import { isPlainSquare } from '../../engine/grids/index.ts'
import {
  BUILTIN_PRESETS,
  configMatchesState,
  isBuiltinPreset,
  type EditorPreset,
} from '../../engine/presets/index.ts'
import { presetPreviewDataURL } from '../../engine/presets/preview.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { readPaletteFile, palettePngBlob } from '../../shared/lib/palette-files.util.ts'
import { QUICK_COLORS } from '../../shared/lib/quick-colors.util.ts'
import { ColorPicker } from '../../shared/ui/color-picker.component.tsx'
import { FillStyleControls } from '../../shared/ui/fill-style-controls.component.tsx'
import { CheckRow, Chip, ColorSwatch, hexLuminance, Section } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GlyphEditor } from '../glyph-editor/glyph-editor.component.tsx'
import { LayersPanel } from '../layers/layers-panel.component.tsx'
import {
  NodePresetsPanel,
  ObjectGraphPanel,
} from '../nodes-editor/object-graph-panel.component.tsx'
import { BrushSection } from './brush-section.component.tsx'
import { CanvasSection } from './canvas-section.component.tsx'
import { PresetsDialog } from './presets-dialog.component.tsx'
import { StyleSection } from './style-section.component.tsx'
import { SymmetrySection } from './symmetry-section.component.tsx'
import { TextureSection } from './texture-section.component.tsx'
import { useStyleTarget } from './use-style-target.hook.ts'

export const PANEL_SECTIONS: readonly { id: string; titleKey: string; icon: string }[] = [
  { id: 'color', titleKey: 'panel.color', icon: 'color' },
  { id: 'layers', titleKey: 'panel.layers', icon: 'layers' },
  { id: 'nodes', titleKey: 'panel.nodePresets', icon: 'nodes' },
  { id: 'brush', titleKey: 'panel.brush', icon: 'brush' },
  { id: 'glyphs', titleKey: 'glyph.editor', icon: 'glyph' },
  { id: 'presets', titleKey: 'panel.presets', icon: 'presets' },
  { id: 'style', titleKey: 'panel.style', icon: 'style' },
  { id: 'texture', titleKey: 'panel.texture', icon: 'texture' },
  { id: 'symmetry', titleKey: 'panel.symmetry', icon: 'symmetry' },
  { id: 'canvas', titleKey: 'panel.canvas', icon: 'canvas' },
]

export function SettingsPanel({
  openSection,
  onOpenSection,
  className = 'flex min-h-0 w-full flex-1 flex-col',
}: {
  /** Reveal + scroll to this section when the panel mounts/updates */
  openSection?: string | null
  onOpenSection?: (id: string) => void
  className?: string
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const color = useStore((s) => s.color)
  const symmetry = useStore((s) => s.symmetry)

  const setStyleScope = useStore((s) => s.setStyleScope)
  const selection = useStore((s) => s.selection)
  const clearSelection = useStore((s) => s.clearSelection)
  const fillSelection = useStore((s) => s.fillSelection)
  const patchFillStyle = useStore((s) => s.patchFillStyle)

  const recent = useStore((s) => s.recent)
  const applyPalette = useStore((s) => s.applyPalette)
  const paletteAutoApply = useStore((s) => s.paletteAutoApply)
  const setPaletteAutoApply = useStore((s) => s.setPaletteAutoApply)
  const replacePalette = useStore((s) => s.replacePalette)
  const applyPreset = useStore((s) => s.applyPreset)
  const requestFit = useStore((s) => s.requestFit)

  const userPresets = useStore((s) => s.presets)

  const paletteFileRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  // modal preview shown when a symmetry mode is picked
  // colors offered for painting when a palette is picked without recoloring the canvas
  const [availableColors, setAvailableColors] = useState<string[]>([])

  const importPaletteFile = async (file: File) => {
    const colors = await readPaletteFile(file)
    if (colors && colors.length > 0) replacePalette(colors)
  }

  const exportPalette = (fmt: 'hex' | 'gpl' | 'png') => {
    if (fmt === 'png') {
      palettePngBlob(doc.palette).then((b) => b && download(b, `glyph-palette-${stamp()}.png`))
      return
    }
    const text =
      fmt === 'hex' ? serializeHex(doc.palette) : serializeGpl('Glyph Editor Palette', doc.palette)
    download(new Blob([text], { type: 'text/plain' }), `glyph-palette-${stamp()}.${fmt}`)
  }

  const allPresets: EditorPreset[] = [...BUILTIN_PRESETS, ...userPresets]
  const activePresetId =
    allPresets.find((p) => configMatchesState(p.config, doc, symmetry))?.id ?? null
  const presetName = (p: EditorPreset) =>
    isBuiltinPreset(p) ? t(`presetName.${p.id}` as 'presetName.builtin.mandala') : p.name

  // selection-aware target shared by the extracted style/texture sections
  const target = useStyleTarget(doc, selection)

  // the eraser "color" is transparency, Photoshop-style: a checkerboard swatch with the
  // classic red slash, so the brush/eraser pair reads like a foreground/background well
  const eraserSwatchStyle: React.CSSProperties = {
    backgroundImage:
      'linear-gradient(45deg, transparent 45.5%, #e63946 45.5%, #e63946 54.5%, transparent 54.5%), conic-gradient(#9aa0b4 25%, #e8ebf2 0 50%, #9aa0b4 0 75%, #e8ebf2 0)',
    backgroundSize: '100% 100%, 8px 8px',
  }

  // shown on the collapsed palette-library header: which preset the document palette is
  const activePalette = PALETTES.find((p) => matchedPresetId(doc.palette) === p.id)

  useEffect(() => {
    if (!openSection) return
    const meta = PANEL_SECTIONS.find((x) => x.id === openSection)
    if (!meta) return
    const sum = [...document.querySelectorAll('summary')].find(
      (x) => x.textContent?.trim() === t(meta.titleKey as 'panel.color'),
    )
    if (sum) {
      const det = sum.closest('details')
      if (det && !det.open) sum.click()
      sum.scrollIntoView({ block: 'start' })
    }
    onOpenSection?.(openSection)
    // t is stable per language; the lookup is intentionally DOM-based (sections are plain details)
  }, [openSection, t, onOpenSection])

  return (
    <aside className={className}>
      {/* one scroller for every section, color included — the scrollbar spans the whole panel */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* capped height with internal scrolling: when expanded past 60% of the window
            the palette list scrolls inside, so the sections below never get pushed away */}
        <Section
          title={t('panel.color')}
          icon="color"
          className="flex max-h-[60vh] flex-col overflow-hidden"
          contentClassName="min-h-0 overflow-y-auto"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative h-10 w-12">
              <Tooltip label={t('picker.eraser.desc')}>
                <button
                  type="button"
                  onClick={() => {
                    setTool('eraser')
                    setPickerOpen(false)
                  }}
                  aria-pressed={tool === 'eraser'}
                  className={`absolute right-0 bottom-0 h-7 w-7 rounded-md border transition ${
                    tool === 'eraser'
                      ? 'ring-accent-text ring-offset-panel z-20 border-transparent ring-2 ring-offset-1'
                      : 'border-chip-line z-0 opacity-80 hover:opacity-100'
                  }`}
                  style={eraserSwatchStyle}
                />
              </Tooltip>
              <Tooltip label={t('picker.brush.desc')}>
                <button
                  type="button"
                  onClick={() => {
                    // clicking the brush half makes the brush the active target again
                    // (like foreground/background in Photoshop) and opens the picker
                    const wasEraser = tool === 'eraser'
                    if (wasEraser) setTool('pencil')
                    setPickerOpen(wasEraser ? true : !pickerOpen)
                  }}
                  aria-pressed={tool !== 'eraser'}
                  className={`absolute top-0 left-0 h-7 w-7 rounded-md transition ${
                    tool === 'eraser'
                      ? 'z-0 opacity-80 hover:opacity-100'
                      : 'ring-accent-text ring-offset-panel z-20 ring-2 ring-offset-1'
                  }`}
                  style={{
                    background: color,
                    boxShadow: `inset 0 0 0 1px ${
                      hexLuminance(color) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)'
                    }`,
                  }}
                />
              </Tooltip>
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-body truncate font-mono text-xs">{color}</span>
              <span className="text-muted text-overline">
                {tool === 'eraser' ? t('tool.eraser') : t('picker.brush')}
              </span>
            </div>
          </div>
          {pickerOpen && <ColorPicker color={color} onChange={target.applyColor} />}
          {availableColors.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">{t('palette.available')}</span>
              <div className="grid grid-cols-6 gap-1">
                {availableColors.map((c) => (
                  <ColorSwatch
                    key={c}
                    hex={c}
                    active={color.toLowerCase() === c}
                    label={c}
                    onPick={() => target.applyColor(c)}
                  />
                ))}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">{t('picker.recent')}</span>
              <div className="grid grid-cols-6 gap-1">
                {recent.map((h) => (
                  <ColorSwatch
                    key={h}
                    hex={h}
                    active={color.toLowerCase() === h}
                    label={h}
                    onPick={() => target.applyColor(h)}
                  />
                ))}
              </div>
            </div>
          )}
          {/* palette library: collapsed by default — the full list pushed everything
              else out of view; the header strip keeps the active palette visible */}
          <details className="group/pal border-line flex flex-col rounded-md border">
            <summary className="text-muted hover:text-body flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
              <span className="shrink-0">{t('palette.presets')}</span>
              {activePalette && (
                <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-sm">
                  {activePalette.colors.map((c) => (
                    <span key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
              )}
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3 shrink-0 transition-transform group-open/pal:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </summary>
            <div className="flex flex-col gap-1 px-2 pb-2">
              <CheckRow
                label={t('palette.applyToCanvas')}
                title={t('palette.applyToCanvas.desc')}
                checked={paletteAutoApply}
                onChange={setPaletteAutoApply}
              />
              {PALETTES.map((p) => {
                const active = matchedPresetId(doc.palette) === p.id
                return (
                  <Tooltip key={p.id} label={t(`palette.${p.id}.desc` as 'palette.classic12.desc')}>
                    <button
                      type="button"
                      onClick={() => {
                        if (paletteAutoApply) {
                          applyPalette(p)
                          setAvailableColors([])
                        } else {
                          setAvailableColors(p.colors)
                        }
                      }}
                      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 transition ${
                        active
                          ? 'border-accent-line bg-accent-soft'
                          : 'border-line hover:border-chip-line'
                      }`}
                    >
                      <span className="flex h-3 flex-1 overflow-hidden rounded-sm">
                        {p.colors.map((c) => (
                          <span key={c} className="flex-1" style={{ background: c }} />
                        ))}
                      </span>
                      <span className="text-body w-28 text-left text-xs">
                        {t(`palette.${p.id}` as 'palette.classic12')}
                      </span>
                    </button>
                  </Tooltip>
                )
              })}
              <div className="flex flex-wrap gap-1">
                <Chip onClick={() => paletteFileRef.current?.click()}>{t('palette.import')}</Chip>
                <Chip onClick={() => exportPalette('hex')}>{t('palette.export.hex')}</Chip>
                <Chip onClick={() => exportPalette('gpl')}>{t('palette.export.gpl')}</Chip>
                <Chip onClick={() => exportPalette('png')}>PNG</Chip>
              </div>
              <input
                ref={paletteFileRef}
                type="file"
                accept=".hex,.gpl,.txt,image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importPaletteFile(file)
                  e.target.value = ''
                }}
              />
            </div>
          </details>
          {/* one merged swatch grid: the document palette plus quick extras — deduped */}
          {(() => {
            const seen = new Set<string>()
            const merged: string[] = []
            for (const h of [...doc.palette, ...QUICK_COLORS]) {
              const k = h.toLowerCase()
              if (!seen.has(k)) {
                seen.add(k)
                merged.push(h)
              }
            }
            return (
              <div className="grid grid-cols-6 gap-1">
                {merged.map((h) => (
                  <ColorSwatch
                    key={h}
                    hex={h}
                    active={color.toLowerCase() === h}
                    label={h}
                    onPick={() => target.applyColor(h)}
                  />
                ))}
              </div>
            )
          })()}
        </Section>

        <LayersPanel />
        <NodePresetsPanel />
        <ObjectGraphPanel />
        <BrushSection />
        <GlyphEditor />
        <Section title={t('panel.presets')} icon="presets">
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {allPresets.map((p) => {
              const active = p.id === activePresetId
              const builtin = isBuiltinPreset(p)
              return (
                <Tooltip key={p.id} label={presetName(p)}>
                  <button
                    type="button"
                    onClick={() => {
                      applyPreset(p)
                      requestFit()
                    }}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 transition ${
                      active
                        ? 'border-accent-line bg-accent-soft'
                        : 'border-line hover:border-chip-line'
                    }`}
                  >
                    <img
                      src={presetPreviewDataURL(p, 48)}
                      alt=""
                      className="border-line h-6 w-6 shrink-0 rounded-sm border object-contain"
                    />
                    <span className="text-body flex-1 truncate text-left text-xs">
                      {presetName(p)}
                    </span>
                    {builtin && <span className="text-muted text-overline">★</span>}
                  </button>
                </Tooltip>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setPresetsOpen(true)}
            className="border-line bg-chip text-body hover:border-chip-line w-full rounded-md border px-3 py-1.5 text-xs transition"
          >
            {t('presets.manage')}
          </button>
          {presetsOpen && <PresetsDialog onClose={() => setPresetsOpen(false)} />}
        </Section>
        {target.targetSelection && (
          <Section title={t('panel.fillSelection')} icon="color">
            <FillStyleControls
              onPatch={(patch) => {
                patchFillStyle(patch)
                fillSelection()
              }}
            />
            <p className="text-muted text-overline">{t('fill.selection.hint')}</p>
          </Section>
        )}

        <StyleSection
          target={target}
          doc={doc}
          selection={selection}
          clearSelection={clearSelection}
          setStyleScope={setStyleScope}
        />

        {isPlainSquare(doc) && <TextureSection target={target} />}

        <SymmetrySection />

        <CanvasSection />
      </div>
    </aside>
  )
}
