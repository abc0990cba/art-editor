/**
 * Node system entry point: registers every node family, then re-exports the core. Adding a node
 * family = a new file under `nodes/` + one `registerNodes` line here.
 */

import { BEZIER_NODES } from './bezier.node.ts'
import { CROWN_NODES } from './crown.node.ts'
import { GENERATOR_NODES } from './generators.node.ts'
import { HALFTONE_NODES } from './halftone.node.ts'
import { HATCH_NODES } from './hatch.node.ts'
import { RAMP_NODES } from './ramps.node.ts'
import { registerNodes } from './registry'
import { REPEAT_NODES } from './repeats.node.ts'
import { SOURCE_NODES } from './sources.node.ts'
import { STYLE_NODES } from './styles.node.ts'
import { TEXT_NODES } from './text.node.ts'
import { TRANSFORM_NODES } from './transforms.node.ts'
import { WARP_NODES } from './warp.node.ts'

registerNodes([
  ...CROWN_NODES,
  ...SOURCE_NODES,
  ...BEZIER_NODES,
  ...GENERATOR_NODES,
  ...TRANSFORM_NODES,
  ...WARP_NODES,
  ...REPEAT_NODES,
  ...RAMP_NODES,
  ...HALFTONE_NODES,
  ...HATCH_NODES,
  ...TEXT_NODES,
  ...STYLE_NODES,
])

export * from './types'
export * from './context'
export * from './registry'
export * from './eval'
export * from './presets'
export * from './params'
