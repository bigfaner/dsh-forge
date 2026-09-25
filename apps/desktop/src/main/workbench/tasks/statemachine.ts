// workbench/tasks/statemachine — 7 态任务状态机(任务 1.2)。
// 移植基准唯一 = forge-cli pkg/task/statemachine.go,逐函数核对:
//   TransitionRole / TransitionError / transitionTable(首条匹配即裁决)
//   / ValidateTransition / CheckTransitionDeps / canAutoUnblock / isFixType。
// er-diagram 不变式:task.status 迁移仅经内核状态机合法边 —— 本模块即
// 该合法边矩阵的唯一权威(写集入口由任务 1.3 接 SQLite 仓储时接线)。

import { getUnmetDeps } from './deps.ts'
import { isTerminalStatus, type Task, type TaskIndex } from './model.ts'

/** 迁移发起角色(动词面 → 角色):submit/claim/reopen/auto/manual。 */
export const ROLES = ['submit', 'claim', 'reopen', 'auto', 'manual'] as const
export type TransitionRole = (typeof ROLES)[number]

/** 非法迁移错误:字段与消息格式与 Go TransitionError 逐字对齐(对拍断言)。 */
export class TransitionError extends Error {
  readonly from: string
  readonly to: string
  readonly role: TransitionRole
  /** 人类可读的拒绝原因(Go GuardMsg)。 */
  readonly guardMsg: string

  constructor(from: string, to: string, role: TransitionRole, guardMsg: string) {
    super(`invalid transition ${from} -> ${to} (role=${role}): ${guardMsg}`)
    this.name = 'TransitionError'
    this.from = from
    this.to = to
    this.role = role
    this.guardMsg = guardMsg
  }
}

/** 迁移规则表条目:`*` 通配任意状态;空 role 匹配任意角色。 */
interface TransitionRule {
  readonly from: string
  readonly to: string
  readonly role: TransitionRole | ''
  readonly allowed: boolean
  readonly guardMsg: string
}

/**
 * 迁移规则表 = 状态校验唯一权威(Go transitionTable,顺序即优先级,
 * 首条匹配即裁决)。表内容与 Go 逐条一致(23 条),不得重排或改写。
 */
export const TRANSITION_TABLE: readonly TransitionRule[] = [
  // 终态:completed 不可逆
  { from: 'completed', to: '*', role: '', allowed: false, guardMsg: 'task already completed, create a subtask if re-work needed' },

  // 终态:rejected 仅可经 reopen 回 pending
  { from: 'rejected', to: 'pending', role: 'reopen', allowed: true, guardMsg: '' },
  { from: 'rejected', to: '*', role: '', allowed: false, guardMsg: 'task rejected, use forge task reopen' },

  // 终态:skipped 仅可经 reopen 回 pending
  { from: 'skipped', to: 'pending', role: 'reopen', allowed: true, guardMsg: '' },
  { from: 'skipped', to: '*', role: '', allowed: false, guardMsg: 'task skipped, use forge task reopen' },

  // suspended 不可直达 completed(须先恢复)——置于通用 submit 规则之前
  { from: 'suspended', to: 'completed', role: '', allowed: false, guardMsg: 'use forge task transition to resume task first' },

  // 仅 submit 可达 completed
  { from: '*', to: 'completed', role: 'submit', allowed: true, guardMsg: '' },
  { from: '*', to: 'completed', role: '', allowed: false, guardMsg: 'use forge task submit' },

  // submit 可将 in_progress 自动降级为 blocked
  { from: 'in_progress', to: 'blocked', role: 'submit', allowed: true, guardMsg: '' },

  // 人工接管:操作者可解锁或裁决任意非终态任务
  { from: 'blocked', to: 'pending', role: 'manual', allowed: true, guardMsg: '' },
  { from: 'blocked', to: 'in_progress', role: 'manual', allowed: true, guardMsg: '' },

  // blocked -> pending/in_progress 其余角色须先过依赖检查(phase 2)
  { from: 'blocked', to: 'pending', role: '', allowed: false, guardMsg: 'dependencies must be checked first' },
  { from: 'blocked', to: 'in_progress', role: '', allowed: false, guardMsg: 'dependencies must be checked first' },

  // pending -> blocked 恒允许(block-source、依赖等待)
  { from: 'pending', to: 'blocked', role: '', allowed: true, guardMsg: '' },

  // --- suspended:操作者手动挂起 ---
  // 仅 manual 可进入 suspended(自任意非终态)
  { from: '*', to: 'suspended', role: 'manual', allowed: true, guardMsg: '' },
  { from: '*', to: 'suspended', role: '', allowed: false, guardMsg: 'use forge task transition to suspend tasks' },
  // 自 suspended 的人工恢复
  { from: 'suspended', to: 'pending', role: 'manual', allowed: true, guardMsg: '' },
  { from: 'suspended', to: 'in_progress', role: 'manual', allowed: true, guardMsg: '' },
  // 自 suspended 的人工终局裁决
  { from: 'suspended', to: 'skipped', role: 'manual', allowed: true, guardMsg: '' },
  { from: 'suspended', to: 'rejected', role: 'manual', allowed: true, guardMsg: '' },
  // 系统迁移自 suspended 到 blocked 被拒(须先恢复)
  { from: 'suspended', to: 'blocked', role: '', allowed: false, guardMsg: 'use forge task transition to resume suspended task' },

  // reopen 仅适用于 rejected/skipped -> pending(上方已处理);
  // 对非终态使用 reopen 非法
  { from: '*', to: '*', role: 'reopen', allowed: false, guardMsg: 'reopen is only for rejected or skipped tasks' },

  // 同态迁移:no-op,恒允许(终态已被上方规则拦截)
  { from: '*', to: '*', role: '', allowed: true, guardMsg: '' },
]

/** Go matchRule:通配符与空 role 的匹配语义。 */
function matchRule(rule: TransitionRule, from: string, to: string, role: TransitionRole): boolean {
  if (rule.from !== '*' && rule.from !== from) return false
  if (rule.to !== '*' && rule.to !== to) return false
  if (rule.role !== '' && rule.role !== role) return false
  return true
}

/**
 * 校验状态迁移(phase 1,纯函数,无数据查询):合法返回 null,
 * 非法返回 TransitionError。blocked -> pending/in_progress(非 manual)
 * 在此返回"须先过依赖检查"错误 —— phase 2 见 checkTransitionDeps。
 */
export function validateTransition(current: string, target: string, role: TransitionRole): TransitionError | null {
  for (const rule of TRANSITION_TABLE) {
    if (matchRule(rule, current, target, role)) {
      if (rule.allowed) return null
      return new TransitionError(current, target, role, rule.guardMsg)
    }
  }
  // 无规则命中:默认放行(开放迁移)——与 Go 兜底一致(表尾通配使此路径不可达)
  return null
}

/** checkTransitionDeps 结果:unmet 与 error 互斥(error 非空时 unmet 为 null)。 */
export interface CheckTransitionDepsResult {
  readonly unmet: readonly string[] | null
  readonly error: string | null
}

/**
 * blocked -> pending/in_progress 的依赖满足校验(phase 2;在
 * validateTransition 指示需要依赖检查后调用)。委托 getUnmetDeps 做通配
 * 感知解析;全部满足时再校验 canAutoUnblock(活跃 fix-task 拦截)。
 */
export function checkTransitionDeps(index: TaskIndex, taskId: string): CheckTransitionDepsResult {
  const t = index.byId(taskId)
  if (t === undefined) {
    return { unmet: null, error: `task not found: ${taskId}` }
  }

  const unmet = getUnmetDeps(index, taskId, t.dependencies)
  if (unmet !== null && unmet.length > 0) {
    return { unmet, error: null }
  }

  if (!canAutoUnblock(index, taskId)) {
    return { unmet: ['active fix-task exists'], error: null }
  }

  return { unmet: null, error: null }
}

/** 无活跃 fix-task 指向该任务时才允许自动解锁。 */
function canAutoUnblock(index: TaskIndex, taskId: string): boolean {
  for (const t of index.tasksMap().values()) {
    if (t.sourceTaskID === taskId && isActiveFixTask(t)) return false
  }
  return true
}

/** fix 型任务 + 非终态 = 活跃。 */
function isActiveFixTask(t: Task): boolean {
  if (!isFixType(t.type ?? '')) return false
  return !isTerminalStatus(t.status)
}

/** fix 类型判定:coding.fix(含 `coding.fix.*` 前缀变体)或 doc.fix。 */
function isFixType(typ: string): boolean {
  return typ === 'coding.fix' || typ.startsWith('coding.fix') || typ === 'doc.fix'
}
