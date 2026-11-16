// 参数防御收窄共享原语——单源下沉锚（plugin-spec 1.4：实现迁 lib/api src/tools/args.ts，
// 本文件 = 旧位 re-export 兼容面——消费方 import 面零改动，contracts 归并同款先例）。
// 新消费面一律直接 import '@dsh-forge/lib-api'（或子路径 ./tools/args）。
export {
  ToolArgsError,
  optionalBoolean,
  optionalEnum,
  optionalFraction,
  optionalNonNegativeInteger,
  optionalPair,
  optionalPositiveInteger,
  optionalString,
  optionalStringArray,
  requireArgsObject,
  requiredEnum,
  requiredString,
} from '@dsh-forge/lib-api'
