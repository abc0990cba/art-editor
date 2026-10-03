import { useState } from 'react'

import { BAYER2, BAYER4, BAYER8 } from '../../engine/dither/matrices.ts'
import { BUILT_IN_GLYPH_SETS } from '../../engine/glyph/builtins.ts'
import {
  glyphSetChecker,
  glyphSetDots,
  glyphSetGrain,
  glyphSetLines,
  glyphSetRings,
  glyphSetShapeMorph,
  glyphSetStars,
} from '../../engine/glyph/generators.ts'
import {
  emptyGlyphSet,
  glyphSetFromMatrix,
  invertGlyphSet,
  resizeGlyphSet,
  type GlyphTileSet,
} from '../../engine/glyph/tiles.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { GlyphGallery } from '../../shared/ui/glyph-gallery.component.tsx'
import { GlyphRampStrip } from '../../shared/ui/glyph-ramp-strip.component.tsx'
import { Chip, TextField } from '../../shared/ui/index.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GlyphTileGrid } from './glyph-tile-grid.component.tsx'

/** Saved library (IndexedDB) + built-ins, with the photo gallery one chip away. */
function GlyphLibrary() {
  const { t } = useI18n()
  const glyphSets = useStore((s) => s.glyphSets)
  const glyphDraftId = useStore((s) => s.glyphDraftId)
  const glyphDraft = useStore((s) => s.glyphDraft)
  const renameGlyphSet = useStore((s) => s.renameGlyphSet)
  const deleteGlyphSet = useStore((s) => s.deleteGlyphSet)
  const applyGlyphSet = useStore((s) => s.applyGlyphSet)
  const [galleryOpen, setGalleryOpen] = useState(false)
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-muted text-overline font-semibold tracking-wider uppercase">
          {t('glyph.library')}
        </span>
        <Chip title={t('glyph.gallery.hint')} onClick={() => setGalleryOpen(true)}>
          ▦ {t('glyph.gallery')}
        </Chip>
      </div>
      <div className="border-line bg-chip flex max-h-44 flex-wrap content-start gap-1 overflow-y-auto rounded-lg border p-1.5">
        {glyphSets.map((entry) => (
          <span key={entry.id} className="flex items-center gap-1">
            <Chip
              active={glyphDraftId === entry.id}
              onClick={() => applyGlyphSet(entry.id, entry.set)}
              title={t('glyph.applyHint')}
            >
              {entry.name}
            </Chip>
            <Chip onClick={() => void renameGlyphSet(entry.id, entry.name)}>✎</Chip>
            <Chip onClick={() => void deleteGlyphSet(entry.id)}>×</Chip>
          </span>
        ))}
        {BUILT_IN_GLYPH_SETS.map((b) => (
          <Chip key={b.id} onClick={() => applyGlyphSet(null, b.set)} className="max-lg:min-h-11">
            ★ {b.set.name}
          </Chip>
        ))}
      </div>
      {galleryOpen && (
        <GlyphGallery
          onClose={() => setGalleryOpen(false)}
          initialSet={glyphDraft}
          onPick={(set, id) => {
            applyGlyphSet(id, set)
            setGalleryOpen(false)
          }}
        />
      )}
    </>
  )
}

/** Regenerate chips: matrices, the shape families, invert and a blank set. */
function GeneratorsRow({
  draft,
  onRegenerate,
}: {
  draft: GlyphTileSet
  onRegenerate: (next: GlyphTileSet) => void
}) {
  const { t } = useI18n()
  const genChip = (label: string, make: () => GlyphTileSet) => (
    <Chip key={label} onClick={() => onRegenerate(make())} className="max-lg:min-h-11">
      {label}
    </Chip>
  )
  const levels = draft.levels.length
  return (
    <>
      <div className="text-muted text-overline font-semibold tracking-wider uppercase">
        {t('glyph.generators')}
      </div>
      <div className="flex flex-wrap gap-1">
        {genChip(t('glyph.genBayer2'), () => glyphSetFromMatrix(BAYER2, draft.name))}
        {genChip(t('glyph.genBayer4'), () => glyphSetFromMatrix(BAYER4, draft.name))}
        {genChip(t('glyph.genBayer8'), () => glyphSetFromMatrix(BAYER8, draft.name))}
        {genChip(t('glyph.genDots'), () => glyphSetDots(draft.w, levels))}
        {genChip(t('glyph.genMorph'), () => glyphSetShapeMorph(draft.w, levels, draft.name))}
        {genChip(t('glyph.genStars'), () => glyphSetStars(draft.w, levels, draft.name))}
        {genChip(t('glyph.genRings'), () => glyphSetRings(draft.w, levels, draft.name))}
        {genChip(t('glyph.genGrain'), () => glyphSetGrain(draft.w, levels, draft.name))}
        {genChip(t('glyph.genHlines'), () => glyphSetLines('h', draft.w, levels, draft.name))}
        {genChip(t('glyph.genVlines'), () => glyphSetLines('v', draft.w, levels, draft.name))}
        {genChip(t('glyph.genDiag'), () => glyphSetLines('diag', draft.w, levels, draft.name))}
        {genChip(t('glyph.genChecker'), () => glyphSetChecker(draft.w, levels, draft.name))}
        {genChip(t('glyph.invert'), () => invertGlyphSet(draft))}
        {genChip(t('glyph.new'), () => emptyGlyphSet(draft.w, draft.h, levels))}
      </div>
    </>
  )
}

const TILE_SIZES = [2, 3, 4, 5, 6, 8, 12, 16]

/** Level navigation: position readout, prev/next steps, add (duplicates the current) and remove. */
function LevelNav({
  level,
  count,
  onSelect,
  onAdd,
  onRemove,
}: {
  level: number
  count: number
  onSelect: (level: number) => void
  onAdd: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const step = (delta: number) => () => onSelect(Math.max(0, Math.min(count - 1, level + delta)))
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted min-w-12 text-xs tabular-nums">
        {level + 1}/{count}
      </span>
      <Chip title={t('glyph.prevLevel')} onClick={step(-1)}>
        ‹
      </Chip>
      <Chip title={t('glyph.nextLevel')} onClick={step(1)}>
        ›
      </Chip>
      <span className="flex-1" />
      <Chip title={t('glyph.addLevel.desc')} onClick={onAdd}>
        {t('glyph.addLevel')}
      </Chip>
      <Chip title={t('glyph.removeLevel.desc')} onClick={onRemove}>
        {t('glyph.removeLevel')}
      </Chip>
    </div>
  )
}

/**
 * Detailed glyph editor in a modal (opened from the compact right-panel section): level-by-level
 * pixel editing (press and drag to paint), all generators, tile resize, and saving over the draft
 * or as a new library set. The tone strip is the level navigator — the selected level centers.
 */
export function GlyphEditorDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const glyphDraft = useStore((s) => s.glyphDraft)
  const glyphDraftId = useStore((s) => s.glyphDraftId)
  const patchGlyphDraft = useStore((s) => s.patchGlyphDraft)
  const saveGlyphDraft = useStore((s) => s.saveGlyphDraft)
  const overwriteGlyphDraft = useStore((s) => s.overwriteGlyphDraft)
  const [level, setLevel] = useState(0)
  const [name, setName] = useState('')

  const levelCount = glyphDraft.levels.length
  const safeLevel = Math.max(0, Math.min(levelCount - 1, level))
  const wide = glyphDraft.w > 8
  // small tile sets get big cells (a 4×4 grid fills the view), 16×16 stays compact
  const cell = Math.max(10, Math.min(26, Math.floor(224 / glyphDraft.w)))

  const paintCell = (index: number, value: boolean) => {
    const levels = glyphDraft.levels.map((cells, li) =>
      li === safeLevel ? cells.map((v, i) => (i === index ? value : v)) : cells,
    )
    patchGlyphDraft({ levels })
  }

  const addLevel = () => {
    const levels = [...glyphDraft.levels]
    levels.splice(safeLevel + 1, 0, [...levels[safeLevel]])
    patchGlyphDraft({ levels })
    setLevel(safeLevel + 1)
  }
  const removeLevel = () => {
    if (levelCount <= 2) return
    const levels = glyphDraft.levels.filter((_c, i) => i !== safeLevel)
    patchGlyphDraft({ levels })
    setLevel(Math.max(0, safeLevel - 1))
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-full flex-col gap-3 overflow-y-auto p-4 max-lg:gap-4 max-lg:px-3 lg:max-h-[90vh] lg:max-w-xl lg:rounded-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <DialogTitle className="text-body text-sm font-semibold tracking-wide">
              {t('glyph.editor')}
            </DialogTitle>
            <span className="text-muted text-overline shrink-0">
              {glyphDraft.w}×{glyphDraft.h} · {levelCount}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dialog.close')}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:h-11 max-lg:w-11"
          >
            ✕
          </button>
        </div>

        <GlyphRampStrip
          set={glyphDraft}
          size={wide ? 3 : 6}
          selected={safeLevel}
          onSelect={setLevel}
        />
        <LevelNav
          level={safeLevel}
          count={levelCount}
          onSelect={setLevel}
          onAdd={addLevel}
          onRemove={removeLevel}
        />

        <div className="flex justify-center">
          <GlyphTileGrid set={glyphDraft} level={safeLevel} cell={cell} onPaint={paintCell} />
        </div>
        <p className="text-muted text-overline leading-snug">{t('glyph.applyHint')}</p>

        <div className="text-muted text-overline font-semibold tracking-wider uppercase">
          {t('glyph.tileSize')}
        </div>
        <div className="flex flex-wrap gap-1">
          {TILE_SIZES.map((n) => (
            <Chip
              key={n}
              active={glyphDraft.w === n && glyphDraft.h === n}
              onClick={() => patchGlyphDraft(resizeGlyphSet(glyphDraft, n, n))}
              className="max-lg:min-h-11"
            >
              {n}×{n}
            </Chip>
          ))}
        </div>

        <GeneratorsRow draft={glyphDraft} onRegenerate={patchGlyphDraft} />

        <div className="flex items-center gap-1.5">
          <TextField
            value={name}
            placeholder={t('glyph.new')}
            onChange={setName}
            className="flex-1"
          />
          <Chip
            onClick={() => {
              const finalName = name.trim() || glyphDraft.name
              void (glyphDraftId ? overwriteGlyphDraft(glyphDraftId) : saveGlyphDraft(finalName))
              setName('')
            }}
            className="max-lg:min-h-11"
          >
            {glyphDraftId ? t('glyph.overwrite') : t('glyph.save')}
          </Chip>
        </div>

        <GlyphLibrary />
      </DialogContent>
    </Dialog>
  )
}
