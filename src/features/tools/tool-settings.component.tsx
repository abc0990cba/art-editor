import { useEffect } from 'react'

import { isShapeTool } from '../../engine/shapes/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { FloatingPanel } from '../../shared/ui/floating-panel.component.tsx'
import { useMediaQuery } from '../../shared/ui/index.tsx'
import { useStore, type Tool } from '../../state/editor.store.ts'
import { ShapePaintControls } from './shape-paint-controls.component.tsx'
import { ToolIcon } from './tool-icons.component.tsx'
import { ToolSettingsBody } from './tool-settings-body.component.tsx'
import { ToolSettingsPreview } from './tool-settings-preview.component.tsx'

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tool = anchor.tool
  const preview =
    tool !== 'fill' && tool !== 'picker' && tool !== 'select' ? (
      <ToolSettingsPreview
        tool={tool}
        previewGrid={previewGrid}
        setPreviewGrid={setPreviewGrid}
        maxCols={doc.cols}
        maxRows={doc.rows}
        big={narrow}
      />
    ) : null
  const paintControls = (tool === 'rect' ||
    tool === 'ellipse' ||
    tool === 'line' ||
    tool === 'pen' ||
    isShapeTool(tool)) && <ShapePaintControls fillable={tool !== 'line'} />

  if (narrow) {
    // phones/tablets: the settings take the whole screen — roomy paddings and large
    // touch targets make the controls comfortable on small displays. The live preview
    // stays pinned above the scrolling controls, so tweaks are visible while they are made
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-panel fixed inset-0 z-50 flex flex-col">
          <div className="border-line flex items-center justify-between border-b px-4 py-3">
            <div className="text-body flex items-center gap-2">
              <ToolIcon id={tool} className="h-4 w-4" />
              <span className="text-base font-semibold">{t(`tool.${tool}`)}</span>
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
          {preview && (
            <div className="border-line flex shrink-0 flex-col gap-2 border-b px-4 pt-2 pb-3">
              <div className="text-muted text-overline font-semibold tracking-widest uppercase">
                {t('tool.settings')}
              </div>
              {preview}
            </div>
          )}
          <div className="text-body flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {!preview && (
              <div className="text-muted text-overline font-semibold tracking-widest uppercase">
                {t('tool.settings')}
              </div>
            )}
            {paintControls}
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
          {preview}
          {paintControls}
          <ToolSettingsBody tool={tool} />
        </div>
      </FloatingPanel>
    </>
  )
}
