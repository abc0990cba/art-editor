---
name: design-review
description: >
  Audit a UI change or screen of the Ditherlab pixel editor against the project design
  conventions (layout metrics, touch targets, colors, z-index, a11y, editor interaction
  patterns). Use after finishing any UI-affecting change, before handing the change to
  the user, or when the user reports that something "looks off".
allowed-tools: Bash(npm:*), Bash(npx:*), Read, Grep, Glob
metadata:
  author: ditherlab
  version: "1.0"
---

# Design review — audit checklist

Run this AFTER the code gate (`format:check → lint → arch:check → knip → tsc → test`) and
BEFORE presenting a UI change. Read `.zcode/skills/design-conventions/SKILL.md` first —
it defines every token referenced here.

## Workflow

1. **Read the diff** and list every visual element it adds or moves.
2. **Static checks** (grep, no browser needed):
   - raw hex/rgb in JSX (allowed only in canvas drawing code and logo gradients);
   - z-index outside the scale (`z-10/20/30/40/50/60`);
   - touch targets: any mobile-reachable button smaller than `h-11` (`w-9/h-9` and below) without an explicit note;
   - `gap-0.5` in new code;
   - structural breakpoints other than `lg`;
   - new strings not present in BOTH `ru.messages.ts` and `en.messages.ts`;
   - reintroduced arbitrary text sizes (`text-[10px]`/`text-[11px]`) instead of the `text-overline`/`text-label` theme tokens;
   - per-component focus hacks (`focus:ring`, `focus:outline`) instead of the global `:focus-visible` rule in index.css;
   - `space-x/space-y` (separation must be `gap-*`);
   - icon-only `<button>` without aria-label/title;
   - raw hex that bypasses theme tokens (`bg-[#…]`, `text-[#…]`) — replace with tokens;
   - new modals NOT built on the shadcn `Dialog` (hand-rolled fixed overlays are a violation —
     Escape/backdrop/focus-trap must come from the primitive);
   - features importing from `shared/ui/shadcn/*` directly instead of the `shared/ui` wrappers
     (vendored dir is exempt from the project naming/knip checks, not from layering).
3. **Dynamic checks** (browser skill, in-app browser on localhost:5199):
   - desktop ≥1024px: panel widths (192 rail / 256 right), uniform 28px top-bar plates, one visual axis;
   - 390×720 (resize or emulate): 44px targets, bottom tool strip, right drawer sections collapsed, no horizontal scroll of the top bar;
   - dialogs open centered, Escape + backdrop close (except startup home), z-order correct (confirm dialog above modals);
   - hover/disabled states exist for every interactive control;
   - switch the theme (top bar) and re-check every touched surface: both ditherlab tokens and the
     shadcn bridge variables must follow the theme in all five themes.
4. **Report** findings in three buckets: block (violates a hard rule), fix (deviates from a measured token), note (advisory, e.g. hooks-deps-level). Fix the "fix" bucket in the same change — do not hand the user a known-deviating UI.

## Common violations in this codebase (history)

- Hand-rolled icon buttons missing `plate`/`big` props → inconsistent plates in the top bar.
- `py-1.5`-style padding instead of fixed `h-7`/`h-11` → plates of different heights across the bar.
- `type="number"` inputs for node params instead of `DragNumber` → no scrub/Shift-fine-step UX.
- New panels added WITHOUT a `<Section>` wrapper → lost collapse behavior and header style.
- Mobile menu rows added without a `MORE_ICONS` entry → text-only rows on phones.
- Confirmations skipped "because it's undoable" — clear canvas and project deletion always confirm.

## Out of scope for this skill

Canvas pixel rendering, colors of artwork, node graph semantics — review those via tests
and `docs/`, not this checklist.
