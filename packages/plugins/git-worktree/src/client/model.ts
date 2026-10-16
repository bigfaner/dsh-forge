// @dsh-forge/git-worktree client —— 视图模型纯函数面（UI 只消费，零 React 依赖）：
// 来源标记推断（所配 worktree 目录内 = DSH）、worktree 名派生、ahead/behind 徽标拆分、
// 删除拦截判定（未提交变更 / 挂靠会话 → 确认钮禁用；仅未 push → 警示放行）、
// ahead/behind 懒加载待拉清单（展开才拉、缓存免重拉）。
import type { AheadBehind } from '../worktree-ops.js'

/** hero 选择菜单行（一行一 worktree——一体两属性：分支名为行属性 + worktree 名） */
export interface WorktreeRow {
  /** worktree 绝对路径（行稳定 id） */
  readonly path: string
  /** 检出分支短名（detached/bare = null——行仍列出，无分支名段） */
  readonly branch: string | null
  /** worktree 名（路径尾段；主 worktree 行展示「‹项目名›（主 worktree）」由组件层拼） */
  readonly worktreeName: string
  /** 主 worktree 行（只展示、无删除图标） */
  readonly isMain: boolean
  /** 盘上在场性：false = 失配行（置灰 + 提示清理，不可选中） */
  readonly present: boolean
}

/** 来源标记（所配目录内 = 'dsh'；自定义路径/git 外建 = null 无标记） */
export type WorktreeSource = 'dsh' | null

const normalize = (path: string): string => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

/**
 * 来源标记推断：路径落在所配 worktree 目录内 → 'dsh'（DSH 创建推断——git 无创建者
 * 元数据，按提案「关键裁决」以路径推断）；自定义路径 → null。
 */
export function inferSource(path: string, worktreeDir: string | undefined): WorktreeSource {
  if (!worktreeDir) return null
  return normalize(path).startsWith(`${normalize(worktreeDir)}/`) ? 'dsh' : null
}

/** 分支名 → worktree 名派生（feat/remote-approval → wt-remote-approval；尾段补 wt- 前缀） */
export function deriveWorktreeName(branch: string): string {
  const tail = branch.trim().split('/').filter(Boolean).at(-1) ?? ''
  return tail === '' ? '' : `wt-${tail}`
}

/** ahead/behind 徽标段（懒加载后填充；零值段省略；无 upstream 全省略） */
export interface AheadBehindSegments {
  readonly ahead: string | null
  readonly behind: string | null
}

export function aheadBehindSegments(counts: AheadBehind): AheadBehindSegments {
  return {
    ahead: counts.ahead > 0 ? `↑${counts.ahead}` : null,
    behind: counts.behind > 0 ? `↓${counts.behind}` : null,
  }
}

/** 删除二次确认状态清单（弹窗三检查项） */
export interface DeleteChecks {
  /** 未提交变更计数（git status --porcelain；0 = 干净） */
  readonly dirtyCount: number
  /** 未 push 提交数（ahead；仅警示展示——本地 ref git 原生保留，可确认） */
  readonly aheadCount: number
  /** 挂靠会话数（含 in-progress 任务——命中即拦截） */
  readonly attachedSessions: number
}

/** 拦截项 id（命中任一 → 确认钮禁用即拦截） */
export type DeleteBlocker = 'uncommitted-changes' | 'attached-sessions'

/** 命中的拦截项（双清 = 空数组） */
export function deleteBlockers(checks: DeleteChecks): readonly DeleteBlocker[] {
  const blockers: DeleteBlocker[] = []
  if (checks.dirtyCount > 0) blockers.push('uncommitted-changes')
  if (checks.attachedSessions > 0) blockers.push('attached-sessions')
  return blockers
}

/** 确认钮禁用判定（未提交变更 or 挂靠会话命中即拦；仅未 push 提交放行） */
export function isDeleteBlocked(checks: DeleteChecks): boolean {
  return deleteBlockers(checks).length > 0
}

/** 创建就绪判定（分支名 + worktree 名齐备——新建弹窗「创建」钮门） */
export function isCreateReady(branch: string, worktreeName: string): boolean {
  return branch.trim() !== '' && worktreeName.trim() !== ''
}

/**
 * slug 候选（新建弹窗分支下拉数据源——通用层零 dsh-forge 依赖，提案/feature 行在
 * 挂载面归一为 {slug, done} 两字段后进本函数）：并集去重（同 slug 任一未完成即未完成）、
 * 未完成（非终态）排前、组内保持输入序。
 */
export interface SlugCandidate {
  readonly slug: string
  /** 终态（提案 rejected/superseded；feature completed/archived）= true */
  readonly done: boolean
}

export function collectSlugCandidates(
  proposals: readonly SlugCandidate[],
  features: readonly SlugCandidate[],
): readonly SlugCandidate[] {
  const bySlug = new Map<string, SlugCandidate>()
  for (const candidate of [...features, ...proposals]) {
    const previous = bySlug.get(candidate.slug)
    bySlug.set(candidate.slug, previous ? { slug: candidate.slug, done: previous.done && candidate.done } : candidate)
  }
  const all = [...bySlug.values()]
  return [...all.filter((candidate) => !candidate.done), ...all.filter((candidate) => candidate.done)]
}

/** 输入过滤（大小写不敏感子串匹配；空查询 = 全量候选） */
export function filterSlugCandidates(
  candidates: readonly SlugCandidate[],
  query: string,
): readonly SlugCandidate[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return candidates
  return candidates.filter((candidate) => candidate.slug.toLowerCase().includes(needle))
}

/** 同名冲突项（命中任一 → 表单告警 + 创建禁用，进 git 前拦截） */
export type CreateConflict = 'branch-exists' | 'worktree-exists'

/**
 * 同名冲突判定：输入分支名 vs 既有分支（branches RPC）、派生/手改 worktree 名 vs 既有
 * 条目（list RPC）。trim + 大小写不敏感（Windows 路径/refs 保守口径）；空输入不判。
 */
export function createConflicts(
  branch: string,
  worktreeName: string,
  existingBranches: readonly string[],
  existingWorktreeNames: readonly string[],
): readonly CreateConflict[] {
  const conflicts: CreateConflict[] = []
  const branchName = branch.trim().toLowerCase()
  const wtName = worktreeName.trim().toLowerCase()
  if (branchName !== '' && existingBranches.some((name) => name.trim().toLowerCase() === branchName)) {
    conflicts.push('branch-exists')
  }
  if (wtName !== '' && existingWorktreeNames.some((name) => name.trim().toLowerCase() === wtName)) {
    conflicts.push('worktree-exists')
  }
  return conflicts
}

/**
 * ahead/behind 懒加载待拉清单：菜单展开（open）才拉；缓存已命中的不重拉；
 * 失配行不在场不拉。收起态恒空清单（收起不触发任何拉取）。
 */
export function pendingAheadBehindPaths(
  open: boolean,
  rows: readonly WorktreeRow[],
  cache: ReadonlyMap<string, unknown>,
): readonly string[] {
  if (!open) return []
  return rows.filter((row) => row.present && row.branch !== null && !cache.has(row.path)).map((row) => row.path)
}
