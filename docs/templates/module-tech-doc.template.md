# <Subsystem name> — technical notes

> How to use this template (delete this block in the copy):
>
> 1. Copy this file to `docs/modules/<subsystem>.md` (kebab-case, no code-file suffixes).
> 2. Replace every `<placeholder>`; delete sections that genuinely do not apply.
> 3. Keep every claim anchored to the code: file paths, exported names, and line refs
>    where a fact is load-bearing. If you cannot point at the code, either verify it or cut it.
>    Reference source files as clickable relative links with the backticked path as link text —
>    from `docs/modules/` that is `` [`src/engine/x/y.ts`](../../src/engine/x/y.ts) `` — plus the
>    exported symbol name. Never use `#L` line anchors: they drift on every edit.
> 4. Target 80–250 lines (engine deep-dive pages may run longer when the walkthrough earns it).
>    Add a Mermaid diagram only where it earns its place (1–2 per engine page is the norm).
> 5. Cite performance numbers only from existing bench files / `bench/PERFLOG.md` /
>    `docs/research/performance.md` — never invent or round numbers upward.
> 6. Link the doc from the Module docs table in `docs/README.md`.
> 7. If the subsystem embodies a durable technology choice, also add an ADR
>    (`docs/templates/adr.template.md` → `docs/decisions/NNNN-<slug>.md`) and cross-link.

## Scope

What this subsystem is and what it is *not*. One short paragraph: the user-facing capability,
the layer(s) it lives in (`src/engine/…`, `src/features/…`, `src/state/…`), and its neighbors.

## Module map

| File | Role |
|---|---|
| `src/engine/example.ts` | one line |

## How it works

The pipeline / data flow. This is the core section — write it for an engineer who has never
opened these files and needs to modify the subsystem safely. Use a Mermaid `flowchart` or
`sequenceDiagram` if the flow has more than three hops.

## Data structures

Key types with their fields and semantics (only the fields that matter for understanding;
point at the source for the rest).

## Algorithms

Per non-trivial algorithm: input → output, the approach, complexity where known.

## Invariants & constraints

Rules the code relies on (buffer contracts, identity/caching contracts, grid limitations).
Violating these is what produces subtle bugs — enumerate them.

## Performance characteristics

Costs, hot paths, known cliffs. Cite: bench file, `bench/PERFLOG.md` row, or
`docs/research/performance.md` section.

## Testing

Test files and what each pins down. Mention parity/oracle tests if any.

## Related decisions

- ADR-000X — Title (link: `../decisions/000X-slug.md`) — one-line relevance.

## OpenSpec capabilities

Behavioral truth for this subsystem lives in:

- `openspec/specs/<capability>/spec.md`

## Known limitations

Honest list: what the subsystem does not do yet, known cliffs, planned work (link PERFLOG
roadmap items or OpenSpec changes where relevant).
