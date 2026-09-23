import { FillStyleControls } from './FillStyleControls'

/** Settings body for the fill tool: solid vs pattern fills, dither library, transitions. */
export function FillSettings() {
  // the per-tool popover is w-80 with p-3, so its content column is 296px wide
  return <FillStyleControls previewSize={296} />
}
