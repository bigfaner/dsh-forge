// worktree-branch-management 1.7：扩展点注入装配（集成层实现——host 装配方，提案「架构
// 分层」右块 → 左块连线）。两扩展点在此实现并注入通用层（@dsh-forge/git-worktree）：
//   ① resolveProject(cwd)：归并实现——消费 core 身份归并结果（createGitIdentityPort 的
//      common dir realpath 锚 = 归并键）+ forgeProjects 行集（ws_path 归一比对）；cwd 同锚
//      的 projects 行即主项目归属（精确 ws_path 命中优先；存量双行仲裁归 core 注册链——
//      读面恒取首条锚命中行）。非 git / 无同锚行 / 任何失败 = null（fail-soft）。
//   ② getWorktreeDir(projectRoot)：worktree 存放目录提供者——projects.worktree_dir 列值
//      （每项目可配）。同步契约（扩展点签名 string 返回），列值经 refresh() 快照缓存
//      （装配期 + 每次 resolveProject 顺带刷新）；未命中退默认 `<root>/.forge/worktrees`。
// 注入缝：函数值扩展点不可经 YAML config 承载——cordis ctx 服务面唯一跨插件缝。
// 装配方 = boot/child.ts（runProfile 后 ctx.reflect.provide('forgeWorktreeIdentity', …)）；
// 插件侧惰性 reflect.get 消费（激活早于 provide 不受阻），缺席 = 插件退默认实现
//（独立 worktree 模式）。结构化类型本地声明——host 不 import 通用层包（零反向依赖）。
import { join } from 'node:path'
import { createGitIdentityPort } from '@dsh-forge/core'
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { Project, ProjectService, ProjectSummary } from '@dsh-forge/contracts'

/** core GitIdentityPort 归并键窄面（结构化本地声明——仅锚查询，零包类型依赖） */
interface GitAnchorFace {
  commonDirAnchor(dir: string): Promise<string | null>
}

/** 注入缝服务名（boot/child.ts provide ↔ 插件惰性 get——双侧同锚常量，各自本地声明） */
export const GIT_WORKTREE_IDENTITY_SERVICE = 'forgeWorktreeIdentity'

/** 路径归属解析结果（= 通用层 ProjectResolution 同形——结构化面零包依赖） */
export interface WorktreeProjectResolution {
  readonly projectId: string
  readonly projectRoot: string
  readonly isGit: boolean
}

/** 两扩展点覆写集（形状 = 通用层 GitWorktreeExtensionPointOverrides 同形） */
export interface WorktreeIdentityOverrides {
  resolveProject(cwd: string): Promise<WorktreeProjectResolution | null>
  getWorktreeDir(projectRoot: string): string
}

export interface WorktreeIdentityAssembly extends WorktreeIdentityOverrides {
  /** worktree_dir 列快照刷新（装配期一次 + resolveProject 顺带；返回刷新成败） */
  refresh(): Promise<boolean>
}

/** forgeProjects 消费窄面（bridge 代理 / 真服务结构兼容） */
export type ForgeProjectsIdentityFace = Pick<ProjectService, 'listProjects' | 'getProject'>

/**
 * 集成层扩展点实现（归并 resolveProject + worktree_dir 提供者）。
 * git 探针默认 core createGitIdentityPort（真机 git CLI）；单测可注入桩。
 */
export function createWorktreeIdentity(
  projects: ForgeProjectsIdentityFace,
  git: GitAnchorFace = createGitIdentityPort(),
  log: (message: string) => void = console.warn,
): WorktreeIdentityAssembly {
  // worktree_dir 列快照（normalizeFsPath(ws_path) → worktree_dir；同步提供者的取数缓存）
  let dirSnapshot = new Map<string, string>()

  const refresh = async (): Promise<boolean> => {
    try {
      const rows = await projects.listProjects()
      const next = new Map<string, string>()
      for (const row of rows) {
        // worktree_dir 列在 Project（getProject 读面）——Summary 不携带，逐行补读（行数 = 项目数，量级小）
        const full: Project | null = await projects.getProject(row.id).catch(() => null)
        if (full?.worktreeDir !== undefined && full.worktreeDir !== '') {
          next.set(normalizeFsPath(full.wsPath), full.worktreeDir)
        }
      }
      dirSnapshot = next
      return true
    } catch (cause) {
      log(`[git-worktree] worktree_dir 快照刷新失败（提供者退默认目录）：${String(cause)}`)
      return false
    }
  }

  const resolveProject = async (cwd: string): Promise<WorktreeProjectResolution | null> => {
    try {
      const anchor = await git.commonDirAnchor(cwd)
      if (anchor === null) return null // 非 git / git 缺席 / 探测失败 → 能力位 false（fail-soft）
      const anchorKey = normalizeFsPath(anchor)
      const rows: readonly ProjectSummary[] = await projects.listProjects().catch(() => [])
      let hit: ProjectSummary | undefined
      for (const row of rows) {
        // 精确命中（cwd 即注册根）短路——退路 = 同锚首行（存量双行归 core 注册链仲裁归档，读面不重判）
        if (normalizeFsPath(row.wsPath) === normalizeFsPath(cwd)) {
          hit = row
          break
        }
        const rowAnchor = await git.commonDirAnchor(row.wsPath)
        if (rowAnchor !== null && normalizeFsPath(rowAnchor) === anchorKey) {
          hit ??= row
        }
      }
      if (hit === undefined) return null // 无同锚活跃行 → 归并失效（未注册仓库）
      await refresh().catch(() => false) // 顺带刷新目录快照（同步提供者取数缓存——随归并自愈）
      return { projectId: hit.id, projectRoot: hit.wsPath, isGit: true }
    } catch (cause) {
      log(`[git-worktree] resolveProject 归并失败（fail-soft null）：${String(cause)}`)
      return null
    }
  }

  const getWorktreeDir = (projectRoot: string): string =>
    dirSnapshot.get(normalizeFsPath(projectRoot)) ?? join(projectRoot, '.forge', 'worktrees')

  return { resolveProject, getWorktreeDir, refresh }
}
