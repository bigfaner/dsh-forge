// ForgeSessionTaskPills 单测（4.2）——会话头挂接 pill 装配体（Integration #2 壳侧本体）。
// 断言面 = 任务 AC：
//   AC-1 槽面组件链：占用者渲染 SessionTaskPills（双源分型锚 data-dswf-stp 在场透传）+
//        onOpenTask 透传（导航回调）；
//   AC-2 单库解析：sessionPillsLoadPlan 键缺席 idle / 键齐备 fetch（projectId 恒单值入
//        查询——零跨库聚合假设）；sessionPillItems 富化 = featureSlug 字段映射（slug ≡
//        feature slug 不变量——零额外 RPC）；
//   AC-3 RPC 接线：fetchSessionTaskPills 唯一通道 tasks.sessionLinks（负载原样
//        {projectId, sessionId}）+ 错误归一；applySessionPillsOutcome 首错清空/重取失败保旧；
//   AC-4 props 驱动：无锚/无会话 = 空输出（零挂接不占会话头——3.10 空态口径）。
// hook effect 编排（键变重拉/事件订阅重取）归 5.2 e2e——renderToStaticMarkup 零 effect
// 同全仓口径（RecallTab.test / dock-tabs.test 头注）；装载逻辑纯面直测。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionTaskLinkCard } from '@dsh-forge/contracts'
import type { ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import {
  ForgeSessionTaskPills,
  applySessionPillsOutcome,
  fetchSessionTaskPills,
  initialSessionPillsState,
  runSessionPillsLoad,
  sessionPillItems,
  sessionPillsLoadPlan,
  type SessionPillsLoadState,
} from './ForgeSessionTaskPills.js'
import type { SessionTaskPillNav } from './SessionTaskPills.js'

/** 双源分型卡工厂（SessionTaskLinkCard 全字段——links=派发 / records=执行） */
const card = (over: Partial<SessionTaskLinkCard> = {}): SessionTaskLinkCard => ({
  taskId: 't-1',
  slug: 'dsh-forge-m2-pipeline',
  localId: '4.2',
  title: '会话头挂接 pill 集成',
  taskStatus: 'in_progress',
  sessionId: 'sess-1',
  source: 'link',
  ...over,
})

/** 录制 client（tasks.sessionLinks 注入桩；其余通道 fail-loud） */
function recordingClient(impl: {
  sessionLinks?: () => Promise<SessionTaskLinkCard[]>
}): { client: ForgeRpcClient; calls: { q: unknown }[] } {
  const calls: { q: unknown }[] = []
  const fail = (): Promise<never> => Promise.reject(new Error('不应调用'))
  return {
    calls,
    client: {
      projects: { register: fail, list: fail, get: fail, update: fail, reconcile: fail, deriveTaskStoreDir: fail },
      fs: { listDir: fail },
      knowledge: { browse: fail, listEntries: fail, entryDetail: fail, heat: fail, sessionRecall: fail },
      tasks: {
        transition: fail,
        query: fail,
        validateFeatureTasks: fail,
        list: fail,
        stats: fail,
        graph: fail,
        detail: fail,
        sessionLinks: async (q: unknown) => {
          calls.push({ q })
          return impl.sessionLinks?.() ?? Promise.resolve([card()])
        },
      },
      features: { register: fail, transition: fail, upsertDoc: fail, list: fail },
      proposals: { list: fail },
      docs: { read: fail, openExternal: fail },
    } as unknown as ForgeRpcClient,
  }
}

describe('sessionPillItems 富化（AC2：单库零额外 RPC——slug ≡ feature slug 不变量）', () => {
  it('SessionTaskLinkCard → SessionTaskPillItem：featureSlug = card.slug 字段映射（双源两卡并存）', () => {
    const cards = [card(), card({ taskId: 't-2', source: 'record' })]
    const items = sessionPillItems(cards)
    expect(items).toHaveLength(2)
    for (const item of items) {
      expect(item.featureSlug).toBe(item.slug) // 不变量映射——零 feature 账本查询
      expect(item.taskId).toBeDefined()
      expect(item.source).toMatch(/^(link|record)$/)
    }
  })
})

describe('sessionPillsLoadPlan 装载判定（AC2 前置：单库键齐备才拉取）', () => {
  it('projectId/sessionId 任一缺席 → idle（静态空态不拉取——无锚不猜库）', () => {
    expect(sessionPillsLoadPlan({ projectId: null, sessionId: 's-1' })).toBe('idle')
    expect(sessionPillsLoadPlan({ projectId: 'p-1', sessionId: null })).toBe('idle')
    expect(sessionPillsLoadPlan({ projectId: null, sessionId: null })).toBe('idle')
  })
  it('双键齐备 → fetch（单库解析到场）', () => {
    expect(sessionPillsLoadPlan({ projectId: 'p-1', sessionId: 's-1' })).toBe('fetch')
  })
})

describe('fetchSessionTaskPills 唯一装载通道（AC3：tasks.sessionLinks RPC 接线）', () => {
  it('负载原样 {projectId, sessionId} 透传；卡片原样返回', async () => {
    const { client, calls } = recordingClient({})
    const out = await fetchSessionTaskPills(client, { projectId: 'p-1', sessionId: 's-1' })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.cards).toEqual([card()])
    expect(calls).toEqual([{ q: { projectId: 'p-1', sessionId: 's-1' } }]) // 单库查询参——恒单 projectId
  })
  it('typed error 归一（RpcClientError → message；永不 reject）', async () => {
    const fail = (): Promise<never> => Promise.reject(new RpcClientError({ code: 'ERR_WORKSPACE_DB_UNAVAILABLE', message: '库不可用' }))
    const client = recordingClient({ sessionLinks: fail }).client
    const out = await fetchSessionTaskPills(client, { projectId: 'p-1', sessionId: 's-1' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('库不可用')
  })
})

describe('runSessionPillsLoad + applySessionPillsOutcome 装载步进（AC3 事件刷新面 + fail-soft）', () => {
  it('键缺席 → 单步 idle（复位——会话切换到无锚库清空残留 pill）', async () => {
    const { client } = recordingClient({})
    const steps = await runSessionPillsLoad({ projectId: null, sessionId: 's-1' }, () => client)
    expect(steps).toEqual([{ kind: 'idle' }])
    expect(applySessionPillsOutcome({ phase: 'ready', pills: sessionPillItems([card()]) }, steps[0]!)).toEqual(
      initialSessionPillsState(),
    )
  })
  it('键齐备 → loading → ready（富化注入——featureSlug 映射）', async () => {
    const { client } = recordingClient({})
    const steps = await runSessionPillsLoad({ projectId: 'p-1', sessionId: 's-1' }, () => client)
    expect(steps).toHaveLength(2)
    let state: SessionPillsLoadState = initialSessionPillsState()
    for (const step of steps) state = applySessionPillsOutcome(state, step)
    expect(state.phase).toBe('ready')
    expect(state.pills).toEqual(sessionPillItems([card()]))
    expect(state.pills[0]!.featureSlug).toBe('dsh-forge-m2-pipeline')
  })
  it('loading 保旧（重取不清场——事件静默重取不闪烁）；首错清空（空呈现）', () => {
    const stale: SessionPillsLoadState = { phase: 'ready', pills: sessionPillItems([card()]) }
    expect(applySessionPillsOutcome(stale, { kind: 'loading' })).toEqual({ ...stale, phase: 'loading' })
    expect(applySessionPillsOutcome(initialSessionPillsState(), { kind: 'error', error: 'x' })).toEqual({
      phase: 'error',
      pills: [],
    })
  })
  it('重取失败保旧（缓存先行——装饰面不掏空）', () => {
    const stale: SessionPillsLoadState = { phase: 'ready', pills: sessionPillItems([card()]) }
    expect(applySessionPillsOutcome(stale, { kind: 'error', error: 'x' })).toEqual({ ...stale, phase: 'ready' })
  })
})

describe('ForgeSessionTaskPills 槽占用者渲染（AC1/AC4：透传 + 空态）', () => {
  it('无会话锚（sessionId 缺席）= 空输出（零挂接/无锚不占会话头——SSR 首帧同径）', () => {
    expect(renderToStaticMarkup(<ForgeSessionTaskPills />)).toBe('')
  })
  it('useWorkspaces 缺席（非壳载体）同径空输出不炸', () => {
    expect(renderToStaticMarkup(<ForgeSessionTaskPills sessionId="s-1" />)).toBe('')
  })
  it('props 透传面：SessionTaskPills 装载壳挂载（onOpenTask 恒可达——数据经 hook 装载，effect 归 e2e）', () => {
    const onOpenTask = vi.fn<(nav: SessionTaskPillNav) => void>()
    // SSR 零 effect → pills 空 → SessionTaskPills 空输出；本断言钉「不炸 + 回调注入面在场」
    expect(() =>
      renderToStaticMarkup(<ForgeSessionTaskPills sessionId="s-1" onOpenTask={onOpenTask} />),
    ).not.toThrow()
  })
})
