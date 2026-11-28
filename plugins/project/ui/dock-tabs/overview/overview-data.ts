// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 概览数据装载（定位：业务——UF-1 概览 tab 框架的 forge:{projects,features,tasks,bugs}/* 消费面）。
// Hard Rule「搜索过滤服务端承载」：search/sort 一律作为 listBugs 查询参
// 透传（core 侧 matchesSearch + sortByActiveThenCreated），前端禁全量拉取本地过滤——
// 本文件零行本地过滤逻辑。装载拆两路（口径沿 use-knowledge-browse 先例）：
//   - 头路（mount/projectId/重试）：projects.get（项目名 + 三个目录位）∥ features.list（无参
//     ——task-tab feature pill 数据源，不随搜索漂移）∥ tasks.stats（chips 计数 + 完成数）
//   - 列路（subtab/search/sort/重试）：
//     tasks 子 tab = 3.5 无列装载（chips 消费头路 stats；三视图装载归 3.6）
//     spec 子 tab = 无列装载（spec 列数据源与呈现归 G3 交付）
//     bugs 子 tab = bugs.list(search,sort,status) ∥ bugs.list（无参——三态计数）
// 竞态守卫 = 序号递增（快速连续键入不串台）；相位机 loading → ready | error（typed error
// 经 rpcUiState 三态映射）。effect 仅编排胶水（Node 测面外，归 4.1 装配 + e2e）。
import { useEffect, useRef, useState } from 'react'
import type { BugCard } from '@dsh-forge/lib-api/dto/bugs'
import type { BugStatus } from '@dsh-forge/lib-api/labels'
import type { DirFactRow } from '@dsh-forge/lib-api/dto/project'
import type { FeatureCard, TaskStats } from '@dsh-forge/lib-api/dto/forge'
import { subscribeTasksChanged, type ForgeRpcClient, type RpcClientFactory } from '../rpc-channels.js'
import { typertRpcClientFactory } from '../typert-transport.js'
import { overviewRpcClientFactory } from './overview-client.js'
import { RpcClientError } from '../rpc-channels.js'
import { rpcUiState, type RpcUiStateKind } from '../rpc-channels.js'
import { dirHeadRows } from './dir-rows.js'
import { bugStatusCounts, searchQueryOf, type OverviewSort, type OverviewSubtab } from './overview-model.js'
import { docsRootOf } from './message-format.js'

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

/** ov-head 信息束（projects.get + 无参 feature 列表 + 七态计数 + 基本信息区五行目录事实） */
export interface OverviewHeadBundle {
  readonly projectName: string
  /** 项目工作区根（@ 锚文档根 docsRootOf 推导源） */
  readonly workspaceDir: string
  /** 本工作区 .forge 目录（@ 锚文档根 docsRootOf 推导源） */
  readonly forgeDir: string
  /** 无搜索全量 feature 卡（task-tab feature pill 数据源） */
  readonly features: readonly FeatureCard[]
  /** 七态计数（chips 计数与摘要完成数单源） */
  readonly stats: TaskStats
}

/**
 * 概览 ov-head 基本信息区目录行（spec forge-dirs-unification §2.7：行取自目录事实服务
 * 下发的 dirRows，显示/隐藏 = dir-rows 界面层过滤——投影单源 dirHeadRows，本函数直通；
 * head 参保留为 OverviewTab 既有调用形状，不参与投影）。
 */
export function overviewHeadRows(
  _head: OverviewHeadBundle,
  dirRows?: readonly DirFactRow[],
): readonly { readonly label: string; readonly value: string }[] {
  return dirHeadRows(dirRows)
}

/** 任务七态零计数（官方宿主 degraded tasks 族回退值——plugin-forge loop driver ZERO_STATS 同形） */
const ZERO_TASK_STATS = {
  total: 0,
  byStatus: {
    pending: 0,
    in_progress: 0,
    completed: 0,
    blocked: 0,
    suspended: 0,
    interrupted: 0,
    skipped: 0,
    rejected: 0,
  },
  unmetPending: 0,
  gatedPending: 0,
} as const

/** 头路装载（纯异步面）：projects 单点权威（get 优先，typed 失败回退 list 现查——官方宿主
 * 网关无 get 路由，fix-15）∥ features/stats 两路增强并发——增强路 typed 失败
 * （官方宿主 degraded 族）= 空增强值落 head，ov-head/五行目录真值不被缺席族阻断；
 * 集成态三路全通行为不变。 */
export async function loadOverviewHead(client: ForgeRpcClient, projectId: string): Promise<OverviewFetch<OverviewHeadBundle>> {
  try {
    const [project, enhancements] = await Promise.all([
      client.projects
        .get(projectId)
        .catch(async () => {
          const rows = await client.projects.list()
          return rows.find((row) => row.id === projectId) ?? null
        }),
      Promise.all([
        // feature 行集（task-tab feature pill 数据源——feature 子 tab 已退役，头路无参
        // 全量保持 degraded fail-soft：typed 失败 = 空增强值落 head）
        client.features.list({ projectId }).catch(() => [] as Awaited<ReturnType<typeof client.features.list>>),
        client.tasks.stats({ projectId }).catch(() => ZERO_TASK_STATS),
      ]),
    ])
    const [features, stats] = enhancements
    if (project === null) throw new Error('项目不存在或已移除')
    return {
      ok: true,
      data: {
        projectName: project.name,
        workspaceDir: project.wsPath,
        // list 回退行（ProjectSummary）无 forgeDir 字段（host get 路由缺席场景）——空串，
        // forgeDir 仅供 docsRootOf 推导（目录行真值由 forgeDirs dirRows 下发）
        forgeDir: 'forgeDir' in project ? project.forgeDir : '',
        features,
        stats,
      },
    }
  } catch (error) {
    return { ok: false, error: mapOverviewError(error) }
  }
}

/** 子 tab 列数据（tagged——Bug 子 tab 行集 + 三态计数） */
export type OverviewListData =
  | {
      /** Bug 子 tab（fix-bug）：listBugs 服务端搜索/状态过滤/排序后行集 + 无参全量计数 */
      readonly kind: 'bugs'
      readonly bugs: readonly BugCard[]
      /** Bug 三态计数（无参全量行投影——chips 计数单源，不随搜索/过滤漂移） */
      readonly counts: Record<BugStatus, number>
    }

/**
 * 列路装载（纯异步面——Hard Rule 锚）：search/sort 原样入查询参（服务端过滤与排序）。
 * tasks 子 tab = null（3.5 无列装载——三视图归 3.6，chips 消费头路 stats）。
 */
export async function fetchOverviewList(
  client: ForgeRpcClient,
  q: {
    readonly projectId: string
    readonly subtab: OverviewSubtab
    readonly search: string
    readonly sort: OverviewSort
    /** Bug chips 白名单参（bugStatusFilterParam 投影——空 = 全部三态） */
    readonly status?: readonly BugStatus[]
  },
): Promise<OverviewFetch<OverviewListData> | null> {
  const search = searchQueryOf(q.search)
  // tasks = 3.5 无列装载（chips 消费头路 stats）；spec = 列装载归 G3 交付——
  // 非 bugs 子 tab 一律短路 null（零通道调用）
  if (q.subtab !== 'bugs') return null
  try {
    const status = q.status ?? []
    const [bugs, all] = await Promise.all([
      client.bugs.list({
        projectId: q.projectId,
        search,
        sort: q.sort,
        ...(status.length > 0 ? { status: [...status] } : {}),
      }),
      client.bugs.list({ projectId: q.projectId }),
    ])
    return { ok: true, data: { kind: 'bugs', bugs, counts: bugStatusCounts(all) } }
  } catch (error) {
    return { ok: false, error: mapOverviewError(error) }
  }
}

/**
 * 项目 @ 锚文档根装载 hook（fail-soft）：projects.get → docsRootOf(ws, forge)——
 * 失败/项目缺席/无锚 = undefined 不阻断（消费方 pathLine 回退 `docs` 缺省锚）。
 * 抽屉诊断通道独立于概览头路（TaskDrawer 在 OverviewTab 之外渲染——装配体自装载）。
 * @param projectId - 当前项目（null = 无锚不拉取）
 * @param makeClient - RPC client 构造器（缺省 Typert 真身——官方宿主可达，T1-head preload
 *   残面收口；注入 = 测试面）
 */
export function useProjectDocsRoot(
  projectId: string | null,
  makeClient: RpcClientFactory = typertRpcClientFactory,
): string | undefined {
  const [docsRoot, setDocsRoot] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (projectId === null) {
      setDocsRoot(undefined)
      return
    }
    let alive = true
    void (async () => {
      try {
        const project = await makeClient().projects.get(projectId)
        if (!alive) return
        setDocsRoot(project === null ? undefined : docsRootOf(project.wsPath, project.forgeDir))
      } catch {
        if (alive) setDocsRoot(undefined)
      }
    })()
    return () => {
      alive = false
    }
  }, [projectId, makeClient])
  return docsRoot
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
  makeClient: RpcClientFactory = overviewRpcClientFactory,
  /** Bug chips 白名单参（Bug 子 tab 透传 fetchOverviewList；他子 tab 缺省 = 空） */
  status?: readonly BugStatus[],
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

  // 列路：subtab / search / sort / projectId / 重试 / Bug chips / 事件重取（键变装载；子 tab 或项目切换 = 清场骨架）
  useEffect(() => {
    const statusKey = (status ?? []).join(',')
    const listKey = `${projectId}#${subtab}#${search}#${sort}#${statusKey}#${refreshNonce}`
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
    void fetchOverviewList(client, { projectId, subtab, search, sort, ...(status !== undefined && status.length > 0 ? { status } : {}) }).then((out) => {
      if (seq !== listSeqRef.current) return
      setState((prev) => applyOverviewList(prev, out))
    })
  }, [projectId, subtab, search, sort, refreshNonce, makeClient, status])

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
