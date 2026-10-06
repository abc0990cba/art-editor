import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { CheckRow, Chip, Section, Slider } from '../../shared/ui/index.tsx'
import { useStore } from '../../state/editor.store.ts'

/**
 * The tracing-parameter section of the vector mode: outline (vtracer V1 port) and centerline
 * groups. The outline controls mirror the VTracer webapp's control surface — same order, same
 * slider ranges, same visibility rules (color sliders hide in B/W; corner/segment/splice show only
 * in spline mode).
 */

/** Labeled chip group for enum-ish parameter values. */
function EnumChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { v: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-xs">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Chip key={o.v} active={value === o.v} onClick={() => onChange(o.v)}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  )
}

export function TraceSection() {
  const { t } = useI18n()
  const params = useStore((s) => s.vectorParams)
  const patch = useStore((s) => s.patchVectorParams)
  return (
    <Section title={t('vector.trace.section')} icon="style" defaultOpen>
      <EnumChips
        label={t('vector.tracer')}
        value={params.tracer}
        options={[
          { v: 'outline', label: t('vector.tracer.outline') },
          { v: 'centerline', label: t('vector.tracer.centerline') },
        ]}
        onChange={(tracer) => patch({ tracer })}
      />
      <Slider
        label={t('vector.threshold')}
        title={t('vector.threshold.desc')}
        value={params.binaryThreshold}
        min={0}
        max={255}
        onChange={(binaryThreshold) => patch({ binaryThreshold })}
      />
      <CheckRow
        label={t('vector.invert')}
        checked={params.binaryInvert}
        onChange={(binaryInvert) => patch({ binaryInvert })}
      />
      {params.tracer === 'outline' ? <OutlineControls /> : <CenterlineControls />}
    </Section>
  )
}

/** Vtracer outline tracing: clustering + curve fitting, laid out like the webapp's panel. */
function OutlineControls() {
  const { t } = useI18n()
  const params = useStore((s) => s.vectorParams)
  const patch = useStore((s) => s.patchVectorParams)
  return (
    <>
      <EnumChips
        label={t('vector.colormode')}
        value={params.colorMode}
        options={[
          { v: 'color', label: t('vector.colormode.color') },
          { v: 'binary', label: t('vector.colormode.binary') },
        ]}
        onChange={(colorMode) => patch({ colorMode })}
      />
      <EnumChips
        label={t('vector.hierarchical')}
        value={params.hierarchical}
        options={[
          { v: 'stacked', label: t('vector.hierarchical.stacked') },
          { v: 'cutout', label: t('vector.hierarchical.cutout') },
          { v: 'mosaic', label: t('vector.hierarchical.mosaic') },
        ]}
        onChange={(hierarchical) => patch({ hierarchical })}
      />
      <Slider
        label={t('vector.speckle')}
        title={t('vector.speckle.desc')}
        value={params.filterSpeckle}
        min={1}
        max={16}
        onChange={(filterSpeckle) => patch({ filterSpeckle })}
      />
      {params.colorMode === 'color' && (
        <>
          <Slider
            label={t('vector.colorPrecision')}
            title={t('vector.colorPrecision.desc')}
            value={params.colorPrecision}
            min={1}
            max={8}
            onChange={(colorPrecision) => patch({ colorPrecision })}
          />
          <Slider
            label={t('vector.layerDifference')}
            title={t('vector.layerDifference.desc')}
            value={params.layerDifference}
            min={0}
            max={255}
            onChange={(layerDifference) => patch({ layerDifference })}
          />
        </>
      )}
      <EnumChips
        label={t('vector.mode')}
        value={params.mode}
        options={[
          { v: 'none', label: t('vector.mode.none') },
          { v: 'polygon', label: t('vector.mode.polygon') },
          { v: 'spline', label: t('vector.mode.spline') },
        ]}
        onChange={(mode) => patch({ mode })}
      />
      {params.mode === 'spline' && (
        <>
          <Slider
            label={t('vector.corner')}
            title={t('vector.corner.desc')}
            value={params.cornerThreshold}
            min={0}
            max={180}
            onChange={(cornerThreshold) => patch({ cornerThreshold })}
          />
          <Slider
            label={t('vector.length')}
            title={t('vector.length.desc')}
            value={params.lengthThreshold}
            min={3.5}
            max={10}
            step={0.5}
            onChange={(lengthThreshold) => patch({ lengthThreshold })}
          />
          <Slider
            label={t('vector.splice')}
            title={t('vector.splice.desc')}
            value={params.spliceThreshold}
            min={0}
            max={180}
            onChange={(spliceThreshold) => patch({ spliceThreshold })}
          />
          <Slider
            label={t('vector.iterations')}
            title={t('vector.iterations.desc')}
            value={params.maxIterations}
            min={1}
            max={30}
            onChange={(maxIterations) => patch({ maxIterations })}
          />
        </>
      )}
    </>
  )
}

/** Centerline stroke tracing (project addition): segment length plus stroke tuning. */
function CenterlineControls() {
  const { t } = useI18n()
  const params = useStore((s) => s.vectorParams)
  const patch = useStore((s) => s.patchVectorParams)
  return (
    <>
      <Slider
        label={t('vector.length')}
        title={t('vector.length.desc')}
        value={params.lengthThreshold}
        min={3.5}
        max={10}
        step={0.5}
        onChange={(lengthThreshold) => patch({ lengthThreshold })}
      />
      <Slider
        label={t('vector.minStroke')}
        value={params.minStrokeLength}
        min={0}
        max={64}
        onChange={(minStrokeLength) => patch({ minStrokeLength })}
      />
      <Slider
        label={t('vector.strokeWidth')}
        display={(v) => (v === 0 ? t('vector.strokeWidth.auto') : String(v))}
        value={params.strokeWidth}
        min={0}
        max={32}
        onChange={(strokeWidth) => patch({ strokeWidth })}
      />
    </>
  )
}
