import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { TexturePreview } from './style-previews.component.tsx'
import type { StyleTarget } from './style-section.component.tsx'

/** Straight/cross chip row of the hatch effect (own component: keeps TextureSection small). */
function HatchStyleRow({ target }: { target: StyleTarget }) {
  const { t } = useI18n()
  const { texView, applyTexture } = target
  return (
    <div className="text-body flex flex-col gap-1 text-xs">
      <span title={t('texture.hatchStyle.desc')}>{t('texture.hatchStyle')}</span>
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['straight', 'texture.hatchStyle.straight'],
            ['cross', 'texture.hatchStyle.cross'],
          ] as const
        ).map(([style, key]) => (
          <Chip
            key={style}
            active={(texView.hatchStyle ?? 'straight') === style}
            title={t(`texture.hatchStyle.${style}.desc` as 'texture.hatchStyle.straight.desc')}
            onClick={() => applyTexture({ hatchStyle: style === 'straight' ? undefined : style })}
          >
            {t(key)}
          </Chip>
        ))}
      </div>
    </div>
  )
}

/** Pixel-texture section (square grids only): grain/grunge/halftone/hatch overlays. */
export function TextureSection({ target }: { target: StyleTarget }) {
  const { t } = useI18n()
  const { texView, applyTexture } = target
  const isScreen = texView.effect === 'halftone' || texView.effect === 'hatch'

  return (
    <Section title={t('panel.texture')} icon="texture">
      <TexturePreview />
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['none', 'texture.none'],
            ['grain', 'texture.grain'],
            ['grunge', 'texture.grunge'],
            ['halftone', 'texture.halftone'],
            ['hatch', 'texture.hatch'],
          ] as const
        ).map(([effect, key]) => (
          <Chip
            key={effect}
            active={texView.effect === effect}
            title={t(`texture.${effect}.desc` as 'texture.grain.desc')}
            onClick={() =>
              applyTexture(effect === 'halftone' ? { effect, shape: 'dot' } : { effect })
            }
          >
            {t(key)}
          </Chip>
        ))}
      </div>
      {texView.effect !== 'none' && (
        <>
          <Slider
            label={t('texture.amount')}
            title={t('texture.amount.desc')}
            value={texView.amount}
            min={0}
            max={100}
            onChange={(v) => applyTexture({ amount: v })}
          />
          {isScreen ? (
            <>
              <Slider
                label={t('texture.htAngle')}
                title={t('texture.htAngle.desc')}
                value={texView.angle}
                min={0}
                max={180}
                step={5}
                display={(v) => `${Math.round(v)}°`}
                onChange={(v) => applyTexture({ angle: v })}
              />
              {texView.effect === 'halftone' ? (
                <div className="text-body flex flex-col gap-1 text-xs">
                  <span title={t('texture.htLattice.desc')}>{t('texture.htLattice')}</span>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        ['grid', 'texture.htLattice.grid'],
                        ['hex', 'texture.htLattice.hex'],
                        ['rings', 'texture.htLattice.rings'],
                        ['sunburst', 'texture.htLattice.sunburst'],
                        ['spiral', 'texture.htLattice.spiral'],
                        ['phyllotaxis', 'texture.htLattice.phyllotaxis'],
                        ['scatter', 'texture.htLattice.scatter'],
                      ] as const
                    ).map(([lattice, key]) => (
                      <Chip
                        key={lattice}
                        active={(texView.htLattice ?? 'grid') === lattice}
                        title={t(
                          `texture.htLattice.${lattice}.desc` as 'texture.htLattice.grid.desc',
                        )}
                        onClick={() =>
                          applyTexture({ htLattice: lattice === 'grid' ? undefined : lattice })
                        }
                      >
                        {t(key)}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : (
                <HatchStyleRow target={target} />
              )}
            </>
          ) : (
            <>
              <div className="text-body flex flex-col gap-1 text-xs">
                <span title={t('texture.dist.desc')}>{t('texture.dist')}</span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['scatter', 'texture.dist.scatter'],
                      ['clumps', 'texture.dist.clumps'],
                      ['streaks', 'texture.dist.streaks'],
                      ['perlin', 'texture.dist.perlin'],
                      ['voronoi', 'texture.dist.voronoi'],
                      ['waves', 'texture.dist.waves'],
                      ['sunburst', 'texture.dist.sunburst'],
                      ['spiral', 'texture.dist.spiral'],
                      ['honeycomb', 'texture.dist.honeycomb'],
                      ['scales', 'texture.dist.scales'],
                      ['weave', 'texture.dist.weave'],
                      ['checker', 'texture.dist.checker'],
                      ['fade', 'texture.dist.fade'],
                      ['bayer', 'texture.dist.bayer'],
                    ] as const
                  ).map(([dist, key]) => (
                    <Chip
                      key={dist}
                      active={texView.dist === dist}
                      title={t(`texture.dist.${dist}.desc` as 'texture.dist.scatter.desc')}
                      onClick={() => applyTexture({ dist })}
                    >
                      {t(key)}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="text-body flex flex-col gap-1 text-xs">
                <span title={t('texture.shape.desc')}>{t('texture.shape')}</span>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['square', 'texture.shape.square'],
                      ['dot', 'texture.shape.dot'],
                      ['chip', 'texture.shape.chip'],
                      ['triangle', 'texture.shape.triangle'],
                      ['diamond', 'texture.shape.diamond'],
                      ['cross', 'texture.shape.cross'],
                      ['star', 'texture.shape.star'],
                      ['hex', 'texture.shape.hex'],
                      ['ring', 'texture.shape.ring'],
                      ['dash', 'texture.shape.dash'],
                    ] as const
                  ).map(([shape, key]) => (
                    <Chip
                      key={shape}
                      active={texView.shape === shape}
                      title={t(`texture.shape.${shape}.desc` as 'texture.shape.square.desc')}
                      onClick={() => applyTexture({ shape })}
                    >
                      {t(key)}
                    </Chip>
                  ))}
                </div>
              </div>
              {texView.dist === 'streaks' && (
                <Slider
                  label={t('texture.angle')}
                  title={t('texture.angle.desc')}
                  value={texView.angle}
                  min={0}
                  max={180}
                  step={5}
                  display={(v) => `${Math.round(v)}°`}
                  onChange={(v) => applyTexture({ angle: v })}
                />
              )}
            </>
          )}
          <Slider
            label={t('texture.scale')}
            title={t('texture.scale.desc')}
            value={texView.scale}
            min={0.1}
            max={8}
            step={0.05}
            display={(v) => `${v.toFixed(2)}×`}
            onChange={(v) => applyTexture({ scale: v })}
          />
          {isScreen ? (
            <>
              <Slider
                label={t('texture.ramp')}
                title={t('texture.ramp.desc')}
                value={texView.ramp}
                min={0}
                max={100}
                onChange={(v) => applyTexture({ ramp: v })}
              />
              {texView.effect === 'halftone' && (
                <>
                  <div className="text-muted text-label font-medium tracking-wider uppercase">
                    {t('texture.distress')}
                  </div>
                  <Slider
                    label={t('texture.jitter')}
                    title={t('texture.jitter.desc')}
                    value={texView.jitter}
                    min={0}
                    max={100}
                    onChange={(v) => applyTexture({ jitter: v })}
                  />
                  <Slider
                    label={t('texture.variation')}
                    title={t('texture.variation.desc')}
                    value={texView.variation}
                    min={0}
                    max={100}
                    onChange={(v) => applyTexture({ variation: v })}
                  />
                  <Slider
                    label={t('texture.merge')}
                    title={t('texture.merge.desc')}
                    value={texView.merge}
                    min={0}
                    max={100}
                    onChange={(v) => applyTexture({ merge: v })}
                  />
                </>
              )}
              <Slider
                label={t('texture.wobble')}
                title={t('texture.wobble.desc')}
                value={texView.wobble}
                min={0}
                max={100}
                onChange={(v) => applyTexture({ wobble: v })}
              />
              <Slider
                label={t('texture.dropout')}
                title={t('texture.dropout.desc')}
                value={texView.dropout}
                min={0}
                max={100}
                onChange={(v) => applyTexture({ dropout: v })}
              />
              {texView.effect === 'halftone' && (
                <Slider
                  label={t('texture.spray')}
                  title={t('texture.spray.desc')}
                  value={texView.spray}
                  min={0}
                  max={100}
                  onChange={(v) => applyTexture({ spray: v })}
                />
              )}
            </>
          ) : (
            <>
              <Slider
                label={t('texture.sizeMin')}
                title={t('texture.sizeMin.desc')}
                value={Math.round(texView.sizeMin * 100)}
                min={5}
                max={60}
                display={(v) => `${Math.round(v)}%`}
                onChange={(v) =>
                  applyTexture({ sizeMin: Math.min(v, texView.sizeMax * 100) / 100 })
                }
              />
              <Slider
                label={t('texture.sizeMax')}
                title={t('texture.sizeMax.desc')}
                value={Math.round(texView.sizeMax * 100)}
                min={5}
                max={60}
                display={(v) => `${Math.round(v)}%`}
                onChange={(v) =>
                  applyTexture({ sizeMax: Math.max(v, texView.sizeMin * 100) / 100 })
                }
              />
              {texView.effect === 'grunge' && (
                <Slider
                  label={t('texture.edge')}
                  title={t('texture.edge.desc')}
                  value={texView.edge}
                  min={0}
                  max={100}
                  onChange={(v) => applyTexture({ edge: v })}
                />
              )}
              <CheckRow
                label={t('texture.even')}
                title={t('texture.even.desc')}
                checked={texView.even}
                onChange={(v) => applyTexture({ even: v })}
              />
            </>
          )}
          <div className="text-body flex items-center justify-between text-xs">
            <span title={t('texture.gapMode.desc')}>{t('texture.gapMode')}</span>
            <div className="flex gap-1">
              {(['cell', 'figure'] as const).map((m) => (
                <Chip
                  key={m}
                  active={texView.gapMode === m}
                  title={t(`texture.gapMode.${m}.desc` as 'texture.gapMode.cell.desc')}
                  onClick={() => applyTexture({ gapMode: m })}
                >
                  {t(`texture.gapMode.${m}` as 'texture.gapMode.cell')}
                </Chip>
              ))}
            </div>
          </div>
          <Slider
            label={t('texture.gap')}
            title={t('texture.gap.desc')}
            value={Math.round(texView.gap * 100)}
            min={0}
            max={45}
            display={(v) => `${Math.round(v)}%`}
            onChange={(v) => applyTexture({ gap: v / 100 })}
          />
          <div className="text-body flex items-center justify-between text-xs">
            <span title={t('texture.seed.desc')}>{t('texture.seed')}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted tabular-nums">{texView.seed}</span>
              <Chip
                title={t('texture.randomize.desc')}
                onClick={() => applyTexture({ seed: 1 + Math.floor(Math.random() * 9999) })}
              >
                {t('texture.randomize')}
              </Chip>
            </div>
          </div>
        </>
      )}
    </Section>
  )
}
