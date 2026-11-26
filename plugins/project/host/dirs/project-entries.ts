// project 插件目录键登记条目（目录键就近归属使用它的插件——forge-dirs-unification §2.2/§2.5）：
// project.* 四键 = 项目运行时产物目录（按项目主检出派生，task_loop.* 的基目录）+ 工作区三个
// 分区目录（.forge 初始化/审计的分区允许集由本键表派生——workspacePartitionsOf）。
// 键与 host/forge-dirs.d.ts 声明合并逐一相同（satisfies Partial<ForgeDirs> 编译期受检）；
// description 与 forge_dirs 输出同源；resolve 纯函数零 IO，deps 由注册表先解析。
// 本插件即 forge_dirs / forge_resolve_path 汇总工具所在——四键经 FORGE_DIRS_BASE_DECLARATION
// 之后的第二条声明直接并入（anchors.ts mergeDeclarations），不走 dirKeys.* 反射拉取。
import { join } from "node:path";
import { deriveDirName, type ForgeDirs } from "@dsh-forge/lib-path";

export const PROJECT_DIR_ENTRIES = {
  "project.runtime_dir": {
    description: "项目运行时产物根目录",
    deps: ["forge.home", "projectRoot"],
    resolve: (deps: { "forge.home": string; projectRoot: string }): string =>
      join(deps["forge.home"], "projects", deriveDirName(deps.projectRoot)),
  },
  "project.docs_dir": {
    description: "文档位置",
    deps: ["workspaceRoot"],
    resolve: (deps: { workspaceRoot: string }): string => join(deps.workspaceRoot, ".forge", "docs"),
  },
  "project.tmp_dir": {
    description: "工作区临时区",
    deps: ["workspaceRoot"],
    resolve: (deps: { workspaceRoot: string }): string => join(deps.workspaceRoot, ".forge", "tmp"),
  },
  "project.worktrees_dir": {
    description: "Worktree根目录",
    deps: ["workspaceRoot"],
    resolve: (deps: { workspaceRoot: string }): string => join(deps.workspaceRoot, ".forge", "worktrees"),
  },
} as const satisfies Partial<ForgeDirs>;

/** project.* 键清单（登记序） */
export const PROJECT_DIR_KEYS = ["project.runtime_dir", "project.docs_dir", "project.tmp_dir", "project.worktrees_dir"] as const;

/** project 声明（汇总工具合并序第二位——基座之后、dirKeys.* 拉取声明之前） */
export const PROJECT_DIRS_DECLARATION = {
  source: "project 插件（@dsh-forge/project）",
  entries: PROJECT_DIR_ENTRIES,
} as const;
