import { useEffect, useRef } from 'react'

import {
  GRAIN_PATTERNS,
  GRADIENTS,
  HT_SHAPES,
  PATTERNS,
  SCALED_PATTERNS,
  gradientAt,
  patternAt,
  type FillStyle,
} from '../../engine/fillpatterns.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, ColorInput, Slider } from '../../shared/ui/index.tsx'
import { ExpandablePreview } from '../../shared/ui/preview-expander.component.tsx'
import { useStore } from '../../state/editor.store.ts'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) || 0
  return [n(0), n(2), n(4)]
}

/** Live sample of the current fill pattern between the active and second color. */
function FillPreview({ size = 232 }: { size?: number }) {
  const color = useStore((s) => s.color)
  const style = useStore((s) => s.fillStyle)
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const a = hexToRgb(color)
    const b = hexToRgb(style.color2)
    const img = ctx.createImageData(size, size)
    const box = { x0: 0, y0: 0, x1: size - 1, y1: size - 1 }
    const seed = { x: (size - 1) >> 1, y: (size - 1) >> 1 }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t =
          style.mode === 'solid'
            ? 0
            : style.gradient === 'none'
              ? style.density
              : gradientAt(style.gradient, x, y, seed, box)
        const c =
          style.mode === 'solid' ||
          !patternAt(style.pattern, x, y, t, {
            scale: style.scale,
            grain: style.grain,
            seed,
            htShape: style.htShape,
            htAngle: style.htAngle,
            htJitter: style.htJitter,
            htDropout: style.htDropout,
          })
            ? a
            : b
        const o = (y * size + x) * 4
        img.data[o] = c[0]
        img.data[o + 1] = c[1]
        img.data[o + 2] = c[2]
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [color, style, size])

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      className="border-line aspect-square w-full self-center rounded-md border"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    />
  )
}

/**
 * Style controls of the fill tool: solid vs pattern fills, dither library, transitions and the
 * second color. Edits go through `patchFillStyle`, or through `onPatch` when the caller needs to
 * react to every change (e.g. re-filling the current selection live). `previewSize` is the
 * backing-store resolution of the inline sample — pass the host panel's content width so the canvas
 * never upscales blurry.
 */
export function FillStyleControls({
  onPatch,
  previewSize = 232,
}: {
  onPatch?: (patch: Partial<FillStyle>) => void
  previewSize?: number
}) {
  const { t } = useI18n()
  const color = useStore((s) => s.color)
  const setColor = useStore((s) => s.setColor)
  const style = useStore((s) => s.fillStyle)
  const storePatch = useStore((s) => s.patchFillStyle)
  const patch = onPatch ?? storePatch
  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <>
      {/* the preview stays pinned while the option list scrolls under it, so the pattern
          being configured is always in sight */}
      <div className="bg-panel sticky top-0 z-10 -mx-3 px-3 pb-2">
        <ExpandablePreview
          title={t('preview.large')}
          panelWidth={464 + 24}
          large={<FillPreview size={464} />}
        >
          <FillPreview size={previewSize} />
        </ExpandablePreview>
      </div>
      <div className="text-body flex flex-wrap items-center justify-between gap-y-1 text-xs">
        <span>{t('fill.mode')}</span>
        <div className="flex gap-1">
          <Chip
            active={style.mode === 'solid'}
            title={t('fill.mode.solid.desc')}
            onClick={() => patch({ mode: 'solid' })}
          >
            {t('fill.mode.solid')}
          </Chip>
          <Chip
            active={style.mode === 'pattern'}
            title={t('fill.mode.pattern.desc')}
            onClick={() => patch({ mode: 'pattern' })}
          >
            {t('fill.mode.pattern')}
          </Chip>
        </div>
      </div>
      {style.mode === 'pattern' && (
        <>
          <div>
            <div className="text-muted mb-1 text-xs">{t('fill.pattern')}</div>
            <div className="grid grid-cols-2 gap-1">
              {PATTERNS.map((p) => (
                <Chip
                  key={p}
                  active={style.pattern === p}
                  title={t(`fill.pattern.${p}.desc`)}
                  onClick={() => patch({ pattern: p })}
                >
                  {t(`fill.pattern.${p}`)}
                </Chip>
              ))}
            </div>
          </div>
          {style.pattern === 'screen' && (
            <>
              <div>
                <div className="text-muted mb-1 text-xs">{t('fill.htShape')}</div>
                <div className="grid grid-cols-3 gap-1">
                  {HT_SHAPES.map((sh) => (
                    <Chip
                      key={sh}
                      active={style.htShape === sh}
                      title={t(`fill.htShape.${sh}.desc`)}
                      onClick={() => patch({ htShape: sh })}
                    >
                      {t(`fill.htShape.${sh}`)}
                    </Chip>
                  ))}
                </div>
              </div>
              <Slider
                label={t('fill.htAngle')}
                title={t('fill.htAngle.desc')}
                value={style.htAngle}
                min={0}
                max={180}
                step={5}
                display={(v) => `${Math.round(v)}°`}
                onChange={(v) => patch({ htAngle: v })}
              />
              <Slider
                label={t('fill.htJitter')}
                title={t('fill.htJitter.desc')}
                value={style.htJitter}
                min={0}
                max={100}
                onChange={(v) => patch({ htJitter: v })}
              />
              <Slider
                label={t('fill.htDropout')}
                title={t('fill.htDropout.desc')}
                value={style.htDropout}
                min={0}
                max={100}
                onChange={(v) => patch({ htDropout: v })}
              />
            </>
          )}
          <div>
            <div className="text-muted mb-1 text-xs">{t('fill.gradient')}</div>
            <div className="grid grid-cols-3 gap-1">
              {GRADIENTS.map((g) => (
                <Chip
                  key={g}
                  active={style.gradient === g}
                  title={`${t(`fill.gradient.${g}`)} — ${t(`fill.gradient.${g}.desc`)}`}
                  onClick={() => patch({ gradient: g })}
                >
                  {t(`fill.gradient.${g}.short`)}
                </Chip>
              ))}
            </div>
          </div>
          {SCALED_PATTERNS.has(style.pattern) && (
            <Slider
              label={t('fill.scale')}
              title={t('fill.scale.desc')}
              value={style.scale}
              min={1}
              max={6}
              onChange={(v) => patch({ scale: v })}
            />
          )}
          {GRAIN_PATTERNS.has(style.pattern) && (
            <Slider
              label={t('fill.grain')}
              title={t('fill.grain.desc')}
              value={style.grain}
              min={1}
              max={4}
              onChange={(v) => patch({ grain: v })}
            />
          )}
          {style.gradient === 'none' && (
            <Slider
              label={t('fill.density')}
              title={t('fill.density.desc')}
              value={style.density}
              min={0}
              max={1}
              step={0.05}
              display={pct}
              onChange={(v) => patch({ density: v })}
            />
          )}
          <div className="text-body flex items-center justify-between text-xs">
            <span>{t('fill.color2')}</span>
            <div className="flex items-center gap-1.5">
              <ColorInput
                value={style.color2}
                title={t('fill.color2.desc')}
                onChange={(v) => patch({ color2: v })}
              />
              <button
                type="button"
                title={t('fill.swap')}
                aria-label={t('fill.swap')}
                onClick={() => {
                  setColor(style.color2)
                  patch({ color2: color })
                }}
                className="text-muted hover:text-body transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 5h8M9.5 2.5L12 5l-2.5 2.5M13 11H5M6.5 8.5L4 11l2.5 2.5" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
