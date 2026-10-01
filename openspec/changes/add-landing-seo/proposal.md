# Proposal: add-landing-seo

## Why

The app is invisible to search engines and link previews: `index.html` carries only a `<title>`,
with no description, no Open Graph/Twitter cards, no canonical URL, no favicons, no manifest, and
the site has no robots.txt or sitemap. Without JavaScript the public entry renders nothing at all.
`add-project-home` explicitly deferred SSR/SEO as a non-goal; that deferral is now reversed —
a product that nobody can discover cannot benefit from anything else in it.

## What Changes

- **Public landing at `/` (Russian) and `/en/` (English)**: hand-written static HTML pages — no
  framework, no app bundle, no client rendering — with a hero, engine-generated artwork, a feature
  overview and a call-to-action into the editor. The pages are cross-linked with `hreflang`
  annotations; a language link persists the choice (`glyph.lang`) so the app opens in the chosen
  language.
- **Editor moves to `/editor`**: the current SPA entry becomes a directory entry (`editor/index.html`);
  the TanStack Router gains `basepath: '/editor'`. Relative routes are unchanged (`/` → home,
  `/p/$projectId` → editor), so deep links become `/editor` and `/editor/p/$projectId`; the bench
  harness moves to `/editor/?bench=1`. `/` stops being an app surface.
- **SEO head on both landing pages**: title, meta description, canonical, `hreflang` (ru / en /
  x-default), Open Graph (+ locale alternates), Twitter card, JSON-LD `SoftwareApplication`,
  favicon set, web manifest and `theme-color`.
- **Crawler files**: `robots.txt` (allow all, sitemap reference) and `sitemap.xml` listing exactly
  the landing pages — the editor page is `noindex` and stays out of the sitemap.
- **Hosting rewrites**: `/editor` and `/editor/*` → `/editor/index.html` shipped as `public/_redirects`
  (Netlify, Cloudflare Pages) and `vercel.json` (Vercel); dev and preview servers get the same
  mapping via a small Vite middleware so all three environments behave identically. No global SPA
  fallback: unknown paths keep returning real 404s.
- **Engine-generated artwork**: a build-time script renders demo documents through `buildSvg` into
  committed SVGs for the landing; the favicon and OG image are derived from the same artwork.
- **`seo:check`**: a script validating the built output — meta completeness on every HTML page,
  sitemap ≡ landing pages, robots → sitemap, and a warning while the placeholder domain is in use.

## Capabilities

### Added

- `landing-page`: the public, crawlable entry surface at `/` and `/en/` — content, SEO head,
  language and theme interplay with the app, and crawler directives.

### Modified

- `app-routing`: the app surface lives under the `/editor` base path; routes relative to the base
  and their semantics are unchanged.

## Non-Goals

- Server-side rendering of the editor itself — the app stays a pure client SPA over IndexedDB.
- Multi-language expansion beyond ru/en, localized routes beyond `/` and `/en/`, or
  automatic `navigator.language` redirects (they harm crawlers and user control).
- A blog/docs/changelog section — content pages can come later; the approach does not depend on
  an SSG framework.
- A live "try in browser" embed of the editor on the landing page — the CTA navigates to `/editor`.
