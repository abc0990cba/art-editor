// Node builtins are safe here: *.bench.ts files are loaded only by the vitest bench runner
// (node), never by the app bundle.
// eslint-disable-next-line import/no-nodejs-modules
import { existsSync, readFileSync } from 'node:fs'
// eslint-disable-next-line import/no-nodejs-modules
import { fileURLToPath } from 'node:url'

import { bench, describe } from 'vitest'

import { floodBenchDoc } from './bench-doc.util.ts'
import { floodFillDoc, floodRegion } from './floodfill.ts'

/**
 * WASM spike (perf research W4, PERFLOG M6 follow-up): the flood-fill numeric core in Rust vs the
 * TS implementation. Raw cdylib, no bindings — build it with `cd bench/wasm-flood &&
 * RUSTC="$(rustup which rustc)" cargo build --release --target wasm32-unknown-unknown` (the
 * explicit RUSTC is needed on machines where Homebrew's rustc shadows the rustup toolchain).
 * Without the built module the WASM points skip and everything stays green.
 *
 * Point semantics: `restore` is the pristine→cells copy (the reset floor), `flood_fresh` is restore +
 * flood (the re-runnable iteration); core-only ≈ flood_fresh − restore.
 */

const WASM_URL = new URL(
  '../../bench/wasm-flood/target/wasm32-unknown-unknown/release/flood_wasm.wasm',
  import.meta.url,
)

interface FloodWasmExports {
  init: (len: number) => number
  pristine_offset: () => number
  restore: () => void
  flood: (bw: number, start: number, value: number) => number
  flood_fresh: (bw: number, start: number, value: number) => number
  memory: WebAssembly.Memory
}

async function loadWasm(): Promise<FloodWasmExports | null> {
  if (!existsSync(fileURLToPath(WASM_URL))) return null
  const { instance } = await WebAssembly.instantiate(readFileSync(fileURLToPath(WASM_URL)), {})
  return instance.exports as unknown as FloodWasmExports
}

const wasm = await loadWasm()

const { doc, start } = floodBenchDoc(2048, 2048, 0.15)
const CELLS = doc.cells
const LEN = CELLS.length
const BW = 2048
const VALUE = 2

/** Tuned TS variant: marks on push, no mask array, no per-cell neighbour arrays. */
function tunedFlood(cells: Uint16Array, bw: number, startIdx: number, value: number): Uint16Array {
  const out = cells.slice()
  const target = out[startIdx]
  if (target === value) return out
  const stack: number[] = [startIdx]
  out[startIdx] = value
  while (stack.length > 0) {
    const i = stack.pop() as number
    const x = i % bw
    if (x > 0 && out[i - 1] === target) {
      out[i - 1] = value
      stack.push(i - 1)
    }
    if (x + 1 < bw && out[i + 1] === target) {
      out[i + 1] = value
      stack.push(i + 1)
    }
    if (i >= bw && out[i - bw] === target) {
      out[i - bw] = value
      stack.push(i - bw)
    }
    if (i + bw < out.length && out[i + bw] === target) {
      out[i + bw] = value
      stack.push(i + bw)
    }
  }
  return out
}

if (wasm) {
  const cellsPtr = wasm.init(LEN)
  const pristinePtr = wasm.pristine_offset()
  const cellsView = (): Uint16Array => new Uint16Array(wasm.memory.buffer, cellsPtr, LEN)
  cellsView().set(CELLS)
  new Uint16Array(wasm.memory.buffer, pristinePtr, LEN).set(CELLS)
  const count = wasm.flood_fresh(BW, start, VALUE)
  const tsCount = floodRegion(doc, start).length
  const ok = count === tsCount && cellsView()[start] === VALUE
  cellsView().set(CELLS)
  if (!ok) throw new Error(`WASM flood mismatch: wasm ${count} vs TS ${tsCount}`)
}

describe('flood fill 2048², disc ~7% of the buffer', () => {
  bench(
    'TS floodFillDoc (region + slice + write)',
    () => {
      floodFillDoc(doc, start, VALUE)
    },
    { iterations: 12, warmupIterations: 2 },
  )
  bench(
    'TS floodRegion only (traversal)',
    () => {
      floodRegion(doc, start)
    },
    { iterations: 12, warmupIterations: 2 },
  )
  bench(
    'TS tuned spike: mark-on-push, no per-cell arrays (region + slice + write)',
    () => {
      tunedFlood(CELLS, BW, start, VALUE)
    },
    { iterations: 12, warmupIterations: 2 },
  )
})

describe.skipIf(!wasm)('WASM spike (rust cdylib, raw exports)', () => {
  bench(
    'restore: pristine→cells copy floor (8 MB)',
    () => {
      wasm!.restore()
    },
    { iterations: 20, warmupIterations: 2 },
  )
  bench(
    'flood_fresh: restore + flood core',
    () => {
      wasm!.flood_fresh(BW, start, VALUE)
    },
    { iterations: 20, warmupIterations: 2 },
  )
})
