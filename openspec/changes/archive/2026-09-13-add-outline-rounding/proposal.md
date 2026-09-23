# Proposal: add-outline-rounding

## Why

With metaball mode off, adjacent painted cells render as separate rounded shapes: the seam
between two neighbors shows concave notches, so connected pixels never look "joined". Users want
a metaball-like join that stays pixel-accurate: connected cells should form one silhouette whose
outer boundary is rounded, while the shared edges stay straight. A field-based metaball cannot
provide this (it inflates shapes), so the editor needs an exact union-outline render mode with
corner fillets.

## What Changes

- Replace the boolean "metaball on/off" with an explicit render mode: `pixels | outline | metaball`.
- Add the outline mode: per color group, connected cells merge into a single silhouette traced
  exactly along cell edges (padded binary marching squares), collinear runs merge, and every
  90° corner of the outline — convex and concave — receives a circular fillet sized by the
  existing corner-radius setting.
- Outline mode ignores per-corner radii and X/Y stretch (cells are full cells); sub-cells work
  naturally; connectors render as capsules as in pixels mode.
- Migrate saved projects: a document with `metaball.enabled: true` loads as render mode
  `metaball`, otherwise `pixels`.

## Capabilities

### Modified

- `pixel-styling` — ADDED requirement: outer contour rounding mode; the corner-radius setting
  drives outline fillets in outline mode.

### Renamed/Migrated

- `metaball-rendering` — metaball becomes one of three explicit render modes selected in the UI
  (behavior of the mode itself unchanged).

## Non-Goals

- Separate convex/concave fillet radii, 45° chamfers, outline stroke/shadow (backlog)
- Changing metaball field behavior or its settings
