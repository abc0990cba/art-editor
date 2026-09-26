import { useState } from 'react'

import { BAYER2, BAYER4, BAYER8 } from '../../engine/dither-matrices.ts'
import { BUILT_IN_GLYPH_SETS } from '../../engine/glyph-builtins.ts'
import {
  glyphSetChecker,
  glyphSetDots,
  glyphSetGrain,
  glyphSetLines,
  glyphSetRings,
  glyphSetShapeMorph,
  glyphSetStars,
} from '../../engine/glyph-generators.ts'
import {
  emptyGlyphSet,
  glyphSetFromMatrix,
  invertGlyphSet,
  resizeGlyphSet,
  type GlyphTileSet,
} from '../../engine/glyph-tiles.ts'
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
      {galleryOpen && (
        <GlyphGallery
          onClose={() => setGalleryOpen(false)}
          onPick={(set) => {
            applyGlyphSet(null, set)
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
    <Chip key={label} onClick={() => onRegenerate(make())}>
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

/**
 * Detailed glyph editor in a modal (opened from the compact right-panel section): level-by-level
 * pixel editing, all generators, tile resize, and saving over the draft or as a new library set.
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

  const toggleCell = (index: number) => {
    const levels = glyphDraft.levels.map((cells, li) =>
      li === safeLevel ? cells.map((v, i) => (i === index ? !v : v)) : cells,
    )
    patchGlyphDraft({ levels })
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
        className="flex max-h-[90vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl p-4 sm:max-w-xl"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('glyph.editor')}
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('dialog.close')}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
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
        <GlyphTileGrid
          set={glyphDraft}
          level={safeLevel}
          cell={wide ? 11 : 18}
          onToggle={toggleCell}
        />
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
          >
            {glyphDraftId ? t('glyph.overwrite') : t('glyph.save')}
          </Chip>
        </div>

        <GlyphLibrary />
      </DialogContent>
    </Dialog>
  )
}
