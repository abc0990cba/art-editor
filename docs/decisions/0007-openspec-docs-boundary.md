# ADR-0007 — OpenSpec ↔ docs/ boundary and promotion flow

- Status: accepted
- Date: 2026-10-01
- Related: [docs/README.md](../README.md); `openspec/config.yaml`; `.zcode/skills/openspec-archive-change/SKILL.md`

## Context

The project is developed through OpenSpec (spec-driven): behavior contracts live in
`openspec/specs/`, work runs through changes (`proposal.md`, `design.md`, `tasks.md`, spec
deltas) and lands in `changes/archive/`. That workflow is excellent at capturing *what the
product must do*, but it is the wrong home for durable technical knowledge: a change's
`design.md` is scoped to that change, and archived design docs are history, not living
documentation. Meanwhile technical truth was accreting ad hoc — `bench/PERFLOG.md`,
what is now `docs/research/`, header comments — with no architecture overview, no decision
records, and no per-module docs.

## Decision

Maintain **two layers with an explicit boundary**:

| | OpenSpec (`openspec/`) | Technical docs (`docs/`) |
|---|---|---|
| Owns | behavior: requirements, SHALL statements, scenarios | technique: architecture, algorithms, data models, decisions |
| Lifetime | specs = current truth; changes = in-flight work + archive | living documents, updated in place |
| Language | English (mandated in `config.yaml`) | English (language policy in `docs/README.md`) |

New technical docs are created through one template scenario
(`docs/templates/module-tech-doc.template.md` and `docs/templates/adr.template.md`, described
in `docs/README.md`). The `openspec/config.yaml` context carries the boundary so the
OpenSpec-driven agent workflow sees it.

**Promotion flow (at archive time).** When a change is archived:

1. Re-read the change's `design.md` (if any) and the implemented diff.
2. Every durable technology/architecture decision made there gets an ADR
   (`docs/decisions/NNNN-<slug>.md`) — or a superseding update to an existing one.
3. Every module whose internals changed gets its `docs/modules/<subsystem>.md` page updated
   (module map, invariants, performance notes).
4. Perf-relevant work adds its row to `bench/PERFLOG.md` (existing rule, unaffected).

Steps 2–3 are part of the archive checklist, next to spec-delta syncing.

## Alternatives considered

- **Keep everything in OpenSpec `design.md` artifacts** — rejected: archived designs are
  immutable history; readers cannot tell current truth from superseded choices, and
  cross-change architecture knowledge has no home.
- **Add a `tech-doc` artifact inside every OpenSpec change** — rejected: fights the OpenSpec
  CLI's fixed artifact set (proposal/specs/design/tasks); the promotion flow achieves the
  same durability without forking the tooling.
- **External wiki** — rejected: docs must live and evolve with the code in the same commit;
  the check chain and review loop only see the repo.
- **ADRs without module docs (decisions only)** — rejected: "why" without "how" forces every
  newcomer to re-derive the architecture from source; both layers are cheap once templated.

## Consequences

- Archiving a change costs slightly more work (promotion step), but eliminates the recurring
  "where is the current architecture documented?" gap.
- `docs/modules/` pages can drift from code like any doc; the mitigation is the template
  rule that every claim is code-anchored, plus the promotion flow touching module docs at
  exactly the moments code changes.
- The initial documentation sweep (this tree, October 2026) backfilled the backlog:
  architecture trio, seven ADRs, 22 module docs, research index — all in English.

## Evidence

- `openspec/config.yaml` — boundary + promotion guidance added to `context`.
- `docs/README.md` — the doc-type matrix, template scenario, language policy.
- `openspec/changes/archive/` — where change-scoped `design.md` documents currently end up
  (the problem this ADR solves).
