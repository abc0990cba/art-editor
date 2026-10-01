import type { JSX } from 'react'

import { SHAPE_TOOLS } from '../../engine/shapes.ts'
import type { Tool } from '../../state/editor.store.ts'

const icons: Record<Tool, JSX.Element> = {
  hand: (
    // lucide "hand", scaled from the 24-grid to the shared 16-grid
    <g transform="scale(0.667)" strokeWidth={1.8}>
      <path d="M18 11V6a2 2 0 00-4 0v5" />
      <path d="M14 10V4a2 2 0 00-4 0v2" />
      <path d="M10 10.5V6a2 2 0 00-4 0v8" />
      <path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15" />
    </g>
  ),
  select: <path d="M5 2.2l7.6 6.6-3.5.5 2 3.8-1.8.9-2-3.8-2.3 2.6z" />,
  pencil: <path d="M11.5 2.5a1.7 1.7 0 012.4 2.4L6 12.8l-3.2.8.8-3.2 7.9-7.9z" />,
  eraser: (
    <>
      <path d="M9.5 3.5l3 3-5.5 5.5h-3l-1.5-1.5 7-7z" />
      <path d="M6 12h7.5" />
    </>
  ),
  fill: (
    <>
      <path d="M8.5 2l5 5-4.6 4.6a1.4 1.4 0 01-2 0L4 8.7a1.4 1.4 0 010-2L8.5 2z" />
      <path d="M13.5 10.5s1.3 1.7 1.3 2.6a1.3 1.3 0 11-2.6 0c0-.9 1.3-2.6 1.3-2.6z" />
    </>
  ),
  picker: (
    <>
      <path d="M13.5 2.5a1.8 1.8 0 00-2.5 0L9.6 3.9l2.5 2.5 1.4-1.4a1.8 1.8 0 000-2.5z" />
      <path d="M9 4.5L3.5 10v2.5H6L11.5 7" />
    </>
  ),
  line: <path d="M3 13L13 3" />,
  rect: <rect x="3" y="4.5" width="10" height="7" rx="0.5" />,
  ellipse: <circle cx="8" cy="8" r="5" />,
  connector: (
    <>
      <circle cx="3.5" cy="12.5" r="1.7" />
      <circle cx="12.5" cy="3.5" r="1.7" />
      <path d="M4.8 11.2l6.4-6.4" />
    </>
  ),
  star: (
    <path d="M8 1.5l1.65 4.23 4.53.26-3.52 2.88 1.16 4.39L8 10.8l-3.82 2.46 1.16-4.39-3.52-2.88 4.53-.26z" />
  ),
  polygon: <path d="M8 2l5.2 3v6L8 14l-5.2-3V5L8 2z" />,
  diamond: <path d="M8 2l6 6-6 6-6-6z" />,
  heart: (
    <path d="M8 13.5C4 10.5 2.5 8.4 2.5 6.4c0-1.8 1.4-3.2 3.1-3.2 1 0 1.9.5 2.4 1.3.5-.8 1.4-1.3 2.4-1.3 1.7 0 3.1 1.4 3.1 3.2 0 2-1.5 4.1-5.5 7.1z" />
  ),
  spiral: <path d="M8 8a1.2 1.2 0 012.4 0 2.6 2.6 0 01-5.2 0 4.2 4.2 0 018.4 0 6 6 0 01-12 0" />,
  arrow: <path d="M2 8h9.5M11.5 8L8 4.5M11.5 8L8 11.5" />,
  lightning: <path d="M9 1.5L4 9h3l-1 5.5L11 7H8l1-5.5z" />,
  moon: <path d="M8 2a4 4 0 006 6 6 6 0 11-6-6z" />,
  wave: <path d="M2 8c1.1-3.6 2.4-3.6 3.5 0s2.4 3.6 3.5 0 2.4-3.6 3.5 0" />,
  cross: <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" />,
  flower: (
    <>
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="8" cy="4.6" r="2.2" />
      <circle cx="11.4" cy="7.1" r="2.2" />
      <circle cx="10.1" cy="11" r="2.2" />
      <circle cx="5.9" cy="11" r="2.2" />
      <circle cx="4.6" cy="7.1" r="2.2" />
    </>
  ),
  gear: (
    <>
      <circle cx="8" cy="8" r="4.2" />
      <path d="M12.5 8h2M11.2 11.2l1.4 1.4M8 12.5v2M4.8 11.2l-1.4 1.4M3.5 8h-2M4.8 4.8L3.4 3.4M8 3.5v-2M11.2 4.8l1.4-1.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v2.2M8 12.3v2.2M1.5 8h2.2M12.3 8h2.2M3.4 3.4L5 5M11 11l1.6 1.6M12.6 3.4L11 5M5 11l-1.6 1.6" />
    </>
  ),
  bento: (
    <>
      <rect x="2" y="2" width="5.5" height="7.5" rx="1" />
      <rect x="8.5" y="2" width="5.5" height="4" rx="1" />
      <rect x="8.5" y="7" width="5.5" height="7" rx="1" />
      <rect x="2" y="10.5" width="5.5" height="3.5" rx="1" />
    </>
  ),
  zigzag: <path d="M2 11.5l3.5-7 3.5 7 3.5-7 1.5 3" />,
  ring: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.2" />
    </>
  ),
  arc: <path d="M2.5 12.5a5.5 5.5 0 0111 0" />,
  drop: <path d="M8 2.2C10.2 5.2 12 7.3 12 9.4a4 4 0 11-8 0C4 7.3 5.8 5.2 8 2.2z" />,
  chevron: <path d="M2.5 12.5L8 4.5l5.5 8M5.4 12.5L8 8.8l2.6 3.7" />,
  concentric: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="3.2" />
      <circle cx="8" cy="8" r="1" />
    </>
  ),
  concentricRect: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="0.5" />
      <rect x="5.5" y="5.5" width="5" height="5" rx="0.5" />
    </>
  ),
  skull: (
    <>
      <path d="M3.5 7a4.5 4.5 0 019 0v2.2c0 .9-.5 1.5-1.2 1.9l-.3 2.4h-6l-.3-2.4C4 11.7 3.5 11.1 3.5 10.2z" />
      <circle cx="5.9" cy="7.6" r="1.15" />
      <circle cx="10.1" cy="7.6" r="1.15" />
      <path d="M8 9.3l-.7 1.6h1.4z" />
      <path d="M6.2 11.5v2M8 11.5v2M9.8 11.5v2" />
    </>
  ),
}

export const toolKeys: Record<Tool, string> = {
  hand: 'H',
  select: 'V',
  pencil: 'B',
  eraser: 'E',
  fill: 'G',
  picker: 'I',
  line: 'L',
  rect: 'R',
  ellipse: 'O',
  connector: 'C',
  star: 'S',
  polygon: 'N',
  diamond: 'D',
  heart: '⇧H',
  spiral: 'Q',
  arrow: 'A',
  lightning: 'K',
  moon: 'M',
  wave: 'W',
  cross: 'X',
  flower: 'J',
  gear: 'U',
  sun: '4',
  bento: '5',
  zigzag: 'Z',
  ring: 'T',
  arc: 'Y',
  drop: 'P',
  chevron: '1',
  concentric: '2',
  concentricRect: '3',
  skull: '6',
}

const order: Tool[] = [
  'select',
  'hand',
  'pencil',
  'eraser',
  'fill',
  'picker',
  'line',
  'rect',
  'ellipse',
  'connector',
]

/** The rail shows every tool in one flat list; the mobile strip reuses the order. */
export const allOrder: Tool[] = [...order, ...SHAPE_TOOLS]

/** Tools whose settings popover carries real controls (everything but hand/select/picker). */
export function toolHasSettings(tool: Tool): boolean {
  return tool !== 'select' && tool !== 'picker' && tool !== 'hand'
}

/**
 * Fresco's per-tool options marker: a tiny corner wedge shown on every tool that carries settings —
 * a square cut by its diagonal, the right angle seated in the button's bottom-right corner and the
 * hypotenuse facing the tool icon. Purely an affordance — opening the settings is the second click
 * on the already-active tool.
 */
export function SettingsGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0v8H0z" />
    </svg>
  )
}

export function ToolIcon({ id, className = 'h-4.5 w-4.5' }: { id: Tool; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {icons[id]}
    </svg>
  )
}

export type { Tool }
