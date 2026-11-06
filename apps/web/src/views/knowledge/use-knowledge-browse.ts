// 知识浏览数据装载（定位：业务——UF-6 浏览主体的 forge:knowledge/* 消费面）。
// 数据纪律（AC5 索引直读首显不阻塞）：
//   - 全量装载 = listEntries（无过滤底表，兼 total 计数源）∥ browse（域树聚合）∥ projects.get
//     （项目名 + 知识目录位置——空库引导文案数据）三路并发，索引缓存直读即瞬时呈现；
//   - 过滤重拉 = listEntries(域前缀 + 关键词) ∥ browse 域树重建——旧卡片保持可见（busy 标注），
//     树随重拉与现盘目录对账（目录即域——带外新建目录即时在场）；
//     索引缺失静默重建期（core 侧）表现为本侧在途等待，首装零数据时呈现骨架；
//   - 竞态守卫 = 序号递增，仅最新一次装载的落点生效（快速连续过滤不串台）。
// 相位机：loading → ready | error（fail-soft：typed error 经 rpcUiState 映射三态——
// ERR_INDEX_STALE / ERR_INVALID_KNOWLEDGE_DIR → empty-state 面，其余 → 错误条 + 重试）。
// 交互与转移逻辑抽纯函数面（browseLoadPlan / pendingBrowseState / applyBrowseLoad /
// browseActions——browser-actions 同形制）；effect 仅剩编排胶水（Node 测面外的部分沿
// use-forge-projects 先例，归 3.8 装配 + e2e）。
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { DomainNode, EntryActionReceipt, EntryActionRequest, KnowledgeCard } from '@dsh-forge/contracts'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import { deriveKnowledgeDir } from '../../flows/add-project/form-model.js'
import {
  EMPTY_FILTER,
  EMPTY_MULTI_SELECT,
  browseFilterReducer,
  entriesQueryOf,
  entryActionNotice,
  findCard,
  confirmReceiptText,
  moveReceiptText,
  domainLabelOf,
  hasActiveFilter,
  multiSelectReducer,
  type BrowseFilter,
  type BrowseFilterEvent,
  type MultiSelectEvent,
  type MultiSelectState,
} from './browse-model.js'

// 回执文案分派单源再导出（消费面同点引用——browse-model 纯函数面唯一实现）
export { entryActionFailureText, entryActionNotice } from './browse-model.js'

/** 裁决动词（批量两动词——confirm/reject；move/editMeta/createDomain 归单条/树级径非本面） */
export type EntryActionVerb = 'confirm' | 'reject'

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
  /** 多选模式态（SC-F——态机单一来源 = multiSelectReducer，返回面合并注入） */
  readonly multiSelect: MultiSelectState
  /** 最近一次裁决动作的回执提示（全成功 = undefined 静默；部分失败 = code 分派文案） */
  readonly actionNotice: string | undefined
  /** 动作成功回执 toast（SC-J J3/J4——官方 Toast 承载；seq 键控重放，onDone 归 dismissReceipt） */
  readonly receipt: KnowledgeReceiptToast | undefined
}

/** 动作成功回执 toast 载荷（text = 标题/域名实读模板；seq = 出场次序——Toast key 重放键） */
export interface KnowledgeReceiptToast {
  readonly text: string
  readonly seq: number
}

/** 浏览动作（过滤态机事件 + 重试） */
export interface KnowledgeBrowseActions {
  /** 域树行选择（undefined = 全部域根行） */
  selectDomain(domainPath: string | undefined): void
  /** 工具栏关键词输入（原样透传——细分语义归服务端） */
  setKeyword(keyword: string): void
  /** 清除过滤（无结果空态入口——域 + 关键词一并复位） */
  clearFilters(): void
  /** 状态过滤片（工具栏 chips——undefined 入参归一 'all' 清片） */
  setStatusFilter(statusFilter: 'all' | 'unconfirmed' | 'confirmed'): void
  /** 动作成功回执 toast 退场（官方 Toast onDone——fade 完成即卸载） */
  dismissReceipt(): void
  /** 重试（错误态/不可用态——全量重装载） */
  retry(): void
}

/** 多选与裁决动作（SC-F——态机事件 + entryAction 执行 + 动作后重拉） */
export interface KnowledgeMultiSelectActions {
  /** 进入多选模式（工具栏「多选」钮） */
  enterMultiSelect(): void
  /** 退出多选模式（勾选清零零残留——SC-F2） */
  exitMultiSelect(): void
  /** 勾选/取消单条（checkbox） */
  toggleEntry(entryId: number): void
  /** 全选当前过滤结果集（SC-F4——M = 过滤结果集计数） */
  selectAll(): void
  /** 批量通过勾选集（免确认框——SC-B 链）；成功后按当前过滤重拉 */
  confirmSelected(): Promise<void>
  /** 批量驳回勾选集（确认框后调用——SC-C 链）；成功后按当前过滤重拉 */
  rejectSelected(): Promise<void>
  /** 单条快速通过（卡片 chip 点击入口——同一通道收敛） */
  confirmEntry(entryId: number): Promise<void>
}

/** 域树动作（SC-H——entryAction 树级径 move/createDomain 执行 + 动作后重拉） */
export interface KnowledgeTreeActions {
  /** 拖拽改域（DomainTree 域行 drop 上抛——entryAction move 单条）；成功后重拉 */
  moveEntry(entryId: number, targetDomain: string): Promise<void>
  /** 新建目录（DomainTree 树头「＋」上抛——entryAction createDomain）；成功后重拉 */
  createDomain(domainPath: string): Promise<void>
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

/** 项目元数据拉取（fail-soft：get null / 失败 = 名称空 + 目录 null——浏览主数据不因此失败）。
 *  知识目录 = wsPath 缺省派生 `<工作区>/.knowledge`（knowledge_dir 列退役后产品口径恒缺省——
 *  派生单源 = flows/add-project form-model deriveKnowledgeDir）。 */
async function fetchProjectMeta(client: ForgeRpcClient, projectId: string): Promise<ProjectMeta> {
  try {
    const project = await client.projects.get(projectId)
    return { projectName: project?.name ?? '', knowledgeDir: project === null ? null : deriveKnowledgeDir(project.wsPath) }
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

/** 过滤重拉（纯异步面）：listEntries(域前缀 + 关键词 + 状态片)——查询由 entriesQueryOf 透传构造 */
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

/** 装载落点（effect 任务产物——全量装载可携过滤补拉后的卡片视图；过滤重拉携带重建后的域树） */
export type LoadApply =
  | { readonly kind: 'bundle'; readonly bundle: BrowseBundle; readonly cards: readonly KnowledgeCard[] }
  | { readonly kind: 'cards'; readonly cards: readonly KnowledgeCard[]; readonly nodes?: readonly DomainNode[] }
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
    multiSelect: EMPTY_MULTI_SELECT,
    actionNotice: undefined,
    receipt: undefined,
  }
}

/** 过滤重拉（纯异步面）：listEntries(域前缀 + 关键词 + 状态片) ∥ browse 域树重建——
 *  目录即域（SC-H）：树每次重拉与 knowledgeDir 现盘对账（带外新建目录即时在场）；
 *  browse 失败 fail-soft（保留旧树，卡片重拉不受牵连）。 */
export async function runFilteredLoad(
  client: ForgeRpcClient,
  projectId: string,
  filter: BrowseFilter,
): Promise<LoadApply> {
  const cards = await fetchFilteredCards(client, projectId, filter)
  if (!cards.ok) return { kind: 'error', error: cards.error }
  const nodes = await client.knowledge
    .browse(projectId)
    .then((value) => value)
    .catch(() => undefined)
  return { kind: 'cards', cards: cards.data, nodes }
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

/** 落点应用（纯函数）：LoadApply → 下一状态（bundle 落全量元数据；cards 换卡片/树；error 带旧域树） */
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
  return { ...prev, phase: 'ready', busy: false, error: undefined, cards: out.cards, ...(out.nodes !== undefined ? { nodes: out.nodes } : {}) }
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
    setStatusFilter: (statusFilter) => {
      dispatchFilter({ type: 'set-status-filter', statusFilter })
    },
    // 回执退场归 hook 执行面（本纯函数面零 toast 态——装配处 spread 覆盖）
    dismissReceipt: () => {},
    retry: () => {
      bumpNonce()
    },
  }
}

/** entryAction 执行入口（全动词共用——runEntryActionRequest 单点透传通道） */
export async function runEntryActionRequest(
  client: ForgeRpcClient,
  request: EntryActionRequest,
): Promise<BrowseFetch<EntryActionReceipt>> {
  try {
    return { ok: true, data: await client.knowledge.entryAction(request) }
  } catch (error) {
    return { ok: false, error: mapBrowseError(error) }
  }
}

/**
 * entryAction 批量裁决（纯异步面）：forge:knowledge/entryAction 单通道 confirm/reject 批量；
 * 回执归一 BrowseFetch（永不 reject）——逐条回执文案分派归 entryActionNotice。
 */
export async function runEntryAction(
  client: ForgeRpcClient,
  projectId: string,
  action: EntryActionVerb,
  entryIds: readonly number[],
): Promise<BrowseFetch<EntryActionReceipt>> {
  return runEntryActionRequest(client, { projectId, action, entryIds: [...entryIds] })
}

/** 重拉落点勾选残影修剪（纯函数）：不在重拉结果集的 entryId 剪除（动作后删除零残留） */
export function pruneSelection(selected: readonly number[], aliveIds: readonly number[]): readonly number[] {
  return selected.filter((id) => aliveIds.includes(id))
}

/**
 * 多选与裁决动作绑定（纯函数——browseActions 同形制）：态机事件 + entryAction 执行 +
 * 动作后重拉（nonce 递增——seq 竞态守卫沿既有装载链，仅最新落点生效）。
 * confirm/reject 作用于勾选集（selectedIds）；selectAll = 当前过滤结果集全量替换（filteredIds）。
 * 空勾选集 = 零请求零重拉（空数组在通道侧是请求级拒收码——前置守卫）；执行失败不重拉。
 */
export function multiSelectActions(
  dispatchMulti: (event: MultiSelectEvent) => void,
  refetch: () => void,
  selectedIds: readonly number[],
  filteredIds: readonly number[],
  runAction?: (action: EntryActionVerb, entryIds: readonly number[]) => Promise<boolean>,
): KnowledgeMultiSelectActions {
  const act = async (action: EntryActionVerb, entryIds: readonly number[]): Promise<void> => {
    if (entryIds.length === 0) return
    const ok = runAction === undefined || (await runAction(action, entryIds))
    if (!ok) return
    dispatchMulti({ type: 'exit' })
    refetch()
  }
  return {
    enterMultiSelect: () => {
      dispatchMulti({ type: 'enter' })
    },
    exitMultiSelect: () => {
      dispatchMulti({ type: 'exit' })
    },
    toggleEntry: (entryId) => {
      dispatchMulti({ type: 'toggle', entryId })
    },
    selectAll: () => {
      dispatchMulti({ type: 'select-all', entryIds: filteredIds })
    },
    confirmSelected: () => act('confirm', selectedIds),
    rejectSelected: () => act('reject', selectedIds),
    confirmEntry: async (entryId) => {
      await act('confirm', [entryId])
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
  makeClient: RpcClientFactory = preloadRpcClientFactory,
  active = true,
): readonly [KnowledgeBrowseState, KnowledgeBrowseActions, KnowledgeMultiSelectActions, KnowledgeTreeActions] {
  const [filter, dispatchFilter] = useReducer(browseFilterReducer, EMPTY_FILTER)
  const [multiSelect, dispatchMulti] = useReducer(multiSelectReducer, EMPTY_MULTI_SELECT)
  const [state, setState] = useState<KnowledgeBrowseState>(initialBrowseState)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [activation, setActivation] = useState(0)
  // 动作成功回执 toast（SC-J J3/J4）：官方 Toast 承载——text 模板含标题/域名实读；
  // seq 单调递增 = 出场次序（同文本重放即新 key 新计时）
  const [receipt, setReceipt] = useState<KnowledgeReceiptToast | undefined>(undefined)
  const receiptSeqRef = useRef(0)
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
      : runFilteredLoad(client, projectId, filter)
    void task.then((out) => {
      if (!alive || seq !== seqRef.current) return
      if (plan.isFull && out.kind === 'bundle') hasBundleRef.current = true
      setState((prev) => applyBrowseLoad(prev, out))
      // 重拉落点勾选残影修剪：动作后删除/过滤外条目不残留（SC-F2 零残留口径）
      if (out.kind !== 'error') {
        const aliveIds = out.cards.map((card) => card.entryId)
        dispatchMulti({ type: 'prune', aliveIds })
      }
    })
    return () => {
      alive = false
    }
  }, [projectId, nonce, activation, filter, makeClient, active])

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])

  // 回执 toast 出场/退场（SC-J J3/J4——官方 Toast onDone 归退场；卸载不触发布局副作用）
  const showReceipt = useCallback((text: string): void => {
    receiptSeqRef.current += 1
    setReceipt({ text, seq: receiptSeqRef.current })
  }, [])
  const dismissReceipt = useCallback((): void => {
    setReceipt(undefined)
  }, [])

  // 裁决执行面：entryAction → 回执文案分派 → 成功后按当前过滤重拉（nonce 递增走既有 seq 守卫）
  const multiActions = useMemo(() => {
    const runAction = async (action: EntryActionVerb, entryIds: readonly number[]): Promise<boolean> => {
      const out = await runEntryAction(makeClient(), projectId, action, entryIds)
      if (!out.ok) {
        setNotice(out.error.message)
        return false
      }
      setNotice(entryActionNotice(out.data))
      // J3 单条通过成功回执（标题实读——全部成功才出场；部分失败走 actionNotice 错误面）
      if (action === 'confirm' && entryIds.length === 1 && entryActionNotice(out.data) === undefined) {
        const card = findCard(state.cards, entryIds[0] ?? -1)
        showReceipt(confirmReceiptText(card?.title ?? `#${String(entryIds[0])}`))
      }
      return true
    }
    return multiSelectActions(dispatchMulti, () => {
      setNonce((n) => n + 1)
    }, multiSelect.selected, state.cards.map((card) => card.entryId), runAction)
  }, [makeClient, projectId, multiSelect.selected, state.cards, showReceipt])

  // 域树动作（SC-H）：entryAction 树级径 move/createDomain——回执文案分派同 multiActions，
  // 成功后全量重拉（树/徽记/卡片即时刷新——nonce 递增走既有 seq 守卫）
  const treeActions = useMemo<KnowledgeTreeActions>(() => {
    const runTree = async (request: EntryActionRequest): Promise<void> => {
      const out = await runEntryActionRequest(makeClient(), request)
      if (!out.ok) {
        setNotice(out.error.message)
        return
      }
      setNotice(entryActionNotice(out.data))
      // J4 拖拽落位成功回执（标题与来源/目标域实读；全部成功才出场）
      if (request.action === 'move' && entryActionNotice(out.data) === undefined) {
        const card = findCard(state.cards, request.entryIds[0] ?? -1)
        showReceipt(
          moveReceiptText(
            card?.title ?? `#${String(request.entryIds[0])}`,
            domainLabelOf(card?.domainPath ?? ''),
            domainLabelOf(request.targetDomain),
          ),
        )
      }
      setNonce((n) => n + 1)
    }
    return {
      moveEntry: (entryId, targetDomain) => {
        return runTree({ projectId, action: 'move', entryIds: [entryId], targetDomain })
      },
      createDomain: (domainPath) => {
        return runTree({ projectId, action: 'createDomain', domain: domainPath })
      },
    }
  }, [makeClient, projectId, state.cards, showReceipt])

  const actions = browseActions(dispatchFilter, retry)
  // 消费态合成（fix-5）：装载态字段 + 实时过滤态（reducer 单一来源）——防滞后快照弹回键入值；
  // 多选态/裁决提示/回执 toast 同面合并注入（态机单一来源 = reducer/执行面）
  const consumed = consumedBrowseState(state, filter)
  const merged: KnowledgeBrowseState = { ...consumed, multiSelect, actionNotice: notice, receipt }
  return [merged, { ...actions, dismissReceipt }, multiActions, treeActions] as const
}
