import { useState } from 'react'

import { useI18n } from '../i18n/i18n.provider.tsx'

/**
 * A built-in workspace preset as a thumbnail card: the preset's demo photo (free stock image), its
 * label, and a spinner while the demo image downloads. A photo that cannot load (offline) falls
 * back to a neutral placeholder. Same look in every workspace.
 */
export function PresetCard({
  label,
  image,
  loading = false,
  onClick,
}: {
  label: string
  image?: string
  loading?: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = !image || failedSrc === image
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="border-line bg-chip hover:border-accent-line relative overflow-hidden rounded-lg border text-left transition"
    >
      {broken ? (
        <div className="bg-chip-active aspect-[4/3] w-full" />
      ) : (
        <img
          src={image}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(image ?? null)}
          className="aspect-[4/3] w-full object-cover"
        />
      )}
      <span className="text-label absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 font-medium text-white/90">
        {label}
      </span>
      {loading && (
        <span className="bg-panel/60 absolute inset-0 flex items-center justify-center">
          <span className="border-accent-text h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
          <span className="sr-only">{t('workspace.processing')}</span>
        </span>
      )}
    </button>
  )
}
