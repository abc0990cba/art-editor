# Add 13 new curated palettes (vintage ramps, hardware classics, modern moods)

The project currently has 22 built-in palettes. I'll add **13 new ones** covering the requested spread: fresh / vintage / modern, different pixel-art styles, and dithering-friendly ramps. Two are canonical community/classic palettes with exact published hexes (SLSO8, DawnBringer 16), three are real hardware palettes (Amiga Workbench, Windows 95, Nokia LCD), one is a theme classic (Tokyo Night), and the rest are carefully designed original sets (sepia photo ramp, CRT phosphor ramps, autumn, blueprint duotone, vaporwave, pastel pop).

## New palettes (all lowercase `#rrggbb`, no duplicates, sizes 2–64)

**Vintage & dithering ramps**
1. `sepia` — "Sepia" — old-photo brown ramp, 8: `#231712 #4a2e1f #6f4a2b #96683a #bd8f5a #d9b47f #efd9ae #f8ecd4`
2. `slso8` — "SLSO8" — canonical optimusmoose sunset gradient (dithering classic), 8: `#0d2b45 #203c56 #544e68 #8d697a #d08159 #ffaa5e #ffd4a3 #fffecd`
3. `amber-crt` — "Amber CRT" — amber monochrome monitor ramp, 6: `#0d0600 #3a1d00 #6e4300 #ad7800 #ffb000 #ffd37a`
4. `green-phosphor` — "Green Phosphor" — P1 green terminal ramp, 6: `#041604 #0b3d0b #1f6b1f #3aa83a #66e866 #b4ffb4`
5. `harvest` — "Harvest" — cozy autumn browns/golds/olives, 8: `#2b1b17 #5c2e26 #a34a2a #d97b29 #f0b241 #8a8f3c #4f6136 #f3e2b3`
6. `blueprint` — "Blueprint" — technical-drawing blue duotone+, 4: `#0a2450 #2a4a80 #7aa5d8 #dceeff`

**Hardware & classic**
7. `workbench` — "Amiga Workbench" — Workbench 1.x 4 colors: `#000000 #0055aa #aaaaaa #ffffff`
8. `win95` — "Windows 95" — the 16 canonical VGA/HTML colors: `#000000 #800000 #008000 #808000 #000080 #800080 #008080 #c0c0c0 #808080 #ff0000 #00ff00 #ffff00 #0000ff #ff00ff #00ffff #ffffff`
9. `nokia` — "Nokia LCD" — the famous green LCD pair: `#c7f0d8 #43523d`
10. `db16` — "DawnBringer 16" — canonical DawnBringer palette, 16: `#140c1c #442434 #30346d #4e4a4e #854c30 #346524 #d04648 #757161 #597dce #d27d2c #8595a1 #6daa2c #d2aa99 #6dc2ca #dad45e #deeed6`

**Fresh & modern**
11. `vaporwave` — "Vaporwave" — neon-on-night purple/pink/cyan/mint, 10: `#0f0e1b #2b1b4d #ff6ad5 #c774e8 #ad8cff #8795e8 #94d0ff #8affd1 #fffb96 #f5f3ff`
12. `pastel-pop` — "Pastel Pop" — kawaii pastels with soft outline dark + cream, 8: `#574250 #ff9ecb #ffb38a #ffe38a #9ee6a1 #7fd8e8 #b8a6e8 #fff5ec`
13. `tokyo-night` — "Tokyo Night" — the VS Code theme palette, 11: `#1a1b26 #24283b #414868 #565f89 #7aa2f7 #2ac3de #9ece6a #e0af68 #f7768e #bb9af7 #c0caf5`

## File changes

1. **`src/engine/palettes-data.ts`** — append the 13 entries at the end of `PALETTES` (after `gruvbox`), in the block order above (vintage ramps → hardware → modern). Existing entries keep their positions; `CLASSIC_12` / `classic12` untouched (test depends on them).
2. **`src/shared/i18n/en.messages.ts`** — add `palette.<id>` (name) and `palette.<id>.desc` (one-line origin + mood, e.g. `'slso8': 'SLSO8'` / `'slso8.desc': 'Warm sunset gradient by optimusmoose — a dithering staple.'`) next to the existing palette keys (~line 433 / 1094).
3. **`src/shared/i18n/ru.messages.ts`** — same keys in the ru dict (~line 434 / 1101), keeping 1:1 parity: «Сепия», «Янтарный монитор», «Зелёный фосфор», «Урожай», «Синька», «Пастель», etc.; hardware names stay in Latin ("Windows 95", "Nokia LCD", "DawnBringer 16").
4. **`docs/modules/palettes-and-presets.md`** — bump the "PALETTES (22 entries)" count to 35 and extend the enumerated name list.

## Verification (mandatory chain, fix until green)

`npm run format:check` → `npm run lint` → `npm run arch:check` → `npm run knip` → `npx tsc --noEmit` → `npm test` (palettes.test.ts enforces lowercase hex regex, uniqueness, 2–64 colors, unique ids, en i18n keys — all covered by design above).

## Proposed commit (human commits, per AGENTS.md)

```
feat(engine): add 13 curated palettes — vintage ramps, hardware classics, modern moods

Sepia/SLSO8/CRT-phosphor dithering ramps, Amiga Workbench, Windows 95,
Nokia LCD, DawnBringer 16, Harvest, Blueprint, Vaporwave, Pastel Pop,
Tokyo Night. Names + descriptions wired into en/ru dictionaries; module
doc count updated to 35.
```