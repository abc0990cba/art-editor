# ADR-0003 — Rust/WASM policy: no Rust in production, gated re-entry

- Status: accepted
- Date: 2026-10-01 (spike + verdict recorded 2026-09-30, PERFLOG M6 and research W4)
- Related: [ADR-0004](0004-vtracer-ts-port.md); [research/performance.md](../research/performance.md) §8; `bench/wasm-flood/`; `src/engine/flood-wasm.bench.ts`

## Context

The project repeatedly faces "numeric core" questions: flood fill, metaball fields, raster
ops, tracing. Rust→WASM is the obvious candidate when a core is slow, and the question "why
isn't this in Rust?" comes up for every hot loop. Before committing to a toolchain, the
hypothesis deserved a measurement: is the JS losing to the *language* or to the *algorithm*?

## Decision

**There is no Rust in the production application.** No `.wasm` ships in the bundle, no
wasm-bindgen/wasm-pack dependency exists, and production code contains no `WebAssembly`
instantiation. Concretely, Rust appears in exactly three bounded roles:

1. **Provenance** — the vectorizer is a TypeScript port of the Rust tool
   [vtracer](https://github.com/visioncortex/vtracer) V1 (MIT); the Rust code is reference,
   not a dependency (see [ADR-0004](0004-vtracer-ts-port.md)).
2. **Dev-only parity oracle** — `@visioncortex/vtracer` is a *devDependency* whose WASM build
   is instantiated only inside `src/engine/trace/parity.test.ts` to check the TS port
   structurally. It never ships.
3. **Bench-only spike crate** — `bench/wasm-flood/` is a raw `wasm32-unknown-unknown` cdylib
   (no bindings) measuring a flood-fill core against the TS implementation. Committed to the
   repo with its prebuilt `.wasm` as a reusable experiment rig "for future cores (metaball
   field, trace) with the same gate".

**Re-entry gate** for any WASM core: a tuned pure-TS implementation must first exist, and the
WASM core must be **≥2× faster than the tuned TS** **and** the operation must be **≥20 % of
end-to-end** interaction time. Neither condition is negotiable alone.

## Alternatives considered

- **Ship flood fill (or future cores) as Rust/WASM** — rejected on evidence: the spike
  measured current TS flood at 11.0 ms, a tuned TS variant (mark-on-push, no per-cell
  neighbour arrays, no mask) at **3.1 ms**, and the Rust core at ≈**3.2 ms** core-only
  (+0.7 ms restore copy floor). The shipped TS was 3.5× slower than itself tuned; the
  language was not the bottleneck. The gate failed on both conditions.
- **wasm-pack + wasm-bindgen integration** — rejected: adds a toolchain and glue layer for a
  benefit no measured core exhibits; the spike deliberately uses raw cdylib exports to keep
  even the experiment dependency-free.
- **Keep WASM "just in case" in the bundle** — rejected: async instantiation, memory
  ownership and copy costs across the boundary are real; nothing pays for them today.

## Consequences

- Numeric work stays in TypeScript; performance effort goes into algorithmic tuning and data
  structures (typed arrays, fewer allocations) — which the spike shows is where the wins are.
- `bench/wasm-flood/` is maintained as a bench rig: rebuild with
  `cd bench/wasm-flood && RUSTC="$(rustup which rustc)" cargo build --release --target
  wasm32-unknown-unknown` (explicit `RUSTC` needed where Homebrew's rustc shadows rustup);
  `flood-wasm.bench.ts` skips cleanly when the module is absent and validates the WASM result
  against the TS `floodRegion` before timing it.
- Any future proposal to move a core to WASM must bring: a tuned-TS baseline, the W4-style
  measurement, and the end-to-end share — in an ADR that cites them.

## Evidence

- `src/engine/flood-wasm.bench.ts` — the three-way comparison and the correctness gate.
- `bench/wasm-flood/src/lib.rs` — the 97-line cdylib (`init/pristine_offset/restore/flood/
  flood_fresh`), header documents the bounded-spike intent.
- `bench/PERFLOG.md` rows 2026-09-26 (M6 deferral) and 2026-09-30 (research W4: "Stay TS",
  gate not met).
- `docs/research/performance.md` §8 table row W4 and §10 ("Explicitly not recommended now:
  WASM/Rust cores (gate failed)").
