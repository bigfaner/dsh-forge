// 会话知识召回 tab（定位：业务——UF-4 召回 tab 数据接线；stage④ 1.8 召回卡片重写）。
// 数据纪律：
//   - 唯一数据通道 = forge:knowledge/sessionRecall（RecallGroup[]——call_id 聚合扁平列表；
//     turn 聚合归消费面 recall-model.recallTurnsOf 纯投影——契约 S11）；投影（统计头/轮卡/
//     函数头文本）经 recall-model 纯函数，UI 零再推导。
//   - 唯一反馈通道 = forge:knowledge/recallFeedback（stage④ 1.7 第七通道——行级 👍/👎/撤销 +
//     事件级 👎 批/批撤销；UI 乐观回显，回执 failure 归一文案留面）。
//   - 卡片结构 = ui/card-design.md 终稿：折叠两行（L1 轮次锚+触发输入摘要[Tooltip 全文]+
//     命中总数+scope 徽+回显徽 / L2 verb 统计 chips+top=首个 read 文档）；展开按 call 分节
//     四 verb 分型（节头 = 函数式工具 chip[Tooltip 携 call_id]+行尾节级 toggle；result 区缩进
//     分界；节间 divider；参数区不存在）；read result = content_snap 快照 dialog 非实时读源。
//   - 交互红线：反馈动作零布局位移零收起（展开态真源 = 卡内局部状态；反馈钮 stopPropagation
//     + 局部 map 更新）；负反馈 Modal 必附说明；再点同钮 = toggle 撤销。
//   - 详情 = tab 内就地 dialog（官方 Modal）：read 节 = content_snap 快照全文唯一呈现位；
//     其余命中 = entryDetail 通道按需拉取（只读裁剪）——onOpenEntry 跨视图桥缝退役。
//   - 已知数据面降级（宁缺不假，不发明）：RecallGroupHit 契约（S1–S12）未携带 read-abstract/
//     browse 出参 summary/keywords/status 与行级 feedback 落账态——回显为会话内乐观态，字段
//     补齐须先修订契约再进实现；stale 命中（entryId null）行级「索引未命中」标注不可点。
//   - 无会话/无项目锚 = 静态空态（不拉取）；ready 零事件 = 「本会话暂无召回记录」；
//     错误 = 错误条 + 重试（fail-soft 不炸壳）。
// 组装分工沿 3.6/3.7 形制：useSessionRecall（hook 装载）+ RecallTabBody（渲染——折叠态
// renderToStaticMarkup 可测）+ RecallCardView（纯渲染展开/折叠双态——全相位可测）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  EntryDetail,
  RecallFeedbackFailureCode,
  RecallFeedbackRequest,
  RecallGroup,
  RecallGroupHit,
  SessionRecallQuery,
} from '@dsh-forge/contracts'
import {
  Button,
  IconDislikeFillRegular,
  IconDislikeOutlineRegular,
  IconLikeFillRegular,
  IconLikeOutlineRegular,
  Input,
  Modal,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState, ErrorBar, MarkdownDoc, MD_PREVIEW_MARKDOWN_LABELS, SkeletonRows, StateChip } from '../../components/index.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { RpcClientError } from '../../rpc/errors.js'
import { rpcUiState, type RpcUiStateKind } from '../../rpc/ui-state.js'
import {
  recallCallHead,
  recallDatetimeLabel,
  recallScoreLabel,
  recallStatsOf,
  recallTurnsOf,
} from './recall-model.js'
import './session.css'

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
 * 空态不拉取）。官方 only:id 激活即挂载，不可见态不存在（fix-33 ⑦）。
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
  makeClient: RpcClientFactory,
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
 * （拉取 → 序号守卫落点——快速键变更不串台）。重试 = nonce 递增。锚变更即重拉。
 */
export function useSessionRecall(
  input: { projectId: string | null; sessionId: string | null },
  makeClient: RpcClientFactory = preloadRpcClientFactory,
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

// ───────────────── 反馈动作面（stage④ 1.8——第七通道消费 + 乐观回显） ─────────────────

/** 行级反馈值（1 = 已标记 👍；-1 = 已剔除 👎） */
export type RecallFeedbackValue = 1 | -1

/** 反馈回显状态（会话内乐观态——通道未携带落账态，回显零布局位移就地更新） */
export interface RecallFeedbackState {
  /** 行级真值（rowId → 当前反馈；键缺席 = 未反馈） */
  readonly rows: Readonly<Record<number, RecallFeedbackValue>>
  /** 事件级批应用域（callId → 批👎已呈——节头整批撤销判据） */
  readonly batches: Readonly<Record<string, true>>
}

/** 初始回显态（全部未反馈） */
export function initialRecallFeedback(): RecallFeedbackState {
  return { rows: {}, batches: {} }
}

/** 反馈逐行失败码 → 用户可读文案（封闭码集分派键——entryActionFailureText 同形制） */
export function recallFeedbackFailureText(code: RecallFeedbackFailureCode): string {
  switch (code) {
    case 'not-found':
      return '反馈行未命中（记录可能已被清理）'
    case 'note-required':
      return '缺少误召回说明'
    case 'unconfirmed':
      return '条目未确认（反馈仅对已确认条目生效）'
  }
}

/** 反馈提交结果（ok/error 归一——永不 reject；逐行 failure 归一为失败） */
export type RecallFeedbackSubmit =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

/**
 * 反馈提交（纯异步面）：唯一通道 = forge:knowledge/recallFeedback；逐行 failure = code
 * 分派文案 + 服务 message；请求级拒收 = typed error 信封/异常归一。
 */
export async function submitRecallFeedback(
  client: ForgeRpcClient,
  req: RecallFeedbackRequest,
): Promise<RecallFeedbackSubmit> {
  try {
    const outcome = await client.knowledge.recallFeedback(req)
    if ('results' in outcome) {
      for (const result of outcome.results) {
        if (result.outcome === 'failure') {
          return { ok: false, message: `${recallFeedbackFailureText(result.code)}（${result.message}）` }
        }
      }
      return { ok: true }
    }
    return { ok: false, message: outcome.message }
  } catch (error) {
    return { ok: false, message: mapRecallError(error).message }
  }
}

// ───────────────── 详情 dialog 数据面（tab 内就地——entryDetail 按需拉取） ─────────────────

/** 详情相位（error 附载 RecallErrorInfo） */
export type RecallEntryPhase = 'loading' | 'ready' | 'error'

/** 就地详情状态（hook 输出——纯渲染面消费形状） */
export interface RecallEntryState {
  readonly phase: RecallEntryPhase
  readonly detail: EntryDetail | undefined
  readonly error: RecallErrorInfo | undefined
}

/** 初始详情态 */
export function initialRecallEntryState(): RecallEntryState {
  return { phase: 'loading', detail: undefined, error: undefined }
}

/** 详情拉取（纯异步面）：唯一通道 = forge:knowledge/entryDetail（按需读取，不预载） */
export async function fetchRecallEntryDetail(
  client: ForgeRpcClient,
  projectId: string,
  entryId: number,
): Promise<{ ok: true; detail: EntryDetail } | { ok: false; error: RecallErrorInfo }> {
  try {
    return { ok: true, detail: await client.knowledge.entryDetail({ projectId, entryId }) }
  } catch (error) {
    return { ok: false, error: mapRecallError(error) }
  }
}

/** 就地详情装载 hook（entryId null = 关闭不拉取；序号守卫防串台） */
export function useRecallEntryDetail(
  projectId: string | null,
  entryId: number | null,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [RecallEntryState, { retry(): void }] {
  const [state, setState] = useState<RecallEntryState>(initialRecallEntryState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    if (entryId === null || projectId === null) return
    const seq = ++seqRef.current
    setState(initialRecallEntryState())
    let alive = true
    void fetchRecallEntryDetail(makeClient(), projectId, entryId).then((out) => {
      if (!alive || seq !== seqRef.current) return
      setState(
        out.ok
          ? { phase: 'ready', detail: out.detail, error: undefined }
          : { phase: 'error', detail: undefined, error: out.error },
      )
    })
    return () => {
      alive = false
    }
  }, [projectId, entryId, nonce, makeClient])

  return [state, { retry: () => { setNonce((n) => n + 1) } }] as const
}

/** 命中行标题兜底（快照全空 = 已删除的知识——呈现不缺席） */
function rowTitle(title: string | null): string {
  return title ?? '（已删除的知识）'
}

// ───────────────── 反馈图标钮（行尾/节头统一同款——零自创形态） ─────────────────

/** 单枚反馈钮（.ibtn 同款 18px 命中区；active = Fill 态 + aria-pressed；stopPropagation 上抛） */
function FeedbackButton({
  kind,
  active,
  label,
  onClick,
}: {
  readonly kind: 'up' | 'down'
  readonly active: boolean
  readonly label: string
  readonly onClick: () => void
}): ReactNode {
  const Icon = kind === 'up'
    ? (active ? IconLikeFillRegular : IconLikeOutlineRegular)
    : (active ? IconDislikeFillRegular : IconDislikeOutlineRegular)
  return (
    <Tooltip label={label} portal>
      <button
        type="button"
        className="dswf-recall-ibtn"
        data-dswf-recall-ibtn={kind}
        aria-label={label}
        aria-pressed={active}
        onClick={(event) => {
          event.stopPropagation() // 交互红线：反馈零收起——事件不冒泡到卡头 toggle
          onClick()
        }}
      >
        <Icon size={14} />
      </button>
    </Tooltip>
  )
}

/** 反馈钮对（👍/👎 并置；down 仅未呈 👍 时在场——状态机 P 态禁直达负路径语义由钮缺席表达） */
function FeedbackPair({
  upActive,
  downActive,
  onUp,
  onDown,
}: {
  readonly upActive: boolean
  readonly downActive: boolean
  readonly onUp: () => void
  readonly onDown: () => void
}): ReactNode {
  return (
    <span className="dswf-recall-fbpair">
      <FeedbackButton kind="up" active={upActive} label={upActive ? '撤销已标记' : '标记有用'} onClick={onUp} />
      {upActive ? null : (
        <FeedbackButton kind="down" active={downActive} label={downActive ? '撤销已剔除' : '标记误召回'} onClick={onDown} />
      )}
    </span>
  )
}

// ───────────────── 轮卡（纯渲染——折叠/展开双态全相位可测） ─────────────────

/** 卡内负反馈目标（Modal 载荷——行级 / 事件级批） */
export interface RecallRejectTarget {
  readonly kind: 'row' | 'call'
  readonly rowId?: number
  readonly callId?: string
  readonly subject: string
  readonly count: number
}

export interface RecallCardViewProps {
  /** 轮卡投影（recallTurnsOf 产物） */
  readonly card: ReturnType<typeof recallTurnsOf>[number]
  /** 展开态（真源归 tab 体局部状态——反馈动作零收起的承载） */
  readonly expanded: boolean
  readonly onToggle: () => void
  /** 反馈回显态 */
  readonly feedback: RecallFeedbackState
  /** 行级反馈意图（next = 0 撤销；-1 → tab 体先弹说明 Modal 再落账） */
  readonly onRowFeedback: (row: RecallGroupHit, group: RecallGroup, next: 1 | -1 | 0) => void
  /** 事件级批👎意图（tab 体先弹说明 Modal 再落账） */
  readonly onCallReject: (group: RecallGroup) => void
  /** 事件级批撤销（整批已呈👎时再点 = 撤销） */
  readonly onCallUndo: (group: RecallGroup) => void
  /** read 快照 dialog 打开（contentSnap 唯一呈现位） */
  readonly onOpenSnapshot: (group: RecallGroup) => void
  /** 就地详情 dialog 打开（entryDetail 按需拉取） */
  readonly onOpenEntry: (entryId: number) => void
}

/** 命中行（scope chip + 域前缀 + 标题 + score 元组 + 行级反馈钮；stale 标注不可点） */
function SearchHitRow({
  hit,
  group,
  feedback,
  onRowFeedback,
  onOpenEntry,
}: {
  readonly hit: RecallGroupHit
  readonly group: RecallGroup
  readonly feedback: RecallFeedbackState
  readonly onRowFeedback: RecallCardViewProps['onRowFeedback']
  readonly onOpenEntry: (entryId: number) => void
}): ReactNode {
  const current = feedback.rows[hit.rowId]
  const stale = hit.entryId === null
  const score = recallScoreLabel(hit.score)
  const title = (
    <span className={`dswf-recall-hittitle${stale ? '' : ' is-link'}`}>
      {hit.domainPath !== null && hit.domainPath !== '' ? (
        <span className="dswf-recall-hitdomain">{hit.domainPath}</span>
      ) : null}
      <span className="dswf-recall-hittitletext">{rowTitle(hit.title)}</span>
    </span>
  )
  return (
    <div className="dswf-recall-hitrow" data-dswf-recall-hit="" data-row-id={hit.rowId} data-stale={stale || undefined}>
      <span data-dswf-recall-scope={hit.scope}><Tag className="dswf-recall-scopechip">{hit.scope}</Tag></span>
      {stale ? (
        <span className="dswf-recall-hitmain">{title}<span className="dswf-recall-stale">索引未命中</span></span>
      ) : (
        <Tooltip label="查看知识详情" portal>
          <button
            type="button"
            className="dswf-recall-hitmain is-link"
            onClick={() => {
              if (hit.entryId !== null) onOpenEntry(hit.entryId)
            }}
          >
            {title}
          </button>
        </Tooltip>
      )}
      {score !== null ? <span className="dswf-recall-score">{score}</span> : null}
      <FeedbackPair
        upActive={current === 1}
        downActive={current === -1}
        onUp={() => onRowFeedback(hit, group, current === 1 ? 0 : 1)}
        onDown={() => onRowFeedback(hit, group, current === -1 ? 0 : -1)}
      />
    </div>
  )
}

/** 调用分节（节头 = 工具 chip + 行尾节级 toggle；result 区缩进分界 + 四 verb 分型） */
function RecallCallSection({
  group,
  feedback,
  onRowFeedback,
  onCallReject,
  onCallUndo,
  onOpenSnapshot,
  onOpenEntry,
}: {
  readonly group: RecallGroup
} & Omit<RecallCardViewProps, 'card' | 'expanded' | 'onToggle'>): ReactNode {
  const head = recallCallHead(group)
  const hint = group.query?.hint
  const batchApplied = feedback.batches[group.callId] === true
  // 节级回显：批👎已呈 = 整批撤销判据；单命中节 = 行级真值映射（read/read-abstract 恒单行）
  const singleRow = group.hits.length === 1 ? group.hits[0] : undefined
  const singleValue = singleRow === undefined ? undefined : feedback.rows[singleRow.rowId]
  const rejectedCount = group.hits.filter((hit) => feedback.rows[hit.rowId] === -1).length

  const sectionActions = singleRow !== undefined ? (
    <FeedbackPair
      upActive={singleValue === 1}
      downActive={singleValue === -1 || batchApplied}
      onUp={() => onRowFeedback(singleRow, group, singleValue === 1 ? 0 : 1)}
      onDown={() => {
        if (singleValue === -1 || batchApplied) onRowFeedback(singleRow, group, 0)
        else onRowFeedback(singleRow, group, -1)
      }}
    />
  ) : (
    // 事件级批只承担 👎/撤销（正反馈无批动作语义——契约硬约定，👍 钮缺席 = 唯一表达）
    <FeedbackButton
      kind="down"
      active={batchApplied}
      label={batchApplied ? '撤销已剔除' : '标记误召回'}
      onClick={() => {
        if (batchApplied) onCallUndo(group)
        else onCallReject(group)
      }}
    />
  )

  return (
    <div className="dswf-recall-call" data-dswf-recall-call="" data-call-id={group.callId} data-verb={group.verb}>
      <div className="dswf-recall-callhead">
        <Tooltip label={`call_id：${group.callId}`} portal>
          <span className="dswf-recall-toolchip" data-dswf-recall-toolchip="">{head}</span>
        </Tooltip>
        <span className="dswf-recall-spacer" aria-hidden="true" />
        {rejectedCount > 0 ? (
          <span className="dswf-recall-echo" data-dswf-recall-echo="">{`已剔除 ${rejectedCount}/${group.hits.length} 条`}</span>
        ) : null}
        {singleValue === 1 ? <span className="dswf-recall-echo" data-dswf-recall-echo="">已标记</span> : null}
        {sectionActions}
      </div>
      <div className="dswf-recall-secbody" data-dswf-recall-secbody="">
        {hint !== undefined && hint !== '' ? (
          <div className="dswf-recall-hint" data-dswf-recall-hint=""><span className="dswf-recall-hintkey">hint:</span> {hint}</div>
        ) : null}
        {group.verb === 'search' ? (
          group.hitCount === 0 ? (
            <div className="dswf-recall-sentinel" data-dswf-recall-sentinel="">命中 0 条</div>
          ) : (
            group.hits.map((hit) => (
              <SearchHitRow
                key={hit.rowId}
                hit={hit}
                group={group}
                feedback={feedback}
                onRowFeedback={onRowFeedback}
                onOpenEntry={onOpenEntry}
              />
            ))
          )
        ) : null}
        {group.verb === 'read' ? (
          <ReadSectionBody group={group} onOpenSnapshot={onOpenSnapshot} onOpenEntry={onOpenEntry} />
        ) : null}
        {group.verb === 'read-abstract' ? (
          <AbstractSectionBody group={group} onOpenEntry={onOpenEntry} />
        ) : null}
        {group.verb === 'browse' ? (
          group.hits.map((hit) => <BrowseRow key={hit.rowId} hit={hit} onOpenEntry={onOpenEntry} />)
        ) : null}
      </div>
    </div>
  )
}

/** read 节 result：文档名称文字链接 → 快照 dialog（contentSnap 缺席降级 entryDetail dialog） */
function ReadSectionBody({
  group,
  onOpenSnapshot,
  onOpenEntry,
}: {
  readonly group: RecallGroup
  readonly onOpenSnapshot: (group: RecallGroup) => void
  readonly onOpenEntry: (entryId: number) => void
}): ReactNode {
  const hit = group.hits[0]
  const stale = hit === undefined || hit.entryId === null
  const title = rowTitle(hit?.title ?? null)
  const label = (
    <span className="dswf-recall-hittitle">
      {hit?.domainPath ? <span className="dswf-recall-hitdomain">{hit.domainPath}</span> : null}
      <span className="dswf-recall-hittitletext">{title}</span>
    </span>
  )
  return (
    <div className="dswf-recall-readline" data-dswf-recall-read="">
      {stale ? (
        <span className="dswf-recall-hitmain">{label}<span className="dswf-recall-stale">索引未命中</span></span>
      ) : (
        <Tooltip label={group.contentSnap !== null ? '查看召回时点快照全文' : '查看知识详情'} portal>
          <button
            type="button"
            className="dswf-recall-hitmain is-link"
            onClick={() => {
              if (group.contentSnap !== null) onOpenSnapshot(group)
              else if (hit?.entryId !== undefined && hit.entryId !== null) onOpenEntry(hit.entryId)
            }}
          >
            {label}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

/** read-abstract 节 result：title 链接（域前缀同命中行式）——summary/三元信息字段通道未供（降级） */
function AbstractSectionBody({
  group,
  onOpenEntry,
}: {
  readonly group: RecallGroup
  readonly onOpenEntry: (entryId: number) => void
}): ReactNode {
  const hit = group.hits[0]
  const stale = hit === undefined || hit.entryId === null
  const label = (
    <span className="dswf-recall-hittitle">
      {hit?.domainPath ? <span className="dswf-recall-hitdomain">{hit.domainPath}</span> : null}
      <span className="dswf-recall-hittitletext">{rowTitle(hit?.title ?? null)}</span>
    </span>
  )
  return (
    <div className="dswf-recall-readline" data-dswf-recall-abstract="">
      {stale ? (
        <span className="dswf-recall-hitmain">{label}<span className="dswf-recall-stale">索引未命中</span></span>
      ) : (
        <Tooltip label="查看知识详情" portal>
          <button
            type="button"
            className="dswf-recall-hitmain is-link"
            onClick={() => {
              if (hit?.entryId !== undefined && hit.entryId !== null) onOpenEntry(hit.entryId)
            }}
          >
            {label}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

/** browse 条目行：[scope chip] (slug) [域] 标题（status/summary/keywords 通道未供——降级） */
function BrowseRow({
  hit,
  onOpenEntry,
}: {
  readonly hit: RecallGroupHit
  readonly onOpenEntry: (entryId: number) => void
}): ReactNode {
  const stale = hit.entryId === null
  const label = (
    <span className="dswf-recall-hittitle">
      {hit.frontmatterId !== null ? <span className="dswf-recall-score">{`(${hit.frontmatterId})`}</span> : null}
      {hit.domainPath !== null && hit.domainPath !== '' ? (
        <span className="dswf-recall-hitdomain">{hit.domainPath}</span>
      ) : null}
      <span className="dswf-recall-hittitletext">{rowTitle(hit.title)}</span>
    </span>
  )
  return (
    <div className="dswf-recall-hitrow" data-dswf-recall-browse-row="" data-row-id={hit.rowId}>
      <span data-dswf-recall-scope={hit.scope}><Tag className="dswf-recall-scopechip">{hit.scope}</Tag></span>
      {stale ? (
        <span className="dswf-recall-hitmain">{label}<span className="dswf-recall-stale">索引未命中</span></span>
      ) : (
        <Tooltip label="查看知识详情" portal>
          <button
            type="button"
            className="dswf-recall-hitmain is-link"
            onClick={() => {
              if (hit.entryId !== null) onOpenEntry(hit.entryId)
            }}
          >
            {label}
          </button>
        </Tooltip>
      )}
    </div>
  )
}

/** 轮卡（折叠两行 + 展开分节；整卡点击 = 展开/收起；反馈事件已隔离） */
export function RecallCardView(props: RecallCardViewProps): ReactNode {
  const { card, expanded, onToggle, feedback } = props
  const rejectedTotal = card.calls.reduce(
    (sum, group) => sum + group.hits.filter((hit) => feedback.rows[hit.rowId] === -1).length,
    0,
  )
  const markedTotal = card.calls.reduce(
    (sum, group) => sum + group.hits.filter((hit) => feedback.rows[hit.rowId] === 1).length,
    0,
  )
  return (
    <li
      className="dswf-recall-card"
      data-dswf-recall-card=""
      data-turn-seq={card.turnSeq ?? undefined}
      data-expanded={expanded}
    >
      <button
        type="button"
        className="dswf-recall-cardhead"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="dswf-recall-l1">
          <span className="dswf-recall-turn" data-dswf-recall-turn="">
            {card.turnSeq === null ? '轮次未锚' : `第 ${card.turnSeq} 轮`}
          </span>
          {card.trigger === null ? (
            <span className="dswf-recall-trigger">—</span>
          ) : (
            <Tooltip label={card.trigger} portal>
              <span className="dswf-recall-trigger" data-dswf-recall-trigger="">{card.trigger}</span>
            </Tooltip>
          )}
          <span className="dswf-recall-spacer" aria-hidden="true" />
          <span className="dswf-recall-hits" data-dswf-recall-hits={card.hitTotal}>
            {card.hitTotal === 0 ? '零命中' : `命中 ${card.hitTotal}`}
          </span>
          {card.scopes.map((scope) => (
            <span key={scope} data-dswf-recall-cardscope={scope}><Tag className="dswf-recall-scopechip">{scope}</Tag></span>
          ))}
          {rejectedTotal > 0 ? (
            <span className="dswf-recall-echo" data-dswf-recall-cardecho="">{`已剔除 ${rejectedTotal} 条`}</span>
          ) : markedTotal > 0 ? (
            <span className="dswf-recall-echo" data-dswf-recall-cardecho="">{`已标记 ${markedTotal} 条`}</span>
          ) : null}
        </span>
        <span className="dswf-recall-l2">
          <span className="dswf-recall-verbchips">
            {card.verbs.map((verb) => (
              <span key={verb.verb} className="dswf-recall-verb" data-dswf-recall-verb={verb.verb}>
                {`${verb.verb} ×${verb.count}`}
              </span>
            ))}
          </span>
          {card.top !== null ? (
            <span className="dswf-recall-top" data-dswf-recall-top="">{`top：${card.top}`}</span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <div className="dswf-recall-detail" data-dswf-recall-detail="">
          <div className="dswf-recall-attrib" data-dswf-recall-attrib="">{recallDatetimeLabel(card.lastAt)}</div>
          {card.calls.map((group) => (
            <RecallCallSection
              key={group.callId}
              group={group}
              feedback={feedback}
              onRowFeedback={props.onRowFeedback}
              onCallReject={props.onCallReject}
              onCallUndo={props.onCallUndo}
              onOpenSnapshot={props.onOpenSnapshot}
              onOpenEntry={props.onOpenEntry}
            />
          ))}
        </div>
      ) : null}
    </li>
  )
}

// ───────────────── read 快照 dialog（content_snap 唯一呈现位——非实时读源） ─────────────────

/** 快照头行拆分（纯函数）：contentSnap 首行 = render 头行 `# 标题 (id, status, version ts)` */
export function recallSnapshotParts(contentSnap: string): { head: string; body: string } {
  const newline = contentSnap.indexOf('\n')
  const firstLine = newline === -1 ? contentSnap : contentSnap.slice(0, newline)
  const rest = newline === -1 ? '' : contentSnap.slice(newline + 1)
  return firstLine.startsWith('# ')
    ? { head: firstLine.slice(2), body: rest }
    : { head: '', body: contentSnap }
}

/** 快照 dialog 纯渲染（Modal 内内容——静态可测） */
export function RecallSnapshotDialog({ title, contentSnap, onClose }: {
  readonly title: string
  readonly contentSnap: string
  readonly onClose: () => void
}): ReactNode {
  const parts = recallSnapshotParts(contentSnap)
  return (
    <Modal open onClose={onClose} title={title} closeLabel="关闭" className="dswf-recall-snapmodal">
      <div className="dswf-recall-snap" data-dswf-recall-snap="">
        {parts.head !== '' ? <div className="dswf-recall-snaphead">{`# ${parts.head}`}</div> : null}
        <pre className="dswf-recall-snapbody">{parts.body}</pre>
        <div className="dswf-recall-snapnote">召回时点快照，非实时读源文档。</div>
      </div>
    </Modal>
  )
}

// ───────────────── 就地详情 dialog（entryDetail 只读裁剪——无框文字链接入场） ─────────────────

/** 详情 dialog 纯渲染（官方 Modal——kv 元数据 + 摘要 + Markdown 正文；scope 徽入元数据） */
export function RecallEntryDialogBody({ state, retry }: {
  readonly state: RecallEntryState
  readonly retry: () => void
}): ReactNode {
  if (state.phase === 'loading') {
    return (
      <div className="dswf-recall-entry" data-dswf-recall-entry-phase="loading">
        <SkeletonRows className="dswf-recall-skeleton" rowClassName="dswf-recall-skeleton-row" rows={3} anchor="data-dswf-recall-entry-skeleton" />
      </div>
    )
  }
  if (state.phase === 'error' && state.error !== undefined) {
    return (
      <div className="dswf-recall-entry">
        <ErrorBar
          className="dswf-recall-error"
          message={`知识详情加载失败：${state.error.message}`}
          retryClassName="dswf-recall-retry"
          anchor="data-dswf-recall-entry-error"
          retryAnchor="data-dswf-recall-entry-retry"
          onRetry={retry}
        />
      </div>
    )
  }
  const detail = state.detail
  if (detail === undefined) return null
  return (
    <div className="dswf-recall-entry" data-dswf-recall-entry-phase="ready" data-dswf-recall-entry="">
      <div className="dswf-recall-entrymetas">
        <div className="dswf-recall-entrymrow"><span className="dswf-recall-entrymk">域</span><span>{detail.domainPath === '' ? '根' : detail.domainPath}</span></div>
        <div className="dswf-recall-entrymrow"><span className="dswf-recall-entrymk">状态</span><span><StateChip status={detail.status} /></span></div>
        <div className="dswf-recall-entrymrow"><span className="dswf-recall-entrymk">作者</span><span>{detail.authors ?? '—'}</span></div>
        <div className="dswf-recall-entrymrow"><span className="dswf-recall-entrymk">关键词</span><span className="dswf-recall-entrykws">
          {detail.keywords.map((keyword) => (
            <Tag key={keyword} tone="info">{keyword}</Tag>
          ))}
        </span></div>
      </div>
      <h3 className="dswf-recall-entrytitle">{detail.title}</h3>
      <p className="dswf-recall-entryabs">{detail.summary}</p>
      <div className="dswf-recall-entrybody">
        <MarkdownDoc text={detail.body} variant="body" labels={MD_PREVIEW_MARKDOWN_LABELS} />
      </div>
    </div>
  )
}

// ───────────────── tab 体（装载壳 + 卡片列表 + 反馈编排 + 双 dialog + 负反馈 Modal） ─────────────────

/** 骨架行数（装载在途——行级骨架，沿 sidebar 骨架形制） */
const RECALL_SKELETON_ROWS = 3

export interface RecallTabBodyProps {
  /** 装载状态（useSessionRecall 输出——全相位可构造） */
  readonly state: RecallLoadState
  /** 重试（错误态） */
  readonly retry: () => void
  /** 当前项目 id（反馈通道 + 就地详情查询范围；null = 详情不可开） */
  readonly projectId: string | null
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 召回 tab 体：统计头（口径零改动）+ 轮卡列表（一 turn 一卡）+ 反馈编排（乐观回显 +
 * 负反馈说明 Modal）+ read 快照/就地详情双 dialog。展开态 = tab 体局部真源（反馈动作
 * 零收起——更新反馈 map 不触碰展开集）；反馈失败 = 错误条留面 + 回显回滚。
 */
export function RecallTabBody({ state, retry, projectId, makeClient = preloadRpcClientFactory }: RecallTabBodyProps): ReactNode {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set())
  const [feedback, setFeedback] = useState<RecallFeedbackState>(initialRecallFeedback)
  const [rejectTarget, setRejectTarget] = useState<RecallRejectTarget | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [rejectBusy, setRejectBusy] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<{ title: string; contentSnap: string } | null>(null)
  const [entryId, setEntryId] = useState<number | null>(null)
  const [entryState, retryEntry] = useRecallEntryDetail(projectId, entryId, makeClient)

  if (state.phase === 'idle' || (state.phase === 'ready' && state.groups.length === 0)) {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="empty">
        <EmptyState title="本会话暂无召回记录" />
      </div>
    )
  }
  if (state.phase === 'loading') {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="loading">
        <SkeletonRows
          className="dswf-recall-skeleton"
          rowClassName="dswf-recall-skeleton-row"
          rows={RECALL_SKELETON_ROWS}
          anchor="data-dswf-recall-skeleton"
        />
      </div>
    )
  }
  if (state.phase === 'error' && state.error !== undefined) {
    return (
      <div className="dswf-recall-face" data-dswf-recall-face="error">
        <ErrorBar
          className="dswf-recall-error"
          message={`召回记录加载失败：${state.error.message}`}
          retryClassName="dswf-recall-retry"
          anchor="data-dswf-recall-error"
          retryAnchor="data-dswf-recall-retry"
          onRetry={retry}
        />
      </div>
    )
  }

  const stats = recallStatsOf(state.groups)
  const cards = recallTurnsOf(state.groups)

  /** 行级反馈执行（next = 0 撤销；-1 先弹说明；乐观回显 + 失败回滚） */
  const runRowFeedback = (rowId: number, next: 1 | -1 | 0): void => {
    const prevRows = feedback.rows
    const prevValue = prevRows[rowId]
    if (next === -1) {
      setRejectTarget({ kind: 'row', rowId, subject: '该条命中', count: 1 })
      setRejectNote('')
      return
    }
    setFeedback((current) => {
      const rows = { ...current.rows }
      if (next === 0) delete rows[rowId]
      else rows[rowId] = next
      return { ...current, rows }
    })
    if (projectId === null) return
    void submitRecallFeedback(makeClient(), { projectId, action: 'row', rowId, feedback: next }).then((out) => {
      if (!out.ok) {
        setFeedback((current) => {
          const rows = { ...current.rows }
          if (prevValue === undefined) delete rows[rowId]
          else rows[rowId] = prevValue
          return { ...current, rows }
        })
        setFeedbackError(out.message)
      }
    })
  }

  /** 批👎落账（说明 Modal 确认后） */
  const confirmReject = (): void => {
    const target = rejectTarget
    if (target === null || projectId === null || rejectBusy) return
    const note = rejectNote.trim()
    if (note === '') return
    setRejectBusy(true)
    const req: RecallFeedbackRequest = target.kind === 'row'
      ? { projectId, action: 'row', rowId: target.rowId as number, feedback: -1, note }
      : { projectId, action: 'batch', callId: target.callId as string, feedback: -1, note }
    void submitRecallFeedback(makeClient(), req).then((out) => {
      setRejectBusy(false)
      if (!out.ok) {
        setFeedbackError(out.message)
        return
      }
      setFeedback((current) => {
        if (target.kind === 'row') {
          return { ...current, rows: { ...current.rows, [target.rowId as number]: -1 } }
        }
        const callId = target.callId as string
        const group = cards.flatMap((card) => card.calls).find((call) => call.callId === callId)
        const rows = { ...current.rows }
        if (group !== undefined) {
          for (const hit of group.hits) {
            if (rows[hit.rowId] !== 1) rows[hit.rowId] = -1 // 已显式 👍 的行不覆盖（批硬语义）
          }
        }
        return { rows, batches: { ...current.batches, [callId]: true } }
      })
      setRejectTarget(null)
      setRejectNote('')
    })
  }

  /** 批撤销（节头再点——整批置回未反馈） */
  const runCallUndo = (group: RecallGroup): void => {
    const prevRows: Readonly<Record<number, RecallFeedbackValue>> = feedback.rows
    setFeedback((current) => {
      const rows = { ...current.rows }
      for (const hit of group.hits) delete rows[hit.rowId]
      const batches = { ...current.batches }
      delete batches[group.callId]
      return { rows, batches }
    })
    if (projectId === null) return
    void submitRecallFeedback(makeClient(), { projectId, action: 'batch', callId: group.callId, feedback: 0 }).then((out) => {
      if (!out.ok) {
        setFeedback((current) => {
          const rows = { ...current.rows }
          for (const hit of group.hits) {
            const prev = prevRows[hit.rowId]
            if (prev !== undefined) rows[hit.rowId] = prev
          }
          return { rows, batches: { ...current.batches, [group.callId]: true } }
        })
        setFeedbackError(out.message)
      }
    })
  }

  const toggleCard = (key: string): void => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
      {feedbackError !== undefined ? (
        <ErrorBar
          className="dswf-recall-error"
          message={`反馈提交失败：${feedbackError}`}
          retryClassName="dswf-recall-retry"
          anchor="data-dswf-recall-fberr"
          retryAnchor="data-dswf-recall-fberr-retry"
          onRetry={() => { setFeedbackError(undefined) }}
        />
      ) : null}
      <ul className="dswf-recall-list" role="list" aria-label="本会话知识召回">
        {cards.map((card) => (
          <RecallCardView
            key={card.key}
            card={card}
            expanded={expandedKeys.has(card.key)}
            onToggle={() => { toggleCard(card.key) }}
            feedback={feedback}
            onRowFeedback={(row, _group, next) => { runRowFeedback(row.rowId, next) }}
            onCallReject={(group) => {
              setRejectTarget({ kind: 'call', callId: group.callId, subject: '整次召回', count: group.hitCount })
              setRejectNote('')
            }}
            onCallUndo={runCallUndo}
            onOpenSnapshot={(group) => {
              setSnapshot({ title: rowTitle(group.hits[0]?.title ?? null), contentSnap: group.contentSnap ?? '' })
            }}
            onOpenEntry={(id) => { setEntryId(id) }}
          />
        ))}
      </ul>
      {/* 负反馈说明 Modal（必填 Input——确认禁用 = 说明为空；官方 Modal 从 tab 之上叠层） */}
      <Modal
        open={rejectTarget !== null}
        onClose={() => { setRejectTarget(null) }}
        title="标记误召回"
        closeLabel="关闭"
        className="dswf-recall-rejectmodal"
        footer={
          <>
            <Button variant="outline" onClick={() => { setRejectTarget(null) }}>取消</Button>
            <Button
              variant="primary"
              data-dswf-recall-reject-confirm=""
              disabled={rejectBusy || rejectNote.trim() === ''}
              onClick={confirmReject}
            >
              确认
            </Button>
          </>
        }
      >
        <div className="dswf-recall-rejectform" data-dswf-recall-rejectform="">
          <div className="dswf-recall-rejectsubject">
            {rejectTarget === null ? '' : rejectTarget.kind === 'row' ? '该条命中' : `整次召回 ${rejectTarget.count} 条`}
          </div>
          <Input
            data-dswf-recall-reject-note=""
            aria-label="误召回说明（必填）"
            placeholder="说明误召回原因（必填）"
            value={rejectNote}
            onChange={(event) => { setRejectNote(event.target.value) }}
            disabled={rejectBusy}
          />
        </div>
      </Modal>
      {/* read 快照 dialog（content_snap 全文唯一呈现位——关闭回原展开态，列表恒挂载） */}
      {snapshot !== null ? (
        <RecallSnapshotDialog
          title={snapshot.title}
          contentSnap={snapshot.contentSnap}
          onClose={() => { setSnapshot(null) }}
        />
      ) : null}
      {/* 就地详情 dialog（entryDetail 按需拉取；null = 关闭不渲染） */}
      <Modal
        open={entryId !== null}
        onClose={() => { setEntryId(null) }}
        title={entryState.detail?.title ?? '知识详情'}
        closeLabel="关闭"
        className="dswf-recall-entrymodal"
      >
        {entryId !== null ? <RecallEntryDialogBody state={entryState} retry={retryEntry.retry} /> : null}
      </Modal>
    </div>
  )
}

export interface RecallTabProps {
  /** 当前项目 id（sessionRecall 查询范围——装配自会话锚/项目推导注入） */
  readonly projectId: string | null
  /** 当前 dsh 会话 id（tab 分组键；null = 无会话锚 → 静态空态） */
  readonly sessionId: string | null
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

/**
 * 召回 tab 装载壳（hook 装配 + 渲染；挂载 = 官方 conversation.view roster only:id
 * 激活即挂载、切走即卸载——「每次选中重拉」由挂载机制承载）。详情 = tab 内就地 dialog
 * （onOpenEntry 跨视图桥缝退役——stage④ 1.8）。
 */
export function RecallTab({ projectId, sessionId, makeClient }: RecallTabProps): ReactNode {
  const [state, { retry }] = useSessionRecall({ projectId, sessionId }, makeClient)
  return <RecallTabBody state={state} retry={retry} projectId={projectId} makeClient={makeClient} />
}
