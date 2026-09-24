/**
 * Node system entry point: registers every node family, then re-exports the core. Adding a node
 * family = a new file under `nodes/` + one `registerNodes` line here.
 */

import { CROWN_NODES } from './crown.node.ts'
import { RAMP_NODES } from './ramps.node.ts'
import { registerNodes } from './registry'
import { REPEAT_NODES } from './repeats.node.ts'
import { SOURCE_NODES } from './sources.node.ts'
import { STYLE_NODES } from './styles.node.ts'
import { TRANSFORM_NODES } from './transforms.node.ts'

registerNodes([
  ...CROWN_NODES,
  ...SOURCE_NODES,
  ...TRANSFORM_NODES,
  ...REPEAT_NODES,
  ...RAMP_NODES,
  ...STYLE_NODES,
])

export * from './types'
export * from './context'
export * from './registry'
export * from './eval'
export * from './presets'
export * from './params'
