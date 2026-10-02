/**
 * Gradient-map duotone pre-processing for the image import: every pixel's luminance is projected
 * onto the dark→light color pair before quantization and dithering, so any algorithm then dithers a
 * two-tone map. Pure.
 */

/** The duotone end colors as rgb triplets (hex conversion happens in the dialog). */
export interface DuotonePair {
  dark: [number, number, number]
  light: [number, number, number]
}

/** Project the sample's RGBA onto the duotone ramp by luminance (alpha preserved). */
export function mapDuotone(sample: Float64Array, pair: DuotonePair): void {
  for (let o = 0; o < sample.length; o += 4) {
    if (sample[o + 3] < 128) continue
    const lum = (0.299 * sample[o] + 0.587 * sample[o + 1] + 0.114 * sample[o + 2]) / 255
    for (let c = 0; c < 3; c++) {
      sample[o + c] = pair.dark[c] + (pair.light[c] - pair.dark[c]) * lum
    }
  }
}
