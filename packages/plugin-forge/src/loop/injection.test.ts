// loop · 注入纯投影单测（3b——renderInjection 无影子状态 + 模板正本 + 占位符完整性校验）。
// 投影事实全读自 LoopRegistry 活登记：active 仅 owner 获 P1；suspended owner∪接管集获 P3+P9；
// 无命中空串（零固定税）；残留 <...> 占位符 = fail-soft 空串 + 告警；会话级单活（parts ≤1）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLoopRegistry } from './registry.js'
import type { LoopRecord } from './registry.js'
import type { LoopEscalation } from './driver.js'
import type { TaskSnapshot } from '@dsh-forge/contracts'
import {
  FORGE_DISPATCH_LOOP_SECTION_NAME,
  renderEndOfLoop,
  renderInjection,
  renderP1,
  renderP2,
  renderP9,
  payloadOf,
} from './injection.js'

/** 建活登记行（takeoverSessions 为必填集合字段——registry 同形） */
function recordOf(overrides: Partial<LoopRecord> & { id: string; ownerSessionId: string }): LoopRecord {
  return {
    source: { kind: 'proposal', slug: 'dispatch-loop-hardening' },
    projectId: 'proj-1',
    takeoverSessions: new Set<string>(),
    ...overrides,
  } as LoopRecord
}

const ESCALATION: LoopEscalation = {
  kind: 'blocked-ask-user',
  ownerSessionId: 'sess-a1',
  source: { kind: 'proposal', slug: 'dispatch-loop-hardening' },
  task: { slug: 'dispatch-loop-hardening', localId: '2.3', title: '挂起样例' } as TaskSnapshot,
  reason: '验收标准要求「全部测试通过」，但任务范围内 3 个既有用例与改动冲突，属规划缺口。',
  history: ['第1次处置——建议拆分剩余范围', '第2次处置——分析未得出结论'],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('renderInjection · registry 纯投影（无影子状态）', () => {
  it('active 相位：仅 owner 获 P1 驻留（slug 已替换、无占位符残留）；他会话空串', () => {
    const registry = createLoopRegistry()
    registry.register(recordOf({ id: 'loop-1', ownerSessionId: 'sess-a1' }))
    const owner = renderInjection('sess-a1', registry)
    expect(owner).toContain('【任务循环协作规则】')
    expect(owner).toContain('你已启动 dispatch-loop-hardening 的任务循环')
    expect(owner).not.toMatch(/<[^<>\n]+>/)
    expect(renderInjection('sess-b2', registry)).toBe('')
  })

  it('suspended 相位：owner 与接管集会话获 P3+P9 驻留；第三会话空串', () => {
    const registry = createLoopRegistry()
    const record = recordOf({ id: 'loop-1', ownerSessionId: 'sess-a1', suspended: { escalation: ESCALATION, since: 0 } })
    registry.register(record)
    const owner = renderInjection('sess-a1', registry)
    expect(owner).toContain('【任务循环挂起】')
    expect(owner).toContain('【任务循环已挂起·处理指引】')
    expect(owner).toContain('任务 dispatch-loop-hardening/2.3 以 blocked 结束')
    expect(owner).toContain('原因：验收标准要求「全部测试通过」')
    expect(owner).toContain('dispatch-loop-hardening 有一个挂起中的任务循环（任务 2.3')
    expect(owner).not.toMatch(/<[^<>\n]+>/)
    record.takeoverSessions.add('sess-take')
    const takeover = renderInjection('sess-take', registry)
    expect(takeover).toContain('【任务循环挂起】')
    expect(takeover).toContain('【任务循环已挂起·处理指引】')
    expect(renderInjection('sess-out', registry)).toBe('')
  })

  it('终局：registry.remove 后投影整体消失——空串零残留（与从未注册逐字节一致）', () => {
    const registry = createLoopRegistry()
    registry.register(recordOf({ id: 'loop-1', ownerSessionId: 'sess-a1' }))
    registry.remove('loop-1')
    expect(renderInjection('sess-a1', registry)).toBe('')
  })

  it('空 registry：空串（零固定税——无循环会话提示词零痕迹）', () => {
    expect(renderInjection('sess-a1', createLoopRegistry())).toBe('')
  })

  it('占位符完整性校验：载荷含残留尖括号文本 → fail-soft 空串 + 落盘告警，不外抛', () => {
    const registry = createLoopRegistry()
    registry.register(
      recordOf({
        id: 'loop-1',
        ownerSessionId: 'sess-a1',
        suspended: {
          escalation: {
            ...ESCALATION,
            reason: '原因里混入未替换占位 <unknown-token> 的形态',
          },
          since: 0,
        },
      }),
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(renderInjection('sess-a1', registry)).toBe('')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('forge:dispatch-loop')
    expect(warn.mock.calls[0]?.[0]).toContain('占位符')
  })
})

describe('renderInjection · 会话级单活投影', () => {
  it('每会话至多一段（parts ≤1）：多条可命中登记也只渲染第一段，无多段拼接', () => {
    const registry = createLoopRegistry()
    registry.register(recordOf({ id: 'loop-1', ownerSessionId: 'sess-a1' }))
    registry.register(recordOf({ id: 'loop-2', ownerSessionId: 'sess-a1', source: { kind: 'feature', slug: 'other' } }))
    const text = renderInjection('sess-a1', registry)
    expect(text).toBe(renderP1(payloadOf(registry.get('loop-1')!)))
    expect(text).not.toContain('other')
  })
})

describe('模板正本（P1–P9 + 结束族）', () => {
  const payload = payloadOf(
    recordOf({
      id: 'loop-1',
      ownerSessionId: 'sess-a1',
      inFlight: {
        taskRef: { slug: 'dispatch-loop-hardening', localId: '2.3' },
        taskKey: 'dispatch-loop-hardening/2.3',
        taskId: 'uuid',
        title: '样例',
      },
      suspended: { escalation: ESCALATION, since: 0 },
    }),
  )

  it('P1 协作规则：标题/分组/工具名逐字在场，slug 已替换', () => {
    const text = renderP1(payload)
    expect(text).toContain('**角色定位**')
    expect(text).toContain('**运行方式**')
    expect(text).toContain('- 停止循环：使用 stopTaskLoop 工具。')
    expect(text).toContain('dispatch-loop-hardening')
    expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('P2 守卫：slug 与 ownerSessionId 已替换', () => {
    const text = renderP2(payload)
    expect(text).toContain('【派发被拒】')
    expect(text).toContain('- dispatch-loop-hardening 已有正在运行的任务循环（发起会话 sess-a1）。')
    expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('P9 挂起处理指引：taskKey 呈现键为 slug/localId 短形', () => {
    const text = renderP9(payload)
    expect(text).toContain('- dispatch-loop-hardening 有一个挂起中的任务循环（任务 2.3，原因见上）。')
    expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('结束族 kind 分支互斥单选：finished-all 即 P8 评审指示（无重复结束块）；其余分支不追加', () => {
    const all = renderEndOfLoop('finished-all', payload)
    expect(all).toContain('【代码评审指示】')
    expect(all).not.toContain('【任务循环结束】')
    for (const kind of ['blocked-residue', 'spawn-failure', 'wait-timeout'] as const) {
      expect(renderEndOfLoop(kind, payload)).not.toContain('【代码评审指示】')
    }
    expect(renderEndOfLoop('spawn-failure', payload)).toContain('【任务循环终止·派发失败】')
    expect(renderEndOfLoop('wait-timeout', payload)).toContain('【任务循环终止·等待超时】')
  })

  it('P8 组装期单选（loop-review-experts）：expertsAvailable=true 双路措辞 / 缺席回落 subagent 分域，两态互斥零冗余', () => {
    const withExperts = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: true })
    expect(withExperts).toContain('双路交叉评审：architect（结构面')
    expect(withExperts).toContain('code-reviewer（范围面')
    expect(withExperts).toContain('主会话交叉比对后决断')
    expect(withExperts).not.toContain('subagent')
    const fallback = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: false })
    expect(fallback).toContain('派多个 subagent 分域交叉评审，各 agent 独立评审后汇总结论')
    expect(fallback).not.toContain('architect')
    expect(fallback).not.toContain('code-reviewer')
    // 缺省（字段缺席）= 回落口径——装配面注入前保守
    expect(renderEndOfLoop('finished-all', payload)).toContain('subagent 分域交叉评审')
  })

  it('结束族 blocked-residue：完成/阻塞计数已替换（counts 载荷驱动）', () => {
    const text = renderEndOfLoop('blocked-residue', { ...payload, completed: 3, blocked: 2 })
    expect(text).toContain('已完成 3，blocked 2。')
    expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('全部模板渲染产物零残留占位符（替换纪律——绝不把占位原文发给模型）', () => {
    const texts = [
      renderP1(payload),
      renderP2(payload),
      renderP9(payload),
      renderEndOfLoop('finished-all', { ...payload, completed: 1, blocked: 0 }),
      renderEndOfLoop('blocked-residue', { ...payload, completed: 0, blocked: 1 }),
      renderEndOfLoop('spawn-failure', payload),
      renderEndOfLoop('wait-timeout', payload),
    ]
    for (const text of texts) expect(text).not.toMatch(/<[^<>\n]+>/)
  })
})

describe('section 装配常量', () => {
  it('段名与 order 常量在场（index.ts 注册面同源）', async () => {
    expect(FORGE_DISPATCH_LOOP_SECTION_NAME).toBe('forge:dispatch-loop')
  })
})
