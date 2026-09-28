import { useState } from 'react'

import { resizeGlyphSet } from '../../engine/glyph-tiles.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { GlyphGallery } from '../../shared/ui/glyph-gallery.component.tsx'
import { GlyphRampStrip } from '../../shared/ui/glyph-ramp-strip.component.tsx'
import { Chip, Section } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GlyphEditorDialog } from './glyph-editor-dialog.component.tsx'

/**
 * Compact right-panel glyph section: the set's name and meta, the tone ramp as a one-line
 * scrollable strip, tile size and quick access to the photo gallery; the detailed level-by-level
 * editor, generators and library live in a modal (gear).
 */
export function GlyphEditor() {
  const { t } = useI18n()
  const glyphDraft = useStore((s) => s.glyphDraft)
  const patchGlyphDraft = useStore((s) => s.patchGlyphDraft)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  return (
    <Section title={t('glyph.editor')} icon="glyph">
      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-body min-w-0 flex-1 truncate text-xs font-medium">
            {glyphDraft.name || t('glyph.custom')}
          </span>
          <span className="text-muted text-overline shrink-0">
            {glyphDraft.w}×{glyphDraft.h} · {glyphDraft.levels.length}
          </span>
        </div>
        <GlyphRampStrip set={glyphDraft} size={3} fadeFrom="from-panel" />
        <div className="flex flex-wrap gap-1">
          {[4, 8, 16].map((n) => (
            <Chip
              key={n}
              active={glyphDraft.w === n && glyphDraft.h === n}
              onClick={() => patchGlyphDraft(resizeGlyphSet(glyphDraft, n, n))}
            >
              {n}×{n}
            </Chip>
          ))}
          <span className="flex-1" />
          <Chip title={t('glyph.openSettings')} onClick={() => setDetailsOpen(true)}>
            ⚙ {t('glyph.details')}
          </Chip>
          <Chip title={t('glyph.gallery.hint')} onClick={() => setGalleryOpen(true)}>
            ▦
          </Chip>
        </div>
      </div>
      {detailsOpen && <GlyphEditorDialog onClose={() => setDetailsOpen(false)} />}
      {galleryOpen && (
        <GlyphGallery
          onClose={() => setGalleryOpen(false)}
          onPick={(set) => {
            patchGlyphDraft(set)
            setGalleryOpen(false)
          }}
        />
      )}
    </Section>
  )
}
