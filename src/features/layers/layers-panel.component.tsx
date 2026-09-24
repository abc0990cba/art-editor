import { useState } from 'react'

import { cellColor, type Doc } from '../../engine/doc.ts'
import { findNode, nodeProtected, type SceneItem, type SceneLayer } from '../../engine/scene.ts'
import { useI18n } from '../../shared/i18n/i18n.provider.tsx'
import { Section } from '../../shared/ui/index.tsx'
import { Tooltip } from '../../shared/ui/tooltip.component.tsx'
import { useStore } from '../../state/editor.store.ts'

/** Display rows of the layers tree, top of the canvas first (reverse tree order). */
interface Row {
  node: SceneLayer | SceneItem
  depth: number
}

function buildRows(layers: SceneLayer[]): Row[] {
  const out: Row[] = []
  const walk = (items: SceneItem[], depth: number) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      out.push({ node: item, depth })
      if (item.kind === 'group') walk(item.children, depth + 1)
    }
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    out.push({ node: layer, depth: 0 })
    walk(layer.children, 1)
  }
  return out
}

const eyeIcon = (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
  >
    <path d="M1.8 8s2.2-3.8 6.2-3.8S14.2 8 14.2 8s-2.2 3.8-6.2 3.8S1.8 8 1.8 8z" />
    <circle cx="8" cy="8" r="1.7" />
  </svg>
)
const eyeOffIcon = (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
  >
    <path d="M3 3l10 10M6.2 6.3A1.9 1.9 0 008 9.9M4.4 4.6C2.6 5.9 1.8 8 1.8 8s2.2 3.8 6.2 3.8c1 0 1.9-.2 2.7-.6M7 4.3c.3 0 .7-.1 1-.1 4 0 6.2 3.8 6.2 3.8s-.5.9-1.5 1.9" />
  </svg>
)
const lockIcon = (
  <svg
    viewBox="0 0 16 16"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
  >
    <rect x="3.5" y="7" width="9" height="6.2" rx="1.2" />
    <path d="M5.5 7V5.2a2.5 2.5 0 015 0V7" />
  </svg>
)

/** A color chip for an object row: the object's first painted cell color. */
function objSwatch(doc: Doc, style: SceneItem & { kind: 'obj' }): string | null {
  for (const [, v] of style.cells) return cellColor(doc, v)
  return null
}

export function LayersPanel() {
  const { t } = useI18n()
  const doc = useStore((s) => s.doc)
  const selection = useStore((s) => s.selection)
  const activeLayerId = useStore((s) => s.activeLayerId)
  const selectElements = useStore((s) => s.selectElements)
  const setActiveLayer = useStore((s) => s.setActiveLayer)
  const addLayer = useStore((s) => s.addLayer)
  const deleteLayer = useStore((s) => s.deleteLayer)
  const renameNode = useStore((s) => s.renameNode)
  const toggleNodeVisible = useStore((s) => s.toggleNodeVisible)
  const toggleNodeLocked = useStore((s) => s.toggleNodeLocked)
  const reorderNode = useStore((s) => s.reorderNode)
  const groupSelection = useStore((s) => s.groupSelection)
  const ungroupSelection = useStore((s) => s.ungroupSelection)
  const setFuseObjects = useStore((s) => s.setFuseObjects)
  const setStyleScope = useStore((s) => s.setStyleScope)

  const [renaming, setRenaming] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<{ id: number; place: 'before' | 'after' } | null>(null)

  const layers = doc.layers
  const rows = layers ? buildRows(layers) : []

  const defaultName = (node: SceneLayer | SceneItem): string => {
    if (node.kind === 'layer') {
      // display ordinal, not the node id: the first layer reads "Layer 1" even though
      // the id counter is shared with objects and groups
      const at = layers ? layers.findIndex((l) => l.id === node.id) : -1
      return `${t('layers.defaultLayer')} ${at >= 0 ? at + 1 : node.id}`
    }
    return node.kind === 'group'
      ? `${t('layers.defaultGroup')} ${node.id}`
      : `${t('layers.defaultObject')} ${node.id}`
  }

  if (!layers) {
    // legacy global-scope document: layers need per-element styles
    return (
      <Section title={t('panel.layers')} icon="layers">
        <p className="text-muted text-xs">{t('layers.scopeHint')}</p>
        <button
          type="button"
          className="border-chip-line bg-chip text-body hover:border-chip-line hover:bg-chip-active self-start rounded-md border px-2 py-1 text-xs"
          onClick={() => setStyleScope('element')}
        >
          {t('layers.switchScope')}
        </button>
      </Section>
    )
  }

  const rowClick = (node: SceneLayer | SceneItem) => {
    if (node.kind === 'layer') {
      setActiveLayer(node.id)
      return
    }
    if (nodeProtected(layers, node.id)) return
    if (node.kind === 'obj') {
      selectElements([node.id])
      const ref = findNode(layers, node.id)
      if (ref) setActiveLayer(ref.layer.id)
    }
  }

  return (
    <Section
      title={t('panel.layers')}
      icon="layers"
      defaultOpen
      contentClassName="max-h-72 overflow-y-auto"
    >
      <div className="flex flex-col gap-0.5">
        {rows.length > 0 && layers.every((l) => l.children.length === 0) && (
          <p className="text-muted px-1 pb-1 text-[11px] leading-snug">{t('layers.empty')}</p>
        )}
        {rows.map(({ node, depth }) => {
          const isObj = node.kind === 'obj'
          const protectedNode = nodeProtected(layers, node.id)
          const selected = isObj && selection.includes(node.id)
          const active = node.kind === 'layer' && node.id === activeLayerId
          const swatch = isObj ? objSwatch(doc, node) : null
          return (
            <div
              key={node.id}
              draggable={renaming !== node.id}
              onDragStart={() => setDragId(node.id)}
              onDragEnd={() => {
                setDragId(null)
                setDropAt(null)
              }}
              onDragOver={(e) => {
                if (dragId == null || dragId === node.id) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                const place = e.clientY < r.top + r.height / 2 ? 'before' : 'after'
                setDropAt({ id: node.id, place })
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId != null && dropAt && dropAt.id === node.id) {
                  // the panel lists top-first: display-before == tree-after
                  const place = dropAt.place === 'before' ? 'after' : 'before'
                  reorderNode(dragId, node.id, place)
                }
                setDragId(null)
                setDropAt(null)
              }}
              className={`group flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${
                selected
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : active
                    ? 'border-accent-line/60 bg-accent-soft/40 text-body'
                    : 'text-body hover:bg-chip-active border-transparent'
              } ${dropAt?.id === node.id ? (dropAt.place === 'before' ? 'border-t-accent-line' : 'border-b-accent-line') : ''} ${
                protectedNode ? 'opacity-50' : ''
              }`}
              style={{ paddingLeft: `${depth * 14 + 6}px` }}
            >
              <Tooltip label={node.visible ? t('layers.hide') : t('layers.show')}>
                <button
                  type="button"
                  aria-label={node.visible ? t('layers.hide') : t('layers.show')}
                  className={`shrink-0 rounded p-0.5 ${node.visible ? 'text-muted hover:text-body' : 'text-muted/50'}`}
                  onClick={() => toggleNodeVisible(node.id)}
                >
                  {node.visible ? eyeIcon : eyeOffIcon}
                </button>
              </Tooltip>
              {isObj && (
                <span
                  className="border-line h-2.5 w-2.5 shrink-0 rounded-sm border"
                  style={{ background: swatch ?? 'transparent' }}
                />
              )}
              {renaming === node.id ? (
                <input
                  autoFocus
                  defaultValue={node.name}
                  className="border-accent-line bg-app text-body min-w-0 flex-1 rounded border px-1 py-0.5 text-xs outline-none"
                  onBlur={(e) => {
                    renameNode(node.id, e.target.value.trim())
                    setRenaming(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  title={protectedNode ? t('layers.locked') : undefined}
                  onClick={() => rowClick(node)}
                  onDoubleClick={() => setRenaming(node.id)}
                >
                  {node.name || defaultName(node)}
                </button>
              )}
              {node.kind === 'layer' && confirmDelete === node.id ? (
                <button
                  type="button"
                  className="shrink-0 rounded border border-red-400 bg-red-500/10 px-1 text-[10px] text-red-400"
                  onClick={() => {
                    deleteLayer(node.id)
                    setConfirmDelete(null)
                  }}
                >
                  ✓
                </button>
              ) : (
                node.kind === 'layer' &&
                layers.length > 1 && (
                  <Tooltip label={t('layers.delete.desc')}>
                    <button
                      type="button"
                      aria-label={t('layers.delete')}
                      className="text-muted hover:text-body hidden shrink-0 rounded p-0.5 group-hover:block"
                      onClick={() => setConfirmDelete(node.id)}
                    >
                      ✕
                    </button>
                  </Tooltip>
                )
              )}
              <Tooltip label={node.locked ? t('layers.unlock') : t('layers.lock')}>
                <button
                  type="button"
                  aria-label={node.locked ? t('layers.unlock') : t('layers.lock')}
                  className={`shrink-0 rounded p-0.5 ${node.locked ? 'text-accent-text' : 'text-muted/0 group-hover:text-muted hover:text-body'}`}
                  onClick={() => toggleNodeLocked(node.id)}
                >
                  {lockIcon}
                </button>
              </Tooltip>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip label={t('layers.new.desc')}>
          <button
            type="button"
            aria-label={t('layers.new')}
            className="border-chip-line bg-chip text-body hover:bg-chip-active flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs"
            onClick={addLayer}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <path d="M8 3.2v9.6M3.2 8h9.6" />
            </svg>
            {t('layers.new')}
          </button>
        </Tooltip>
        <Tooltip label={t('layers.group.desc')}>
          <button
            type="button"
            aria-label={t('layers.group')}
            disabled={selection.length === 0}
            className="border-chip-line bg-chip text-body hover:bg-chip-active flex h-6 w-6 items-center justify-center rounded-md border disabled:opacity-40"
            onClick={groupSelection}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2.4 2" />
              <rect x="5" y="5" width="6" height="6" rx="1" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip label={t('layers.ungroup.desc')}>
          <button
            type="button"
            aria-label={t('layers.ungroup')}
            disabled={selection.length === 0}
            className="border-chip-line bg-chip text-body hover:bg-chip-active flex h-6 w-6 items-center justify-center rounded-md border disabled:opacity-40"
            onClick={ungroupSelection}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            >
              <rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2.4 2" />
              <path d="M5.5 8h5M8 5.5v5" strokeDasharray="1.6 1.6" />
            </svg>
          </button>
        </Tooltip>
      </div>

      <label className="text-body flex cursor-pointer items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={doc.fuseObjects}
          onChange={(e) => setFuseObjects(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-indigo-400"
        />
        <span>
          {t('layers.fuse')}
          <span className="text-muted mt-0.5 block text-[11px] leading-snug">
            {t('layers.fuse.desc')}
          </span>
        </span>
      </label>
    </Section>
  )
}
