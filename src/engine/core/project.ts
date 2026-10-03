import type { Doc } from './doc'

export { serialize, encodeCellObj, type ProjectJSON } from './project-json.ts'
export { decodeCellObj } from './project-parse.ts'
import { deserializeInternal } from './project-parse.ts'

export function deserialize(data: unknown): Doc {
  return deserializeInternal(data)
}
