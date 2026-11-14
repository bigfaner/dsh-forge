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
  LOOP_REVIEW_EXPERT_KEYS,
  detectResidualPlaceholder,
  renderEndOfLoop,
  renderInjection,
  renderP1,
  renderP3,
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
    // 处置入口行（bug a058eaee——多挂起 DTO 组装径与 suspendWithWakeup 信息集对齐）
    expect(owner).toContain('处置入口：任意会话凭任务源 dispatch-loop-hardening dispatchTask 认领挂起循环继续处置')
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

  it('P3 挂起：slug/taskKey/reason 已替换（P2 守卫模板已删——生产拒绝径在 dispatch-task.ts 自建单分支文案）', () => {
    const text = renderP3(payload)
    expect(text).toContain('【任务循环挂起】')
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

  it('P8 组装期单选（loop-review-experts）：expertsAvailable=true 三路措辞 / 缺席回落 subagent 分域，两态互斥零冗余', () => {
    const withExperts = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: true })
    expect(withExperts).toContain('三路交叉评审：spec-reviewer（目标面')
    expect(withExperts).toContain('architecture-reviewer（结构面')
    expect(withExperts).toContain('code-reviewer（范围面')
    expect(withExperts).toContain('主会话交叉比对后决断')
    expect(withExperts).not.toContain('subagent')
    const fallback = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: false })
    expect(fallback).toContain('派多个 subagent 分域交叉评审，各 agent 独立评审后汇总结论')
    // 回落版零三路实名（防「措辞点名、档案缺席」错位反向残留）
    for (const key of LOOP_REVIEW_EXPERT_KEYS) expect(fallback).not.toContain(key)
    // 缺省（字段缺席）= 回落口径——装配面注入前保守
    expect(renderEndOfLoop('finished-all', payload)).toContain('subagent 分域交叉评审')
  })

  it('expertsAvailable 检测集与三路措辞同源（LOOP_REVIEW_EXPERT_KEYS 三键逐个出现在专家版渲染产物）', () => {
    expect([...LOOP_REVIEW_EXPERT_KEYS]).toEqual(['spec-reviewer', 'code-reviewer', 'architecture-reviewer'])
    const withExperts = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: true })
    for (const key of LOOP_REVIEW_EXPERT_KEYS) expect(withExperts).toContain(key)
  })

  it('结束族 blocked-residue：完成/阻塞计数已替换（counts 载荷驱动）', () => {
    const text = renderEndOfLoop('blocked-residue', { ...payload, completed: 3, blocked: 2 })
    expect(text).toContain('已完成 3，blocked 2。')
    expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('全部模板渲染产物零残留占位符（替换纪律——绝不把占位原文发给模型）', () => {
    const texts = [
      renderP1(payload),
      renderP3(payload),
      renderP9(payload),
      renderEndOfLoop('finished-all', { ...payload, completed: 1, blocked: 0 }),
      renderEndOfLoop('blocked-residue', { ...payload, completed: 0, blocked: 1 }),
      renderEndOfLoop('spawn-failure', payload),
      renderEndOfLoop('wait-timeout', payload),
    ]
    for (const text of texts) expect(text).not.toMatch(/<[^<>\n]+>/)
  })

  it('P1 渲染产物含测试边界纪律节与测试基线节（提案方案 1 措辞逐点在场）', () => {
    const text = renderP1(payload)
    // 测试边界纪律节
    expect(text).toContain('**测试边界纪律**')
    expect(text).toContain('正式代码路径不触达任何替身')
    expect(text).toContain('配套退出任务')
    expect(text).toContain('默认关闭 ≠ 边界正确')
    expect(text).toContain('超出任务范围或提案契约的改动不上')
    expect(text).toContain('偏差上抛主会话裁决，不就地改提案或交付')
    // 测试基线节（主会话职责——基线时点记录 + 缺席/过时按新回归上报）
    expect(text).toContain('**测试基线（主会话职责）**')
    expect(text).toContain('全量单元/集成测试')
    expect(text).toContain('记入测试基线文档')
    expect(text).toContain('修复任务结算后刷新基线')
    expect(text).toContain('默认按新回归上报')
    expect(text).toContain('宁误报不漏报')
  })

  it('P1 新增两节每节非空行 ≤3（按 **节名** 头行切节的纯函数断言）', () => {
    /** 按 **节名** 头行切节，取指定节内非空行数（编写期断言辅助——纯函数零状态） */
    const sectionLines = (text: string, header: string): string[] => {
      const lines = text.split('\n')
      const start = lines.findIndex((line) => line.trim() === header)
      expect(start).toBeGreaterThanOrEqual(0)
      const body: string[] = []
      for (let i = start + 1; i < lines.length; i += 1) {
        if (/^\*\*.+\*\*$/.test(lines[i]!.trim())) break
        if (lines[i]!.trim() !== '') body.push(lines[i]!.trim())
      }
      return body
    }
    const p1 = renderP1(payload)
    expect(sectionLines(p1, '**测试边界纪律**').length).toBeLessThanOrEqual(3)
    expect(sectionLines(p1, '**测试基线（主会话职责）**').length).toBeLessThanOrEqual(3)
  })

  it('P8_REVIEW_COMMON 含五关口全量测试边界评审条目（提案方案 3 逐点在场——两态共用）', () => {
    for (const mode of [true, false] as const) {
      const text = renderEndOfLoop('finished-all', { ...payload, expertsAvailable: mode })
      expect(text).toContain('正式代码路径是否触达测试替身')
      expect(text).toContain('e2e profile/回放配置替代真实实现的点名形态')
      expect(text).toContain('模拟轨与黑盒轨是否分别发现、执行和统计')
      expect(text).toContain('断言是否可实际失败')
      expect(text).toContain('验收目标/验收标准是否以替身混入为通过条件')
      expect(text).toContain('回放日志不证明真实供应商闭环')
      expect(text).toContain('观察证据不推断后端行为')
      expect(text).toContain('结果经公开接口核对')
      expect(text).toContain('独立出口/外部访问证据')
      expect(text).toContain('静态关键词命中只定位不定罪')
      expect(text).toContain('不连带删除测试侧 fake')
      expect(text).toContain('测试侧组合根')
      expect(text).toContain('正式装配的组合根不接受任何测试配置切换')
    }
  })

  it('detectResidualPlaceholder 对 P1/P8 全部新增行零残留（非占位符尖括号零豁免）', () => {
    const lines = [
      ...renderP1(payload).split('\n').filter((line) => line.startsWith('- ')),
      ...renderEndOfLoop('finished-all', { ...payload, expertsAvailable: true }).split('\n').filter((line) => line.startsWith('- ')),
    ]
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(detectResidualPlaceholder(line)).toBeUndefined()
  })
})

describe('section 装配常量', () => {
  it('段名与 order 常量在场（index.ts 注册面同源）', async () => {
    expect(FORGE_DISPATCH_LOOP_SECTION_NAME).toBe('forge:dispatch-loop')
  })
})
