// 任务 2.1 测试 —— 状态机 transitionTargets 两 face（AC1：Interface 10——human = 七态 − 当前；
// agent = §3.1 转移矩阵）+ SC7 锚（AC2：from 不匹配 / 目标 ∉ transitionTargets / agent 面矩阵
// 非法格 → ERR_INVALID_TRANSITION 形状）+ 词汇 exhaustive 对齐（AC5：Record<TaskStatus,…>
// 编译期穷尽的运行期对照面）。权威来源：tech-design §Interface 1/10 + Per-Layer Test Plan
// 「SC7 六类：…transition from≠to+transitionTargets」+ db-schema §3.1 矩阵。
import {
  FEATURE_STATUSES,
  FEATURE_STATUS_LABELS,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import { InvalidTransitionError, isInvalidTransitionError } from './errors.js'
import { AGENT_TRANSITION_MATRIX, assertTransitionAllowed, transitionTargets } from './state-machine.js'

// ── AC1 human 面：七态 − 当前（from≠to 任意通道；行序 = TASK_STATUSES 序——菜单序稳定） ──

describe('AC1 transitionTargets · human 面（所见即所得数据面）', () => {
  for (const current of TASK_STATUSES) {
    it(`human('${current}') = 七态 − 自身（行序 = TASK_STATUSES 序）`, () => {
      expect(transitionTargets(current, 'human')).toEqual(TASK_STATUSES.filter((s) => s !== current))
    })
  }

  it('七态全覆盖后目标集恰为其余六态（from≠to 机械排除自身，无遗漏无自环）', () => {
    for (const current of TASK_STATUSES) {
      const targets = transitionTargets(current, 'human')
      expect(targets).not.toContain(current)
      expect(targets).toHaveLength(TASK_STATUSES.length - 1)
    }
  })

  it('返回全新数组（纯函数——调用方改写不污染后续计算与词汇源）', () => {
    const first = transitionTargets('pending', 'human')
    first.push('pending')
    first.shift()
    expect(transitionTargets('pending', 'human')).toEqual(TASK_STATUSES.filter((s) => s !== 'pending'))
  })
})

// ── AC1 agent 面：§3.1 转移矩阵逐格 pin（claim/submit 拥有的边——SC7 单测对象） ──

describe('AC1 transitionTargets · agent 面（§3.1 矩阵逐格）', () => {
  it('矩阵全表逐格 pin（行序 = §3.1 列序：in_progress | completed | blocked | pending）', () => {
    expect({ ...AGENT_TRANSITION_MATRIX }).toEqual({
      pending: ['in_progress'], // claimTask
      in_progress: ['completed', 'blocked'], // 仅经 submitTask（gate ✓ / result=blocked）
      blocked: ['in_progress', 'pending'], // claimTask 重派 / auto-restore（submit 钩子）
      suspended: [], // agent 面不可达
      completed: [],
      skipped: [],
      rejected: [],
    })
    for (const current of TASK_STATUSES) {
      expect(transitionTargets(current, 'agent')).toEqual([...AGENT_TRANSITION_MATRIX[current]])
    }
  })

  it('矩阵目标 ⊆ 七态词汇且无自环（from≠to）', () => {
    for (const current of TASK_STATUSES) {
      for (const to of AGENT_TRANSITION_MATRIX[current]) {
        expect(TASK_STATUSES).toContain(to)
        expect(to).not.toBe(current)
      }
    }
  })

  it('agent 面无 pending/suspended 出边语义抽样（§7-2 拆面关闭）', () => {
    expect(AGENT_TRANSITION_MATRIX.suspended).toEqual([])
    expect(AGENT_TRANSITION_MATRIX.completed).toEqual([])
    expect(AGENT_TRANSITION_MATRIX.skipped).toEqual([])
    expect(AGENT_TRANSITION_MATRIX.rejected).toEqual([])
  })
})

// ── AC2 SC7 锚：ERR_INVALID_TRANSITION 三形（from 不匹配 / 目标 ∉ 目标集 / agent 非法格） ──

describe('AC2 SC7 锚 · assertTransitionAllowed → ERR_INVALID_TRANSITION 形状', () => {
  it('from 不匹配：对 pending 任务 submitTask success（agent 面 pending→completed 无边）→ typed error', () => {
    let thrown: unknown
    try {
      assertTransitionAllowed('pending', 'completed', 'agent')
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(InvalidTransitionError)
    const err = thrown as InvalidTransitionError
    expect(err.code).toBe('ERR_INVALID_TRANSITION')
    expect(err.name).toBe('InvalidTransitionError')
    expect(err.data).toEqual({
      current: 'pending',
      to: 'completed',
      face: 'agent',
      allowed: ['in_progress'],
    })
    expect(err.message).toContain('pending → completed')
    expect(err.message).toContain('agent')
    expect(isInvalidTransitionError(err)).toBe(true)
  })

  it('目标 ∉ transitionTargets（human 面 to === current——转移对话框/服务端同源拒绝面）', () => {
    expect(() => assertTransitionAllowed('in_progress', 'in_progress', 'human')).toThrowError(InvalidTransitionError)
    expect(() => assertTransitionAllowed('suspended', 'suspended', 'human')).toThrowError(/ERR_INVALID_TRANSITION|suspended/)
  })

  it('agent 面矩阵非法格逐格拒绝（in_progress→pending / blocked→completed[TC-063] / 终态全部出边 / blocked→skipped）', () => {
    const illegal: ReadonlyArray<readonly [TaskStatus, TaskStatus]> = [
      ['in_progress', 'pending'],
      ['in_progress', 'suspended'],
      ['blocked', 'completed'],
      ['blocked', 'skipped'],
      ['pending', 'blocked'],
      ['pending', 'pending'],
      ['suspended', 'in_progress'],
      ['suspended', 'pending'],
      ['completed', 'in_progress'],
      ['completed', 'pending'],
      ['skipped', 'completed'],
      ['rejected', 'pending'],
    ]
    for (const [from, to] of illegal) {
      expect(() => assertTransitionAllowed(from, to, 'agent'), `${from} → ${to}`).toThrowError(InvalidTransitionError)
    }
  })

  it('合法格零误拒（正对照）：矩阵每格放行 + human 面抽样放行', () => {
    for (const current of TASK_STATUSES) {
      for (const to of AGENT_TRANSITION_MATRIX[current]) {
        expect(() => assertTransitionAllowed(current, to, 'agent')).not.toThrow()
      }
    }
    expect(() => assertTransitionAllowed('blocked', 'pending', 'human')).not.toThrow()
    expect(() => assertTransitionAllowed('completed', 'pending', 'human')).not.toThrow()
  })

  it('isInvalidTransitionError 对非本类异常为 false（运行期判别面）', () => {
    expect(isInvalidTransitionError(new Error('x'))).toBe(false)
    expect(isInvalidTransitionError('ERR_INVALID_TRANSITION')).toBe(false)
  })
})

// ── AC5 七态/六态/五态与 contracts 标签常量 exhaustive 对齐（编译期穷尽 Record 的运行期对照） ──

describe('AC5 词汇 exhaustive 对齐（状态机面 ↔ contracts 词汇与标签常量）', () => {
  it('agent 矩阵键集 ≡ TASK_STATUSES（Record<TaskStatus,…> 编译期穷尽的运行期证物）', () => {
    expect([...Object.keys(AGENT_TRANSITION_MATRIX).sort()]).toEqual([...TASK_STATUSES].sort())
  })

  it('两 face 目标恒 ⊆ 七态词汇', () => {
    for (const current of TASK_STATUSES) {
      for (const to of transitionTargets(current, 'human')) expect(TASK_STATUSES).toContain(to)
      for (const to of transitionTargets(current, 'agent')) expect(TASK_STATUSES).toContain(to)
    }
  })

  it('三域标签常量键集 ≡ 词汇全集（七态/六态/五态——跨包 exhaustive 对照）', () => {
    expect([...Object.keys(TASK_STATUS_LABELS).sort()]).toEqual([...TASK_STATUSES].sort())
    expect([...Object.keys(FEATURE_STATUS_LABELS).sort()]).toEqual([...FEATURE_STATUSES].sort())
    expect([...Object.keys(PROPOSAL_STATUS_LABELS).sort()]).toEqual([...PROPOSAL_STATUSES].sort())
  })
})
