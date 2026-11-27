// project 插件 ForgeDirs 声明合并（forge-dirs-unification §2.5）：四个插件键追加进
// @dsh-forge/lib-path 的 ForgeDirs 接口——成员键与 host/dirs/project-entries.ts 登记条目
// 逐一相同；写错键名/依赖在本包编译期即报错。插件之间不互相 import——本追加只对加载到
// 它的编译单元可见（plugins/knowledge/host/forge-dirs.d.ts 同款先例）。
// 顶层 import 使本文件为 module——declare module 即 augmentation（isolatedModules/
// verbatimModuleSyntax 下声明合并文件须有顶层 import/export 才进编译）。
import type { ForgeDirEntry } from "@dsh-forge/lib-path";

declare module "@dsh-forge/lib-path" {
  interface ForgeDirs {
    /** 项目运行时产物根目录（{forge.home}/projects/{项目键}——task_loop.* 的基目录） */
    "project.runtime_dir": ForgeDirEntry<["forge.home", "projectRoot"]>;
    /** 工作区文档根（{workspaceRoot}/.forge/docs） */
    "project.docs_dir": ForgeDirEntry<["workspaceRoot"]>;
    /** 探针目录（{workspaceRoot}/.forge/probes——一次性验证脚本与取证产物） */
    "project.probes_dir": ForgeDirEntry<["workspaceRoot"]>;
    /** Spike 目录（{workspaceRoot}/.forge/spikes——探索验证的结论与脚本） */
    "project.spikes_dir": ForgeDirEntry<["workspaceRoot"]>;
    /** 工作区临时区（{workspaceRoot}/.forge/tmp） */
    "project.tmp_dir": ForgeDirEntry<["workspaceRoot"]>;
    /** 工作区工作树（{workspaceRoot}/.forge/worktrees） */
    "project.worktrees_dir": ForgeDirEntry<["workspaceRoot"]>;
  }
}
