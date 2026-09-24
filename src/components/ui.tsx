import { useEffect, useId, useState, type ReactNode } from 'react'
import { DragNumber } from './DragNumber'
import { Tooltip } from './Tooltip'

/** Small stroke glyphs shown next to section titles for faster scanning. */
const SECTION_GLYPHS: Record<string, ReactNode> = {
  grid: (
    <path d="M1.5 1.5h4.2v4.2H1.5zM8.3 1.5h4.2v4.2H8.3zM1.5 8.3h4.2v4.2H1.5zM8.3 8.3h4.2v4.2H8.3z" />
  ),
  presets: <path d="M7 1.5l1.4 4.1L12.5 7l-4.1 1.4L7 12.5 5.6 8.4 1.5 7l4.1-1.4z" />,
  color: <path d="M7 1.8C4.8 4.8 3.4 6.9 3.4 8.7a3.6 3.6 0 007.2 0c0-1.8-1.4-3.9-3.6-6.9z" />,
  brush: <path d="M2.5 11.5l.7-2.6 6.3-6.3 1.9 1.9-6.3 6.3-2.6.7zM9.5 2.6l1.9 1.9" />,
  style: (
    <>
      <rect x="2" y="2" width="10" height="10" rx="3" />
      <rect x="5.4" y="5.4" width="3.2" height="3.2" rx="1" />
    </>
  ),
  texture: (
    <g fill="currentColor" stroke="none">
      <circle cx="4" cy="3.5" r="1.15" />
      <circle cx="9.8" cy="2.8" r="0.9" />
      <circle cx="11.2" cy="8.3" r="1.15" />
      <circle cx="6.2" cy="9.8" r="0.9" />
      <circle cx="2.6" cy="10.8" r="0.85" />
    </g>
  ),
  symmetry: <path d="M7 1.5v11M4.2 4L1.8 7l2.4 3M9.8 4l2.4 3-2.4 3" />,
  canvas: (
    <>
      <rect x="1.8" y="2.5" width="10.4" height="9" rx="1.2" />
      <path d="M1.8 5.2h10.4" />
    </>
  ),
  layers: (
    <>
      <path d="M7 1.6L12.8 4.4 7 7.2 1.2 4.4z" />
      <path d="M1.2 7.4L7 10.2l5.8-2.8" />
      <path d="M1.2 10.2L7 13l5.8-2.8" />
    </>
  ),
  nodes: (
    <>
      <circle cx="3.4" cy="3.4" r="1.7" />
      <circle cx="11.6" cy="7" r="1.7" />
      <circle cx="4.6" cy="11.4" r="1.7" />
      <path d="M4.8 4.4l5 1.9M10.2 8.4L6 10.7" />
    </>
  ),
  export: <path d="M7 1.8v7.4M7 9.2L4.4 6.6M7 9.2l2.6-2.6M2.2 12.2h9.6" />,
}

export function Section({
  title,
  icon,
  defaultOpen = false,
  className,
  contentClassName,
  children,
}: {
  title: string
  /** glyph name — see SECTION_GLYPHS */
  icon?: string
  defaultOpen?: boolean
  /** extra classes on the <details> root, e.g. a max-height for pinned sections */
  className?: string
  /** extra classes on the content wrapper, e.g. internal scrolling */
  contentClassName?: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <details open={defaultOpen} className={`border-b border-line group ${className ?? ''}`}>
      <summary
        aria-controls={id}
        className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11px] font-semibold tracking-widest text-muted uppercase hover:text-body [&::-webkit-details-marker]:hidden"
      >
        <span className="flex items-center gap-2">
          {icon && (
            <svg
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5 shrink-0 opacity-80"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {SECTION_GLYPHS[icon]}
            </svg>
          )}
          {title}
        </span>
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <div id={id} className={`flex flex-col gap-2.5 px-3 pb-3 ${contentClassName ?? ''}`}>
        {children}
      </div>
    </details>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  title,
  editable,
  int,
  hardMin,
  hardMax,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display?: (v: number) => string
  title?: string
  /** show a scrubbable numeric field instead of the plain value readout */
  editable?: boolean
  /** round edited values to whole numbers */
  int?: boolean
  /** typing bounds for the editable field; the slider itself uses min/max */
  hardMin?: number
  hardMax?: number
  onChange: (v: number) => void
}) {
  return (
    <Tooltip label={title}>
      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs text-muted">
          <span>{label}</span>
          {editable ? (
            <DragNumber
              value={value}
              min={hardMin ?? min}
              max={hardMax ?? max}
              softMin={min}
              softMax={max}
              step={step}
              int={int}
              title={title}
              ariaLabel={label}
              className="w-16"
              onChange={onChange}
            />
          ) : (
            <span className="text-body">{display ? display(value) : value}</span>
          )}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-chip-active accent-indigo-400"
        />
      </label>
    </Tooltip>
  )
}

export function CheckRow({
  label,
  checked,
  title,
  onChange,
}: {
  label: string
  checked: boolean
  title?: string
  onChange: (v: boolean) => void
}) {
  return (
    <Tooltip label={title}>
      <label className="flex cursor-pointer items-center justify-between text-xs text-body">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-3.5 w-3.5 accent-indigo-400"
        />
      </label>
    </Tooltip>
  )
}

export function Chip({
  active,
  onClick,
  title,
  disabled,
  children,
}: {
  active?: boolean
  onClick: () => void
  title?: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip label={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line ${
          active
            ? 'border-accent-line bg-accent-soft text-accent-text'
            : 'border-line bg-chip text-body hover:border-chip-line'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function IconButton({
  title,
  onClick,
  disabled,
  className,
  plate,
  big,
  children,
}: {
  title: string
  onClick?: () => void
  disabled?: boolean
  /** extra classes on the button, e.g. an accent tint for an active save state */
  className?: string
  /** chip plate behind the icon (top-bar style, like the import/export buttons) */
  plate?: boolean
  /** 44px touch target (HIG/Material) — mobile bars */
  big?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip label={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center rounded-md text-body transition disabled:opacity-30 ${big ? 'h-10 w-10' : 'h-7 w-7'} ${
          plate
            ? 'border border-line bg-chip hover:border-chip-line disabled:hover:border-line'
            : 'hover:bg-chip-active disabled:hover:bg-transparent'
        } ${className ?? ''}`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function ColorInput({
  value,
  onChange,
  title,
}: {
  value: string
  onChange: (v: string) => void
  title?: string
}) {
  return (
    <Tooltip label={title}>
      <label
        className="relative inline-block h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-chip-line"
        style={{ background: value }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -top-2 -left-2 h-12 w-12 cursor-pointer opacity-0"
        />
      </label>
    </Tooltip>
  )
}

/** Perceived luminance of a #rgb/#rrggbb hex color (0..1). */
export function hexLuminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (h.length !== 6) return 0.5
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Palette swatch with the editor-standard active treatment (à la Photoshop): the active
 * color gets an offset accent ring plus an inner hairline that auto-contrasts with the
 * color, so the current color reads at a glance on any background.
 */
export function ColorSwatch({
  hex,
  active,
  label,
  onPick,
}: {
  hex: string
  active?: boolean
  label: string
  onPick: () => void
}) {
  const inner = hexLuminance(hex) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)'
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onPick}
        className={`relative h-5 w-full rounded transition ${
          active
            ? 'z-10 ring-2 ring-accent-text ring-offset-2 ring-offset-panel'
            : 'ring-1 ring-line hover:ring-chip-line'
        }`}
        style={{ background: hex }}
      >
        {active && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded"
            style={{ boxShadow: `inset 0 0 0 1px ${inner}` }}
          />
        )}
      </button>
    </Tooltip>
  )
}

/** Reactive CSS media query — drives the responsive layout switches (rail, panels). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
