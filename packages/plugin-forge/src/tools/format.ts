// tool 返回面双友好模板——单源下沉锚（plugin-spec 1.4：实现迁 lib/api src/tools/format.ts，
// 本文件 = 旧位 re-export 兼容面——消费方 import 面零改动，contracts 归并同款先例）。
// 新消费面一律直接 import '@dsh-forge/lib-api'（或子路径 ./tools/format）。
export {
  callToolFace,
  errorCodeOf,
  FORGE_TOOL_FAILURE_SCHEMA,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  withFailureVariant,
} from '@dsh-forge/lib-api'
export type { ForgeToolFailure, TextContentBlock } from '@dsh-forge/lib-api'
