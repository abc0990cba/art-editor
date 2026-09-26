import { useMemo, useState } from 'react'

import { BUILT_IN_GLYPH_SETS } from '../../engine/glyph-builtins.ts'
import type { GlyphTileSet } from '../../engine/glyph-tiles.ts'
import { useStore } from '../../state/editor.store.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { GlyphGallery } from './glyph-gallery.component.tsx'
import { GlyphRampStrip } from './glyph-ramp-strip.component.tsx'
import { Chip } from './index.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './shadcn/select.tsx'

/**
 * Compact glyph-set picker: one select (own library + built-ins), a ramp preview of the chosen set,
 * and a gallery button for browsing every set at full size on a real photo. Used by the import
 * dialog and the fill pattern controls; full editing lives in the glyph editor section.
 */
export function GlyphSetPicker({
  value,
  onChange,
}: {
  value: GlyphTileSet | null
  onChange: (set: GlyphTileSet | null) => void
}) {
  const { t } = useI18n()
  const glyphSets = useStore((s) => s.glyphSets)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const selected = value ?? BUILT_IN_GLYPH_SETS[1]?.set ?? null

  // identity match against library entries/built-ins
  const currentId = useMemo(() => {
    for (const b of BUILT_IN_GLYPH_SETS) if (b.set === selected) return b.id
    for (const e of glyphSets) if (e.set === selected) return e.id
    return null
  }, [glyphSets, selected])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={currentId ?? undefined}
          onValueChange={(id) => {
            const builtin = BUILT_IN_GLYPH_SETS.find((b) => b.id === id)
            if (builtin) {
              onChange(builtin.set)
              return
            }
            const entry = glyphSets.find((e) => e.id === id)
            if (entry) onChange(entry.set)
          }}
        >
          <SelectTrigger className="border-line bg-chip text-body dark:border-line dark:bg-chip h-auto min-w-0 flex-1 rounded-md px-2 py-1 text-xs">
            <SelectValue placeholder={t('glyph.picker.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {glyphSets.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-muted text-overline">
                  {t('glyph.gallery.user')}
                </SelectLabel>
                {glyphSets.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.set.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            <SelectGroup>
              <SelectLabel className="text-muted text-overline">
                {t('glyph.picker.builtin')}
              </SelectLabel>
              {BUILT_IN_GLYPH_SETS.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.set.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Chip title={t('glyph.gallery.hint')} onClick={() => setGalleryOpen(true)}>
          ▦
        </Chip>
      </div>
      {selected && <GlyphRampStrip set={selected} size={5} />}
      {galleryOpen && (
        <GlyphGallery
          onClose={() => setGalleryOpen(false)}
          onPick={(set) => {
            onChange(set)
            setGalleryOpen(false)
          }}
        />
      )}
    </div>
  )
}
