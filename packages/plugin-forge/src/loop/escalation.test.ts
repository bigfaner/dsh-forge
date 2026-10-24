// S1c · 第三层人工裁决挂钩单测（run-tasks-host-command/1.5 验收面）：userQuestions 载荷含
// reason 原文与处置历史；agent 经 resolveAgent(ownerSessionId) 随载；ask 面故障 fail-soft
// （裁决问询缺席 = 静默终局，循环终态不被拖垮）。裁决回执（2026-10-13 闭环断环修复）：
// 裁决/取消/投递失败三路回执经 notifyReceipt 送达主会话——人已答必须有回响。
import { describe, expect, it } from 'vitest'
import type { TaskSnapshot } from '@dsh-forge/contracts'
import { createUserQuestionsEscalation, renderEscalationAsk } from './escalation.js'
import type { EscalationAskFace, EscalationAskQuestion } from './escalation.js'
import type { LoopEscalation } from './driver.js'
import type { LoopSourceRef } from './registry.js'

const SOURCE: LoopSourceRef = { kind: 'feature', slug: 'feat-x' }
const OWNER = 'owner-session-1'

function task(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '4.2',
    source: { kind: 'feature', slug: 'feat-x' },
    title: '导出功能',
    taskType: 'coding-feature',
    taskStatus: 'blocked',
    breaking: false,
    complexity: 'medium',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...over,
  }
}

interface Built {
  ask: EscalationAskFace
  escalations: LoopEscalation[]
  questions: EscalationAskQuestion[]
  agents: unknown[]
  resolveAgent: ((sessionId: string) => unknown) | undefined
  failWith(cause: unknown): void
}

function build(escalation: LoopEscalation, resolveAgent?: (sessionId: string) => unknown): Built {
  const questions: EscalationAskQuestion[] = []
  const agents: unknown[] = []
  let cause: unknown
  const ask: EscalationAskFace = {
    ask: async (request) => {
      if (cause !== undefined) throw cause
      questions.push(...request.questions)
      agents.push(request.agent)
      return { answers: [] }
    },
  }
  return {
    ask,
    escalations: [escalation],
    questions,
    agents,
    resolveAgent,
    failWith: (c) => {
      cause = c
    },
  }
}

const FULL_REASON = '验收标准与任务硬规则冲突\n第二行细节 SECRET-DETAIL-99'

describe('问询材料（renderEscalationAsk——纯函数，reason 原文 + 处置历史全文）', () => {
  it('blocked-ask-user：detail 含 reason 原文（含换行全文）与处置历史逐行', () => {
    const material = renderEscalationAsk({
      kind: 'blocked-ask-user',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: task(),
      reason: FULL_REASON,
      history: ['第1次处置——决定创建修复任务（修 X）', '第2次处置——分析未得出结论', '第3次处置——请求人工裁决'],
    })
    expect(material.detail).toContain(FULL_REASON)
    expect(material.detail).toContain('- 第1次处置——决定创建修复任务（修 X）')
    expect(material.detail).toContain('- 第2次处置——分析未得出结论')
    expect(material.detail).toContain('- 第3次处置——请求人工裁决')
    expect(material.detail).toContain('任务: 4.2 导出功能')
    expect(material.question).toContain('feat-x/4.2')
    expect(material.options.length).toBeGreaterThanOrEqual(2)
  })

  it('disposition-over-limit：问题行带次数；fix-chain-over-limit：带深度与上限；halted：带原文 reason；deadlock：带阻塞清单', () => {
    const capped = renderEscalationAsk({
      kind: 'disposition-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: task(),
      reason: FULL_REASON,
      attempts: 3,
      history: ['第1次处置——分析未得出结论'],
    })
    expect(capped.question).toContain('3 次')
    expect(capped.detail).toContain(FULL_REASON)

    const chain = renderEscalationAsk({
      kind: 'fix-chain-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      task: task(),
      reason: FULL_REASON,
      depth: 7,
      limit: 6,
      history: [],
    })
    expect(chain.question).toContain('上限（6 级）')
    expect(chain.detail).toContain('修复链深度: 7（上限 6）')
    expect(chain.detail).not.toContain('处理历史') // 空历史 = 无历史行

    const halted = renderEscalationAsk({
      kind: 'halted',
      ownerSessionId: OWNER,
      source: SOURCE,
      attempts: 3,
      reason: '3 consecutive worker spawn failures',
    })
    expect(halted.detail).toContain('3 consecutive worker spawn failures')
    expect(halted.question).toContain('连续 3 次')

    const deadlock = renderEscalationAsk({
      kind: 'deadlock',
      ownerSessionId: OWNER,
      source: SOURCE,
      blockedItems: [{ taskKey: '3.1', note: '概览水化' }],
    })
    expect(deadlock.detail).toContain('- 3.1 概览水化')

    const abort = renderEscalationAsk({
      kind: 'worker-abort-over-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      taskKey: 'feat-x/2.5',
      attempts: 4,
    })
    expect(abort.question).toContain('4 次')

    const rateLimit = renderEscalationAsk({
      kind: 'rate-limit',
      ownerSessionId: OWNER,
      source: SOURCE,
      taskKey: 'feat-x/2.5',
      reason: 'provider error: 429 rate limit exceeded',
    })
    expect(rateLimit.question).toContain('流控')
    expect(rateLimit.detail).toContain('429 rate limit exceeded')
  })
})

describe('userQuestions 投递（ask 面——载荷与 fail-soft）', () => {
  it('载荷 = 单问询（reason 原文 + 处置历史在 detail）；agent 随 resolveAgent(ownerSessionId) 随载', async () => {
    const built = build(
      {
        kind: 'blocked-ask-user',
        ownerSessionId: OWNER,
        source: SOURCE,
        task: task(),
        reason: FULL_REASON,
        history: ['第1次处置——请求人工裁决'],
      },
      (sessionId) => ({ agentTag: sessionId }),
    )
    await createUserQuestionsEscalation({ ask: built.ask, resolveAgent: built.resolveAgent }).escalate(
      built.escalations[0] as LoopEscalation,
    )
    expect(built.questions).toHaveLength(1)
    const q = built.questions[0] as EscalationAskQuestion
    expect(q.id).toBe('forge-dispatch-adjudication')
    expect(q.detail).toContain(FULL_REASON)
    expect(q.detail).toContain('第1次处置——请求人工裁决')
    expect(q.options?.length).toBeGreaterThanOrEqual(2)
    expect(built.agents[0]).toEqual({ agentTag: OWNER })
  })

  it('resolveAgent 缺席 = 无 agent 键（无主问询形）；解析抛错 fail-soft 同径', async () => {
    const built = build({
      kind: 'halted',
      ownerSessionId: OWNER,
      source: SOURCE,
      attempts: 3,
      reason: 'r',
    })
    await createUserQuestionsEscalation({ ask: built.ask }).escalate(built.escalations[0] as LoopEscalation)
    expect(built.agents[0]).toBeUndefined()

    const throwing = build(
      {
        kind: 'halted',
        ownerSessionId: OWNER,
        source: SOURCE,
        attempts: 3,
        reason: 'r',
      },
      () => {
        throw new Error('registry gone')
      },
    )
    await expect(
      createUserQuestionsEscalation({ ask: throwing.ask, resolveAgent: throwing.resolveAgent }).escalate(
        throwing.escalations[0] as LoopEscalation,
      ),
    ).resolves.toBeUndefined()
    expect(throwing.questions).toHaveLength(1)
    expect(throwing.agents[0]).toBeUndefined()
  })

  it('ask 拒绝 fail-soft（NO_PROVIDER 级）——escalate 不抛，循环终态不被拖垮', async () => {
    const built = build({ kind: 'halted', ownerSessionId: OWNER, source: SOURCE, attempts: 3, reason: 'r' })
    built.failWith(new Error('NO_PROVIDER'))
    await expect(
      createUserQuestionsEscalation({ ask: built.ask }).escalate(built.escalations[0] as LoopEscalation),
    ).resolves.toBeUndefined()
    expect(built.questions).toHaveLength(0)
  })
})

describe('裁决回执（闭环断环修复——人已答必须有回响）', () => {
  interface ReceiptBuilt {
    readonly receipts: { sessionId: string; text: string; wakeup?: boolean; headline?: string }[]
    failWith(cause: unknown): void
    escalate(): Promise<void>
  }

  /** 回执形态桩：ask 脚本化应答/故障 + notifyReceipt 捕获 */
  function receiptOf(escalation: LoopEscalation, answer: unknown): ReceiptBuilt {
    const receipts: { sessionId: string; text: string; wakeup?: boolean; headline?: string }[] = []
    let cause: unknown
    const ask: EscalationAskFace = {
      ask: async () => {
        if (cause !== undefined) throw cause
        return answer
      },
    }
    return {
      receipts,
      failWith: (c: unknown) => {
        cause = c
      },
      escalate: () =>
        createUserQuestionsEscalation({
          ask,
          notifyReceipt: async (sessionId, text, options) => {
            receipts.push({ sessionId, text, wakeup: options?.wakeup, headline: options?.headline })
          },
        }).escalate(escalation),
    }
  }

  const BLOCKED: LoopEscalation = {
    kind: 'blocked-ask-user',
    ownerSessionId: OWNER,
    source: SOURCE,
    task: task(),
    reason: FULL_REASON,
    history: [],
  }

  it('选中「保持现状」→ 回执到达主会话（ownerSessionId 定向，含源行与任务键行）', async () => {
    const r = receiptOf(BLOCKED, { answers: [{ id: 'forge-dispatch-adjudication', selected: ['保持现状'] }] })
    await r.escalate()
    expect(r.receipts).toHaveLength(1)
    expect(r.receipts[0]?.sessionId).toBe(OWNER)
    expect(r.receipts[0]?.text).toContain('任务源: feat-x')
    expect(r.receipts[0]?.text).toContain('任务: feat-x/4.2 导出功能')
    expect(r.receipts[0]?.text).toContain('已收到「保持现状」')
    expect(r.receipts[0]?.text).toContain('保持当前状态')
    expect(r.receipts[0]?.headline).toBe('裁决已收到——保持现状')
    // loop-event-delivery 回执唤醒径：send(nextStep, true)——含答案文本且即时唤醒
    expect(r.receipts[0]?.wakeup).toBe(true)
  })

  it('选中「重新派发」→ 回执带 /run-dag-tasks <slug> 指引并明示不自动重启', async () => {
    const r = receiptOf(BLOCKED, { answers: [{ id: 'forge-dispatch-adjudication', selected: ['重新派发'] }] })
    await r.escalate()
    expect(r.receipts[0]?.text).toContain('/run-dag-tasks feat-x')
    expect(r.receipts[0]?.text).toContain('不自动重启')
    expect(r.receipts[0]?.headline).toBe('裁决已收到——重新派发')
  })

  it('取消两形（空应答 / ASK_ABORTED）→ 回执「问询已关闭（未选择）」', async () => {
    const empty = receiptOf(BLOCKED, { answers: [] })
    await empty.escalate()
    expect(empty.receipts[0]?.text).toContain('问询已关闭（未选择）')

    const aborted = receiptOf(BLOCKED, undefined)
    aborted.failWith(Object.assign(new Error('ask closed by user'), { name: 'AbortError' }))
    await aborted.escalate()
    expect(aborted.receipts[0]?.text).toContain('问询已关闭（未选择）')
  })

  it('通道故障（NO_PROVIDER）→ 回执「投递失败」带原因，escalate 不抛', async () => {
    const r = receiptOf(BLOCKED, undefined)
    r.failWith(new Error('NO_PROVIDER'))
    await expect(r.escalate()).resolves.toBeUndefined()
    expect(r.receipts[0]?.text).toContain('问询投递失败')
    expect(r.receipts[0]?.text).toContain('NO_PROVIDER')
    expect(r.receipts[0]?.headline).toBe('问询投递失败')
  })

  it('回执面抛错 = warn 降级不拖垮终态（选中形态也必须 resolves）', async () => {
    let calls = 0
    const ask: EscalationAskFace = {
      ask: async () => ({ answers: [{ id: 'forge-dispatch-adjudication', selected: ['保持现状'] }] }),
    }
    await expect(
      createUserQuestionsEscalation({
        ask,
        notifyReceipt: async () => {
          calls += 1
          throw new Error('channel gone')
        },
      }).escalate(BLOCKED),
    ).resolves.toBeUndefined()
    expect(calls).toBe(1)
  })

  it('halted 形（无 task/taskKey）→ 回执无任务行、源行在场', async () => {
    const r = receiptOf(
      { kind: 'halted', ownerSessionId: OWNER, source: SOURCE, attempts: 3, reason: 'r' },
      { answers: [{ id: 'forge-dispatch-adjudication', selected: ['保持现状'] }] },
    )
    await r.escalate()
    expect(r.receipts[0]?.text).toContain('任务源: feat-x')
    expect(r.receipts[0]?.text).not.toContain('任务:')
  })
})
