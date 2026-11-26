// knowledge 插件 ForgeDirs 声明合并（forge-dirs-unification §2.5）：两个插件键追加进
// @dsh-forge/lib-path 的 ForgeDirs 接口——成员键与 host/index.ts 运行期登记
// （KNOWLEDGE_DIR_ENTRIES，dirKeys.knowledge provide）逐一相同；写错键名/依赖在本包
// 编译期即报错。插件之间不互相 import——本追加只对加载到它的编译单元可见。
// 顶层 import 使本文件为 module——declare module 即 augmentation（task-loop
// remote-error-codes.d.ts 同款先例；isolatedModules/verbatimModuleSyntax 下声明合并
// 文件须有顶层 import/export 才进编译）。
import type { ForgeDirEntry } from "@dsh-forge/lib-path";

declare module "@dsh-forge/lib-path" {
  interface ForgeDirs {
    /** 项目知识库（{workspaceRoot}/.knowledge——conventions/lessons/examples 三类沉淀所在） */
    "knowledge.root": ForgeDirEntry<["workspaceRoot"]>;
    /** 全局知识库目录（{forge.home}/knowledge/global——只随 forge 根，不随库文件路径） */
    "knowledge.global": ForgeDirEntry<["forge.home"]>;
  }
}
