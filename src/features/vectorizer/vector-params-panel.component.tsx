import { useState } from 'react'

import { DEFAULT_TRACE_PARAMS, TRACE_PRESETS } from '../../engine/trace/params.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { CheckRow, Chip, Section, Slider, TextField } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Right-column control panel of the vector mode: preset library (built-ins + user presets from
 * IndexedDB) and the vtracer parameter sections. Only shows the controls that the current tracer
 * actually consumes (outline vs centerline, color vs binary).
 */

/** Labeled chip group for enum-ish parameter values. */
function EnumChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Chip key={o.v} active={value === o.v} onClick={() => onChange(o.v)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function VectorParamsPanel() {
  const { t } = useI18n()
  const pathPrecision = useStore((s) => s.vectorParams.pathPrecision)
  const patch = useStore((s) => s.patchVectorParams)
  return (
    <>
      <PresetsSection />
      <TraceSection />
      <Section title={t('vector.output')} icon="export">
        <Slider
          label={t('vector.precision')}
          title={t('vector.precision.desc')}
          value={pathPrecision}
          min={0}
          max={8}
          onChange={(precision) => patch({ pathPrecision: precision })}
        />
      </Section>
    </>
  )
}

/** Built-in presets plus the user library persisted in IndexedDB. */
function PresetsSection() {
  const { t } = useI18n()
  const applyParams = useStore((s) => s.applyVectorParams)
  const vectorPresets = useStore((s) => s.vectorPresets)
  const createVectorPreset = useStore((s) => s.createVectorPreset)
  const overwriteVectorPreset = useStore((s) => s.overwriteVectorPreset)
  const deleteVectorPreset = useStore((s) => s.deleteVectorPreset)
  const [name, setName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  return (
    <Section title={t('vector.preset')} icon="presets" defaultOpen>
      <div className="flex flex-wrap gap-1">
        {TRACE_PRESETS.map((p) => (
          <Chip key={p.id} onClick={() => applyParams({ ...DEFAULT_TRACE_PARAMS, ...p.params })}>
            {t(`vector.preset.${p.id}` as 'vector.preset.default')}
          </Chip>
        ))}
      </div>
      {vectorPresets.length > 0 ? (
        <div className="flex flex-col gap-1">
          {vectorPresets.map((p) => (
            <div
              key={p.id}
              className="border-line bg-chip flex items-center gap-1 rounded-md border px-2 py-1"
            >
              <button
                type="button"
                className="text-body min-w-0 flex-1 cursor-pointer truncate text-left text-xs"
                onClick={() => applyParams(p.params)}
                title={p.name}
              >
                {p.name}
              </button>
              <Tooltip label={t('vector.preset.overwrite')}>
                <button
                  type="button"
                  aria-label={t('vector.preset.overwrite')}
                  className="text-muted hover:text-body flex h-5 w-5 cursor-pointer items-center justify-center rounded transition"
                  onClick={() => void overwriteVectorPreset(p.id)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2.5v4h-4" />
                    <path d="M13.2 6.5A5.5 5.5 0 102.8 8.9" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip label={t('vector.preset.delete')}>
                <button
                  type="button"
                  aria-label={t('vector.preset.delete')}
                  className="text-muted flex h-5 w-5 cursor-pointer items-center justify-center rounded transition hover:text-red-400"
                  onClick={() => setDeleteId(p.id)}
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  >
                    <path d="M3 4.5h10M6.5 4.5v-1a1 1 0 011-1h1a1 1 0 011 1v1M5 4.5l.6 8a1 1 0 001 .9h2.8a1 1 0 001-.9l.6-8" />
                  </svg>
                </button>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted text-overline">{t('vector.preset.none')}</p>
      )}
      <div className="flex items-center gap-1">
        <TextField
          value={name}
          placeholder={t('vector.preset.placeholder')}
          ariaLabel={t('vector.preset.placeholder')}
          onChange={setName}
          className="min-w-0 flex-1"
        />
        <Chip
          disabled={name.trim() === ''}
          onClick={() => {
            void createVectorPreset(name)
            setName('')
          }}
        >
          {t('vector.preset.save')}
        </Chip>
      </div>
      {deleteId !== null && (
        <ConfirmDialog
          title={t('vector.preset.delete')}
          message={t('vector.preset.deleteConfirm')}
          confirmLabel={t('vector.preset.delete')}
          cancelLabel={t('import.cancel')}
          onConfirm={() => {
            void deleteVectorPreset(deleteId)
            setDeleteId(null)
          }}
          onClose={() => setDeleteId(null)}
        />
      )}
    </Section>
  )
}

/** Tracing parameters; shows only the controls the current tracer consumes. */
function TraceSection() {
  const { t } = useI18n()
  const params = useStore((s) => s.vectorParams)
  const patch = useStore((s) => s.patchVectorParams)
  const isOutline = params.tracer === 'outline'
  const isColor = params.colorMode === 'color'
  return (
    <Section title={t('vector.trace.section')} icon="style" defaultOpen>
      <EnumChips
        label={t('vector.tracer')}
        value={params.tracer}
        options={[
          { v: 'outline', label: t('vector.tracer.outline') },
          { v: 'centerline', label: t('vector.tracer.centerline') },
        ]}
        onChange={(tracer) => patch({ tracer })}
      />
      <Slider
        label={t('vector.threshold')}
        title={t('vector.threshold.desc')}
        value={params.binaryThreshold}
        min={0}
        max={255}
        onChange={(binaryThreshold) => patch({ binaryThreshold })}
      />
      <CheckRow
        label={t('vector.invert')}
        checked={params.binaryInvert}
        onChange={(binaryInvert) => patch({ binaryInvert })}
      />
      {isOutline && (
        <>
          <EnumChips
            label={t('vector.colormode')}
            value={params.colorMode}
            options={[
              { v: 'color', label: t('vector.colormode.color') },
              { v: 'binary', label: t('vector.colormode.binary') },
            ]}
            onChange={(colorMode) => patch({ colorMode })}
          />
          <EnumChips
            label={t('vector.hierarchical')}
            value={params.hierarchical}
            options={[
              { v: 'stacked', label: t('vector.hierarchical.stacked') },
              { v: 'cutout', label: t('vector.hierarchical.cutout') },
              { v: 'mosaic', label: t('vector.hierarchical.mosaic') },
            ]}
            onChange={(hierarchical) => patch({ hierarchical })}
          />
          <EnumChips
            label={t('vector.mode')}
            value={params.mode}
            options={[
              { v: 'spline', label: t('vector.mode.spline') },
              { v: 'polygon', label: t('vector.mode.polygon') },
              { v: 'none', label: t('vector.mode.none') },
            ]}
            onChange={(mode) => patch({ mode })}
          />
        </>
      )}
      {isOutline && isColor && (
        <>
          <Slider
            label={t('vector.colorPrecision')}
            title={t('vector.colorPrecision.desc')}
            value={params.colorPrecision}
            min={1}
            max={8}
            onChange={(colorPrecision) => patch({ colorPrecision })}
          />
          <Slider
            label={t('vector.layerDifference')}
            title={t('vector.layerDifference.desc')}
            value={params.layerDifference}
            min={0}
            max={128}
            onChange={(layerDifference) => patch({ layerDifference })}
          />
        </>
      )}
      <Slider
        label={t('vector.speckle')}
        title={t('vector.speckle.desc')}
        value={params.filterSpeckle}
        min={0}
        max={128}
        onChange={(filterSpeckle) => patch({ filterSpeckle })}
      />
      <Slider
        label={t('vector.length')}
        title={t('vector.length.desc')}
        value={params.lengthThreshold}
        min={0}
        max={10}
        step={0.5}
        onChange={(lengthThreshold) => patch({ lengthThreshold })}
      />
      {isOutline && params.mode === 'spline' && (
        <>
          <Slider
            label={t('vector.corner')}
            title={t('vector.corner.desc')}
            value={params.cornerThreshold}
            min={0}
            max={180}
            onChange={(cornerThreshold) => patch({ cornerThreshold })}
          />
          <Slider
            label={t('vector.splice')}
            title={t('vector.splice.desc')}
            value={params.spliceThreshold}
            min={0}
            max={180}
            onChange={(spliceThreshold) => patch({ spliceThreshold })}
          />
          <Slider
            label={t('vector.iterations')}
            title={t('vector.iterations.desc')}
            value={params.maxIterations}
            min={1}
            max={30}
            onChange={(maxIterations) => patch({ maxIterations })}
          />
        </>
      )}
      {!isOutline && (
        <>
          <Slider
            label={t('vector.minStroke')}
            value={params.minStrokeLength}
            min={0}
            max={64}
            onChange={(minStrokeLength) => patch({ minStrokeLength })}
          />
          <Slider
            label={t('vector.strokeWidth')}
            display={(v) => (v === 0 ? t('vector.strokeWidth.auto') : String(v))}
            value={params.strokeWidth}
            min={0}
            max={32}
            onChange={(strokeWidth) => patch({ strokeWidth })}
          />
        </>
      )}
    </Section>
  )
}
