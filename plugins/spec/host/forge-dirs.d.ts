// spec 插件 ForgeDirs 声明合并（forge-dirs-unification §2.5）：两个插件键追加进
// @dsh-forge/lib-path 的 ForgeDirs 接口——成员键与 host/forge-dir-entries.ts 登记条目
// 逐一相同；写错键名/依赖在本包编译期即报错。插件之间不互相 import——本追加只对加载到
// 它的编译单元可见（plugins/knowledge/host/forge-dirs.d.ts 同款先例）。
// 顶层 import 使本文件为 module——declare module 即 augmentation（isolatedModules/
// verbatimModuleSyntax 下声明合并文件须有顶层 import/export 才进编译）。
import type { ForgeDirEntry } from "@dsh-forge/lib-path";

declare module "@dsh-forge/lib-path" {
  interface ForgeDirs {
    /** 规格目录：{workspaceRoot}/.forge/specs/{slug}（spec.md 与 issues 回收卷宗所在） */
    "spec.dir": ForgeDirEntry<["workspaceRoot"], ["slug"]>;
    /** 任务卷宗目录：规格目录下 issues/{localId}（任务报告回收落点） */
    "spec.dossier_dir": ForgeDirEntry<["spec.dir"], ["slug", "localId"]>;
  }
}
