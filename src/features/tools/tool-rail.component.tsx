import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { useMediaQuery } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore, type Tool } from '../../state/editor.store.ts'
import { allOrder, ToolIcon, toolKeys } from './tool-icons.component.tsx'
import { SETTINGS_W, ToolSettings, type SettingsAnchor } from './tool-settings.component.tsx'

function Chevron({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

/**
 * Scrollable rail list without a visible scrollbar (a fat bar next to the icon strip looks clumsy).
 * Instead, subtle gradient fades appear at the clipped edges hinting that the list continues — they
 * show only while there is content beyond the edge.
 */
function RailList({ className, children }: { className: string; children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  const update = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setFadeTop(el.scrollTop > 4)
    setFadeBottom(el.scrollTop < el.scrollHeight - el.clientHeight - 4)
  }, [])

  useEffect(() => {
    update()
    const el = listRef.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        onScroll={update}
        className={`rail-list flex min-h-0 w-full flex-1 flex-col overflow-x-hidden overflow-y-auto ${className}`}
      >
        {children}
      </div>
      {fadeTop && (
        <div className="from-app pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b to-transparent" />
      )}
      {fadeBottom && (
        <div className="from-app pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t to-transparent" />
      )}
    </div>
  )
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
   * Open the per-tool settings next to the double-clicked row; FloatingPanel keeps the popover
   * inside the viewport even for rows near the bottom edge
   */
  const openSettings = (id: Tool) => (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x =
      r.right + 8 + SETTINGS_W > window.innerWidth
        ? Math.max(8, r.left - SETTINGS_W - 8)
        : r.right + 8
    setSettings({ tool: id, x, y: r.top })
  }

  const row = (id: Tool, expanded: boolean) => (
    <Tooltip
      key={id}
      label={`${t(`tool.${id}`)} (${toolKeys[id]}) — ${t(`tool.${id}.desc` as 'tool.pencil.desc')}`}
    >
      <button
        type="button"
        onClick={() => setTool(id)}
        onDoubleClick={openSettings(id)}
        className={
          expanded
            ? `flex h-8 w-full items-center gap-2 rounded-lg border px-2 transition ${
                tool === id
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'text-muted hover:bg-chip hover:text-body border-transparent'
              }`
            : `flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                tool === id
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'text-muted hover:bg-chip hover:text-body border-transparent'
              }`
        }
      >
        <ToolIcon id={id} className={expanded ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
        {expanded && (
          <>
            <span className="flex-1 truncate text-left text-xs">{t(`tool.${id}`)}</span>
            <span className="text-muted text-overline tabular-nums">{toolKeys[id]}</span>
          </>
        )}
      </button>
    </Tooltip>
  )

  if (narrow) return null

  if (railOpen) {
    return (
      <nav className="border-line bg-panel flex w-48 shrink-0 flex-col border-r">
        <RailList className="gap-0.5 px-2 py-2">{allOrder.map((id) => row(id, true))}</RailList>
        <div className="border-line border-t p-2">
          <Tooltip label={t('panel.railCollapse')}>
            <button
              type="button"
              onClick={() => {
                setSettings(null)
                toggleRail()
              }}
              className="text-muted hover:bg-chip hover:text-body flex h-8 w-full items-center gap-2 rounded-lg px-2 transition"
            >
              <Chevron d="M9.5 4L5.5 8l4 4" />
              <span className="flex-1 truncate text-left text-xs">{t('panel.railCollapse')}</span>
            </button>
          </Tooltip>
        </div>
        {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
      </nav>
    )
  }

  return (
    <nav className="border-line bg-panel flex w-12 shrink-0 flex-col border-r">
      <RailList className="items-center gap-1 py-2">
        {allOrder.map((id) => row(id, false))}
      </RailList>
      <div className="border-line flex justify-center border-t py-2">
        <Tooltip label={t('panel.railExpand')}>
          <button
            type="button"
            onClick={() => {
              setSettings(null)
              toggleRail()
            }}
            aria-label={t('panel.railExpand')}
            className="text-muted hover:bg-chip hover:text-body flex h-7 w-7 items-center justify-center rounded-lg transition"
          >
            <Chevron d="M6.5 4l4 4-4 4" />
          </button>
        </Tooltip>
      </div>
      {settings && <ToolSettings anchor={settings} onClose={() => setSettings(null)} />}
    </nav>
  )
}
