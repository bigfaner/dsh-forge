// knowledge 绑定表维护（4.2；定位：基础——装配面数据缝，域语义归 core/knowledge 包）。
// 缝的由来（3.4 设计 + tech-design Interface 3）：knowledge 插件 tool 的会话上下文
// 解析 = cwd → projectId 绑定表（插件 config，DF003 设计期定缝项）。projectId 为
// 运行期注册产物（randomUUID）——静态 config 无法承载，故绑定数据经
// bindingsFile（boot overlay 注入路径）落地、装配方（host）维护：
//   · boot 后一次全量刷新（listProjects → 文件）
//   · 每次 registerProject 成功后增量刷新（service 包装面）
// 1.6（worktree-branch-management）：绑定表增量承载 worktree → 主 projectId 行——
// 每次刷新对每个项目经 git worktree list 现算派生（createGitIdentityPort 默认实现），
// 陈旧行（worktree 已删）随全量重写自愈消失；探测失败（非 git/git 缺席）= 该项目零
// worktree 行（刷新间隙残留无害——对应会话已封存）。行形与主行同形 {wsPath, projectId}
// 并入 projects 数组（消费端 cwd→projectId 路由零改动即获 worktree 路由能力）。
// 插件侧 exec 点惰性读取（packages/knowledge tools/session.ts）——无 watch/无投影
// （SC2 纪律域 = UI 状态副本；本文件是装配配置数据，逐写逐读）。
// 失败口径：绑定表写失败只降级记日志，永不抛断注册/启动流程（对齐 Error Handling
// 传播策略「关键异常永不抛断用户流程」；后果 = 会话 tool 解析失败回落常规检索，
// 知识插件 unbound 失败信息自述）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createGitIdentityPort } from '@dsh-forge/core'
import { normalizeFsPath } from '@dsh-forge/path-key'
import type { ProjectService, ProjectSummary } from '@dsh-forge/contracts'

/** 绑定表文件形状（版本化——消费方 = knowledge 插件 tools/session.ts 惰性读取） */
export interface KnowledgeBindingsFile {
  readonly version: 1
  readonly projects: readonly { readonly wsPath: string; readonly projectId: string }[]
}

/** worktree 现算派生端口（ws_path → 在场 worktree 路径清单；null = 探测失败）。 */
export type WorktreeLister = (wsPath: string) => Promise<readonly string[] | null>

/** 默认派生端口：core GitIdentityPort 薄封装（git worktree list --porcelain，fail-soft null）。 */
export const defaultWorktreeLister: WorktreeLister = async (wsPath) => {
  const entries = await createGitIdentityPort().worktrees(wsPath)
  return entries === null ? null : entries.map((wt) => wt.path)
}

/** 单项目 worktree 绑定行现算派生（主行路径去重——git worktree list 含主 worktree 本身；失败 null）。
 * bug 3e0426a0：落盘键恒 normalizeFsPath 归一形态（git 输出天然正斜杠，原样落盘会与存量
 * canonical 行键空间分裂——消费面归一后 Map 后写覆盖即错绑）。 */
async function worktreeRowsOf(
  project: ProjectSummary,
  listWorktrees: WorktreeLister,
): Promise<readonly { wsPath: string; projectId: string }[]> {
  const paths = await listWorktrees(project.wsPath)
  if (paths === null) return []
  const mainKey = normalizeFsPath(project.wsPath)
  return paths
    .filter((p) => normalizeFsPath(p) !== mainKey)
    .map((p) => ({ wsPath: normalizeFsPath(p), projectId: project.id }))
}

/** 项目摘要 + worktree 现算派生 → 绑定表（纯映射；wsPath = canonical path 同口径）
 * bug 3e0426a0：归档项目整行不参与（主行与派生行）——同锚归档行（历史 worktree 独立
 * 注册）的 git 清单含主仓与全部兄弟 worktree，参与派生会把主仓路径错绑到归档 projectId；
 * 消费面解析到归档项目 = 任务源空 + UI 面隐藏。 */
export async function bindingsOf(
  projects: readonly ProjectSummary[],
  listWorktrees: WorktreeLister = defaultWorktreeLister,
): Promise<KnowledgeBindingsFile> {
  const active = projects.filter((p) => !p.archived)
  const worktreeRows = (
    await Promise.all(active.map((p) => worktreeRowsOf(p, listWorktrees).catch(() => [])))
  ).flat()
  return {
    version: 1,
    projects: [
      ...active.map((p) => ({ wsPath: p.wsPath, projectId: p.id })),
      ...worktreeRows,
    ],
  }
}

/** 绑定表序列化（稳定形状——单测逐字节锚定） */
export function serializeBindings(file: KnowledgeBindingsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/** 全量写入绑定表文件（fail-soft：失败记日志返回 false，不抛） */
export async function writeKnowledgeBindings(
  target: string,
  projects: readonly ProjectSummary[],
  log: (message: string) => void = console.warn,
  listWorktrees: WorktreeLister = defaultWorktreeLister,
): Promise<boolean> {
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, serializeBindings(await bindingsOf(projects, listWorktrees)), 'utf8')
    return true
  } catch (cause) {
    log(`[host] knowledge 绑定表写入失败（会话召回将按未绑定降级）：${String(cause)}`)
    return false
  }
}

/** 拉取项目全量并刷新绑定表（boot 后一次性；fail-soft 同上） */
export async function refreshKnowledgeBindings(
  projects: Pick<ProjectService, 'listProjects'>,
  target: string,
  log?: (message: string) => void,
  listWorktrees: WorktreeLister = defaultWorktreeLister,
): Promise<boolean> {
  try {
    return await writeKnowledgeBindings(target, await projects.listProjects(), log, listWorktrees)
  } catch (cause) {
    ;(log ?? console.warn)(`[host] knowledge 绑定表刷新失败（listProjects 异常）：${String(cause)}`)
    return false
  }
}

/**
 * projects 服务包装面：registerProject 成功后刷新绑定表（增量锚——boot 全量之外
 * 的唯一变更源；updateProject 不动 ws_path/id 故无需锚；worktree 行随每次刷新
 * 现算重派生——陈旧行自愈）。其余方法原样透传，类型面 = contracts ProjectService
 * （通道注册零改动）。
 */
export function withKnowledgeBindingsRefresh(
  service: ProjectService,
  target: string,
  log: (message: string) => void = console.warn,
  listWorktrees: WorktreeLister = defaultWorktreeLister,
): ProjectService {
  return {
    ...service,
    async registerProject(input: Parameters<ProjectService['registerProject']>[0]) {
      const result = await service.registerProject(input)
      await writeKnowledgeBindings(target, await service.listProjects().catch(() => []), log, listWorktrees)
      return result
    },
  }
}
