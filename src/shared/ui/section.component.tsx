import type { ReactNode } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/collapsible.tsx'

/** Small stroke glyphs shown next to section titles for faster scanning. */
const SECTION_GLYPHS: Record<string, ReactNode> = {
  grid: (
    <path d="M1.5 1.5h4.2v4.2H1.5zM8.3 1.5h4.2v4.2H8.3zM1.5 8.3h4.2v4.2H1.5zM8.3 8.3h4.2v4.2H1.5z" />
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
  glyph: (
    <g fill="currentColor" stroke="none">
      <rect x="1.5" y="1.5" width="4.6" height="4.6" rx="0.8" />
      <rect x="7.9" y="1.5" width="4.6" height="4.6" rx="0.8" opacity=".35" />
      <rect x="1.5" y="7.9" width="4.6" height="4.6" rx="0.8" opacity=".35" />
      <rect x="7.9" y="7.9" width="4.6" height="4.6" rx="0.8" />
    </g>
  ),
}

/** Section icon rendered standalone (collapsed settings-panel strip buttons). */
export function SectionGlyph({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className ?? 'h-4.5 w-4.5'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {SECTION_GLYPHS[icon]}
    </svg>
  )
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
  /** Glyph name — see SECTION_GLYPHS */
  icon?: string
  defaultOpen?: boolean
  /** Extra classes on the <details> root, e.g. a max-height for pinned sections */
  className?: string
  /** Extra classes on the content wrapper, e.g. internal scrolling */
  contentClassName?: string
  children: ReactNode
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={`border-line group border-b ${className ?? ''}`}
    >
      <CollapsibleTrigger className="text-muted hover:text-body text-label flex w-full cursor-pointer list-none items-center justify-between px-3 py-2.5 font-semibold tracking-widest uppercase select-none max-lg:min-h-11 max-lg:px-4 max-lg:py-3 max-lg:text-sm">
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
          className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </CollapsibleTrigger>
      <CollapsibleContent
        className={`flex flex-col gap-2.5 px-3 pb-3 max-lg:gap-3 max-lg:px-4 max-lg:pb-4 ${contentClassName ?? ''}`}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
