import { useId, type ReactNode } from 'react'

import { cn } from '../lib/utils.ts'
import { DragNumber } from './drag-number.component.tsx'
import { Button } from './shadcn/button.tsx'
import { Checkbox } from './shadcn/checkbox.tsx'
import { Input } from './shadcn/input.tsx'
import { Label } from './shadcn/label.tsx'
import { Slider as SliderPrimitive } from './shadcn/slider.tsx'
import { Tooltip } from './tooltip.component.tsx'

export { Section, SectionGlyph } from './section.component.tsx'
export { MobileSheet } from './mobile-sheet.component.tsx'
export { useMediaQuery } from './use-media-query.hook.ts'

/**
 * Ditherlab chip look layered over the shadcn button: compact plate, themed borders. Phones grow
 * chips to 44px touch targets.
 */
const CHIP_CLASS =
  'text-body h-auto rounded-md border px-2 py-1 text-xs font-normal dark:text-body dark:hover:text-body max-lg:min-h-11 max-lg:px-3 max-lg:text-sm'

export function Chip({
  active,
  onClick,
  title,
  disabled,
  className,
  children,
}: {
  active?: boolean
  onClick: () => void
  title?: string
  disabled?: boolean
  /** Extra classes on the button, e.g. 44px touch sizing in floating panels */
  className?: string
  children: ReactNode
}) {
  return (
    <Tooltip label={title}>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          CHIP_CLASS,
          className,
          active
            ? 'border-accent-line bg-accent-soft hover:bg-accent-soft'
            : 'border-line bg-chip hover:border-chip-line hover:bg-chip dark:border-line dark:bg-chip dark:hover:bg-chip',
        )}
      >
        {children}
      </Button>
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
  /** Extra classes on the button, e.g. an accent tint for an active save state */
  className?: string
  /** Chip plate behind the icon (top-bar style, like the import/export buttons) */
  plate?: boolean
  /** 44px touch target (HIG/Material) — mobile bars */
  big?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip label={title}>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'text-body px-0 py-0 dark:text-body dark:hover:text-body',
          big ? 'h-10 w-10' : 'h-7 w-7',
          plate
            ? 'border-line bg-chip hover:bg-chip dark:border-line dark:bg-chip dark:hover:bg-chip'
            : 'hover:bg-chip-active dark:hover:bg-chip-active',
          className,
        )}
      >
        {children}
      </Button>
    </Tooltip>
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
  /** Show a scrubbable numeric field instead of the plain value readout */
  editable?: boolean
  /** Round edited values to whole numbers */
  int?: boolean
  /** Typing bounds for the editable field; the slider itself uses min/max */
  hardMin?: number
  hardMax?: number
  onChange: (v: number) => void
}) {
  return (
    <Tooltip label={title}>
      <div className="flex flex-col gap-1">
        <span className="text-muted flex justify-between text-xs max-lg:text-sm">
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
        <SliderPrimitive
          aria-label={label}
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(v) => onChange(v[0] ?? value)}
        />
      </div>
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
  const id = useId()
  return (
    <Tooltip label={title}>
      <div className="text-body flex cursor-pointer items-center justify-between gap-2 text-xs max-lg:min-h-11 max-lg:text-sm">
        <Label htmlFor={id} className="text-xs font-normal max-lg:text-sm">
          {label}
        </Label>
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          id={id}
          className="max-lg:size-6"
        />
      </div>
    </Tooltip>
  )
}

/** Themed text field on the shadcn input: compact ditherlab sizing. */
export function TextField({
  value,
  placeholder,
  onChange,
  ariaLabel,
  autoFocus,
  className,
}: {
  value: string
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        // 16px input text on phones: below that iOS Safari zooms into the field on focus
        'border-line bg-chip h-auto min-w-0 px-2 py-1 text-xs dark:border-line dark:bg-chip max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-base',
        className,
      )}
    />
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
        className="border-chip-line relative inline-block h-7 w-7 cursor-pointer overflow-hidden rounded-md border max-lg:h-11 max-lg:w-11"
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
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  if (h.length !== 6) return 0.5
  const r = Number.parseInt(h.slice(0, 2), 16) / 255
  const g = Number.parseInt(h.slice(2, 4), 16) / 255
  const b = Number.parseInt(h.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Palette swatch with the editor-standard active treatment (à la Photoshop): the active color gets
 * an offset accent ring plus an inner hairline that auto-contrasts with the color, so the current
 * color reads at a glance on any background.
 */
export function ColorSwatch({
  hex,
  active,
  label,
  onPick,
  className,
}: {
  hex: string
  active?: boolean
  label: string
  onPick: () => void
  /** Extra classes on the button, e.g. 44px touch sizing in floating panels */
  className?: string
}) {
  const inner = hexLuminance(hex) > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)'
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onPick}
        className={`relative h-5 w-full rounded transition max-lg:h-8 ${className ?? ''} ${
          active
            ? 'ring-accent-text ring-offset-panel z-10 ring-2 ring-offset-2'
            : 'ring-line hover:ring-chip-line ring-1'
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
