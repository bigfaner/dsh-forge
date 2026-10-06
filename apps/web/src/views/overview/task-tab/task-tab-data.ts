// 任务子 tab 数据装载（定位：业务——tasks.{list,stats,graph} 三通道消费面 + 写推送
// 事件静默重取）。Hard Rule「搜索过滤服务端承载」：search/statusFilter/sort 原样入
// listTasks 查询参（三视图共同 vis 集单源——chips 过滤/搜索/排序三视图统一由此承载）；
// taskGraph 按 featureSlug 拉取（AC5——查询面无过滤参，DAG 边集 = 全子图拓扑 ∩ vis 集，
// 交集归 task-tab-model dagVisibleSet）。装载态机沿 overview-data 形制：键变重拉 +
// 序号守卫 + 缓存先行（搜索键入不清场——IME 安全配套）；feature/项目切换 = 清场骨架。
// 事件刷新 = subscribeTasksChanged（drawer 同口径——projectId 匹配才重取）。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TaskCard, TaskGraph, TaskStatus, TaskStats } from '@dsh-forge/contracts'
import {
  preloadRpcClientFactory,
  subscribeTasksChanged,
  type ForgeRpcClient,
  type RpcClientFactory,
} from '../../../rpc/index.js'
import { RpcClientError } from '../../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../../rpc/ui-state.js'
import { searchQueryOf, type OverviewSort } from '../overview-model.js'
import type { TaskViewMode } from './task-tab-model.js'

/** 错误附载（message 原样 + rpcUiState 三态——概览域同口径） */
export interface TasksTabError {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 拉取结果（ok/error 归一——永不 reject） */
export type TasksTabFetch =
  | { readonly ok: true; readonly cards: TaskCard[]; readonly stats: TaskStats; readonly graph?: TaskGraph }
  | { readonly ok: false; readonly error: TasksTabError }

/** 装载查询输入（view 决定是否增拉 graph——DAG 视图专属） */
export interface TasksTabFetchInput {
  readonly projectId: string
  readonly featureSlug: string
  readonly statusFilter: readonly TaskStatus[]
  readonly search: string
  readonly sort: OverviewSort
  readonly view: TaskViewMode
}

function mapTasksTabError(error: unknown): TasksTabError {
  if (error instanceof RpcClientError) {
    return { message: error.message, uiState: rpcUiState(error.code) }
  }
  return { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' }
}

/**
 * 装载面（纯异步）：tasks.list（服务端过滤/排序）∥ tasks.stats（feature 域七态计数——
 * chips 计数单源）∥（DAG 视图）tasks.graph（featureSlug 全子图拓扑）。
 */
export async function fetchTasksTabData(client: ForgeRpcClient, input: TasksTabFetchInput): Promise<TasksTabFetch> {
  const search = searchQueryOf(input.search)
  const listQuery = {
    projectId: input.projectId,
    featureSlug: input.featureSlug,
    ...(input.statusFilter.length > 0 ? { statusFilter: [...input.statusFilter] } : {}),
    ...(search !== undefined ? { search } : {}),
    sort: input.sort,
  }
  try {
    if (input.view === 'dag') {
      const [cards, stats, graph] = await Promise.all([
        client.tasks.list(listQuery),
        client.tasks.stats({ projectId: input.projectId, featureSlug: input.featureSlug }),
        client.tasks.graph({ projectId: input.projectId, featureSlug: input.featureSlug }),
      ])
      return { ok: true, cards, stats, graph }
    }
    const [cards, stats] = await Promise.all([
      client.tasks.list(listQuery),
      client.tasks.stats({ projectId: input.projectId, featureSlug: input.featureSlug }),
    ])
    return { ok: true, cards, stats }
  } catch (error) {
    return { ok: false, error: mapTasksTabError(error) }
  }
}

/** 装载态（hook 输出——TasksTabBody 消费形状） */
export interface TasksTabLoadState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly cards: readonly TaskCard[] | undefined
  readonly graph: TaskGraph | undefined
  readonly stats: TaskStats | undefined
  /** 重取在途（旧内容保持可见的不阻塞标注） */
  readonly busy: boolean
  readonly error: TasksTabError | undefined
}

/** 初始态（首装前：骨架相位） */
export function initialTasksTabLoadState(): TasksTabLoadState {
  return { phase: 'loading', cards: undefined, graph: undefined, stats: undefined, busy: true, error: undefined }
}

/** 装载键（feature/视图/过滤/搜索/排序/nonce 全入键——statusFilter 序列化稳化数组恒等） */
export function tasksTabLoadKey(input: {
  readonly projectId: string
  readonly featureSlug: string | undefined
  readonly view: TaskViewMode
  readonly statusFilter: readonly TaskStatus[]
  readonly search: string
  readonly sort: OverviewSort
  readonly nonce: number
}): string {
  return `${input.projectId}#${input.featureSlug ?? ''}#${input.view}#${[...input.statusFilter].join(',')}|${input.sort}#${input.nonce}`
}

/** 在途态（纯函数）：清场（feature/项目切换）= 归零骨架；否则旧内容 + busy */
export function pendingTasksTab(prev: TasksTabLoadState, mustClear: boolean): TasksTabLoadState {
  return mustClear ? { ...initialTasksTabLoadState() } : { ...prev, busy: true }
}

/** 落点（纯函数）：error 保留旧内容（重取失败不掏空——错误条 + 旧行保持）；无旧内容 = 错误相位 */
export function applyTasksTabFetch(prev: TasksTabLoadState, out: TasksTabFetch): TasksTabLoadState {
  if (!out.ok) {
    if (prev.cards !== undefined) {
      return { ...prev, busy: false, error: out.error }
    }
    return { ...initialTasksTabLoadState(), phase: 'error', busy: false, error: out.error }
  }
  return { phase: 'ready', cards: out.cards, graph: out.graph, stats: out.stats, busy: false, error: undefined }
}

/**
 * 任务子 tab 装载 hook：键变重拉（feature/视图/过滤/搜索/排序/重试/事件刷新）+
 * 序号守卫 + 缓存先行；subscribeTasksChanged 同项目事件 → 静默重取（写后单次重取即见）。
 * @param projectId - 当前项目
 * @param featureSlug - 选中 feature（undefined = 无 feature 不装载）
 * @param view - 三视图模式（dag 增拉 graph）
 * @param statusFilter - chips 激活集白名单参（空 = 全部）
 * @param search - 搜索关键词原文（归一归 fetch 面）
 * @param sort - 排序模式（服务端参）
 * @param makeClient - RPC client 构造器（缺省 preload 真身；注入 = 测试面）
 * @returns [装载态, { retry }]（retry = 错误条重取位——nonce 递增全量重拉）
 */
export function useTasksTabLoad(
  projectId: string,
  featureSlug: string | undefined,
  view: TaskViewMode,
  statusFilter: readonly TaskStatus[],
  search: string,
  sort: OverviewSort,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [TasksTabLoadState, { readonly retry: () => void }] {
  const [state, setState] = useState<TasksTabLoadState>(initialTasksTabLoadState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)
  const lastKeyRef = useRef('')
  const lastScopeRef = useRef(`${projectId}#${featureSlug ?? ''}`)

  useEffect(() => {
    if (featureSlug === undefined) return
    const key = tasksTabLoadKey({ projectId, featureSlug, view, statusFilter, search, sort, nonce })
    const scope = `${projectId}#${featureSlug}`
    const mustClear = lastScopeRef.current !== scope
    const isFetch = lastKeyRef.current !== key
    lastKeyRef.current = key
    lastScopeRef.current = scope
    if (!isFetch) return
    const seq = ++seqRef.current
    setState((prev) => pendingTasksTab(prev, mustClear))
    void fetchTasksTabData(makeClient(), { projectId, featureSlug, statusFilter, search, sort, view }).then((out) => {
      if (seq !== seqRef.current) return
      setState((prev) => applyTasksTabFetch(prev, out))
    })
  }, [projectId, featureSlug, view, statusFilter, search, sort, nonce, makeClient])

  // 写推送事件（forge:events/tasks-changed）→ 同项目静默重取（50ms 合并归订阅层）
  useEffect(() => {
    if (featureSlug === undefined) return () => {}
    return subscribeTasksChanged((payload) => {
      if (payload.projectId === projectId) setNonce((n) => n + 1)
    })
  }, [projectId, featureSlug])

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  return [state, { retry }] as const
}
