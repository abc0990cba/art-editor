# wasm-flood — Rust→WASM flood-fill spike (bench-only)

A bounded performance experiment (perf research W4, PERFLOG M6 follow-up): a flood-fill core
in Rust, compiled to a raw `wasm32-unknown-unknown` cdylib, timed against the production
TypeScript implementation in `src/engine/floodfill.ts`.

**This crate is not part of the application.** Nothing in `src/` imports it; there is no
WASM in the production bundle. It exists so the "would this core be faster in Rust?" question
has a measured answer instead of an opinion — and so future cores (metaball field, trace) can
be tested against the same rig and the same gate. The full policy: [ADR-0003](../../docs/decisions/0003-rust-wasm-policy.md).

## Layout

- `src/lib.rs` — 97 lines, no bindings. Exports: `init(len)` (allocates a cells + pristine
  scratch pair, deliberately leaked — the bench owns the lifetime), `pristine_offset`,
  `restore` (pristine → cells copy, the reset floor), `flood(bw, start, value)` (4-neighbour
  fill over u16 cells, returns region size), `flood_fresh` (restore + flood, the re-runnable
  iteration cost).
- `target/wasm32-unknown-unknown/release/flood_wasm.wasm` — the prebuilt module, committed so
  the bench runs without a Rust toolchain.

## Build

```bash
cd bench/wasm-flood && RUSTC="$(rustup which rustc)" cargo build --release --target wasm32-unknown-unknown
```

The explicit `RUSTC` is needed where Homebrew's rustc shadows the rustup toolchain.

## Run

```bash
npx vitest bench --run src/engine/flood-wasm.bench.ts
```

The bench (2048² doc, ~7 % disc region) compares: shipped TS `floodFillDoc`, a bench-local
tuned TS variant, and the Rust core; it skips cleanly when the `.wasm` is absent and
validates the WASM region count against TS `floodRegion` before timing anything.

## Result (2026-09-30)

| Variant | Time |
|---|---|
| Shipped TS | 11.0 ms |
| Tuned TS (mark-on-push, no mask, no per-cell neighbour arrays) | **3.1 ms** |
| Rust core (core-only ≈ `flood_fresh` − `restore`) | ≈ 3.2 ms (+0.7 ms restore floor) |

Verdict: the shipped TS lost 3.5× to its own allocations, not to JavaScript; tuned TS matches
the Rust core. The re-entry gate ("≥2× faster than tuned TS AND ≥20 % of end-to-end time")
failed — the app stays TypeScript. Keep this rig for the next core that asks the question.
