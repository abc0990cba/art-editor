import { useCallback, useEffect, useRef, useState } from 'react'

import {
  cmykToHex,
  cmykToRgb,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  rgbToCmyk,
  rgbToHex,
  rgbToHsv,
  type CMYK,
  type RGB,
} from '../../engine/color/color.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { Chip } from './index.tsx'
import { Tooltip } from './tooltip.component.tsx'

const SIZE = 148 // wheel canvas size
const RADIUS = SIZE / 2

type PickerMode = 'hsv' | 'rgb' | 'cmyk'

function ChannelRow({
  label,
  value,
  max,
  track,
  title,
  display,
  onChange,
}: {
  label: string
  value: number
  max: number
  track: string
  title: string
  display: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <Tooltip label={title}>
      <label className="flex items-center gap-2">
        <span className="text-muted w-3.5 text-xs">{label}</span>
        <input
          type="range"
          min={0}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: track }}
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-indigo-400"
        />
        <span className="text-body w-9 text-right text-xs">{display(value)}</span>
      </label>
    </Tooltip>
  )
}

/**
 * Color picker with HSV, RGB and CMYK editing modes. The HSV wheel (hue = angle, saturation =
 * radius, brightness slider) is the classic view; RGB and CMYK offer per-channel sliders. HSV is
 * the interaction source of truth, hex entry is always available, and changes apply live through
 * onChange.
 */
export function ColorPicker({
  color,
  onChange,
}: {
  color: string
  onChange: (hex: string) => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<PickerMode>('hsv')
  const wheelRef = useRef<HTMLCanvasElement>(null)
  const barRef = useRef<HTMLCanvasElement>(null)
  const [hsv, setHsv] = useState(() => hexToHsv(color) ?? { h: 0, s: 1, v: 1 })
  const [hexText, setHexText] = useState(color)
  const [hexInvalid, setHexInvalid] = useState(false)
  const hsvRef = useRef(hsv)
  hsvRef.current = hsv

  // re-sync when the color changes from outside the picker
  useEffect(() => {
    const parsed = hexToHsv(color)
    if (
      parsed &&
      hsvToHex(parsed.h, parsed.s, parsed.v) !==
        hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v)
    ) {
      setHsv(parsed)
      setHexText(color)
    }
  }, [color])

  const apply = useCallback(
    (next: { h: number; s: number; v: number }) => {
      setHsv(next)
      const hex = hsvToHex(next.h, next.s, next.v)
      setHexText(hex)
      setHexInvalid(false)
      onChange(hex)
    },
    [onChange],
  )

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
  const setChannel = (ch: keyof RGB, v: number) => {
    const next = { ...rgb, [ch]: v }
    apply(rgbToHsv(next.r, next.g, next.b))
  }
  const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b)
  const setCmykChannel = (ch: keyof CMYK, v: number) => {
    const next = { ...cmyk, [ch]: v / 100 }
    const c = cmykToRgb(next)
    apply(rgbToHsv(c.r, c.g, c.b))
  }

  // ---- wheel render (per-pixel hue/sat, value applied after) ----
  useEffect(() => {
    const canvas = wheelRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(SIZE, SIZE)
    const val = hsvRef.current.v
    for (let py = 0; py < SIZE; py++) {
      for (let px = 0; px < SIZE; px++) {
        const dx = px - RADIUS + 0.5
        const dy = py - RADIUS + 0.5
        const dist = Math.hypot(dx, dy)
        const o = (py * SIZE + px) * 4
        if (dist > RADIUS) {
          img.data[o + 3] = 0
          continue
        }
        const sat = Math.min(1, dist / RADIUS)
        const hue = (Math.atan2(dy, dx) * 180) / Math.PI
        const c = hsvToRgb(((hue % 360) + 360) % 360, sat, val)
        img.data[o] = c.r
        img.data[o + 1] = c.g
        img.data[o + 2] = c.b
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }, [hsv.v])

  // ---- brightness bar render ----
  useEffect(() => {
    const canvas = barRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const grad = ctx.createLinearGradient(0, 0, SIZE, 0)
    for (let s = 0; s <= 10; s++) {
      grad.addColorStop(s / 10, hsvToHex(hsv.h, hsv.s, 1 - s / 10))
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, SIZE, 14)
  }, [hsv.h, hsv.s])

  const wheelPick = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = wheelRef.current
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      const dx = e.clientX - r.left - RADIUS
      const dy = e.clientY - r.top - RADIUS
      const dist = Math.min(RADIUS, Math.hypot(dx, dy))
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
      apply({ h: hue, s: dist / RADIUS, v: hsvRef.current.v })
    },
    [apply],
  )

  const barPick = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = barRef.current
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      const v = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
      apply({ h: hsvRef.current.h, s: hsvRef.current.s, v })
    },
    [apply],
  )

  const dragIn = (pick: (e: { clientX: number; clientY: number }) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      pick(e)
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0) return
      pick(e)
    },
  })

  const markerX = RADIUS + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * (RADIUS - 1)
  const markerY = RADIUS + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * (RADIUS - 1)

  const rgbTrack = (ch: keyof RGB) => {
    const from = { ...rgb, [ch]: 0 }
    const to = { ...rgb, [ch]: 255 }
    return `linear-gradient(to right, ${rgbToHex(from)}, ${rgbToHex(to)})`
  }
  const cmykTrack = (ch: keyof CMYK) => {
    const from = cmykToHex({ ...cmyk, [ch]: 0 })
    const to = cmykToHex({ ...cmyk, [ch]: 1 })
    return `linear-gradient(to right, ${from}, ${to})`
  }

  return (
    <div className="border-line bg-raised flex w-[164px] flex-col gap-2 rounded-lg border p-2">
      <div className="grid grid-cols-3 gap-1">
        {(['hsv', 'rgb', 'cmyk'] as const).map((m) => (
          <Chip
            key={m}
            active={mode === m}
            title={t(`picker.mode.${m}.desc` as 'picker.mode.hsv.desc')}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </Chip>
        ))}
      </div>

      {mode === 'hsv' && (
        <>
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <Tooltip label={t('picker.wheel.desc')}>
              <canvas
                ref={wheelRef}
                width={SIZE}
                height={SIZE}
                className="cursor-crosshair rounded-full"
                {...dragIn(wheelPick)}
              />
            </Tooltip>
            <div
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: markerX, top: markerY, background: hsvToHex(hsv.h, hsv.s, hsv.v) }}
            />
          </div>
          <Tooltip label={t('picker.brightness.desc')}>
            <canvas
              ref={barRef}
              width={SIZE}
              height={14}
              className="cursor-pointer rounded"
              {...dragIn(barPick)}
            />
          </Tooltip>
        </>
      )}

      {mode === 'rgb' && (
        <div className="flex flex-col gap-1.5">
          <ChannelRow
            label="R"
            value={rgb.r}
            max={255}
            track={rgbTrack('r')}
            title={t('picker.red.desc')}
            display={(v) => String(v)}
            onChange={(v) => setChannel('r', v)}
          />
          <ChannelRow
            label="G"
            value={rgb.g}
            max={255}
            track={rgbTrack('g')}
            title={t('picker.green.desc')}
            display={(v) => String(v)}
            onChange={(v) => setChannel('g', v)}
          />
          <ChannelRow
            label="B"
            value={rgb.b}
            max={255}
            track={rgbTrack('b')}
            title={t('picker.blue.desc')}
            display={(v) => String(v)}
            onChange={(v) => setChannel('b', v)}
          />
        </div>
      )}

      {mode === 'cmyk' && (
        <div className="flex flex-col gap-1.5">
          <ChannelRow
            label="C"
            value={Math.round(cmyk.c * 100)}
            max={100}
            track={cmykTrack('c')}
            title={t('picker.cyan.desc')}
            display={(v) => `${v}%`}
            onChange={(v) => setCmykChannel('c', v)}
          />
          <ChannelRow
            label="M"
            value={Math.round(cmyk.m * 100)}
            max={100}
            track={cmykTrack('m')}
            title={t('picker.magenta.desc')}
            display={(v) => `${v}%`}
            onChange={(v) => setCmykChannel('m', v)}
          />
          <ChannelRow
            label="Y"
            value={Math.round(cmyk.y * 100)}
            max={100}
            track={cmykTrack('y')}
            title={t('picker.yellow.desc')}
            display={(v) => `${v}%`}
            onChange={(v) => setCmykChannel('y', v)}
          />
          <ChannelRow
            label="K"
            value={Math.round(cmyk.k * 100)}
            max={100}
            track={cmykTrack('k')}
            title={t('picker.key.desc')}
            display={(v) => `${v}%`}
            onChange={(v) => setCmykChannel('k', v)}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div
          className="border-chip-line h-6 w-6 shrink-0 rounded border"
          style={{ background: hsvToHex(hsv.h, hsv.s, hsv.v) }}
        />
        <Tooltip label={t('picker.hex.desc')}>
          <input
            type="text"
            value={hexText}
            onChange={(e) => {
              setHexText(e.target.value)
              const parsed = hexToRgb(e.target.value)
              if (parsed) {
                setHsv(rgbToHsv(parsed.r, parsed.g, parsed.b))
                onChange(rgbToHex(parsed))
                setHexInvalid(false)
              } else {
                setHexInvalid(e.target.value.trim() !== '')
              }
            }}
            className={`bg-chip text-body w-24 rounded border px-2 py-1 font-mono text-xs outline-none ${
              hexInvalid ? 'border-red-500' : 'border-line'
            }`}
          />
        </Tooltip>
      </div>
    </div>
  )
}
