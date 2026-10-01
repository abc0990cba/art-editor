# landing-page — Delta

## ADDED Requirements

### Requirement: Crawlable public entry

The site root `/` (Russian) and `/en/` (English) SHALL be complete static HTML pages whose
content is fully present without executing JavaScript. Each page SHALL carry a title, a meta
description, a canonical URL, `hreflang` annotations for `ru`, `en` and `x-default`, Open Graph
tags (with locale alternates), a Twitter card type, favicon links and a `theme-color`.

#### Scenario: Crawler without JavaScript

- **WHEN** a crawler fetches `/` without executing JavaScript
- **THEN** it receives the full landing content — headline, feature overview and the editor
  call-to-action — as static HTML

#### Scenario: Link preview

- **WHEN** the site URL is shared in a messenger or social network
- **THEN** the preview shows the landing title, description and OG image

### Requirement: Call-to-action into the editor

Both landing pages SHALL direct visitors into the editor at `/editor` as their primary
call-to-action, and `/editor` SHALL open the app (projects home first).

#### Scenario: CTA navigation

- **WHEN** the visitor activates the primary call-to-action on the landing page
- **THEN** the editor app opens at `/editor` with the projects home screen

### Requirement: Language links persist the choice

The landing pages SHALL be cross-linked (`/` ↔ `/en/`) via visible language links; activating one
SHALL store the chosen language in `glyph.lang` before navigating, so the app opens in that
language. The site SHALL NOT redirect automatically based on `navigator.language`.

#### Scenario: English visitor lands on the Russian page

- **WHEN** a visitor on `/` activates the English language link
- **THEN** the browser navigates to `/en/` and a later app launch uses the English UI

#### Scenario: No automatic redirect

- **WHEN** a crawler or a user with an English browser requests `/`
- **THEN** the Russian page is served unchanged, with the `/en/` alternative offered via `hreflang`
  and the visible language link

### Requirement: Theme continuity

The landing pages SHALL apply the visitor's stored app theme (`glyph.theme`; `auto` resolved via
`prefers-color-scheme`) to the document theme attribute before first paint, so the page matches
the app without a flash of the wrong theme.

#### Scenario: Dark-theme visitor

- **WHEN** a visitor with `glyph.theme = 'oled'` in localStorage opens `/`
- **THEN** the landing renders in the OLED theme from the first paint

### Requirement: Crawler directives

`robots.txt` SHALL allow all crawlers and reference the sitemap. `sitemap.xml` SHALL list exactly
the landing pages (`/`, `/en/`). The editor page SHALL declare `noindex` and SHALL NOT appear in
the sitemap. Unknown paths SHALL keep returning real 404s (no SPA fallback outside `/editor`).

#### Scenario: Sitemap matches the landing pages

- **WHEN** a crawler reads `sitemap.xml`
- **THEN** it finds exactly `/` and `/en/`, both under the canonical site origin

#### Scenario: Editor shell is not indexed

- **WHEN** a crawler fetches `/editor`
- **THEN** the page carries `meta robots noindex`

### Requirement: Engine-generated artwork

The landing artwork SHALL be produced by the same rendering engine the editor uses (`buildSvg`
over document models), committed as static SVG assets, so the visuals shown are the product's
actual output.

#### Scenario: Regenerating the artwork

- **WHEN** a maintainer runs the artwork generation script
- **THEN** the committed landing SVGs are reproduced from the demo documents by `buildSvg`

### Requirement: Structured data

Each landing page SHALL embed JSON-LD describing the application (name, web application category,
free offer, supported languages en/ru), consistent with the page's visible content.

#### Scenario: Rich result eligibility

- **WHEN** a crawler parses `/` or `/en/`
- **THEN** it finds a valid JSON-LD `SoftwareApplication` block matching the visible title and
  description
