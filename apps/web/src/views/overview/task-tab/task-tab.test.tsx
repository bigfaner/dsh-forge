// 任务子 tab 组装单测 —— 4.6 UF-3（AC3/AC5/AC6）：ov-taskbar v22 布局（容器 pill 双轨 +
// 视图下拉 + 右簇 [诊断]+[派发] 固定最右端同行不换行）+ chips 统一过滤 + 三视图分派 +
// 三态面 + 无单任务执行入口断言（v22 ㊳ Hard Rule）+ runDispatchRoute 双路由执行
// （mock client：jump / new / RPC 失败回退 new）。装载壳 effect 面 = 4.1/5.2；
// 纯渲染体 TasksTabBody 全相位静态可测；containerMenuItems/Select 菜单映射纯函数直测。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FeatureCard, ProposalCard, TaskGraph, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import { TasksTabBody, containerMenuItems, runDispatchRoute } from './task-tab.js'
import type { TaskContainerOption } from './container-pill.js'
import { containerMenuSelect, containerPillChip, containerCountNote, resolveContainer } from './task-tab-model.js'
import { taskContainerOptions } from './container-pill.js'
import type { TasksTabLoadState } from './task-tab-data.js'
import type { DiagToastResult } from './DiagToast.js'
import { cardFixture } from './task-tab-model.test.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'

const NOOP = (): void => {}

/** 菜单行 label 取值（MenuItem 窄化 + 缺席 = 空——测试辅助面） */
function menuRowLabel(items: readonly MenuEntry[], index: number): ReactNode {
  const entry = items[index]
  if (entry === undefined || !('label' in entry)) return null
  return entry.label
}

const FEATURES: readonly FeatureCard[] = [
  {
    featureId: 'f-1',
    slug: 'm2-pipeline',
    title: 'M2 管线',
    featureStatus: 'in-progress',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
    docCount: 4,
  },
]

const BLITZ_PROPOSAL: ProposalCard = {
  proposalId: 'pr-blitz',
  slug: 'legacy-eval-retire',
  title: '旧线 eval 退役',
  proposalStatus: 'accepted',
  mode: 'blitz',
  taskCount: 2,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

const STATS: TaskStats = {
  total: 2,
  byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
  unmetPending: 0,
}

const GRAPH: TaskGraph = { tasks: [cardFixture()], edges: [] }

const OPTIONS = taskContainerOptions(FEATURES, [BLITZ_PROPOSAL])
const FEATURE_CONTAINER = OPTIONS[0] as TaskContainerOption
const BLITZ_CONTAINER = OPTIONS[1] as TaskContainerOption

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
  features: FEATURES,
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

describe('TasksTabBody · ov-taskbar v22 布局（AC3/AC6——插入点断言）', () => {
  it('工具栏 = 容器 pill（双轨点 + chip）+ 视图下拉（pill 右侧）+ 右簇 [诊断][派发] 最右端（DOM 序）', () => {
    const html = render()
    expect(html).toContain('data-dswf-tt-taskbar=""')
    expect(html).toContain('data-dswf-tt-contpill="feature:m2-pipeline"')
    expect(html).toContain('class="dswf-tt-contdot" data-mode="expedition"')
    expect(html).toContain('进行中 1/2')
    const pillAt = html.indexOf('data-dswf-tt-contpill')
    const viewAt = html.indexOf('data-dswf-tt-viewbtn="list"')
    const diagAt = html.indexOf('data-dswf-tt-diag=""')
    const dispatchAt = html.indexOf('data-dswf-tt-dispatch=')
    expect(viewAt).toBeGreaterThan(pillAt) // 视图下拉在 pill 右侧
    expect(diagAt).toBeGreaterThan(viewAt) // 右簇在视图下拉之后
    expect(dispatchAt).toBeGreaterThan(diagAt) // 派发居最右
    expect(html).toContain('data-dswf-tt-rightbar') // 右簇容器
  })

  it('突击提案容器：琥珀点 + 「突击提案」chip + 「无 feature 阶段」计数注 + 无「诊断」按钮', () => {
    const html = render({ container: BLITZ_CONTAINER })
    expect(html).toContain('data-dswf-tt-contpill="proposal:legacy-eval-retire"')
    expect(html).toContain('class="dswf-tt-contdot" data-mode="blitz"')
    expect(html).toContain('突击提案 · 2 任务')
    expect(html).toContain('2 条 · 突击提案容器（无 feature 阶段）')
    expect(html).not.toContain('data-dswf-tt-diag') // validateFeatureTasks 为 feature 域校验
    expect(html).toContain('data-dswf-tt-dispatch=') // 派发按钮仍可用面
  })

  it('feature 容器：「诊断」按钮在场 + 派发按钮', () => {
    const html = render()
    expect(html).toContain('data-dswf-tt-diag=""')
    expect(html).toContain('>诊断</button>')
    expect(html).toContain('>派发</button>')
  })

  it('视图下拉锚钮 = 当前视图直出 + ▾（M2 三视图语义不变·控件形态为下拉）', () => {
    expect(render()).toContain('视图：列表')
    expect(render({ view: 'dag', load: load({ graph: GRAPH }) })).toContain('视图：DAG')
    expect(render({ view: 'swim' })).toContain('视图：泳道')
  })

  it('搜索在场计数 = 匹配/总数（服务端过滤面）', () => {
    const html = render({ search: '评估' })
    expect(html).toContain('1/2')
  })

  it('无单任务执行入口（v22 ㊳ Hard Rule）：任务行/工具栏零「执行」动作', () => {
    const html = render()
    expect(html).not.toContain('>执行<')
    expect(html).not.toContain('data-dswf-tt-exec')
  })
})

describe('TasksTabBody · chips 统一过滤（AC4 沿袭）', () => {
  it('七态 chips（StatusChips 复用）+ 计数 = 容器域 stats 单源', () => {
    const html = render()
    expect(html).toContain('data-dswf-ov-stchips=""')
    expect(html).toContain('data-dswf-ov-stchip="completed"')
    expect(html).toContain('data-dswf-ov-stchip="pending"')
  })

  it('stats 在途 = 全 0 计数（chips 全禁用——不可点出空态）', () => {
    const html = render({ load: load({ stats: undefined }) })
    expect(html).toContain('disabled')
  })
})

describe('TasksTabBody · 三视图分派（AC1/AC2/AC3 沿袭）', () => {
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
    const zero: TaskStats = { total: 0, byStatus: { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 }, unmetPending: 0 }
    expect(render({ load: load({ cards: [], stats: zero }) })).toContain('本容器暂无任务')
    expect(render({ search: '不存在', load: load({ cards: [] }) })).toContain('无匹配「不存在」的任务')
    expect(render({ activeStatuses: new Set<TaskStatus>(['blocked']), load: load({ cards: [] }) })).toContain('当前过滤组合无任务')
  })

  it('零容器 = 容器空态（无 taskbar）', () => {
    const html = render({ options: [], features: [], container: undefined })
    expect(html).toContain('暂无任务容器')
    expect(html).not.toContain('data-dswf-tt-taskbar')
  })
})

describe('容器菜单与解析纯函数（AC5 双轨）', () => {
  it('containerMenuItems：双轨行集——feature 完成比 + 突击（突击提案）标记 + N 任务', () => {
    const items = containerMenuItems(OPTIONS, FEATURES)
    expect(items.map((entry) => entry.id)).toEqual(['feature:m2-pipeline', 'proposal:legacy-eval-retire'])
    const first = renderToStaticMarkup(menuRowLabel(items, 0))
    expect(first).toContain('m2-pipeline')
    expect(first).toContain('进行中 1/2')
    const second = renderToStaticMarkup(menuRowLabel(items, 1))
    expect(second).toContain('legacy-eval-retire（突击提案）')
    expect(second).toContain('2 任务')
  })

  it('containerMenuSelect：id → 选项；未知 id = undefined', () => {
    expect(containerMenuSelect(OPTIONS, 'proposal:legacy-eval-retire')?.slug).toBe('legacy-eval-retire')
    expect(containerMenuSelect(OPTIONS, 'ghost')).toBeUndefined()
  })

  it('containerPillChip / containerCountNote：feature stats 单源优先；突击附「无 feature 阶段」注', () => {
    expect(containerPillChip(FEATURE_CONTAINER, '1/2')).toBe('1/2')
    expect(containerPillChip(FEATURE_CONTAINER, undefined)).toBe('2 任务')
    expect(containerPillChip(BLITZ_CONTAINER, '1/2')).toBe('突击提案 · 2 任务')
    expect(containerCountNote(FEATURE_CONTAINER, '2 条')).toBe('2 条')
    expect(containerCountNote(BLITZ_CONTAINER, '2 条')).toBe('2 条 · 突击提案容器（无 feature 阶段）')
    expect(containerCountNote(BLITZ_CONTAINER, undefined)).toBeUndefined()
  })

  it('resolveContainer：显式命中优先；未命中回退活跃 feature；零选项 = undefined', () => {
    expect(resolveContainer(OPTIONS, { kind: 'proposal', slug: 'legacy-eval-retire' }, 'm2-pipeline')?.slug).toBe('legacy-eval-retire')
    expect(resolveContainer(OPTIONS, { kind: 'feature', slug: 'ghost' }, 'm2-pipeline')?.slug).toBe('m2-pipeline')
    expect(resolveContainer(OPTIONS, undefined, 'm2-pipeline')?.slug).toBe('m2-pipeline')
    expect(resolveContainer(OPTIONS, undefined, undefined)?.slug).toBe('m2-pipeline') // 首 feature 缺省
    expect(resolveContainer([], undefined, undefined)).toBeUndefined()
  })
})

// ─────────────────────────── 派发双路由执行（AC3——runDispatchRoute） ───────────────────────────

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
    projects: { register: fail, list: fail, get: fail, update: fail, reconcile: fail, deriveTaskStoreDir: fail },
    fs: { listDir: fail },
    knowledge: { browse: fail, listEntries: fail, entryDetail: fail, heat: fail, sessionRecall: fail },
    features: { register: fail, transition: fail, upsertDoc: fail, list: fail, listDocs: fail },
    proposals: { list: fail, transition: fail, setMode: fail, listDocs: fail },
    docs: { read: fail, openExternal: fail },
    settings: { get: fail, set: fail },
  } as unknown as ForgeRpcClient
}

type TaskCard_lazy = ReturnType<typeof cardFixture>

const RUNNING = { ...cardFixture(), taskId: 't-run', taskStatus: 'in_progress' as const }

describe('runDispatchRoute（AC3 双路由执行——图 13）', () => {
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

  it('无执行中任务 → new（容器对应模式 + /run-tasks 指令单行·v23 最小消息）', async () => {
    const seen: string[] = []
    await runDispatchRoute(
      { projectId: 'p-1', container: BLITZ_CONTAINER, client: dispatchClient({ list: [cardFixture()] }) },
      {
        onJump: () => seen.push('jump'),
        onNew: (mode, command) => seen.push(`new:${mode}:${command}`),
      },
    )
    expect(seen).toEqual(['new:blitz:/run-tasks legacy-eval-retire'])
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
    expect(seen).toEqual(['new:expedition:/run-tasks m2-pipeline'])
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
    expect(seen).toEqual(['new:expedition:/run-tasks m2-pipeline'])
  })
})

describe('TasksTab 装载壳（静态首帧——effect 未跑）', () => {
  it('首帧 = taskbar 壳 + 骨架（拉取不阻塞结构呈现；活跃 feature 缺省解析）', async () => {
    const { TasksTab } = await import('./task-tab.js')
    const html = renderToStaticMarkup(
      <TasksTab
        projectId="p-1"
        search=""
        sort="active"
        activeStatuses={new Set<TaskStatus>()}
        statusFilter={[]}
        features={FEATURES}
        proposals={[BLITZ_PROPOSAL]}
        onToggleStatus={NOOP}
        onClearStatuses={NOOP}
      />,
    )
    expect(html).toContain('data-dswf-tt-taskbar')
    expect(html).toContain('data-dswf-tt-skeleton')
    expect(html).toContain('data-dswf-tt-contpill="feature:m2-pipeline"') // 活跃容器缺省解析
  })
})
