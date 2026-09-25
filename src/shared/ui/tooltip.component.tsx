import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

import { TooltipContent } from './shadcn/tooltip.tsx'

const SHOW_DELAY_MS = 350

/**
 * Hover/focus tooltip on the shadcn/Radix primitive. Wraps a single trigger element (the bubble
 * portals to the body, flips by available space and never clips); passing no label renders the
 * trigger untouched. A string label doubles as the trigger's accessible name when it has none.
 */
export function Tooltip({ label, children }: { label?: ReactNode; children: ReactElement }) {
  if (!label || !isValidElement(children)) return children
  const props = children.props as { 'aria-label'?: unknown }
  const trigger =
    typeof label === 'string' && props['aria-label'] === undefined
      ? cloneElement(children as ReactElement<{ 'aria-label'?: string }>, {
          'aria-label': label,
        })
      : children
  return (
    <TooltipPrimitive.Root delayDuration={SHOW_DELAY_MS}>
      <TooltipPrimitive.Trigger asChild>{trigger}</TooltipPrimitive.Trigger>
      <TooltipContent className="text-label max-w-56 text-left">{label}</TooltipContent>
    </TooltipPrimitive.Root>
  )
}
