# Spike: importing SVG features into Adobe Illustrator (stage 0)

Open [samples/ai-import-test.svg](../../samples/ai-import-test.svg) **two ways** and compare:
1) in a browser (the reference), 2) in your Adobe Illustrator ("File → Open" and, separately,
"Place" onto a canvas). Record observations in the "Illustrator observation" column — this
table decides which constructs are allowed in the AI-safe export profile of the gradient
tracer.

| # | Construct | Expected in browser | Illustrator observation | Verdict (AI-safe?) |
|---|---|---|---|---|
| 1 | `linearGradient`, `gradientUnits="userSpaceOnUse"`, 3 stops | smooth red→orange→green | | |
| 2 | `radialGradient` + `gradientTransform` (translate/rotate/scale → ellipse) | blue elliptical gradient with a white center, rotated | | |
| 3 | `stop-opacity` (0→1) | purple, fading to the right | | |
| 4 | `clipPath` (circle) | gradient clipped to the circle | | |
| 5 | `mask` with a radial-gradient mask | red background, revealing toward the center | | |
| 6 | `mix-blend-mode: multiply` | orange square darkens blue (dark chocolate) | | |
| 7 | `mix-blend-mode: screen` | purple square lightens a dark background | | |
| 8 | `plus-lighter` on 3 paths (Gouraud triangle) | smooth RGB-gradient triangle | | |
| 9 | `radialGradient` with a `stop-opacity` ramp (splat) | yellow spot dissolving toward the rim | | |

## Already known from research (to verify in practice)

- `mix-blend-mode` (6, 7) and certainly `plus-lighter` (8) are **lost** when importing SVG
  into Illustrator — the effect silently disappears. If confirmed: the engine's spot layers
  stay source-over (section 9 is the working form of the engine's layers), and Gouraud
  triangles are not exported in the AI-safe profile.
- Sections 1–5 and 9 are expected to be reliable: they are the foundation of the gradient
  tracer's export.
- Conic gradients do not exist in SVG at all (outside the table).

## Decisions this table drives

1. If 1–5 and 9 survive — the engine's current export (paths + `linearGradient`/
   `radialGradient` + `stop-opacity`) counts as AI-safe without changes.
2. If 5 (mask) does not survive — the engine does not use it anyway (layers paint the same
   region path), so nothing changes.
3. If 9 does not survive (rare) — replace layer alpha stops with several rings of opaque
   paths (a quality degradation for layers).

See also the compose-side contract in [gradient-workspace](../modules/gradient-workspace.md)
("AI-safe SVG serialization") — `gradient/compose.ts` implements exactly the subset this
table is meant to confirm.
