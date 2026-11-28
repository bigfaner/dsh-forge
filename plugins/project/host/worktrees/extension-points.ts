// @dsh-forge/project · host/worktrees —— 归属解析 seam（plugin-project 1.13 seam 化）。
// 契约 = ProjectResolutionPort（lib/api type-only 单源）；本件承载双形态装配：
//   · 默认 provider：独立 worktree 模式（resolveProject 恒 null、目录 ‹root›/.forge/worktrees）；
//   · host 注入 provider：集成层归并实现（forgeWorktreeIdentity 服务缝——boot/child.ts
//     provide，读项目关系表；index.ts resolveExtensionPoints 惰性消费）。
// 劣形注入三形态（code-design §6 S1）fail-soft 逐面退默认：
//   ① provider 注册值非函数（形状校验拒收）；② 实例化/取值抛错（try/catch）；
//   ③ 首调抛错（调用期守卫退默认面）。
import { join } from 'node:path'
import type { ProjectResolution, ProjectResolutionPort } from '@dsh-forge/lib-api/ports'

/** 归属解析结果（lib/api 单源——兼容 re-export，消费面 import 零改动） */
export type { ProjectResolution }

/** 扩展点契约（= ProjectResolutionPort 同一——旧名兼容面，装配与测试 import 零改动） */
export type GitWorktreeExtensionPoints = ProjectResolutionPort

/** 扩展点注入项（均可选——缺省即用默认实现） */
export interface GitWorktreeExtensionPointOverrides {
  resolveProject?: (cwd: string) => Promise<ProjectResolution | null>
  getWorktreeDir?: (projectRoot: string) => string
}

/** 默认 provider · 归属解析器：恒返回 null（独立 worktree 模式，无归并） */
export const defaultResolveProject = async (_cwd: string): Promise<ProjectResolution | null> => null

/** 默认 provider · worktree 存放目录提供者：‹projectRoot›/.forge/worktrees/ */
export const defaultGetWorktreeDir = (projectRoot: string): string => join(projectRoot, '.forge', 'worktrees')

/** 首调守卫（劣形③）：注入面调用抛错 → fail-soft 退默认面（resolveProject 退 null） */
function guardResolveProject(
  injected: (cwd: string) => Promise<ProjectResolution | null>,
): (cwd: string) => Promise<ProjectResolution | null> {
  return async (cwd) => {
    try {
      return await injected(cwd)
    } catch {
      return defaultResolveProject(cwd) // 劣形③ fail-soft：首调抛错退独立模式
    }
  }
}

/** 首调守卫（劣形③）：注入面调用抛错 → fail-soft 退默认目录口径 */
function guardGetWorktreeDir(injected: (projectRoot: string) => string): (projectRoot: string) => string {
  return (projectRoot) => {
    try {
      return injected(projectRoot)
    } catch {
      return defaultGetWorktreeDir(projectRoot) // 劣形③ fail-soft：首调抛错退默认目录
    }
  }
}

/** 组装 ProjectResolutionPort：给定覆写（已过形状校验的注入面）优先，未给定的走默认 provider */
export function createDefaultExtensionPoints(overrides: GitWorktreeExtensionPointOverrides = {}): ProjectResolutionPort {
  return {
    resolveProject: overrides.resolveProject ?? defaultResolveProject,
    getWorktreeDir: overrides.getWorktreeDir ?? defaultGetWorktreeDir,
  }
}

/**
 * 注入 provider 形状校验 + 首调守卫（劣形①②③收口）：注册值非对象 = 整体缺席（劣形①）；
 * 逐面非函数 = 该面拒收（劣形①逐面收窄——一面劣形不影响另一面注入）；过检面经首调守卫
 * 包装（劣形③ fail-soft 退默认面）；取值过程抛错（劣形②）由调用方 try/catch 承担。
 */
export function adoptInjectedPort(raw: unknown): GitWorktreeExtensionPointOverrides | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const port = raw as Partial<ProjectResolutionPort>
  const adopted: GitWorktreeExtensionPointOverrides = {}
  if (typeof port.resolveProject === 'function') adopted.resolveProject = guardResolveProject(port.resolveProject.bind(port))
  if (typeof port.getWorktreeDir === 'function') adopted.getWorktreeDir = guardGetWorktreeDir(port.getWorktreeDir.bind(port))
  return adopted.resolveProject === undefined && adopted.getWorktreeDir === undefined ? undefined : adopted
}
