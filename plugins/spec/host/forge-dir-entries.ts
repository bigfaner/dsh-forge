// spec 插件目录键登记条目（目录键就近归属使用它的插件——forge-dirs-unification §2.2/§2.5）：
// spec.* 两键 = 规格目录 + 其下的任务卷宗目录（task-loop 结算回收钩子经注册表取同一路径）。
// 键与 host/forge-dirs.d.ts 声明合并逐一相同（satisfies Partial<ForgeDirs> 编译期受检）；
// description 与 forge_dirs 输出同源；resolve 纯函数零 IO，deps 由注册表先解析。
// 装配期经根 scope `reflect.provide('dirKeys.spec', entries)` 登记——project 汇总工具每次
// forge_dirs / forge_resolve_path 查询时枚举 dirKeys.* 现取（本插件未装载 = 两键缺席）。
import { join } from "node:path";
import type { ForgeDirs } from "@dsh-forge/lib-path";

/** dirKeys.<声明方> 约定服务名（project 侧 anchors.ts DECLARED_DIR_KEYS_PREFIX 同前缀） */
export const SPEC_DIR_KEYS_SERVICE_NAME = "dirKeys.spec";

export const SPEC_DIR_ENTRIES = {
  "spec.dir": {
    description: "规格目录",
    deps: ["workspaceRoot"],
    params: ["slug"],
    resolve: (deps: { workspaceRoot: string }, params: { slug: string }): string =>
      join(deps.workspaceRoot, ".forge", "specs", params.slug),
  },
  "spec.dossier_dir": {
    description: "任务卷宗目录",
    deps: ["spec.dir"],
    params: ["slug", "localId"],
    resolve: (deps: { "spec.dir": string }, params: { slug: string; localId: string }): string =>
      join(deps["spec.dir"], "issues", params.localId),
  },
} as const satisfies Partial<ForgeDirs>;

/** spec.* 键清单（登记序） */
export const SPEC_DIR_KEYS = ["spec.dir", "spec.dossier_dir"] as const;

/** spec 声明（dirKeys.spec 约定名下的条目对象） */
export const SPEC_DIRS_DECLARATION = { source: SPEC_DIR_KEYS_SERVICE_NAME, entries: SPEC_DIR_ENTRIES } as const;
