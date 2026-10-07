// 终态判定纯函数（定位：业务——M3 4.4 UF-3 派发按钮可用态 + 双路由第一判据单源）。
// 口径同源：终态集 = core 相位推导机 TERMINAL_TASK_STATUSES（packages/core/src/forge/
// tasks/phase-deriver.ts——§6-29 全终态 → completed 判据）——renderer 禁 import core
//（运行期边界①），本地镜像声明（ModeChip MODES 同先例）；值漂移由 5.1 契约 pin 与
// e2e 对账承接。判据输入纪律：**stats 单源**（tasks.stats 未过滤七态计数）——load.cards
// 是服务端 statusFilter/search 过滤集，不可作可用态判据（过滤出未终态 ≠ 容器有未终态）。
import type { TaskCard, TaskStatus, TaskStats } from '@dsh-forge/contracts'

/** 终态集（相位推导机口径同源镜像：completed/skipped/rejected——rejected 不满足前置但计入终态） */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'skipped', 'rejected']

/** 未终态集（ui-design v22 ㊱ 明文四值：pending/in_progress/blocked/suspended） */
export const NON_TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'blocked', 'suspended']

/** 终态判定（单状态——七态穷尽两分） */
export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return (TERMINAL_TASK_STATUSES as readonly TaskStatus[]).includes(status)
}

/**
 * 未终态成员投影（AC3——卡片集形态：容器全集喂入时 = 可派发任务清单）。
 * 注意：喂入集须为容器全集（无过滤 listTasks/taskGraph.tasks）；服务端过滤集
 * （chips/搜索）作输入会低估可用态——按钮判据走 stats 单源形态。
 */
export function nonTerminalOf(cards: readonly TaskCard[]): readonly TaskCard[] {
  return cards.filter((card) => !isTerminalTaskStatus(card.taskStatus))
}

/** 未终态计数（stats 单源——四未终态之和；与终态互补 total） */
export function nonTerminalCountOf(stats: TaskStats): number {
  return NON_TERMINAL_TASK_STATUSES.reduce((sum, status) => sum + (stats.byStatus[status] ?? 0), 0)
}

/** 派发可用态（AC3：存在未终态 → 亮起；全终态/零任务 → 置灰） */
export function hasNonTerminalTask(stats: TaskStats): boolean {
  return nonTerminalCountOf(stats) > 0
}

/**
 * 执行中任务（AC4 双路由第一判据）：in_progress 末位（列表序最新——claim 派发即置
 * in_progress，末位 = 最近接管者）。blocked/pending 不算执行中（无在场派发循环）。
 */
export function runningTaskOf(cards: readonly TaskCard[]): TaskCard | undefined {
  const running = cards.filter((card) => card.taskStatus === 'in_progress')
  return running[running.length - 1]
}
