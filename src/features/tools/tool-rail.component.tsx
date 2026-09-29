import { useState } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { useMediaQuery } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore, type Tool } from '../../state/editor.store.ts'
import {
  allOrder,
  SettingsGlyph,
  ToolIcon,
  toolHasSettings,
  toolKeys,
} from './tool-icons.component.tsx'
import { RailChevron, RailList } from './tool-rail-list.component.tsx'
import { SETTINGS_W, ToolSettings, type SettingsAnchor } from './tool-settings.component.tsx'

/** Viewport-safe anchor for the settings popover of one rail row. */
function settingsAnchor(e: React.MouseEvent<HTMLButtonElement>, tool: Tool): SettingsAnchor {
  const r = e.currentTarget.getBoundingClientRect()
  const x =
    r.right + 8 + SETTINGS_W > window.innerWidth
      ? Math.max(8, r.left - SETTINGS_W - 8)
      : r.right + 8
  return { tool, x, y: r.top }
}

export function ToolRail() {
  const { t } = useI18n()
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const railOpen = useStore((s) => s.railOpen)
  const toggleRail = useStore((s) => s.toggleRail)
  const [settings, setSettings] = useState<SettingsAnchor | null>(null)
  // phones and tablets: tools live in the bottom strip (App), so the side rail is off
  const narrow = useMediaQuery('(max-width: 1023px)')

  /**
   * Fresco interaction: the first click picks the tool, a second click on the already-active tool
   * (its icon or the options triangle) opens its settings — FloatingPanel keeps the popover inside
   * the viewport even for rows near the bottom edge. No double-clicking.
   */
  const onToolClick = (id: Tool) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (tool !== id) {
      setSettings(null)
      setTool(id)
      return
    }
    if (!toolHasSettings(id)) return
    setSettings(settings?.tool === id ? null : settingsAnchor(e, id))
  }

  const row = (id: Tool, expanded: boolean) => (
    <Tooltip
      key={id}
      label={`${t(`tool.${id}`)} (${toolKeys[id]}) — ${t(`tool.${id}.desc` as 'tool.pencil.desc')}`}
    >
      <button
        type="button"
        onClick={onToolClick(id)}
        className={`relative flex items-center rounded-lg border transition ${
          expanded ? 'h-8 w-full gap-2 px-2' : 'h-9 w-9 justify-center'
        } ${
          tool === id
            ? 'border-accent-line bg-accent-soft text-accent-text'
            : 'text-muted hover:bg-chip hover:text-body border-transparent'
        }`}
      >
        <ToolIcon id={id} className={expanded ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
        {expanded && (
          <>
            <span className="flex-1 truncate text-left text-xs">{t(`tool.${id}`)}</span>
            <span className="text-muted text-overline tabular-nums">{toolKeys[id]}</span>
          </>
        )}
        {/* Fresco's options marker: a small triangle pinned to the button's bottom-right corner */}
        {toolHasSettings(id) && (
          <SettingsGlyph className="absolute right-[3px] bottom-[3px] h-1 w-1" />
        )}
      </button>
    </Tooltip>
  )

  /** The bottom toggle of either rail mode: text row when expanded, icon-only when collapsed. */
  const railToggle = (expanded: boolean) => {
    const labelKey: 'panel.railCollapse' | 'panel.railExpand' = expanded
      ? 'panel.railCollapse'
      : 'panel.railExpand'
    return (
      <Tooltip label={t(labelKey)}>
        <button
          type="button"
          onClick={() => {
            setSettings(null)
            toggleRail()
          }}
          aria-label={t(labelKey)}
          className={`text-muted hover:bg-chip hover:text-body flex items-center rounded-lg transition ${
            expanded ? 'h-8 w-full gap-2 px-2' : 'h-7 w-7 justify-center'
          }`}
        >
          <RailChevron d={expanded ? 'M9.5 4L5.5 8l4 4' : 'M6.5 4l4 4-4 4'} />
          {expanded && <span className="flex-1 truncate text-left text-xs">{t(labelKey)}</span>}
        </button>
      </Tooltip>
    )
  }

  if (narrow) return null

  if (railOpen) {
    return (
      <nav className="border-line bg-panel flex w-48 shrink-0 flex-col border-r">
        <RailList className="gap-0.5 px-2 py-2">{allOrder.map((id) => row(id, true))}</RailList>
        <div className="border-line border-t p-2">{railToggle(true)}</div>
        {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
      </nav>
    )
  }

  return (
    <nav className="border-line bg-panel flex w-12 shrink-0 flex-col border-r">
      <RailList className="items-center gap-1 py-2">
        {allOrder.map((id) => row(id, false))}
      </RailList>
      <div className="border-line flex justify-center border-t py-2">{railToggle(false)}</div>
      {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
    </nav>
  )
}
