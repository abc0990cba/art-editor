# Tasks: fix-corner-bridge-web

## 1. Engine

- [x] 1.1 `geometry/outline.ts`: pinch-vertex detour (fuse the square web into simplified loops
      when connectivity is `corner-bridge`); delete `bridgeOverlays` and the separate bridge
      path emission

## 2. Tests

- [x] 2.1 `geometry/connectivity.test.ts`: single fused path for `corner-bridge`; detour
      vertices present; direction/mirror symmetry against the silhouette path
- [x] 2.2 New cases: zero concave radius ⇒ byte-identical to `corner` mode; L-shaped cluster
      (orthogonal neighbor filled) ⇒ no detour; `sub=2` detour coordinates; chamfer style emits
      straight cuts at the detour corners

## 3. Docs & polish

- [x] 3.1 Update docs mentioning the bridge overlay (engine map / module pages)
- [ ] 3.2 Full check chain green (format/lint/arch/knip/tsc/test); browser spot-check of the
      staircase + checkerboard at 32%/40%, all three connectivity modes, arc and chamfer styles
