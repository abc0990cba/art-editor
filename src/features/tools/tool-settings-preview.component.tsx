import { useEffect, useState } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { cn } from '../../shared/lib/utils.ts'
import { Chip } from '../../shared/ui/index.tsx'
import { ExpandablePreview } from '../../shared/ui/preview-expander.component.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import type { Tool } from '../../state/editor.store.ts'
import { ToolPreview } from './tool-preview.component.tsx'

/** Viewport width, reactive — sizes the mobile preview's cells to the real screen. */
function useViewportWidth(): number {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return w
}

/**
 * The live tool sample plus its editable sample-grid row, shared by the desktop popover and the
 * mobile full-screen settings sheet. `big` sizes the cells to the phone viewport and the grid
 * inputs to 44px touch targets. The large expandable copy uses the same cells as the compact one
 * when overridden, with the cell size fitted to the floating panel so any grid up to the canvas
 * size stays readable.
 */
export function ToolSettingsPreview({
  tool,
  previewGrid,
  setPreviewGrid,
  maxCols,
  maxRows,
  big = false,
}: {
  tool: Tool
  /** The user's sample-grid override (null = per-tool defaults) */
  previewGrid: { cols: number; rows: number } | null
  setPreviewGrid: (grid: { cols: number; rows: number } | null) => void
  maxCols: number
  maxRows: number
  big?: boolean
}) {
  const { t } = useI18n()
  const vw = useViewportWidth()
  // text mirrors of the grid inputs so typing stays responsive while values clamp
  const [gridText, setGridText] = useState<{ cols: string | null; rows: string | null }>({
    cols: null,
    rows: null,
  })

  const commitGrid = (axis: 'cols' | 'rows', raw: string) => {
    setGridText((prev) => ({ ...prev, [axis]: raw }))
    const n = Math.round(Number(raw))
    if (raw.trim() === '' || !Number.isFinite(n)) return
    // the preview can never exceed the current canvas, and stays at 4+ cells so a
    // shape still has a (cols-3)×(rows-3) box to rasterize into
    const max = axis === 'cols' ? maxCols : maxRows
    const clamped = Math.max(4, Math.min(max, n))
    setPreviewGrid({ ...(previewGrid ?? { cols: 37, rows: 24 }), [axis]: clamped })
  }
  const grid = previewGrid ?? { cols: 37, rows: 24 }
  const cell = big
    ? Math.max(2, Math.min(12, Math.floor((vw - 56) / grid.cols)))
    : Math.max(1, Math.min(8, Math.floor(296 / grid.cols)))
  const tipTool = tool === 'pencil' || tool === 'eraser'
  const fitCell = (cols: number, rows: number) =>
    Math.max(2, Math.min(48, Math.floor(704 / cols), Math.floor(560 / rows)))
  const largeGrid = previewGrid
    ? { cols: grid.cols, rows: grid.rows, cell: fitCell(grid.cols, grid.rows) }
    : tipTool
      ? { cols: 15, rows: 9, cell: 48 }
      : { cols: 72, rows: 44, cell: 10 }
  const inputClass = cn(
    'border-line bg-chip text-body focus:border-accent-line w-14 rounded-md border px-1.5 py-1 text-right text-xs outline-none',
    big && 'h-11 w-16 px-2 text-base',
  )

  return (
    <>
      <ExpandablePreview
        title={t(`tool.${tool}`)}
        panelWidth={largeGrid.cols * largeGrid.cell + 24}
        large={
          <ToolPreview
            tool={tool}
            cols={largeGrid.cols}
            rows={largeGrid.rows}
            cell={largeGrid.cell}
          />
        }
      >
        <ToolPreview tool={tool} cols={grid.cols} rows={grid.rows} cell={cell} />
      </ExpandablePreview>
      {/* editable sample-grid size, clamped to the current canvas dimensions */}
      <div className={cn('text-body flex items-center gap-1.5 text-xs', big && 'text-sm')}>
        <Tooltip label={t('preview.grid.desc')}>
          <span className="text-muted">{t('preview.grid')}</span>
        </Tooltip>
        <input
          type="number"
          min={4}
          max={maxCols}
          value={gridText.cols ?? grid.cols}
          onChange={(e) => commitGrid('cols', e.target.value)}
          onBlur={() => setGridText((prev) => ({ ...prev, cols: null }))}
          title={`${t('preview.grid.desc')} (max ${maxCols})`}
          className={inputClass}
        />
        <span className="text-muted">×</span>
        <input
          type="number"
          min={4}
          max={maxRows}
          value={gridText.rows ?? grid.rows}
          onChange={(e) => commitGrid('rows', e.target.value)}
          onBlur={() => setGridText((prev) => ({ ...prev, rows: null }))}
          title={`${t('preview.grid.desc')} (max ${maxRows})`}
          className={inputClass}
        />
        {previewGrid && (
          <Chip
            title={t('preview.gridReset.desc')}
            onClick={() => setPreviewGrid(null)}
            className={big ? 'h-11 px-3 text-sm' : undefined}
          >
            {t('preview.gridReset')}
          </Chip>
        )}
      </div>
    </>
  )
}
