// 单测——forge:knowledge-domains 动态段每步求值（stage③ C2 / 提案 §2.2 裁决 #9）：
// 全局注册一处，text(context) 每步按 context.agent 现取会话 cwd → 解析项目 → 域树实时聚合；
// 未绑定 / 注册库缺席 / agent 缺席空返 ''、求值抛错 fail-soft 留痕。规则段 forge:knowledge
// 为静态全局注册（plugin.test.ts 钉），不经本文件。
import { describe, expect, it, vi } from 'vitest'
import { KNOWLEDGE_DOMAINS_SECTION_ORDER } from '../../host/prompt/index.js'
import { createKnowledgeDomainsText, type KnowledgePromptBindDeps } from '../../host/service/session-prompt.js'
import type { DomainIndexRow } from '../../host/service/internal.js'

const WS = 'C:/ws/a'
const OTHER = 'C:/ws/other'

/** 假供数面：注册库集合与顶域聚合可变（每步求值断言用） */
function mount() {
  const registered = new Set<string>([WS])
  const stats: DomainIndexRow[] = [{ domainPath: 'conventions', entryCount: 3, depth: 1, description: '约束' }]
  const topCalls: string[] = []
  const deps: KnowledgePromptBindDeps = {
    resolveProjectId: (cwd) => (cwd === WS ? 'p-1' : undefined),
    resolveWsPath: (projectId) => (projectId === 'p-1' ? WS : undefined),
    isRegistered: (wsPath) => registered.has(wsPath),
    topDomains: (wsPath) => {
      topCalls.push(wsPath)
      return [...stats]
    },
  }
  return { deps, registered, stats, topCalls }
}

const agentOf = (cwd: unknown) => ({ agent: { session: { id: 's-1', header: { cwd } } } })

describe('绑定会话注入（每步按 context.agent 现取 cwd）', () => {
  it('cwd 命中绑定行且注册库在场 → 渲染域树（顶域聚合经解析出的 ws_path）', () => {
    const r = mount()
    const text = createKnowledgeDomainsText(r.deps)
    expect(text(agentOf(WS))).toContain('conventions(3 篇) — 约束')
    expect(r.topCalls).toEqual([WS])
    expect(KNOWLEDGE_DOMAINS_SECTION_ORDER).toBe(911)
  })

  it('实时性：域树随顶域聚合变化（write 新域 → 下一步求值得新清单，非首步冻结）', () => {
    const r = mount()
    const text = createKnowledgeDomainsText(r.deps)
    expect(text(agentOf(WS))).not.toContain('fresh')
    r.stats.push({ domainPath: 'fresh', entryCount: 1, depth: 1, description: null })
    const next = text(agentOf(WS))
    expect(next).toContain('conventions(3 篇) — 约束')
    expect(next).toContain('fresh(1 篇) — <无简介>')
  })

  it('实时性：同一 text 函数对不同会话各按自身 cwd 求值（不缓存首步的会话绑定）', () => {
    const r = mount()
    const text = createKnowledgeDomainsText(r.deps)
    expect(text(agentOf(OTHER))).toBe('')
    expect(r.topCalls).toEqual([])
    expect(text(agentOf(WS))).toContain('conventions')
    r.registered.delete(WS)
    expect(text(agentOf(WS))).toBe('') // 注册库消失（注销后）空返退场
  })
})

describe('未绑定 / 无会话上下文（自然退场）', () => {
  it('cwd 无绑定行 → 空串', () => {
    const r = mount()
    expect(createKnowledgeDomainsText(r.deps)(agentOf(OTHER))).toBe('')
  })

  it('绑定行在但注册库缺席（无注册库）→ 空串', () => {
    const r = mount()
    r.registered.clear()
    expect(createKnowledgeDomainsText(r.deps)(agentOf(WS))).toBe('')
  })

  it('agent 缺席 / 无会话 cwd（非 agent 装配）→ 空串不抛', () => {
    const r = mount()
    const text = createKnowledgeDomainsText(r.deps)
    expect(text({})).toBe('')
    expect(text({ agent: {} })).toBe('')
    const sessionOnlyId = { id: 's-1' }
    expect(text({ agent: { session: sessionOnlyId } })).toBe('')
    const sessionIdAndEmptyCwd = { id: 's-1', header: { cwd: '' } }
    expect(text({ agent: { session: sessionIdAndEmptyCwd } })).toBe('')
  })

  it('Session 顶层 cwd 兼容位（结构面允许双读）同样可解析', () => {
    const r = mount()
    expect(createKnowledgeDomainsText(r.deps)({ agent: { session: { header: {}, cwd: WS } } })).toContain('conventions')
  })
})

describe('fail-soft（段失败只让本段缺席，不炸整轮装配）', () => {
  it('求值抛错 → 空串且诊断留痕一次', () => {
    const r = mount()
    const onError = vi.fn()
    const text = createKnowledgeDomainsText(
      { ...r.deps, topDomains: () => { throw new Error('statement has been finalized') } },
      onError,
    )
    expect(text(agentOf(WS))).toBe('')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(onError).mock.calls[0]?.[0])).toContain('statement has been finalized')
  })

  it('onError 缺席 → 静默空返不抛', () => {
    const r = mount()
    const text = createKnowledgeDomainsText({ ...r.deps, resolveProjectId: () => { throw new Error('x') } })
    expect(text(agentOf(WS))).toBe('')
  })
})
