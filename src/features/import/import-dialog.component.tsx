import { useEffect, useMemo, useRef, useState } from 'react'

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
import { Chip, CheckRow, Slider } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

const FITS: ImportFit[] = ['cover', 'contain', 'stretch', 'resize']
const DITHER_GROUPS: {
  label:
    | 'import.ditherGroup.off'
    | 'import.ditherGroup.ordered'
    | 'import.ditherGroup.diffusion'
    | 'import.ditherGroup.special'
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
]

const checkerStyle: React.CSSProperties = {
  backgroundImage:
    'conic-gradient(rgba(128,128,128,0.25) 25%, rgba(128,128,128,0.08) 0 50%, rgba(128,128,128,0.25) 0 75%, rgba(128,128,128,0.08) 0)',
  backgroundSize: '16px 16px',
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
  const [view, setView] = useState<'original' | 'result'>('result')
  const [paletteSel, setPaletteSel] = useState('auto')
  const [autoColors, setAutoColors] = useState(16)
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // preview: the canvas holds the raw buffer 1:1 and CSS scales it with crisp pixels
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !square) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (view === 'original') {
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      ctx.putImageData(
        new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height),
        0,
        0,
      )
      return
    }
    if (!result) return
    const bw = result.cols * doc.sub
    const bh = result.rows * doc.sub
    canvas.width = bw
    canvas.height = bh
    const img = new ImageData(bw, bh)
    for (let i = 0; i < result.cells.length; i++) {
      const v = result.cells[i]
      if (v === 0) continue
      const rgb = rgbOf.get(result.palette[(v - 1) % result.palette.length])
      if (!rgb) continue
      img.data[i * 4] = rgb.r
      img.data[i * 4 + 1] = rgb.g
      img.data[i * 4 + 2] = rgb.b
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [view, result, bitmap, doc.sub, rgbOf, square])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const colorsUsed = result ? new Set(result.cells).size - (result.cells.includes(0) ? 1 : 0) : 0

  const apply = () => {
    if (!result) return
    importPixels(result)
    requestFit()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-line bg-app flex max-h-[85vh] w-full max-w-4xl flex-col gap-3 overflow-hidden rounded-xl border p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-body text-sm font-semibold tracking-wide">{t('import.title')}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-2 py-1 text-xs transition"
            >
              {t('import.change')}
            </button>
            <Tooltip label={t('dialog.close')}>
              <button
                type="button"
                onClick={onClose}
                className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
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

        {square ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="border-line bg-panel min-h-[240px] flex-1 overflow-hidden rounded-lg border p-2">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full"
                  style={{
                    ...checkerStyle,
                    objectFit: 'contain',
                    imageRendering: view === 'result' ? 'pixelated' : 'auto',
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <Chip active={view === 'original'} onClick={() => setView('original')}>
                    {t('import.original')}
                  </Chip>
                  <Chip active={view === 'result'} onClick={() => setView('result')}>
                    {t('import.result')}
                  </Chip>
                </div>
                {result && (
                  <span className="text-muted text-[10px]">
                    {result.cols}×{result.rows} {t('import.info.cells')} · {colorsUsed}{' '}
                    {t('import.info.colors')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-2.5 md:w-64">
              <div className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.presets')}</span>
                <div className="flex flex-wrap gap-1">
                  {IMPORT_PRESETS.map((p) => (
                    <Chip
                      key={p.id}
                      title={t(`import.preset.${p.id}.desc` as 'import.preset.gameboy.desc')}
                      onClick={() => {
                        setOpts(p.opts)
                        setPaletteSel(p.paletteId ?? 'auto')
                      }}
                    >
                      {t(`import.preset.${p.id}` as 'import.preset.gameboy')}
                    </Chip>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.fit')}</span>
                <select
                  value={opts.fit}
                  onChange={(e) => patch({ fit: e.target.value as ImportFit })}
                  className="border-line bg-chip text-body focus:border-accent-line w-full cursor-pointer rounded-md border px-2 py-1 text-xs outline-none"
                >
                  {FITS.map((f) => (
                    <option key={f} value={f}>
                      {t(`import.fit.${f}` as 'import.fit.cover')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-muted text-xs">{t('import.palette')}</span>
                <select
                  value={paletteSel}
                  onChange={(e) => {
                    setPaletteSel(e.target.value)
                    patch({ palette: paletteChoice(e.target.value, autoColors) })
                  }}
                  className="border-line bg-chip text-body focus:border-accent-line w-full cursor-pointer rounded-md border px-2 py-1 text-xs outline-none"
                >
                  <option value="auto">{t('import.palette.auto')}</option>
                  <option value="current">{t('import.palette.current')}</option>
                  <optgroup label={t('palette.presets')}>
                    {PALETTES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t(`palette.${p.id}` as 'palette.classic12')}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

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
                <select
                  value={opts.dither}
                  onChange={(e) => patch({ dither: e.target.value as ImportDither })}
                  className="border-line bg-chip text-body focus:border-accent-line w-full cursor-pointer rounded-md border px-2 py-1 text-xs outline-none"
                >
                  {DITHER_GROUPS.map((g) => (
                    <optgroup key={g.label} label={t(g.label)}>
                      {g.dithers.map((d) => (
                        <option key={d} value={d}>
                          {t(`import.dither.${d}` as 'import.dither.none')}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
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

              <details className="border-line rounded-md border px-2 py-1">
                <summary className="text-muted cursor-pointer text-xs select-none">
                  {t('import.section.pre')}
                </summary>
                <div className="mt-1.5 flex flex-col gap-2">
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
                </div>
              </details>

              <details className="border-line rounded-md border px-2 py-1">
                <summary className="text-muted cursor-pointer text-xs select-none">
                  {t('import.section.post')}
                </summary>
                <div className="mt-1.5 flex flex-col gap-2">
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
                </div>
              </details>

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

        <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-line bg-chip text-body hover:border-chip-line rounded-md border px-3 py-1.5 text-xs transition"
            >
              {t('import.cancel')}
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!square || !result}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('import.apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
