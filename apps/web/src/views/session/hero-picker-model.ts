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
 * worktree 第二 chip 数据根（纯函数，fix-2 建立 / bug 10833861 修正）：
 * selectedId 官方语义 = workspaceId（owner 契约）——经 workspaceId 回查项目行取 ws_path；
 * 未选中/未命中 → 活跃（非归档）首个有 ws_path 的行兜底；全无 → null（chip 零注入退回现状）。
 * bug 10833861 Root cause: 原推导以 project.id 比对 workspaceId 恒 miss，fallback 又取
 * 全量首行（created_at 最早的归档项目，如非 git 的 learn）→ isGit=false 全零注入。
 */
export function selectedProjectRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
): string | null {
  const byWorkspace =
    selectedId !== undefined ? projects.find((project) => project.workspaceId === selectedId) : undefined
  if (byWorkspace !== undefined && byWorkspace.wsPath !== '') return byWorkspace.wsPath
  return projects.find((p) => p.archived !== true && p.wsPath !== undefined && p.wsPath !== '')?.wsPath ?? null
}

// ───────────── 1.25（bug af65c0a9）双静默路显式化：提示文案纯函数单源 ─────────────

/** worktree 注入面缺席提示（旧插件面/装配降级——不静默 no-op，官方 Toast 呈现） */
export function worktreeFaceUnavailableNotice(): string {
  return 'worktree 编排面不可用（插件版本陈旧？），未能进入所选 worktree'
}

/**
 * worktree 挂靠编排失败提示（含环节语义——sessionCreate / openSession 两步；
 * bug af65c0a9 Root cause: 原 onWorktreeSelect 编排失败 `.catch(() => {})` 静默吞错，
 * 用户点选后以为已进入 worktree，实际仍在默认主树会话里。
 */
export function worktreeOrchestrationNotice(stage: 'create' | 'open', cause: string): string {
  const stageText = stage === 'create' ? '创建挂靠会话' : '打开会话'
  return `worktree 挂靠失败（${stageText}）：${cause}，当前会话未切换`
}

// ───────────── 1.26 编排默认：账本快照读面（纯函数——plugin.ts 重导出单源） ─────────────

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
 * 主视图在留会话 cwd 解析（1.26 编排默认 arm 去重判定——`retainedBy.mainView > 0` 官方
 * publishMain 同判据，加读 cwd 字段）。快照缺席/形状漂移/无在留行 = undefined。
 */
export function activeSessionCwdOf(list: unknown): string | undefined {
  for (const row of Object.values(ledgerRowsOf(list) ?? {})) {
    const mainView = (row as { retainedBy?: { mainView?: unknown } } | null)?.retainedBy?.mainView
    const cwd = (row as { cwd?: unknown } | null)?.cwd
    if (typeof mainView === 'number' && mainView > 0 && typeof cwd === 'string' && cwd !== '') return cwd
  }
  return undefined
}

/**
 * 按 cwd 反查空白会话 id（1.26 双路不重复建会话——点选/arm 前 reuse-or-create 判定，
 * 官方 reuseOrCreateBlank 语义同构：`blank && cwd` 归一命中即复用，不再新建）。
 * 无命中/快照漂移 = undefined。
 */
export function blankSessionIdByCwdOf(list: unknown, cwd: string): string | undefined {
  const key = worktreeCwdKey(cwd)
  for (const [id, row] of Object.entries(ledgerRowsOf(list) ?? {})) {
    const blank = (row as { blank?: unknown } | null)?.blank
    const rowCwd = (row as { cwd?: unknown } | null)?.cwd
    if (blank === true && typeof rowCwd === 'string' && worktreeCwdKey(rowCwd) === key) {
      return id !== '' ? id : undefined
    }
  }
  return undefined
}

// ───────────── 1.27 必绑收紧：编排默认 arm 闸纯函数（主行同样进编排） ─────────────

/** arm 闸输入（挂载面效应读数的窄投影——判读单源，WorktreeFaces arm 效应消费） */
export interface ArmGateInput {
  /** 清单就绪且 isGit（能力位真） */
  readonly phaseReadyGit: boolean
  readonly path: string | undefined
  /** 失败/取消抑制集（1.25/1.26——失败循环零重入） */
  readonly suppressed: readonly string[]
  readonly rowPresent: boolean
  readonly isMain: boolean
  /** 当前主视图会话 cwd（账本活源；undefined = 无在留会话） */
  readonly currentCwd: string | undefined
}

/**
 * 编排默认 arm 闸（1.27 必绑收紧）：选中行在场即候选。树内行沿用 1.26 cwd 去重——
 * 当前 cwd 已在选中树 = 点选/先前编排已建（双路不重复建会话）；**主行不适用 cwd 去重**：
 * 官方新会话流的 blank 恒落项目根 cwd 且无绑定，「cwd 已在根」恰是须补绑定的待编排态，
 * 而非「已建」证据。既有无绑定历史会话不回填——本闸只在 hero/新会话阶段被消费，
 * 历史会话打开不进 hero 面（生效路径注记：仅对新建会话生效）。
 */
export function shouldArmSelectedRow(input: ArmGateInput): boolean {
  if (!input.phaseReadyGit) return false
  if (input.path === undefined) return false
  if (input.suppressed.includes(input.path)) return false
  if (!input.rowPresent) return false
  if (!input.isMain && input.currentCwd !== undefined && worktreeCwdKey(input.currentCwd) === worktreeCwdKey(input.path)) {
    return false
  }
  return true
}
