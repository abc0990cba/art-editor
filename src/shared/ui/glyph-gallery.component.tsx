import { useEffect, useState } from 'react'

import {
  BUILT_IN_GLYPH_SETS,
  GLYPH_FAMILY_ORDER,
  type GlyphFamily,
} from '../../engine/glyph-builtins.ts'
import type { GlyphTileSet } from '../../engine/glyph-tiles.ts'
import { useStore } from '../../state/editor.store.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { GlyphRampStrip } from './glyph-ramp-strip.component.tsx'
import { GlyphTonePreview } from './glyph-tone-preview.component.tsx'
import { TextField } from './index.tsx'

/** Max level tiles shown per card — long ramps are sampled evenly (the tone strip shows it all). */
const CARD_LEVELS = 12

/** Evenly sample the ramp so a 65-level Bayer card stays the same height as a 9-level one. */
function sampleLevels(set: GlyphTileSet): GlyphTileSet {
  if (set.levels.length <= CARD_LEVELS) return set
  const last = set.levels.length - 1
  const levels = Array.from({ length: CARD_LEVELS }, (_v, i) => {
    const idx = Math.round((i / (CARD_LEVELS - 1)) * last)
    return set.levels[idx]
  })
  return { ...set, levels }
}

/** One gallery card: name + tile meta, the tone-ramp preview, and the level tiles at full size. */
function GalleryCard({
  name,
  set,
  onPick,
}: {
  name: string
  set: GlyphTileSet
  onPick: (set: GlyphTileSet) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(set)}
      className="border-line bg-chip hover:border-chip-line flex min-w-0 flex-col gap-1.5 rounded-lg border p-2 text-left transition"
    >
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="text-body min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
        <span className="text-muted text-overline shrink-0">
          {set.w}×{set.h} · {set.levels.length}
        </span>
      </span>
      <GlyphTonePreview set={set} className="border-line h-auto w-full rounded-sm border" />
      <GlyphRampStrip set={sampleLevels(set)} size={set.w > 8 ? 2 : 3} />
    </button>
  )
}

/**
 * Full-screen gallery of every glyph tile set — user library on top, then the built-in families
 * (matrices, dots, lines, shapes, patterns) — each with a large tone-ramp preview. Browsing aid for
 * choosing a dithering glyph, e.g. right in the import dialog.
 */
export function GlyphGallery({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (set: GlyphTileSet) => void
}) {
  const { t } = useI18n()
  const glyphSets = useStore((s) => s.glyphSets)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const matches = (name: string): boolean => q === '' || name.toLowerCase().includes(q)

  const userSets = glyphSets.filter((e) => matches(e.set.name))
  const families: { family: GlyphFamily; sets: typeof BUILT_IN_GLYPH_SETS }[] =
    GLYPH_FAMILY_ORDER.map((family) => ({
      family,
      sets: BUILT_IN_GLYPH_SETS.filter((b) => b.family === family && matches(b.set.name)),
    })).filter((g) => g.sets.length > 0)

  // capture phase: stop the import dialog's own Escape handler from closing both layers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('glyph.gallery')}
        className="border-line bg-panel flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-xl border p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-body text-sm font-semibold tracking-wide">{t('glyph.gallery')}</h2>
          <button
            type="button"
            aria-label={t('dialog.close')}
            onClick={onClose}
            className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
          >
            ✕
          </button>
        </div>

        <TextField
          value={query}
          autoFocus
          placeholder={t('glyph.gallery.search')}
          ariaLabel={t('glyph.gallery.search')}
          onChange={setQuery}
          className="w-full"
        />

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
          {userSets.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t('glyph.gallery.user')}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {userSets.map((e) => (
                  <GalleryCard
                    key={e.id}
                    name={e.set.name}
                    set={e.set}
                    onPick={(picked) => {
                      onPick(picked)
                      onClose()
                    }}
                  />
                ))}
              </div>
            </section>
          )}
          {families.map(({ family, sets }) => (
            <section key={family} className="flex flex-col gap-2">
              <h3 className="text-muted text-overline font-semibold tracking-wider uppercase">
                {t(`glyph.family.${family}` as 'glyph.family.matrix')}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
                {sets.map((b) => (
                  <GalleryCard
                    key={b.id}
                    name={b.set.name}
                    set={b.set}
                    onPick={(picked) => {
                      onPick(picked)
                      onClose()
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="text-muted text-overline leading-snug">{t('glyph.gallery.hint')}</p>
      </div>
    </div>
  )
}
