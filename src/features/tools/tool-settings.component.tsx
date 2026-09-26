import { useEffect, useState } from 'react'

import { isShapeTool } from '../../engine/shapes.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { FloatingPanel } from '../../shared/ui/floating-panel.component.tsx'
import { Chip, useMediaQuery } from '../../shared/ui/index.tsx'
import { ExpandablePreview } from '../../shared/ui/preview-expander.component.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore, type Tool } from '../../state/editor.store.ts'
import { ShapePaintControls } from './shape-paint-controls.component.tsx'
import { ToolIcon } from './tool-icons.component.tsx'
import { ToolPreview } from './tool-preview.component.tsx'
import { ToolSettingsBody } from './tool-settings-body.component.tsx'

/** CSS width of the per-tool settings popover (w-80); anchors flip when this won't fit. */
export const SETTINGS_W = 320

export interface SettingsAnchor {
  tool: Tool
  x: number
  y: number
}

/** Floating per-tool settings panel, opened by double-clicking a rail button. */
export function ToolSettings({ anchor, onClose }: { anchor: SettingsAnchor; onClose: () => void }) {
  const { t } = useI18n()
  const narrow = useMediaQuery('(max-width: 1023px)')
  const doc = useStore((s) => s.doc)
  const previewGrid = useStore((s) => s.previewGrid)
  const setPreviewGrid = useStore((s) => s.setPreviewGrid)
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
    const max = axis === 'cols' ? doc.cols : doc.rows
    const clamped = Math.max(4, Math.min(max, n))
    setPreviewGrid({ ...(previewGrid ?? { cols: 37, rows: 24 }), [axis]: clamped })
  }
  const grid = previewGrid ?? { cols: 37, rows: 24 }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tool = anchor.tool
  // preview grid: the user override when set, otherwise the per-context defaults. The
  // large copy uses the same cells as the compact one when overridden, with the cell
  // size fitted to the floating panel so any grid up to the canvas size stays readable.
  const tipTool = tool === 'pencil' || tool === 'eraser'
  const fitCell = (cols: number, rows: number) =>
    Math.max(2, Math.min(48, Math.floor(704 / cols), Math.floor(560 / rows)))
  const largeGrid = previewGrid
    ? { cols: grid.cols, rows: grid.rows, cell: fitCell(grid.cols, grid.rows) }
    : tipTool
      ? { cols: 15, rows: 9, cell: 48 }
      : { cols: 72, rows: 44, cell: 10 }
  if (narrow) {
    // phones/tablets: the settings take the whole screen — roomy paddings and large
    // touch targets make the controls comfortable on small displays
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-panel fixed inset-0 z-50 flex flex-col">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <div className="text-body flex items-center gap-2">
              <ToolIcon id={tool} className="h-4 w-4" />
              <span className="text-sm font-semibold">{t(`tool.${tool}`)}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('preview.close')}
              className="text-muted hover:bg-chip-active hover:text-body flex h-11 w-11 items-center justify-center rounded-lg transition"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
          <div className="text-body flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="text-muted text-overline font-semibold tracking-widest uppercase">
              {t('tool.settings')}
            </div>
            <ToolSettingsBody tool={tool} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {/* FloatingPanel clamps the popover back on-screen after every size/anchor change,
          so settings of the bottom rail rows never open past the window edge */}
      <FloatingPanel
        x={anchor.x}
        y={anchor.y}
        className="border-line bg-panel fixed z-50 w-80 rounded-xl border p-3 shadow-xl"
      >
        <div className="text-muted text-overline mb-1 font-semibold tracking-widest uppercase">
          {t('tool.settings')}
        </div>
        <div className="text-body mb-2.5 flex items-center gap-1.5">
          <ToolIcon id={tool} className="h-4 w-4" />
          <span className="flex-1 text-xs font-medium">{t(`tool.${tool}`)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tool.settings')}
            className="text-muted hover:text-body transition"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {/* live preview of what the tool paints with the current settings; the fill tool
            already ships FillSettings' pattern preview, picker/select paint nothing */}
        <div className="flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto">
          {tool !== 'fill' && tool !== 'picker' && tool !== 'select' && (
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
                <ToolPreview
                  tool={tool}
                  cols={grid.cols}
                  rows={grid.rows}
                  cell={Math.max(1, Math.min(8, Math.floor(296 / grid.cols)))}
                />
              </ExpandablePreview>
              {/* editable sample-grid size, clamped to the current canvas dimensions */}
              <div className="text-body flex items-center gap-1.5 text-xs">
                <Tooltip label={t('preview.grid.desc')}>
                  <span className="text-muted">{t('preview.grid')}</span>
                </Tooltip>
                <input
                  type="number"
                  min={4}
                  max={doc.cols}
                  value={gridText.cols ?? grid.cols}
                  onChange={(e) => commitGrid('cols', e.target.value)}
                  onBlur={() => setGridText((prev) => ({ ...prev, cols: null }))}
                  title={`${t('preview.grid.desc')} (max ${doc.cols})`}
                  className="border-line bg-chip text-body focus:border-accent-line w-14 rounded-md border px-1.5 py-1 text-right text-xs outline-none"
                />
                <span className="text-muted">×</span>
                <input
                  type="number"
                  min={4}
                  max={doc.rows}
                  value={gridText.rows ?? grid.rows}
                  onChange={(e) => commitGrid('rows', e.target.value)}
                  onBlur={() => setGridText((prev) => ({ ...prev, rows: null }))}
                  title={`${t('preview.grid.desc')} (max ${doc.rows})`}
                  className="border-line bg-chip text-body focus:border-accent-line w-14 rounded-md border px-1.5 py-1 text-right text-xs outline-none"
                />
                {previewGrid && (
                  <Chip title={t('preview.gridReset.desc')} onClick={() => setPreviewGrid(null)}>
                    {t('preview.gridReset')}
                  </Chip>
                )}
              </div>
            </>
          )}
          {(tool === 'rect' || tool === 'ellipse' || tool === 'line' || isShapeTool(tool)) && (
            <ShapePaintControls fillable={tool !== 'line'} />
          )}
          <ToolSettingsBody tool={tool} />
        </div>
      </FloatingPanel>
    </>
  )
}
