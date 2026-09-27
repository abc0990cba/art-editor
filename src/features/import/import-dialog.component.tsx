import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { hexToRgb } from '../../engine/color.ts'
import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  ORDERED_DITHERS,
  type ImportBitmap,
  type ImportDither,
  type ImportFit,
  type ImportOptions,
  type ImportPaletteChoice,
  type ImportResult,
} from '../../engine/import-image.ts'
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

const FITS: ImportFit[] = ['cover', 'contain', 'stretch', 'resize']

// chip-plate select trigger; phones get 44px touch targets (max-lg)
const SELECT_TRIGGER =
  'border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1 text-xs max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm'
const DITHER_GROUPS: {
  label:
    | 'import.ditherGroup.off'
    | 'import.ditherGroup.ordered'
    | 'import.ditherGroup.diffusion'
    | 'import.ditherGroup.special'
    | 'import.ditherGroup.glyph'
  dithers: ImportDither[]
}[] = [
  { label: 'import.ditherGroup.off', dithers: ['none'] },
  {
    label: 'import.ditherGroup.ordered',
    dithers: [
      'bayer2',
      'bayer4',
      'bayer8',
      'bayer16',
      'cluster-dot',
      'halftone',
      'blue-noise',
      'void-cluster',
      'pattern',
      'crosshatch',
    ],
  },
  {
    label: 'import.ditherGroup.diffusion',
    dithers: [
      'floyd',
      'atkinson',
      'sierra',
      'sierra-lite',
      'stucki',
      'burkes',
      'jjn',
      'stevenson-arce',
      'nakano',
    ],
  },
  {
    label: 'import.ditherGroup.special',
    dithers: ['ostromoukhov', 'variable-error', 'dot-diffusion', 'riemersma'],
  },
  {
    label: 'import.ditherGroup.glyph',
    dithers: ['glyph', 'palette-glyph'],
  },
]

const checkerStyle: React.CSSProperties = {
  backgroundImage:
    'conic-gradient(rgba(128,128,128,0.25) 25%, rgba(128,128,128,0.08) 0 50%, rgba(128,128,128,0.25) 0 75%, rgba(128,128,128,0.08) 0)',
  backgroundSize: '16px 16px',
}

/** Collapsible slider group (Adjust / Pre / Post); rows grow to 44px touch targets on phones. */
function SliderGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="border-line rounded-md border px-2 py-1">
      <summary className="text-muted cursor-pointer text-xs select-none max-lg:flex max-lg:min-h-11 max-lg:items-center max-lg:text-sm">
        {title}
      </summary>
      <div className="mt-1.5 flex flex-col gap-2">{children}</div>
    </details>
  )
}

const signed = (v: number): string => (v > 0 ? `+${v}` : `${v}`)

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

  const rgbOf = useMemo(() => {
    const m = new Map<string, { r: number; g: number; b: number }>()
    if (result) for (const hex of result.palette) m.set(hex, hexToRgb(hex) ?? { r: 0, g: 0, b: 0 })
    return m
  }, [result])

  const colorsUsed = result ? new Set(result.cells).size - (result.cells.includes(0) ? 1 : 0) : 0

  const apply = () => {
    if (!result) return
    importPixels(result)
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

        {/* картинка зафиксирована; скроллится только колонка настроек (на мобилке — всё тело) */}
        {square ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:overflow-hidden">
            <div className="flex shrink-0 flex-col gap-2 lg:min-h-0 lg:flex-1">
              <div className="border-line bg-panel h-64 overflow-hidden rounded-lg border p-2 lg:h-auto lg:min-h-[240px] lg:flex-1">
                <BeforeAfterPreview
                  bitmap={bitmap}
                  result={result}
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
                {result && (
                  <span className="text-muted text-overline">
                    {result.cols}×{result.rows} {t('import.info.cells')} · {colorsUsed}{' '}
                    {t('import.info.colors')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2.5 lg:w-64 lg:overflow-y-auto lg:pr-1">
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
                <Select value={opts.fit} onValueChange={(v) => patch({ fit: v as ImportFit })}>
                  <SelectTrigger className={SELECT_TRIGGER}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FITS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {t(`import.fit.${f}` as 'import.fit.cover')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <SliderGroup title={t('import.section.adjust')}>
                <Slider
                  label={t('import.brightness')}
                  title={t('import.brightness.desc')}
                  min={-100}
                  max={100}
                  value={opts.brightness}
                  display={signed}
                  onChange={(v) => patch({ brightness: v })}
                />
                <Slider
                  label={t('import.contrast')}
                  title={t('import.contrast.desc')}
                  min={-100}
                  max={100}
                  value={opts.contrast}
                  display={signed}
                  onChange={(v) => patch({ contrast: v })}
                />
                <Slider
                  label={t('import.saturation')}
                  title={t('import.saturation.desc')}
                  min={-100}
                  max={100}
                  value={opts.saturation}
                  display={signed}
                  onChange={(v) => patch({ saturation: v })}
                />
              </SliderGroup>

              <SliderGroup title={t('import.section.pre')}>
                <Slider
                  label={t('import.blur')}
                  title={t('import.blur.desc')}
                  min={0}
                  max={10}
                  value={opts.blur}
                  onChange={(v) => patch({ blur: v })}
                />
                <Slider
                  label={t('import.sharpen')}
                  title={t('import.sharpen.desc')}
                  min={0}
                  max={100}
                  value={opts.sharpen}
                  display={(v) => `${v}%`}
                  onChange={(v) => patch({ sharpen: v })}
                />
                <Slider
                  label={t('import.hue')}
                  title={t('import.hue.desc')}
                  min={-180}
                  max={180}
                  value={opts.hue}
                  display={signed}
                  onChange={(v) => patch({ hue: v })}
                />
                <Slider
                  label={t('import.preDenoise')}
                  title={t('import.preDenoise.desc')}
                  min={0}
                  max={5}
                  value={opts.preDenoise}
                  onChange={(v) => patch({ preDenoise: v })}
                />
                <Slider
                  label={t('import.preSmooth')}
                  title={t('import.preSmooth.desc')}
                  min={0}
                  max={5}
                  value={opts.preSmooth}
                  onChange={(v) => patch({ preSmooth: v })}
                />
              </SliderGroup>

              <SliderGroup title={t('import.section.post')}>
                <Slider
                  label={t('import.glowRadius')}
                  title={t('import.glowRadius.desc')}
                  min={0}
                  max={24}
                  value={opts.glowRadius}
                  onChange={(v) => patch({ glowRadius: v })}
                />
                <Slider
                  label={t('import.glowIntensity')}
                  title={t('import.glowIntensity.desc')}
                  min={0}
                  max={100}
                  value={opts.glowIntensity}
                  display={(v) => `${v}%`}
                  onChange={(v) => patch({ glowIntensity: v })}
                />
                <Slider
                  label={t('import.aberration')}
                  title={t('import.aberration.desc')}
                  min={0}
                  max={12}
                  value={opts.aberration}
                  onChange={(v) => patch({ aberration: v })}
                />
                <Slider
                  label={t('import.postDenoise')}
                  title={t('import.postDenoise.desc')}
                  min={0}
                  max={5}
                  value={opts.postDenoise}
                  onChange={(v) => patch({ postDenoise: v })}
                />
                <Slider
                  label={t('import.postSmooth')}
                  title={t('import.postSmooth.desc')}
                  min={0}
                  max={5}
                  value={opts.postSmooth}
                  onChange={(v) => patch({ postSmooth: v })}
                />
              </SliderGroup>

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

              {result && (
                <div className="flex flex-wrap gap-0.5">
                  {result.palette.map((hex) => (
                    <span
                      key={hex}
                      title={hex}
                      className="h-4 w-4 rounded-sm border border-black/20"
                      style={{ background: hex }}
                    />
                  ))}
                </div>
              )}
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
