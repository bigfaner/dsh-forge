// workbench/projection/state-machine — 投影状态机纯函数(任务 3.1)。
//
// 词表 = schema-v3 projects.projection_state CHECK 4 值(repos/types
// ProjectionState 同源):pending(待对账收数/未投影)→ healthy(最近验证
// 一致:push 成功或对账 match)/ degraded(push 失败,可重试;last_error
// 落表)/ deviation(对账检出 dsh 侧手改,偏差明细不落表——对账重算物化)。
//
// 迁移规则(tech-design §Cross-Layer:pending→healthy/degraded/deviation;
// 恢复 healthy 重试路径):4 态 × 4 事件全矩阵(totality —— 任意组合均有
// 裁决,未知组合防御性保持现态)。优先级语义:
//   - push_succeeded:幂等全量重推成功 → 恒 healthy(degraded 重试恢复、
//     deviation 重推收敛同径);
//   - push_failed:任何现态 → degraded(重试入口常在,偏差与降级并存时
//     以可操作态为先);
//   - reconcile_drift:对账检出手改 → deviation(仅呈现,BIZ-006);
//   - reconcile_match:对账验证一致 → healthy(含 degraded 期间实况已被
//     用户手动修正为期望态的场景)。
// 偏差明细与状态迁移解耦:本模块只裁状态;DeviationRow 由 diff 重算供给。

import type { ProjectionState } from '../repos/types.ts'
import type { ReconcileVerdict } from './diff.ts'

/** 状态机输入事件(push 面 = relay outcome;reconcile 面 = diff verdict)。 */
export type ProjectionEvent = 'push_succeeded' | 'push_failed' | 'reconcile_match' | 'reconcile_drift'

/** 迁移规则表条目(from×event → to;全矩阵,无通配)。 */
export interface ProjectionTransitionRule {
  readonly from: ProjectionState
  readonly event: ProjectionEvent
  readonly to: ProjectionState
}

/**
 * 迁移规则表 = 投影状态机唯一权威(4 态 × 4 事件全 16 条;顺序无优先级
 * 语义,from×event 唯一命中)。
 */
export const PROJECTION_TRANSITIONS: readonly ProjectionTransitionRule[] = [
  // pending:首推成功/收数验证 → healthy;首推失败 → degraded;存量收数
  // 检出手改(理论边缘:从未成功推送却已有实况漂移)→ deviation;收数
  // 验证一致(adopted)→ healthy。
  { from: 'pending', event: 'push_succeeded', to: 'healthy' },
  { from: 'pending', event: 'push_failed', to: 'degraded' },
  { from: 'pending', event: 'reconcile_drift', to: 'deviation' },
  { from: 'pending', event: 'reconcile_match', to: 'healthy' },
  // healthy:稳态自旋;push 失败降级;对账手改 → deviation;验证一致自旋。
  { from: 'healthy', event: 'push_succeeded', to: 'healthy' },
  { from: 'healthy', event: 'push_failed', to: 'degraded' },
  { from: 'healthy', event: 'reconcile_drift', to: 'deviation' },
  { from: 'healthy', event: 'reconcile_match', to: 'healthy' },
  // degraded:重试成功恢复 healthy(AC「含恢复 healthy 重试路径」);再失败
  // 自旋;对账检出漂移 → deviation;实况已一致(如用户手改恰好落到期望
  // 态)→ healthy。
  { from: 'degraded', event: 'push_succeeded', to: 'healthy' },
  { from: 'degraded', event: 'push_failed', to: 'degraded' },
  { from: 'degraded', event: 'reconcile_drift', to: 'deviation' },
  { from: 'degraded', event: 'reconcile_match', to: 'healthy' },
  // deviation:幂等全量重推成功收敛 → healthy;重推失败 → degraded(重试
  // 优先呈现);漂移持续自旋;用户手动复原 → healthy。
  { from: 'deviation', event: 'push_succeeded', to: 'healthy' },
  { from: 'deviation', event: 'push_failed', to: 'degraded' },
  { from: 'deviation', event: 'reconcile_drift', to: 'deviation' },
  { from: 'deviation', event: 'reconcile_match', to: 'healthy' },
]

/** 未知组合(未来扩态防御)保持现态:状态机永不因裁不出而抛错。 */
export function nextProjectionState(current: ProjectionState, event: ProjectionEvent): ProjectionState {
  for (const rule of PROJECTION_TRANSITIONS) {
    if (rule.from === current && rule.event === event) return rule.to
  }
  return current
}

/**
 * 对账 verdict → 迁移事件(diff 与状态机的桥;3.2 对账 service 消费):
 * match → reconcile_match;drift → reconcile_drift;unprojected(投影未
 * 建立/待收敛 op,无偏差)与 archived(归档不对账)→ null 不迁移。
 */
export function reconcileVerdictEvent(verdict: ReconcileVerdict): ProjectionEvent | null {
  if (verdict === 'match') return 'reconcile_match'
  if (verdict === 'drift') return 'reconcile_drift'
  return null
}
