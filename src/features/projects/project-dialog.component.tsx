import { useState } from 'react'

import { MAX_SIZE } from '../../engine/doc.ts'
import { GRID_TYPES, type GridType } from '../../engine/grids.ts'
import { SIZE_GROUPS } from '../../engine/sizes.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Dialog, DialogContent, DialogTitle } from '../../shared/ui/shadcn/dialog.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../../shared/ui/shadcn/select.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

const sizeKey = (cols: number, rows: number) => `${cols}×${rows}`

/**
 * Project creation/editing dialog (Photoshop/Photopea-style) on the shadcn dialog: on startup the
 * user names the project and picks a canvas size before seeing the canvas; later the same dialog
 * opens from the top bar's gear to rename or resize the open project.
 */
export function ProjectDialog({ mode, onClose }: { mode: 'create' | 'edit'; onClose: () => void }) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const projectName = useStore((s) => s.projectName)
  const newDoc = useStore((s) => s.newDoc)
  const setSize = useStore((s) => s.setSize)
  const setGridType = useStore((s) => s.setGridType)
  const setRadialEven = useStore((s) => s.setRadialEven)
  const setProjectName = useStore((s) => s.setProjectName)
  const requestFit = useStore((s) => s.requestFit)

  const [name, setName] = useState(mode === 'edit' ? projectName : '')
  const [cols, setCols] = useState(mode === 'create' ? 128 : doc.cols)
  const [rows, setRows] = useState(mode === 'create' ? 128 : doc.rows)
  const [gridType, setGridTypeLocal] = useState<GridType>(mode === 'edit' ? doc.gridType : 'square')
  const [even, setEven] = useState(mode === 'edit' ? doc.radialEven : false)

  const currentKey = sizeKey(cols, rows)
  const isPreset = SIZE_GROUPS.some((g) =>
    g.sizes.some((s) => sizeKey(s.cols, s.rows) === currentKey),
  )

  const apply = () => {
    if (mode === 'create') newDoc()
    setGridType(gridType)
    if (gridType === 'radial') setRadialEven(even)
    setSize(Math.max(1, cols), Math.max(1, rows))
    setProjectName(name.trim())
    requestFit()
    onClose()
  }

  const fieldClass =
    'w-full rounded-md border border-line bg-chip px-2 py-1.5 text-xs text-body outline-none focus:border-accent-line'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-md gap-3 rounded-xl p-4 sm:max-w-md">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {mode === 'create' ? t('project.new') : t('project.settings')}
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

        <label className="block">
          <span className="text-muted mb-1 block text-xs">{t('project.name')}</span>
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

        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="text-muted mb-1 block text-xs">{t('top.width')}</span>
            <input
              type="number"
              min={1}
              max={MAX_SIZE}
              value={cols}
              onChange={(e) =>
                setCols(Math.max(1, Math.min(MAX_SIZE, Math.round(Number(e.target.value) || 1))))
              }
              className={fieldClass}
            />
          </label>
          <span className="text-muted pb-1.5 text-xs">×</span>
          <label className="min-w-0 flex-1">
            <span className="text-muted mb-1 block text-xs">{t('top.height')}</span>
            <input
              type="number"
              min={1}
              max={MAX_SIZE}
              value={rows}
              onChange={(e) =>
                setRows(Math.max(1, Math.min(MAX_SIZE, Math.round(Number(e.target.value) || 1))))
              }
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-muted mb-1 block text-xs">{t('top.sizePreset')}</span>
          <Select
            value={isPreset ? currentKey : ''}
            onValueChange={(v) => {
              const [c, r] = v.split('×').map(Number)
              if (c && r) {
                setCols(c)
                setRows(r)
              }
            }}
          >
            <SelectTrigger className="border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!isPreset && <SelectItem value={currentKey}>{currentKey}</SelectItem>}
              {SIZE_GROUPS.map((g) => (
                <SelectGroup key={g.ratio}>
                  <SelectLabel className="text-muted text-overline">
                    {g.name ? `${g.ratio} · ${g.name}` : g.ratio}
                  </SelectLabel>
                  {g.sizes.map((s) => {
                    const key = sizeKey(s.cols, s.rows)
                    return (
                      <SelectItem key={key} value={key}>
                        {key}
                        {s.odd ? ` (${t('top.odd')})` : ''}
                      </SelectItem>
                    )
                  })}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="block">
          <span className="text-muted mb-1 block text-xs">{t('project.grid')}</span>
          <Select value={gridType} onValueChange={(v) => setGridTypeLocal(v as GridType)}>
            <SelectTrigger className="border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1.5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRID_TYPES.map((gt) => (
                <SelectItem key={gt} value={gt}>
                  {t(`grid.${gt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {gridType === 'radial' && (
          <label className="text-body flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={even}
              onChange={(e) => setEven(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="pt-0.5">{t('grid.evenCells')}</span>
          </label>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-body border-line bg-chip hover:border-chip-line hover:bg-chip dark:border-line dark:bg-chip dark:text-body dark:hover:bg-chip h-auto px-3 py-1.5 text-xs font-normal"
          >
            {t('projects.cancel')}
          </Button>
          <Button type="button" onClick={apply} className="h-auto px-3 py-1.5 text-xs">
            {mode === 'create' ? t('project.create') : t('project.apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
