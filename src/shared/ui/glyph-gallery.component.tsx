import { useState } from 'react'

import {
  BUILT_IN_GLYPH_SETS,
  GLYPH_FAMILY_ORDER,
  builtInGlyphSetById,
  type GlyphFamily,
} from '../../engine/glyph-builtins.ts'
import type { GlyphTileSet } from '../../engine/glyph-tiles.ts'
import type { ImportBitmap } from '../../engine/import-image.ts'
import { useStore } from '../../state/editor.store.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { GlyphPhotoPreview } from './glyph-photo-preview.component.tsx'
import { GlyphRampStrip } from './glyph-ramp-strip.component.tsx'
import { TextField } from './index.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './shadcn/dialog.tsx'

/** Max level tiles shown per row — long ramps are sampled evenly (the photo shows the rest). */
const ROW_LEVELS = 12

/** Evenly sample the ramp so a 65-level Bayer row stays the same height as a 9-level one. */
function sampleLevels(set: GlyphTileSet): GlyphTileSet {
  if (set.levels.length <= ROW_LEVELS) return set
  const last = set.levels.length - 1
  const levels = Array.from({ length: ROW_LEVELS }, (_v, i) => {
    const idx = Math.round((i / (ROW_LEVELS - 1)) * last)
    return set.levels[idx]
  })
  return { ...set, levels }
}

/**
 * One row of the glyph list: name + tile meta over the tone ramp. Clicking applies the set (the
 * large preview keeps showing the currently applied one — what you press is what you get).
 */
function GalleryRow({
  name,
  set,
  sourceId,
  onPick,
}: {
  name: string
  set: GlyphTileSet
  /** Library id of the set (null for ad-hoc sets) */
  sourceId: string | null
  onPick: (set: GlyphTileSet, id: string | null) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(set, sourceId)}
      className="border-line bg-chip hover:border-chip-line flex min-w-0 flex-col gap-1.5 rounded-lg border p-2 text-left transition"
    >
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="text-body min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
        <span className="text-muted text-overline shrink-0">
          {set.w}×{set.h} · {set.levels.length}
        </span>
      </span>
      <GlyphRampStrip set={sampleLevels(set)} size={set.w > 8 ? 2 : 3} fadeFrom="from-chip" />
    </button>
  )
}

/**
 * Full-screen glyph gallery, master/detail: the left pane keeps the photo preview of the currently
 * applied set as large as the dialog allows, the right pane is a single scrollable column of sets —
 * clicking a row applies it. The preview picture is the dialog's imported photo when given, so sets
 * are judged on the user's own image. User library on top, then the built-in families. Stacks above
 * other dialogs (portal order); Escape and the backdrop close only this layer.
 */
export function GlyphGallery({
  onClose,
  onPick,
  initialSet,
  photo,
}: {
  onClose: () => void
  onPick: (set: GlyphTileSet, id: string | null) => void
  /** The set in use right now — the preview starts on it (not on hover). */
  initialSet?: GlyphTileSet | null
  /** Imported picture to preview instead of the bundled sample. */
  photo?: ImportBitmap | null
}) {
  const { t } = useI18n()
  const glyphSets = useStore((s) => s.glyphSets)
  const [query, setQuery] = useState('')
  // the preview shows the set in use; it changes only when a row is pressed (which applies it)
  const previewSet = initialSet ?? builtInGlyphSetById('glyph-bayer8') ?? BUILT_IN_GLYPH_SETS[0].set

  const q = query.trim().toLowerCase()
  const matches = (name: string): boolean => q === '' || name.toLowerCase().includes(q)

  const userSets = glyphSets.filter((e) => matches(e.set.name))
  const families: { family: GlyphFamily; sets: typeof BUILT_IN_GLYPH_SETS }[] =
    GLYPH_FAMILY_ORDER.map((family) => ({
      family,
      sets: BUILT_IN_GLYPH_SETS.filter((b) => b.family === family && matches(b.set.name)),
    })).filter((g) => g.sets.length > 0)

  // Radix stacks the dialog portals: this gallery mounts later than the import dialog, so it
  // renders above it and Escape dismisses only this topmost layer.
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="z-60 flex w-full flex-col gap-3 overflow-hidden p-4 lg:h-[90vh] lg:max-w-6xl lg:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('glyph.gallery')}
          </DialogTitle>
          <button
            type="button"
            aria-label={t('dialog.close')}
            onClick={onClose}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
          >
            ✕
          </button>
        </div>

        <DialogDescription className="sr-only">{t('glyph.gallery.hint')}</DialogDescription>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          {/* master: the live photo preview, as large as the dialog allows */}
          <div className="flex min-h-0 flex-col gap-1.5 lg:min-w-0 lg:flex-1">
            <GlyphPhotoPreview set={previewSet} photo={photo} />
            <p className="text-muted text-overline leading-snug">{t('glyph.preview.hint')}</p>
          </div>

          {/* detail: search + every set in one scrollable column */}
          <div className="flex min-h-0 flex-1 flex-col gap-2 lg:w-80 lg:shrink-0">
            <TextField
              value={query}
              autoFocus
              placeholder={t('glyph.gallery.search')}
              ariaLabel={t('glyph.gallery.search')}
              onChange={setQuery}
              className="w-full"
            />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
              {userSets.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  <h3 className="text-muted text-overline font-semibold tracking-wider uppercase">
                    {t('glyph.gallery.user')}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {userSets.map((e) => (
                      <GalleryRow
                        key={e.id}
                        name={e.set.name}
                        set={e.set}
                        sourceId={e.id}
                        onPick={(picked, pickedId) => {
                          onPick(picked, pickedId)
                          onClose()
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}
              {families.map(({ family, sets }) => (
                <section key={family} className="flex flex-col gap-1.5">
                  <h3 className="text-muted text-overline font-semibold tracking-wider uppercase">
                    {t(`glyph.family.${family}` as 'glyph.family.matrix')}
                  </h3>
                  <div className="flex flex-col gap-1.5">
                    {sets.map((b) => (
                      <GalleryRow
                        key={b.id}
                        name={b.set.name}
                        set={b.set}
                        sourceId={b.id}
                        onPick={(picked, pickedId) => {
                          onPick(picked, pickedId)
                          onClose()
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>

        <p className="text-muted text-overline leading-snug">{t('glyph.gallery.hint')}</p>
      </DialogContent>
    </Dialog>
  )
}
