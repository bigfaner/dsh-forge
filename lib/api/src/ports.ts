// 服务缝契约单源（lib/api 定位条目：服务缝契约 `*Port`，type-only 落 lib/api——
// lib-merge-plan「子包分工」）。本文件只声明契约类型：零逻辑零依赖（定位铁律内）。

/** 路径归属解析结果（isGit 能力位由解析器结果派生，UI 只消费） */
export interface ProjectResolution {
  /** 归并目标项目的稳定标识（集成层锚定主项目行） */
  readonly projectId: string
  /** 项目根目录（主 worktree path，canonical 口径） */
  readonly projectRoot: string
  /** 能力位：cwd 是否处于 git 仓库 */
  readonly isGit: boolean
}

/**
 * worktree 归属解析服务缝（plugin-project 1.13——自 git-worktree extension-points 契约
 * seam 化升位）。双形态并列（code-design §6）：
 *   · 默认 provider：独立 worktree 模式（resolveProject 恒 null、目录 ‹root›/.forge/worktrees）；
 *   · host 注入 provider：集成层归并实现（读项目关系表）。
 * 注入在场即覆写、缺席退默认；劣形注入（provider 注册值非函数 / 实例化抛错 / 首调抛错）
 * 三形态 fail-soft 逐面退默认——守卫实现归消费侧（git-worktree extension-points seam）。
 */
export interface ProjectResolutionPort {
  /** 路径归属解析器：null = 独立 worktree 模式（默认 provider 语义） */
  resolveProject(cwd: string): Promise<ProjectResolution | null>
  /** worktree 存放目录提供者：默认 ‹projectRoot›/.forge/worktrees，调用方可设定 */
  getWorktreeDir(projectRoot: string): string
}
