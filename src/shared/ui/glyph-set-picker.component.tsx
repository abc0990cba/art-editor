import { useMemo } from 'react'

import { BUILT_IN_GLYPH_SETS, type GlyphTileSet } from '../../engine/glyph-tiles.ts'
import { useStore } from '../../state/editor.store.ts'
import { useI18n } from '../i18n/i18n.provider.tsx'
import { GlyphRampStrip } from './glyph-ramp-strip.component.tsx'
import { Chip } from './index.tsx'

/**
 * Compact glyph-set picker: user sets from the library, built-ins, plus a live ramp preview of the
 * selected set. Used by the import dialog and the fill pattern controls; full editing lives in the
 * right panel's glyph editor section.
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
  const glyphDraftId = useStore((s) => s.glyphDraftId)

  const selected = useMemo(() => {
    if (value) return value
    return BUILT_IN_GLYPH_SETS[1]?.set ?? null
  }, [value])

  const activeId = useMemo(() => {
    if (glyphDraftId && value === null) return null
    // identity match against library entries/built-ins
    for (const b of BUILT_IN_GLYPH_SETS) {
      if (b.set === selected) return b.id
    }
    for (const e of glyphSets) {
      if (e.set === selected) return e.id
    }
    return null
  }, [glyphSets, glyphDraftId, selected, value])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="border-line bg-chip flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-lg border p-1">
        {glyphSets.length === 0 && (
          <p className="text-muted px-1 py-0.5 text-[11px]">{t('glyph.noUserSets')}</p>
        )}
        {glyphSets.map((entry) => (
          <Chip key={entry.id} active={activeId === entry.id} onClick={() => onChange(entry.set)}>
            {entry.name}
          </Chip>
        ))}
        {BUILT_IN_GLYPH_SETS.map((b) => (
          <Chip key={b.id} active={activeId === b.id} onClick={() => onChange(b.set)}>
            ★ {b.set.name}
          </Chip>
        ))}
      </div>
      {selected && <GlyphRampStrip set={selected} size={5} />}
      <p className="text-muted text-[10px] leading-snug">{t('glyph.pickerHint')}</p>
    </div>
  )
}
