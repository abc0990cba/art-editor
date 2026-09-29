/**
 * Styled re-export of the vendored shadcn select for feature layers: compose Select / SelectContent
 * / SelectItem / SelectValue with SelectTrigger + selectTriggerClass to get the ditherlab chip look
 * (28px plate, 44px touch target on phones) without importing shadcn directly.
 */
export { Select, SelectContent, SelectItem, SelectTrigger } from './shadcn/select.tsx'

/** Ditherlab-styled trigger classes; merge with layout classes via cn(). */
export const selectTriggerClass =
  'border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1 text-xs max-lg:min-h-11'
