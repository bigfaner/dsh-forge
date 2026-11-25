// worktree-picker 视图模型纯函数面（UI 只消费，零 React 依赖）：
// 来源标记推断（所配 worktree 目录内 = DSH）、worktree 名派生、ahead/behind 徽标拆分、
// 删除拦截判定（未提交变更 / 挂靠会话 → 确认钮禁用；仅未 push → 警示放行）、
// ahead/behind 懒加载待拉清单（展开才拉、缓存免重拉）。
import type { AheadBehind } from '@dsh-forge/contracts'

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

/**
 * worktree 名跟随/脱离判定（1.20 纯函数单源——新建弹窗同名默认跟随）：
 * 未手动编辑过 worktree 名 → 跟随分支（默认值 = 分支名同名）；手动编辑过 → 脱离跟随、
 * 以用户值为准；但用户值清回与分支名同名（trim 口径）→ 恢复跟随判定。
 */
export function isWorktreeNameFollowing(branch: string, worktreeName: string, touched: boolean): boolean {
  return !touched || worktreeName.trim() === branch.trim()
}

/**
 * 行标签段（1.24 用户裁决——同名去重）：branch 与 worktreeName 同名（trim + 大小写不敏感
 * 同 refs 保守口径）→ 单段展示（worktreeName 段 null），不再「x · x」；异名保持双段。
 * hero chip 与菜单行两处共用同一单源。
 */
export function worktreeLabelSegments(
  branch: string | null,
  worktreeName: string,
): { readonly branch: string; readonly worktreeName: string | null } {
  const name = branch ?? ''
  const same = name !== '' && name.trim().toLowerCase() === worktreeName.trim().toLowerCase()
  return { branch: name, worktreeName: same ? null : worktreeName }
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

/**
 * ahead/behind 内联短串（chip §2.3.1 目标形态——分支名旁 `2↓ 16↑`，落后在前；
 * 零值段省略、全零/无 upstream = null 不占位）。
 */
export function aheadBehindInline(counts: AheadBehind): string | null {
  const parts = [
    ...(counts.behind > 0 ? [`${counts.behind}↓`] : []),
    ...(counts.ahead > 0 ? [`${counts.ahead}↑`] : []),
  ]
  return parts.length > 0 ? parts.join(' ') : null
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
export type DeleteBlocker = 'uncommitted-changes' | 'attached-sessions' | 'checks-unavailable'

/** 命中的拦截项（双清 = 空数组；A11：checks 缺席 = 保守拦截——破坏性操作 fail-closed） */
export function deleteBlockers(checks: DeleteChecks | null): readonly DeleteBlocker[] {
  if (checks === null) return ['checks-unavailable']
  const blockers: DeleteBlocker[] = []
  if (checks.dirtyCount > 0) blockers.push('uncommitted-changes')
  if (checks.attachedSessions > 0) blockers.push('attached-sessions')
  return blockers
}

/** 确认钮禁用判定（未提交变更 or 挂靠会话命中即拦；checks 拉取失败/进行中拦；仅未 push 提交放行） */
export function isDeleteBlocked(checks: DeleteChecks | null): boolean {
  return deleteBlockers(checks).length > 0
}

/** 创建就绪判定（分支名 + worktree 名齐备——新建弹窗「创建」钮门） */
export function isCreateReady(branch: string, worktreeName: string): boolean {
  return branch.trim() !== '' && worktreeName.trim() !== ''
}

/**
 * 路径拼接单点（1.21 分隔符归一）：按目录所属平台选分隔符口径——Windows（盘符/反斜杠）
 * 全串统一反斜杠；POSIX（/ 开头绝对目录，macOS/Linux）全串统一正斜杠。
 * Root cause (bug b974357f)：原口径无条件归一反斜杠，POSIX 目录被拼成 `\Users\...`
 * 非法路径，git 在仓内创建字面反斜杠名目录后清单比对失败（worktree add succeeded
 * but entry missing）。
 */
export function joinWorktreePath(dir: string, name: string): string {
  const posix = dir.startsWith('/')
  const sep = posix ? '/' : '\\'
  const normalize = (value: string): string =>
    posix ? value.replaceAll('\\', '/') : value.replaceAll('/', '\\')
  const base = normalize(dir).replace(/[\\/]+$/, '')
  const tail = normalize(name).replace(/^[\\/]+/, '')
  return base === '' || tail === '' ? `${base}${tail}` : `${base}${sep}${tail}`
}

/**
 * 跨分支风险判定（1.19 纯函数单源——hero chip 改选与新建基准分支两处确认框共用）：
 * 目标分支 ≠ 主树当前检出分支 → 需要风险确认（worktree 业务上下文跨分支，主树上下文
 * 不随行）。trim + 大小写不敏感（refs 保守口径）；任一侧未知（null）= 保守判风险。
 */
export function isCrossBranchRisk(targetBranch: string | null, currentBranch: string | null): boolean {
  if (targetBranch === null || currentBranch === null) return true
  return targetBranch.trim().toLowerCase() !== currentBranch.trim().toLowerCase()
}

/**
 * slug 候选（新建弹窗分支下拉数据源——通用层零 dsh-forge 依赖，feature 行在
 * 挂载面归一为 {slug, done} 两字段后进本函数）：未完成（非终态）排前、组内保持输入序。
 */
export interface SlugCandidate {
  readonly slug: string
  /** 终态（feature completed/archived）= true */
  readonly done: boolean
  /** 候选分组（2.18 spec/milestone/roadmap 三组——feature 域退役后挂载面给定；缺省 = 无分组标签） */
  readonly group?: SlugCandidateGroup
}

/** 候选分组（呈现次序 = spec → milestone → roadmap——组内保持各自来源返回序） */
export type SlugCandidateGroup = 'spec' | 'milestone' | 'roadmap'

/** 三组聚合输入（每组分绍缺席 = 该来源拉取失败 fail-soft 降级——组缺席、其余组照常） */
export interface GroupedSlugCandidateSource {
  /** spec 清单（forgeSpecs/list slug 集） */
  readonly specs: readonly { readonly slug: string }[]
  /** roadmap 清单（逐 roadmap detail 聚合：milestone 无 slug 字段——领域判据 milestone 无
   *  slug、寻径 = 父 slug + seq，候选值取 title 作 slug 形输入提示） */
  readonly roadmaps: readonly {
    readonly slug: string
    readonly milestones: readonly { readonly title: string }[]
  }[]
}

/**
 * 三组 slug 候选聚合（2.18 纯函数单源）：输出次序 = 全部 spec slug → 全部 milestone
 * slug → 全部 roadmap slug；组内保持各自来源返回序（milestone 按逐 roadmap detail
 * 返回序、roadmap 间按 roadmaps 返回序）；同 slug 先见者留（跨组去重）；空 slug 跳过。
 */
export function collectGroupedSlugCandidates(source: GroupedSlugCandidateSource): readonly SlugCandidate[] {
  const out: SlugCandidate[] = []
  const seen = new Set<string>()
  const push = (slug: string, group: SlugCandidateGroup): void => {
    const key = slug.trim()
    if (key === '' || seen.has(key)) return
    seen.add(key)
    out.push({ slug, done: false, group })
  }
  for (const spec of source.specs) push(spec.slug, 'spec')
  for (const roadmap of source.roadmaps) {
    for (const milestone of roadmap.milestones) push(milestone.title, 'milestone')
  }
  for (const roadmap of source.roadmaps) push(roadmap.slug, 'roadmap')
  return out
}

/**
 * projectRoot（ws_path）→ 项目 id 解析（specs/roadmaps 族寻址键）：wsPath trim + 分隔符
 * 归一 + 大小写不敏感（Windows 路径保守口径——createConflicts 同判）；未命中 = undefined
 * （调用方 fail-soft 空候选）。
 */
export function projectIdByWsPath(
  summaries: readonly { readonly id: string; readonly wsPath: string }[],
  projectRoot: string,
): string | undefined {
  const normalize = (value: string): string => value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  const needle = normalize(projectRoot)
  return summaries.find((row) => normalize(row.wsPath) === needle)?.id
}

export function collectSlugCandidates(
  features: readonly SlugCandidate[],
): readonly SlugCandidate[] {
  const bySlug = new Map<string, SlugCandidate>()
  for (const candidate of features) {
    bySlug.set(candidate.slug, candidate)
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
 * 基准分支选项排序（1.22 用户裁决——新建弹窗基准分支下拉 items 生成）：
 * 身份位序表 = [main, master, {defaultBranch}, {currentBranch}]，命中越靠前位次越高
 * （defaultBranch = branches RPC defaultBranch——1.13 存在性校验链产出；currentBranch =
 * 主行 isMain 检出 branch）；一分支多身份命中只取最优先位（去重天然成立——输出每分支
 * 恰一次）；全部未命中/缺省 → 其余分支，同级任务内定**按字母序**（大小写不敏感，
 * refs 保守口径同 isCrossBranchRisk/createConflicts——清单序不保证确定故取字母序）。
 * slug 分支输入候选排序（1.10 未完成排前）不受影响。
 */
export function sortBaseBranchOptions(
  branches: readonly string[],
  defaultBranch: string | null | undefined,
  currentBranch: string | null | undefined,
): readonly string[] {
  const key = (name: string): string => name.trim().toLowerCase()
  const identities = [
    'main',
    'master',
    ...(defaultBranch !== null && defaultBranch !== undefined && defaultBranch.trim() !== '' ? [key(defaultBranch)] : []),
    ...(currentBranch !== null && currentBranch !== undefined && currentBranch.trim() !== '' ? [key(currentBranch)] : []),
  ]
  const rankOf = (name: string): number => {
    const index = identities.indexOf(key(name))
    return index === -1 ? identities.length : index
  }
  return [...branches].sort((a, b) => {
    const rankDelta = rankOf(a) - rankOf(b)
    if (rankDelta !== 0) return rankDelta
    const [ka, kb] = [key(a), key(b)]
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
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

// ───────────── 挂载面纯模型归位（apps/web hero-picker-model worktree 域段——1.15）─────────────

// ───────────── 1.34 跨分支确认闩锁（bug ccfcc103）─────────────
// 确认框消费时点 = 点选（1.19 语义回归——W3 arm 退役后确认不再随首条消息编排后移）。
// 闩锁 = per 选中行单值态：确认置位（同行重选零重弹）、换目标重选清退（重新判定）。
// 「不再提示」为 settings 持久化的用户级一票，独立于闩锁。

/** 确认闩锁态（选中行唯一 → 单值即 per 选中行）：path = 已确认 | null = 无闩锁 */
export type RiskConfirmLatch = string | null

/** 置位（确认回调消费——幂等；换确认目标覆盖） */
export function riskLatchConfirm(prev: RiskConfirmLatch, path: string): RiskConfirmLatch {
  return path
}

/** 换目标重选清退（点选回调消费——同行重选保留闩锁：确认后点 chip 不重弹） */
export function riskLatchReselect(prev: RiskConfirmLatch, path: string): RiskConfirmLatch {
  return prev !== null && prev !== path ? null : prev
}

/** 弹框判定消费闩锁（闩锁只旁路弹框分支——选中态回填照常）：true = 需弹框 */
export function riskDialogNeeded(path: string, latch: RiskConfirmLatch): boolean {
  return latch !== path
}

// bug a944424f：闩锁跨重挂记忆。确认 → applySelection 走官方 openWorkspace 切主视图
// （选树即切该树 blank），ForgeHeroWorktreeMount 随主视图切换重挂——组件 useState 闩锁
// 清零，同行重选重弹。闩锁落模块级记忆（单窗口单实例 = 「按窗口」语义，先例
// ui/state/selected-tree-window.ts），组件态只作记忆的镜像：初始化惰性读 + 每次变更写透。

let riskLatchMemory: RiskConfirmLatch = null

/** 跨重挂记忆读面（组件 useState 惰性初始化消费——重挂即水合） */
export function riskLatchMemoryOf(): RiskConfirmLatch {
  return riskLatchMemory
}

/** 跨重挂记忆写面（闩锁每次变更写透——置位/清退同一入口） */
export function riskLatchMemorySync(next: RiskConfirmLatch): void {
  riskLatchMemory = next
}

// bug e2a10cd4：「不再提示」跨重挂记忆（与上同族——确认框多弹面的第二状态）。riskDismissed
// 挂组件 useState 会被 openWorkspace 切主视图的重挂清零，且 settings.set fire-and-forget
// 写透未及回读（竞态窗内重挂读不到 true）→ 换跨分支目标重弹确认框，用户级一票失守。
// 值域 = 布尔用户级一票（settings worktree.crossBranchRiskDismissed 持久化口径同域）——
// 无路径成分，跨项目/跨会话路径失配面天然不存在。落模块级记忆（单窗口单实例 = 「按窗口」
// 语义），组件态只作记忆镜像：初始化惰性读（重挂即水合）+ 每次变更写透。

let riskDismissedMemory: boolean = false

/** 「不再提示」跨重挂记忆读面（组件 useState 惰性初始化消费——重挂即水合） */
export function riskDismissedMemoryOf(): boolean {
  return riskDismissedMemory
}

/** 「不再提示」跨重挂记忆写面（每次变更写透——装载回填/确认勾选同一入口） */
export function riskDismissedMemorySync(next: boolean): void {
  riskDismissedMemory = next
}

// ───────────── bug 4a30b193 陈旧选中自愈（纯判定单源）─────────────

/** 自愈判定行（WorktreeEntryDto 行模型最小面——present = 盘上实存，host list 兑现） */
export interface StaleSelectionRow {
  readonly path: string
  readonly worktreeName: string
  readonly isMain: boolean
  readonly present: boolean
  /** 检出分支（bug fcc6f37b 同族：null = detached/bare——不可挂靠行应自愈切回主行） */
  readonly branch?: string | null
}

/** 自愈计划（选中行盘上缺席时装配层消费：选中态切回主行 + notice 引述树名） */
export interface StaleSelectionReset {
  /** true = 选中行已失效，需切回主行并呈现 notice */
  readonly stale: boolean
  /** 失效树名（notice 引述；stale=false 缺席） */
  readonly worktreeName?: string
  /** 回落主行路径（主行缺席 = undefined——无主行可落，仅清选中态） */
  readonly mainPath?: string
}

/**
 * 陈旧选中自愈判定（纯函数单源）：选中行在清单中缺席，或行在场但盘上实存为假
 * （git 清单 prune 前保留已删树陈旧行——present 以 existsSync 盘上事实为准）→ stale。
 * bug fcc6f37b 同族：行在场且实存但不可挂靠（branch null = detached/bare）同样 stale——
 * 存量选中态驱动 create-wrap 必被 typed 拒绝（fail-open 噪音），自愈切回主行。
 * 选中态缺席/命中健康行 = 不自愈（用户显式选中零覆盖）。
 */
export function staleSelectionResetOf(
  rows: readonly StaleSelectionRow[],
  selectedPath: string | undefined,
): StaleSelectionReset {
  if (selectedPath === undefined) return { stale: false }
  const row = rows.find((candidate) => candidate.path === selectedPath)
  if (row !== undefined && row.present && row.branch !== null) return { stale: false }
  const main = rows.find((candidate) => candidate.isMain)
  // 行整段消失（清单无行）→ 树名取路径尾段（与 host worktreeNameOf 同判）
  const name = row?.worktreeName ?? selectedPath.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? selectedPath
  return { stale: true, worktreeName: name, mainPath: main?.path }
}
