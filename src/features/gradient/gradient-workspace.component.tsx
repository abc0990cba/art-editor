import { useRef, useState, type DragEvent, type ReactElement } from 'react'

import type { GradientStats } from '../../engine/gradient/pipeline.ts'
import type { ImportBitmap } from '../../engine/import-image.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { decodeImageFile } from '../../shared/lib/decode-image.util.ts'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { Chip } from '../../shared/ui/index.tsx'
import { MobileSheet } from '../../shared/ui/mobile-sheet.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { GradientParamsPanel } from './gradient-params-panel.component.tsx'
import { GradientPreview } from './gradient-preview.component.tsx'
import { useGradientTrace } from './use-gradient-trace.hook.ts'

/**
 * The gradient mode workspace: preview center (original vs fitted SVG with a draggable divider, or
 * the ΔE heatmap) + parameter column on the right (desktop) or a slide-over drawer (mobile). Fully
 * independent from the pixel document: its own import, its own state slice, its own autosave — the
 * vector workspace pattern.
 */
export function GradientWorkspace(): ReactElement {
  const { t } = useI18n()
  useGradientTrace()
  const source = useStore((s) => s.gradientSource)
  const sourceName = useStore((s) => s.gradientSourceName)
  const result = useStore((s) => s.gradientResult)
  const status = useStore((s) => s.gradientStatus)
  const error = useStore((s) => s.gradientError)
  const setGradientSource = useStore((s) => s.setGradientSource)
  const [errorView, setErrorView] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const openFile = (file: File | Blob, name = ''): void => {
    void decodeImageFile(file)
      .then((bitmap) => setGradientSource(bitmap, name))
      .catch(() => {
        /* not a decodable image — ignore */
      })
  }

  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'))
    if (file) openFile(file, file.name)
  }

  const slug = sourceName
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '')

  const exportSvg = (): void => {
    if (!result) return
    download(
      new Blob([result.svg], { type: 'image/svg+xml' }),
      `gradient-${slug || 'trace'}-${stamp()}.svg`,
    )
  }

  const copySvg = async (): Promise<void> => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.svg)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const stats = result?.stats
  const kb = result ? Math.max(1, Math.round(new Blob([result.svg]).size / 1024)) : 0

  return (
    <div
      className="relative flex min-h-0 flex-1"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="bg-app relative flex min-w-0 flex-1 flex-col">
        <div className="border-line flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b px-2 max-lg:h-14">
          {source && result?.demap != null && (
            <Chip
              className="shrink-0 max-lg:min-h-11 max-lg:text-sm"
              active={errorView}
              title={t('gradient.view.errorHint')}
              onClick={() => setErrorView((v) => !v)}
            >
              {t('gradient.view.error')}
            </Chip>
          )}
          {status === 'tracing' && (
            <span className="text-muted text-overline animate-pulse">{t('gradient.tracing')}</span>
          )}
          {status === 'error' && (
            <span className="text-xs text-red-400">{t('gradient.error')}</span>
          )}
          {error !== null && status !== 'error' && (
            <span className="text-xs text-red-400">{error}</span>
          )}
          {stats && <StatsLine stats={stats} kb={kb} />}
          <GradientActions
            source={source}
            hasResult={!!result}
            copied={copied}
            onClear={() => setClearConfirm(true)}
            onReplace={() => fileRef.current?.click()}
            onExport={exportSvg}
            onCopy={() => void copySvg()}
          />
        </div>
        {source ? (
          <GradientPreview
            source={source}
            svg={result?.svg ?? null}
            demap={result?.demap ?? null}
            error={errorView}
            busy={status === 'tracing'}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cnEmpty(dragOver)}
          >
            <span className="text-body text-sm font-semibold">{t('gradient.empty.title')}</span>
            <span className="text-muted max-w-xs text-center text-xs">
              {t('gradient.empty.desc')}
            </span>
            <span className="text-muted text-xs">{t('gradient.source.drop')}</span>
          </button>
        )}
        <MobileParamsBar onOpen={() => setPanelOpen(true)} />
      </div>

      <aside className="border-line bg-panel hidden w-64 shrink-0 flex-col overflow-y-auto border-l lg:flex">
        <GradientParamsPanel />
      </aside>

      {panelOpen && <ParamsDrawer onClose={() => setPanelOpen(false)} />}

      {clearConfirm && (
        <ConfirmDialog
          title={t('gradient.confirm.clear.title')}
          message={t('gradient.confirm.clear.msg')}
          confirmLabel={t('gradient.source.clear')}
          cancelLabel={t('import.cancel')}
          onConfirm={() => setGradientSource(null)}
          onClose={() => setClearConfirm(false)}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) openFile(file, file.name)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Empty-state button styling; lights up while an image is dragged over. */
function cnEmpty(dragOver: boolean): string {
  return `text-muted hover:border-chip-line flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed transition ${
    dragOver ? 'border-accent-line bg-accent-soft' : 'border-transparent'
  }`
}

/** Toolbar action group: clear / replace / export / copy — touch-sized plates on phones. */
function GradientActions({
  source,
  hasResult,
  copied,
  onClear,
  onReplace,
  onExport,
  onCopy,
}: {
  source: ImportBitmap | null
  hasResult: boolean
  copied: boolean
  onClear: () => void
  onReplace: () => void
  onExport: () => void
  onCopy: () => void
}): ReactElement {
  const { t } = useI18n()
  const cls = 'shrink-0 max-lg:min-h-11 max-lg:text-sm'
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      {source && (
        <Chip className={cls} onClick={onClear} title={t('gradient.confirm.clear.msg')}>
          {t('gradient.source.clear')}
        </Chip>
      )}
      <Chip className={cls} onClick={onReplace}>
        {t('gradient.source.replace')}
      </Chip>
      <Chip
        className={cls}
        disabled={!hasResult}
        onClick={onExport}
        title={t('gradient.exportSvg.desc')}
      >
        {t('gradient.exportSvg')}
      </Chip>
      <Chip className={cls} disabled={!hasResult} onClick={onCopy}>
        {copied ? t('gradient.copied') : t('gradient.copySvg')}
      </Chip>
    </div>
  )
}

/** Mobile thumb zone: opens the full-screen params sheet (the vector workspace pattern). */
function MobileParamsBar({ onOpen }: { onOpen: () => void }): ReactElement {
  const { t } = useI18n()
  return (
    <div className="border-line bg-app flex h-14 shrink-0 items-center border-t px-2 lg:hidden">
      <Chip className="h-11 w-full gap-2" onClick={onOpen}>
        <svg
          viewBox="0 0 16 16"
          className="h-5 w-5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" />
          <circle cx="10.5" cy="4.5" r="1.6" />
          <circle cx="5.5" cy="11.5" r="1.6" />
        </svg>
        {t('gradient.params')}
      </Chip>
    </div>
  )
}

/** Mobile slide-over with the fit parameters and a pinned live preview. */
function ParamsDrawer({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useI18n()
  const source = useStore((s) => s.gradientSource)
  const svg = useStore((s) => s.gradientResult?.svg ?? null)
  const demap = useStore((s) => s.gradientResult?.demap ?? null)
  const busy = useStore((s) => s.gradientStatus === 'tracing')
  return (
    <MobileSheet title={t('gradient.params')} onClose={onClose}>
      {source && (
        <div className="border-line bg-panel h-48 shrink-0 border-b">
          <GradientPreview
            source={source}
            svg={svg}
            demap={demap}
            error={false}
            controls={false}
            busy={busy}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <GradientParamsPanel />
      </div>
    </MobileSheet>
  )
}

/** Compact result metrics in the workspace toolbar. */
function StatsLine({ stats, kb }: { stats: GradientStats; kb: number }): ReactElement {
  const { t } = useI18n()
  return (
    <span className="text-muted text-overline hidden shrink-0 md:inline">
      {stats.regions} {t('gradient.stats.regions')} · {stats.gradients}{' '}
      {t('gradient.stats.gradients')} · {stats.layers} {t('gradient.stats.layers')} · ΔE{' '}
      {stats.meanDE.toFixed(1)} · {stats.ms.toFixed(0)} {t('gradient.stats.ms')} · {kb}{' '}
      {t('gradient.stats.kb')}
    </span>
  )
}
