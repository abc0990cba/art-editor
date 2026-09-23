import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import { SIZE_GROUPS } from '../engine/sizes'

const sizeKey = (cols: number, rows: number) => `${cols}×${rows}`

/**
 * Project creation/editing dialog (Photoshop/Photopea-style): on startup the user names
 * the project and picks a canvas size before seeing the canvas; later the same dialog
 * opens from the top bar's gear to rename or resize the open project.
 */
export function ProjectDialog({
  mode,
  onClose,
}: {
  mode: 'create' | 'edit'
  onClose: () => void
}) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const projectName = useStore((s) => s.projectName)
  const newDoc = useStore((s) => s.newDoc)
  const setSize = useStore((s) => s.setSize)
  const setProjectName = useStore((s) => s.setProjectName)
  const requestFit = useStore((s) => s.requestFit)

  const [name, setName] = useState(mode === 'edit' ? projectName : '')
  const [cols, setCols] = useState(mode === 'create' ? 128 : doc.cols)
  const [rows, setRows] = useState(mode === 'create' ? 128 : doc.rows)

  const currentKey = sizeKey(cols, rows)
  const isPreset = SIZE_GROUPS.some((g) => g.sizes.some((s) => sizeKey(s.cols, s.rows) === currentKey))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const apply = () => {
    if (mode === 'create') newDoc()
    setSize(Math.max(1, cols), Math.max(1, rows))
    setProjectName(name.trim())
    requestFit()
    onClose()
  }

  const fieldClass =
    'w-full rounded-md border border-line bg-chip px-2 py-1.5 text-xs text-body outline-none focus:border-accent-line'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-line bg-app p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-body">
          {mode === 'create' ? t('project.new') : t('project.settings')}
        </h2>

        <label className="mb-2.5 block">
          <span className="mb-1 block text-xs text-muted">{t('project.name')}</span>
          <input
            type="text"
            value={name}
            placeholder={t('project.untitled')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply()
            }}
            className={fieldClass}
          />
        </label>

        <div className="mb-2.5 flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted">{t('top.width')}</span>
            <input
              type="number"
              min={1}
              max={512}
              value={cols}
              onChange={(e) => setCols(Math.max(1, Math.min(512, Math.round(Number(e.target.value) || 1))))}
              className={fieldClass}
            />
          </label>
          <span className="pb-1.5 text-xs text-muted">×</span>
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-muted">{t('top.height')}</span>
            <input
              type="number"
              min={1}
              max={512}
              value={rows}
              onChange={(e) => setRows(Math.max(1, Math.min(512, Math.round(Number(e.target.value) || 1))))}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs text-muted">{t('top.sizePreset')}</span>
          <select
            value={isPreset ? currentKey : ''}
            onChange={(e) => {
              const [c, r] = e.target.value.split('×').map(Number)
              if (c && r) {
                setCols(c)
                setRows(r)
              }
            }}
            className={fieldClass + ' cursor-pointer'}
          >
            {!isPreset && <option value="">{currentKey}</option>}
            {SIZE_GROUPS.map((g) => (
              <optgroup key={g.ratio} label={g.name ? `${g.ratio} · ${g.name}` : g.ratio}>
                {g.sizes.map((s) => {
                  const key = sizeKey(s.cols, s.rows)
                  return (
                    <option key={key} value={key}>
                      {key}
                      {s.odd ? ` (${t('top.odd')})` : ''}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-chip px-3 py-1.5 text-xs text-body transition hover:border-chip-line"
          >
            {t('projects.cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
          >
            {mode === 'create' ? t('project.create') : t('project.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
