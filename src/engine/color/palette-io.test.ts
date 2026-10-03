import { describe, expect, it } from 'vitest'

import { parseGpl, parsePaletteText, serializeGpl, serializeHex } from './palette-io'

describe('parsePaletteText', () => {
  it('reads .hex lists with or without the # prefix and ignores junk', () => {
    expect(parsePaletteText('#ff0000\n00ff00\n#0000FF\nhello world')).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
    ])
  })

  it('returns null when nothing parses', () => {
    expect(parsePaletteText('not a palette at all')).toBeNull()
    expect(parsePaletteText('')).toBeNull()
  })

  it('routes GIMP palettes to the gpl parser', () => {
    const gpl = 'GIMP Palette\nName: test\n#\n255   0   0\tRed\n  0 255   0\tGreen'
    expect(parsePaletteText(gpl)).toEqual(['#ff0000', '#00ff00'])
  })
})

describe('parseGpl', () => {
  it('clamps invalid channel values out', () => {
    const gpl = 'GIMP Palette\n300   0   0\tBad\n 10  20  30\tOk'
    expect(parseGpl(gpl)).toEqual(['#0a141e'])
  })
})

describe('serialization', () => {
  it('serializeHex emits one lowercase hex per line', () => {
    expect(serializeHex(['#FF0000', '#00ff00', '#00ff00'])).toBe('#ff0000\n#00ff00')
  })

  it('gpl round-trips through the parser', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff']
    const text = serializeGpl('My Palette', colors)
    expect(text.startsWith('GIMP Palette')).toBe(true)
    expect(parseGpl(text)).toEqual(colors)
  })
})
