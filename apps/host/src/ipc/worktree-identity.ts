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

/** core GitIdentityPort 归并键窄面（结构化本地声明——锚查询 + worktree 清单，零包类型依赖） */
interface GitAnchorFace {
  commonDirAnchor(dir: string): Promise<string | null>
  /** 在场 worktree 清单（缺席 = 旧桩形状——git 域成员核验退主树判据单径） */
  worktrees?(dir: string): Promise<readonly { readonly path: string }[] | null>
}

/** 注入缝服务名（boot/child.ts provide ↔ 插件惰性 get——双侧同锚常量，各自本地声明） */
export const GIT_WORKTREE_IDENTITY_SERVICE = 'forgeWorktreeIdentity'

/** 路径归属解析结果（= 通用层 ProjectResolution 同形 + 项目名——工作区命名继承源） */
export interface WorktreeProjectResolution {
  readonly projectId: string
  readonly projectRoot: string
  readonly isGit: boolean
  /** 项目名（projects.name——hero 项目行同源；缺席 = 旧行形状） */
  readonly projectName?: string
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

  /**
   * git 域归属核验（bug bc81f4b8/57b494f5——非 git 注册项目被祖先仓锚误判为 git 项目的
   * 收口面）：git rev-parse 向上行走，非 git 目录落任一祖先 git 仓库内即得非空锚——锚
   * 命中不等于该目录受本仓库治理。判据（两条任一成立 = 该行 ws_path 是真 git 工作树）：
   *   ① 主树判据（本函数下方同款）：锚（realpath git-common-dir）坐落在行 ws_path 内；
   *   ② 附属 worktree 根：行 ws_path 在本仓 worktree 清单内（git worktree list 现读）。
   * 两者皆不成立（祖先仓清单不含该行）= 非 git 目录误判 → 拒绝归属（能力位 false）。
   * worktrees 探针缺席（旧桩）= 退主树判据单径。
   */
  const isGenuineGitRoot = async (rowPath: string, anchorKey: string): Promise<boolean> => {
    if (anchorKey.startsWith(`${normalizeFsPath(rowPath)}/`)) return true
    const list = await git.worktrees?.(rowPath).catch(() => null)
    if (list === null || list === undefined) return false
    const rowKey = normalizeFsPath(rowPath)
    return list.some((entry) => normalizeFsPath(entry.path) === rowKey)
  }

  const resolveProject = async (cwd: string): Promise<WorktreeProjectResolution | null> => {
    try {
      const anchor = await git.commonDirAnchor(cwd)
      if (anchor === null) return null // 非 git / git 缺席 / 探测失败 → 能力位 false（fail-soft）
      const anchorKey = normalizeFsPath(anchor)
      const rows: readonly ProjectSummary[] = await projects.listProjects().catch(() => [])
      let hit: ProjectSummary | undefined
      const cwdKey = normalizeFsPath(cwd)
      for (const row of rows) {
        if (row.archived) continue // 归档行不参与归属（同锚存量双行按 created_at 序，归档行在前会劫持解析）
        const rowKey = normalizeFsPath(row.wsPath)
        // 非 git 注册根独占其子树（bug bc81f4b8/57b494f5）：cwd 落在非 git 注册根内（含精确
        // 命中）→ 归属即 null——祖先仓锚不越权把该子树判回 git 项目（防 seal 误封存拒发 /
        // list 误注入祖先仓清单）。核验只对包含 cwd 的行做（其余行与本 cwd 归属无关）。
        if ((cwdKey === rowKey || cwdKey.startsWith(`${rowKey}/`)) && !(await isGenuineGitRoot(row.wsPath, anchorKey))) {
          return null
        }
        // 精确命中（cwd 即注册根）短路——退路 = 同锚首行（存量双行归 core 注册链仲裁归档，
        // 读面不重判）。
        if (rowKey === cwdKey) {
          hit = row
          break
        }
        const rowAnchor = await git.commonDirAnchor(row.wsPath)
        if (rowAnchor !== null && normalizeFsPath(rowAnchor) === anchorKey) {
          // git 域归属核验同门（非 git 注册根不参与归属——防误判路径自同锚退路复入）
          if (!(await isGenuineGitRoot(row.wsPath, anchorKey))) continue
          // 主树行必胜仲裁（INV-U 统一选主谓词的 host 正本——bug 0c677db2 收口）：锚 =
          // realpath(git-common-dir) 恒坐落在主树内（<主树>/.git）——「锚目录在该行
          // ws_path 之下」即主行。同锚多行时 worktree 行按 created_at 序可排在主行之前
          // （main-old→redesign→main 演进残留）——树行根/title 会劫持项目归属。
          // wrap 面（apps/web start-session-wrap selectMasterRow）以祖先前缀判镜像同构
          // 此谓词（零 git 探针），同锚集合两半边裁决恒一致——契约锚定测试
          // master-arbitration.test.ts；判据书面化正本：
          // docs/conventions/official-face-contract-anchors.md。成立域限定（M1）：镜像
          // 同构的前提是「worktree 全在主树子树内」——worktree_dir 逐项目可配
          // （getWorktreeDir），外置布局下主树路径未必是 worktree 行的祖先前缀，
          // wrap 祖先前缀判与 host 锚判可分叉。
          if (anchorKey.startsWith(`${normalizeFsPath(row.wsPath)}/`)) {
            hit = row
            break
          }
          hit ??= row
        }
      }
      if (hit === undefined) return null // 无同锚活跃行 → 归并失效（未注册仓库）
      await refresh().catch(() => false) // 顺带刷新目录快照（同步提供者取数缓存——随归并自愈）
      return { projectId: hit.id, projectRoot: hit.wsPath, isGit: true, projectName: hit.name }
    } catch (cause) {
      log(`[git-worktree] resolveProject 归并失败（fail-soft null）：${String(cause)}`)
      return null
    }
  }

  const getWorktreeDir = (projectRoot: string): string =>
    dirSnapshot.get(normalizeFsPath(projectRoot)) ?? join(projectRoot, '.forge', 'worktrees')

  return { resolveProject, getWorktreeDir, refresh }
}
