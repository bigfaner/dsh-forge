// 官方 RemoteErrorDetailsMap 增量（host 半 typed 失败抛出——RemoteError code 保真类型化）：
// 本插件 Remote 失败码族进官方码表（gateway rpcFailure 对 RemoteError 保真折叠 code 过 wire，
// client failure 分支承接）。export {} 使本文件为 module——declare module 即 augmentation
// （并入官方类型面，非整面覆写）。
export {};

declare module "@deepseek-ai/dsh-typert-protocol" {
  export interface RemoteErrorDetailsMap {
    "ERR_FORGE_TASKS_UNAVAILABLE": object;
    "ERR_FORGE_TASKS_PROJECT_UNRESOLVED": object;
  }
}
