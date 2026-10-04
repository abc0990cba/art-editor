import { simplifyPath, smoothAll } from '../../engine/curves/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Slider } from '../../shared/ui/index.tsx'
import { useStore, type PenSnap } from '../../state/editor.store.ts'

const SNAPS: PenSnap[] = ['free', 'deg45', 'ortho']

/** Pen controls: stroke width, angle-snap chips, path actions and the gesture cheat-sheet. */
export function PenSettings() {
  const { t } = useI18n()
  const pen = useStore((s) => s.pen)
  const patchPen = useStore((s) => s.patchPen)
  const endPen = useStore((s) => s.endPen)
  const opts = useStore((s) => s.toolOpts)
  const patch = useStore((s) => s.patchToolOpts)
  const anchors = pen?.path.anchors.length ?? 0
  return (
    <>
      <Slider
        label={t('opt.penWidth')}
        title={t('opt.penWidth.desc')}
        value={opts.penWidth}
        min={1}
        max={16}
        int
        editable
        hardMin={1}
        hardMax={16}
        onChange={(v) => patch({ penWidth: v })}
      />
      <div className="flex flex-wrap gap-1" role="group" aria-label={t('opt.penSnap')}>
        {SNAPS.map((sn) => (
          <Chip
            key={sn}
            active={opts.penSnap === sn}
            onClick={() => patch({ penSnap: sn })}
            title={t('opt.penSnap.desc')}
          >
            {t(`opt.penSnap.${sn}`)}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip
          disabled={!pen || pen.path.closed || anchors < 2}
          onClick={() => pen && patchPen({ path: { ...pen.path, closed: true } })}
          title={t('pen.closePath.desc')}
        >
          {t('pen.closePath')}
        </Chip>
        <Chip
          disabled={anchors < 3}
          onClick={() => pen && patchPen({ path: smoothAll(pen.path) })}
          title={t('pen.smoothAll.desc')}
        >
          {t('pen.smoothAll')}
        </Chip>
        <Chip
          disabled={anchors < 3}
          onClick={() => pen && patchPen({ path: simplifyPath(pen.path) })}
          title={t('pen.simplify.desc')}
        >
          {t('pen.simplify')}
        </Chip>
        <Chip disabled={!pen} onClick={endPen} title={t('pen.clear.desc')}>
          {t('pen.clear')}
        </Chip>
      </div>
      <p className="text-muted text-overline">{t('pen.hint')}</p>
    </>
  )
}
