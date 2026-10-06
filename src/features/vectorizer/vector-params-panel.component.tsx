import { useState } from 'react'

import { DEFAULT_TRACE_PARAMS, TRACE_PRESETS } from '../../engine/trace/params.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { useDemoImage } from '../../shared/lib/use-demo-image.hook.ts'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { Chip, PresetCard, Section, Slider, TextField } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { TraceSection } from './vector-trace-section.component.tsx'

/**
 * Right-column control panel of the vector mode: preset library (built-ins + user presets from
 * IndexedDB) and the vtracer parameter sections. Only shows the controls that the current tracer
 * actually consumes (outline vs centerline, color vs binary).
 */

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
  const setSource = useStore((s) => s.setVectorSource)
  const setStatus = useStore((s) => s.setVectorStatus)
  const vectorPresets = useStore((s) => s.vectorPresets)
  const createVectorPreset = useStore((s) => s.createVectorPreset)
  const overwriteVectorPreset = useStore((s) => s.overwriteVectorPreset)
  const deleteVectorPreset = useStore((s) => s.deleteVectorPreset)
  const [name, setName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { loadingId, loadDemo } = useDemoImage({
    onLoad: setSource,
    onError: (message) => setStatus('error', message),
    errorMessage: t('workspace.demo.error'),
  })
  const applyPreset = (id: string, params: Record<string, unknown>, demo?: string): void => {
    applyParams({ ...DEFAULT_TRACE_PARAMS, ...params })
    if (demo) void loadDemo(id, demo)
  }
  return (
    <Section title={t('vector.preset')} icon="presets" defaultOpen>
      <div className="grid grid-cols-2 gap-1.5">
        {TRACE_PRESETS.map((p) => (
          <PresetCard
            key={p.id}
            label={t(`vector.preset.${p.id}` as 'vector.preset.default')}
            image={p.demo}
            loading={loadingId === p.id}
            onClick={() => applyPreset(p.id, p.params, p.demo)}
          />
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
