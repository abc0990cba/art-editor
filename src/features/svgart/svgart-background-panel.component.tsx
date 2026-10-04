import type { ReactElement } from 'react'

import { mustHex, type Paint } from '../../engine/svgart/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Chip, Section } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'
import { PaintEditor } from './svgart-paint-editor.component.tsx'

/**
 * Scene background: none / solid / linear / radial. The background is a plain paint on a full-bleed
 * rect (the serializer's first element), so every option stays AI-safe.
 */
export function SvgArtBackgroundPanel(): ReactElement {
  const { t } = useI18n()
  const scene = useStore((s) => s.svgartScene)
  const updateScene = useStore((s) => s.updateSvgArtScene)
  const bg = scene.background
  const setBg = (paint: Paint | null): void => updateScene((s) => ({ ...s, background: paint }))

  const gradientFor = (kind: 'linear' | 'radial'): Paint => {
    const stops = [
      { offset: 0, color: mustHex('#ffffff'), alpha: 1 },
      { offset: 1, color: mustHex('#5b4a8a'), alpha: 1 },
    ]
    return kind === 'linear'
      ? {
          kind: 'linear',
          p1: { x: 0, y: 0 },
          p2: { x: scene.width, y: scene.height },
          stops,
          alpha: 1,
        }
      : {
          kind: 'radial',
          units: 'bbox',
          cx: 0.5,
          cy: 0.5,
          r: 0.7,
          fx: null,
          fy: null,
          stops,
          alpha: 1,
        }
  }

  return (
    <Section title={t('svgart.bg.section')} icon="canvas" defaultOpen>
      <div className="flex flex-wrap gap-1">
        <Chip active={bg === null} onClick={() => setBg(null)}>
          {t('svgart.bg.none')}
        </Chip>
        <Chip
          active={bg?.kind === 'solid'}
          onClick={() => setBg({ kind: 'solid', color: mustHex('#20242b'), alpha: 1 })}
        >
          {t('svgart.fill.solid')}
        </Chip>
        <Chip active={bg?.kind === 'linear'} onClick={() => setBg(gradientFor('linear'))}>
          {t('svgart.fill.linear')}
        </Chip>
        <Chip active={bg?.kind === 'radial'} onClick={() => setBg(gradientFor('radial'))}>
          {t('svgart.fill.radial')}
        </Chip>
      </div>
      {bg && <PaintEditor paint={bg} onChange={setBg} />}
    </Section>
  )
}
