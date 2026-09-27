import { useState } from 'react'

import { presetPreviewDataURL } from '../../engine/preset-preview.ts'
import {
  BUILTIN_PRESETS,
  configMatchesState,
  isBuiltinPreset,
  type EditorPreset,
} from '../../engine/presets.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import type { PresetEntry } from '../../storage/presets.ts'

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-full flex-col gap-3 overflow-hidden p-4 lg:max-h-[85vh] lg:max-w-3xl lg:rounded-xl"
      >
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {t('presets.title')}
          </DialogTitle>
          <Tooltip label={t('dialog.close')}>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition"
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
            className="border-line bg-chip text-body focus:border-accent-line flex-1 rounded-md border px-2 py-1.5 text-xs outline-none"
          />
          <Button type="button" onClick={saveCurrent} className="h-auto px-3 py-1.5 text-xs">
            {t('presets.save')}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!presetsReady && (
            <p className="text-muted p-4 text-center text-xs">{t('projects.loading')}</p>
          )}
          {presetsReady && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {all.map((p) => {
                const builtin = isBuiltinPreset(p)
                const active = p.id === activeId
                return (
                  <div
                    key={p.id}
                    className={`bg-panel overflow-hidden rounded-lg border ${
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
                          className="border-accent-line bg-chip text-body w-full rounded border px-1.5 py-0.5 text-xs outline-none"
                        />
                      ) : (
                        <Tooltip label={builtin ? displayName(p) : t('presets.rename')}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!builtin) setRenaming({ id: p.id, value: p.name })
                            }}
                            className="text-body enabled:hover:bg-chip-active flex items-center gap-1 truncate rounded px-0.5 text-left text-xs font-medium transition"
                          >
                            <span className="truncate">{displayName(p)}</span>
                          </button>
                        </Tooltip>
                      )}
                      <span className="text-muted text-overline truncate">
                        {builtin ? `${t('presets.builtin')} · ` : ''}
                        {summary(p)}
                      </span>
                      {!builtin && (
                        <span className="text-muted text-overline">
                          {fmtDate((p as PresetEntry).updatedAt)}
                        </span>
                      )}
                      <div className="text-label grid grid-cols-2 gap-1">
                        <Tooltip label={t('presets.apply')}>
                          <button
                            type="button"
                            onClick={() => apply(p)}
                            className="border-accent-line text-accent-text hover:bg-accent-soft rounded border py-0.5 transition"
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
                            className="border-line hover:border-chip-line rounded border py-0.5 transition"
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
                                className="border-line hover:border-chip-line rounded border py-0.5 transition"
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
                                  className="border-line rounded border py-0.5 transition hover:border-red-500/60 hover:text-red-400"
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
      </DialogContent>
    </Dialog>
  )
}
