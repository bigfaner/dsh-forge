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
 * hero 默认拾取（bug 2ba146d8——纯函数单源）：选中态缺席/未命中行集（归档会话回 hero、
 * 冷启、未绑定工作区、已归档项目——归档行不可锚定既有语义）→ 第一个活跃项目行 id；
 * 已命中或行集空 → undefined（用户显式选中零覆盖 / 零项目直达添加流现状）。消费面
 * （ForgeHeroWorkspacePicker）经官方 owner onPick 链拾取——与用户点选同行同语义。
 */
export function heroDefaultPickId(
  rows: readonly HeroPickerRow[],
  selectedId: string | undefined,
): string | undefined {
  if (selectedProjectOf(rows, selectedId) !== undefined) return undefined
  return rows[0]?.id
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
 */
export function selectedProjectRootOf(
  projects: readonly ProjectSummary[],
  selectedId: string | undefined,
): string | null {
  return selectedProjectRootStrictOf(projects, selectedId)
  ?? projects.find((p) => p.archived !== true && p.wsPath !== undefined && p.wsPath !== '')?.wsPath
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
