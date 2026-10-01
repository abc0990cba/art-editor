/**
 * Builds the committed landing artwork from the engine's own demo documents:
 *
 * - Public/art/*.svg — rendered by buildSvg, the same serializer as the editor's SVG export, so the
 *   landing shows exactly what the engine draws;
 * - Public/og-source.svg — the 1200×630 Open Graph image source (poster + wordmark);
 * - Public/icon-source.svg — the favicon / apple-touch-icon source glyph.
 *
 * Og-source.svg and icon-source.svg are rasterized to PNG once with a headless browser screenshot
 * and the results are committed — no image library in the dependency tree. Rerun after engine
 * rendering changes: `npm run art:generate`.
 */

import { mkdir, writeFile } from 'node:fs/promises'

import { DEMO_PROJECTS, POSTER_DEMO, type DemoDef } from '../src/engine/demo-project.ts'
import { docExtent } from '../src/engine/doc.ts'
import { deserialize } from '../src/engine/project.ts'
import { buildSvg } from '../src/engine/svg.ts'

const ART_TARGET_W = 720
const OG_W = 1200
const OG_H = 630

const PICKS: readonly { file: string; id: string }[] = [
  { file: 'hero', id: POSTER_DEMO.id },
  { file: 'mandala', id: 'demo.mandala' },
  { file: 'iso', id: 'demo.iso' },
  { file: 'lava', id: 'demo.lava' },
]

interface Poster {
  svg: string
  width: number
  height: number
  cellsW: number
  cellsH: number
}

function pixelDoc(def: DemoDef) {
  const content = def.build()
  if (content.kind !== 'pixel') throw new Error(`demo "${def.id}" is not a pixel document`)
  return deserialize(content.doc)
}

function renderPoster(def: DemoDef): Poster {
  const doc = pixelDoc(def)
  const { w, h } = docExtent(doc)
  const scale = Math.max(1, Math.round(ART_TARGET_W / w))
  return {
    svg: buildSvg(doc, { includeBg: true, scale }),
    width: w * scale,
    height: h * scale,
    cellsW: w,
    cellsH: h,
  }
}

/** The brand glyph: a dithered disc, two ink tones meeting in a checker transition. */
const GLYPH = ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..']
const GLYPH_LIGHT = '#c7d2fe'
const GLYPH_DARK = '#6366f1'

function glyphRects(): string {
  const rows: string[] = []
  GLYPH.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue
      const sum = x + y
      const fill =
        sum < 7 ? GLYPH_LIGHT : sum > 8 ? GLYPH_DARK : x % 2 === 0 ? GLYPH_LIGHT : GLYPH_DARK
      rows.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`)
    }
  })
  return rows.join('\n')
}

const faviconSvg = (): string =>
  [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">',
    '<rect x="0" y="0" width="9" height="9" rx="1.4" fill="#131316"/>',
    glyphRects(),
    '</svg>',
  ].join('\n')

/**
 * Icon-source.svg carries explicit pixel dimensions: headless-Chrome screenshots of a viewBox-only
 * SVG mis-scale it (the standalone viewer sizes it itself). The favicon itself stays viewBox-only —
 * the right form for a favicon.
 */
const iconSourceSvg = (): string => faviconSvg().replace('<svg ', '<svg width="180" height="180" ')

function ogSvg(hero: Poster): string {
  const inner = hero.svg.slice(hero.svg.indexOf('>') + 1, hero.svg.lastIndexOf('</svg>'))
  // the poster plate sits right of the wordmark; the artwork scales into it preserving ratio
  const plateX = 660
  const plateY = 95
  const plateW = 468
  const plateH = 440
  const pad = 16
  const s = Math.min((plateW - pad * 2) / hero.cellsW, (plateH - pad * 2) / hero.cellsH)
  const tx = plateX + pad + (plateW - pad * 2 - hero.cellsW * s) / 2
  const ty = plateY + pad + (plateH - pad * 2 - hero.cellsH * s) / 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">`,
    `<rect width="${OG_W}" height="${OG_H}" fill="#131316"/>`,
    `<g font-family="-apple-system, 'Segoe UI', system-ui, sans-serif">`,
    `<text x="72" y="216" font-size="19" font-weight="600" letter-spacing="3" fill="#9a9aa6">FREE · IN YOUR BROWSER · NO SIGN-UP</text>`,
    `<text x="68" y="312" font-size="92" font-weight="800" letter-spacing="-2" fill="#e4e4ea">Ditherlab</text>`,
    `<text x="72" y="368" font-size="27" fill="#9a9aa6">Pixel editor with clean SVG export</text>`,
    `<text x="72" y="410" font-size="21" fill="#818cf8">dithering · metaballs · node recipes · symmetry</text>`,
    `</g>`,
    `<rect x="${plateX}" y="${plateY}" width="${plateW}" height="${plateH}" rx="16" fill="#17171b" stroke="rgba(255,255,255,0.1)"/>`,
    `<g transform="translate(${tx} ${ty}) scale(${s})">`,
    inner,
    `</g>`,
    '</svg>',
  ].join('\n')
}

const publicUrl = (name: string): URL => new URL(`../public/${name}`, import.meta.url)

async function main(): Promise<void> {
  await mkdir(new URL('../public/art/', import.meta.url), { recursive: true })

  const byId = new Map(DEMO_PROJECTS.map((def) => [def.id, def]))
  for (const pick of PICKS) {
    const def = byId.get(pick.id)
    if (!def) throw new Error(`demo "${pick.id}" not found`)
    const poster = renderPoster(def)
    await writeFile(publicUrl(`art/${pick.file}.svg`), poster.svg)
    console.log(`art/${pick.file}.svg  ${poster.width}×${poster.height}`)
  }

  const hero = renderPoster(byId.get(POSTER_DEMO.id)!)
  await writeFile(publicUrl('favicon.svg'), faviconSvg())
  await writeFile(publicUrl('icon-source.svg'), iconSourceSvg())
  await writeFile(publicUrl('og-source.svg'), ogSvg(hero))
  console.log('favicon.svg, icon-source.svg, og-source.svg written')
}

void main()
