// 跨域零语义小件——lib 公共包归拢（plugin-project 1.2）后的兼容面：本体已 git mv
// 至 lib/util/src/err-message.ts，本文件仅 re-export（core 内部既有 import 面零改动；
// 兼容面随 core 归并退役任务一并收口）。
export { errMessage } from '@dsh-forge/lib-util'
