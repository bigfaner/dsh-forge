// task-loop 插件目录键登记条目（目录键就近归属使用它的插件——forge-dirs-unification
// §2.2/§2.5）：task_loop.* 两键 = 某 spec 的任务循环运行时目录 + 其下的单个任务目录
// （基目录 project.runtime_dir 归 plugins/project——跨插件依赖经注册表解析，本插件不复制
// 项目键派生）。键与 host/forge-dirs.d.ts 声明合并逐一相同（satisfies Partial<ForgeDirs>
// 编译期受检）；description 与 forge_dirs 输出同源；resolve 纯函数零 IO。
// 装配期经根 scope `reflect.provide('dirKeys.task_loop', entries)` 登记——project 汇总工具
// 每次 forge_dirs / forge_resolve_path 查询时枚举 dirKeys.* 现取（本插件未装载 = 两键缺席）。
import { join } from "node:path";
import type { ForgeDirs } from "@dsh-forge/lib-path";

/** dirKeys.<声明方> 约定服务名（project 侧 anchors.ts DECLARED_DIR_KEYS_PREFIX 同前缀） */
export const TASK_LOOP_DIR_KEYS_SERVICE_NAME = "dirKeys.task_loop";

export const TASK_LOOP_DIR_ENTRIES = {
  "task_loop.runtime_dir": {
    description: "任务循环运行时目录",
    deps: ["project.runtime_dir"],
    params: ["slug"],
    resolve: (deps: { "project.runtime_dir": string }, params: { slug: string }): string =>
      join(deps["project.runtime_dir"], params.slug),
  },
  "task_loop.task_dir": {
    description: "任务目录",
    deps: ["task_loop.runtime_dir"],
    params: ["slug", "localId"],
    resolve: (deps: { "task_loop.runtime_dir": string }, params: { slug: string; localId: string }): string =>
      join(deps["task_loop.runtime_dir"], params.localId),
  },
} as const satisfies Partial<ForgeDirs>;

/** task_loop.* 键清单（登记序） */
export const TASK_LOOP_DIR_KEYS = ["task_loop.runtime_dir", "task_loop.task_dir"] as const;

/** task-loop 声明（dirKeys.task_loop 约定名下的条目对象） */
export const TASK_LOOP_DIRS_DECLARATION = {
  source: TASK_LOOP_DIR_KEYS_SERVICE_NAME,
  entries: TASK_LOOP_DIR_ENTRIES,
} as const;
