// 知识详情弹窗（定位：业务——UF-6 详情面：两列元数据表 + 摘要块 + Markdown 正文）。
// 承载 = 自持可拖移 dialog（用户裁决：可移动 + 宽 770 + 缘侧可拉伸调宽）——bug-dialog
// 同先例（真 dialog 自持皮 + 拖动机械复用 drawer：taskDrawerHeadDragProps /
// drawerPositionFromDrag / drawerWidthFromEdgeDrag；Esc 链归本件 capture 监听）。
// 组装分工沿 3.6 形制：EntryDrawer（装载壳——hook + 几何态）持有 useEntryDetail
// （正文按需读取），EntryDrawerBody（纯渲染——全相位 renderToStaticMarkup 可测）呈现三区。
// Hard Rules：
//   - 正文渲染经 MarkdownDoc 全量渲染（1.8 渲染链退役：官方渲染唯一包装入口——mermaid
//     fence 渲染为 md-code-block 后由 DOM 增强器出图，增强器挂接归 client 插件 1.7；
//     variant=body + CodeToolbar labels，裸渲染器禁直用不变）；
//   - 正文按需读取（getEntryDetail 唯一通道），不预载全库（browse/listEntries/heat 零调用）。
// 打开参数按 entryId 设计（Implementation Notes）——3.8 召回 tab 分组行跳转复用同门。
// AC3 关闭回浏览上下文（过滤态保持）：本件不触碰浏览过滤态（旁挂层， onClose 上抛归装配方）；
// Esc 捕获序 = 弹窗先于工具栏清空（capture——原型同序）。
// 元数据表 = 首区（用户裁决）：域/状态/作者/更新时间四列同行 + 关键词独占整行（Tag tone=info
// 浅蓝 tint、无 # 前缀）；行紧凑刻度（4px 内衬）。
// knowledge-review-ui SC-G（1.8）：dialog 双模式对齐专家 detail-dialog 机制（controller
// 同型状态机 mode/draft/errors/busy/toast/stale + escNext 链 + head-actions 右置描边钮 +
// toast/stale 面）——查看模式现役三分区零改动；编辑模式 = 域(只读)+标题同行、关键词 chips
// （双击编辑/＋新增/✕移除）、摘要 3 行文本域、正文随内容增长文本域；驳回弹官方 Modal
// （SessionArchiveConfirmDialog 同型：清单+数量）正确叠层；保存走 entryAction editMeta
// （版本链前进+指针前移服务语义——UI 只透传，域校验服务面承载）；校验错误留 dialog
// （dswf-dlg-err 同型行）；UI 基准 = walkthrough/mockup.html + SC-G。
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Button, IconCloseFillRegular, Modal, Pill, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EntryDetail } from '@dsh-forge/contracts'
import { EmptyState, ErrorBar, MD_PREVIEW_MARKDOWN_LABELS, MarkdownDoc, StateChip } from '../../components/index.js'
import { preloadRpcClientFactory, type ForgeRpcClient, type RpcClientFactory } from '../../rpc/index.js'
import { mapBrowseError, type BrowseErrorInfo } from './use-knowledge-browse.js'
import { entryActionFailureText } from './browse-model.js'
import {
  defaultDrawerPosition,
  drawerPositionFromDrag,
  drawerWidthFromEdgeDrag,
  type DrawerModalPosition,
  type DrawerResizeEdge,
} from '../overview/drawer/collapse.js'
import { taskDrawerHeadDragProps, type TaskDrawerDragKind } from '../overview/drawer/index.js'
import './knowledge.css'

/** 弹窗宽缺省（720 阅读刻度 +50——用户裁决「宽度增加50PX」） */
export const KN_DIALOG_WIDTH_DEFAULT = 770
/** 弹窗宽下限（px——缘侧拉伸收口） */
export const KN_DIALOG_WIDTH_MIN = 480
/** 宽度钳制（上探视口 92%、下不越 MIN；NaN 防御回缺省） */
export function clampKnDialogWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) return KN_DIALOG_WIDTH_DEFAULT
  const ceiling = Math.max(KN_DIALOG_WIDTH_DEFAULT, viewportWidth === undefined ? KN_DIALOG_WIDTH_DEFAULT : Math.round(viewportWidth * 0.92))
  return Math.min(ceiling, Math.max(KN_DIALOG_WIDTH_MIN, Math.round(width)))
}

// ───────────────── SC-G：dialog 双模式（controller 同型——纯决策面先行） ─────────────────

/** dialog 模式（controller 同型：view = 现役三分区零改动；edit = 字段内联展开） */
export type KnDialogMode = 'view' | 'edit'

/** Esc 链式退场决策（escNext 同款）：编辑 → 回查看；查看 → 关闭 */
export function escNextKn(mode: KnDialogMode): 'back-to-view' | 'close' {
  return mode === 'edit' ? 'back-to-view' : 'close'
}

/** 编辑草稿（controller 同型 draft：editMeta 四字段——域只读不在 draft） */
export interface KnEditDraft {
  readonly title: string
  readonly keywords: readonly string[]
  readonly summary: string
  readonly body: string
}

/** 编辑草稿初始化（现役 detail → draft；keywords 拷贝——零共享引用漂移） */
export function initialKnEditDraft(detail: EntryDetail): KnEditDraft {
  return { title: detail.title, keywords: [...detail.keywords], summary: detail.summary, body: detail.body }
}

/** 编辑校验错误（controller 同型 errors：title = 标题行错误；form = 保存回执错误——留 dialog） */
export interface KnEditErrors {
  readonly title?: string
  readonly form?: string
}

/** 客户端校验（轻校验——服务面 write 严契约承载域/YAML 严校验，UI 只透传）：标题非空 */
export function validateKnEditDraft(draft: KnEditDraft): KnEditErrors {
  return draft.title.trim() === '' ? { title: '标题不能为空' } : {}
}

/**
 * chip 编辑收口（G5 纯函数）：回车/失焦收口——trim 写回；空值收口 = 删除该 chip
 * （含 ＋ 新增空白 chip 后取消径——空即删同 mockup kwEdit 语义）。
 */
export function commitKnChip(keywords: readonly string[], index: number, value: string): readonly string[] {
  const next = [...keywords]
  const trimmed = value.trim()
  if (trimmed === '') {
    next.splice(index, 1)
    return next
  }
  next[index] = trimmed
  return next
}

/** chip 移除（✕——事件隔离归组件层 stopPropagation；落位删除归本纯函数） */
export function removeKnChip(keywords: readonly string[], index: number): readonly string[] {
  const next = [...keywords]
  next.splice(index, 1)
  return next
}

/** chip 新增（＋）：追加空白位并进入编辑（放大态收口归 commitKnChip——空即删） */
export function insertKnChip(keywords: readonly string[]): readonly string[] {
  return [...keywords, '']
}

/** entryAction 执行结果（ok/error 归一——永不 reject；message = 用户可读文案） */
export type EntryActionOutcome = { readonly ok: true } | { readonly ok: false; readonly message: string }

/**
 * editMeta 执行（纯异步面）：保存走 forge:knowledge/entryAction editMeta——恰 1 条 +
 * title/keywords/summary/body 四字段（版本链前进 + confirmed_version_id 指针前移 =
 * 服务语义，UI 只透传；keywords trim 去空——轻整备，严校验服务面承载）。
 * 逐条 failure = code 分派文案（entryActionFailureText——UI 文案分派键）+ 服务 message；
 * 请求级拒收 = typed error 归一。
 */
export async function runEntryMetaEdit(
  client: ForgeRpcClient,
  projectId: string,
  entryId: number,
  draft: KnEditDraft,
): Promise<EntryActionOutcome> {
  try {
    const receipt = await client.knowledge.entryAction({
      projectId,
      action: 'editMeta',
      entryIds: [entryId],
      title: draft.title.trim(),
      keywords: draft.keywords.map((keyword) => keyword.trim()).filter((keyword) => keyword !== ''),
      summary: draft.summary,
      body: draft.body,
    })
    for (const result of receipt.results) {
      if (result.outcome === 'failure') {
        return { ok: false, message: `${entryActionFailureText(result.code)}（${result.message}）` }
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mapBrowseError(error).message }
  }
}

/**
 * 单条裁决执行（纯异步面）：dialog 标题栏 通过/驳回 与卡片 chip/批量同一通道收敛
 * （forge:knowledge/entryAction confirm/reject——副作用语义逐位一致）。
 */
export async function runEntryVerdict(
  client: ForgeRpcClient,
  projectId: string,
  action: 'confirm' | 'reject',
  entryId: number,
): Promise<EntryActionOutcome> {
  try {
    const receipt = await client.knowledge.entryAction({ projectId, action, entryIds: [entryId] })
    for (const result of receipt.results) {
      if (result.outcome === 'failure') {
        return { ok: false, message: `${entryActionFailureText(result.code)}（${result.message}）` }
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: mapBrowseError(error).message }
  }
}

/** 详情相位（error 附载 BrowseErrorInfo——rpcUiState 三态映射同浏览面） */
export type EntryDrawerPhase = 'loading' | 'ready' | 'error'

/** 弹窗状态（hook 输出——EntryDrawerBody 消费形状） */
export interface EntryDrawerState {
  readonly phase: EntryDrawerPhase
  readonly detail: EntryDetail | undefined
  readonly error: BrowseErrorInfo | undefined
}

/** 元数据行值（渲染选型：状态 → StateChip；关键词 → Tag info chips；其余文本原样） */
export type EntryMetaValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'status'; readonly status: string }
  | { readonly kind: 'keywords'; readonly keywords: readonly string[] }

/**
 * 元数据行（span = 关键词独占整行——四列同行刻度：域/状态/作者/更新时间一行四格，
 * 关键词第二行整行——用户裁决）
 */
export interface EntryMetaRow {
  readonly key: 'domain' | 'status' | 'authors' | 'updated' | 'keywords'
  readonly label: string
  readonly span: boolean
  readonly value: EntryMetaValue
}

/**
 * 元数据行投影（纯函数）：首区四列同行（域/状态/作者/更新时间）+ 关键词整行；
 * 空域回退「根」（与卡片行语言同口径）、authors 缺省「—」、更新时间 = 本地时刻
 * `YYYY-MM-DD HH:mm`（用户裁决 localdatetime——不用相对时间标签）。
 */
export function entryMetaRows(detail: EntryDetail, _now: number): readonly EntryMetaRow[] {
  return [
    {
      key: 'domain',
      label: '域',
      span: false,
      value: { kind: 'text', text: detail.domainPath === '' ? '根' : detail.domainPath },
    },
    { key: 'status', label: '状态', span: false, value: { kind: 'status', status: detail.status } },
    { key: 'authors', label: '作者', span: false, value: { kind: 'text', text: detail.authors ?? '—' } },
    {
      key: 'updated',
      label: '更新时间',
      span: false,
      value: { kind: 'text', text: localDateTimeOf(detail.updated) },
    },
    {
      key: 'keywords',
      label: '关键词',
      span: true,
      value: { kind: 'keywords', keywords: detail.keywords },
    },
  ]
}

/** ISO-8601 → 本地时刻 `YYYY-MM-DD HH:mm`（非法/缺席 = 原样回退——fullStampOf 同防御形） */
export function localDateTimeOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 详情拉取结果（ok/error 归一——永不 reject） */
export type EntryDetailFetch =
  | { readonly ok: true; readonly detail: EntryDetail }
  | { readonly ok: false; readonly error: BrowseErrorInfo }

/**
 * 详情按需拉取（纯异步面）：唯一通道 = `forge:knowledge/entryDetail`（Hard Rule——
 * 不预载全库，browse/listEntries/heat 零调用）；typed error 经 mapBrowseError 三态归一。
 */
export async function fetchEntryDetail(
  client: ForgeRpcClient,
  projectId: string,
  entryId: number,
): Promise<EntryDetailFetch> {
  try {
    return { ok: true, detail: await client.knowledge.entryDetail({ projectId, entryId }) }
  } catch (error) {
    return { ok: false, error: mapBrowseError(error) }
  }
}

/** 详情装载 hook（entryId 变更 / 重试重拉；序号守卫防串台——仅最新拉取落点生效；null = 关闭不拉取） */
export function useEntryDetail(
  projectId: string,
  entryId: number | null,
  makeClient: RpcClientFactory = preloadRpcClientFactory,
): readonly [EntryDrawerState, { retry(): void }] {
  const [state, setState] = useState<EntryDrawerState>(initialDrawerState)
  const [nonce, setNonce] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    if (entryId === null) return
    const seq = ++seqRef.current
    setState(initialDrawerState())
    let alive = true
    void fetchEntryDetail(makeClient(), projectId, entryId).then((out) => {
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

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
  }, [])
  return [state, { retry }] as const
}

/** 初始态（拉取在途：骨架相位） */
export function initialDrawerState(): EntryDrawerState {
  return { phase: 'loading', detail: undefined, error: undefined }
}

export interface EntryDrawerBodyProps {
  /** 详情状态（useEntryDetail 输出——全相位可构造，纯渲染面） */
  readonly state: EntryDrawerState
  /** 重试（错误态） */
  readonly retry: () => void
  /** 元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 元数据行值渲染（StateChip / Tag info chips / 文本原样） */
function MetaValue({ value }: { readonly value: EntryMetaValue }): ReactNode {
  if (value.kind === 'status') return <StateChip status={value.status} />
  if (value.kind === 'keywords') {
    return (
      <>
        {value.keywords.map((keyword) => (
          <Tag key={keyword} tone="info">{keyword}</Tag>
        ))}
      </>
    )
  }
  return value.text
}

/** 弹窗骨架（详情拉取在途） */
function DrawerSkeleton(): ReactNode {
  return (
    <div className="dswf-kn-drawer-skeleton" data-dswf-kn-drawer-skeleton="" aria-hidden="true">
      <div className="dswf-kn-drawer-skline is-title" />
      <div className="dswf-kn-drawer-skline is-abs" />
      <div className="dswf-kn-drawer-skline" />
      <div className="dswf-kn-drawer-skline" />
      <div className="dswf-kn-drawer-skline is-long" />
    </div>
  )
}

/** 错误面（rpcUiState 三态：empty-state → 不可用空态；error-bar/banner → 共享 ErrorBar） */
function DrawerError({
  error,
  retry,
}: {
  readonly error: BrowseErrorInfo
  readonly retry: () => void
}): ReactNode {
  if (error.uiState === 'empty-state') {
    return (
      <div className="dswf-kn-drawer-face">
        <EmptyState
          title="知识详情不可用"
          description={error.message}
          action={
            <button type="button" className="dswf-kn-textaction" data-dswf-kn-drawer-retry="" onClick={retry}>
              重试
            </button>
          }
        />
      </div>
    )
  }
  return (
    <div className="dswf-kn-drawer-face">
      <ErrorBar
        className="dswf-kn-error"
        message={`知识详情加载失败：${error.message}`}
        retryClassName="dswf-kn-textaction"
        anchor="data-dswf-kn-error"
        retryAnchor="data-dswf-kn-drawer-retry"
        onRetry={retry}
      />
    </div>
  )
}

/** 详情三区（AC1：元数据表首区 + 摘要块 + Markdown 正文——用户裁决元数据置顶；G2 查看模式零改动） */
function DrawerContent({ detail, now }: { readonly detail: EntryDetail; readonly now: number }): ReactNode {
  const rows = entryMetaRows(detail, now)
  return (
    <div className="dswf-kn-drawer-content">
      <section className="dswf-kn-drawer-metas" aria-label="元数据">
        <div className="dswf-kn-drawer-seclabel">元数据（frontmatter）</div>
        <div className="dswf-kn-drawer-meta" data-dswf-kn-meta="">
          {rows.map((row) => (
            <div
              key={row.key}
              className={row.span ? 'dswf-kn-drawer-mrow is-span' : 'dswf-kn-drawer-mrow'}
              data-dswf-kn-meta-row={row.key}
            >
              <span className="dswf-kn-drawer-mk">{row.label}</span>
              <span className="dswf-kn-drawer-mv">
                <MetaValue value={row.value} />
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="dswf-kn-drawer-summary" data-dswf-kn-summary="" aria-label="摘要">
        <div className="dswf-kn-drawer-seclabel">摘要</div>
        <h2 className="dswf-kn-drawer-title">{detail.title}</h2>
        <p className="dswf-kn-drawer-abs">{detail.summary}</p>
      </section>
      <section className="dswf-kn-drawer-body" data-dswf-kn-body="" aria-label="正文">
        <div className="dswf-kn-drawer-seclabel">正文</div>
        {/* 正文区 = MarkdownDoc 全量渲染（1.8 渲染链退役）；容器 dswf-kn-md-body 持官方同形
         * 刻度组（docs.css 单源——css$7 inset + white-space 重置），纯块级：
         * 滚动所有权归弹窗内容区（dswf-kn-dialog-body overflow-y:auto 既有面不动） */}
        <div className="dswf-kn-md-body">
          <MarkdownDoc text={detail.body} variant="body" labels={MD_PREVIEW_MARKDOWN_LABELS} />
        </div>
      </section>
    </div>
  )
}

/**
 * 详情纯渲染（状态注入——静态可测全相位）：内容体（弹窗壳/头行/关闭钮归装载壳——
 * 本件只呈现三区；data-dswf-kn-drawer 内容锚保留——e2e/召回跳转断言面零改动）。
 */
export function EntryDrawerBody({ state, retry, now }: EntryDrawerBodyProps): ReactNode {
  return (
    <div className="dswf-kn-drawer" data-dswf-kn-drawer="" aria-label="知识详情">
      {state.phase === 'loading' ? (
        <DrawerSkeleton />
      ) : state.phase === 'error' && state.error !== undefined ? (
        <DrawerError error={state.error} retry={retry} />
      ) : state.detail !== undefined ? (
        <DrawerContent detail={state.detail} now={now ?? Date.now()} />
      ) : null}
    </div>
  )
}

// ───────────────── SC-G：编辑模式字段面（专家 dswf-dlg-field 同型——mockup editBody） ─────────────────

/** textarea 行高刻度（专家 AutoTextarea 同款——Body 14/22 官方排版行高） */
const KN_TEXTAREA_LINE_PX = 22
/** 摘要文本域：3 行高（G3——最多 3 行，非自适应） */
const KN_SUMMARY_ROWS = 3
/** 正文文本域（AutoTextarea 同型）：3 行起步、40 行封顶随内容双向增长 */
const KN_BODY_MIN_PX = KN_TEXTAREA_LINE_PX * KN_SUMMARY_ROWS + 2
const KN_BODY_MAX_PX = KN_TEXTAREA_LINE_PX * 40 + 2

/**
 * 自适应 textarea（专家 detail-dialog AutoTextarea 同型：值变化即按 scrollHeight 增高至
 * max 上界，超出滚动兜底——先归零再测量，收缩与增长双向跟随）。
 */
function KnAutoTextarea(props: {
  readonly value: string
  readonly ariaLabel: string
  readonly onChange: (value: string) => void
}): ReactNode {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, KN_BODY_MIN_PX), KN_BODY_MAX_PX)}px`
  }, [props.value])
  return (
    <textarea
      ref={ref}
      className="dswf-kn-edit-textarea"
      aria-label={props.ariaLabel}
      data-dswf-kn-edit-body=""
      rows={1}
      style={{ minHeight: KN_BODY_MIN_PX, maxHeight: KN_BODY_MAX_PX, overflowY: 'auto' }}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

export interface EntryDrawerEditBodyProps {
  /** 现役详情（域只读来源——改域唯一入口 = 域树拖拽） */
  readonly detail: EntryDetail
  /** 编辑草稿（controller 同型 draft——受控件） */
  readonly draft: KnEditDraft
  /** 校验/回执错误（dswf-dlg-err 同型行——留 dialog） */
  readonly errors: KnEditErrors
  /** 保存进行中（busy 门） */
  readonly busy: boolean
  /** 草稿变更（原样上抛归 controller） */
  readonly onChange: (patch: Partial<KnEditDraft>) => void
}

/**
 * 编辑模式字段面（G3 纯渲染——静态可测；chip 放大态编辑 = 组件内局部态，
 * 收口归 commitKnChip 纯函数；✕ 移除事件隔离 stopPropagation）。
 */
export function EntryDrawerEditBody({ detail, draft, errors, busy, onChange }: EntryDrawerEditBodyProps): ReactNode {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const finishChipEdit = useCallback((): void => {
    if (editingIndex === null) return
    onChange({ keywords: commitKnChip(draft.keywords, editingIndex, editingValue) })
    setEditingIndex(null)
    setEditingValue('')
  }, [editingIndex, editingValue, draft.keywords, onChange])
  return (
    <div className="dswf-kn-edit" data-dswf-kn-edit="">
      {/* 首行：域（左半，只读）+ 文档名称/标题（右半，可编辑）同行（用户裁决） */}
      <div className="dswf-kn-edit-domtitle" data-dswf-kn-edit-domtitle="">
        <input
          className="dswf-kn-edit-dom"
          data-dswf-kn-edit-dom=""
          value={`域：${detail.domainPath === '' ? '根' : detail.domainPath}`}
          readOnly
          aria-label="域（只读·改域走域树拖拽）"
          tabIndex={-1}
        />
        <div className="dswf-kn-edit-titlefield">
          <input
            className="dswf-kn-edit-input"
            data-dswf-kn-edit-title=""
            type="text"
            aria-label="文档名称"
            disabled={busy}
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
          {errors.title === undefined ? null : (
            <div className="dswf-kn-dlg-err" data-dswf-kn-dlg-err="">{errors.title}</div>
          )}
        </div>
      </div>
      {/* 关键词 chips：双击编辑 / ✕ 移除（事件隔离）/ ＋ 新增空白 chip 放大态编辑 */}
      <div className="dswf-kn-edit-field" data-dswf-kn-edit-field="keywords">
        <label>关键词（双击 chip 编辑 · ✕ 移除 · ＋ 新增）</label>
        <div className="dswf-kn-edit-chips" data-dswf-kn-edit-chips="">
          {draft.keywords.map((keyword, index) =>
            editingIndex === index ? (
              <input
                key={`edit-${String(index)}`}
                className="dswf-kn-kwedit"
                data-dswf-kn-kwedit=""
                type="text"
                aria-label="编辑关键词"
                autoFocus
                disabled={busy}
                value={editingValue}
                onChange={(event) => setEditingValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') finishChipEdit()
                }}
                onBlur={finishChipEdit}
              />
            ) : (
              <span
                key={keyword === '' ? `blank-${String(index)}` : keyword}
                className="dswf-kn-kwchip"
                data-dswf-kn-kwchip={keyword}
                onDoubleClick={() => {
                  setEditingIndex(index)
                  setEditingValue(keyword)
                }}
              >
                <span className="dswf-kn-kwtext">{keyword}</span>
                <button
                  type="button"
                  className="dswf-kn-kwx"
                  data-dswf-kn-kwx=""
                  aria-label={`移除关键词 ${keyword}`}
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation() // 事件隔离：不触发双击/卡片点击
                    onChange({ keywords: removeKnChip(draft.keywords, index) })
                  }}
                >
                  ✕
                </button>
              </span>
            ),
          )}
          <button
            type="button"
            className="dswf-kn-kwadd"
            data-dswf-kn-kwadd=""
            aria-label="新增关键词"
            disabled={busy}
            onClick={() => {
              const next = insertKnChip(draft.keywords)
              onChange({ keywords: next })
              setEditingIndex(next.length - 1)
              setEditingValue('')
            }}
          >
            ＋
          </button>
        </div>
      </div>
      {/* 摘要 = 3 行文本域（G3） */}
      <div className="dswf-kn-edit-field" data-dswf-kn-edit-field="summary">
        <label>摘要（最多 3 行）</label>
        <textarea
          className="dswf-kn-edit-textarea is-summary"
          data-dswf-kn-edit-summary=""
          aria-label="摘要"
          rows={KN_SUMMARY_ROWS}
          disabled={busy}
          value={draft.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </div>
      {/* 正文 = 随内容增长文本域（AutoTextarea 同型） */}
      <div className="dswf-kn-edit-field" data-dswf-kn-edit-field="body">
        <label>正文（Markdown · 弹窗内尽量撑满）</label>
        <KnAutoTextarea value={draft.body} ariaLabel="正文" onChange={(value) => onChange({ body: value })} />
      </div>
      {/* 保存回执错误行（dswf-dlg-err 同型——错误留 dialog） */}
      {errors.form === undefined ? null : (
        <div className="dswf-kn-dlg-err" data-dswf-kn-dlg-err="form">{errors.form}</div>
      )}
    </div>
  )
}

// ───────────────── SC-G：标题栏描边钮组（head-actions 右置——与多选功能组同刻度） ─────────────────

export interface EntryDrawerHeadActionsProps {
  /** dialog 模式（查看态 = 编辑/通过/驳回；编辑态 = 保存） */
  readonly mode: KnDialogMode
  /** 条目状态（通过/驳回钮仅 unconfirmed 在场——可点性与状态同源） */
  readonly status: string
  /** 动作进行中（busy 门防重复提交） */
  readonly busy: boolean
  /** 失靶守卫（详情不可用 = stale——全钮禁用） */
  readonly stale: boolean
  readonly onStartEdit: () => void
  readonly onSave: () => void
  readonly onConfirm: () => void
  readonly onReject: () => void
}

/** 标题栏右侧按钮（实线描边胶囊钮——dswf-kn-act 同刻度语义色；无 footer 动作区） */
export function EntryDrawerHeadActions({
  mode,
  status,
  busy,
  stale,
  onStartEdit,
  onSave,
  onConfirm,
  onReject,
}: EntryDrawerHeadActionsProps): ReactNode {
  const disabled = busy || stale
  if (mode === 'edit') {
    return (
      <span className="dswf-kn-dialog-actions" data-dswf-kn-dialog-actions="">
        <Pill className="dswf-kn-act is-accent" data-dswf-kn-dialog-save="" disabled={disabled} onClick={onSave}>
          保存
        </Pill>
      </span>
    )
  }
  const rejectable = status === 'unconfirmed'
  return (
    <span className="dswf-kn-dialog-actions" data-dswf-kn-dialog-actions="">
      {rejectable ? (
        <>
          <Pill className="dswf-kn-act is-accent" data-dswf-kn-dialog-confirm="" disabled={disabled} onClick={onConfirm}>
            通过
          </Pill>
          <Pill className="dswf-kn-act is-error" data-dswf-kn-dialog-reject="" disabled={disabled} onClick={onReject}>
            驳回
          </Pill>
        </>
      ) : null}
      <Pill className="dswf-kn-act" data-dswf-kn-dialog-edit="" disabled={disabled} onClick={onStartEdit}>
        编辑
      </Pill>
    </span>
  )
}

// ───────────────── controller 同型状态机（mode/draft/errors/busy/toast/stale + escNext 链） ─────────────────

/** Toast 自动消失时长（专家 detail-source 同值 3s——一次性提示不自留） */
const KN_TOAST_MS = 3000

/** 空草稿（detail 缺席兜底——不渲染编辑体，仅型位占位） */
const KN_EMPTY_DRAFT: KnEditDraft = { title: '', keywords: [], summary: '', body: '' }

/** dialog 动作依赖（controller 注入面——测试可换 RPC 真身） */
interface KnDialogActionDeps {
  readonly projectId: string
  readonly detail: EntryDetail | undefined
  readonly makeClient: RpcClientFactory
  readonly onClose: () => void
  /** 保存成功后详情重拉（版本链前进后呈现新值） */
  readonly refetch: () => void
}

/** dialog controller 输出面（controller 同型消费形状） */
interface KnDialogController {
  readonly mode: KnDialogMode
  readonly draft: KnEditDraft
  readonly errors: KnEditErrors
  readonly busy: boolean
  readonly toast: string | undefined
  readonly rejectConfirming: boolean
  startEdit(): void
  cancelEdit(): void
  updateDraft(patch: Partial<KnEditDraft>): void
  save(): void
  confirmEntry(): void
  requestReject(): void
  cancelReject(): void
  confirmReject(): void
}

/**
 * dialog controller hook（专家 detail-source 同型：mode/draft/errors/busy/toast 状态机 +
 * busy 门防重复提交 + toast 3s 自灭；stale 由装配面派生注入 HeadActions）。
 * 保存/裁决 = entryAction 执行面（runEntryMetaEdit / runEntryVerdict）；保存成功回查看
 * 模式 + toast + 详情重拉；校验/回执错误留 dialog（errors.form）。
 */
function useKnDialogController(deps: KnDialogActionDeps): KnDialogController {
  const { projectId, detail, makeClient, onClose, refetch } = deps
  const [mode, setMode] = useState<KnDialogMode>('view')
  const [draft, setDraft] = useState<KnEditDraft>(KN_EMPTY_DRAFT)
  const [errors, setErrors] = useState<KnEditErrors>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | undefined>(undefined)
  const [rejectConfirming, setRejectConfirming] = useState(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // detail 换代（打开新条目/保存后重拉）→ 状态机随代重置（controller 同型「随代重置」）
  useEffect(() => {
    setMode('view')
    setErrors({})
    setBusy(false)
    setRejectConfirming(false)
    setDraft(detail === undefined ? KN_EMPTY_DRAFT : initialKnEditDraft(detail))
  }, [detail])

  // toast 3s 自动消失（单飞——新 toast 出场即重置）
  const showToast = useCallback((text: string): void => {
    setToast(text)
    if (toastTimerRef.current !== undefined) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => (current === text ? undefined : current))
    }, KN_TOAST_MS)
  }, [])
  useEffect(() => () => {
    if (toastTimerRef.current !== undefined) clearTimeout(toastTimerRef.current)
  }, [])

  const startEdit = useCallback((): void => {
    setErrors({})
    setMode('edit')
  }, [])
  const cancelEdit = useCallback((): void => {
    // 未保存草稿丢弃零写盘（J3 边界⑥）——回查看即弃
    setErrors({})
    setMode('view')
  }, [])
  const updateDraft = useCallback((patch: Partial<KnEditDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const save = useCallback((): void => {
    const target = detail
    if (target === undefined || busy) return
    const localErrors = validateKnEditDraft(draft)
    if (localErrors.title !== undefined) {
      setErrors(localErrors) // 校验错误留 dialog（G6）
      return
    }
    setErrors({})
    setBusy(true)
    void runEntryMetaEdit(makeClient(), projectId, target.entryId, draft).then((out) => {
      setBusy(false)
      if (!out.ok) {
        setErrors({ form: `保存失败：${out.message}` })
        return
      }
      setMode('view')
      showToast('已保存')
      refetch()
    })
  }, [detail, busy, draft, makeClient, projectId, refetch, showToast])

  const confirmEntry = useCallback((): void => {
    const target = detail
    if (target === undefined || busy) return
    setBusy(true)
    void runEntryVerdict(makeClient(), projectId, 'confirm', target.entryId).then((out) => {
      setBusy(false)
      if (!out.ok) {
        showToast(`操作失败：${out.message}`)
        return
      }
      onClose() // 通过成功 → 关闭回浏览上下文（重拉归装配方既有链）
    })
  }, [detail, busy, makeClient, projectId, onClose, showToast])

  const confirmReject = useCallback((): void => {
    const target = detail
    if (target === undefined || busy) return
    setRejectConfirming(false)
    setBusy(true)
    void runEntryVerdict(makeClient(), projectId, 'reject', target.entryId).then((out) => {
      setBusy(false)
      if (!out.ok) {
        showToast(`操作失败：${out.message}`)
        return
      }
      onClose() // 驳回 = 条目删除（不可逆）→ dialog 关闭
    })
  }, [detail, busy, makeClient, projectId, onClose, showToast])

  const requestReject = useCallback((): void => {
    setRejectConfirming(true)
  }, [])
  const cancelReject = useCallback((): void => {
    setRejectConfirming(false) // 取消 = 零动作（G7）
  }, [])

  return {
    mode,
    draft,
    errors,
    busy,
    toast,
    rejectConfirming,
    startEdit,
    cancelEdit,
    updateDraft,
    save,
    confirmEntry,
    requestReject,
    cancelReject,
    confirmReject,
  }
}

/** 缘侧拖宽手柄（任务弹窗 DrawerResizeHandle 同构——指针捕获拖宽 + 键盘 ←→ 步进 + 双击复位） */
function KnResizeHandle({
  edge,
  onDragStart,
  onDragMove,
  onDragEnd,
  onStepWidth,
  onResetWidth,
}: {
  readonly edge: DrawerResizeEdge
  readonly onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void
  readonly onDragMove: (clientX: number, clientY: number) => void
  readonly onDragEnd: () => void
  readonly onStepWidth: (delta: number) => void
  readonly onResetWidth: () => void
}): ReactNode {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onStepWidth(edge === 'left' ? -32 : 32)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onStepWidth(edge === 'left' ? 32 : -32)
    }
  }
  return (
    // D30：原生 title 退役——官方 Tooltip（portal 逃逸弹窗 transform/层叠上下文）
    <Tooltip label="拖动调宽 · 双击复位" portal>
      <div
        className="dswf-kn-dialog-resize"
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-label={edge === 'left' ? '拖动调整弹窗宽度（左缘）' : '拖动调整弹窗宽度（右缘）'}
        data-dswf-kn-dialog-resize={edge}
        onKeyDown={handleKeyDown}
        onDoubleClick={onResetWidth}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          onDragStart(edge === 'left' ? 'resize-left' : 'resize-right', event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if ((event.buttons & 1) === 0) return // 仅主键按住拖拽（悬停移动不触发）
          onDragMove(event.clientX, event.clientY)
        }}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />
    </Tooltip>
  )
}

export interface EntryDrawerProps {
  /** 当前项目 id（详情查询范围） */
  readonly projectId: string
  /** 打开条目（null = 关闭不渲染；3.8 召回 tab 跳转复用同参数计） */
  readonly entryId: number | null
  /** 关闭（Esc / ✕）——浏览上下文归装配方持有（本件不触碰过滤态） */
  readonly onClose: () => void
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
  /** 元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 拖移会话快照（move / resize 双形态——起点几何归装载壳本地态，关闭即弃） */
interface KnDragSession {
  readonly kind: TaskDrawerDragKind
  readonly startClientX: number
  readonly startClientY: number
  readonly startLeft: number
  readonly startTop: number
  readonly startWidth: number
}

/**
 * 详情弹窗装载壳（3.8 装配挂知识浏览视图；onEntryOpen(entryId) → entryId 态）。
 * 可拖移 + 缘侧可拉伸（用户裁决——bug-dialog/任务弹窗同机械：标题栏拖移 +
 * 左右缘拖宽，位/宽逐开本地态关闭即弃）；首帧 = 弹窗壳 + 骨架（详情按需拉取不阻塞呈现）。
 * SC-G（1.8）：双模式 controller（Esc 链 编辑→查看→关闭，capture 同现役序）+
 * head-actions 右置描边钮组 + 驳回官方 Modal 叠层 + toast 面。
 */
export function EntryDrawer({ projectId, entryId, onClose, makeClient = preloadRpcClientFactory, now }: EntryDrawerProps): ReactNode {
  const [state, { retry }] = useEntryDetail(projectId, entryId, makeClient)
  const controller = useKnDialogController({
    projectId,
    detail: state.detail,
    makeClient,
    onClose,
    refetch: retry,
  })
  const [width, setWidth] = useState(KN_DIALOG_WIDTH_DEFAULT)
  const widthRef = useRef(KN_DIALOG_WIDTH_DEFAULT)
  const [position, setPosition] = useState<DrawerModalPosition | null>(null)
  const positionRef = useRef<DrawerModalPosition | null>(null)
  const dragRef = useRef<KnDragSession | null>(null)

  // Esc 链式退场（escNext 同款：编辑 → 查看 → 关闭）——capture 阶段（弹窗先于工具栏清空）
  const modeRef = useRef(controller.mode)
  modeRef.current = controller.mode
  useEffect(() => {
    if (entryId === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (escNextKn(modeRef.current) === 'back-to-view') {
        controller.cancelEdit()
        return
      }
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [entryId, onClose, controller])

  const applyGeometry = useCallback((next: { width: number; position: DrawerModalPosition }): void => {
    widthRef.current = next.width
    setWidth(next.width)
    positionRef.current = next.position
    setPosition(next.position)
  }, [])

  const handleDragStart = useCallback(
    (kind: TaskDrawerDragKind, clientX: number, clientY: number): void => {
      const startWidth = widthRef.current
      const start =
        positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, startWidth)
      if (positionRef.current === null) {
        positionRef.current = start
        setPosition(start)
      }
      dragRef.current = {
        kind,
        startClientX: clientX,
        startClientY: clientY,
        startLeft: start.left,
        startTop: start.top,
        startWidth,
      }
    },
    [],
  )
  const handleDragMove = useCallback(
    (clientX: number, clientY: number): void => {
      const drag = dragRef.current
      if (drag === undefined || drag === null) return
      if (drag.kind === 'move') {
        const next = drawerPositionFromDrag(
          { left: drag.startLeft, top: drag.startTop },
          drag.startClientX,
          drag.startClientY,
          clientX,
          clientY,
          window.innerWidth,
          window.innerHeight,
          widthRef.current,
        )
        positionRef.current = next
        setPosition(next)
        return
      }
      const edge: DrawerResizeEdge = drag.kind === 'resize-left' ? 'left' : 'right'
      const nextWidth = drawerWidthFromEdgeDrag(edge, drag.startWidth, drag.startClientX, clientX, window.innerWidth)
      const clamped = clampKnDialogWidth(nextWidth, window.innerWidth)
      // 对侧锚定：左缘拖宽 = 右缘不动（左随宽补）；右缘拖宽 = 左缘不动（任务弹窗同刻度）
      applyGeometry({
        width: clamped,
        position: {
          left: edge === 'left' ? drag.startLeft + (drag.startWidth - clamped) : drag.startLeft,
          top: drag.startTop,
        },
      })
    },
    [applyGeometry],
  )
  const handleDragEnd = useCallback((): void => {
    dragRef.current = null
  }, [])
  const dragProps = taskDrawerHeadDragProps(handleDragStart, handleDragMove, handleDragEnd)
  // 键盘步进（←/→ ±32——方向由手柄缘侧定向归 KnResizeHandle，钳制内应用）
  const stepWidth = useCallback(
    (delta: number): void => {
      const start =
        positionRef.current ?? defaultDrawerPosition(window.innerWidth, window.innerHeight, widthRef.current)
      const clamped = clampKnDialogWidth(widthRef.current + delta, window.innerWidth)
      applyGeometry({ width: clamped, position: { left: start.left, top: start.top } })
    },
    [applyGeometry],
  )
  const resetWidth = useCallback((): void => {
    applyGeometry({
      width: KN_DIALOG_WIDTH_DEFAULT,
      position: positionRef.current ?? { left: 0, top: 0 },
    })
  }, [applyGeometry])

  if (entryId === null) return null
  const ready = state.phase === 'ready' && state.detail !== undefined
  return (
    <aside
      className="dswf-kn-dialog"
      role="dialog"
      aria-label="知识详情"
      style={{ width: `${width}px`, ...(position !== null ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'none' } : {}) }}
      data-dswf-kn-dialog=""
    >
      <div className="dswf-kn-dialog-head" data-dswf-kn-dialog-head="" {...dragProps}>
        <span>知识详情</span>
        <span className="dswf-kn-dialog-spacer" />
        {ready && state.detail !== undefined ? (
          <EntryDrawerHeadActions
            mode={controller.mode}
            status={state.detail.status}
            busy={controller.busy}
            stale={false}
            onStartEdit={controller.startEdit}
            onSave={controller.save}
            onConfirm={controller.confirmEntry}
            onReject={controller.requestReject}
          />
        ) : null}
        <Button variant="ghost" size="sm" className="dswf-kn-dialog-close" data-dswf-kn-dialog-close="" aria-label="关闭弹窗" onClick={onClose}>
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      <KnResizeHandle edge="left" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={stepWidth} onResetWidth={resetWidth} />
      <KnResizeHandle edge="right" onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onStepWidth={stepWidth} onResetWidth={resetWidth} />
      <div className="dswf-kn-dialog-body">
        {ready && state.detail !== undefined && controller.mode === 'edit' ? (
          <div className="dswf-kn-drawer" data-dswf-kn-drawer="" aria-label="知识编辑">
            <EntryDrawerEditBody
              detail={state.detail}
              draft={controller.draft}
              errors={controller.errors}
              busy={controller.busy}
              onChange={controller.updateDraft}
            />
          </div>
        ) : (
          <EntryDrawerBody state={state} retry={retry} now={now} />
        )}
      </div>
      {controller.toast === undefined ? null : (
        <div className="dswf-kn-toast" role="status" data-dswf-kn-toast="">
          {controller.toast}
        </div>
      )}
      {/* 驳回确认（G7）：官方 Modal（SessionArchiveConfirmDialog 同型——清单+数量）从 dialog
       * 之上正确叠层（官方 Modal 栈 portal）；取消 = 零动作 */}
      {state.detail === undefined ? null : (
        <Modal
          open={controller.rejectConfirming}
          onClose={controller.cancelReject}
          title="驳回 1 条待审核条目？"
          description="驳回将删除条目文件（不可逆），已确认条目不受影响。"
          closeLabel="关闭"
          className="dswf-kn-reject-modal"
          footer={
            <>
              <Button
                variant="outline"
                onClick={controller.cancelReject}
              >
                取消
              </Button>
              <Button
                variant="primary"
                data-modal-autofocus=""
                onClick={controller.confirmReject}
              >
                确认驳回
              </Button>
            </>
          }
        >
          <span>
            将驳回「{state.detail.title}」（{state.detail.domainPath === '' ? '根' : state.detail.domainPath}）并删除其文件。
          </span>
        </Modal>
      )}
    </aside>
  )
}
