import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import {
  BUILTIN_PRESETS,
  configMatchesState,
  isBuiltinPreset,
  type EditorPreset,
} from '../engine/presets'
import { presetPreviewDataURL } from '../engine/presetPreview'
import { Tooltip } from './Tooltip'
import type { PresetEntry } from '../storage/presets'

export function PresetsDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const doc = useStore((s) => s.doc)
  const symmetry = useStore((s) => s.symmetry)
  const userPresets = useStore((s) => s.presets)
  const presetsReady = useStore((s) => s.presetsReady)
  const applyPreset = useStore((s) => s.applyPreset)
  const requestFit = useStore((s) => s.requestFit)
  const createPreset = useStore((s) => s.createPreset)
  const overwritePreset = useStore((s) => s.overwritePreset)
  const renamePreset = useStore((s) => s.renamePreset)
  const deletePreset = useStore((s) => s.deletePreset)
  const duplicatePreset = useStore((s) => s.duplicatePreset)

  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const all: EditorPreset[] = [...BUILTIN_PRESETS, ...userPresets]
  const activeId = all.find((p) => configMatchesState(p.config, doc, symmetry))?.id ?? null

  const displayName = (p: EditorPreset) =>
    isBuiltinPreset(p) ? t(`presetName.${p.id}` as 'presetName.builtin.mandala') : p.name

  const saveCurrent = () => {
    void createPreset(name)
    setName('')
  }

  const apply = (p: EditorPreset) => {
    applyPreset(p)
    requestFit()
    onClose()
  }

  const summary = (p: EditorPreset) => {
    const c = p.config
    return `${t(`grid.${c.gridType}` as 'grid.square')} · ${c.cols}×${c.rows} · ${t(`mode.${c.renderMode}` as 'mode.pixels')}`
  }

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-xl border border-line bg-app p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-body">{t('presets.title')}</h2>
          <Tooltip label={t('dialog.close')}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xs text-muted transition hover:bg-chip-active hover:text-body"
            >
              ✕
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            placeholder={t('presets.savePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCurrent()
            }}
            className="flex-1 rounded-md border border-line bg-chip px-2 py-1.5 text-xs text-body outline-none focus:border-accent-line"
          />
          <button
            type="button"
            onClick={saveCurrent}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
          >
            {t('presets.save')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!presetsReady && (
            <p className="p-4 text-center text-xs text-muted">{t('projects.loading')}</p>
          )}
          {presetsReady && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {all.map((p) => {
                const builtin = isBuiltinPreset(p)
                const active = p.id === activeId
                return (
                  <div
                    key={p.id}
                    className={`overflow-hidden rounded-lg border bg-panel ${
                      active ? 'border-accent-line' : 'border-line'
                    }`}
                  >
                    <Tooltip label={t('presets.apply')}>
                      <button type="button" onClick={() => apply(p)} className="block w-full">
                        <img
                          src={presetPreviewDataURL(p)}
                          alt=""
                          className="aspect-square w-full object-contain"
                        />
                      </button>
                    </Tooltip>
                    <div className="flex flex-col gap-1.5 p-2">
                      {renaming?.id === p.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={renaming.value}
                          onChange={(e) => setRenaming({ id: p.id, value: e.target.value })}
                          onBlur={() => {
                            void renamePreset(p.id, renaming.value)
                            setRenaming(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              void renamePreset(p.id, renaming.value)
                              setRenaming(null)
                            }
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                          className="w-full rounded border border-accent-line bg-chip px-1.5 py-0.5 text-xs text-body outline-none"
                        />
                      ) : (
                        <Tooltip label={builtin ? displayName(p) : t('presets.rename')}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!builtin) setRenaming({ id: p.id, value: p.name })
                            }}
                            className="flex items-center gap-1 truncate rounded px-0.5 text-left text-xs font-medium text-body transition enabled:hover:bg-chip-active"
                          >
                            <span className="truncate">{displayName(p)}</span>
                          </button>
                        </Tooltip>
                      )}
                      <span className="truncate text-[10px] text-muted">
                        {builtin ? `${t('presets.builtin')} · ` : ''}
                        {summary(p)}
                      </span>
                      {!builtin && (
                        <span className="text-[10px] text-muted">
                          {fmtDate((p as PresetEntry).updatedAt)}
                        </span>
                      )}
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <Tooltip label={t('presets.apply')}>
                          <button
                            type="button"
                            onClick={() => apply(p)}
                            className="rounded border border-accent-line py-0.5 text-accent-text transition hover:bg-accent-soft"
                          >
                            {t('presets.apply')}
                          </button>
                        </Tooltip>
                        <Tooltip label={t('presets.duplicate')}>
                          <button
                            type="button"
                            onClick={() =>
                              void duplicatePreset({
                                // the original stays listed, so a built-in copy always gets a new name
                                name: isBuiltinPreset(p) ? `${displayName(p)} copy` : p.name,
                                config: p.config,
                              })
                            }
                            className="rounded border border-line py-0.5 transition hover:border-chip-line"
                          >
                            {t('presets.duplicate')}
                          </button>
                        </Tooltip>
                        {!builtin && (
                          <>
                            <Tooltip label={t('presets.overwriteTitle')}>
                              <button
                                type="button"
                                onClick={() => void overwritePreset(p.id)}
                                className="rounded border border-line py-0.5 transition hover:border-chip-line"
                              >
                                {t('presets.overwrite')}
                              </button>
                            </Tooltip>
                            {deleting === p.id ? (
                              <Tooltip label={t('presets.confirmDelete')}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deletePreset(p.id)
                                    setDeleting(null)
                                  }}
                                  className="rounded border border-red-500/60 bg-red-500/10 py-0.5 text-red-400 transition hover:bg-red-500/20"
                                >
                                  {t('presets.confirmDelete')}
                                </button>
                              </Tooltip>
                            ) : (
                              <Tooltip label={t('presets.delete')}>
                                <button
                                  type="button"
                                  onClick={() => setDeleting(p.id)}
                                  className="rounded border border-line py-0.5 transition hover:border-red-500/60 hover:text-red-400"
                                >
                                  {t('presets.delete')}
                                </button>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
