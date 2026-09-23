/**
 * Node system entry point: registers every node family, then re-exports the core.
 * Adding a node family = a new file under `nodes/` + one `registerNodes` line here.
 */

import { registerNodes } from './registry'
import { SOURCE_NODES } from './nodes/sources'
import { TRANSFORM_NODES } from './nodes/transforms'
import { REPEAT_NODES } from './nodes/repeats'
import { RAMP_NODES } from './nodes/ramps'
import { STYLE_NODES } from './nodes/styles'

registerNodes([...SOURCE_NODES, ...TRANSFORM_NODES, ...REPEAT_NODES, ...RAMP_NODES, ...STYLE_NODES])

export * from './types'
export * from './context'
export * from './registry'
export * from './eval'
export * from './presets'
