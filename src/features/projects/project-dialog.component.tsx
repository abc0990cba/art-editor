import { useState, type ReactNode } from 'react'

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

/** Labeled field row: caption above the control; captions grow with the mobile type scale. */
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={className ?? 'block'}>
      <span className="text-muted mb-1 block text-xs max-lg:text-sm">{label}</span>
      {children}
    </label>
  )
}

/** Chip-plate select trigger; phones get 44px touch targets (max-lg). */
const TRIGGER_CLS =
  'border-line bg-chip text-body dark:border-line dark:bg-chip h-auto w-full rounded-md px-2 py-1.5 text-xs max-lg:min-h-11 max-lg:px-3 max-lg:py-2.5 max-lg:text-sm'

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
    'w-full rounded-md border border-line bg-chip px-2 py-1.5 text-xs text-body outline-none focus:border-accent-line max-lg:min-h-11 max-lg:px-3 max-lg:text-base'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="gap-3 p-4 lg:max-w-md lg:rounded-xl">
        <div className="flex items-center justify-between">
          <DialogTitle className="text-body text-sm font-semibold tracking-wide">
            {mode === 'create' ? t('project.new') : t('project.settings')}
          </DialogTitle>
          <Tooltip label={t('dialog.close')}>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:bg-chip-active hover:text-body rounded-md px-2 py-1 text-xs transition max-lg:h-11 max-lg:w-11 max-lg:text-base"
            >
              ✕
            </button>
          </Tooltip>
        </div>

        <Field label={t('project.name')}>
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
        </Field>

        <div className="flex items-end gap-2">
          <Field className="min-w-0 flex-1" label={t('top.width')}>
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
          </Field>
          <span className="text-muted pb-1.5 text-xs">×</span>
          <Field className="min-w-0 flex-1" label={t('top.height')}>
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
          </Field>
        </div>

        <Field label={t('top.sizePreset')}>
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
            <SelectTrigger className={TRIGGER_CLS}>
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
        </Field>

        <Field label={t('project.grid')}>
          <Select value={gridType} onValueChange={(v) => setGridTypeLocal(v as GridType)}>
            <SelectTrigger className={TRIGGER_CLS}>
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
        </Field>
        {gridType === 'radial' && (
          <label className="text-body flex cursor-pointer items-center gap-2 text-xs max-lg:min-h-11 max-lg:text-sm">
            <input
              type="checkbox"
              checked={even}
              onChange={(e) => setEven(e.target.checked)}
              className="accent-indigo-500"
            />
            <span className="pt-0.5">{t('grid.evenCells')}</span>
          </label>
        )}

        <div className="flex items-center justify-end gap-2 pt-1 max-lg:gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="text-body border-line bg-chip hover:border-chip-line hover:bg-chip dark:border-line dark:bg-chip dark:text-body dark:hover:bg-chip h-auto px-3 py-1.5 text-xs font-normal max-lg:min-h-11 max-lg:flex-1"
          >
            {t('projects.cancel')}
          </Button>
          <Button
            type="button"
            onClick={apply}
            className="h-auto px-3 py-1.5 text-xs max-lg:min-h-11 max-lg:flex-1"
          >
            {mode === 'create' ? t('project.create') : t('project.apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
