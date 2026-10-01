import { useEffect, useState } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { cn } from '../../shared/lib/utils.ts'
import { Chip } from '../../shared/ui/index.tsx'
import { ExpandablePreview } from '../../shared/ui/preview-expander.component.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import type { Tool } from '../../state/editor.store.ts'
import { ToolPreview } from './tool-preview.component.tsx'

/** Square sample-grid presets in cells (powers of two), filtered by the current canvas size. */
const GRID_PRESETS = [8, 16, 32, 64, 128, 256]

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
 * The live tool sample plus its sample-grid presets, shared by the desktop popover and the mobile
 * full-screen settings sheet. `big` sizes the cells to the phone viewport and the preset chips to
 * 44px touch targets. The large expandable copy uses the same cells as the compact one when
 * overridden, with the cell size fitted to the floating panel so any grid up to the canvas size
 * stays readable.
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
  const grid = previewGrid ?? { cols: 37, rows: 24 }
  // mobile (big): the inline preview is the only preview — no floating expander below lg — so its
  // cells fill the screen width (24px cap for sparse grids, 560px max height like the large copy)
  const cell = big
    ? Math.max(2, Math.min(24, Math.floor((vw - 56) / grid.cols), Math.floor(560 / grid.rows)))
    : Math.max(1, Math.min(8, Math.floor(296 / grid.cols)))
  const tipTool = tool === 'pencil' || tool === 'eraser'
  const fitCell = (cols: number, rows: number) =>
    Math.max(2, Math.min(48, Math.floor(704 / cols), Math.floor(560 / rows)))
  const largeGrid = previewGrid
    ? { cols: grid.cols, rows: grid.rows, cell: fitCell(grid.cols, grid.rows) }
    : tipTool
      ? { cols: 15, rows: 9, cell: 48 }
      : { cols: 72, rows: 44, cell: 10 }
  // presets never exceed the canvas, so a shape keeps room to rasterize on either axis
  const presets = GRID_PRESETS.filter((n) => n <= maxCols && n <= maxRows)
  const chipSizing = big ? 'h-11 px-3 text-sm' : undefined

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
      {/* square sample-grid presets (N → N×N cells); Auto returns to the per-tool default */}
      <div
        className={cn('text-body flex flex-wrap items-center gap-1.5 text-xs', big && 'text-sm')}
      >
        <Tooltip label={t('preview.grid.desc')}>
          <span className="text-muted">{t('preview.grid')}</span>
        </Tooltip>
        {presets.map((n) => (
          <Chip
            key={n}
            active={grid.cols === n && grid.rows === n}
            title={`${t('preview.grid.desc')} (${n}×${n})`}
            onClick={() => setPreviewGrid({ cols: n, rows: n })}
            className={chipSizing}
          >
            {n}
          </Chip>
        ))}
        {previewGrid && (
          <Chip
            title={t('preview.gridReset.desc')}
            onClick={() => setPreviewGrid(null)}
            className={chipSizing}
          >
            {t('preview.gridReset')}
          </Chip>
        )}
      </div>
    </>
  )
}
