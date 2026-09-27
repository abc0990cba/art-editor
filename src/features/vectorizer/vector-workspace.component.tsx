import { useRef, useState, type DragEvent } from 'react'

import type { TraceStats } from '../../engine/trace/trace.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { decodeImageFile } from '../../shared/lib/decode-image.util.ts'
import { download, stamp } from '../../shared/lib/file-download.util.ts'
import { ConfirmDialog } from '../../shared/ui/confirm-dialog.component.tsx'
import { Chip } from '../../shared/ui/index.tsx'
import { MobileSheet } from '../../shared/ui/mobile-sheet.component.tsx'
import { useStore } from '../../state/editor.store.ts'
import { useVectorTrace } from './use-vector-trace.hook.ts'
import { VectorParamsPanel } from './vector-params-panel.component.tsx'
import { VectorPreview, ViewToggle } from './vector-preview.component.tsx'

/**
 * The vector mode workspace: preview center (traced SVG vs original raster) + parameter column on
 * the right (desktop) or a slide-over drawer (mobile). Fully independent from the pixel document:
 * its own import, its own state slice, its own autosave.
 */
export function VectorWorkspace() {
  const { t } = useI18n()
  useVectorTrace()
  const source = useStore((s) => s.vectorSource)
  const sourceName = useStore((s) => s.vectorSourceName)
  const result = useStore((s) => s.vectorResult)
  const status = useStore((s) => s.vectorStatus)
  const error = useStore((s) => s.vectorError)
  const setVectorSource = useStore((s) => s.setVectorSource)
  const [view, setView] = useState<'result' | 'original'>('result')
  const [panelOpen, setPanelOpen] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const openFile = (file: File | Blob, name = ''): void => {
    void decodeImageFile(file)
      .then((bitmap) => setVectorSource(bitmap, name))
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

  const exportSvg = (): void => {
    if (!result) return
    const slug = sourceName
      .trim()
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
      .replaceAll(/^-+|-+$/g, '')
    download(
      new Blob([result.svg], { type: 'image/svg+xml' }),
      `vector-${slug || 'trace'}-${stamp()}.svg`,
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
        <div className="border-line flex h-10 shrink-0 items-center gap-2 overflow-x-auto border-b px-2">
          {source && <ViewToggle value={view} onChange={setView} />}
          {status === 'tracing' && (
            <span className="text-muted text-overline animate-pulse">{t('vector.tracing')}</span>
          )}
          {status === 'error' && <span className="text-xs text-red-400">{t('vector.error')}</span>}
          {error !== null && status !== 'error' && (
            <span className="text-xs text-red-400">{error}</span>
          )}
          {stats && <StatsLine stats={stats} kb={kb} />}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {source && (
              <Chip onClick={() => setClearConfirm(true)} title={t('vector.confirm.clear.msg')}>
                {t('vector.source.clear')}
              </Chip>
            )}
            <Chip onClick={() => fileRef.current?.click()}>{t('vector.source.replace')}</Chip>
            <Chip disabled={!result} onClick={exportSvg} title={t('vector.exportSvg.desc')}>
              {t('vector.exportSvg')}
            </Chip>
            <Chip disabled={!result} onClick={() => void copySvg()}>
              {copied ? t('vector.copied') : t('vector.copySvg')}
            </Chip>
          </div>
        </div>
        {source ? (
          <VectorPreview
            source={source}
            svg={result?.svg ?? null}
            showOriginal={view === 'original'}
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cnEmpty(dragOver)}
          >
            <span className="text-body text-sm font-semibold">{t('vector.empty.title')}</span>
            <span className="text-muted max-w-xs text-center text-xs">
              {t('vector.empty.desc')}
            </span>
            <span className="text-muted text-xs">{t('vector.source.drop')}</span>
          </button>
        )}
        {/* mobile: parameters in the thumb zone */}
        <MobileParamsBar onOpen={() => setPanelOpen(true)} />
      </div>

      <aside className="border-line bg-panel hidden w-64 shrink-0 flex-col overflow-y-auto border-l lg:flex">
        <VectorParamsPanel />
      </aside>

      {panelOpen && <ParamsDrawer onClose={() => setPanelOpen(false)} />}

      {clearConfirm && (
        <ConfirmDialog
          title={t('vector.confirm.clear.title')}
          message={t('vector.confirm.clear.msg')}
          confirmLabel={t('vector.source.clear')}
          cancelLabel={t('import.cancel')}
          onConfirm={() => setVectorSource(null)}
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

/**
 * Mobile thumb zone: a big whole-width button opening the full-screen params sheet — the vector
 * counterpart of the pixel tool strip's settings button (same sliders glyph).
 */
function MobileParamsBar({ onOpen }: { onOpen: () => void }) {
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
        {t('vector.params')}
      </Chip>
    </div>
  )
}

/**
 * Mobile slide-over with the tracing parameters (mirrors the pixel panel drawer). The live preview
 * stays pinned above the scrolling controls, so every slider change is visible while it is made —
 * no scrolling back and forth to check the result.
 */
function ParamsDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const source = useStore((s) => s.vectorSource)
  const svg = useStore((s) => s.vectorResult?.svg ?? null)
  return (
    <MobileSheet title={t('vector.params')} onClose={onClose}>
      {source && (
        <div className="border-line bg-panel h-48 shrink-0 border-b">
          <VectorPreview source={source} svg={svg} showOriginal={false} controls={false} />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <VectorParamsPanel />
      </div>
    </MobileSheet>
  )
}

/** Compact result metrics in the workspace toolbar (centerline shows strokes instead of paths). */
function StatsLine({ stats, kb }: { stats: TraceStats; kb: number }) {
  const { t } = useI18n()
  return (
    <span className="text-muted text-overline hidden shrink-0 md:inline">
      {stats.strokes > 0
        ? `${stats.strokes} ${t('vector.stats.strokes')}`
        : `${stats.clusters} ${t('vector.stats.clusters')} · ${stats.paths} ${t('vector.stats.paths')}`}{' '}
      · {stats.vertices} {t('vector.stats.vertices')} · {stats.ms.toFixed(0)} {t('vector.stats.ms')}{' '}
      · {kb} {t('vector.stats.kb')}
    </span>
  )
}
