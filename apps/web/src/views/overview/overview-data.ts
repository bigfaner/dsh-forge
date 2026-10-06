// 概览数据装载（定位：业务——UF-1 概览 tab 框架的 forge:{projects,features,proposals,tasks}/* 消费面）。
// Hard Rule「搜索过滤服务端承载」：search/sort 一律作为 listProposals/listFeatures 查询参
// 透传（core 侧 matchesSearch + sortByActiveThenCreated），前端禁全量拉取本地过滤——
// 本文件零行本地过滤逻辑。装载拆两路（口径沿 use-knowledge-browse 先例）：
//   - 头路（mount/projectId/重试）：projects.get（项目名 + 三个目录位）∥ deriveTaskStoreDir
//     （任务清单 {flatten}@{hash8} 单源——fail-soft）∥ features.list（无参——ov-head 摘要
//     活跃 feature 与提案子 tab 谱系查找源，不随搜索漂移）∥ tasks.stats（chips 计数 + 完成数）
//   - 列路（subtab/search/sort/重试）：proposals 子 tab = proposals.list(search,sort)；
//     features 子 tab = features.list(search,sort) ∥ proposals.list（无参——来源提案查找源）；
//     tasks 子 tab = 3.5 无列装载（chips 消费头路 stats；三视图装载归 3.6）
// 竞态守卫 = 序号递增（快速连续键入不串台）；相位机 loading → ready | error（typed error
// 经 rpcUiState 三态映射）。effect 仅编排胶水（Node 测面外，归 4.1 装配 + e2e）。
import { useEffect, useRef, useState } from 'react'
import type { FeatureCard, ProposalCard, TaskStats } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, subscribeTasksChanged, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import { searchQueryOf, type OverviewSort, type OverviewSubtab } from './overview-model.js'

/** 错误附载（message = 信封 message 原样；uiState = rpcUiState(code) 三态映射） */
export interface OverviewErrorInfo {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 拉取结果（ok/error 归一——永不 reject） */
export type OverviewFetch<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: OverviewErrorInfo }

/** 错误归一（纯函数）：RpcClientError → code 三态映射；其余（传输/构造期）→ 错误条 */
export function mapOverviewError(error: unknown): OverviewErrorInfo {
  if (error instanceof RpcClientError) {
    return { message: error.message, uiState: rpcUiState(error.code) }
  }
  return { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' }
}

/** ov-head 信息束（projects.get + 派生行 + 无参 feature 列表 + 七态计数） */
export interface OverviewHeadBundle {
  readonly projectName: string
  readonly workspaceDir: string
  readonly forgeDir: string
  readonly knowledgeDir: string | null
  /** {tasksHome}/{flatten}@{hash8} 单源（派生预检位 RPC；失败 fail-soft = null → 行回退「—」） */
  readonly taskStoreDir: string | null
  /** 无搜索全量 feature 卡（ov-head 摘要活跃 feature + 提案子 tab 谱系查找源） */
  readonly features: readonly FeatureCard[]
  /** 七态计数（chips 计数与摘要完成数单源） */
  readonly stats: TaskStats
}

/** 概览 ov-head 四行（AC1：工作区/文档位置/知识目录/任务清单@hash8） */
export function overviewHeadRows(head: OverviewHeadBundle): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: '工作区', value: head.workspaceDir },
    { label: '文档位置', value: head.forgeDir },
    { label: '知识目录', value: head.knowledgeDir ?? '—' },
    { label: '任务清单', value: head.taskStoreDir ?? '—' },
  ]
}

/** 派生任务清单路径（fail-soft：缺席/失败 = null——不阻断头部装载） */
async function fetchTaskStoreDir(client: ForgeRpcClient, workspaceDir: string): Promise<string | null> {
  try {
    return (await client.projects.deriveTaskStoreDir(workspaceDir)).dir
  } catch {
    return null
  }
}

/** 头路装载（纯异步面）：get ∥ derive ∥ features.list(无参) ∥ tasks.stats 四路并发 */
export async function loadOverviewHead(client: ForgeRpcClient, projectId: string): Promise<OverviewFetch<OverviewHeadBundle>> {
  try {
    const [project, features, stats] = await Promise.all([
      client.projects.get(projectId),
      client.features.list({ projectId }),
      client.tasks.stats({ projectId }),
    ])
    if (project === null) throw new Error('项目不存在或已移除')
    const taskStoreDir = await fetchTaskStoreDir(client, project.wsPath)
    return {
      ok: true,
      data: {
        projectName: project.name,
        workspaceDir: project.wsPath,
        forgeDir: project.forgeDir,
        knowledgeDir: project.knowledgeDir,
        taskStoreDir,
        features,
        stats,
      },
    }
  } catch (error) {
    return { ok: false, error: mapOverviewError(error) }
  }
}

/** 子 tab 列数据（tagged——proposals 行 / features 行含来源提案查找源） */
export type OverviewListData =
  | { readonly kind: 'proposals'; readonly proposals: readonly ProposalCard[] }
  | {
      readonly kind: 'features'
      readonly features: readonly FeatureCard[]
      /** 无参提案列（来源提案标题/状态查找——不随搜索漂移） */
      readonly proposals: readonly ProposalCard[]
    }

/**
 * 列路装载（纯异步面——Hard Rule 锚）：search/sort 原样入查询参（服务端过滤与排序）。
 * tasks 子 tab = null（3.5 无列装载——三视图归 3.6，chips 消费头路 stats）。
 */
export async function fetchOverviewList(
  client: ForgeRpcClient,
  q: { readonly projectId: string; readonly subtab: OverviewSubtab; readonly search: string; readonly sort: OverviewSort },
): Promise<OverviewFetch<OverviewListData> | null> {
  const search = searchQueryOf(q.search)
  if (q.subtab === 'tasks') return null
  try {
    if (q.subtab === 'proposals') {
      return { ok: true, data: { kind: 'proposals', proposals: await client.proposals.list({ projectId: q.projectId, search, sort: q.sort }) } }
    }
    const [features, proposals] = await Promise.all([
      client.features.list({ projectId: q.projectId, search, sort: q.sort }),
      client.proposals.list({ projectId: q.projectId }),
    ])
    return { ok: true, data: { kind: 'features', features, proposals } }
  } catch (error) {
    return { ok: false, error: mapOverviewError(error) }
  }
}

/** 概览装载态（hook 输出——OverviewTab 消费形状） */
export interface OverviewLoadState {
  readonly phase: 'loading' | 'ready' | 'error'
  readonly head: OverviewHeadBundle | undefined
  readonly list: OverviewListData | undefined
  /** 列路在途（旧内容保持可见的不阻塞标注） */
  readonly busy: boolean
  readonly error: OverviewErrorInfo | undefined
}

/** 初始态（首装前：骨架相位） */
export function initialOverviewLoadState(): OverviewLoadState {
  return { phase: 'loading', head: undefined, list: undefined, busy: true, error: undefined }
}

/** 头路落点（纯函数）：bundle 落头部；error 保持旧列内容（头错不掏空内容区） */
export function applyOverviewHead(prev: OverviewLoadState, out: OverviewFetch<OverviewHeadBundle>): OverviewLoadState {
  if (!out.ok) return { ...prev, phase: 'error', error: out.error }
  return { ...prev, phase: 'ready', error: undefined, head: out.data }
}

/** 列路在途态（纯函数）：清场（子 tab/项目切换）= 骨架；否则旧内容 + busy */
export function pendingOverviewList(prev: OverviewLoadState, mustClear: boolean): OverviewLoadState {
  return mustClear ? { ...prev, list: undefined, busy: true } : { ...prev, busy: true }
}

/** 列路落点（纯函数）：null（tasks 子 tab 无装载）= 解除 busy；error 保留旧行 + 错误条 */
export function applyOverviewList(prev: OverviewLoadState, out: OverviewFetch<OverviewListData> | null): OverviewLoadState {
  if (out === null) return { ...prev, busy: false }
  if (!out.ok) return { ...prev, busy: false, error: out.error }
  return { ...prev, busy: false, error: undefined, list: out.data }
}

/** 列路装载判定输入（overviewListPlan 消费——refs 快照） */
export interface OverviewListPlanInput {
  /** 本次装载列键（projectId#subtab#search#sort#nonce） */
  readonly listKey: string
  /** 上一次列键（lastListKeyRef 快照） */
  readonly lastListKey: string
  readonly subtab: OverviewSubtab
  readonly lastSubtab: OverviewSubtab
  readonly projectId: string
  readonly lastProjectId: string
}

/** 列路装载判定（纯函数——knowledge browseLoadPlan 同形制）：键变 = 重拉；子 tab/项目切换 = 清场 */
export function overviewListPlan(input: OverviewListPlanInput): { readonly isFetch: boolean; readonly mustClear: boolean } {
  const isFetch = input.lastListKey !== input.listKey
  const mustClear = input.lastSubtab !== input.subtab || input.lastProjectId !== input.projectId
  return { isFetch, mustClear }
}

/**
 * 概览装载 hook（头路 mount/projectId/重试装载 + 列路 subtab/search/sort/重试装载 +
 * 写推送事件静默重取[4.1 接线]）。判定/落点全经纯函数（applyOverviewHead /
 * pendingOverviewList / applyOverviewList）——effect 仅编排：键变 → 装载 → 序号守卫落点。
 * 搜索键入 = 列路缓存先行（旧行保持可见 + busy），不清场（IME 安全配套——内容区在途
 * 更新，非重建）。事件重取（交互二：写后单次重取见新值）= subscribeTasksChanged 同项目
 * 事件 → 静默 nonce 递增（头路[stats/features]与列路活跃查询全量重取、内容不清场——
 * 50ms 合并归 web/rpc 订阅层；tasks 子 tab 三视图装载[useTasksTabLoad]与抽屉[useTaskDetail]
 * 各自订阅，同一口径）。
 * @param projectId - 当前项目（视图态注入——4.1 装配接线）
 * @param makeClient - RPC client 构造器（缺省 preload 真身；注入 = 测试面）
 */
export function useOverviewLoad(
  projectId: string,
  subtab: OverviewSubtab,
  search: string,
  sort: OverviewSort,
  nonce: number,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): OverviewLoadState {
  const [state, setState] = useState<OverviewLoadState>(initialOverviewLoadState)
  const [eventNonce, setEventNonce] = useState(0)
  const headSeqRef = useRef(0)
  const listSeqRef = useRef(0)
  const lastListKeyRef = useRef('')
  const lastSubtabRef = useRef(subtab)
  const lastProjectRef = useRef(projectId)
  const refreshNonce = nonce + eventNonce

  // 头路：mount / projectId / 重试 / 事件重取
  useEffect(() => {
    const seq = ++headSeqRef.current
    const client = makeClient()
    void loadOverviewHead(client, projectId).then((out) => {
      if (seq !== headSeqRef.current) return
      setState((prev) => applyOverviewHead(prev, out))
    })
  }, [projectId, refreshNonce, makeClient])

  // 列路：subtab / search / sort / projectId / 重试 / 事件重取（键变装载；子 tab 或项目切换 = 清场骨架）
  useEffect(() => {
    const listKey = `${projectId}#${subtab}#${search}#${sort}#${refreshNonce}`
    const plan = overviewListPlan({
      listKey,
      lastListKey: lastListKeyRef.current,
      subtab,
      lastSubtab: lastSubtabRef.current,
      projectId,
      lastProjectId: lastProjectRef.current,
    })
    lastListKeyRef.current = listKey
    lastSubtabRef.current = subtab
    lastProjectRef.current = projectId
    if (!plan.isFetch) return
    const seq = ++listSeqRef.current
    setState((prev) => pendingOverviewList(prev, plan.mustClear))
    const client = makeClient()
    void fetchOverviewList(client, { projectId, subtab, search, sort }).then((out) => {
      if (seq !== listSeqRef.current) return
      setState((prev) => applyOverviewList(prev, out))
    })
  }, [projectId, subtab, search, sort, refreshNonce, makeClient])

  // 写推送事件（forge:events/tasks-changed）→ 同项目静默重取（50ms 合并归订阅层）
  useEffect(
    () =>
      subscribeTasksChanged((payload) => {
        if (payload.projectId === projectId) setEventNonce((n) => n + 1)
      }),
    [projectId],
  )

  return state
}
