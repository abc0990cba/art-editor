import { useState } from 'react'

import { BAYER2, BAYER4, BAYER8 } from '../../engine/dither-matrices.ts'
import {
  BUILT_IN_GLYPH_SETS,
  emptyGlyphSet,
  glyphSetChecker,
  glyphSetDots,
  glyphSetFromMatrix,
  glyphSetLines,
  invertGlyphSet,
  resizeGlyphSet,
} from '../../engine/glyph-tiles.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { GlyphRampStrip } from '../../shared/ui/glyph-ramp-strip.component.tsx'
import { Chip, Section } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GlyphTileGrid } from './glyph-tile-grid.component.tsx'

/**
 * Right-panel glyph editor: edit the active tile set level by level, regenerate from built-in
 * generators, resize, invert, and manage the saved library (IndexedDB).
 */
export function GlyphEditor() {
  const { t } = useI18n()
  const glyphDraft = useStore((s) => s.glyphDraft)
  const glyphDraftId = useStore((s) => s.glyphDraftId)
  const glyphSets = useStore((s) => s.glyphSets)
  const patchGlyphDraft = useStore((s) => s.patchGlyphDraft)
  const saveGlyphDraft = useStore((s) => s.saveGlyphDraft)
  const overwriteGlyphDraft = useStore((s) => s.overwriteGlyphDraft)
  const renameGlyphSet = useStore((s) => s.renameGlyphSet)
  const deleteGlyphSet = useStore((s) => s.deleteGlyphSet)
  const applyGlyphSet = useStore((s) => s.applyGlyphSet)
  const [level, setLevel] = useState(0)
  const [name, setName] = useState('')

  const levelCount = glyphDraft.levels.length
  const safeLevel = Math.max(0, Math.min(levelCount - 1, level))

  const toggleCell = (index: number) => {
    const levels = glyphDraft.levels.map((cells, li) =>
      li === safeLevel ? cells.map((v, i) => (i === index ? !v : v)) : cells,
    )
    patchGlyphDraft({ levels })
  }

  const regenerate = (next: typeof glyphDraft) => {
    patchGlyphDraft(next)
    setLevel(0)
  }

  const genChip = (label: string, make: () => typeof glyphDraft) => (
    <Chip key={label} onClick={() => regenerate(make())}>
      {label}
    </Chip>
  )
  const sizeChip = (n: number) => (
    <Chip
      key={n}
      active={glyphDraft.w === n && glyphDraft.h === n}
      onClick={() => regenerate(resizeGlyphSet(glyphDraft, n, n))}
    >
      {n}×{n}
    </Chip>
  )

  return (
    <Section title={t('glyph.editor')}>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <GlyphRampStrip
          set={glyphDraft}
          size={6}
          selected={safeLevel}
          onSelect={(lv) => setLevel(lv)}
        />
        <div className="text-body flex items-center gap-1.5 text-xs">
          <span className="text-muted">
            {t('glyph.level')} {safeLevel + 1}/{levelCount}
          </span>
          <Chip onClick={() => setLevel(Math.max(0, safeLevel - 1))}>−</Chip>
          <Chip onClick={() => setLevel(Math.min(levelCount - 1, safeLevel + 1))}>+</Chip>
          <Chip
            onClick={() => {
              if (levelCount <= 2) return
              const levels = glyphDraft.levels.filter((_c, i) => i !== safeLevel)
              patchGlyphDraft({ levels })
              setLevel(Math.max(0, safeLevel - 1))
            }}
          >
            {t('glyph.removeLevel')}
          </Chip>
          <Chip
            onClick={() => {
              const levels = [...glyphDraft.levels]
              levels.splice(safeLevel + 1, 0, [...levels[safeLevel]])
              patchGlyphDraft({ levels })
              setLevel(safeLevel + 1)
            }}
          >
            {t('glyph.addLevel')}
          </Chip>
        </div>
        <GlyphTileGrid set={glyphDraft} level={safeLevel} cell={18} onToggle={toggleCell} />
        <p className="text-muted text-overline leading-snug">{t('glyph.applyHint')}</p>
        <div className="text-muted text-overline font-semibold tracking-wider uppercase">
          {t('glyph.tileSize')}
        </div>
        <div className="flex flex-wrap gap-1">{[2, 3, 4, 5, 6, 8].map((n) => sizeChip(n))}</div>

        <div className="text-muted text-overline font-semibold tracking-wider uppercase">
          {t('glyph.generators')}
        </div>
        <div className="flex flex-wrap gap-1">
          {genChip(t('glyph.genBayer2'), () => glyphSetFromMatrix(BAYER2, glyphDraft.name))}
          {genChip(t('glyph.genBayer4'), () => glyphSetFromMatrix(BAYER4, glyphDraft.name))}
          {genChip(t('glyph.genBayer8'), () => glyphSetFromMatrix(BAYER8, glyphDraft.name))}
          {genChip(t('glyph.genDots'), () => glyphSetDots(glyphDraft.w, glyphDraft.levels.length))}
          {genChip(t('glyph.genHlines'), () =>
            glyphSetLines('h', glyphDraft.w, glyphDraft.levels.length, glyphDraft.name),
          )}
          {genChip(t('glyph.genVlines'), () =>
            glyphSetLines('v', glyphDraft.w, glyphDraft.levels.length, glyphDraft.name),
          )}
          {genChip(t('glyph.genDiag'), () =>
            glyphSetLines('diag', glyphDraft.w, glyphDraft.levels.length, glyphDraft.name),
          )}
          {genChip(t('glyph.genChecker'), () =>
            glyphSetChecker(glyphDraft.w, glyphDraft.levels.length, glyphDraft.name),
          )}
          {genChip(t('glyph.invert'), () => invertGlyphSet(glyphDraft))}
          {genChip(t('glyph.new'), () =>
            emptyGlyphSet(glyphDraft.w, glyphDraft.h, glyphDraft.levels.length),
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            value={name}
            placeholder={t('glyph.new')}
            onChange={(e) => setName(e.target.value)}
            className="border-line bg-chip text-body placeholder:text-muted focus:border-accent-line min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none"
          />
          <Chip
            onClick={() => {
              const finalName = name.trim() || glyphDraft.name
              void (glyphDraftId ? overwriteGlyphDraft(glyphDraftId) : saveGlyphDraft(finalName))
              setName('')
            }}
          >
            {glyphDraftId ? t('glyph.overwrite') : t('glyph.save')}
          </Chip>
        </div>

        <div className="text-muted text-overline font-semibold tracking-wider uppercase">
          {t('glyph.library')}
        </div>
        <div className="border-line bg-chip flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
          {glyphSets.map((entry) => (
            <div key={entry.id} className="flex items-center gap-1">
              <Chip
                active={glyphDraftId === entry.id}
                onClick={() => applyGlyphSet(entry.id, entry.set)}
                title={t('glyph.applyHint')}
              >
                {entry.name}
              </Chip>
              <Chip onClick={() => void renameGlyphSet(entry.id, entry.name)}>✎</Chip>
              <Chip onClick={() => void deleteGlyphSet(entry.id)}>×</Chip>
            </div>
          ))}
          {BUILT_IN_GLYPH_SETS.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <Chip onClick={() => applyGlyphSet(null, b.set)}>★ {b.set.name}</Chip>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}
