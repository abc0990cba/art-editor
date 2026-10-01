/**
 * Browser-zoom awareness. The editor deliberately leaves Cmd/Ctrl plus/minus/zero to the browser,
 * but page zoom shrinks the CSS viewport — past the 1024px breakpoint the app switches to the
 * compact layout and the canvas goes full-bleed, which reads as "broken" unless the app explains
 * what happened and how to undo it (the browser owns the reset).
 */

/** The layout switch the app re-organizes itself at (Tailwind `lg`) */
export const COMPACT_BREAKPOINT = 1024
/** The persistent top-bar chip appears from this zoom factor */
export const ZOOM_CHIP_MIN = 1.25
/** The explainer banner appears from this zoom factor */
export const ZOOM_HINT_MIN = 1.3

export interface ZoomReading {
  /** Estimated page zoom factor (1 = 100%) */
  zoom: number
  innerW: number
  screenW: number
}

/**
 * Page zoom makes CSS pixels bigger, so the CSS viewport (innerWidth) shrinks while the screen
 * stays put — the ratio approximates the browser's zoom level.
 */
export function readBrowserZoom(innerW: number, screenW: number): ZoomReading {
  return { zoom: innerW > 0 ? screenW / innerW : 1, innerW, screenW }
}

/**
 * The banner: only when a desktop-sized screen is showing the compact layout zoomed in — i.e.
 * exactly the "I only see canvas" state this exists to explain.
 */
export function shouldShowZoomHint(r: ZoomReading, dismissed: boolean): boolean {
  return (
    !dismissed &&
    r.screenW >= COMPACT_BREAKPOINT &&
    r.innerW < COMPACT_BREAKPOINT &&
    r.zoom >= ZOOM_HINT_MIN
  )
}

/** The chip: any meaningful zoom on any screen. */
export function shouldShowZoomChip(r: ZoomReading): boolean {
  return r.zoom >= ZOOM_CHIP_MIN
}
