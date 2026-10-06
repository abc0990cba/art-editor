import { evalGraph, type EvalInput, type EvalOutput } from './eval.ts'
import type { Cells, Graph } from './types.ts'

interface MemoEntry {
  input: Cells
  palette: readonly string[]
  baseStyle: EvalInput['baseStyle']
  bw: number
  bh: number
  grid: EvalInput['grid']
  paletteLen: number
  out: EvalOutput
}

const memo = new WeakMap<Graph, MemoEntry>()

/**
 * EvalGraph with identity-keyed memoization. Scene rendering evaluates every graph object on every
 * rebuild (composite bake + per-layer geometry), and the graph/cells/style references are stable
 * between edits (tree mutations clone the object), so identity comparison on the graph, the input
 * ink, the base style, the dims and the palette array is enough to reuse the previous result
 * untouched. Saves the second full evaluation of unchanged parametric objects.
 */
export function evalGraphMemo(
  graph: Graph,
  base: EvalInput,
  input: Cells,
  palette: readonly string[],
): EvalOutput {
  const hit = memo.get(graph)
  if (
    hit &&
    hit.input === input &&
    hit.palette === palette &&
    hit.baseStyle === base.baseStyle &&
    hit.bw === base.bw &&
    hit.bh === base.bh &&
    hit.grid === base.grid &&
    hit.paletteLen === base.paletteLen
  ) {
    return hit.out
  }
  const out = evalGraph(graph, base, input)
  memo.set(graph, {
    input,
    palette,
    baseStyle: base.baseStyle,
    bw: base.bw,
    bh: base.bh,
    grid: base.grid,
    paletteLen: base.paletteLen,
    out,
  })
  return out
}
