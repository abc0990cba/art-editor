# Design: add-landing-seo

## Context

`index.html` is the whole site today: 13 lines, `lang="ru"`, a title, and an empty `#root` filled
client-side by `src/app/main.tsx`. The router (`src/app/router.tsx`) treats `/` as the projects
home and `/p/$projectId` as the editor. There are no meta tags beyond `color-scheme`, no favicons,
no robots.txt/sitemap, and no hosting configuration in the repo. The engine exposes `buildSvg(doc)`
— a pure string serializer — and 22 pure demo-document factories (`src/engine/demo-project.ts`),
so product-true artwork can be rendered in Node without a browser.

## Decisions

### Hand-rolled static pages, not an SSG framework

Vite's native multi-page build (`build.rollupOptions.input`) serves the need: the landing is one
static page pair with zero interactivity beyond theme/language persistence. Adding Vike /
vite-react-ssg / Astro would introduce a framework, a build step and a render layer to produce
what is ultimately static HTML with a known shelf life. Cost of the hand-rolled route: copy
exists in two HTML files and must be kept symmetric — mitigated by `seo:check` and a
section-for-section structure. If content pages multiply later, the exit path (an SSG layer) does
not invalidate anything built here.

### URL layout: `/` landing, `/en/` landing, `/editor` app

`index.html` becomes the Russian landing; `en/index.html` the English one; the current app entry
moves to `editor/index.html` — a real directory index, so `/editor/` serves on every static host
without any rewrite (deep links still use the rewrites below). The router gets `basepath:
'/editor'`, so its route tree and semantics are
untouched — only the URL prefix changes. Hosting needs exactly one rewrite (`/editor` and
`/editor/*` → `/editor/index.html`), shipped as `public/_redirects` + `vercel.json` and mirrored in dev
and preview by a Vite middleware plugin (`configureServer` / `configurePreviewServer`). There is
deliberately **no global SPA fallback**: the only client-side routes live under `/editor`, and
keeping real 404s for everything else is the SEO-correct behavior.

### Copy lives in HTML, not in the i18n dictionaries

The app dictionaries (`shared/i18n/*.messages.ts`) feed React strings; crawlers must see final
markup without executing JavaScript. The landing therefore carries its own ru/en copy as static
text. The en/ru duplication is by design and page-symmetric; `seo:check` guards structural
parity, not prose.

### Language and theme continuity

Language links navigate between `/` and `/en/` and write `glyph.lang` first, so the app opens in
the language the visitor picked. No automatic `navigator.language` redirect — it misleads
crawlers (a single URL serving varying content) and overrides explicit user choice. A ~6-line
inline head script applies `glyph.theme` (auto → `prefers-color-scheme`) to `data-theme` before
first paint, so the landing matches the app theme with no flash.

### Domain placeholder

Canonical, OG URLs and the sitemap need an absolute origin. Until one exists they use
`https://ditherlab.example` (RFC 2606 reserved TLD — cannot accidentally resolve or collide).
`seo:check` warns while the placeholder is present; replacing it is a one-value edit across
`index.html`, `en/index.html` and `public/sitemap.xml`.

### Editor page is noindex

`editor/index.html` is a JS-only shell with no crawlable content; it is marked `noindex` and excluded
from the sitemap so search engines do not index an empty shell competing with the landing.

### Artwork provenance

`scripts/generate-landing-art.ts` imports the pure demo factories and `buildSvg`, writes committed
SVGs into `landing/art/` (run via `tsx`, a dev-only dependency). The favicon and OG image are
one-off renders of the same pipeline, committed as binaries. Landing visuals are therefore the
engine's actual output — the same geometry users see on canvas — and stay reproducible.

## Risks / trade-offs

- Copy sync between `index.html` and `en/index.html` is manual — accepted for two pages;
  `seo:check` verifies structural parity (same sections, links, meta), not prose.
- `basepath: '/editor'` changes every documented deep link and the bench URL; AGENTS.md, README,
  docs pages and PERFLOG mentions are updated in the same change.
- The Vite middleware must be kept in sync with hosting rewrites; both ship in this change and
  `npm run preview` + curl checks cover the mapping.
- `landing/main.ts` and `scripts/` sit outside `src/`, so `tsconfig`, oxfmt/oxlint invocations,
  knip entries and format scripts pick them up explicitly.
