// @vitest-environment happy-dom -- rc.5 Menu 装载期即触 DOM（useMenuSubmenu）——闭态 SSR 渲染需 document 在场
// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 任务子 tab 组装单测 —— 4.6 UF-3：容器来源 = 任务数据自身（slug 聚合——features/提案域
// 容器模型退役）+ ov-taskbar 布局（容器 pill + 视图下拉 + 右簇 [诊断]+[派发]）+ chips 统一
// 过滤 + 三视图分派 + 三态面（容器真空空态 / 装载骨架分派）+ 装载壳 effect 面
// （createRoot+act——容器聚合装载 → 缺省首容器 → 任务卡渲染 → 多容器显式路由）。
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskCard, TaskGraph, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import { TasksTabBody, TasksTab, containerMenuItems, containerMenuPick, runDispatchRoute, subgraphDiagContainer } from './task-tab.js'
import { formatDiagMessage } from '../message-format.js'
import { docsRootOf } from '../message-format.js'
import type { TaskContainerOption } from './container-pill.js'
import { containerMenuSelect, containerPillChip, resolveContainer } from './task-tab-model.js'
import { taskContainerOptionsFromCards } from './container-pill.js'
import type { TasksTabLoadState } from './task-tab-data.js'
import type { DiagToastResult } from './DiagToast.js'
import { cardFixture } from './task-tab-model.test.js'
import type { ForgeRpcClient } from '../../rpc-channels.js'

const NOOP = (): void => {}

/** 菜单行 label 取值（MenuItem 窄化 + 缺席 = 空——测试辅助面） */
function menuRowLabel(items: readonly MenuEntry[], index: number): ReactNode {
  const entry = items[index]
  if (entry === undefined || !('label' in entry)) return null
  return entry.label
}

/** 容器聚合卡夹具：feature 容器两卡 + blitz 提案容器两卡（source 恒填——服务不变量） */
const AGG_CARDS: readonly TaskCard[] = [
  cardFixture({ taskId: 't-1', slug: 'm2-pipeline', taskStatus: 'completed', source: { kind: 'feature', slug: 'm2-pipeline' } }),
  cardFixture({ taskId: 't-2', slug: 'm2-pipeline', taskStatus: 'pending', source: { kind: 'feature', slug: 'm2-pipeline' } }),
  cardFixture({ taskId: 't-3', slug: 'legacy-eval-retire', taskStatus: 'pending', source: { kind: 'proposal', slug: 'legacy-eval-retire' } }),
  cardFixture({ taskId: 't-4', slug: 'legacy-eval-retire', taskStatus: 'completed', source: { kind: 'proposal', slug: 'legacy-eval-retire' } }),
]

const STATS: TaskStats = {
  total: 2,
  byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 },
  unmetPending: 0, gatedPending: 0,
}

const GRAPH: TaskGraph = { tasks: [cardFixture()], edges: [] }

const OPTIONS = taskContainerOptionsFromCards(AGG_CARDS)
const FEATURE_CONTAINER = OPTIONS.find((o) => o.slug === 'm2-pipeline') as TaskContainerOption
const BLITZ_CONTAINER = OPTIONS.find((o) => o.slug === 'legacy-eval-retire') as TaskContainerOption

function load(over: Partial<TasksTabLoadState> = {}): TasksTabLoadState {
  return {
    phase: 'ready',
    cards: [cardFixture()],
    graph: undefined,
    stats: STATS,
    busy: false,
    error: undefined,
    ...over,
  }
}

const base = {
  search: '',
  activeStatuses: new Set<TaskStatus>(),
  onToggleStatus: NOOP,
  onClearStatuses: NOOP,
  options: OPTIONS,
  container: FEATURE_CONTAINER,
  view: 'list' as const,
  containerMenuOpen: false,
  viewMenuOpen: false,
  onContainerSelect: NOOP,
  onViewChange: NOOP,
  onContainerMenuOpenChange: NOOP,
  onViewMenuOpenChange: NOOP,
  onRetry: NOOP,
  diagResult: undefined as DiagToastResult | undefined,
  onDiagnose: NOOP,
  onDiagDismiss: NOOP,
  dispatchNotice: undefined as DiagToastResult | undefined,
  onDispatchNoticeDismiss: NOOP,
  onDispatch: NOOP,
}

const render = (over: Partial<Parameters<typeof TasksTabBody>[0]> = {}): string =>
  renderToStaticMarkup(<TasksTabBody {...base} load={load()} onOpenTask={NOOP} {...over} />)

describe('TasksTabBody · ov-taskbar 布局（插入点断言）', () => {
  it('工具栏 = 容器 pill（双轨点 + chip）+ 视图下拉（pill 右侧）+ 右簇 [诊断][派发] 最右端（DOM 序）', () => {
    const html = render()
    expect(html).toContain('data-dswf-tt-taskbar=""')
    expect(html).toContain('data-dswf-tt-contpill="m2-pipeline"')
    expect(html).toContain('class="dswf-tt-contdot" data-mode="expedition"')
    expect(html).toContain('1/2')
    // kind 词汇不入界面（容器统一为 spec）
    expect(html).not.toContain('突击提案')
    expect(html).not.toContain('feature · 远征')
    const pillAt = html.indexOf('data-dswf-tt-contpill')
    const viewAt = html.indexOf('data-dswf-tt-viewbtn="list"')
    const diagAt = html.indexOf('data-dswf-tt-diag=""')
    const dispatchAt = html.indexOf('data-dswf-tt-dispatch=')
    expect(viewAt).toBeGreaterThan(pillAt) // 视图下拉在 pill 右侧
    expect(diagAt).toBeGreaterThan(viewAt) // 右簇在视图下拉之后
    expect(dispatchAt).toBeGreaterThan(diagAt) // 派发居最右
    expect(html).toContain('data-dswf-tt-rightbar') // 右簇容器
  })

  it('卡携 proposal kind 的容器：pill 按 slug 选中 + 统一 done/total chip + 零 kind 词汇/标记 + 零过程注释', () => {
    const html = render({ container: BLITZ_CONTAINER })
    expect(html).toContain('data-dswf-tt-contpill="legacy-eval-retire"')
    expect(html).toContain('1/2') // stats 单源 done/total（修前 =「突击提案 · 2 任务」）
    expect(html).not.toContain('突击提案')
    expect(html).not.toContain('title=') // 计数注归官方 Tooltip label
    expect(html).not.toContain('data-dswf-tt-count') // 正文零计数注
    expect(html).not.toContain('无 feature 阶段')
    expect(html).toContain('data-dswf-tt-dispatch=') // 派发按钮仍可用面
  })

  it('「全部任务」作用域：pill = 全部任务 + done/total，菜单首项「全部任务 · N 任务」，诊断/派发不呈现，任务卡跨容器渲染', () => {
    const html = render({ container: undefined, allContainers: true, load: load({ cards: [...AGG_CARDS] }) })
    expect(html).toContain('data-dswf-tt-contpill="all"')
    expect(html).toContain('1/2')
    expect(html).toContain('data-dswf-tt-item="t-1"')
    expect(html).toContain('data-dswf-tt-item="t-3"')
    expect(html).not.toContain('data-dswf-tt-diag=')
    expect(html).not.toContain('data-dswf-tt-dispatch=')
    const items = containerMenuItems(OPTIONS)
    expect(items.map((entry) => entry.id)).toEqual(['all', 'legacy-eval-retire', 'm2-pipeline'])
    expect(renderToStaticMarkup(menuRowLabel(items, 0))).toContain('全部任务')
    expect(renderToStaticMarkup(menuRowLabel(items, 0))).toContain('4 任务')
  })

  it('「全部任务」作用域搜索无匹配 = 无匹配空态（跨容器搜索）', () => {
    const html = render({ container: undefined, allContainers: true, search: '不存在', load: load({ cards: [...AGG_CARDS].slice(0, 0), stats: STATS }) })
    expect(html).toContain('无匹配「不存在」的任务')
  })

  it('feature 容器：「诊断」按钮在场 + 派发按钮', () => {
    const html = render()
    expect(html).toContain('data-dswf-tt-diag=""')
    expect(html).toContain('>诊断</button>')
    expect(html).toContain('>派发</button>')
  })

  it('视图下拉锚钮 = 当前视图直出 + ▾（三视图语义不变·控件形态为下拉）', () => {
    expect(render()).toContain('视图：列表')
    expect(render({ view: 'dag', load: load({ graph: GRAPH }) })).toContain('视图：DAG')
    expect(render({ view: 'swim' })).toContain('视图：泳道')
  })

  it('搜索在场计数 = 匹配/总数（收进 pill 官方 Tooltip label——正文零计数注）', () => {
    const html = render({ search: '评估' })
    expect(html).not.toContain('title=')
    expect(html).not.toContain('data-dswf-tt-count')
  })

  it('无单任务执行入口（Hard Rule）：任务行/工具栏零「执行」动作', () => {
    const html = render()
    expect(html).not.toContain('>执行<')
    expect(html).not.toContain('data-dswf-tt-exec')
  })

  it('S5 列表行 ⟞ 门控仅列表视图：workerSessionTaskId 在场 = 列表行呈现；泳道/DAG 视图不动', () => {
    const list = render({ view: 'list', workerSessionTaskId: 't-1', onOpenWorkerSession: NOOP })
    expect(list).toContain('data-dswf-tt-worker="t-1"')
    const swim = render({ view: 'swim', workerSessionTaskId: 't-1', onOpenWorkerSession: NOOP })
    expect(swim).not.toContain('data-dswf-tt-worker')
  })
})

describe('TasksTabBody · chips 统一过滤（沿袭）', () => {
  it('七态 chips（StatusChips 复用）次行独占 + 计数 = 容器域 stats 单源', () => {
    const html = render()
    expect(html).toContain('data-dswf-ov-stchips=""')
    expect(html).toContain('data-dswf-ov-stchip="completed"')
    expect(html).toContain('data-dswf-ov-stchip="pending"')
    expect(html.indexOf('data-dswf-ov-stchips')).toBeGreaterThan(html.indexOf('data-dswf-tt-taskbar'))
  })

  it('stats 在途 = 全 0 计数（chips 全禁用——不可点出空态）', () => {
    const html = render({ load: load({ stats: undefined }) })
    expect(html).toContain('disabled')
  })
})

describe('TasksTabBody · 三视图分派（沿袭）', () => {
  it('list（缺省）：两行布局列表', () => {
    const html = render({ view: 'list' })
    expect(html).toContain('data-dswf-tt-list=""')
    expect(html).toContain('data-dswf-tt-item="t-1"')
  })

  it('dag：SVG 画布 + 节点 + 边（graph 在场）', () => {
    const html = render({ view: 'dag', load: load({ graph: GRAPH }) })
    expect(html).toContain('data-dswf-tt-dag=""')
    expect(html).toContain('data-dswf-tt-node="t-1"')
  })

  it('dag 视图 graph 在途 = 骨架（不炸不空白）', () => {
    const html = render({ view: 'dag', load: load({ graph: undefined }) })
    expect(html).toContain('data-dswf-tt-skeleton')
  })

  it('swim：七态横向列', () => {
    const html = render({ view: 'swim' })
    expect(html).toContain('data-dswf-tt-swim=""')
    expect(html).toContain('data-dswf-tt-col="pending"')
  })
})

describe('TasksTabBody · 三态面与空态', () => {
  it('首装在途 = 骨架行（taskbar 保持）', () => {
    const html = render({ load: load({ phase: 'loading', cards: undefined, stats: undefined, busy: true }) })
    expect(html).toContain('data-dswf-tt-taskbar')
    expect(html).toContain('data-dswf-tt-skeleton')
  })

  it('错误无旧内容 = 错误条 + 重试', () => {
    const html = render({ load: load({ phase: 'error', cards: undefined, error: { message: '装载失败', uiState: 'error-bar' } }) })
    expect(html).toContain('data-dswf-tt-error')
    expect(html).toContain('装载失败')
  })

  it('错误有旧内容 = 错误条置顶 + 列表保持（重取失败不掏空）', () => {
    const html = render({ load: load({ error: { message: '重取失败', uiState: 'error-bar' }, busy: true }) })
    expect(html).toContain('data-dswf-tt-error')
    expect(html).toContain('data-dswf-tt-item="t-1"')
  })

  it('空态分派：容器总数 0 / 搜索无匹配 / 过滤组合空', () => {
    const zero: TaskStats = { total: 0, byStatus: { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 }, unmetPending: 0, gatedPending: 0 }
    expect(render({ load: load({ cards: [], stats: zero }) })).toContain('本容器暂无任务')
    expect(render({ search: '不存在', load: load({ cards: [] }) })).toContain('无匹配「不存在」的任务')
    expect(render({ activeStatuses: new Set<TaskStatus>(['blocked']), load: load({ cards: [] }) })).toContain('当前过滤组合无任务')
  })

  it('容器真空（任务列表空·装载完成）= 容器空态（无 taskbar）', () => {
    const html = render({ options: [], container: undefined })
    expect(html).toContain('暂无任务容器')
    expect(html).toContain('项目任务容器在此列出——循环派发与手动建容器均可')
    expect(html).not.toContain('data-dswf-tt-taskbar')
  })

  it('容器装载中 = 骨架而非容器空态（AC③——有任务数据前不谎报真空）', () => {
    const html = render({ options: [], container: undefined, containersLoading: true })
    expect(html).toContain('data-dswf-tt-skeleton')
    expect(html).not.toContain('暂无任务容器')
  })
})

describe('容器菜单与解析纯函数', () => {
  it('containerMenuItems：首行「全部任务」+ 各行 slug + N 任务（计数即选项自身聚合；kind 标记不入行）', () => {
    const items = containerMenuItems(OPTIONS)
    expect(items.map((entry) => entry.id)).toEqual(['all', 'legacy-eval-retire', 'm2-pipeline'])
    const row = renderToStaticMarkup(menuRowLabel(items, 1))
    expect(row).toContain('legacy-eval-retire')
    expect(row).not.toContain('突击提案')
    expect(row).toContain('2 任务')
    const featureRow = renderToStaticMarkup(menuRowLabel(items, 2))
    expect(featureRow).toContain('m2-pipeline')
    expect(featureRow).toContain('2 任务')
  })

  it('containerMenuSelect：id → 选项；未知 id = undefined', () => {
    expect(containerMenuSelect(OPTIONS, 'legacy-eval-retire')?.slug).toBe('legacy-eval-retire')
    expect(containerMenuSelect(OPTIONS, 'ghost')).toBeUndefined()
  })

  it('containerMenuPick：all → 全部作用域；slug → 单容器；未知 = undefined', () => {
    expect(containerMenuPick(OPTIONS, 'all')).toEqual({ all: true })
    expect(containerMenuPick(OPTIONS, 'legacy-eval-retire')).toEqual({ all: false, option: BLITZ_CONTAINER })
    expect(containerMenuPick(OPTIONS, 'ghost')).toBeUndefined()
  })

  it('containerPillChip：stats 单源优先；在途回退聚合任务数（容器不分 kind）', () => {
    expect(containerPillChip(FEATURE_CONTAINER, '1/2')).toBe('1/2')
    expect(containerPillChip(FEATURE_CONTAINER, undefined)).toBe('2 任务')
    expect(containerPillChip(BLITZ_CONTAINER, '1/2')).toBe('1/2')
  })

  it('resolveContainer：显式命中优先；未命中回退首项（稳定序）；零选项 = undefined', () => {
    expect(resolveContainer(OPTIONS, { kind: 'proposal', slug: 'legacy-eval-retire' })?.slug).toBe('legacy-eval-retire')
    expect(resolveContainer(OPTIONS, { kind: 'proposal', slug: 'ghost' })?.slug).toBe('legacy-eval-retire') // 首项
    expect(resolveContainer(OPTIONS, undefined)?.slug).toBe('legacy-eval-retire')
    expect(resolveContainer([], undefined)).toBeUndefined()
  })
})

// ─────────────────────────── 派发双路由执行（runDispatchRoute） ───────────────────────────

type TaskCard_lazy = ReturnType<typeof cardFixture>

function dispatchClient(impl: {
  readonly list: TaskCard_lazy[]
  readonly detailSessions?: { readonly sessionId: string; readonly source: 'link' | 'record' }[]
  readonly fail?: boolean
}): ForgeRpcClient {
  const fail = (): Promise<never> => Promise.reject(new Error('不应调用'))
  return {
    tasks: {
      list: () => (impl.fail === true ? Promise.reject(new Error('rpc 断')) : Promise.resolve(impl.list as never)),
      detail: () =>
        Promise.resolve({
          sessions: (impl.detailSessions ?? []).map((session) => ({ ...session, taskId: 't-run', slug: 'm2-pipeline', localId: '1.1', title: '任务', taskStatus: 'in_progress' })),
        } as never),
    },
    projects: { register: fail, list: fail, get: fail, update: fail, reconcile: fail },
    fs: { listDir: fail },
    knowledge: { browse: fail, listEntries: fail, entryDetail: fail, heat: fail, sessionRecall: fail },
    features: { register: fail, transition: fail, upsertDoc: fail, list: fail, listDocs: fail },
    docs: { read: fail, openExternal: fail },
    settings: { get: fail, set: fail },
  } as unknown as ForgeRpcClient
}

const RUNNING = { ...cardFixture(), taskId: 't-run', taskStatus: 'in_progress' as const }

describe('runDispatchRoute（双路由执行）', () => {
  it('执行中在场 + link 源挂接 → jump（sessionId + 任务自然键；不新建不重发）', async () => {
    const seen: string[] = []
    await runDispatchRoute(
      { projectId: 'p-1', container: FEATURE_CONTAINER, client: dispatchClient({ list: [RUNNING], detailSessions: [{ sessionId: 's-record', source: 'record' }, { sessionId: 's-dispatch', source: 'link' }] }) },
      {
        onJump: (sessionId, taskKey) => {
          seen.push(`jump:${sessionId}:${taskKey}`)
        },
        onNew: (mode, command) => {
          seen.push(`new:${mode}:${command}`)
        },
      },
    )
    expect(seen).toEqual(['jump:s-dispatch:m2-pipeline/2.4'])
  })

  it('无执行中任务 → new（容器对应模式 + /run-dag-tasks 指令单行）', async () => {
    const seen: string[] = []
    await runDispatchRoute(
      { projectId: 'p-1', container: BLITZ_CONTAINER, client: dispatchClient({ list: [cardFixture()] }) },
      {
        onJump: () => seen.push('jump'),
        onNew: (mode, command) => seen.push(`new:${mode}:${command}`),
      },
    )
    expect(seen).toEqual(['new:blitz:/run-dag-tasks legacy-eval-retire'])
  })

  it('执行中在场但零 link 挂接（人工置 in_progress）→ new（空跳无意义）', async () => {
    const seen: string[] = []
    await runDispatchRoute(
      { projectId: 'p-1', container: FEATURE_CONTAINER, client: dispatchClient({ list: [RUNNING], detailSessions: [{ sessionId: 's-record', source: 'record' }] }) },
      {
        onJump: () => seen.push('jump'),
        onNew: (mode, command) => seen.push(`new:${mode}:${command}`),
      },
    )
    expect(seen).toEqual(['new:expedition:/run-dag-tasks m2-pipeline'])
  })

  it('RPC 失败 → fail-soft 回退 new（claim 原子性兜底）', async () => {
    const seen: string[] = []
    await runDispatchRoute(
      { projectId: 'p-1', container: FEATURE_CONTAINER, client: dispatchClient({ list: [], fail: true }) },
      {
        onJump: () => seen.push('jump'),
        onNew: (mode, command) => seen.push(`new:${mode}:${command}`),
      },
    )
    expect(seen).toEqual(['new:expedition:/run-dag-tasks m2-pipeline'])
  })
})

describe('subgraphDiagContainer（子图诊断容器水化——@ 锚数据驱动）', () => {
  const CONTAINER: TaskContainerOption = {
    ...FEATURE_CONTAINER,
    slug: 'm2-pipeline',
    title: 'm2-pipeline',
  }

  it('docsRoot 在场（项目行推导 <ws>/.forge）→ container.docsRoot 透传 → formatDiagMessage 首行 `@.forge/docs/features/<slug>/`', () => {
    const docsRoot = docsRootOf('Z:\\project\\dsh', 'Z:\\project\\dsh\\.forge')
    const container = subgraphDiagContainer(CONTAINER, docsRoot)
    expect(container.docsRoot).toBe('.forge/docs')
    expect(formatDiagMessage({ kind: 'subgraph', container, violations: [] }).split('\n')[0]).toBe(
      '@.forge/docs/features/m2-pipeline/',
    )
  })

  it('docsRoot 缺席 = 键缺席（回退 @docs 缺省锚）；标题 = resolved 标题', () => {
    const container = subgraphDiagContainer(CONTAINER, undefined)
    expect('docsRoot' in container).toBe(false)
    expect(container.title).toBe('m2-pipeline')
    expect(formatDiagMessage({ kind: 'subgraph', container, violations: [] }).split('\n')[0]).toBe(
      '@docs/features/m2-pipeline/',
    )
  })
})

// ─────────────────────────── 装载壳（effect 面——createRoot + act） ───────────────────────────

/** 装载壳 client 桩：tasks.list 按有无 source 路由（池全域 / 容器过滤——仅按 slug，kind 不参与）+ stats/graph */
function shellClient(): {
  readonly client: ForgeRpcClient
  readonly listCalls: { source: { kind: string; slug: string } | undefined; search?: string }[]
} {
  const listCalls: { source: { kind: string; slug: string } | undefined; search?: string }[] = []
  const fail = (): Promise<never> => Promise.reject(new Error('不应调用'))
  const client = {
    tasks: {
      list: async (q: { projectId: string; source?: { kind: string; slug: string }; search?: string }) => {
        listCalls.push({ source: q.source, ...(q.search !== undefined ? { search: q.search } : {}) })
        if (q.source === undefined) return [...AGG_CARDS] as never
        return (AGG_CARDS.filter((c) => c.slug === q.source?.slug) as never)
      },
      stats: async () => STATS,
      graph: async () => GRAPH,
      detail: fail,
      transition: fail,
      query: fail,
      validateFeatureTasks: fail,
      sessionLinks: fail,
    },
    projects: { register: fail, list: fail, get: fail, update: fail, reconcile: fail },
    fs: { listDir: fail },
    knowledge: { browse: fail, listEntries: fail, entryDetail: fail, heat: fail, sessionRecall: fail },
    features: { register: fail, transition: fail, upsertDoc: fail, list: fail, listDocs: fail },
    docs: { read: fail, openExternal: fail },
    settings: { get: fail, set: fail },
  } as unknown as ForgeRpcClient
  return { client, listCalls }
}

async function mountTasksTab(client: ForgeRpcClient, props: Record<string, unknown> = {}): Promise<{
  html: () => string
  cleanup: () => Promise<void>
}> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <TasksTab
        projectId="p-1"
        search=""
        sort="active"
        activeStatuses={new Set<TaskStatus>()}
        statusFilter={[]}
        onToggleStatus={NOOP}
        onClearStatuses={NOOP}
        makeClient={() => client}
        {...props}
      />,
    )
  })
  return {
    html: () => host.innerHTML,
    cleanup: () =>
      act(async () => {
        root.unmount()
        host.remove()
      }),
  }
}

describe('TasksTab 装载壳（容器来源 = 任务数据聚合——AC①②④）', () => {
  it('AC① 有任务卡（多容器）→ 缺省首容器解析有值 + pill + 任务卡渲染（修前：features 空即恒空态·必红）', async () => {
    const { client, listCalls } = shellClient()
    const view = await mountTasksTab(client)
    const html = view.html()
    expect(html).toContain('data-dswf-tt-contpill') // 容器 pill 在场（非「暂无任务容器」）
    expect(html).not.toContain('暂无任务容器')
    expect(html).toContain('data-dswf-tt-item=') // 任务卡渲染
    // 缺省容器 = 首项（稳定排序）；容器装载 = 池全域 list（无 source 参）
    expect(listCalls[0]).toEqual({ source: undefined })
    const containerCall = listCalls.find((c) => c.source !== undefined)
    expect(containerCall?.source).toEqual({ kind: 'proposal', slug: 'legacy-eval-retire' })
    await view.cleanup()
  })

  it('AC② 任务列表真空 → 「暂无任务容器」空态', async () => {
    const { client } = shellClient()
    vi.spyOn(client.tasks, 'list').mockResolvedValue([] as never)
    const view = await mountTasksTab(client)
    expect(view.html()).toContain('暂无任务容器')
    await view.cleanup()
  })

  it('AC③ 容器装载在途 = 骨架而非空态（SSR 首帧同口径）', () => {
    const { client } = shellClient()
    const html = renderToStaticMarkup(
      <TasksTab
        projectId="p-1"
        search=""
        sort="active"
        activeStatuses={new Set<TaskStatus>()}
        statusFilter={[]}
        onToggleStatus={NOOP}
        onClearStatuses={NOOP}
        makeClient={() => client}
      />,
    )
    expect(html).toContain('data-dswf-tt-skeleton')
    expect(html).not.toContain('暂无任务容器')
  })

  it('AC④ 多容器显式路由：taskFocus slug 命中 blitz 容器 → 按所选 slug 拉取（source 语义保留）', async () => {
    const { client, listCalls } = shellClient()
    const view = await mountTasksTab(client, { featureSlug: 'legacy-eval-retire' })
    const html = view.html()
    expect(html).toContain('data-dswf-tt-contpill="legacy-eval-retire"')
    expect(html).toContain('data-dswf-tt-item="t-3"') // 该 spec 容器任务卡
    const containerCall = listCalls.find((c) => c.source !== undefined)
    expect(containerCall?.source).toEqual({ kind: 'proposal', slug: 'legacy-eval-retire' })
    await view.cleanup()
  })

  it('AC⑤ 关键词筛选：搜索原文归一后随容器 scope 入 tasks.list（服务端过滤入口在场）', async () => {
    const { client, listCalls } = shellClient()
    const view = await mountTasksTab(client, { search: ' 网关 ' })
    const containerCall = listCalls.find((c) => c.source !== undefined)
    expect(containerCall).toEqual({ source: { kind: 'proposal', slug: 'legacy-eval-retire' }, search: '网关' })
    await view.cleanup()
  })

  it('AC⑥ pill 菜单选「全部任务」→ tasks.list/stats 不带 source（跨容器搜索/筛选成立）', async () => {
    const { client, listCalls } = shellClient()
    const statsCalls: unknown[] = []
    const base = client.tasks.stats as (q: unknown) => Promise<unknown>
    vi.spyOn(client.tasks, 'stats').mockImplementation(((q: unknown) => {
      statsCalls.push(q)
      return base(q)
    }) as never)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(<TasksTab projectId="p-1" search="网关" sort="active" activeStatuses={new Set<TaskStatus>()} statusFilter={[]} onToggleStatus={NOOP} onClearStatuses={NOOP} makeClient={() => client} />)
    })
    const pill = host.querySelector('[data-dswf-tt-contpill]') as HTMLElement
    await act(async () => {
      pill.click()
    })
    const allRow = document.querySelector('[data-dswf-tt-mcont="all"]') as HTMLElement | null
    expect(allRow, '菜单须渲染「全部任务」行').not.toBeNull()
    const item = (allRow as HTMLElement).closest('[role="menuitem"], li, button') ?? (allRow as HTMLElement)
    await act(async () => {
      item.click()
    })
    expect(host.querySelector('[data-dswf-tt-contpill="all"]')).not.toBeNull()
    const scoped = listCalls.filter((c) => c.search !== undefined)
    expect(scoped.at(-1)).toEqual({ source: undefined, search: '网关' }) // 修前：恒带容器 source——关键词只能搜当前容器
    expect(statsCalls.at(-1)).toEqual({ projectId: 'p-1' })
    expect(host.innerHTML).toContain('data-dswf-tt-item="t-1"') // 另一容器任务卡可见
    expect(host.innerHTML).toContain('data-dswf-tt-item="t-3"')
    await act(async () => {
      root.unmount()
      host.remove()
    })
  })
})
