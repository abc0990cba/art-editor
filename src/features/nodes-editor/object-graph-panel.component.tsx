import { useMemo, useRef, useState } from 'react'

import { findNode, type SceneObj } from '../../engine/core/scene.ts'
import {
  allNodes,
  emptyGraph,
  nodeDef,
  registryJSON,
  validateGraph,
  GRAPH_PRESETS,
  type AnyNodeDef,
  type GraphNode,
  type NodeKind,
  type NodeParamSpec,
  boundsWithValue,
  paramBounds,
  rerollGraphSeeds,
} from '../../engine/nodes/index.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { download } from '../../shared/lib/file-download.util.ts'
import { CheckRow, Chip, ColorInput, Section, Slider } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

const KIND_DOT: Record<NodeKind, string> = {
  source: 'bg-sky-400',
  mod: 'bg-amber-400',
  ramp: 'bg-fuchsia-400',
  style: 'bg-emerald-400',
}

function ParamControl({
  pkey,
  spec,
  value,
  onChange,
}: {
  pkey: string
  spec: NodeParamSpec
  value: unknown
  onChange: (v: number | string | boolean) => void
}) {
  const doc = useStore((s) => s.doc)
  const { t } = useI18n()
  if (spec.kind === 'number' || spec.kind === 'int') {
    const current = typeof value === 'number' ? value : spec.default
    // canvas-marked params (positions/sizes in cells) get their slider range from
    // the current grid (±15%); everything else keeps the schema bounds
    const eff = boundsWithValue(paramBounds(spec, doc) ?? { min: spec.min, max: spec.max }, current)
    return (
      <Slider
        label={pkey}
        value={current}
        min={eff.min}
        max={eff.max}
        step={spec.kind === 'int' ? 1 : (spec.step ?? 0.01)}
        editable
        int={spec.kind === 'int'}
        hardMin={spec.min}
        hardMax={spec.max}
        title={t('num.scrub')}
        onChange={onChange}
      />
    )
  }
  if (spec.kind === 'select') {
    return (
      <label className="text-body flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{pkey}</span>
        <select
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="border-line bg-chip focus:border-accent-line w-32 cursor-pointer rounded-md border px-1.5 py-1 text-xs outline-none"
        >
          {spec.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (spec.kind === 'hex') {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">{pkey}</span>
        <ColorInput value={String(value)} onChange={onChange} title={pkey} />
      </div>
    )
  }
  if (spec.kind === 'string') {
    return (
      <label className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">{pkey}</span>
        <input
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="border-line bg-chip focus:border-accent-line w-32 rounded-md border px-1.5 py-1 text-xs outline-none"
        />
      </label>
    )
  }
  return <CheckRow label={pkey} checked={value === true} onChange={onChange} />
}

/**
 * Always-visible node graph presets: clicking applies the recipe to the selected object, or creates
 * a fresh object for it when nothing is selected.
 */
export function NodePresetsPanel() {
  const { t } = useI18n()
  const applyGraphPreset = useStore((s) => s.applyGraphPreset)
  return (
    <Section title={t('graph.presets')} icon="nodes" contentClassName="max-h-64 overflow-y-auto">
      <div className="grid grid-cols-2 gap-1">
        {GRAPH_PRESETS.map((p) => (
          <Tooltip key={p.id} label={p.description}>
            <button
              type="button"
              onClick={() => applyGraphPreset(p.id)}
              className="border-line bg-chip text-body hover:border-chip-line hover:bg-chip-active w-full truncate rounded-md border px-1.5 py-1 text-xs transition"
            >
              {p.label}
            </button>
          </Tooltip>
        ))}
      </div>
      <p className="text-muted text-overline leading-snug">{t('graph.presets.hint')}</p>
    </Section>
  )
}

export function ObjectGraphPanel() {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const setObjectGraph = useStore((s) => s.setObjectGraph)
  const [addOp, setAddOp] = useState<string>('')
  const [importState, setImportState] = useState<{ error?: boolean; warnings?: string[] } | null>(
    null,
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const groups = useMemo(() => {
    const m = new Map<string, AnyNodeDef[]>()
    for (const def of allNodes()) {
      const arr = m.get(def.category) ?? []
      arr.push(def)
      m.set(def.category, arr)
    }
    return [...m.entries()]
  }, [])

  // exactly one selected paint object — the graph belongs to it
  const obj: SceneObj | null =
    selection.length === 1 && doc.layers
      ? (() => {
          const ref = findNode(doc.layers, selection[0])
          return ref && ref.item.kind === 'obj' ? ref.item : null
        })()
      : null

  if (selection.length !== 1 || !obj) return null
  const graph = obj.graph
  const update = (nodes: GraphNode[]) => setObjectGraph(obj.id, { graphVersion: 1, nodes })
  const updateParam = (nodeId: string, key: string, value: number | string | boolean) =>
    update(
      graph!.nodes.map((n) =>
        n.id === nodeId ? { ...n, params: { ...n.params, [key]: value } } : n,
      ),
    )
  const moveNode = (nodeId: string, dir: -1 | 1) => {
    const at = graph!.nodes.findIndex((n) => n.id === nodeId)
    const to = at + dir
    if (at === -1 || to < 0 || to >= graph!.nodes.length) return
    const nodes = [...graph!.nodes]
    ;[nodes[at], nodes[to]] = [nodes[to], nodes[at]]
    update(nodes)
  }
  const removeNode = (nodeId: string) => update(graph!.nodes.filter((n) => n.id !== nodeId))
  const addNode = (op: string) =>
    update([
      ...graph!.nodes,
      { id: `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, op, params: {} },
    ])

  const exportGraph = () =>
    download(
      new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' }),
      `object-${obj.id}-graph.json`,
    )
  const exportRegistry = () =>
    download(new Blob([registryJSON()], { type: 'application/json' }), 'node-registry.json')
  const importGraph = async (file: File) => {
    try {
      const res = validateGraph(JSON.parse(await file.text()))
      setImportState({ warnings: res.warnings })
      if (res.ok) setObjectGraph(obj.id, res.graph)
      else setImportState({ error: true, warnings: res.errors })
    } catch {
      setImportState({ error: true })
    }
  }

  return (
    <Section title={t('graph.section')} icon="nodes">
      <Tooltip label={t('graph.create.desc')}>
        <span className="text-muted text-xs">
          {obj.name || `${t('layers.defaultObject')} ${obj.id}`}
        </span>
      </Tooltip>
      {graph ? (
        <>
          <Chip onClick={() => useStore.getState().openNodeEditor()}>{t('editor.open')}</Chip>
          <div className="relative flex flex-col gap-2 pl-4">
            {graph.nodes.length > 0 && (
              <span
                aria-hidden
                className="bg-line pointer-events-none absolute top-2 bottom-2 left-[5px] w-px"
              />
            )}
            {graph.nodes.length === 0 && (
              <p className="text-muted text-label leading-snug">{t('graph.empty')}</p>
            )}
            {graph.nodes.map((node) => {
              const def = nodeDef(node.op)
              return (
                <div
                  key={node.id}
                  className={`border-line bg-chip relative rounded-md border p-2 ${
                    node.unknown ? 'opacity-50' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`border-line bg-panel absolute top-3 -left-[11px] h-2 w-2 rounded-full border ${
                      def ? KIND_DOT[def.kind] : ''
                    }`}
                  />
                  <div className="mb-1.5 flex items-center gap-1">
                    <span
                      className={`flex-1 truncate text-xs font-medium ${
                        node.unknown ? 'text-muted line-through' : 'text-body'
                      }`}
                      title={node.unknown ? t('graph.unknown') : def?.label}
                    >
                      {def?.label ?? node.op}
                    </span>
                    {node.unknown && (
                      <Tooltip label={t('graph.unknown')}>
                        <span className="text-overline text-amber-400">?</span>
                      </Tooltip>
                    )}
                    <Tooltip label={t('graph.up')}>
                      <button
                        type="button"
                        aria-label={t('graph.up')}
                        className="text-muted hover:text-body rounded px-1 text-xs transition"
                        onClick={() => moveNode(node.id, -1)}
                      >
                        ↑
                      </button>
                    </Tooltip>
                    <Tooltip label={t('graph.down')}>
                      <button
                        type="button"
                        aria-label={t('graph.down')}
                        className="text-muted hover:text-body rounded px-1 text-xs transition"
                        onClick={() => moveNode(node.id, 1)}
                      >
                        ↓
                      </button>
                    </Tooltip>
                    <Tooltip label={t('graph.remove')}>
                      <button
                        type="button"
                        aria-label={t('graph.remove')}
                        className="text-muted rounded px-1 text-xs transition hover:text-red-400"
                        onClick={() => removeNode(node.id)}
                      >
                        ✕
                      </button>
                    </Tooltip>
                  </div>
                  {def && (
                    <div className="flex flex-col gap-1.5">
                      {Object.entries(def.params).map(([pkey, spec]) => (
                        <ParamControl
                          key={pkey}
                          pkey={pkey}
                          spec={spec}
                          value={node.params[pkey] ?? spec.default}
                          onChange={(v) => updateParam(node.id, pkey, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-1">
            <Chip
              onClick={() => {
                const seeded = rerollGraphSeeds(graph, Math.random)
                update(seeded.nodes)
              }}
            >
              🎲 {t('graph.reroll')}
            </Chip>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={addOp}
              onChange={(e) => setAddOp(e.target.value)}
              aria-label={t('graph.addNode')}
              className="border-line bg-chip text-body focus:border-accent-line min-w-0 flex-1 cursor-pointer rounded-md border px-1.5 py-1 text-xs outline-none"
            >
              <option value="">{t('graph.addNode')}…</option>
              {groups.map(([category, defs]) => (
                <optgroup key={category} label={category}>
                  {defs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Chip
              onClick={() => {
                if (addOp) addNode(addOp)
                setAddOp('')
              }}
            >
              {t('graph.add')}
            </Chip>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Tooltip label={t('graph.registry.desc')}>
              <Chip onClick={exportRegistry}>{t('graph.registry')}</Chip>
            </Tooltip>
            <Chip onClick={exportGraph}>{t('graph.export')}</Chip>
            <Chip onClick={() => fileRef.current?.click()}>{t('graph.import')}</Chip>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importGraph(f)
                e.target.value = ''
              }}
            />
          </div>
          {importState?.error && <p className="text-xs text-red-400">{t('graph.import.bad')}</p>}
          {importState?.warnings && importState.warnings.length > 0 && (
            <p className="text-muted text-overline leading-snug">
              {importState.warnings.join(' · ')}
            </p>
          )}
        </>
      ) : (
        <Chip onClick={() => setObjectGraph(obj.id, emptyGraph())}>{t('graph.create')}</Chip>
      )}
    </Section>
  )
}
