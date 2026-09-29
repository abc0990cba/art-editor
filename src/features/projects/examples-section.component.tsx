import { useEffect, useState, type ReactElement } from 'react'

import { DEMO_PROJECTS, type DemoContent, type DemoDef } from '../../engine/demo-project.ts'
import { renderThumbnailDataURL } from '../../engine/png.ts'
import { deserialize } from '../../engine/project.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { materializeDemo } from '../../storage/demo-seed.ts'

/** Media demos have no document to render — their source raster becomes the preview. */
function rasterThumb(content: DemoContent): string {
  if (content.kind === 'pixel') return ''
  const { width, height, data } = content.source
  const src = new Uint8ClampedArray(data)
  const canvas = document.createElement('canvas')
  const scale = Math.max(1, Math.floor(Math.max(width, height) / 160))
  canvas.width = Math.floor(width / scale)
  canvas.height = Math.floor(height / scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const si = (y * scale * width + x * scale) * 4
      const di = (y * canvas.width + x) * 4
      img.data[di] = src[si]
      img.data[di + 1] = src[si + 1]
      img.data[di + 2] = src[si + 2]
      img.data[di + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/**
 * The home screen's «Примеры» row: the built-in demo projects across grid scales and workspace
 * kinds. Thumbnails render lazily after mount (one per tick — the 512-wide demo is not free); a
 * click materializes the demo into the library under its stable `demo.` id and opens it.
 */
export function ExamplesSection({ onOpen }: { onOpen: (id: string) => void }): ReactElement {
  const { t } = useI18n()
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  // demo.poster → examples.poster, demo.landscape → examples.landscape
  const label = (id: string): string =>
    t(`examples.${id.replace('demo.', '')}` as 'examples.poster')

  useEffect(() => {
    let alive = true
    const tick = (): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, 24)
      })
    void (async () => {
      for (const def of DEMO_PROJECTS) {
        if (!alive) return
        const content = def.build()
        let thumb = ''
        try {
          thumb =
            content.kind === 'pixel'
              ? renderThumbnailDataURL(deserialize(content.doc))
              : rasterThumb(content)
        } catch {
          /* no canvas — the placeholder stays */
        }
        if (alive && thumb) setThumbs((s) => ({ ...s, [def.id]: thumb }))
        await tick()
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const open = async (def: DemoDef): Promise<void> => {
    setBusy(def.id)
    try {
      const id = await materializeDemo(def, label(def.id))
      onOpen(id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-muted text-overline font-semibold tracking-widest uppercase">
        {t('home.examples')}
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-7">
        {DEMO_PROJECTS.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => void open(def)}
            disabled={busy === def.id}
            className="border-line bg-panel hover:border-accent-line flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition disabled:opacity-60 max-lg:min-h-11"
          >
            {thumbs[def.id] ? (
              <img src={thumbs[def.id]} alt="" className="aspect-[4/3] w-full object-contain" />
            ) : (
              <div className="bg-chip aspect-[4/3] w-full" />
            )}
            <span className="border-line text-muted border-t px-1.5 py-1 text-xs">
              <span className="text-body block truncate font-medium max-lg:text-sm">
                {label(def.id)}
              </span>
            </span>
          </button>
        ))}
      </div>
      <p className="text-muted text-overline leading-snug">{t('home.examples.hint')}</p>
    </section>
  )
}
