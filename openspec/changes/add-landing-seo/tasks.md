# Tasks: add-landing-seo

## 1. Multi-page build + editor base path

- [x] 1.1 `editor/index.html` (moved from `index.html`): same `/src/app/main.tsx` script, favicon links, `theme-color`, `meta robots noindex`
- [x] 1.2 `vite.config.ts`: `build.rollupOptions.input` for `index.html`, `en/index.html`, `editor/index.html`; middleware plugin mapping `/editor` and `/editor/*` → `/editor/index.html` in dev and preview
- [x] 1.3 `src/app/router.tsx`: `basepath: '/editor'`; routes and semantics unchanged
- [x] 1.4 Update bench URL mentions (`/editor/?bench=1`) in AGENTS.md, README.md, docs

## 2. Landing pages

- [x] 2.1 `index.html` (ru) + `en/index.html` (en): static markup, Tailwind utilities on design tokens, `landing/landing.css` importing `src/index.css`
- [x] 2.2 Inline theme bootstrap (pre-paint `data-theme` from `glyph.theme`, auto → `prefers-color-scheme`)
- [x] 2.3 `landing/main.ts`: language links persist `glyph.lang` before navigating; both pages cross-linked
- [x] 2.4 Content: hero + CTA → `/editor`, engine poster art, feature sections (tools, dither fills, image import, cell styling, metaball/outline, symmetry, node graphs, vectorizer/gradient, export, local-first, themes/i18n), footer

## 3. Artwork & assets

- [x] 3.1 `scripts/generate-landing-art.ts`: demo factories → `buildSvg` → committed `landing/art/*.svg` (run via `tsx`)
- [x] 3.2 `public/favicon.svg`, `apple-touch-icon.png`, `og.png` (1200×630), `manifest.webmanifest`

## 4. SEO head & crawler files

- [x] 4.1 Both landing pages: title, description, canonical, hreflang (ru/en/x-default), Open Graph + locale alternates, Twitter card, JSON-LD SoftwareApplication, favicon/manifest links, theme-color
- [x] 4.2 `public/robots.txt` (allow all + sitemap), `public/sitemap.xml` (landing pages only)
- [x] 4.3 Placeholder domain `https://ditherlab.example` documented as a go-live replacement step

## 5. Hosting configs

- [x] 5.1 `public/_redirects` (`/editor`, `/editor/*` → `/editor/index.html`, 200) for Netlify/CF Pages
- [x] 5.2 `vercel.json` with the same rewrites

## 6. seo:check

- [x] 6.1 `scripts/seo-check.mjs` + `npm run seo:check`: meta completeness on built HTML, sitemap ≡ landing pages, robots → sitemap, placeholder-domain warning

## 7. Tooling & docs

- [x] 7.1 tsconfig includes `landing`, `scripts`; oxfmt/oxlint scripts cover them; knip entries for `landing/main.ts`, `scripts/*`
- [x] 7.2 ADR for the static-MPA landing decision; update `docs/README.md`, README.md structure/URLs

## 8. Verification

- [x] 8.1 Full gate green: `format:check`, `lint`, `arch:check`, `knip`, `tsc --noEmit`, `test`, `build`
- [x] 8.2 `seo:check` passes; preview + curl: `/`, `/en/`, `/editor` rewrite, `/editor/p/x` app shell, robots, sitemap
- [x] 8.3 Browser walkthrough: landing themed, CTA opens editor, project opens, deep link works, language switch carries `glyph.lang`; design-review pass on the landing

## 9. Follow-up polish (same change)

- [x] 9.1 Header theme toggle (dark → black OLED → light, persists `glyph.theme`), hero restyled to a centered minimal layout with a token-based glow, scroll-reveal animations (JS-gated, `prefers-reduced-motion`-safe), numbered feature cards with tightened copy (ru+en symmetric)

## 10. Follow-up: hosting-proof editor entry (Vercel 404)

- [x] 10.1 `editor.html` → `editor/index.html`: the bare `/editor/` URL is a real directory index, so the main entry needs no hosting rewrite (Vercel's `/editor/:path*` does not match the trailing-slash form and drag-and-drop deploys carry no rewrites at all); deep-link rewrites retargeted to `/editor/index.html`
- [x] 10.2 Live Vercel check: with rewrites defined, Vercel skips directory-index resolution entirely — `/editor/` 404'd while `/editor/index.html` served. Added the explicit `/editor/` rewrite to `vercel.json` and the matching `_redirects` line
