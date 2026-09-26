import { useEffect, useRef, useState } from 'react'

import { docExtent } from '../../engine/doc.ts'
import { autoPngSize, clampPngSide, renderPng } from '../../engine/png.ts'
import { deserialize, serialize } from '../../engine/project.ts'
import { buildSvg } from '../../engine/svg.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { FloatingPanel } from '../../shared/ui/floating-panel.component.tsx'
import { CheckRow, Chip } from '../../shared/ui/index.tsx'
import { Button } from '../../shared/ui/shadcn/button.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * Small popover anchored under the top bar's export button: SVG/PNG export with the size knobs,
 * plus project save/load. Closes on Escape, on the backdrop or on the X.
 */
export function ExportPopover({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const projectName = useStore((s) => s.projectName)
  const loadDoc = useStore((s) => s.loadDoc)
  const setCurrentProject = useStore((s) => s.setCurrentProject)
  const pngWidth = useStore((s) => s.pngWidth)
  const pngHeight = useStore((s) => s.pngHeight)
  const setPngWidth = useStore((s) => s.setPngWidth)
  const setPngHeight = useStore((s) => s.setPngHeight)
  const exportBg = useStore((s) => s.exportBg)
  const setExportBg = useStore((s) => s.setExportBg)

  const fileRef = useRef<HTMLInputElement>(null)
  const [loadError, setLoadError] = useState(false)
  const [lockAspect, setLockAspect] = useState(true)
  // text mirrors of the export inputs so typing stays responsive while values clamp
  const [wText, setWText] = useState<string | null>(null)
  const [hText, setHText] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const extent = docExtent(doc)
  const autoPng = autoPngSize(doc)
  const pngW = pngWidth ?? autoPng.width
  const pngH = pngHeight ?? autoPng.height

  const commitPngW = (raw: string) => {
    setWText(raw)
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) return
    const w = clampPngSide(n)
    setPngWidth(w)
    if (lockAspect && extent.w > 0) setPngHeight(clampPngSide((w * extent.h) / extent.w))
  }
  const commitPngH = (raw: string) => {
    setHText(raw)
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) return
    const h = clampPngSide(n)
    setPngHeight(h)
    if (lockAspect && extent.h > 0) setPngWidth(clampPngSide((h * extent.w) / extent.h))
  }

  // file name carries the project name when the user has set one
  const slug = projectName
    .trim()
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '')
  const base = slug ? `glyph-${slug}` : 'glyph'

  const onExportSvg = () => {
    download(
      new Blob([buildSvg(doc, { includeBg: exportBg })], { type: 'image/svg+xml' }),
      `${base}-${stamp()}.svg`,
    )
  }
  const onExportPng = async () => {
    const blob = await renderPng(doc, { width: pngW, height: pngH }, exportBg)
    download(blob, `${base}-${stamp()}.png`)
  }
  const onSave = () => {
    download(
      new Blob([JSON.stringify(serialize(doc))], { type: 'application/json' }),
      `${base}-project-${stamp()}.json`,
    )
  }
  const onLoad = async (file: File) => {
    try {
      loadDoc(deserialize(JSON.parse(await file.text())))
      // a JSON file is not the bound library project: detach so the next Save
      // creates a fresh entry instead of overwriting the previously open one
      setCurrentProject(null, projectName)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      {/* anchored under the export button; FloatingPanel pulls it back on-screen on
          short windows instead of letting it run past the bottom edge */}
      <FloatingPanel
        x={window.innerWidth - 288 - 12}
        y={56}
        className="border-line bg-raised fixed z-50 flex flex-col gap-2.5 rounded-xl border p-3 shadow-xl"
        style={{ width: 288 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-muted text-label font-semibold tracking-widest uppercase">
            {t('panel.export')}
          </span>
          <Tooltip label={t('dialog.close')}>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('dialog.close')}
              className="text-muted hover:text-body rounded p-0.5 transition"
            >
              <svg
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </Tooltip>
        </div>
        <CheckRow
          label={t('export.includeBg')}
          title={t('export.includeBg.desc')}
          checked={exportBg}
          onChange={setExportBg}
        />
        <div className="text-body flex items-center gap-1.5 text-xs">
          <Tooltip label={t('export.pngWidth.desc')}>
            <label className="border-line bg-chip flex min-w-0 flex-1 items-center gap-1 rounded-md border px-1.5 py-1">
              <span className="text-muted">W</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={wText ?? pngW}
                onChange={(e) => commitPngW(e.target.value)}
                onBlur={() => setWText(null)}
                className="text-body w-full min-w-0 bg-transparent text-right text-xs outline-none"
              />
            </label>
          </Tooltip>
          <span className="text-muted">×</span>
          <Tooltip label={t('export.pngHeight.desc')}>
            <label className="border-line bg-chip flex min-w-0 flex-1 items-center gap-1 rounded-md border px-1.5 py-1">
              <span className="text-muted">H</span>
              <input
                type="number"
                min={1}
                max={5000}
                value={hText ?? pngH}
                onChange={(e) => commitPngH(e.target.value)}
                onBlur={() => setHText(null)}
                className="text-body w-full min-w-0 bg-transparent text-right text-xs outline-none"
              />
            </label>
          </Tooltip>
          <Chip
            active={lockAspect}
            title={t('export.lock.desc')}
            onClick={() => setLockAspect((v) => !v)}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M6.5 9.5l3-3" />
              <path d="M5.2 7.8L3.9 9.1a2.1 2.1 0 003 3l1.3-1.3" />
              <path d="M10.8 8.2l1.3-1.3a2.1 2.1 0 00-3-3L7.8 5.2" />
            </svg>
          </Chip>
        </div>
        <p className="text-muted text-overline">
          {pngW}×{pngH} px · {t('export.maxSide')}
        </p>
        <Tooltip label={t('export.svg.desc')}>
          <Button type="button" onClick={onExportSvg} className="h-auto w-full px-3 py-1.5 text-xs">
            {t('export.svg')}
          </Button>
        </Tooltip>
        <Tooltip label={t('export.png.desc')}>
          <button
            type="button"
            onClick={onExportPng}
            className="border-line bg-chip hover:border-chip-line hover:text-body w-full rounded-md border px-3 py-1.5 transition"
          >
            {t('export.png')}
          </button>
        </Tooltip>
        <div className="bg-line h-px" />
        <div className="flex gap-2">
          <Tooltip label={t('export.save.desc')}>
            <button
              type="button"
              onClick={onSave}
              className="border-line bg-chip hover:border-chip-line hover:text-body w-full rounded-md border px-3 py-1.5 transition"
            >
              {t('export.save')}
            </button>
          </Tooltip>
          <Tooltip label={t('export.load.desc')}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="border-line bg-chip hover:border-chip-line hover:text-body w-full rounded-md border px-3 py-1.5 transition"
            >
              {t('export.load')}
            </button>
          </Tooltip>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onLoad(f)
              e.target.value = ''
            }}
          />
        </div>
        {loadError && <p className="text-xs text-red-400">{t('export.loadInvalid')}</p>}
      </FloatingPanel>
    </>
  )
}
