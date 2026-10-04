// 会话知识召回 tab（定位：业务——UF-4 召回 tab 数据接线，3.8：占位空态 → 真实数据面）。
// 数据纪律（UF-4 Data Requirements + tech-design 交互二尾部）：
//   - 唯一通道 = forge:knowledge/sessionRecall（RecallGroup[]——call_id 聚合，与事件表/
//     卡片热度同源单表）；投影（统计头/分组行）经 recall-model 纯函数，UI 零再推导热度。
//   - 即时累积（AC4）：会话·项目锚变更即重拉；fix-33 ⑦ 起 keep-alive 残械（visible prop/
//     hold 分支）删除——官方 conversation.view roster only:id 激活即挂载/切走即卸载，
//     「每次选中重拉」由挂载机制本身承载（fix-25 形态），隐藏期保持分支生产不可达。
//   - 无会话/无项目锚（session-maybe undefined / 项目未就绪）= 静态空态（不拉取）；
//     就绪且零事件 = 「本会话暂无召回」（AC5）。
//   - 失效行（AC3）：entryId = null（索引重建后 ID 漂移）行级标注「索引未命中」，
//     不阻塞列表、不进跳转；命中行点击 → onOpenEntry(entryId)（装配接知识视图抽屉——
//     Hard Rule：跳转经装配态经手，本模块禁 import ../knowledge/）。
// 组装分工沿 3.6/3.7 形制：useSessionRecall（hook 装载）+ RecallTabBody（纯渲染——
// 全相位 renderToStaticMarkup 可测）；错误映射 mapRecallError 与浏览面 mapBrowseError
// 同构（同级业务互禁下的本域副本，口径互指）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { RecallGroup, SessionRecallQuery } from '@dsh-forge/contracts'
import { EmptyState, HeatBadge } from '../../components/index.js'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import { isRecallRowStale, recallRowsOf, recallStatsOf, recallTimeLabel } from './recall-model.js'
import './session.css'

/** RPC client 构造器（缺省 = preload 真身；注入 = 测试面——与 sidebar/knowledge 同型本地别名） */
export type RecallClientFactory = () => ForgeRpcClient

/** 错误附载（message = 信封 message 原样；uiState = rpcUiState(code) 三态映射） */
export interface RecallErrorInfo {
  readonly message: string
  readonly uiState: RpcUiStateKind
}

/** 错误归一（纯函数）：RpcClientError → code 三态映射；其余（传输/构造期）→ 错误条 */
export function mapRecallError(error: unknown): RecallErrorInfo {
  if (error instanceof RpcClientError) {
    return { message: error.message, uiState: rpcUiState(error.code) }
  }
  return { message: error instanceof Error ? error.message : String(error), uiState: 'error-bar' }
}

/** 拉取结果（ok/error 归一——永不 reject） */
export type RecallFetch =
  | { readonly ok: true; readonly groups: readonly RecallGroup[] }
  | { readonly ok: false; readonly error: RecallErrorInfo }

/** 单次拉取（纯异步面）：唯一通道 = forge:knowledge/sessionRecall */
export async function fetchSessionRecall(
  client: ForgeRpcClient,
  q: SessionRecallQuery,
): Promise<RecallFetch> {
  try {
    return { ok: true, groups: await client.knowledge.sessionRecall(q) }
  } catch (error) {
    return { ok: false, error: mapRecallError(error) }
  }
}

/** 召回 tab 装载相位（idle = 无会话/项目锚，不拉取——静态空态） */
export type RecallLoadPhase = 'idle' | 'loading' | 'ready' | 'error'

/** 装载状态（hook 输出——RecallTabBody 消费形状） */
export interface RecallLoadState {
  readonly phase: RecallLoadPhase
  readonly groups: readonly RecallGroup[]
  readonly error: RecallErrorInfo | undefined
}

/** 初始态 */
export function initialRecallState(): RecallLoadState {
  return { phase: 'idle', groups: [], error: undefined }
}

/**
 * 装载判定（纯函数）：查询键齐备（projectId + sessionId）→ 拉取；键缺席 → idle（静态
 * 空态不拉取）。fix-33 ⑦：hold 分支删除——官方 only:id 激活即挂载，不可见态不存在
 * （原 keep-alive 形态残械，生产不可达）。
 */
export function recallLoadPlan(input: {
  readonly projectId: string | null
  readonly sessionId: string | null
}): 'fetch' | 'idle' {
  if (input.projectId === null || input.sessionId === null) return 'idle'
  return 'fetch'
}

/** 装载步进产物（runRecallLoad 输出——effect 仅落点，逻辑归纯/异步面） */
export type RecallLoadOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly groups: readonly RecallGroup[] }
  | { readonly kind: 'error'; readonly error: RecallErrorInfo }

/**
 * 装载任务（纯异步面，use-knowledge-browse LoadApply 同形制）：plan 判定 + fetch 归一——
 * fetch → loading 起步后拉取产物；idle → 复位。永不 reject。
 */
export async function runRecallLoad(
  input: { projectId: string | null; sessionId: string | null },
  makeClient: RecallClientFactory,
): Promise<readonly RecallLoadOutcome[]> {
  const plan = recallLoadPlan(input)
  if (plan === 'idle') return [{ kind: 'idle' }]
  const out = await fetchSessionRecall(makeClient(), {
    projectId: input.projectId as string,
    sessionId: input.sessionId as string,
  })
  return [
    { kind: 'loading' },
    out.ok ? { kind: 'ready', groups: out.groups } : { kind: 'error', error: out.error },
  ]
}

/** 落点应用（纯函数）：步进产物序列 → 下一状态 */
export function applyRecallOutcome(_prev: RecallLoadState, outcome: RecallLoadOutcome): RecallLoadState {
  switch (outcome.kind) {
    case 'idle':
      return initialRecallState()
    case 'loading':
      return { phase: 'loading', groups: [], error: undefined }
    case 'ready':
      return { phase: 'ready', groups: outcome.groups, error: undefined }
    case 'error':
      return { phase: 'error', groups: [], error: outcome.error }
  }
}

/**
 * 召回数据装载 hook：装载逻辑 = runRecallLoad/applyRecallOutcome 纯函数面，effect 仅编排
 * （拉取 → 序号守卫落点——快速键变更不串台）。重试 = nonce 递增。锚变更即重拉
 * （fix-33 ⑦：visible 维度删除——only:id 挂载机制承载激活语义）。
 */
export function useSessionRecall(
  input: { projectId: string | null; sessionId: string | null },
  makeClient: RecallClientFactory = defaultClient,
): readonly [RecallLoadState, { retry(): void }] {
  const [state, setState] = useState<RecallLoadState>(initialRecallState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current
    let alive = true
    void runRecallLoad(input, makeClient).then((steps) => {
      if (!alive) return
      for (const step of steps) {
        if (seq !== seqRef.current) return // 键已变更：本批步进作废（防串台）
        setState((prev) => applyRecallOutcome(prev, step))
      }
    })
    return () => {
      alive = false
    }
  }, [input.projectId, input.sessionId, nonce, makeClient])

  return [state, { retry: () => { setNonce((n) => n + 1) } }] as const
}

/** 召回行标题兜底（快照全空 = 已删除的知识——呈现不缺席） */
function rowTitle(title: string | null): string {
  return title ?? '（已删除的知识）'
}

/** 单条知识分组行（命中 = 可点按钮跳详情抽屉；失效 = 行级标注不可点，不阻塞列表） */
function RecallRowView({
  row,
  now,
  onOpenEntry,
}: {
  readonly row: ReturnType<typeof recallRowsOf>[number]
  readonly now: number
  readonly onOpenEntry?: (entryId: number) => void
}): ReactNode {
  const stale = isRecallRowStale(row)
  const inner = (
    <>
      <span className="dswf-recall-rowmain">
        <span className="dswf-recall-rowtitle">{rowTitle(row.title)}</span>
        {row.domainPath !== null && row.domainPath !== '' ? (
          <span className="dswf-recall-rowdomain">{row.domainPath}</span>
        ) : null}
        {stale ? <span className="dswf-recall-stale" data-dswf-recall-stale="">索引未命中</span> : null}
      </span>
      <span className="dswf-recall-rowmeta">
        {row.verbs.map((v) => (
          <span key={v.verb} className="dswf-recall-verb" data-dswf-recall-verb={v.verb}>
            {`${v.verb} ×${v.count}`}
          </span>
        ))}
        <span className="dswf-recall-time" data-dswf-recall-time="">
          {recallTimeLabel(row.lastAt, now)}
        </span>
        <HeatBadge count={row.heat} className="dswf-recall-heat" />
      </span>
    </>
  )
  if (stale || onOpenEntry === undefined) {
    return (
      <li
        className={`dswf-recall-row${stale ? ' is-stale' : ''}`}
        data-dswf-recall-row=""
        data-stale={stale || undefined}
        aria-disabled={stale || undefined}
      >
        <div className="dswf-recall-rowbtn">{inner}</div>
      </li>
    )
  }
  return (
    <li className="dswf-recall-row" data-dswf-recall-row="" data-entry-id={row.entryId ?? undefined}>
      <button
        type="button"
        className="dswf-recall-rowbtn"
        title="查看知识详情"
        onClick={() => {
          if (row.entryId !== null) onOpenEntry(row.entryId)
        }}
      >
        {inner}
      </button>
    </li>
  )
}

/** 骨架行数（装载在途——行级骨架，沿 sidebar 骨架形制） */
const RECALL_SKELETON_ROWS = 3

export interface RecallTabBodyProps {
  /** 装载状态（useSessionRecall 输出——全相位可构造，纯渲染面） */
  readonly state: RecallLoadState
  /** 重试（错误态） */
  readonly retry: () => void
  /** 命中行点击 → 知识详情抽屉（装配注入；缺席 = 行不可点） */
  readonly onOpenEntry?: (entryId: number) => void
  /** 时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/**
 * 召回 tab 纯渲染（状态注入——静态可测全相位）：统计头（召回次数/覆盖条数——recallStatsOf
 * 纯投影）+ 按知识分组行列表（动词明细/最近时间/热度徽章）；idle/零事件 = 「本会话暂无召回」
 * 空态；error = 错误条 + 重试（fail-soft 不炸壳）。
 */
export function RecallTabBody({ state, retry, onOpenEntry, now }: RecallTabBodyProps): ReactNode {
  const nowMs = now ?? Date.now()
  if (state.phase === 'idle' || (state.phase === 'ready' && state.groups.length === 0)) {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="empty">
        <EmptyState title="本会话暂无召回" />
      </div>
    )
  }
  if (state.phase === 'loading') {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="loading">
        <div className="dswf-recall-skeleton" data-dswf-recall-skeleton="" aria-hidden="true">
          {Array.from({ length: RECALL_SKELETON_ROWS }, (_, i) => (
            <div key={i} className="dswf-recall-skeleton-row" />
          ))}
        </div>
      </div>
    )
  }
  if (state.phase === 'error' && state.error !== undefined) {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="error">
        <div className="dswf-recall-error" data-dswf-recall-error="" role="alert">
          <span>{`召回记录加载失败：${state.error.message}`}</span>
          <button type="button" className="dswf-recall-retry" data-dswf-recall-retry="" onClick={retry}>
            重试
          </button>
        </div>
      </div>
    )
  }
  const stats = recallStatsOf(state.groups)
  const rows = recallRowsOf(state.groups)
  return (
    <div className="dswf-recall-tab" data-dswf-recall-tab="">
      <div
        className="dswf-recall-stats"
        data-dswf-recall-stats=""
        data-calls={stats.calls}
        data-covered={stats.covered}
      >
        <span className="dswf-recall-stat">{`召回次数 ${stats.calls}`}</span>
        <span className="dswf-recall-statsep" aria-hidden="true">·</span>
        <span className="dswf-recall-stat">{`覆盖知识 ${stats.covered}`}</span>
      </div>
      <ul className="dswf-recall-list" role="list" aria-label="本会话知识召回">
        {rows.map((row) => (
          <RecallRowView key={row.key} row={row} now={nowMs} onOpenEntry={onOpenEntry} />
        ))}
      </ul>
    </div>
  )
}

export interface RecallTabProps {
  /** 当前项目 id（sessionRecall 查询范围——装配自会话锚/项目推导注入） */
  readonly projectId: string | null
  /** 当前 dsh 会话 id（tab 分组键；null = 无会话锚 → 静态空态） */
  readonly sessionId: string | null
  /** 命中行点击 → 知识详情抽屉（装配注入——视图态切换 + 抽屉打开归装配，跨视图不直引） */
  readonly onOpenEntry?: (entryId: number) => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RecallClientFactory
  /** 时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/**
 * 召回 tab 装载壳（hook 装配 + 纯渲染；挂载 = 官方 conversation.view roster only:id
 * 激活即挂载、切走即卸载——「每次选中重拉」由挂载机制承载，fix-25/fix-33 ⑦）。
 */
export function RecallTab({ projectId, sessionId, onOpenEntry, makeClient, now }: RecallTabProps): ReactNode {
  const [state, { retry }] = useSessionRecall({ projectId, sessionId }, makeClient)
  return <RecallTabBody state={state} retry={retry} onOpenEntry={onOpenEntry} now={now} />
}

/** 缺省构造：preload 传输真身（缺席由 mapRecallError 收敛为错误条——非 Electron 载体不炸壳） */
function defaultClient(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
