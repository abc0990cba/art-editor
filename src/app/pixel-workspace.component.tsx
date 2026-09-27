import { useEffect, useRef, useState, type ReactElement } from 'react'

import { CanvasStage } from '../features/canvas/canvas-stage.component.tsx'
import { NodeEditorCanvas } from '../features/nodes-editor/node-editor-canvas.component.tsx'
import {
  PANEL_SECTIONS,
  SettingsPanel,
} from '../features/settings-panel/settings-panel.component.tsx'
import { FabPanel } from '../features/tools/fab-panel.component.tsx'
import { allOrder, ToolIcon } from '../features/tools/tool-icons.component.tsx'
import { ToolRail } from '../features/tools/tool-rail.component.tsx'
import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { IconButton, MobileSheet, SectionGlyph } from '../shared/ui/index.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import { useStore, type Tool } from '../state/editor.store.ts'

/**
 * The pixel editor's canvas row: tool rail, canvas (+ quick-settings fab), the node editor sharing
 * space with the canvas, and the right settings panel (or its collapsed section strip). The mobile
 * pieces (tool strip, panel drawer) live below.
 */
export function PixelCanvasArea(): ReactElement {
  const { t } = useI18n()
  const panelCollapsed = useStore((s) => s.panelCollapsed)
  const togglePanelCollapsed = useStore((s) => s.togglePanelCollapsed)
  const nodeEditorOpen = useStore((s) => s.nodeEditorOpen)
  const nodeEditorMode = useStore((s) => s.nodeEditorMode)
  const nodeEditorSplit = useStore((s) => s.nodeEditorSplit)
  // секция правой панели, которую нужно раскрыть при разворачивании из полосы
  const [panelSection, setPanelSection] = useState<string | null>(null)
  const editorPaneRef = useRef<HTMLDivElement>(null)

  // drag the divider between the canvas and the node editor (split mode)
  const startEditorResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const container = editorPaneRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      useStore.getState().setNodeEditorSplit((ev.clientX - rect.left) / rect.width)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="relative flex min-h-0 flex-1">
      <ToolRail />
      <div ref={editorPaneRef} className="relative flex min-w-0 flex-1">
        <CanvasStage />
        <FabPanel />
        {nodeEditorOpen && (
          <>
            {nodeEditorMode === 'split' && (
              <div
                role="separator"
                aria-orientation="vertical"
                onPointerDown={startEditorResize}
                className="bg-line hover:bg-accent-line hidden w-1 shrink-0 cursor-col-resize transition-colors lg:block"
              />
            )}
            <div
              className={
                nodeEditorMode === 'overlay'
                  ? 'absolute inset-0 z-30'
                  : 'relative z-30 flex min-w-0 items-stretch max-lg:absolute max-lg:inset-0'
              }
              style={
                nodeEditorMode === 'split'
                  ? { width: `${nodeEditorSplit * 100}%`, maxWidth: undefined }
                  : undefined
              }
            >
              <NodeEditorCanvas onClose={() => useStore.getState().closeNodeEditor()} />
            </div>
          </>
        )}
      </div>
      {panelCollapsed ? (
        // collapsed: section shortcuts on top, dedicated expand chevron pinned to the
        // bottom — mirrors the tool rail's collapse toggle (arrow points where it expands)
        <div className="border-line bg-panel hidden w-12 shrink-0 flex-col items-center border-l lg:flex">
          <div className="flex flex-col items-center gap-1 py-2">
            {PANEL_SECTIONS.map((x) => (
              <Tooltip key={x.id} label={t(x.titleKey as 'panel.color')}>
                <button
                  type="button"
                  aria-label={t(x.titleKey as 'panel.color')}
                  onClick={() => {
                    togglePanelCollapsed()
                    setPanelSection(x.id)
                  }}
                  className="text-muted hover:bg-chip-active hover:text-body flex h-10 w-10 items-center justify-center rounded-lg transition"
                >
                  <SectionGlyph icon={x.icon} />
                </button>
              </Tooltip>
            ))}
          </div>
          <div className="border-line mt-auto flex w-full justify-center border-t py-2">
            <Tooltip label={t('panel.expand')}>
              <button
                type="button"
                aria-label={t('panel.expand')}
                onClick={togglePanelCollapsed}
                className="text-muted hover:bg-chip hover:text-body flex h-7 w-7 items-center justify-center rounded-lg transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9.5 4L5.5 8l4 4" />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>
      ) : (
        <div className="border-line bg-panel hidden w-64 shrink-0 flex-col border-l lg:flex">
          <SettingsPanel
            className="flex min-h-0 w-full flex-1 flex-col"
            openSection={panelSection}
          />
          {/* collapse row styled like the tool rail's: chevron + text, arrow pointing
            at the right edge the panel collapses into */}
          <div className="border-line border-t p-2">
            <Tooltip label={t('panel.collapse')}>
              <button
                type="button"
                onClick={togglePanelCollapsed}
                className="text-muted hover:bg-chip hover:text-body flex h-8 w-full items-center gap-2 rounded-lg px-2 transition"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6.5 4l4 4-4 4" />
                </svg>
                <span className="flex-1 truncate text-left text-xs">{t('panel.collapse')}</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
}

/** Mobile thumb zone: horizontally scrollable tool strip + settings shortcut for the active tool. */
export function MobileToolStrip({
  onSettings,
}: {
  onSettings: (tool: Tool) => void
}): ReactElement {
  const { t } = useI18n()
  const tool = useStore((s) => s.tool)
  const stripRef = useRef<HTMLDivElement>(null)
  // keep the active tool visible in the mobile strip while the user scrolls it
  useEffect(() => {
    stripRef.current
      ?.querySelector(`[data-tool="${tool}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tool])

  return (
    <div className="border-line bg-app flex h-14 shrink-0 items-center gap-1.5 border-t px-2 lg:hidden">
      <div
        ref={stripRef}
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto py-1.5 [&::-webkit-scrollbar]:hidden"
      >
        {allOrder.map((id) => (
          <button
            key={id}
            data-tool={id}
            type="button"
            aria-label={id}
            onClick={() => useStore.getState().setTool(id)}
            onDoubleClick={() => onSettings(id)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition ${
              tool === id
                ? 'border-accent-line bg-accent-soft text-accent-text'
                : 'text-muted hover:bg-chip hover:text-body border-transparent'
            }`}
          >
            <ToolIcon id={id} className="h-5 w-5" />
          </button>
        ))}
      </div>
      <div className="bg-line h-8 w-px shrink-0" />
      <IconButton big plate title={t('tool.settings')} onClick={() => onSettings(tool)}>
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" />
          <circle cx="10.5" cy="4.5" r="1.6" />
          <circle cx="5.5" cy="11.5" r="1.6" />
        </svg>
      </IconButton>
    </div>
  )
}

/** Phones/tablets: the right panel as a full-screen slide-over (mirrors the vector params drawer). */
export function MobilePanelDrawer({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  return (
    <MobileSheet title={t('top.panel')} onClose={onClose}>
      <SettingsPanel className="flex min-h-0 w-full flex-1 flex-col" />
    </MobileSheet>
  )
}
