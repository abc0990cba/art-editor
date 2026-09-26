import { useRef, useState } from 'react'

import type { PixelStyle } from '../../engine/doc.ts'
import { serializeGpl, serializeHex } from '../../engine/palette-io.ts'
import { PALETTES, matchedPresetId } from '../../engine/palettes.ts'
import { presetPreviewDataURL } from '../../engine/preset-preview.ts'
import {
  BUILTIN_PRESETS,
  configMatchesState,
  isBuiltinPreset,
  type EditorPreset,
} from '../../engine/presets.ts'
import {
  MAX_CELL,
  MIN_CELL,
  TILING_MODES,
  WALLPAPER_MODES,
  isRepeat,
} from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { readPaletteFile, palettePngBlob } from '../../shared/lib/palette-files.util.ts'
import { ColorPicker } from '../../shared/ui/color-picker.component.tsx'
import { FillStyleControls } from '../../shared/ui/fill-style-controls.component.tsx'
import {
  CheckRow,
  Chip,
  ColorInput,
  ColorSwatch,
  hexLuminance,
  Section,
  Slider,
} from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GlyphEditor } from '../glyph-editor/glyph-editor.component.tsx'
import { LayersPanel } from '../layers/layers-panel.component.tsx'
import {
  NodePresetsPanel,
  ObjectGraphPanel,
} from '../nodes-editor/object-graph-panel.component.tsx'
import { BrushSection } from './brush-section.component.tsx'
import { PresetsDialog } from './presets-dialog.component.tsx'
import { PixelStylePreview, TexturePreview } from './style-previews.component.tsx'
import { SymmetryPreviewDialog } from './symmetry-preview-dialog.component.tsx'

const QUICK_COLORS = [
  '#f5f5f0',
  '#1a1a1e',
  '#e63946',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#4361ee',
  '#7209b7',
  '#f72585',
  '#3a86ff',
  '#8ac926',
  '#ff9f1c',
]

export function SettingsPanel({
  className = 'flex w-64 shrink-0 flex-col border-l border-line bg-panel',
}: {
  className?: string
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const color = useStore((s) => s.color)
  const setColor = useStore((s) => s.setColor)
  const symmetry = useStore((s) => s.symmetry)
  const patchSymmetry = useStore((s) => s.patchSymmetry)
  const showGrid = useStore((s) => s.showGrid)
  const setShowGrid = useStore((s) => s.setShowGrid)
  const patchStyle = useStore((s) => s.patchStyle)
  const patchMetaball = useStore((s) => s.patchMetaball)
  const patchTexture = useStore((s) => s.patchTexture)
  const setStyleScope = useStore((s) => s.setStyleScope)
  const selection = useStore((s) => s.selection)
  const clearSelection = useStore((s) => s.clearSelection)
  const restyleSelection = useStore((s) => s.restyleSelection)
  const fillSelection = useStore((s) => s.fillSelection)
  const patchFillStyle = useStore((s) => s.patchFillStyle)
  const setBg = useStore((s) => s.setBg)
  const setConnectorWidth = useStore((s) => s.setConnectorWidth)
  const setRenderMode = useStore((s) => s.setRenderMode)
  const setConnectivity = useStore((s) => s.setConnectivity)
  const recent = useStore((s) => s.recent)
  const applyPalette = useStore((s) => s.applyPalette)
  const paletteAutoApply = useStore((s) => s.paletteAutoApply)
  const setPaletteAutoApply = useStore((s) => s.setPaletteAutoApply)
  const replacePalette = useStore((s) => s.replacePalette)
  const applyPreset = useStore((s) => s.applyPreset)
  const requestFit = useStore((s) => s.requestFit)
  const setRadialEven = useStore((s) => s.setRadialEven)
  const fillScope = useStore((s) => s.fillScope)
  const setFillScope = useStore((s) => s.setFillScope)
  const userPresets = useStore((s) => s.presets)

  const paletteFileRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [presetsOpen, setPresetsOpen] = useState(false)
  // modal preview shown when a symmetry mode is picked
  const [symPreviewOpen, setSymPreviewOpen] = useState(false)
  // colors offered for painting when a palette is picked without recoloring the canvas
  const [availableColors, setAvailableColors] = useState<string[]>([])
  const pct = (v: number) => `${Math.round(v * 100)}%`

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

  const isRadial = symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
  const repeatActive = isRepeat(symmetry.mode)
  const isSquare = doc.gridType === 'square'

  // With a selection active in element scope the Style/Texture sections target the selected
  // elements (values shown from the first one); otherwise they edit the drawing style.
  const elementMode = doc.styleScope === 'element'
  const targetSelection = elementMode && selection.length > 0
  const firstEl = targetSelection ? doc.elements[selection[0] - 1] : undefined
  const styleView = firstEl ? firstEl.style : doc.style
  const modeView = firstEl ? firstEl.renderMode : doc.renderMode
  const connView = firstEl ? firstEl.connectivity : doc.connectivity
  const mbView = firstEl ? firstEl.metaball : doc.metaball
  const texView = firstEl ? firstEl.texture : doc.texture
  const c = styleView.corners

  const applyStyle = (patch: Partial<PixelStyle>) =>
    targetSelection ? restyleSelection({ style: patch }) : patchStyle(patch)
  const applyRenderMode = (mode: typeof doc.renderMode) =>
    targetSelection ? restyleSelection({ renderMode: mode }) : setRenderMode(mode)
  const applyConnectivity = (conn: typeof doc.connectivity) =>
    targetSelection ? restyleSelection({ connectivity: conn }) : setConnectivity(conn)
  const applyMetaball = (patch: Partial<typeof doc.metaball>) =>
    targetSelection ? restyleSelection({ metaball: patch }) : patchMetaball(patch)
  const applyTexture = (patch: Partial<typeof doc.texture>) =>
    targetSelection ? restyleSelection({ texture: patch }) : patchTexture(patch)
  // picking a color with a selection active also re-fills the selected shapes with it
  const applyColor = (h: string) => {
    setColor(h)
    if (targetSelection) fillSelection()
  }

  // the eraser "color" is transparency, Photoshop-style: a checkerboard swatch with the
  // classic red slash, so the brush/eraser pair reads like a foreground/background well
  const eraserSwatchStyle: React.CSSProperties = {
    backgroundImage:
      'linear-gradient(45deg, transparent 45.5%, #e63946 45.5%, #e63946 54.5%, transparent 54.5%), conic-gradient(#9aa0b4 25%, #e8ebf2 0 50%, #9aa0b4 0 75%, #e8ebf2 0)',
    backgroundSize: '100% 100%, 8px 8px',
  }

  // shown on the collapsed palette-library header: which preset the document palette is
  const activePalette = PALETTES.find((p) => matchedPresetId(doc.palette) === p.id)

  return (
    <aside className={className}>
      {/* pinned color block: collapsible like every section (open by default), but kept
          outside the scrolling area so the current brush/eraser colors stay visible */}
      <div className="shrink-0">
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
          {pickerOpen && <ColorPicker color={color} onChange={applyColor} />}
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
                    onPick={() => applyColor(c)}
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
                    onPick={() => applyColor(h)}
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
                    onPick={() => applyColor(h)}
                  />
                ))}
              </div>
            )
          })()}
        </Section>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
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
        {targetSelection && (
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

        <Section title={t('panel.style')} icon="style">
          <PixelStylePreview
            style={styleView}
            renderMode={modeView}
            connectivity={connView}
            metaball={mbView}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <span title={t('style.scope.element.desc')}>{t('style.scope')}</span>
            <div className="flex gap-1">
              <Chip
                active={elementMode}
                title={t('style.scope.element.desc')}
                onClick={() => setStyleScope('element')}
              >
                {t('style.scope.element')}
              </Chip>
              <Chip
                active={!elementMode}
                title={t('style.scope.global.desc')}
                onClick={() => setStyleScope('global')}
              >
                {t('style.scope.global')}
              </Chip>
            </div>
          </div>
          {!elementMode && (
            <p className="text-muted text-overline">{t('style.scope.global.hint')}</p>
          )}
          {targetSelection && (
            <div className="border-accent-line bg-accent-soft text-accent-text flex items-center justify-between rounded-md border px-2 py-1 text-xs">
              <span>
                {t('style.target.selection')} · {selection.length}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="hover:bg-chip-active rounded px-1.5 py-0.5 transition"
              >
                {t('selection.clear')}
              </button>
            </div>
          )}
          <div className="text-muted text-overline font-semibold tracking-wider uppercase">
            {t('style.group.mode')}
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ['pixels', 'mode.pixels'],
                ['outline', 'mode.outline'],
                ['metaball', 'mode.metaball'],
              ] as const
            ).map(([mode, key]) => (
              <Chip
                key={mode}
                active={modeView === mode}
                title={t(`mode.${mode}.desc` as 'mode.pixels.desc')}
                onClick={() => applyRenderMode(mode)}
              >
                {t(key)}
              </Chip>
            ))}
          </div>
          {modeView !== 'pixels' && doc.gridType === 'square' && (
            <div className="flex flex-col gap-1">
              <span className="text-muted text-xs">{t('connectivity.label')}</span>
              <div className="flex gap-1.5">
                {(
                  [
                    ['edge', 'connectivity.edge'],
                    ['corner', 'connectivity.corner'],
                    ['corner-bridge', 'connectivity.bridge'],
                  ] as const
                ).map(([c, key]) => (
                  <Chip
                    key={c}
                    active={connView === c}
                    title={t(`connectivity.${c}.desc` as 'connectivity.edge.desc')}
                    onClick={() => applyConnectivity(c)}
                  >
                    {t(key)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {modeView !== 'metaball' && (
            <>
              {modeView === 'outline' ? (
                <>
                  <Slider
                    label={t('style.convex')}
                    title={t('style.convex.desc')}
                    value={styleView.convexRadius}
                    min={0}
                    max={0.5}
                    step={0.01}
                    display={pct}
                    onChange={(v) => applyStyle({ convexRadius: v })}
                  />
                  <Slider
                    label={t('style.concave')}
                    title={t('style.concave.desc')}
                    value={styleView.concaveRadius}
                    min={0}
                    max={0.5}
                    step={0.01}
                    display={pct}
                    onChange={(v) => applyStyle({ concaveRadius: v })}
                  />
                </>
              ) : (
                <Slider
                  label={t('style.radius')}
                  title={t('style.radius.desc')}
                  value={styleView.radius}
                  min={0}
                  max={0.5}
                  step={0.01}
                  display={pct}
                  onChange={(v) => applyStyle({ radius: v })}
                />
              )}
              <div className="text-muted flex items-center justify-between text-xs">
                <span>{t('style.cornerStyle')}</span>
                <div className="flex gap-1">
                  {(
                    [
                      ['arc', 'style.corner.arc'],
                      ['chamfer', 'style.corner.chamfer'],
                    ] as const
                  ).map(([cs, key]) => (
                    <Chip
                      key={cs}
                      active={styleView.cornerStyle === cs}
                      title={t(`style.corner.${cs}.desc` as 'style.corner.arc.desc')}
                      onClick={() => applyStyle({ cornerStyle: cs })}
                    >
                      {t(key)}
                    </Chip>
                  ))}
                </div>
              </div>
              {isSquare && (
                <CheckRow
                  label={t('style.squareEdges')}
                  title={t('style.squareEdges.desc')}
                  checked={styleView.squareEdges}
                  onChange={(v) => applyStyle({ squareEdges: v })}
                />
              )}
            </>
          )}
          {modeView === 'pixels' && (
            <>
              <div className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('style.group.size')}
              </div>
              <Slider
                label={t('style.sizeX')}
                title={t('style.sizeX.desc')}
                value={styleView.sizeX}
                min={0.05}
                max={1}
                step={0.01}
                display={pct}
                onChange={(v) => applyStyle({ sizeX: v })}
              />
              <Slider
                label={t('style.sizeY')}
                title={t('style.sizeY.desc')}
                value={styleView.sizeY}
                min={0.05}
                max={1}
                step={0.01}
                display={pct}
                onChange={(v) => applyStyle({ sizeY: v })}
              />
              <div className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('style.group.rounding')}
              </div>
              <div className="flex gap-1.5">
                <Chip
                  active={styleView.radius === 0 && c.tl === null}
                  title={t('style.square.desc')}
                  onClick={() =>
                    applyStyle({ radius: 0, corners: { tl: null, tr: null, br: null, bl: null } })
                  }
                >
                  {t('style.square')}
                </Chip>
                <Chip
                  active={styleView.radius > 0 && styleView.radius < 0.5 && c.tl === null}
                  title={t('style.rounded.desc')}
                  onClick={() =>
                    applyStyle({
                      radius: 0.42,
                      corners: { tl: null, tr: null, br: null, bl: null },
                    })
                  }
                >
                  {t('style.rounded')}
                </Chip>
                <Chip
                  active={styleView.radius === 0.5 && c.tl === null}
                  title={t('style.circle.desc')}
                  onClick={() =>
                    applyStyle({ radius: 0.5, corners: { tl: null, tr: null, br: null, bl: null } })
                  }
                >
                  {t('style.circle')}
                </Chip>
              </div>
              {doc.gridType === 'square' && (
                <>
                  <CheckRow
                    label={t('style.perCorner')}
                    title={t('style.perCorner.desc')}
                    checked={c.tl !== null}
                    onChange={(on) =>
                      applyStyle({
                        corners: {
                          tl: on ? 0 : null,
                          tr: on ? 0 : null,
                          br: on ? 0 : null,
                          bl: on ? 0 : null,
                        },
                      })
                    }
                  />
                  {c.tl !== null && (
                    <div className="border-line bg-chip flex flex-col gap-2 rounded-lg border p-2">
                      <Slider
                        label="↖"
                        value={c.tl}
                        min={0}
                        max={0.5}
                        step={0.01}
                        display={pct}
                        onChange={(v) => applyStyle({ corners: { ...c, tl: v } })}
                      />
                      <Slider
                        label="↗"
                        value={c.tr ?? 0}
                        min={0}
                        max={0.5}
                        step={0.01}
                        display={pct}
                        onChange={(v) => applyStyle({ corners: { ...c, tr: v } })}
                      />
                      <Slider
                        label="↘"
                        value={c.br ?? 0}
                        min={0}
                        max={0.5}
                        step={0.01}
                        display={pct}
                        onChange={(v) => applyStyle({ corners: { ...c, br: v } })}
                      />
                      <Slider
                        label="↙"
                        value={c.bl ?? 0}
                        min={0}
                        max={0.5}
                        step={0.01}
                        display={pct}
                        onChange={(v) => applyStyle({ corners: { ...c, bl: v } })}
                      />
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {modeView === 'metaball' && (
            <>
              <div className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('style.group.metaball')}
              </div>
              <Slider
                label={t('metaball.strength')}
                title={t('metaball.strength.desc')}
                value={mbView.strength}
                min={0}
                max={100}
                onChange={(v) => applyMetaball({ strength: v })}
              />
              <CheckRow
                label={t('metaball.perColor')}
                title={t('metaball.perColor.desc')}
                checked={mbView.perColor}
                onChange={(v) => applyMetaball({ perColor: v })}
              />
              <div className="text-body flex items-center justify-between text-xs">
                <span>{t('metaball.quality')}</span>
                <div className="flex gap-1">
                  {([2, 4, 6] as const).map((q, i) => (
                    <Chip
                      key={q}
                      active={mbView.quality === q}
                      title={t('metaball.quality.desc')}
                      onClick={() => applyMetaball({ quality: q })}
                    >
                      {
                        [
                          t('metaball.quality.low'),
                          t('metaball.quality.med'),
                          t('metaball.quality.high'),
                        ][i]
                      }
                    </Chip>
                  ))}
                </div>
              </div>
              {isSquare && (
                <CheckRow
                  label={t('metaball.squareEdges')}
                  title={t('metaball.squareEdges.desc')}
                  checked={mbView.squareEdges}
                  onChange={(v) => applyMetaball({ squareEdges: v })}
                />
              )}
            </>
          )}
        </Section>

        {doc.gridType === 'square' && (
          <Section title={t('panel.texture')} icon="texture">
            <TexturePreview />
            <div className="flex gap-1.5">
              {(
                [
                  ['none', 'texture.none'],
                  ['grain', 'texture.grain'],
                  ['grunge', 'texture.grunge'],
                  ['halftone', 'texture.halftone'],
                ] as const
              ).map(([effect, key]) => (
                <Chip
                  key={effect}
                  active={texView.effect === effect}
                  title={t(`texture.${effect}.desc` as 'texture.grain.desc')}
                  onClick={() => applyTexture({ effect })}
                >
                  {t(key)}
                </Chip>
              ))}
            </div>
            {texView.effect !== 'none' && (
              <>
                <Slider
                  label={t('texture.amount')}
                  title={t('texture.amount.desc')}
                  value={texView.amount}
                  min={0}
                  max={100}
                  onChange={(v) => applyTexture({ amount: v })}
                />
                {texView.effect === 'halftone' ? (
                  <Slider
                    label={t('texture.htAngle')}
                    title={t('texture.htAngle.desc')}
                    value={texView.angle}
                    min={0}
                    max={180}
                    step={5}
                    display={(v) => `${Math.round(v)}°`}
                    onChange={(v) => applyTexture({ angle: v })}
                  />
                ) : (
                  <>
                    <div className="text-body flex flex-col gap-1 text-xs">
                      <span title={t('texture.dist.desc')}>{t('texture.dist')}</span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ['scatter', 'texture.dist.scatter'],
                            ['clumps', 'texture.dist.clumps'],
                            ['streaks', 'texture.dist.streaks'],
                            ['perlin', 'texture.dist.perlin'],
                            ['voronoi', 'texture.dist.voronoi'],
                          ] as const
                        ).map(([dist, key]) => (
                          <Chip
                            key={dist}
                            active={texView.dist === dist}
                            title={t(`texture.dist.${dist}.desc` as 'texture.dist.scatter.desc')}
                            onClick={() => applyTexture({ dist })}
                          >
                            {t(key)}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="text-body flex flex-col gap-1 text-xs">
                      <span title={t('texture.shape.desc')}>{t('texture.shape')}</span>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ['square', 'texture.shape.square'],
                            ['dot', 'texture.shape.dot'],
                            ['chip', 'texture.shape.chip'],
                          ] as const
                        ).map(([shape, key]) => (
                          <Chip
                            key={shape}
                            active={texView.shape === shape}
                            title={t(`texture.shape.${shape}.desc` as 'texture.shape.square.desc')}
                            onClick={() => applyTexture({ shape })}
                          >
                            {t(key)}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    {texView.dist === 'streaks' && (
                      <Slider
                        label={t('texture.angle')}
                        title={t('texture.angle.desc')}
                        value={texView.angle}
                        min={0}
                        max={180}
                        step={5}
                        display={(v) => `${Math.round(v)}°`}
                        onChange={(v) => applyTexture({ angle: v })}
                      />
                    )}
                  </>
                )}
                <Slider
                  label={t('texture.scale')}
                  title={t('texture.scale.desc')}
                  value={texView.scale}
                  min={0.1}
                  max={8}
                  step={0.05}
                  display={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => applyTexture({ scale: v })}
                />
                {texView.effect === 'halftone' ? (
                  <>
                    <Slider
                      label={t('texture.ramp')}
                      title={t('texture.ramp.desc')}
                      value={texView.ramp}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ ramp: v })}
                    />
                    <div className="text-muted text-label font-medium tracking-wider uppercase">
                      {t('texture.distress')}
                    </div>
                    <Slider
                      label={t('texture.jitter')}
                      title={t('texture.jitter.desc')}
                      value={texView.jitter}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ jitter: v })}
                    />
                    <Slider
                      label={t('texture.variation')}
                      title={t('texture.variation.desc')}
                      value={texView.variation}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ variation: v })}
                    />
                    <Slider
                      label={t('texture.merge')}
                      title={t('texture.merge.desc')}
                      value={texView.merge}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ merge: v })}
                    />
                    <Slider
                      label={t('texture.wobble')}
                      title={t('texture.wobble.desc')}
                      value={texView.wobble}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ wobble: v })}
                    />
                    <Slider
                      label={t('texture.dropout')}
                      title={t('texture.dropout.desc')}
                      value={texView.dropout}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ dropout: v })}
                    />
                    <Slider
                      label={t('texture.spray')}
                      title={t('texture.spray.desc')}
                      value={texView.spray}
                      min={0}
                      max={100}
                      onChange={(v) => applyTexture({ spray: v })}
                    />
                  </>
                ) : (
                  <>
                    <Slider
                      label={t('texture.sizeMin')}
                      title={t('texture.sizeMin.desc')}
                      value={Math.round(texView.sizeMin * 100)}
                      min={5}
                      max={60}
                      display={(v) => `${Math.round(v)}%`}
                      onChange={(v) =>
                        applyTexture({ sizeMin: Math.min(v, texView.sizeMax * 100) / 100 })
                      }
                    />
                    <Slider
                      label={t('texture.sizeMax')}
                      title={t('texture.sizeMax.desc')}
                      value={Math.round(texView.sizeMax * 100)}
                      min={5}
                      max={60}
                      display={(v) => `${Math.round(v)}%`}
                      onChange={(v) =>
                        applyTexture({ sizeMax: Math.max(v, texView.sizeMin * 100) / 100 })
                      }
                    />
                    {texView.effect === 'grunge' && (
                      <Slider
                        label={t('texture.edge')}
                        title={t('texture.edge.desc')}
                        value={texView.edge}
                        min={0}
                        max={100}
                        onChange={(v) => applyTexture({ edge: v })}
                      />
                    )}
                  </>
                )}
                <Slider
                  label={t('texture.gap')}
                  title={t('texture.gap.desc')}
                  value={Math.round(texView.gap * 100)}
                  min={0}
                  max={45}
                  display={(v) => `${Math.round(v)}%`}
                  onChange={(v) => applyTexture({ gap: v / 100 })}
                />
                <div className="text-body flex items-center justify-between text-xs">
                  <span title={t('texture.seed.desc')}>{t('texture.seed')}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted tabular-nums">{texView.seed}</span>
                    <Chip
                      title={t('texture.randomize.desc')}
                      onClick={() => applyTexture({ seed: 1 + Math.floor(Math.random() * 9999) })}
                    >
                      {t('texture.randomize')}
                    </Chip>
                  </div>
                </div>
              </>
            )}
          </Section>
        )}

        <Section title={t('panel.symmetry')} icon="symmetry">
          <div className="text-muted text-label font-medium tracking-wider uppercase">
            {t('sym.basic')}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['none', 'mirrorX', 'mirrorY', 'quad', 'diag8'] as const).map((mode) => (
              <Chip
                key={mode}
                active={symmetry.mode === mode}
                title={t(`sym.${mode}.desc` as 'sym.none.desc')}
                onClick={() => {
                  const changed = symmetry.mode !== mode
                  patchSymmetry({ mode })
                  if (changed) setSymPreviewOpen(true)
                }}
              >
                {t(`sym.${mode}`)}
              </Chip>
            ))}
          </div>

          <div className="text-muted text-label font-medium tracking-wider uppercase">
            {t('sym.rosette')}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['radial', 'kaleido'] as const).map((mode) => (
              <Chip
                key={mode}
                active={symmetry.mode === mode}
                title={t(`sym.${mode}.desc` as 'sym.radial.desc')}
                onClick={() => {
                  const changed = symmetry.mode !== mode
                  patchSymmetry({ mode })
                  if (changed) setSymPreviewOpen(true)
                }}
              >
                {t(`sym.${mode}`)}
              </Chip>
            ))}
          </div>
          {isRadial && (
            <>
              <Slider
                label={t('sym.folds')}
                title={t('sym.folds.desc')}
                value={symmetry.n}
                min={2}
                max={24}
                onChange={(v) => patchSymmetry({ n: v })}
              />
              <Slider
                label={t('sym.fill')}
                title={t('sym.fill.desc')}
                value={symmetry.fill}
                min={10}
                max={100}
                onChange={(v) => patchSymmetry({ fill: v })}
              />
              <Slider
                label={t('sym.phase')}
                title={t('sym.phase.desc')}
                value={symmetry.phase}
                min={0}
                max={359}
                onChange={(v) => patchSymmetry({ phase: v })}
              />
              <Slider
                label={t('sym.twist')}
                title={t('sym.twist.desc')}
                value={symmetry.twist}
                min={-45}
                max={45}
                onChange={(v) => patchSymmetry({ twist: v })}
              />
            </>
          )}

          {!isSquare && <p className="text-muted text-label">{t('sym.squareOnlyHint')}</p>}

          <div className="text-muted text-label font-medium tracking-wider uppercase">
            {t('sym.wallpaper')}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {WALLPAPER_MODES.map((mode) => (
              <Chip
                key={mode}
                active={symmetry.mode === mode}
                disabled={!isSquare}
                title={t(`sym.${mode}.desc` as 'sym.p1.desc')}
                onClick={() => {
                  const changed = symmetry.mode !== mode
                  patchSymmetry({ mode })
                  if (changed) setSymPreviewOpen(true)
                }}
              >
                {mode}
              </Chip>
            ))}
          </div>

          <div className="text-muted text-label font-medium tracking-wider uppercase">
            {t('sym.repeat')}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {TILING_MODES.map((mode) => (
              <Chip
                key={mode}
                active={symmetry.mode === mode}
                disabled={!isSquare}
                title={t(`sym.${mode}.desc` as 'sym.brick.desc')}
                onClick={() => {
                  const changed = symmetry.mode !== mode
                  patchSymmetry({ mode })
                  if (changed) setSymPreviewOpen(true)
                }}
              >
                {t(`sym.${mode}`)}
              </Chip>
            ))}
          </div>
          {repeatActive && (
            <>
              <Slider
                label={t('sym.cell')}
                title={t('sym.cell.desc')}
                value={symmetry.cell}
                min={MIN_CELL}
                max={MAX_CELL}
                onChange={(v) => patchSymmetry({ cell: v })}
              />
              <div className="flex justify-end gap-1">
                <Chip
                  title={t('sym.half.desc')}
                  onClick={() =>
                    patchSymmetry({ cell: Math.max(MIN_CELL, Math.floor(symmetry.cell / 2)) })
                  }
                >
                  {t('sym.half')}
                </Chip>
                <Chip
                  title={t('sym.double.desc')}
                  onClick={() => patchSymmetry({ cell: Math.min(MAX_CELL, symmetry.cell * 2) })}
                >
                  {t('sym.double')}
                </Chip>
              </div>
            </>
          )}

          <CheckRow
            label={t('sym.guides')}
            title={t('sym.guides.desc')}
            checked={symmetry.showGuides}
            onChange={(v) => patchSymmetry({ showGuides: v })}
          />

          <Chip title={t('sym.preview.desc')} onClick={() => setSymPreviewOpen(true)}>
            {t('sym.preview')}
          </Chip>
          {symPreviewOpen && <SymmetryPreviewDialog onClose={() => setSymPreviewOpen(false)} />}
        </Section>

        <Section title={t('panel.canvas')} icon="canvas">
          {doc.gridType === 'radial' && (
            <>
              <CheckRow
                label={t('grid.evenCells')}
                title={t('grid.evenCells.desc')}
                checked={doc.radialEven}
                onChange={(v) => setRadialEven(v)}
              />
              <div className="text-body flex items-center justify-between text-xs">
                <span>{t('fill.scope')}</span>
                <div className="flex gap-1">
                  {(['cell', 'sector', 'ring'] as const).map((sc) => (
                    <Chip
                      key={sc}
                      active={fillScope === sc}
                      title={t(`fill.scope.${sc}.desc` as 'fill.scope.cell.desc')}
                      onClick={() => setFillScope(sc)}
                    >
                      {t(`fill.scope.${sc}` as 'fill.scope.cell')}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}
          <Slider
            label={t('canvas.connectorWidth')}
            title={t('canvas.connectorWidth.desc')}
            value={doc.connectorWidth}
            min={0.05}
            max={1}
            step={0.01}
            display={pct}
            onChange={setConnectorWidth}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <Tooltip label={t('canvas.bg.desc')}>
              <span>{t('canvas.bg')}</span>
            </Tooltip>
            <div className="flex items-center gap-2">
              <CheckRow
                label=""
                checked={doc.bg === ''}
                onChange={(v) => setBg(v ? '' : '#1a1a1e')}
              />
              <ColorInput
                value={doc.bg || '#1a1a1e'}
                onChange={(v) => setBg(v)}
                title={t('canvas.bg')}
              />
            </div>
          </div>
          <CheckRow
            label={t('canvas.showGrid')}
            title={t('canvas.showGrid.desc')}
            checked={showGrid}
            onChange={setShowGrid}
          />
        </Section>
      </div>
    </aside>
  )
}
