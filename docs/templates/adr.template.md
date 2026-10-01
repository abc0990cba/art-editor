# ADR-NNNN — <decision title>

> How to use this template (delete this block in the copy):
>
> 1. Copy to `docs/decisions/NNNN-<slug>.md`. Numbers are sequential and never reused;
>    a rejected/retired number stays in the index marked as such.
> 2. One decision per ADR. If you need "and" in the title, split it.
> 3. An accepted ADR is immutable: corrections happen in a new ADR that supersedes this one
>    (flip `Status:` to `superseded by ADR-MMMM` and link both ways).
> 4. Evidence is mandatory: bench files, `bench/PERFLOG.md` rows, OpenSpec change names,
>    or source files. An ADR without evidence is an opinion.
> 5. Cross-link from the affected `docs/modules/*.md` pages ("Related decisions").

- Status: accepted
- Date: YYYY-MM-DD
- Related: OpenSpec change `<change-name>`; module doc `<doc>.md`; bench `<file>`

## Context

The forces at play: requirements, constraints, measurements, prior state. Written so a new
contributor can re-derive why the decision was non-obvious at the time.

## Decision

The choice, stated in one sentence up front, then the operative details (what is used where,
what is explicitly NOT used, and any gates for revisiting).

## Alternatives considered

Each alternative with the reason it lost. This section is the reason ADRs exist — do not skip it.

## Consequences

What becomes easier, what becomes harder, what new obligations appear (e.g. "every new numeric
core must be benchmarked against the W4 gate before considering WASM").

## Evidence

- `<path/to/bench.ts>` — what it measured and the numbers.
- `bench/PERFLOG.md` row `<date/phase>` — the recorded verdict.
- `openspec/changes/<name>/design.md` — the change-scoped design that originated the decision.
