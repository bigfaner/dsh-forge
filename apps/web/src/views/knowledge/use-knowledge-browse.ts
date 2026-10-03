// 知识浏览数据装载（定位：业务——UF-6 浏览主体的 forge:knowledge/* 消费面）。
// 数据纪律（AC5 索引直读首显不阻塞）：
//   - 全量装载 = listEntries（无过滤底表，兼 total 计数源）∥ browse（域树聚合）∥ projects.get
//     （项目名 + 知识目录位置——空库引导文案数据）三路并发，索引缓存直读即瞬时呈现；
//   - 过滤重拉 = listEntries(域前缀 + 关键词) 单路——旧卡片保持可见（busy 标注），
//     索引缺失静默重建期（core 侧）表现为本侧在途等待，首装零数据时呈现骨架；
//   - 竞态守卫 = 序号递增，仅最新一次装载的落点生效（快速连续过滤不串台）。
// 相位机：loading → ready | error（fail-soft：typed error 经 rpcUiState 映射三态——
// ERR_INDEX_STALE / ERR_INVALID_KNOWLEDGE_DIR → empty-state 面，其余 → 错误条 + 重试）。
// 交互与转移逻辑抽纯函数面（browseLoadPlan / pendingBrowseState / applyBrowseLoad /
// browseActions——browser-actions 同形制）；effect 仅剩编排胶水（Node 测面外的部分沿
// use-forge-projects 先例，归 3.8 装配 + e2e）。
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { DomainNode, KnowledgeCard } from '@dsh-forge/contracts'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import {
  EMPTY_FILTER,
  browseFilterReducer,
  entriesQueryOf,
  hasActiveFilter,
  type BrowseFilter,
  type BrowseFilterEvent,
} from './browse-model.js'

/** RPC client 构造器（缺省 = preload 真身；注入 = 测试面） */
export type RpcClientFactory = () => ForgeRpcClient

/** 装载相位（error 附载见 BrowseErrorInfo） */
export type KnowledgeLoadPhase = 'loading' | 'ready' | 'error'

/** 错误附载（message = 信封 message 原样；uiState = rpcUiState(code) 三态映射） */
export interface BrowseErrorInfo {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 全量装载产物（域树 / 全量卡片 / 项目元数据） */
export interface BrowseBundle {
  /** 无过滤全量卡片（total 计数底表——含根域文件，域树聚合不含） */
  readonly cards: readonly KnowledgeCard[]
  readonly nodes: readonly DomainNode[]
  /** 全部域计数（= cards.length） */
  readonly total: number
  readonly projectName: string
  readonly knowledgeDir: string | null
}

/** 拉取结果（ok/error 归一——永不 reject） */
export type BrowseFetch<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: BrowseErrorInfo }

/** 浏览状态（hook 输出——KnowledgeBrowseBody 消费形状） */
export interface KnowledgeBrowseState {
  readonly phase: KnowledgeLoadPhase
  /** 当前过滤结果卡片（重拉在途 = 上一结果保持——缓存先行） */
  readonly cards: readonly KnowledgeCard[]
  /** 域树（全域聚合，不随过滤变——过滤只作用于网格） */
  readonly nodes: readonly DomainNode[]
  readonly total: number
  readonly filter: BrowseFilter
  /** 装载/重拉在途（aria-busy——内容保持可见的在不阻塞标注） */
  readonly busy: boolean
  readonly error: BrowseErrorInfo | undefined
  readonly projectName: string
  /** 知识目录绝对路径（空库引导说明位；projects.get 失败/缺席 = null） */
  readonly knowledgeDir: string | null
}

/** 浏览动作（过滤态机事件 + 重试） */
export interface KnowledgeBrowseActions {
  /** 域树行选择（undefined = 全部域根行） */
  selectDomain(domainPath: string | undefined): void
  /** 工具栏关键词输入（原样透传——细分语义归服务端） */
  setKeyword(keyword: string): void
  /** 清除过滤（无结果空态入口——域 + 关键词一并复位） */
  clearFilters(): void
  /** 重试（错误态/不可用态——全量重装载） */
  retry(): void
}

/** 错误归一（纯函数）：RpcClientError → code 三态映射；其余（传输/构造期）→ 错误条 */
export function mapBrowseError(error: unknown): BrowseErrorInfo {
  if (error instanceof RpcClientError) {
    return { message: error.message, uiState: rpcUiState(error.code) }
  }
  return { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' }
}

/** 项目元数据窄切片（projects.get 的浏览消费面） */
interface ProjectMeta {
  projectName: string
  knowledgeDir: string | null
}

/** 项目元数据拉取（fail-soft：get null / 失败 = 名称空 + 目录 null——浏览主数据不因此失败） */
async function fetchProjectMeta(client: ForgeRpcClient, projectId: string): Promise<ProjectMeta> {
  try {
    const project = await client.projects.get(projectId)
    return { projectName: project?.name ?? '', knowledgeDir: project?.knowledgeDir ?? null }
  } catch {
    return { projectName: '', knowledgeDir: null }
  }
}

/**
 * 全量装载（纯异步面）：listEntries（无过滤）∥ browse（域树）∥ 项目元数据 三路并发；
 * 任一主数据失败 = 整体 error（typed error 保 code 映射）。
 */
export async function loadBrowseBundle(client: ForgeRpcClient, projectId: string): Promise<BrowseFetch<BrowseBundle>> {
  try {
    const [cards, nodes, meta] = await Promise.all([
      client.knowledge.listEntries({ projectId }),
      client.knowledge.browse(projectId),
      fetchProjectMeta(client, projectId),
    ])
    return { ok: true, data: { cards, nodes, total: cards.length, ...meta } }
  } catch (error) {
    return { ok: false, error: mapBrowseError(error) }
  }
}

/** 过滤重拉（纯异步面）：listEntries(域前缀 + 关键词)——查询由 entriesQueryOf 透传构造 */
export async function fetchFilteredCards(
  client: ForgeRpcClient,
  projectId: string,
  filter: BrowseFilter,
): Promise<BrowseFetch<readonly KnowledgeCard[]>> {
  try {
    return { ok: true, data: await client.knowledge.listEntries(entriesQueryOf(projectId, filter)) }
  } catch (error) {
    return { ok: false, error: mapBrowseError(error) }
  }
}

/** 装载落点（effect 任务产物——全量装载可携过滤补拉后的卡片视图） */
export type LoadApply =
  | { readonly kind: 'bundle'; readonly bundle: BrowseBundle; readonly cards: readonly KnowledgeCard[] }
  | { readonly kind: 'cards'; readonly cards: readonly KnowledgeCard[] }
  | { readonly kind: 'error'; readonly error: BrowseErrorInfo }

/**
 * 全量装载任务（纯异步面）：bundle 三路并发后，若过滤在场追一次过滤视图
 * （重试/跨项目装载不打散过滤语义——cards 与当前过滤条件保持一致）。
 */
export async function runFullLoad(
  client: ForgeRpcClient,
  projectId: string,
  filter: BrowseFilter,
): Promise<LoadApply> {
  const bundle = await loadBrowseBundle(client, projectId)
  if (!bundle.ok) return { kind: 'error', error: bundle.error }
  if (!hasActiveFilter(filter)) return { kind: 'bundle', bundle: bundle.data, cards: bundle.data.cards }
  const filtered = await fetchFilteredCards(client, projectId, filter)
  return filtered.ok
    ? { kind: 'bundle', bundle: bundle.data, cards: filtered.data }
    : { kind: 'error', error: filtered.error }
}

/** 初始态（首装前：骨架相位） */
export function initialBrowseState(): KnowledgeBrowseState {
  return {
    phase: 'loading',
    cards: [],
    nodes: [],
    total: 0,
    filter: EMPTY_FILTER,
    busy: true,
    error: undefined,
    projectName: '',
    knowledgeDir: null,
  }
}

/** 装载判定输入（browseLoadPlan 消费——refs 快照） */
export interface BrowseLoadPlanInput {
  /** 本次装载全量键（projectId#nonce） */
  readonly fullKey: string
  /** 上一次全量键（runRef 快照） */
  readonly lastFullKey: string
  readonly projectId: string
  /** 上一次项目（projectRef 快照） */
  readonly lastProjectId: string
  /** 已持有本项目管理数据（hasBundleRef 快照） */
  readonly hasBundle: boolean
}

/** 装载判定（纯函数）：全量 ⇄ 过滤重拉，以及清场判据（缓存先行 ⇄ 骨架清场） */
export function browseLoadPlan(input: BrowseLoadPlanInput): { readonly isFull: boolean; readonly mustClear: boolean } {
  const projectChanged = input.lastProjectId !== input.projectId
  const isFull = input.lastFullKey !== input.fullKey
  // 全量装载且无本项目管理数据（首装），或跨项目切换（旧项目卡片不得残留）→ 清场骨架；
  // 其余（同项目重试/过滤重拉）→ 缓存先行（旧内容保持可见）
  return { isFull, mustClear: isFull && (!input.hasBundle || projectChanged) }
}

/** 在途态推导（纯函数）：清场 = 初始骨架（过滤态保留）；否则 = 旧内容 + busy 标注 */
export function pendingBrowseState(prev: KnowledgeBrowseState, mustClear: boolean): KnowledgeBrowseState {
  return mustClear ? { ...initialBrowseState(), filter: prev.filter } : { ...prev, busy: true }
}

/** 落点应用（纯函数）：LoadApply → 下一状态（bundle 落全量元数据；cards 仅换卡片；error 带旧域树） */
export function applyBrowseLoad(prev: KnowledgeBrowseState, out: LoadApply): KnowledgeBrowseState {
  if (out.kind === 'error') {
    return { ...prev, phase: 'error', busy: false, error: out.error }
  }
  if (out.kind === 'bundle') {
    return {
      ...prev,
      phase: 'ready',
      busy: false,
      error: undefined,
      cards: out.cards,
      nodes: out.bundle.nodes,
      total: out.bundle.total,
      projectName: out.bundle.projectName,
      knowledgeDir: out.bundle.knowledgeDir,
    }
  }
  return { ...prev, phase: 'ready', busy: false, error: undefined, cards: out.cards }
}

/**
 * 消费态合成（纯函数）：装载态 × 实时过滤态 → hook 输出态（fix-5）。
 * 过滤态单一来源 = reducer——装载态内部携带的 filter 是上一次装载转移保留的快照，
 * 过滤派发（set-keyword/select-domain/clear-filters）不经过装载转移，快照必然滞后；
 * 消费面（工具栏受控值、域树高亮、无结果 ⇄ 空库分流）若读滞后快照，键入即被弹回、
 * 零命中误落空库引导面。本函数把实时过滤态盖写进消费态（同引用 = 原样返回，零合成）。
 */
export function consumedBrowseState(state: KnowledgeBrowseState, filter: BrowseFilter): KnowledgeBrowseState {
  return state.filter === filter ? state : { ...state, filter }
}

/**
 * 动作绑定（纯函数——browser-actions 同形制）：过滤态机事件形状 + 重试 nonce 递增可单测。
 */
export function browseActions(
  dispatchFilter: (event: BrowseFilterEvent) => void,
  bumpNonce: () => void,
): KnowledgeBrowseActions {
  return {
    selectDomain: (domainPath) => {
      dispatchFilter({ type: 'select-domain', domain: domainPath })
    },
    setKeyword: (keyword) => {
      dispatchFilter({ type: 'set-keyword', keyword })
    },
    clearFilters: () => {
      dispatchFilter({ type: 'clear-filters' })
    },
    retry: () => {
      bumpNonce()
    },
  }
}

/**
 * 知识浏览装载 hook（mount / projectId / 过滤态 / 重试 / 激活翻转 五锚重装载）。
 * 判定/在途/落点/动作全部经纯函数（browseLoadPlan / pendingBrowseState /
 * applyBrowseLoad / browseActions）——effect 仅编排：refs 快照 → 装载 → 序号守卫落点。
 * 输出态经 consumedBrowseState 合成（fix-5）：过滤态消费面取 reducer 实时值——
 * 装载态内部的 filter 快照滞后于过滤派发，受控输入/空态分流不得读它。
 * 激活语义（AC3 即时累积——RecallTab AC4 同型）：隐藏期 hold（不装载不清场，数据保持），
 * 激活翻转（false→true）即全量重拉（epoch 递增 → fullKey 变更 → bundle 三路并发——
 * 热度等使用事件计数随激活刷新，卡片缓存先行不闪骨架）。
 * @param projectId - 当前项目（视图态注入——3.8 装配接线）
 * @param makeClient - RPC client 构造器（缺省 preload 真身；注入 = 测试面）
 * @param active - 视图激活态（缺省 true = 无激活机制面——单测/常挂载直载）
 */
export function useKnowledgeBrowse(
  projectId: string,
  makeClient: RpcClientFactory = defaultClient,
  active = true,
): readonly [KnowledgeBrowseState, KnowledgeBrowseActions] {
  const [filter, dispatchFilter] = useReducer(browseFilterReducer, EMPTY_FILTER)
  const [state, setState] = useState<KnowledgeBrowseState>(initialBrowseState)
  const [nonce, setNonce] = useState(0)
  const [activation, setActivation] = useState(0)
  const wasActiveRef = useRef(active)
  const fullKeyRef = useRef('')
  const projectRef = useRef(projectId)
  const hasBundleRef = useRef(false)
  const seqRef = useRef(0)

  // projectId 变更 → 过滤复位（跨项目域语义不携带）
  useEffect(() => {
    dispatchFilter({ type: 'clear-filters' })
  }, [projectId])

  // 激活翻转 epoch（false→true 递增；true→false 不触发——隐藏期零装载）
  useEffect(() => {
    if (!wasActiveRef.current && active) setActivation((n) => n + 1)
    wasActiveRef.current = active
  }, [active])

  useEffect(() => {
    if (!active) return // 隐藏期 hold（keep-alive 数据保持，激活期重拉刷新）
    const fullKey = `${projectId}#${nonce}#${activation}`
    const plan = browseLoadPlan({
      fullKey,
      lastFullKey: fullKeyRef.current,
      projectId,
      lastProjectId: projectRef.current,
      hasBundle: hasBundleRef.current,
    })
    fullKeyRef.current = fullKey
    projectRef.current = projectId
    const seq = ++seqRef.current
    const client = makeClient()

    setState((prev) => pendingBrowseState(prev, plan.mustClear))

    let alive = true
    const task: Promise<LoadApply> = plan.isFull
      ? runFullLoad(client, projectId, filter)
      : fetchFilteredCards(client, projectId, filter).then((out) =>
          out.ok ? { kind: 'cards', cards: out.data } : { kind: 'error', error: out.error },
        )
    void task.then((out) => {
      if (!alive || seq !== seqRef.current) return
      if (plan.isFull && out.kind === 'bundle') hasBundleRef.current = true
      setState((prev) => applyBrowseLoad(prev, out))
    })
    return () => {
      alive = false
    }
  }, [projectId, nonce, activation, filter, makeClient, active])

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  const actions = browseActions(dispatchFilter, retry)
  // 消费态合成（fix-5）：装载态字段 + 实时过滤态（reducer 单一来源）——防滞后快照弹回键入值
  return [consumedBrowseState(state, filter), actions] as const
}

/** 缺省构造：preload 传输真身（缺席由 mapBrowseError 收敛为错误条——非 Electron 载体不炸壳） */
function defaultClient(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
