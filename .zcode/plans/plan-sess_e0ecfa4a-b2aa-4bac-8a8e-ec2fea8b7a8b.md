## Fix: corner-bridge junction — fuse a square web into the outline loop

### Problem (confirmed in code)

In outline mode with Connectivity = "Corner + bridge", each diagonal junction gets a **separate diamond overlay** (`bridgeOverlays`, `src/engine/geometry/outline.ts:230-280`) whose vertices sit at the four edge midpoints. Two defects match what you see in the preview:

1. **It renders as a literal circle.** The diamond's edge is only ≈0.707 cell; fillet tangent length clamps to half the edge run (`poly-path.ts:150`). At Concave radius ≥ ~35% the fillets consume the entire diamond → four arcs ≈ a circle. At your 32%/40% settings every bridge is a circle. The bridge size is also driven by the *concave* slider only (`outline.ts:234`).
2. **It reads as a stamped blob, not a connection.** The diamond's points aim up/down/left/right (perpendicular to the A↔B axis), and being an overlay it meets the cells at single points, so it doesn't look like the squares joining.

### Approved design: square web fused into the silhouette

Remove the overlay entirely. When `connectivity === 'corner-bridge'`, after `simplifyLoop` and before filleting, replace each **pinch vertex** (a vertex the loop visits twice — exactly the case where two same-color cells touch diagonally and both orthogonal neighbors are empty) with a 3-point square detour into each empty corner:

- At a pinch visit with incoming unit dir `i` and outgoing unit dir `o` (axis-aligned), replace vertex `v` with: `P1 = v − s·i`, `P2 = v − s·i + s·o`, `P3 = v + s·o`, where `s = concaveRadius / doc.sub` (0 ⇒ identical to "Via corner").
- The detour's two reflex corners get **concave** fillets and its outer corner gets the **convex** fillet automatically via the existing `filletPath` pipeline — tangent-continuous web, both sliders at work, one continuous path (no evenodd overlay path), square-step look that can never degenerate into a circle.
- Works for chamfer style, `squareEdges`/`keepCorner`, sub-detail, and both diagonal orientations for free (all computed from local edge directions).

### Changes

1. `src/engine/geometry/outline.ts` — add pinch-fusing (e.g. `fuseCornerBridges(loops, s)`) applied between `simplifyLoop` and `emitFilletPath` (thread through `roundedOutlinePath`); delete `bridgeOverlays` and the separate bridge-path emission (`outline.ts:81-86`).
2. `openspec/` — small change proposal updating `openspec/specs/pixel-styling/spec.md` requirements "Diagonal connectivity modes" (corner-bridge bullet) and "Junction overlay alignment" (no longer an overlay): proposal + spec delta + tasks, then implement per tasks.
3. Docs — grep `docs/` for bridge/diamond mentions (engine-map, module pages) and update the affected lines.
4. Tests:
   - Update `connectivity.test.ts`: corner-bridge now yields a **single** fused path (no `paths[1]` overlay); rewrite the exact-string and the two symmetry tests against `paths[0]`; assert detour vertices present.
   - Add: radius 0 ⇒ byte-identical to `corner` mode; L-shaped cluster (orthogonal neighbor filled) ⇒ no detour; `sub=2` coordinates; chamfer detour emits straight cuts.
   - Check `outline.test.ts` / `corner-styles.test.ts` for overlay assumptions; metaball tests untouched.

### Verification

- Full gate: `npm run format:check && npm run lint && npm run arch:check && npm run knip && npx tsc --noEmit && npm test`.
- Visual: `npm run dev`, reproduce the screenshot's staircase at convex 32% / concave 40% plus a 3×3 checkerboard; screenshot all three connectivity modes and chamfer style; confirm no circle, tangent transitions, correct mirror/rotation symmetry.
- `npm run bench` vs baseline — not a perf change; PERFLOG row only if an unexpected >5% outline-geometry regression appears.

I'll propose the ready commit message at the end (you commit): `fix(outline): fuse corner-bridge webs into the silhouette loop` with a body describing the overlay removal and detour math.