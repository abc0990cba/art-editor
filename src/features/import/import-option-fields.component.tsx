import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import { PALETTES } from '../../engine/color/index.ts'
import { DITHER_CATALOG } from '../../engine/dither/catalog.ts'
import { BUILT_IN_GLYPH_SETS } from '../../engine/glyph/builtins.ts'
import {
  convertImage,
  DEFAULT_IMPORT_OPTIONS,
  type ImportBitmap,
  type ImportDither,
  type ImportGrid,
  type ImportOptions,
  type ImportPaletteChoice,
  type ImportResult,
} from '../../engine/import/index.ts'
import { IMPORT_PRESETS } from '../../engine/import/presets.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { cn } from '../../shared/lib/utils.ts'
import { GlyphSetPicker } from '../../shared/ui/glyph-set-picker.component.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/shadcn/select.tsx'
import { DITHER_GROUPS, importRgbOf, paintResult, SELECT_TRIGGER } from './import-controls.util.ts'

/**
 * The import dialog's visual option fields: each keeps its text select and adds a tile gallery
 * under it — presets, palettes and dithers shown as real conversions of a small thumbnail of the
 * imported photo (same convertImage, 1:1 cells), so a click is judged before it happens. Auto and
 * current palette choices stay select-only: they have no fixed swatches to show. Every gallery
 * starts collapsed to a one-line header carrying the current choice, same as the settings panel.
 */

/** Collapsed gallery field: label + current choice on the summary line, select and tiles inside. */
function CollapsibleField({
  label,
  value,
  children,
}: {
  label: string
  /** Current choice rendered after the label; hidden while nothing is picked yet. */
  value?: string
  children: ReactNode
}) {
  return (
    <details className="border-line group/field rounded-md border px-2 py-1">
      <summary className="text-muted hover:text-body flex cursor-pointer list-none items-center gap-2 text-xs select-none max-lg:min-h-11 max-lg:text-sm [&::-webkit-details-marker]:hidden">
        <span className="shrink-0">{label}</span>
        {value && <span className="text-body min-w-0 flex-1 truncate text-right">{value}</span>}
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 shrink-0 transition-transform group-open/field:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <div className="mt-1.5 flex flex-col gap-1">{children}</div>
    </details>
  )
}

/** Longest side of the shared gallery thumbnail — enough to read a dither pattern. */
const THUMB_SIDE = 96

const tileGrid = (thumb: ImportBitmap): ImportGrid => ({
  cols: thumb.width,
  rows: thumb.height,
  sub: 1,
})

/** Evenly sample a palette down to at most 10 stripes so 64-color sets stay readable. */
function sampleColors(colors: string[], max = 10): string[] {
  if (colors.length <= max) return colors
  const last = colors.length - 1
  return Array.from({ length: max }, (_v, i) => colors[Math.round((i / (max - 1)) * last)])
}

/** Downscale the photo into the thumbnail every gallery tile is generated from. */
function thumbOf(bitmap: ImportBitmap): ImportBitmap {
  const scale = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const src = document.createElement('canvas')
  src.width = bitmap.width
  src.height = bitmap.height
  src
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height),
      0,
      0,
    )
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return bitmap
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data }
}

/** The converted thumbnail painted crisp at 1:1; CSS scales it with pixelated rendering. */
function TileCanvas({ result }: { result: ImportResult }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = result.cols
    canvas.height = result.rows
    const ctx = canvas.getContext('2d')
    if (ctx) paintResult(ctx, result, importRgbOf(result.palette), 1)
  }, [result])
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="block h-auto w-full"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

/** Active/hover frame shared by every gallery tile. */
const tileFrame = (active: boolean) =>
  cn(
    'bg-chip cursor-pointer rounded-md border transition',
    active ? 'border-accent-line bg-accent-soft' : 'border-line hover:border-chip-line',
  )

/** Presets field: the recipe select plus each recipe rendered on a thumbnail of the photo. */
export function ImportPresetsField({
  bitmap,
  value,
  onPick,
}: {
  bitmap: ImportBitmap
  value: string
  onPick: (id: string) => void
}) {
  const { t } = useI18n()
  const thumb = useMemo(() => thumbOf(bitmap), [bitmap])
  const tiles = useMemo(
    () =>
      IMPORT_PRESETS.map((p) => ({
        id: p.id,
        // tiles share one framing: the thumbnail stretched edge to edge, 1:1 cells
        result: convertImage(
          thumb,
          { ...p.opts, fit: 'stretch', pixelScale: 1 },
          tileGrid(thumb),
          [],
        ),
      })),
    [thumb],
  )
  return (
    <CollapsibleField
      label={t('import.presets')}
      value={value ? t(`import.preset.${value}` as 'import.preset.gameboy') : undefined}
    >
      <Select value={value || undefined} onValueChange={onPick}>
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
      <div role="listbox" aria-label={t('import.presets')} className="grid grid-cols-2 gap-1">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            role="option"
            aria-selected={value === tile.id}
            title={t(`import.preset.${tile.id}.desc` as 'import.preset.gameboy.desc')}
            onClick={() => onPick(tile.id)}
            className={cn(tileFrame(value === tile.id), 'p-1 text-left')}
          >
            <TileCanvas result={tile.result} />
            <span
              className={cn(
                'text-overline mt-0.5 block truncate',
                value === tile.id ? 'text-accent-text' : 'text-muted',
              )}
            >
              {t(`import.preset.${tile.id}` as 'import.preset.gameboy')}
            </span>
          </button>
        ))}
      </div>
    </CollapsibleField>
  )
}

/** Palettes field: the select (auto/current/presets) plus a swatch chip per built-in palette. */
export function ImportPaletteField({
  value,
  autoColors,
  onPick,
}: {
  /** Palette select value: 'auto' | 'current' | built-in palette id */
  value: string
  autoColors: number
  onPick: (id: string) => void
}) {
  const { t } = useI18n()
  const paletteLabel = (sel: string) =>
    sel === 'auto'
      ? t('import.palette.auto')
      : sel === 'current'
        ? t('import.palette.current')
        : t(`palette.${sel}` as 'palette.classic12')
  return (
    <CollapsibleField label={t('import.palette')} value={paletteLabel(value)}>
      <Select value={value} onValueChange={onPick}>
        <SelectTrigger className={SELECT_TRIGGER}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="auto">{t('import.palette.auto')}</SelectItem>
            <SelectItem value="current">{t('import.palette.current')}</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className="text-muted text-overline">{t('palette.presets')}</SelectLabel>
            {PALETTES.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {t(`palette.${p.id}` as 'palette.classic12')}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div role="listbox" aria-label={t('import.palette')} className="flex flex-wrap gap-1">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={value === p.id}
            title={t(`palette.${p.id}` as 'palette.classic12')}
            onClick={() => onPick(p.id)}
            className={cn(tileFrame(value === p.id), 'h-7 w-14 overflow-hidden max-lg:h-11')}
          >
            <span className="flex h-full w-full">
              {sampleColors(p.colors).map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ background: c }} />
              ))}
            </span>
          </button>
        ))}
      </div>
      {value === 'auto' && (
        <span className="text-muted text-overline">
          {t('import.colors')}: {autoColors}
        </span>
      )}
    </CollapsibleField>
  )
}

/** Dithers field: the select plus every algorithm rendered on a thumbnail of the photo. */
export function ImportDitherField({
  bitmap,
  palette,
  docPalette,
  glyphSet,
  value,
  onPick,
  onGlyphSet,
}: {
  bitmap: ImportBitmap
  /** Resolved palette choice shared with the main conversion. */
  palette: ImportPaletteChoice
  docPalette: readonly string[]
  glyphSet: ImportOptions['glyphSet']
  value: ImportDither
  onPick: (d: ImportDither) => void
  onGlyphSet: (set: ImportOptions['glyphSet']) => void
}) {
  const { t } = useI18n()
  const thumb = useMemo(() => thumbOf(bitmap), [bitmap])
  // the flat display order of the select's groups
  const dithers = useMemo(() => DITHER_GROUPS.flatMap((g) => g.dithers), [])
  // tiles isolate the algorithm: neutral processing, the dialog's palette, default strength
  const tiles = useMemo(() => {
    const base: ImportOptions = {
      ...DEFAULT_IMPORT_OPTIONS,
      palette,
      fit: 'stretch',
      pixelScale: 1,
      glyphSet: glyphSet ?? BUILT_IN_GLYPH_SETS[1]?.set ?? null,
    }
    return dithers.map((d) => ({
      dither: d,
      result: convertImage(thumb, { ...base, dither: d }, tileGrid(thumb), docPalette),
    }))
  }, [thumb, palette, docPalette, glyphSet, dithers])
  return (
    <CollapsibleField
      label={t('import.dither')}
      value={t(`import.dither.${value}` as 'import.dither.none')}
    >
      <Select value={value} onValueChange={(v) => onPick(v as ImportDither)}>
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
      <div role="listbox" aria-label={t('import.dither')} className="grid grid-cols-4 gap-1">
        {tiles.map(({ dither, result }) => (
          <button
            key={dither}
            type="button"
            role="option"
            aria-selected={value === dither}
            title={t(`import.dither.${dither}` as 'import.dither.none')}
            onClick={() => onPick(dither)}
            className={tileFrame(value === dither)}
          >
            <TileCanvas result={result} />
          </button>
        ))}
      </div>
      {DITHER_CATALOG[value].glyphPicker && (
        <GlyphSetPicker value={glyphSet} onChange={onGlyphSet} photo={bitmap} />
      )}
    </CollapsibleField>
  )
}
