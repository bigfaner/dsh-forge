// hero 工作区控件行映射纯函数（fix-24 ①；定位：业务——弹层列「项目」的映射面，官方
// WorkspacePickFlow 行语言同型：items 全量账本无过滤缝 → 产品经影子占用改列 forge 项目）。
// 口径（任务 fix-24 Description ①）：
//   - items = forge 项目（forge:projects/list → name；archived 排除——与左栏过滤口径一致）；
//   - 未绑定项目的工作区天然不出现（行源是项目不是账本——初版「选择器过滤」口径的子集覆盖）；
//   - 选中映射：owner selectedId（workspaceId）↔ 行 id（= project.workspaceId）恒等对照，
//     未绑定/已归档工作区无命中行（零高亮）；
//   - 空集 + 账面已定 → 「添加」为唯一入口（官方 addIsTheOnlyEntry 语义对齐，:1935-1943）。
// W3 arm 退役（session-binding-guarantee）：会话创建唯一时机 = 官方 create 调用点（wrap
// 改道预铸），点选 = 纯选中态 + 点选时点跨分支确认（1.19 语义回归）——编排闸/账本读面/
// 草稿缝/1.25 失败文案族随 arm 效应链一并退役，本文件只剩映射面 + 确认闩锁。
import type { ProjectSummary } from '@dsh-forge/contracts'

/** 弹层项目行（id = workspaceId——owner 契约 selectedId/onPick 零变化走官方链；wsPath = 树 ws 判据源） */
export interface HeroPickerRow {
  readonly id: string
  readonly name: string
  readonly wsPath: string
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
    rows.push({ id: project.workspaceId, name: project.name, wsPath: project.wsPath })
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

/** 路径归一（跨源比较键：反斜杠→斜杠 + 小写 + 去尾斜杠——worktree 选中记忆键同判） */
function normRootPath(value: string): string {
  const slashed = value.replaceAll('\\', '/')
  const trimmed = slashed.length > 1 && slashed.endsWith('/') ? slashed.slice(0, -1) : slashed
  return trimmed.toLowerCase()
}

/**
 * hero 默认拾取（bug 2ba146d8——纯函数单源）：选中态缺席/未命中行集（归档会话回 hero、
 * 冷启、未绑定工作区、已归档项目——归档行不可锚定既有语义）→ 第一个活跃项目行 id；
 * 已命中或行集空 → undefined（用户显式选中零覆盖 / 零项目直达添加流现状）。消费面
 * （ForgeHeroWorkspacePicker）经官方 owner onPick 链拾取——与用户点选同行同语义。
 * bug 9eb9d6cb：A2 后 selectedId 可合法指向树 workspace（官方 selectWorkspace 切树后
 * sessionWorkspace = 树 ws id，永不命中项目行）——官方快照中该 id 的 path 落在活跃项目
 * 根之下 = 合法选中，零拾取；数据缺席（快照未到）= 现状行为（d353536f 在场门兜住不盲拾）。
 */
export function heroDefaultPickId(
  rows: readonly HeroPickerRow[],
  selectedId: string | undefined,
  workspaceRows?: readonly unknown[],
): string | undefined {
  if (selectedProjectOf(rows, selectedId) !== undefined) return undefined
  if (selectedId !== undefined && workspaceRows !== undefined) {
    const path = workspaceRows.find(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        (row as { workspaceId?: unknown }).workspaceId === selectedId &&
        typeof (row as { path?: unknown }).path === 'string',
    ) as { path: string } | undefined
    if (path !== undefined) {
      const normalized = normRootPath(path.path)
      const underActiveProject = rows.some((row) => {
        const root = normRootPath(row.wsPath)
        return normalized === root || normalized.startsWith(`${root}/`)
      })
      if (underActiveProject) return undefined // 树 ws 合法选中——零拾取（bug 9eb9d6cb）
    }
  }
  return rows[0]?.id
}

/**
 * 默认拾取官方基线在场门（bug d353536f——纯函数单源）：官方 workspaces.list 快照含目标
 * workspaceId 才放行拾取。刷新后基线流未就位时盲拾取，官方 connectWorkspace 查客户端
 * 空快照必抛「unknown workspace」（新建会话失败 toast）且拾取闩已记账不再重试——前置
 * 事实（官方认识该工作区）不可证 = 不拾取，快照就位后由效应重渲染补拾取；真不在场
 * （未注册/已删工作区）= 永不盲拾取，fail-soft 回「选择工作区」现状（拾取闩口径不变）。
 */
export function heroDefaultPickReady(
  items: readonly { readonly workspaceId?: unknown }[] | null | undefined,
  defaultPickId: string | undefined,
): string | undefined {
  if (defaultPickId === undefined) return undefined
  if (items === null || items === undefined) return undefined
  const present = items.some(
    (row) => typeof row?.workspaceId === 'string' && row.workspaceId === defaultPickId,
  )
  return present ? defaultPickId : undefined
}

/**
 * worktree 数据根（严格段）：仅 selectedId 严格命中项目行时返回 ws_path；未选中/未命中/
 * 归档 → null（渲染兜底不消费——禁止兜底泄漏为绑定语义，无绑定工作区会话不得被指到别的
 * 项目树）。
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
 * worktree 第二 chip 数据根（纯函数，fix-2 建立 / bug 10833861 修正 / 1.31 A7 分离）：
 * selectedId 官方语义 = workspaceId（owner 契约）——经 workspaceId 回查项目行取 ws_path；
 * 未选中/未命中 → 活跃（非归档）首个有 ws_path 的行兜底（**仅渲染消费**——fallback 泄漏
 * 成绑定语义即跨项目错绑）；全无 → null。
 * bug 10833861 Root cause: 原推导以 project.id 比对 workspaceId 恒 miss，fallback 又取
 * 全量首行（created_at 最早的归档项目，如非 git 的 learn）→ isGit=false 全零注入。
 * bug 8a316608 Root cause: selectedId 可合法指向树 workspace（openWorkspace 切树后 owner
 * selectedId = 树 ws id，永不命中项目行），fallback 却取「首个活跃项目」——排序靠后项目
 * 的树选中态被锚到首个项目的清单，陈旧自愈随之跨项目错切。修复：官方快照在场时按树 ws
 * path 归属活跃项目根取所属项目（与 heroDefaultPickId bug 9eb9d6cb 同守卫同判）；
 * 快照缺席/不归属任何活跃项目 = 维持现状兜底。
 */
export function selectedProjectRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
  workspaceRows?: readonly unknown[],
): string | null {
  const strict = selectedProjectRootStrictOf(projects, selectedId)
  if (strict !== null) return strict
  if (selectedId !== undefined && workspaceRows !== undefined) {
    const path = workspaceRows.find(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        (row as { workspaceId?: unknown }).workspaceId === selectedId &&
        typeof (row as { path?: unknown }).path === 'string',
    ) as { path: string } | undefined
    if (path !== undefined) {
      const normalized = normRootPath(path.path)
      const owner = projects.find((p) => {
        if (p.archived === true) return false
        const root = normRootPath(p.wsPath ?? '')
        return root !== '' && (normalized === root || normalized.startsWith(`${root}/`))
      })
      if (owner !== undefined) return owner.wsPath
    }
  }
  return projects.find((p) => p.archived !== true && p.wsPath !== undefined && p.wsPath !== '')?.wsPath
  ?? null
}

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
