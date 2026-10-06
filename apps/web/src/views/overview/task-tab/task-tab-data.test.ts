// 任务子 tab 数据装载单测 —— AC4/AC5 查询参面（Hard Rule「搜索过滤服务端承载」：
// listTasks search/statusFilter/sort 透传）+ AC5「taskGraph 按 featureSlug 拉取」（DAG
// 视图增拉 graph，边集源）+ channels 录制断言（fetch 纯异步面；hook effect 编排归 4.1
// 装配 + 5.2 e2e——renderToStaticMarkup 不跑 effect，同 overview-data 口径）。
import { describe, expect, it } from 'vitest'
import type { TaskCard, TaskGraph, TaskStats } from '@dsh-forge/contracts'
import { RpcClientError } from '../../../rpc/errors.js'
import type { ForgeRpcClient } from '../../../rpc/index.js'
import {
  applyTasksTabFetch,
  fetchTasksTabData,
  initialTasksTabLoadState,
  pendingTasksTab,
  tasksTabLoadKey,
} from './task-tab-data.js'
import { cardFixture } from './task-tab-model.test.js'

const CARDS: TaskCard[] = [cardFixture()]
const STATS: TaskStats = {
  total: 1,
  byStatus: { pending: 0, in_progress: 0, completed: 1, blocked: 0, suspended: 0, skipped: 0, rejected: 0 },
}
const GRAPH: TaskGraph = { tasks: [...CARDS], edges: [] }

/** 录制 client（tasks 三通道注入桩；其余通道 fail-loud） */
function recordingClient(impl: {
  list?: () => Promise<TaskCard[]>
  stats?: () => Promise<TaskStats>
  graph?: () => Promise<TaskGraph>
}): { client: ForgeRpcClient; calls: { channel: string; payload: unknown }[] } {
  const calls: { channel: string; payload: unknown }[] = []
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
        list: async (q: unknown) => {
          calls.push({ channel: 'tasks.list', payload: q })
          return impl.list?.() ?? Promise.resolve(CARDS)
        },
        stats: async (q: unknown) => {
          calls.push({ channel: 'tasks.stats', payload: q })
          return impl.stats?.() ?? Promise.resolve(STATS)
        },
        graph: async (q: unknown) => {
          calls.push({ channel: 'tasks.graph', payload: q })
          return impl.graph?.() ?? Promise.resolve(GRAPH)
        },
        detail: fail,
        sessionLinks: fail,
      },
      features: { register: fail, transition: fail, upsertDoc: fail, list: fail },
      proposals: { list: fail },
      docs: { read: fail, openExternal: fail },
    } as unknown as ForgeRpcClient,
  }
}

describe('fetchTasksTabData（唯一装载面——查询参透传）', () => {
  it('列表/泳道视图：tasks.list + tasks.stats 两通道；search/statusFilter/sort 原样入参', async () => {
    const { client, calls } = recordingClient({})
    const out = await fetchTasksTabData(client, {
      projectId: 'p-1',
      featureSlug: 'm2-pipeline',
      statusFilter: ['completed', 'blocked'],
      search: '评估',
      sort: 'created',
      view: 'list',
    })
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.cards).toEqual(CARDS)
      expect(out.stats).toEqual(STATS)
      expect(out.graph).toBeUndefined()
    }
    expect(calls.map((c) => c.channel).sort()).toEqual(['tasks.list', 'tasks.stats'])
    expect(calls.find((c) => c.channel === 'tasks.list')?.payload).toEqual({
      projectId: 'p-1',
      featureSlug: 'm2-pipeline',
      statusFilter: ['completed', 'blocked'],
      search: '评估',
      sort: 'created',
    })
    expect(calls.find((c) => c.channel === 'tasks.stats')?.payload).toEqual({
      projectId: 'p-1',
      featureSlug: 'm2-pipeline',
    })
  })

  it('空 statusFilter/空 search 归一为不带参（undefined——空集 = 全部）', async () => {
    const { client, calls } = recordingClient({})
    await fetchTasksTabData(client, {
      projectId: 'p-1',
      featureSlug: 'f',
      statusFilter: [],
      search: '',
      sort: 'active',
      view: 'swim',
    })
    expect(calls.find((c) => c.channel === 'tasks.list')?.payload).toEqual({
      projectId: 'p-1',
      featureSlug: 'f',
      sort: 'active',
    })
  })

  it('DAG 视图：增拉 tasks.graph({projectId, featureSlug})（AC5——taskGraph 按 featureSlug）', async () => {
    const { client, calls } = recordingClient({})
    const out = await fetchTasksTabData(client, {
      projectId: 'p-1',
      featureSlug: 'm2-pipeline',
      statusFilter: [],
      search: '',
      sort: 'active',
      view: 'dag',
    })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.graph).toEqual(GRAPH)
    expect(calls.map((c) => c.channel).sort()).toEqual(['tasks.graph', 'tasks.list', 'tasks.stats'])
    expect(calls.find((c) => c.channel === 'tasks.graph')?.payload).toEqual({
      projectId: 'p-1',
      featureSlug: 'm2-pipeline',
    })
  })

  it('任一通道 typed error → 归一错误（RpcClientError → rpcUiState 映射）', async () => {
    const { client } = recordingClient({
      list: () => Promise.reject(new RpcClientError({ code: 'ERR_WORKSPACE_DB_UNAVAILABLE', message: '库不可用' })),
    })
    const out = await fetchTasksTabData(client, {
      projectId: 'p-1',
      featureSlug: 'f',
      statusFilter: [],
      search: '',
      sort: 'active',
      view: 'list',
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error.message).toBe('库不可用')
      expect(out.error.uiState).toBe('banner')
    }
  })

  it('非 typed 传输错误 → 错误条三态', async () => {
    const { client } = recordingClient({ stats: () => Promise.reject(new Error('传输断开')) })
    const out = await fetchTasksTabData(client, {
      projectId: 'p-1',
      featureSlug: 'f',
      statusFilter: [],
      search: '',
      sort: 'active',
      view: 'list',
    })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error.uiState).toBe('error-bar')
  })
})

describe('装载态落点（纯函数——hook 消费形）', () => {
  it('initial = 骨架相位（cards/stats 全缺 + busy）', () => {
    expect(initialTasksTabLoadState()).toEqual({
      phase: 'loading',
      cards: undefined,
      graph: undefined,
      stats: undefined,
      busy: true,
      error: undefined,
    })
  })

  it('tasksTabLoadKey：feature/视图/过滤/搜索/排序/nonce 全入键', () => {
    const base = { projectId: 'p-1', featureSlug: 'f', view: 'list' as const, statusFilter: [], search: '', sort: 'active' as const, nonce: 0 }
    expect(tasksTabLoadKey(base)).toBe('p-1#f#list#|active#0')
    expect(tasksTabLoadKey({ ...base, statusFilter: ['completed', 'blocked'] })).toBe('p-1#f#list#completed,blocked|active#0')
    expect(tasksTabLoadKey({ ...base, view: 'dag' })).not.toBe(tasksTabLoadKey(base))
    expect(tasksTabLoadKey({ ...base, nonce: 1 })).not.toBe(tasksTabLoadKey(base))
  })

  it('pendingTasksTab：清场（feature 切换）= 归零骨架；否则旧内容 + busy', () => {
    const ready = applyTasksTabFetch(initialTasksTabLoadState(), {
      ok: true,
      cards: CARDS,
      stats: STATS,
      graph: undefined,
    })
    expect(ready.phase).toBe('ready')
    const cleared = pendingTasksTab(ready, true)
    expect(cleared.cards).toBeUndefined()
    expect(cleared.busy).toBe(true)
    const kept = pendingTasksTab(ready, false)
    expect(kept.cards).toEqual(CARDS)
    expect(kept.busy).toBe(true)
  })

  it('applyTasksTabFetch：error 保留旧内容 + 错误条（重取失败不掏空）', () => {
    const ready = applyTasksTabFetch(initialTasksTabLoadState(), { ok: true, cards: CARDS, stats: STATS, graph: undefined })
    const errored = applyTasksTabFetch(ready, { ok: false, error: { message: 'x', uiState: 'error-bar' } })
    expect(errored.phase).toBe('ready') // 旧内容在场相位保持
    expect(errored.cards).toEqual(CARDS)
    expect(errored.error?.message).toBe('x')
    const noContent = applyTasksTabFetch(initialTasksTabLoadState(), { ok: false, error: { message: 'x', uiState: 'error-bar' } })
    expect(noContent.phase).toBe('error')
  })

  it('applyTasksTabFetch：成功落位（graph 仅 DAG 视图非缺省）', () => {
    const out = applyTasksTabFetch(initialTasksTabLoadState(), { ok: true, cards: CARDS, stats: STATS, graph: GRAPH })
    expect(out).toEqual({ phase: 'ready', cards: CARDS, graph: GRAPH, stats: STATS, busy: false, error: undefined })
  })
})
