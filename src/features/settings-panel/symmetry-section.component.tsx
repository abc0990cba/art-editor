import { useState } from 'react'

import { MAX_CELL, MIN_CELL, TILING_MODES, WALLPAPER_MODES } from '../../engine/symmetry.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { SymmetryPreviewDialog } from './symmetry-preview-dialog.component.tsx'

/** Symmetry section: finite modes, rosette knobs, wallpaper/tiling lattices and the preview. */
export function SymmetrySection() {
  const { t } = useI18n()
  const symmetry = useStore((s) => s.symmetry)
  const patchSymmetry = useStore((s) => s.patchSymmetry)
  const isSquare = useStore((s) => s.doc.gridType === 'square')
  const [symPreviewOpen, setSymPreviewOpen] = useState(false)
  const isRadial = symmetry.mode === 'radial' || symmetry.mode === 'kaleido'
  const repeatActive = ['brick', 'halfdrop', ...WALLPAPER_MODES].includes(symmetry.mode)

  return (
    <Section title={t('panel.symmetry')} icon="symmetry">
      <div className="text-muted text-label font-medium tracking-wider uppercase">
        {t('sym.basic')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(['none', 'mirrorX', 'mirrorY', 'quad', 'diag8'] as const).map((mode) => (
          <Chip
            key={mode}
            active={symmetry.mode === mode}
            title={t(`sym.${mode}.desc` as 'sym.none.desc')}
            onClick={() => {
              const changed = symmetry.mode !== mode
              patchSymmetry({ mode })
              if (changed) setSymPreviewOpen(true)
            }}
          >
            {t(`sym.${mode}`)}
          </Chip>
        ))}
      </div>

      <div className="text-muted text-label font-medium tracking-wider uppercase">
        {t('sym.rosette')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(['radial', 'kaleido'] as const).map((mode) => (
          <Chip
            key={mode}
            active={symmetry.mode === mode}
            title={t(`sym.${mode}.desc` as 'sym.radial.desc')}
            onClick={() => {
              const changed = symmetry.mode !== mode
              patchSymmetry({ mode })
              if (changed) setSymPreviewOpen(true)
            }}
          >
            {t(`sym.${mode}`)}
          </Chip>
        ))}
      </div>
      {isRadial && (
        <>
          <Slider
            label={t('sym.folds')}
            title={t('sym.folds.desc')}
            value={symmetry.n}
            min={2}
            max={24}
            onChange={(v) => patchSymmetry({ n: v })}
          />
          <Slider
            label={t('sym.fill')}
            title={t('sym.fill.desc')}
            value={symmetry.fill}
            min={10}
            max={100}
            onChange={(v) => patchSymmetry({ fill: v })}
          />
          <Slider
            label={t('sym.phase')}
            title={t('sym.phase.desc')}
            value={symmetry.phase}
            min={0}
            max={359}
            onChange={(v) => patchSymmetry({ phase: v })}
          />
          <Slider
            label={t('sym.twist')}
            title={t('sym.twist.desc')}
            value={symmetry.twist}
            min={-45}
            max={45}
            onChange={(v) => patchSymmetry({ twist: v })}
          />
        </>
      )}

      {!isSquare && <p className="text-muted text-label">{t('sym.squareOnlyHint')}</p>}

      <div className="text-muted text-label font-medium tracking-wider uppercase">
        {t('sym.wallpaper')}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {WALLPAPER_MODES.map((mode) => (
          <Chip
            key={mode}
            active={symmetry.mode === mode}
            disabled={!isSquare}
            title={t(`sym.${mode}.desc` as 'sym.p1.desc')}
            onClick={() => {
              const changed = symmetry.mode !== mode
              patchSymmetry({ mode })
              if (changed) setSymPreviewOpen(true)
            }}
          >
            {mode}
          </Chip>
        ))}
      </div>

      <div className="text-muted text-label font-medium tracking-wider uppercase">
        {t('sym.repeat')}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {TILING_MODES.map((mode) => (
          <Chip
            key={mode}
            active={symmetry.mode === mode}
            disabled={!isSquare}
            title={t(`sym.${mode}.desc` as 'sym.brick.desc')}
            onClick={() => {
              const changed = symmetry.mode !== mode
              patchSymmetry({ mode })
              if (changed) setSymPreviewOpen(true)
            }}
          >
            {t(`sym.${mode}`)}
          </Chip>
        ))}
      </div>
      {repeatActive && (
        <>
          <Slider
            label={t('sym.cell')}
            title={t('sym.cell.desc')}
            value={symmetry.cell}
            min={MIN_CELL}
            max={MAX_CELL}
            onChange={(v) => patchSymmetry({ cell: v })}
          />
          <div className="flex justify-end gap-1">
            <Chip
              title={t('sym.half.desc')}
              onClick={() =>
                patchSymmetry({ cell: Math.max(MIN_CELL, Math.floor(symmetry.cell / 2)) })
              }
            >
              {t('sym.half')}
            </Chip>
            <Chip
              title={t('sym.double.desc')}
              onClick={() => patchSymmetry({ cell: Math.min(MAX_CELL, symmetry.cell * 2) })}
            >
              {t('sym.double')}
            </Chip>
          </div>
        </>
      )}

      <CheckRow
        label={t('sym.guides')}
        title={t('sym.guides.desc')}
        checked={symmetry.showGuides}
        onChange={(v) => patchSymmetry({ showGuides: v })}
      />

      <Chip title={t('sym.preview.desc')} onClick={() => setSymPreviewOpen(true)}>
        {t('sym.preview')}
      </Chip>
      {symPreviewOpen && <SymmetryPreviewDialog onClose={() => setSymPreviewOpen(false)} />}
    </Section>
  )
}
