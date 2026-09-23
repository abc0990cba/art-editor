import { useStore } from '../state/store'
import { useI18n } from '../i18n'
import { Chip, ColorInput } from './ui'

/**
 * Illustrator-style fill + stroke group shown atop every shape tool's settings: the
 * shape paints its interior (solid or the fill tool's current pattern) and its brush
 * outline as one object, with the outline placed inside, on, or outside the edge.
 */
export function ShapePaintControls({ fillable }: { fillable: boolean }) {
  const { t } = useI18n()
  const color = useStore((s) => s.color)
  const paint = useStore((s) => s.shapePaint)
  const patch = useStore((s) => s.patchShapePaint)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
      {fillable && (
        <div className="flex items-center justify-between text-xs text-body">
          <span title={t('paint.fill.desc')}>{t('paint.fill')}</span>
          <div className="flex gap-1">
            <Chip active={paint.fill === 'none'} title={t('paint.fill.none.desc')} onClick={() => patch({ fill: 'none' })}>
              {t('paint.fill.none')}
            </Chip>
            <Chip active={paint.fill === 'solid'} title={t('paint.fill.solid.desc')} onClick={() => patch({ fill: 'solid' })}>
              {t('paint.fill.solid')}
            </Chip>
            <Chip active={paint.fill === 'pattern'} title={t('paint.fill.pattern.desc')} onClick={() => patch({ fill: 'pattern' })}>
              {t('paint.fill.pattern')}
            </Chip>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-body">
        <span title={t('paint.stroke.desc')}>{t('paint.stroke')}</span>
        <div className="flex gap-1">
          <Chip active={paint.stroke} title={t('paint.stroke.on.desc')} onClick={() => patch({ stroke: true })}>
            {t('paint.stroke.on')}
          </Chip>
          <Chip active={!paint.stroke} title={t('paint.stroke.off.desc')} onClick={() => patch({ stroke: false })}>
            {t('paint.stroke.off')}
          </Chip>
        </div>
      </div>
      {paint.stroke && (
        <>
          {fillable && (
            <div className="flex items-center justify-between text-xs text-body">
              <span title={t('paint.align.desc')}>{t('paint.align')}</span>
              <div className="flex gap-1">
                <Chip active={paint.align === 'inner'} title={t('paint.align.inner.desc')} onClick={() => patch({ align: 'inner' })}>
                  {t('paint.align.inner')}
                </Chip>
                <Chip active={paint.align === 'center'} title={t('paint.align.center.desc')} onClick={() => patch({ align: 'center' })}>
                  {t('paint.align.center')}
                </Chip>
                <Chip active={paint.align === 'outer'} title={t('paint.align.outer.desc')} onClick={() => patch({ align: 'outer' })}>
                  {t('paint.align.outer')}
                </Chip>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-body">
            <span title={t('paint.strokeColor.desc')}>{t('paint.strokeColor')}</span>
            <div className="flex items-center gap-1.5">
              <ColorInput
                value={paint.strokeColor || color}
                title={t('paint.strokeColor.desc')}
                onChange={(v) => patch({ strokeColor: v })}
              />
              {paint.strokeColor && paint.strokeColor.toLowerCase() !== color.toLowerCase() && (
                <button
                  type="button"
                  title={t('paint.strokeColor.reset')}
                  aria-label={t('paint.strokeColor.reset')}
                  onClick={() => patch({ strokeColor: '' })}
                  className="text-muted transition hover:text-body"
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 5h8M9.5 2.5L12 5l-2.5 2.5M13 11H5M6.5 8.5L4 11l2.5 2.5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {paint.fill === 'pattern' && (
        <p className="text-[10px] text-muted">{t('paint.patternHint')}</p>
      )}
    </div>
  )
}
