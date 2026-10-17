// hero 工作区控件行映射纯函数（fix-24 ①；定位：业务——弹层列「项目」的映射面，官方
// WorkspacePickFlow 行语言同型：items 全量账本无过滤缝 → 产品经影子占用改列 forge 项目）。
// 口径（任务 fix-24 Description ①）：
//   - items = forge 项目（forge:projects/list → name；archived 排除——与左栏过滤口径一致）；
//   - 未绑定项目的工作区天然不出现（行源是项目不是账本——初版「选择器过滤」口径的子集覆盖）；
//   - 选中映射：owner selectedId（workspaceId）↔ 行 id（= project.workspaceId）恒等对照，
//     未绑定/已归档工作区无命中行（零高亮）；
//   - 空集 + 账面已定 → 「添加」为唯一入口（官方 addIsTheOnlyEntry 语义对齐，:1935-1943）。
import type { ProjectSummary } from '@dsh-forge/contracts'

/** 弹层项目行（id = workspaceId——owner 契约 selectedId/onPick 零变化走官方链） */
export interface HeroPickerRow {
  readonly id: string
  readonly name: string
}

/** 弹层面（行集 + 入口形态派生——组件消费的唯一计划对象） */
export interface HeroPickerPlan {
  /** 项目行（archived 排除；listProjects 顺位保持 created_at 序） */
  readonly rows: readonly HeroPickerRow[]
  /** 行集非空 → 添加项入 footer（官方 pinAdd 同义） */
  readonly pinAdd: boolean
  /** 行集空且账面已定 → 「添加」唯一入口，弹层直达产品注册流（官方 addIsTheOnlyEntry 同义） */
  readonly addIsTheOnlyEntry: boolean
}

/** 弹层行集与入口形态（纯函数：projects + 账面相位 → 计划） */
export function heroPickerPlan(
  projects: readonly ProjectSummary[],
  settled: boolean,
): HeroPickerPlan {
  const rows: HeroPickerRow[] = []
  for (const project of projects) {
    if (project.archived) continue // 过滤口径：archived 排除（与左栏一致）
    rows.push({ id: project.workspaceId, name: project.name })
  }
  return { rows, pinAdd: rows.length > 0, addIsTheOnlyEntry: settled && rows.length === 0 }
}

/** workspaceId ↔ 项目映射（owner selectedId 命中行集内项目；undefined = 无命中——未绑定/已归档） */
export function selectedProjectOf(
  rows: readonly HeroPickerRow[],
  selectedId: string | undefined,
): HeroPickerRow | undefined {
  if (selectedId === undefined) return undefined
  return rows.find((row) => row.id === selectedId)
}

/**
 * worktree 编排数据根（A7——编排源与渲染兜底分离）：仅 selectedId 严格命中项目行时返回
 * ws_path；未选中/未命中/归档 → null（编排径不消费——禁止渲染兜底泄漏为绑定语义，
 * 无绑定工作区会话不得被预铸绑到别的项目树）。渲染兜底仍由 selectedProjectRootOf 承担。
 */
export function selectedProjectRootStrictOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
): string | null {
  const byWorkspace =
    selectedId !== undefined ? projects.find((project) => project.workspaceId === selectedId) : undefined
  return byWorkspace !== undefined && byWorkspace.archived !== true && byWorkspace.wsPath !== ''
    ? byWorkspace.wsPath
    : null
}

/**
 * worktree 编排数据根（bug e9330692 修订——A7 键扩为两段）：
 *  1. strict 段 = selectedProjectRootStrictOf（workspaceId 注册绑定——原 A7 全量）；
 *  2. miss 段 = host resolve 通道身份裁决（forge:worktree/resolve：git common-dir 锚 +
 *     主树行必胜——客户端零仲裁）归并 worktree 工作区会话回属主项目；裁决 projectId 须
 *     核销为注册表活跃行（归档/未注册 → null）。
 * A7 fail-closed 语义保留：真未归属（原生无绑定工作区）裁决缺席 → null（提示不编排）。
 */
export function orchestrateRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
  resolved: { readonly projectId: string; readonly projectRoot: string } | null | undefined,
): string | null {
  const strict = selectedProjectRootStrictOf(projects, selectedId)
  if (strict !== null) return strict
  if (resolved === null || resolved === undefined) return null
  const row = projects.find((project) => project.id === resolved.projectId)
  return row !== undefined && row.archived !== true && row.wsPath !== '' ? row.wsPath : null
}

/**
 * worktree 第二 chip 数据根（纯函数，fix-2 建立 / bug 10833861 修正 / 1.31 A7 分离）：
 * selectedId 官方语义 = workspaceId（owner 契约）——经 workspaceId 回查项目行取 ws_path；
 * 未选中/未命中 → 活跃（非归档）首个有 ws_path 的行兜底（**仅渲染消费**——编排数据源走
 * selectedProjectRootStrictOf，fallback 泄漏成绑定语义即跨项目错绑）；全无 → null。
 * bug 10833861 Root cause: 原推导以 project.id 比对 workspaceId 恒 miss，fallback 又取
 * 全量首行（created_at 最早的归档项目，如非 git 的 learn）→ isGit=false 全零注入。
 */
export function selectedProjectRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
): string | null {
  return selectedProjectRootStrictOf(projects, selectedId)
  ?? projects.find((p) => p.archived !== true && p.wsPath !== undefined && p.wsPath !== '')?.wsPath
  ?? null
}

// ───────────── 1.25（bug af65c0a9）失败显式化：提示文案纯函数单源（1.29——失败面只在
// 首条消息时点发生：点选纯选中态无编排可失败，编排失败呈现走 arm 消费点的 Toast） ─────────────

/** worktree 注入面缺席提示（旧插件面/装配降级——不静默 no-op，官方 Toast 呈现） */
export function worktreeFaceUnavailableNotice(): string {
  return 'worktree 编排面不可用（插件版本陈旧？），首条消息将落主树'
}

/**
 * worktree 挂靠编排失败提示（含环节语义——sessionCreate / openSession 两步；
 * bug af65c0a9 Root cause: 编排失败静默吞错，以为已在选中 worktree，实际仍在主树会话）。
 * 1.29 时点注记：本提示只在首条消息时点（arm 消费点）出现。
 */
export function worktreeOrchestrationNotice(stage: 'create' | 'open', cause: string): string {
  const stageText = stage === 'create' ? '创建挂靠会话' : '打开会话'
  return `worktree 挂靠失败（${stageText}）：${cause}，首条消息将落主树`
}

/**
 * W2 能力缺席显式拒绝提示（typed code ERR_WORKTREE_CAPABILITY_ABSENT——host fail-closed：
 * 创建与首条消息均被显式拒绝，不会落主树——不得套用「将落主树」文案误导）。
 */
export function worktreeCapabilityAbsentNotice(): string {
  return 'git 绑定能力缺席（git-worktree 插件未装载），git 项目的会话创建与消息发送已被拒绝——请检查插件装配后重启应用'
}

/** A7——编排数据根缺席提示（selectedId 未命中项目行——渲染兜底不进编排，显式呈现不静默） */
export function worktreeUnselectedProjectNotice(): string {
  return '当前会话未选中 forge 项目，worktree 编排默认停用——首条消息将落主树'
}

// ───────────── 1.26 编排默认：账本快照读面（纯函数——plugin.ts 重导出单源） ─────────────
//
// 1.29 时序裁决（点选去编排化）：会话创建唯一时机 = 首条消息——点选 worktree 行只更新
// 选中态（chip 回填 + 项目粒度记忆），零编排零确认框；1.26 编排默认（arm）消费点唯一化，
// 由 composer 首条消息意图（draft 非空）驱动。1.25 失败 Toast 与 1.19 跨分支确认框随
// 编排同移至该时点（确认前消息不发出——草稿留在 composer，arm 未完成无发送面）。

/**
 * worktree 路径归一键（1.21/1.24 口径——账本 cwd 与清单行 path 跨源比对单源）：
 * 反斜杠→正斜杠 + 去尾斜杠 + 小写。
 */
export function worktreeCwdKey(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

/** 账本快照窄读单步（getSnapshot 调用 + byId 取行——快照缺席/形状漂移 = undefined fail-soft） */
function ledgerRowsOf(list: unknown): Record<string, unknown> | undefined {
  if (typeof list !== 'object' || list === null) return undefined
  const getSnapshot = (list as { getSnapshot?: () => unknown }).getSnapshot
  if (typeof getSnapshot !== 'function') return undefined
  let snapshot: unknown
  try {
    snapshot = getSnapshot.call(list)
  } catch {
    return undefined
  }
  const byId = (snapshot as { byId?: unknown } | null)?.byId
  return typeof byId === 'object' && byId !== null ? (byId as Record<string, unknown>) : undefined
}

/**
 * 主视图在留会话行解析（1.29——`retainedBy.mainView > 0` 官方 publishMain 同判据，读 id +
 * cwd 双字段：id 驱动 composer 草稿源寻址与 arm 后去重，cwd 驱动 arm 去重）。无在留行 =
 * undefined。
 */
export function activeSessionRowOf(list: unknown): { readonly id: string; readonly cwd?: string } | undefined {
  for (const [id, row] of Object.entries(ledgerRowsOf(list) ?? {})) {
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    if (typeof mainView === 'number' && mainView > 0 && id !== '') {
      const cwd = (row as { cwd?: unknown } | null)?.cwd
      return { id, cwd: typeof cwd === 'string' && cwd !== '' ? cwd : undefined }
    }
  }
  return undefined
}

/** 主视图在留会话 id（activeSessionRowOf 投影） */
export function activeSessionIdOf(list: unknown): string | undefined {
  return activeSessionRowOf(list)?.id
}

/** arm 闸输入（挂载面效应读数的窄投影——判读单源，WorktreeFaces arm 效应消费） */
export interface ArmGateInput {
  /** 清单就绪且 isGit（能力位真） */
  readonly phaseReadyGit: boolean
  readonly path: string | undefined
  /** 失败抑制集（1.25——失败循环零重入；1.31 与取消抑制拆分） */
  readonly suppressed: readonly string[]
  /** 取消抑制集（1.31 A3——确认框取消路径专用；显式重选同树即清除，与失败抑制语义分离） */
  readonly cancelSuppressed?: readonly string[]
  /** 跨分支确认框待决（1.31 A4——框开着期间效应守卫零重入，防双编排竞态） */
  readonly riskConfirmationOpen: boolean
  readonly rowPresent: boolean
  readonly isMain: boolean
  /** 当前主视图会话 cwd（账本活源；undefined = 无在留会话） */
  readonly currentCwd: string | undefined
  /** 首条消息意图（1.29——composer 草稿非空；会话创建唯一时机的闸门） */
  readonly draftIntent: boolean
  /** 当前主视图会话 id（armed 去重——arm 已把当前会话换成本编排产物时零重入） */
  readonly currentSessionId: string | undefined
  /** 最近一次 arm 成功产物会话 id（undefined = 本挂载期尚未 arm） */
  readonly armedSessionId: string | undefined
  /** 最近一次 arm 成功的选中路径（armed 去重按路径生效——改选他行即重新消费） */
  readonly armedPath: string | undefined
}

/**
 * 编排默认 arm 闸（1.29 首条消息时点）：选中行在场 + 首条消息意图（draft 非空）即候选。
 * 树内行沿用 1.26 cwd 去重——当前 cwd 已在选中树 = 已在选中会话（双路不重复建会话）；
 * **主行不适用 cwd 去重**：官方新会话流的 blank 恒落项目根 cwd 且无绑定，「cwd 已在根」
 * 恰是须补绑定的待编排态，而非「已建」证据。armed 去重（1.29）：arm 产物即当前会话 =
 * 本轮编排已消费（键入续字零重入）；官方新会话流另起新 id → 去重自然失效，编排默认
 * 重新消费。既有无绑定历史会话不回填——本闸只在 hero/新会话阶段被消费，历史会话打开
 * 不进 hero 面（生效路径注记：仅对新建会话生效）。
 */
export function shouldArmSelectedRow(input: ArmGateInput): boolean {
  if (!input.phaseReadyGit) return false
  if (input.path === undefined) return false
  if (input.riskConfirmationOpen) return false // A4：确认框待决——零并发第二路编排
  if (input.suppressed.includes(input.path)) return false
  if (input.cancelSuppressed?.includes(input.path)) return false // A3：取消抑制独立判读
  if (!input.rowPresent) return false
  if (!input.draftIntent) return false
  if (input.armedSessionId !== undefined && input.armedPath === input.path && input.currentSessionId === input.armedSessionId) return false
  if (!input.isMain && input.currentCwd !== undefined && worktreeCwdKey(input.currentCwd) === worktreeCwdKey(input.path)) {
    return false
  }
  return true
}

// ───────────── 1.34 跨分支确认闩锁（bug ccfcc103）─────────────
// Root cause: 1.29 确认框由 arm 效应驱动（deps 含 draftText），每键重评估时跨分支判定
// 恒真而「已确认」无持久化痕迹（确认动作是一次性回调），故每键重弹。闩锁 = per 选中行
// 单值态：确认置位（续字/再发零重弹）、换目标重选清退（重新判定）、编排失败清退（Toast
// 后可重试重问）。取消路径不混用（1.31 A3 cancelSuppressed 独立语义——取消时闩锁必为
// null，显式重选由取消抑制清除后重问）。

/** 确认闩锁态（选中行唯一 → 单值即 per 选中行）：path = 已确认 | null = 无闩锁 */
export type RiskConfirmLatch = string | null

/** 置位（确认回调消费——幂等；换确认目标覆盖） */
export function riskLatchConfirm(prev: RiskConfirmLatch, path: string): RiskConfirmLatch {
  return path
}

/** 换目标重选清退（点选回调消费——同行重选保留闩锁：确认后点 chip 续字不重弹） */
export function riskLatchReselect(prev: RiskConfirmLatch, path: string): RiskConfirmLatch {
  return prev !== null && prev !== path ? null : prev
}

/** 编排失败清退（arm 失败分支消费——Toast 已呈现，闩锁清退允许重试重问；他行失败不误清） */
export function riskLatchFailureClear(prev: RiskConfirmLatch, path: string): RiskConfirmLatch {
  return prev === path ? null : prev
}

/** 弹框判定消费闩锁（闩锁只旁路弹框分支——armed 去重/在途闸照常，非 arm 旁路）：true = 需弹框 */
export function riskDialogNeeded(path: string, latch: RiskConfirmLatch): boolean {
  return latch !== path
}

/**
 * 按 cwd 反查空白会话 id（arm reuse-or-create 判定——编排默认重复消费不重复建会话）。
 * G4 官方四件套（reuseOrCreateBlank 源码核销 2026-10-17：blank ∧ summary.cwd ===
 * workspace.path ∧ workspace.sessionIds.includes(id) ∧ !archived.includes(id)）——
 * 归属/归档两件数据源 = workspaces.list 快照（缺席/漂移 = fail-closed 不复用）。
 * plugin.ts 同式镜像（bundle 自含禁跨 chunk import——两侧行为由各自单测 pin）。
 */
export function blankSessionIdByCwdOf(list: unknown, cwd: string, workspaces?: unknown): string | undefined {
  const key = worktreeCwdKey(cwd)
  const snapshot = (typeof workspaces === 'object' && workspaces !== null ? workspaces : undefined) as
    | { archivedSessionIds?: unknown; items?: unknown }
    | undefined
  const archived = Array.isArray(snapshot?.archivedSessionIds) ? snapshot.archivedSessionIds : undefined
  const items = Array.isArray(snapshot?.items) ? snapshot.items : undefined
  if (archived === undefined || items === undefined) return undefined
  const workspace = items.find((row) => {
    const path = (typeof row === 'object' && row !== null ? (row as { path?: unknown }).path : undefined)
    return typeof path === 'string' && worktreeCwdKey(path) === key
  })
  const members =
    Array.isArray((typeof workspace === 'object' && workspace !== null ? (workspace as { sessionIds?: unknown }).sessionIds : undefined))
      ? (workspace as { sessionIds: readonly unknown[] }).sessionIds
      : undefined
  if (members === undefined) return undefined
  for (const [id, row] of Object.entries(ledgerRowsOf(list) ?? {})) {
    if (id === '') continue
    if ((row as { blank?: unknown } | null)?.blank !== true) continue
    const rowCwd = (row as { cwd?: unknown } | null)?.cwd
    if (typeof rowCwd !== 'string' || worktreeCwdKey(rowCwd) !== key) continue
    if (!members.includes(id) || archived.includes(id)) continue
    return id
  }
  return undefined
}

// ───────────── 1.29 composer 草稿缝（首条消息意图源 + arm 后草稿搬运——plugin.ts 注入） ─────────────

/** 官方 InputState 快照窄读切片（draft 消费——形状漂移 = fail-soft 空串） */
export type DraftSourceFace = {
  readonly getSnapshot?: () => unknown
  readonly subscribe?: (onChange: () => void) => () => void
}

/** composer 草稿缝（plugin.ts inject 递达；缺席 = fail-soft 无意图源——arm 不消费） */
export interface WorktreeComposerDraftFace {
  /** 会话 id → InputState 快照源（binding 未就绪/缝缺席 = undefined） */
  readonly sourceOf?: (sessionId: string) => DraftSourceFace | undefined
  /** 草稿搬运（arm 换会话后把已键入首条消息 setDraft 到产物会话；previousSessionId
   * 在场时顺带清原会话草稿防幻影——均 best-effort，失败 = 草稿留在原会话不丢） */
  readonly carryDraft?: (sessionId: string, text: string, previousSessionId?: string) => Promise<boolean>
}

/** hero worktree inject face（1.29 形态——编排缝仅剩 arm 消费点；点选零编排） */
export interface HeroWorktreeFace {
  /** 官方 openSession（arm 换会话呈现） */
  readonly openSession: (sessionId: string) => void
  /** 空白会话按 cwd 反查（reuse-or-create——arm 重复消费不重复建会话） */
  readonly blankSessionByCwd?: (cwd: string) => string | undefined
  /** 账本快照源（arm 去重/重消费活源） */
  readonly sessionsList?: unknown
  /** composer 草稿缝（首条消息意图源 + 草稿搬运；缺席 = arm 不消费） */
  readonly composerDraft?: WorktreeComposerDraftFace
  /** 挂靠编排缝（arm 唯一消费点——sessionCreate/attach/openSession 一体；失败已由
   * 编排面 1.25 Toast 呈现，返回 null） */
  readonly orchestrate?: WorktreeOrchestrateFn
}

/**
 * 编排缝消费结果（arm 唯一消费点——点选不再触达）：sessionId = 编排产物（已 openSession，
 * 草稿搬运落点）；null = 失败（错误已由编排面 1.25 Toast 呈现，选中态同清）。
 */
export type WorktreeOrchestrateOutcome = string | null
export type WorktreeOrchestrateFn = (path: string) => Promise<WorktreeOrchestrateOutcome>
