import { describe, expect, it } from 'vitest'
import { diffProjection, type ReconcileVerdict } from '../src/main/workbench/projection/diff.ts'
import {
  nextProjectionState,
  PROJECTION_TRANSITIONS,
  reconcileVerdictEvent,
  type ProjectionEvent,
} from '../src/main/workbench/projection/state-machine.ts'
import type { ProjectionState } from '../src/main/workbench/projection/index.ts'

// 任务 3.1 — 投影状态机纯函数(tech-design §Cross-Layer「pending→healthy/
// degraded/deviation」+ AC「含恢复 healthy 重试路径」)。全矩阵裁决,无非法
// 边(4 态 × 4 事件 total);偏差明细不落表 —— 状态机只裁状态,DeviationRow
// 由 diff 对账重算物化。

const STATES: readonly ProjectionState[] = ['pending', 'healthy', 'degraded', 'deviation']
const EVENTS: readonly ProjectionEvent[] = ['push_succeeded', 'push_failed', 'reconcile_match', 'reconcile_drift']

/** verdict → 事件的非空收紧(match/drift 恒有事件;null 即测试失败)。 */
function eventOf(verdict: ReconcileVerdict): ProjectionEvent {
  const event = reconcileVerdictEvent(verdict)
  if (event === null) throw new Error(`verdict ${verdict} must map to a transition event`)
  return event
}

/** 期望终态矩阵(行 = 现态,列 = 事件;与 PROJECTION_TRANSITIONS 逐格互证)。 */
const EXPECTED: Record<ProjectionState, Record<ProjectionEvent, ProjectionState>> = {
  pending: { push_succeeded: 'healthy', push_failed: 'degraded', reconcile_match: 'healthy', reconcile_drift: 'deviation' },
  healthy: { push_succeeded: 'healthy', push_failed: 'degraded', reconcile_match: 'healthy', reconcile_drift: 'deviation' },
  degraded: { push_succeeded: 'healthy', push_failed: 'degraded', reconcile_match: 'healthy', reconcile_drift: 'deviation' },
  deviation: { push_succeeded: 'healthy', push_failed: 'degraded', reconcile_match: 'healthy', reconcile_drift: 'deviation' },
}

describe('projection state-machine — 4 态 × 4 事件全矩阵', () => {
  it('逐格裁决与期望矩阵一致(push_succeeded/reconcile_match → healthy;push_failed → degraded;reconcile_drift → deviation)', () => {
    for (const from of STATES) {
      for (const event of EVENTS) {
        expect(nextProjectionState(from, event), `${from} + ${event}`).toBe(EXPECTED[from][event])
      }
    }
  })

  it('规则表 = 16 条且 (from, event) 唯一(全矩阵无通配无缺格)', () => {
    expect(PROJECTION_TRANSITIONS).toHaveLength(STATES.length * EVENTS.length)
    const keys = new Set(PROJECTION_TRANSITIONS.map(rule => `${rule.from}+${rule.event}`))
    expect(keys.size).toBe(PROJECTION_TRANSITIONS.length)
    for (const from of STATES) {
      for (const event of EVENTS) expect(keys.has(`${from}+${event}`)).toBe(true)
    }
  })

  it('恢复 healthy 重试路径:degraded --push_succeeded--> healthy;deviation --push_succeeded--> healthy(幂等全量重推收敛)', () => {
    expect(nextProjectionState('degraded', 'push_succeeded')).toBe('healthy')
    expect(nextProjectionState('deviation', 'push_succeeded')).toBe('healthy')
    // 重试再失败停留 degraded(重试入口常在)。
    expect(nextProjectionState('degraded', 'push_failed')).toBe('degraded')
  })

  it('对账 verdict → 事件桥:match/drift 迁移,unprojected/archived 不迁移', () => {
    expect(reconcileVerdictEvent('match')).toBe('reconcile_match')
    expect(reconcileVerdictEvent('drift')).toBe('reconcile_drift')
    expect(reconcileVerdictEvent('unprojected')).toBeNull()
    expect(reconcileVerdictEvent('archived')).toBeNull()
  })

  it('verdict 事件经状态机收敛:pending 存量收数 → healthy;手改 → deviation → 重推 → healthy', () => {
    const matchEvent = eventOf('match')
    const driftEvent = eventOf('drift')
    // 存量收数:从未推送但实况同名在场(match)→ pending 收敛 healthy。
    expect(nextProjectionState('pending', matchEvent)).toBe('healthy')
    // 手改 → deviation;幂等全量重推成功 → healthy。
    const drifted = nextProjectionState('healthy', driftEvent)
    expect(drifted).toBe('deviation')
    expect(nextProjectionState(drifted, 'push_succeeded')).toBe('healthy')
  })
})

describe('projection state-machine — diff verdict 联动(纯数据桥)', () => {
  it('diff verdict 与状态机词表闭环:drift 行携带偏差明细(不落表,重算物化)', () => {
    const result = diffProjection(
      [{ projectId: 'a', path: '/p/a', expectedTitle: 'A', orderIdx: 0, archived: false, pushedWorkspaceId: 'ws-1', pushedTitle: 'A', pushedAt: null, lastError: null }],
      [{ workspaceId: 'ws-1', path: '/p/a', title: 'X', orderIdx: 0 }],
    )
    const row = result.rows[0]
    if (row === undefined) throw new Error('reconcile row missing')
    expect(row.verdict).toBe('drift')
    expect(row.deviations.map(deviation => deviation.type)).toEqual(['renamed'])
    expect(eventOf(row.verdict)).toBe('reconcile_drift')
  })
})
