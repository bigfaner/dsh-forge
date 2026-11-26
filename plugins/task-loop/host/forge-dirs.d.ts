// task-loop 插件 ForgeDirs 声明合并（forge-dirs-unification §2.5）：两个插件键追加进
// @dsh-forge/lib-path 的 ForgeDirs 接口——成员键与 host/forge-dir-entries.ts 登记条目
// 逐一相同；写错键名/依赖在本包编译期即报错。插件之间不互相 import——本追加只对加载到
// 它的编译单元可见（plugins/knowledge/host/forge-dirs.d.ts 同款先例）。
// 跨插件依赖镜像：task_loop.runtime_dir 依赖 project.runtime_dir（正本 = plugins/project
// host/forge-dirs.d.ts）——本编译单元看不到 project 的声明合并，此处以完全相同的类型
// 镜像声明一个键（接口合并允许同型重复声明）；漂移由 tests/assembly 目录键契约测试钉住
// （project 条目 + task-loop 条目合并解析 ≡ 落盘派生）。
// 顶层 import 使本文件为 module——declare module 即 augmentation（isolatedModules/
// verbatimModuleSyntax 下声明合并文件须有顶层 import/export 才进编译）。
import type { ForgeDirEntry } from "@dsh-forge/lib-path";

declare module "@dsh-forge/lib-path" {
  interface ForgeDirs {
    /** 【镜像】项目运行时产物根目录（正本 = plugins/project）——task_loop.* 的基目录 */
    "project.runtime_dir": ForgeDirEntry<["forge.home", "projectRoot"]>;
    /** 任务循环运行时目录：{project.runtime_dir}/{slug}（dispatch.jsonl 派发日志与各任务目录所在） */
    "task_loop.runtime_dir": ForgeDirEntry<["project.runtime_dir"], ["slug"]>;
    /** 任务目录：{task_loop.runtime_dir}/{localId}（证据子文件夹与 resume.md 所在） */
    "task_loop.task_dir": ForgeDirEntry<["task_loop.runtime_dir"], ["slug", "localId"]>;
  }
}
