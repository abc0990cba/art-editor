import { useRef, useState } from 'react'

import { useI18n } from '../shared/i18n/i18n.provider.tsx'
import { IconButton, useMediaQuery } from '../shared/ui/index.tsx'
import { Tooltip } from '../shared/ui/tooltip.component.tsx'
import { useStore } from '../state/editor.store.ts'
import {
  ExportPillButton,
  ImportPillButton,
  MobileHeader,
  TopBarDialogs,
  TopBarDocumentButtons,
  TopBarProjectControls,
} from './top-bar-buttons.component.tsx'
import { LangMenu, ThemeMenu } from './top-bar-menus.component.tsx'
import { TopBarMoreMenu } from './top-bar-more-menu.component.tsx'

/**
 * App top bar: document identity/actions on the left, view controls on the right. Phones/tablets
 * swap the full bar for the mobile composition (nav + overflow menu, Photoshop/Procreate pattern) —
 * the pieces live in top-bar-buttons / top-bar-menus / top-bar-more-menu.
 */
export function TopBar({
  onImportFile,
  onTogglePanel,
}: {
  onImportFile: (file: File) => void
  /** Phones/tablets: toggles the right-panel drawer (the column is hidden below lg) */
  onTogglePanel?: () => void
}) {
  const { t } = useI18n()
  const importFileRef = useRef<HTMLInputElement>(null)
  const doc = useStore((s) => s.doc)
  const clear = useStore((s) => s.clear)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  // phones/tablets swap the full bar for the mobile composition (nav + overflow menu)
  const isNarrow = useMediaQuery('(max-width: 1023px)')

  const dialogs = (
    <TopBarDialogs
      projectsOpen={projectsOpen}
      setupOpen={setupOpen}
      exportOpen={exportOpen}
      clearConfirm={clearConfirm}
      onCloseProjects={() => setProjectsOpen(false)}
      onCloseSetup={() => setSetupOpen(false)}
      onCloseExport={() => setExportOpen(false)}
      onCloseClearConfirm={() => setClearConfirm(false)}
      onClear={clear}
    />
  )
  const hiddenFileInput = (
    <input
      ref={importFileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onImportFile(file)
        e.target.value = ''
      }}
    />
  )

  if (isNarrow) {
    // mobile: nav + document state only — the tools live in the bottom strip (App),
    // rare actions hide behind the overflow menu
    return (
      <>
        <MobileHeader
          onSettings={() => setSetupOpen(true)}
          onTogglePanel={onTogglePanel}
          onMore={() => setMoreOpen((v) => !v)}
        />
        {moreOpen && (
          <TopBarMoreMenu
            onClose={() => setMoreOpen(false)}
            onProjects={() => setProjectsOpen(true)}
            onImport={() => importFileRef.current?.click()}
            onExport={() => setExportOpen(true)}
            onSettings={() => setSetupOpen(true)}
            onClear={() => setClearConfirm(true)}
          />
        )}
        {hiddenFileInput}
        {dialogs}
      </>
    )
  }

  return (
    <header className="border-line flex h-12 shrink-0 items-center gap-3 border-b px-3">
      <div className="flex shrink-0 items-center gap-2">
        {/* pixel-cluster logo: rounded 2×2 pixels with a dither dot in the middle */}
        <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" aria-hidden>
          <defs>
            <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#e879f9" />
            </linearGradient>
          </defs>
          <rect width="20" height="20" rx="5.5" fill="url(#logo-grad)" />
          <rect x="3.5" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".95" />
          <rect x="10.9" y="3.5" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".7" />
          <rect x="3.5" y="10.9" width="5.6" height="5.6" rx="1.7" fill="#fff" opacity=".55" />
          <circle cx="13.7" cy="13.7" r="2.8" fill="#fff" opacity=".85" />
          <rect x="9.2" y="9.2" width="1.6" height="1.6" rx=".55" fill="#fff" opacity=".9" />
        </svg>
        <span className="text-sm font-semibold tracking-wide">{t('app.title')}</span>
      </div>

      <TopBarProjectControls onSettings={() => setSetupOpen(true)} />

      <div className="flex shrink-0 items-center gap-1">
        <span
          className="border-line bg-chip text-muted flex h-7 items-center rounded-md border px-2 text-xs"
          title={`${t('top.sizePreset')} — ${t('canvas.size')}`}
        >
          {doc.cols} × {doc.rows}
        </span>
      </div>

      <TopBarDocumentButtons
        onProjects={() => setProjectsOpen(true)}
        onClear={() => setClearConfirm(true)}
      />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Tooltip label={`${t('top.panel')} — ${t('top.panel.desc')}`}>
          <IconButton plate title={t('top.panel')} className="lg:hidden" onClick={onTogglePanel}>
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              <path d="M10.5 2.5v3M10.5 9.5v3" />
            </svg>
          </IconButton>
        </Tooltip>
        <ImportPillButton onClick={() => importFileRef.current?.click()} />
        <ExportPillButton open={exportOpen} onToggle={() => setExportOpen((v) => !v)} />
        {/* theme and language: one icon each, dropdowns in top-bar-menus */}
        <ThemeMenu />
        <LangMenu />
        {hiddenFileInput}
      </div>

      {dialogs}
    </header>
  )
}
