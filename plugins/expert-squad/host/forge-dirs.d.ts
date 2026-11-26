// expert-squad 插件 ForgeDirs 声明合并（forge-dirs-unification §2.5）：插件键追加进
// @dsh-forge/lib-path 的 ForgeDirs 接口——成员键与 host/index.ts 运行期登记
// （EXPERT_SQUAD_DIR_ENTRIES，dirKeys.expert_squad provide）逐一相同；写错键名/依赖
// 在本包编译期即报错。插件之间不互相 import——本追加只对加载到它的编译单元可见。
// 顶层 import 使本文件为 module——declare module 即 augmentation（task-loop
// remote-error-codes.d.ts 同款先例；isolatedModules/verbatimModuleSyntax 下声明合并
// 文件须有顶层 import/export 才进编译）。
import type { ForgeDirEntry } from "@dsh-forge/lib-path";

declare module "@dsh-forge/lib-path" {
  interface ForgeDirs {
    /** 用户层专家目录（{forge.home}/experts） */
    "expert_squad.experts": ForgeDirEntry<["forge.home"]>;
  }
}
