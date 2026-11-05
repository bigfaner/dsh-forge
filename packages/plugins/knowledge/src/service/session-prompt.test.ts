// stage③ C2 单测——session-bind scoped 注册接线（提案 §2.2 裁决 #9）：
// 绑定会话在该会话 scope 注册两段（闭包捕获 ws_path）、未绑定不注册、
// 注册库消失两段空返 ''（同生同退）、fail-soft。
import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_DOMAINS_SECTION_NAME,
  KNOWLEDGE_DOMAINS_SECTION_ORDER,
  KNOWLEDGE_SECTION_NAME,
  KNOWLEDGE_SECTION_ORDER,
} from '../prompt/index.js'
import { bindKnowledgePromptSections, registerKnowledgeScopedPrompt } from './session-prompt.js'
import type { KnowledgePromptSection, ScopedAgentFace } from '../tools/faces.js'
import type { DomainIndexRow } from './internal.js'

const WS = 'C:/ws/a'
const OTHER = 'C:/ws/other'

/** 假装配：捕获 agent/created 订阅器；注册库集合与顶域供数可变（实时求值断言用） */
function mount() {
  const handlers: Array<(payload: { agent: ScopedAgentFace }) => unknown> = []
  const registered = new Set<string>([WS])
  const stats: DomainIndexRow[] = [{ domainPath: 'conventions', entryCount: 3, depth: 1, description: '约束' }]
  const topCalls: string[] = []
  let offCalls = 0
  const dispose = registerKnowledgeScopedPrompt({
    on: (_event, handler) => {
      handlers.push(handler)
      return () => {
        offCalls += 1
      }
    },
    resolveProjectId: (cwd) => (cwd === WS ? 'p-1' : undefined),
    resolveWsPath: (projectId) => (projectId === 'p-1' ? WS : undefined),
    isRegistered: (wsPath) => registered.has(wsPath),
    topDomains: (wsPath) => {
      topCalls.push(wsPath)
      return [...stats]
    },
  })
  /** 模拟一次 agent/created：返回该 agent scope 捕获到的段集 */
  const fire = (agent: unknown): KnowledgePromptSection[] => {
    const sections: KnowledgePromptSection[] = []
    const scoped = agent as { ctx?: { systemPrompt?: { section(s: KnowledgePromptSection): () => void } } }
    const real = scoped.ctx?.systemPrompt
    if (real !== undefined) {
      // 借真注册面：以捕获包装层替换（保持 agent 结构不动）
      const wrapped = { section: (s: KnowledgePromptSection) => (sections.push(s), () => undefined) }
      ;(scoped.ctx as { systemPrompt: unknown }).systemPrompt = wrapped
    }
    for (const h of handlers) h({ agent: agent as ScopedAgentFace })
    if (real !== undefined) (scoped.ctx as { systemPrompt: unknown }).systemPrompt = real
    return sections
  }
  /** 构造假 agent（session cwd + agent-scoped ctx 段捕获面） */
  const agent = (cwd: string | undefined, withCtx = true): unknown => ({
    session: { id: 's-1', ...(cwd === undefined ? {} : { header: { cwd } }) },
    ...(withCtx
      ? { ctx: { systemPrompt: { section: (s: KnowledgePromptSection) => (([] as KnowledgePromptSection[]).push(s), () => undefined) } } }
      : {}),
  })
  return { dispose, off: () => offCalls, fire, agent, registered, stats, topCalls }
}

describe('绑定会话注入（session-bind 时刻 scoped 注册）', () => {
  it('cwd 命中绑定行且注册库在场 → 该会话 scope 注册两段 910/911；text 闭包实时求值（顶域聚合经 ws_path）', () => {
    const r = mount()
    const sections = r.fire(r.agent(WS))
    expect(sections.map((s) => s.name)).toEqual([KNOWLEDGE_SECTION_NAME, KNOWLEDGE_DOMAINS_SECTION_NAME])
    expect(sections[0]?.order).toBe(910)
    expect(sections[1]?.order).toBe(911)
    expect((sections[0]!.text as () => string)()).toContain('<knowledge-base>')
    const dynamic = (sections[1]!.text as () => string)()
    expect(dynamic).toContain('conventions(3 篇) — 约束')
    expect(r.topCalls).toEqual([WS]) // 闭包捕获 ws_path——每 turn 求值透传
  })

  it('同生同退：注册库消失（注销后）两段 text 均空返 \'\'（空段在官方装配期自然退场）', () => {
    const r = mount()
    const sections = r.fire(r.agent(WS))
    r.registered.delete(WS)
    expect((sections[0]!.text as () => string)()).toBe('')
    expect((sections[1]!.text as () => string)()).toBe('')
  })

  it('实时性：动态段随顶域聚合变化（write 新域 → 下一 turn 求值得新清单，非注册时点冻结）', () => {
    const r = mount()
    const sections = r.fire(r.agent(WS))
    r.stats.push({ domainPath: 'fresh', entryCount: 1, depth: 1, description: null })
    const dynamic = (sections[1]!.text as () => string)()
    expect(dynamic).toContain('conventions(3 篇) — 约束')
    expect(dynamic).toContain('fresh(1 篇) — <无简介>')
  })
})

describe('未绑定不注册（自然退场）', () => {
  it('cwd 无绑定行 → 该会话 scope 零注册', () => {
    const r = mount()
    expect(r.fire(r.agent(OTHER))).toEqual([])
  })

  it('无会话 cwd（非 agent 上下文）→ 零注册', () => {
    const r = mount()
    expect(r.fire(r.agent(undefined))).toEqual([])
  })

  it('绑定行在但注册库缺席（无注册库）→ 两段整体不注入（同生同退）', () => {
    const r = mount()
    r.registered.clear()
    expect(r.fire(r.agent(WS))).toEqual([])
  })

  it('agent.ctx / systemPrompt 结构面缺席 → fail-soft 零注册不抛', () => {
    const r = mount()
    expect(() => r.fire(r.agent(WS, false))).not.toThrow()
    expect(r.fire(r.agent(WS, false))).toEqual([])
  })
})

describe('订阅生命周期', () => {
  it('插件 disposer 注销 agent/created 订阅（各会话 scope 内注册随 agent scope 自然 unwind，无手写清理）', () => {
    const r = mount()
    r.dispose()
    expect(r.off()).toBe(1)
  })
})

describe('bindKnowledgePromptSections disposer 锚（评审 Minor 补强）', () => {
  it('返回的 disposer 注销两段：静态/动态各恰注册一次、注销一次', () => {
    const ops: string[] = []
    const systemPrompt = {
      section: (s: KnowledgePromptSection) => {
        ops.push(`reg:${s.name}`)
        return () => {
          ops.push(`off:${s.name}`)
        }
      },
    }
    const dispose = bindKnowledgePromptSections(systemPrompt, { isRegistered: () => true, topDomains: () => [] }, WS)
    expect(ops).toEqual([`reg:${KNOWLEDGE_SECTION_NAME}`, `reg:${KNOWLEDGE_DOMAINS_SECTION_NAME}`])
    dispose()
    expect(ops).toEqual([
      `reg:${KNOWLEDGE_SECTION_NAME}`,
      `reg:${KNOWLEDGE_DOMAINS_SECTION_NAME}`,
      `off:${KNOWLEDGE_SECTION_NAME}`,
      `off:${KNOWLEDGE_DOMAINS_SECTION_NAME}`,
    ])
  })
})

describe('段常量经两段注册面透出（order 位次互指锚）', () => {
  it('静态段紧前于动态段（910 < 911——<knowledge-base> 声明与 <knowledge-domains> 块同 turn 相邻在场）', () => {
    expect(KNOWLEDGE_SECTION_ORDER).toBeLessThan(KNOWLEDGE_DOMAINS_SECTION_ORDER)
  })
})
