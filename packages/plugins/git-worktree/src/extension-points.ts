// @dsh-forge/git-worktree —— 扩展点契约声明与默认实现
// （提案「架构分层 · 扩展点契约」节：由调用方设定、均有默认值；
// 集成层注入归并实现与 worktree_dir 提供者，无注入时 = 独立 worktree 模式）。
import { join } from 'node:path'

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
 * 扩展点契约（通用层声明，集成层实现并注入）。
 * - `resolveProject(cwd)`：路径归属解析器——返回 null = 独立 worktree 模式（默认实现）；
 *   集成层注入 common dir 归并实现（含主 worktree 判定与存量双行仲裁）。
 * - `getWorktreeDir(projectRoot)`：worktree 存放目录提供者——默认
 *   ‹projectRoot›/.forge/worktrees/，调用方可设定（集成层注入 worktree_dir 列值）。
 */
export interface GitWorktreeExtensionPoints {
  resolveProject(cwd: string): Promise<ProjectResolution | null>
  getWorktreeDir(projectRoot: string): string
}

/** 扩展点注入项（均可选——缺省即用默认实现） */
export interface GitWorktreeExtensionPointOverrides {
  resolveProject?: (cwd: string) => Promise<ProjectResolution | null>
  getWorktreeDir?: (projectRoot: string) => string
}

/** 默认归属解析器：恒返回 null（独立 worktree 模式，无归并） */
export const defaultResolveProject = async (_cwd: string): Promise<ProjectResolution | null> => null

/** 默认 worktree 存放目录提供者：‹projectRoot›/.forge/worktrees/ */
export const defaultGetWorktreeDir = (projectRoot: string): string => join(projectRoot, '.forge', 'worktrees')

/** 组装扩展点：给定的覆写项优先，未给定的走默认实现 */
export function createDefaultExtensionPoints(overrides: GitWorktreeExtensionPointOverrides = {}): GitWorktreeExtensionPoints {
  return {
    resolveProject: overrides.resolveProject ?? defaultResolveProject,
    getWorktreeDir: overrides.getWorktreeDir ?? defaultGetWorktreeDir,
  }
}
