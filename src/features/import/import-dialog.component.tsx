import { useEffect, useMemo, useRef, useState } from 'react'

import { hexToRgb } from '../../engine/color.ts'
import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  ORDERED_DITHERS,
  type ImportBitmap,
  type ImportDither,
  type ImportOptions,
  type ImportPaletteChoice,
  type ImportResult,
} from '../../engine/import-image.ts'
import { curateImportPalette, type PaletteEdit } from '../../engine/import-palette.ts'
import { IMPORT_PRESETS } from '../../engine/import-presets.ts'
import { PALETTES } from '../../engine/palettes.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { GlyphSetPicker } from '../../shared/ui/glyph-set-picker.component.tsx'
import { Chip, CheckRow, Slider } from '../../shared/ui/index.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/shadcn/select.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { BeforeAfterPreview } from './before-after-preview.component.tsx'
import { ImportAdjustSections } from './import-adjust-sections.component.tsx'
import { checkerStyle, DITHER_GROUPS, FITS, SELECT_TRIGGER } from './import-controls.util.ts'
import { ImportPaletteEditor } from './import-palette-editor.component.tsx'

export function ImportDialog({
  bitmap: initialBitmap,
  onPickFile,
  onClose,
}: {
  bitmap: ImportBitmap
  onPickFile: (file: File) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const importPixels = useStore((s) => s.importPixels)
  const requestFit = useStore((s) => s.requestFit)
  const layering = useStore((s) => s.importLayering)
  const patchLayering = useStore((s) => s.patchImportLayering)

  const [bitmap, setBitmap] = useState(initialBitmap)
  useEffect(() => setBitmap(initialBitmap), [initialBitmap])

  const [opts, setOpts] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS)
  const [presetSel, setPresetSel] = useState('')
  const [paletteSel, setPaletteSel] = useState('auto')
  const [autoColors, setAutoColors] = useState(16)
  // user curation of the converted palette; resets when the conversion itself changes it
  const [paletteEdit, setPaletteEdit] = useState<PaletteEdit | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const square = doc.gridType === 'square'
  const patch = (p: Partial<ImportOptions>) => setOpts((o) => ({ ...o, ...p }))

  const paletteChoice = (sel: string, colors: number): ImportPaletteChoice => {
    if (sel === 'current') return { kind: 'current' }
    if (sel === 'auto') return { kind: 'auto', colors }
    const preset = PALETTES.find((p) => p.id === sel) ?? PALETTES[0]
    return { kind: 'preset', colors: [...preset.colors] }
  }

  // conversion runs off the render path so slider drags stay smooth
  const [result, setResult] = useState<ImportResult | null>(null)
  useEffect(() => {
    if (!square) {
      setResult(null)
      return
    }
    const id = setTimeout(() => {
      setResult(
        convertImage(bitmap, opts, { cols: doc.cols, rows: doc.rows, sub: doc.sub }, doc.palette),
      )
    }, 60)
    return () => clearTimeout(id)
  }, [bitmap, opts, doc.cols, doc.rows, doc.sub, doc.palette, square])

  // palette curation applies after conversion; it resets only when the conversion's own
  // palette changes (auto quantization), so slider tweaks on a fixed palette keep the edits
  const paletteKey = result ? result.palette.join(',') : ''
  useEffect(() => setPaletteEdit(null), [paletteKey])
  const finalResult = useMemo(
    () => (result && paletteEdit ? curateImportPalette(result, paletteEdit) : result),
    [result, paletteEdit],
  )

  const rgbOf = useMemo(() => {
    const m = new Map<string, { r: number; g: number; b: number }>()
    if (finalResult) {
      for (const hex of finalResult.palette) m.set(hex, hexToRgb(hex) ?? { r: 0, g: 0, b: 0 })
    }
    return m
  }, [finalResult])

  const colorsUsed = finalResult
    ? new Set(finalResult.cells).size - (finalResult.cells.includes(0) ? 1 : 0)
    : 0

  const apply = () => {
    if (!finalResult) return
    importPixels(finalResult)
    requestFit()
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-full flex-col gap-3 overflow-hidden p-4 lg:h-auto lg:max-h-[85vh] lg:max-w-4xl lg:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('import.title')}
          </DialogTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-2 py-1 text-xs transition max-lg:min-h-11 max-lg:px-3 max-lg:text-sm"
            >
              {t('import.change')}
            </button>
            <Tooltip label={t('dialog.close')}>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:h-11 max-lg:w-11 max-lg:text-base"
              >
                ✕
              </button>
            </Tooltip>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickFile(file)
            e.target.value = ''
          }}
        />

        {/* картинка зафиксирована на всех ширинах; скроллится только колонка настроек —
            на телефоне превью остаётся на экране, пока листаешь опции */}
        {square ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:overflow-hidden">
            <div className="flex shrink-0 flex-col gap-2 lg:min-h-0 lg:flex-1">
              <div className="border-line bg-panel h-64 overflow-hidden rounded-lg border p-2 lg:h-auto lg:min-h-[240px] lg:flex-1">
                <BeforeAfterPreview
                  bitmap={bitmap}
                  result={finalResult}
                  rgbOf={rgbOf}
                  sub={doc.sub}
                  fit={opts.fit}
                  backgroundStyle={checkerStyle}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted text-label">
                  {t('import.original')} ⟷ {t('import.result')}
                </span>
                {finalResult && (
                  <span className="text-muted text-overline">
                    {finalResult.cols}×{finalResult.rows} {t('import.info.cells')} · {colorsUsed}{' '}
                    {t('import.info.colors')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto lg:w-64 lg:flex-none lg:pr-1">
              <ImportPaletteEditor
                result={finalResult}
                edit={paletteEdit}
                onChange={setPaletteEdit}
              />

              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.presets')}</span>
                <Select
                  value={presetSel || undefined}
                  onValueChange={(v) => {
                    const preset = IMPORT_PRESETS.find((x) => x.id === v)
                    if (!preset) return
                    setPresetSel(v)
                    setOpts(preset.opts)
                    setPaletteSel(preset.paletteId ?? 'auto')
                  }}
                >
                  <SelectTrigger className={SELECT_TRIGGER}>
                    <SelectValue placeholder={t('import.presets')} />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPORT_PRESETS.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        title={t(`import.preset.${p.id}.desc` as 'import.preset.gameboy.desc')}
                      >
                        {t(`import.preset.${p.id}` as 'import.preset.gameboy')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.fit')}</span>
                <div className="flex flex-wrap gap-1">
                  {FITS.map((f) => (
                    <Chip
                      key={f}
                      active={opts.fit === f}
                      title={t(`import.fit.${f}` as 'import.fit.cover')}
                      onClick={() => patch({ fit: f })}
                      className="max-lg:h-11"
                    >
                      {t(`import.fit.${f}` as 'import.fit.cover')}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.palette')}</span>
                <Select
                  value={paletteSel}
                  onValueChange={(v) => {
                    setPaletteSel(v)
                    patch({ palette: paletteChoice(v, autoColors) })
                  }}
                >
                  <SelectTrigger className={SELECT_TRIGGER}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="auto">{t('import.palette.auto')}</SelectItem>
                      <SelectItem value="current">{t('import.palette.current')}</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-muted text-overline">
                        {t('palette.presets')}
                      </SelectLabel>
                      {PALETTES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {t(`palette.${p.id}` as 'palette.classic12')}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {opts.palette.kind === 'auto' && (
                <Slider
                  label={t('import.colors')}
                  title={t('import.colors.desc')}
                  min={2}
                  max={64}
                  value={autoColors}
                  onChange={(v) => {
                    setAutoColors(v)
                    patch({ palette: { kind: 'auto', colors: v } })
                  }}
                />
              )}

              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.dither')}</span>
                <Select
                  value={opts.dither}
                  onValueChange={(v) => patch({ dither: v as ImportDither })}
                >
                  <SelectTrigger className={SELECT_TRIGGER}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DITHER_GROUPS.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel className="text-muted text-overline">{t(g.label)}</SelectLabel>
                        {g.dithers.map((d) => (
                          <SelectItem key={d} value={d}>
                            {t(`import.dither.${d}` as 'import.dither.none')}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {opts.dither !== 'none' && (
                <Slider
                  label={t('import.strength')}
                  title={t('import.strength.desc')}
                  min={0}
                  max={100}
                  value={opts.ditherStrength}
                  display={(v) => `${v}%`}
                  onChange={(v) => patch({ ditherStrength: v })}
                />
              )}
              {(opts.dither === 'glyph' || opts.dither === 'palette-glyph') && (
                <GlyphSetPicker
                  value={opts.glyphSet}
                  onChange={(set) => patch({ glyphSet: set })}
                />
              )}
              {ORDERED_DITHERS.has(opts.dither) && (
                <Slider
                  label={t('import.threshold')}
                  title={t('import.threshold.desc')}
                  min={0}
                  max={255}
                  value={opts.threshold}
                  onChange={(v) => patch({ threshold: v })}
                />
              )}

              <ImportAdjustSections opts={opts} patch={patch} />

              <Slider
                label={t('import.blend')}
                title={t('import.blend.desc')}
                min={0}
                max={100}
                value={opts.blend}
                display={(v) => (v === 0 ? '—' : `${v}%`)}
                onChange={(v) => patch({ blend: v })}
              />

              <Slider
                label={t('import.pixelScale')}
                title={t('import.pixelScale.desc')}
                min={1}
                max={4}
                value={opts.pixelScale}
                display={(v) => `${v}×${v}`}
                onChange={(v) => patch({ pixelScale: v })}
              />
            </div>
          </div>
        ) : (
          <p className="text-body rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
            {t('import.squareOnly')}
          </p>
        )}

        <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-x-5 lg:gap-y-2">
          {/* how the converted image lands in the layers panel */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <CheckRow
              label={t('import.splitByColor')}
              title={t('import.splitByColor.desc')}
              checked={layering.splitByColor}
              onChange={(v) => patchLayering({ splitByColor: v })}
            />
            {layering.splitByColor && (
              <CheckRow
                label={t('import.splitConnected')}
                title={t('import.splitConnected.desc')}
                checked={layering.splitConnected}
                onChange={(v) => patchLayering({ splitConnected: v })}
              />
            )}
            {layering.splitByColor && (
              <div className="text-muted flex items-center gap-1 text-xs">
                <span>{t('import.layerOrder')}</span>
                <Chip
                  active={layering.layerOrder === 'palette'}
                  title={t('import.order.palette.desc')}
                  onClick={() => patchLayering({ layerOrder: 'palette' })}
                >
                  {t('import.order.palette')}
                </Chip>
                <Chip
                  active={layering.layerOrder === 'area'}
                  title={t('import.order.area.desc')}
                  onClick={() => patchLayering({ layerOrder: 'area' })}
                >
                  {t('import.order.area')}
                </Chip>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 max-lg:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-3 py-1.5 text-xs transition max-lg:min-h-11 max-lg:flex-1 max-lg:text-sm"
            >
              {t('import.cancel')}
            </button>
            <Button
              type="button"
              onClick={apply}
              disabled={!square || !result}
              className="h-auto px-3 py-1.5 text-xs max-lg:min-h-11 max-lg:flex-1 max-lg:text-sm"
            >
              {t('import.apply')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
