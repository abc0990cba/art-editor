/**
 * SEO self-check over the built site (`npm run build` first): every landing page must carry the
 * full head contract — title, description, canonical, hreflang, Open Graph, Twitter card, JSON-LD —
 * and reference existing images; the sitemap must list exactly the landing pages under one origin,
 * and robots.txt must reference the sitemap. The editor page must be noindex. While the reserved
 * placeholder origin (https://ditherlab.example) is still in place a warning is printed and the
 * check exits 0 — replace it before go-live.
 *
 * Usage: npm run seo:check (after vite build)
 */

import { readFile } from 'node:fs/promises'

const DIST = new URL('../dist/', import.meta.url)
const PLACEHOLDER_ORIGIN = 'https://ditherlab.example'
const LANDING_PAGES = ['index.html', 'en/index.html']

/** [tag, attribute, required value pattern] — attribute value must match. */
const HEAD_RULES = [
  ['meta[name="description"]', 'content', /.+/],
  ['link[rel="canonical"]', 'href', /^https:/],
  ['link[rel="alternate"][hreflang="ru"]', 'href', /^https:/],
  ['link[rel="alternate"][hreflang="en"]', 'href', /^https:/],
  ['link[rel="alternate"][hreflang="x-default"]', 'href', /^https:/],
  ['meta[property="og:title"]', 'content', /.+/],
  ['meta[property="og:description"]', 'content', /.+/],
  ['meta[property="og:image"]', 'content', /^https:.*og\.png$/],
  ['meta[property="og:url"]', 'content', /^https:/],
  ['meta[name="twitter:card"]', 'content', /^summary_large_image$/],
]

let failed = false
let placeholderUsed = false

const problem = (message) => {
  failed = true
  console.error(`  ✗ ${message}`)
}

/**
 * Value of `attribute` on the first tag matching a CSS-ish selector like
 * `meta[property="og:image"]` — works across the multi-line tags oxfmt produces.
 */
const attr = (html, selector, attribute) => {
  const parsed = selector.match(/^([a-z]+)((?:\[[^=]+="[^"]*"\])*)$/)
  if (!parsed) return null
  const filters = [...parsed[2].matchAll(/\[([^=]+)="([^"]*)"\]/g)].map(([, k, v]) => [k, v])
  const openTags = html.match(new RegExp(`<${parsed[1]}\\s[^>]*>`, 'g')) ?? []
  const tag = openTags.find((t) => filters.every(([k, v]) => t.includes(`${k}="${v}"`)))
  if (!tag) return null
  return tag.match(new RegExp(`${attribute}="([^"]*)"`))?.[1] ?? null
}

for (const page of LANDING_PAGES) {
  console.log(page)
  let html
  try {
    html = await readFile(new URL(page, DIST), 'utf8')
  } catch {
    problem('not found in dist/ — run `npm run build` first')
    continue
  }
  for (const [selector, attribute, pattern] of HEAD_RULES) {
    const value = attr(html, selector, attribute)
    if (value === null) problem(`missing ${selector}`)
    else if (!pattern.test(value))
      problem(`${selector} ${attribute}="${value}" does not match ${pattern}`)
  }
  if (!html.includes('application/ld+json')) problem('missing JSON-LD block')
  if (!html.includes('<html lang="ru">') && !html.includes('<html lang="en">')) {
    problem('missing html lang attribute')
  }
  // every referenced relative asset must exist in dist; the absolute og:image too
  for (const src of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:svg|png|webmanifest))"/g)) {
    const file = src[1].slice(1)
    try {
      await readFile(new URL(file, DIST))
    } catch {
      problem(`referenced asset /${file} is missing from dist/`)
    }
  }
  const ogImage = attr(html, 'meta[property="og:image"]', 'content')
  if (ogImage) {
    const path = new URL(ogImage).pathname.slice(1)
    try {
      await readFile(new URL(path, DIST))
    } catch {
      problem(`og:image ${ogImage} is missing from dist/`)
    }
  }
  const canonical = attr(html, 'link[rel="canonical"]', 'href')
  if (canonical?.startsWith(PLACEHOLDER_ORIGIN)) placeholderUsed = true
}

console.log('editor.html')
try {
  const editor = await readFile(new URL('editor/index.html', DIST), 'utf8')
  if (!(editor.includes('name="robots"') && editor.includes('content="noindex"'))) {
    problem('editor page is not noindex')
  }
} catch {
  problem('not found in dist/')
}

console.log('sitemap.xml / robots.txt')
try {
  const sitemap = await readFile(new URL('sitemap.xml', DIST), 'utf8')
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const expectedPaths = LANDING_PAGES.map((p) =>
    p === 'index.html' ? '/' : `/${p.replace(/\/index\.html$/, '/')}`,
  )
  const paths = locs.map((loc) => new URL(loc).pathname)
  if (locs.length !== expectedPaths.length) {
    problem(`sitemap lists ${locs.length} URLs, expected ${expectedPaths.length}`)
  }
  for (const p of paths) if (!expectedPaths.includes(p)) problem(`unexpected sitemap path ${p}`)
  for (const p of expectedPaths) if (!paths.includes(p)) problem(`sitemap is missing ${p}`)
  const origins = new Set(locs.map((loc) => new URL(loc).origin))
  for (const origin of origins) {
    if (origin === PLACEHOLDER_ORIGIN) placeholderUsed = true
    for (const loc of locs) {
      if (!loc.startsWith(origin))
        problem(`sitemap URL ${loc} is not under a single origin (${origin})`)
    }
  }

  const robots = await readFile(new URL('robots.txt', DIST), 'utf8')
  if (!robots.includes('Sitemap:')) problem('robots.txt does not reference the sitemap')
} catch {
  problem('sitemap.xml or robots.txt missing from dist/')
}

if (placeholderUsed) {
  console.warn(
    `  ⚠ placeholder origin ${PLACEHOLDER_ORIGIN} is still in use — replace it with the real` +
      ' domain in index.html, en/index.html, public/robots.txt and public/sitemap.xml before go-live.',
  )
}

if (failed) {
  console.error('seo:check FAILED')
  process.exit(1)
}
console.log('seo:check OK')
