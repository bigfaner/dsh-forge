// DispatchPanel 单测（m3.1 D5/D6）——派发任务悬浮面板（会话头挂接 pill 退役后的继任面）。
// 断言面 = 任务 AC：
//   AC-面板仅 link 源：dispatchPanelRows 过滤 record 卡（裁决 #2——执行源归 worker 会话
//        与任务详情时间线）；
//   AC-几何：dispatchPanelAnchor 工具栏下 + 对话列内右缘（dock 展开自动左移的几何前提）
//        + dispatchPanelDragPosition 视口钳制；
//   AC-⟞ worker 解析：workerSessionOf（record 源 ∉ link 派发集）+ fetchWorkerSession
//        fail-soft；
//   AC-装载链（4.2 Integration #2 迁入面——语义零变化）：sessionPillsLoadPlan 键判定 /
//        fetchSessionTaskPills 唯一通道 / applySessionPillsOutcome 步进（首错清空/重取保旧）；
//   AC-渲染：DispatchPanelBody 面板 ↔ ⟡N 角标双形态 + 拖移标记 + ⟞ 缺席降级。
// hook effect 编排（键变重拉/事件订阅重取/DOM 锚定/拖移）归 e2e——renderToStaticMarkup
// 零 effect 同全仓口径（RecallTab.test / dock-tabs.test 头注）；装载逻辑纯面直测。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SessionTaskLinkCard, TaskDetail } from '@dsh-forge/contracts'
import type { ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import {
  DispatchPanel,
  DispatchPanelBody,
  applySessionPillsOutcome,
  dispatchAnchorRectsOf,
  dispatchPanelAnchor,
  dispatchPanelDragPosition,
  dispatchPanelRows,
  fetchSessionTaskPills,
  fetchWorkerSession,
  initialSessionPillsState,
  runSessionPillsLoad,
  sessionPillItems,
  sessionPillsLoadPlan,
  workerSessionOf,
  type DispatchPanelGeometry,
  type SessionPillsLoadState,
  type SessionTaskPillItem,
} from './DispatchPanel.js'

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

/** 录制 client（tasks.sessionLinks / tasks.detail 注入桩；其余通道 fail-loud） */
function recordingClient(impl: {
  sessionLinks?: () => Promise<SessionTaskLinkCard[]>
  detail?: () => Promise<TaskDetail>
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
        detail: async (q: unknown) => {
          calls.push({ q })
          return impl.detail?.() ?? Promise.reject(new Error('不应调用'))
        },
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

// ─────────────────── 装载链（4.2 迁入面——语义零变化直测） ───────────────────

describe('sessionPillItems 富化（slug ≡ feature slug 不变量——零额外 RPC）', () => {
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

describe('sessionPillsLoadPlan 装载判定（单库键齐备才拉取）', () => {
  it('projectId/sessionId 任一缺席 → idle（静态空态不拉取——无锚不猜库）', () => {
    expect(sessionPillsLoadPlan({ projectId: null, sessionId: 's-1' })).toBe('idle')
    expect(sessionPillsLoadPlan({ projectId: 'p-1', sessionId: null })).toBe('idle')
    expect(sessionPillsLoadPlan({ projectId: null, sessionId: null })).toBe('idle')
  })
  it('双键齐备 → fetch（单库解析到场）', () => {
    expect(sessionPillsLoadPlan({ projectId: 'p-1', sessionId: 's-1' })).toBe('fetch')
  })
})

describe('fetchSessionTaskPills 唯一装载通道（tasks.sessionLinks RPC 接线）', () => {
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

describe('runSessionPillsLoad + applySessionPillsOutcome 装载步进（事件刷新面 + fail-soft）', () => {
  it('键缺席 → 单步 idle（复位——会话切换到无锚库清空残留行）', async () => {
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

// ─────────────────── 行集过滤（AC：面板仅含 link 源任务） ───────────────────

describe('dispatchPanelRows link 源过滤（D6 裁决 #2：仅本会话派发）', () => {
  it('record 卡过滤不入行集（§6-24④ 派发会话两卡并存——面板恒单行）', () => {
    const pills = sessionPillItems([
      card(),
      card({ source: 'record' }), // claim 审计行（同会话）——不入面板
    ])
    const rows = dispatchPanelRows(pills)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.source).toBe('link')
  })
  it('多任务派发 = 多行（顺序保持）；零 link = 空行集', () => {
    const pills = sessionPillItems([
      card({ taskId: 't-a' }),
      card({ taskId: 't-b', source: 'record', sessionId: 'worker-1' }),
      card({ taskId: 't-c' }),
    ])
    expect(dispatchPanelRows(pills).map((row) => row.taskId)).toEqual(['t-a', 't-c'])
    expect(dispatchPanelRows(sessionPillItems([card({ source: 'record' })]))).toEqual([])
  })
})

// ─────────────────── 几何（AC：默认落位 + dock 左移 + 拖移钳制） ───────────────────

describe('dispatchPanelAnchor 默认锚定（对话列内 · 工具栏之下右上角）', () => {
  it('页签行在场：top = 下沿 + 8；右缘 = 对话列右缘内收 16（left = 视口宽 - 间距 - 面宽）', () => {
    const geom = dispatchPanelAnchor({ convRight: 1000, convTop: 40, tabsBottom: 88, viewportWidth: 1280 })
    expect(geom).toEqual({ left: 1280 - (1280 - 1000 + 16) - 324, top: 88 + 8 })
  })
  it('dock 展开（convRight 左移）→ left 随之左移（自动让位 dockkit——不悬浮进右栏）', () => {
    const collapsed = dispatchPanelAnchor({ convRight: 1280, convTop: 40, tabsBottom: 88, viewportWidth: 1280 })
    const expanded = dispatchPanelAnchor({ convRight: 1000, convTop: 40, tabsBottom: 88, viewportWidth: 1280 })
    expect(collapsed.left - expanded.left).toBe(280) // 右移量 = 对话列收窄量
  })
  it('页签行缺席（blank 会话）→ top 回退对话列顶 + 8；钳制 top ≥ 8 / left ≥ 4（窄视口）', () => {
    expect(dispatchPanelAnchor({ convRight: 1000, convTop: 40, tabsBottom: null, viewportWidth: 1280 }).top).toBe(48)
    expect(dispatchPanelAnchor({ convRight: 1280, convTop: -20, tabsBottom: -10, viewportWidth: 1280 }).top).toBe(8)
    // 窄视口：面宽 + 间距超出视口 → left 钳制 4（右缘间距下限不再放大越界）
    expect(dispatchPanelAnchor({ convRight: 340, convTop: 40, tabsBottom: 88, viewportWidth: 340 }).left).toBe(4)
  })
})

describe('dispatchPanelDragPosition 拖移几何（拖后停自动锚定——位保持用户控制）', () => {
  const start: DispatchPanelGeometry = { left: 900, top: 96 }
  it('位移原样应用（左移/下移）', () => {
    expect(dispatchPanelDragPosition(start, { x: 100, y: 100 }, { x: 40, y: 140 }, { width: 1280, height: 800 })).toEqual({
      left: 840,
      top: 136,
    })
  })
  it('视口钳制：左/顶不出界（margin 4 + 头行高预留）', () => {
    expect(dispatchPanelDragPosition(start, { x: 100, y: 100 }, { x: -800, y: -800 }, { width: 1280, height: 800 })).toEqual({
      left: 4,
      top: 4,
    })
    expect(dispatchPanelDragPosition(start, { x: 100, y: 100 }, { x: 2000, y: 2000 }, { width: 1280, height: 800 })).toEqual({
      left: 1280 - 4 - 324,
      top: 800 - 4 - 34,
    })
  })
})

describe('dispatchAnchorRectsOf DOM 锚定读取（对话区容器锚）', () => {
  const rect = (right: number, top: number, bottom = right): { right: number; top: number; bottom: number } => ({ right, top, bottom })
  it('对话容器 + 页签行在场 → 窄形状（bottom 供 top 锚）', () => {
    const rects = dispatchAnchorRectsOf({
      querySelector: (selector) =>
        selector === '[data-slot="main.conversation"]'
          ? { getBoundingClientRect: () => rect(1000, 40) }
          : { getBoundingClientRect: () => rect(1000, 56, 88) },
      innerWidth: 1280,
    })
    expect(rects).toEqual({ convRight: 1000, convTop: 40, tabsBottom: 88, viewportWidth: 1280 })
  })
  it('对话容器缺席（知识/hero 面板态）→ null（面板不出场）；页签行缺席 → tabsBottom null', () => {
    expect(dispatchAnchorRectsOf({ querySelector: () => null, innerWidth: 1280 })).toBeNull()
    const rects = dispatchAnchorRectsOf({
      querySelector: (selector) =>
        selector === '[data-slot="main.conversation"]' ? { getBoundingClientRect: () => rect(1000, 40) } : null,
      innerWidth: 1280,
    })
    expect(rects).toEqual({ convRight: 1000, convTop: 40, tabsBottom: null, viewportWidth: 1280 })
  })
})

// ─────────────────── ⟞ worker 解析（AC：打开 worker 执行子会话） ───────────────────

describe('workerSessionOf 执行会话解析（record 源 ∉ link 派发集）', () => {
  it('submit 审计行会话（record ∉ link 集）= worker', () => {
    const sessions = [
      card({ source: 'link', sessionId: 'dispatch-1' }),
      card({ source: 'record', sessionId: 'dispatch-1' }), // claim 审计行 = 派发会话本身 → 排除
      card({ source: 'record', sessionId: 'worker-9' }), // submit 审计行 = 执行会话
    ]
    expect(workerSessionOf(sessions)).toBe('worker-9')
  })
  it('纯派发（record 仅 claim 审计）/ 零挂接 → null（无执行子会话）', () => {
    expect(workerSessionOf([card({ source: 'link', sessionId: 'd' }), card({ source: 'record', sessionId: 'd' })])).toBeNull()
    expect(workerSessionOf([])).toBeNull()
  })
})

describe('fetchWorkerSession 纯异步面（taskDetail 挂接面 → workerSessionOf；fail-soft）', () => {
  it('tasks.detail 负载原样；挂接面解析 worker', async () => {
    const detail = { sessions: [card({ source: 'record', sessionId: 'w-1' })] } as TaskDetail
    const { client, calls } = recordingClient({ detail: async () => detail })
    await expect(fetchWorkerSession(client, { projectId: 'p-1', taskId: 't-1' })).resolves.toBe('w-1')
    expect(calls).toEqual([{ q: { projectId: 'p-1', taskId: 't-1' } }])
  })
  it('错误归一 null（永不 reject——装饰面不炸）', async () => {
    const { client } = recordingClient({ detail: () => Promise.reject(new RpcClientError({ code: 'ERR_TASK_NOT_FOUND', message: 'x' })) })
    await expect(fetchWorkerSession(client, { projectId: 'p-1', taskId: 't-x' })).resolves.toBeNull()
  })
})

// ─────────────────── 渲染体（面板 ↔ ⟡N 角标双形态 + 降级面） ───────────────────

const rowItem = (over: Partial<SessionTaskLinkCard> = {}): SessionTaskPillItem => {
  const base = card(over)
  return { ...base, featureSlug: base.slug }
}

describe('DispatchPanelBody 纯渲染（面板形态）', () => {
  const rows = [rowItem({ taskId: 't-a' }), rowItem({ taskId: 't-b', localId: '2.1', title: '第二任务' })]
  const base = {
    rows,
    geometry: { left: 900, top: 96 } as DispatchPanelGeometry,
    collapsed: false,
    dragged: false,
    onCollapse: () => {},
    onExpand: () => {},
  }

  it('行集全量呈现：状态点 + 键（slug/localId）+ 标题 + 状态标签 + ⟞ 钮 + 计数', () => {
    const markup = renderToStaticMarkup(<DispatchPanelBody {...base} onOpenTask={() => {}} onOpenWorkerSession={() => {}} />)
    expect(markup).toContain('data-dswf-dp=""')
    expect(markup).toContain('data-dswf-dp-row="t-a"')
    expect(markup).toContain('data-dswf-dp-row="t-b"')
    expect(markup).toContain('dsh-forge-m2-pipeline/4.2')
    expect(markup).toContain('第二任务')
    expect(markup).toContain('data-dswf-dp-count=""')
    expect(markup).toContain('>2<')
    expect(markup).toContain('data-dswf-dp-session="t-a"') // 行尾 ⟞（RightUp 图标）
    expect(markup).toContain('role="complementary"')
  })
  it('状态标签随七态（completed = 已完成）', () => {
    const markup = renderToStaticMarkup(
      <DispatchPanelBody {...base} rows={[rowItem({ taskStatus: 'in_progress' })]} onOpenTask={undefined} onOpenWorkerSession={undefined} />,
    )
    expect(markup).toContain('进行中')
  })
  it('拖移标记随行（data-dswf-dp-dragged——停自动锚定 e2e 锚）；几何经 style 注入', () => {
    const markup = renderToStaticMarkup(
      <DispatchPanelBody {...base} dragged onOpenTask={undefined} onOpenWorkerSession={undefined} />,
    )
    expect(markup).toContain('data-dswf-dp-dragged=""')
    expect(markup).toContain('left:900px')
    expect(markup).toContain('top:96px')
  })
  it('动作面缺席降级：行非交互（无 role=button）+ ⟞ disabled（非壳载体/单测面）', () => {
    const markup = renderToStaticMarkup(<DispatchPanelBody {...base} onOpenTask={undefined} onOpenWorkerSession={undefined} />)
    expect(markup).not.toContain('role="button"')
    expect(markup).toContain('disabled')
  })
})

describe('DispatchPanelBody 纯渲染（⟡N 折叠角标形态 + 往返）', () => {
  const rows = [rowItem(), rowItem({ taskId: 't-b' }), rowItem({ taskId: 't-c' })]
  it('折叠 = 角标在场（计数 N + 展开语义）+ 面板退场', () => {
    const markup = renderToStaticMarkup(
      <DispatchPanelBody rows={rows} geometry={{ left: 900, top: 96 }} collapsed dragged={false} onCollapse={() => {}} onExpand={() => {}} onOpenTask={undefined} onOpenWorkerSession={undefined} />,
    )
    expect(markup).toContain('data-dswf-dp-badge=""')
    expect(markup).toContain('data-dswf-dp-badge-count=""')
    expect(markup).toContain('>3<')
    expect(markup).toContain('展开派发任务面板')
    expect(markup).not.toContain('data-dswf-dp-row')
    expect(markup).toContain('left:900px') // 角标恒锚定位（不随拖移位）
  })
})

describe('DispatchPanel 装载壳（SSR 首帧——effect 零执行）', () => {
  it('零装载（renderToStaticMarkup 无 effect → 行集空）= 空输出（零派发不占对话区）', () => {
    expect(renderToStaticMarkup(<DispatchPanel sessionId="s-1" projectId="p-1" />)).toBe('')
  })
  it('动作回调在场不炸渲染（数据经 hook 装载，effect/锚定归 e2e）', () => {
    const onOpenTask = vi.fn()
    const onOpenWorkerSession = vi.fn()
    expect(() =>
      renderToStaticMarkup(<DispatchPanel sessionId="s-1" projectId="p-1" onOpenTask={onOpenTask} onOpenWorkerSession={onOpenWorkerSession} />),
    ).not.toThrow()
  })
})
