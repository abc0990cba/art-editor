import { useEffect, useState } from 'react'

import { WARP_KINDS, type WarpKind } from '../../engine/effects/warp.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { SelectionWarpPopover } from './selection-warp-popover.component.tsx'
import type { TransformStaging } from './use-selection-transform.hook.ts'

/**
 * The selection bar's "More" panel, grouped like a vector editor's effect menu: warp presets (each
 * opens a live-preview popover) and one-click stylize ops. Rendered inside the floating action bar;
 * a click-away backdrop or Escape closes it.
 */
export function SelectionFxMenu({
  staging,
  onClose,
}: {
  staging: TransformStaging
  onClose: () => void
}) {
  const { t } = useI18n()
  const [warpKind, setWarpKind] = useState<WarpKind | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const stylize = (op: 'outline' | 'shadow' | 'glow') => {
    useStore.getState().stylizeSelection(op)
    onClose()
  }

  return (
    <>
      {/* click-away catcher; sits inside the bar's stacking context, under the panel */}
      <button
        type="button"
        aria-label={t('warp.cancel')}
        className="fixed inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="border-line bg-panel/95 absolute top-full left-0 z-20 mt-1 w-60 max-w-[calc(100vw-16px)] rounded-xl border p-2 shadow-lg backdrop-blur max-lg:w-72">
        {warpKind === null ? (
          <>
            <MenuTitle label={t('fx.warp')} />
            <div className="grid grid-cols-3 gap-1">
              {WARP_KINDS.map((k) => (
                <Chip key={k} onClick={() => setWarpKind(k)} className="max-lg:min-h-11">
                  {t(`warp.${k}`)}
                </Chip>
              ))}
            </div>
            <MenuTitle label={t('fx.stylize')} />
            <div className="grid grid-cols-3 gap-1">
              <Chip onClick={() => stylize('outline')} className="max-lg:min-h-11">
                {t('fx.outline')}
              </Chip>
              <Chip onClick={() => stylize('shadow')} className="max-lg:min-h-11">
                {t('fx.shadow')}
              </Chip>
              <Chip onClick={() => stylize('glow')} className="max-lg:min-h-11">
                {t('fx.glow')}
              </Chip>
            </div>
          </>
        ) : (
          <SelectionWarpPopover
            kind={warpKind}
            staging={staging}
            onBack={() => setWarpKind(null)}
            onClose={onClose}
          />
        )}
      </div>
    </>
  )
}

function MenuTitle({ label }: { label: string }) {
  return (
    <div className="text-muted text-overline px-0.5 pb-1 font-medium tracking-wide uppercase first:pt-0">
      {label}
    </div>
  )
}
