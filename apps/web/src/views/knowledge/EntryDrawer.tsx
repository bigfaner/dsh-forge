// 知识详情抽屉（定位：业务——UF-6 抽屉部分：摘要块 + 两列元数据 + Markdown 正文）。
// 组装分工沿 3.6 形制：EntryDrawer（装载壳——hook + Esc 接线）持有 useEntryDetail
// （正文按需读取），EntryDrawerBody（纯渲染——全相位 renderToStaticMarkup 可测）呈现三区。
// Hard Rules：
//   - Markdown 渲染只经 MarkdownDoc（不可信内容沙淀纪律——正文区 variant=body，裸渲染器禁直用）；
//   - 正文按需读取（getEntryDetail 唯一通道），不预载全库（browse/listEntries/heat 零调用）。
// 打开参数按 entryId 设计（Implementation Notes）——3.8 召回 tab 分组行跳转复用同门。
// AC3 关闭回浏览上下文（过滤态保持）：本件不触碰浏览过滤态（旁挂层， onClose 上抛归装配方）；
// Esc 捕获序 = 抽屉先于工具栏清空（原型同序：drawer → kb-clear），stopPropagation 防串关。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconCloseFillRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EntryDetail } from '@dsh-forge/contracts'
import { EmptyState, MarkdownDoc, StateChip } from '../../components/index.js'
import { createForgeRpcClient, preloadTransport, type ForgeRpcClient } from '../../rpc/index.js'
import { cardTimeLabel } from './browse-model.js'
import { isEscapeKey } from './KnowledgeToolbar.js'
import { mapBrowseError, type BrowseErrorInfo, type RpcClientFactory } from './use-knowledge-browse.js'
import './knowledge.css'

/** 详情相位（error 附载 BrowseErrorInfo——rpcUiState 三态映射同浏览面） */
export type EntryDrawerPhase = 'loading' | 'ready' | 'error'

/** 抽屉状态（hook 输出——EntryDrawerBody 消费形状） */
export interface EntryDrawerState {
  readonly phase: EntryDrawerPhase
  readonly detail: EntryDetail | undefined
  readonly error: BrowseErrorInfo | undefined
}

/** 元数据行值（渲染选型：状态 → StateChip；关键词 → Tag chips；其余文本原样） */
export type EntryMetaValue =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'status'; readonly status: string }
  | { readonly kind: 'keywords'; readonly keywords: readonly string[] }

/** 两列元数据行（span = 长值独占整行——原型 kd-meta-table .span2 刻度） */
export interface EntryMetaRow {
  readonly key: 'domain' | 'status' | 'keywords' | 'authors' | 'updated'
  readonly label: string
  readonly span: boolean
  readonly value: EntryMetaValue
}

/**
 * 元数据行投影（纯函数）：frontmatter 元数据（域/状态/关键词/作者/更新时间）按
 * 原型基秩序行——域/状态/作者/更新时间半行两列排布，关键词独占整行；
 * 空域回退「根」（与卡片行语言同口径）、authors 缺省「—」、更新时间 = 相对时间标签。
 */
export function entryMetaRows(detail: EntryDetail, now: number): readonly EntryMetaRow[] {
  return [
    {
      key: 'domain',
      label: '域',
      span: false,
      value: { kind: 'text', text: detail.domainPath === '' ? '根' : detail.domainPath },
    },
    { key: 'status', label: '状态', span: false, value: { kind: 'status', status: detail.status } },
    {
      key: 'keywords',
      label: '关键词',
      span: true,
      value: { kind: 'keywords', keywords: detail.keywords },
    },
    { key: 'authors', label: '作者', span: false, value: { kind: 'text', text: detail.authors ?? '—' } },
    {
      key: 'updated',
      label: '更新时间',
      span: false,
      value: { kind: 'text', text: cardTimeLabel(detail.updated, now) },
    },
  ]
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
  makeClient: RpcClientFactory = defaultClient,
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

/**
 * Esc 关闭接线（capture 阶段）：抽屉在场时 Esc 归抽屉（原型关闭序：菜单 → 对话框 → 抽屉），
 * stopPropagation 拦截冒泡至工具栏输入（防「关抽屉连带清空关键词」——AC3 浏览上下文保持）。
 */
export function useEntryDrawerEscape(entryId: number | null, onClose: () => void): void {
  useEffect(() => {
    if (entryId === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEscapeKey(event.key)) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [entryId, onClose])
}

export interface EntryDrawerBodyProps {
  /** 抽屉状态（useEntryDetail 输出——全相位可构造，纯渲染面） */
  readonly state: EntryDrawerState
  /** 关闭（✕ / Esc——上抛装配方，浏览上下文归装配方持有） */
  readonly onClose: () => void
  /** 重试（错误态） */
  readonly retry: () => void
  /** 元数据时间标签基准（缺省当次渲染时刻） */
  readonly now?: number
}

/** 元数据行值渲染（StateChip / Tag chips / 文本原样） */
function MetaValue({ value }: { readonly value: EntryMetaValue }): ReactNode {
  if (value.kind === 'status') return <StateChip status={value.status} />
  if (value.kind === 'keywords') {
    return (
      <>
        {value.keywords.map((keyword) => (
          <Tag key={keyword} tone="outline" className="dswf-kn-key">{`#${keyword}`}</Tag>
        ))}
      </>
    )
  }
  return value.text
}

/** 抽屉骨架（详情拉取在途） */
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

/** 错误面（rpcUiState 三态：empty-state → 不可用空态；error-bar/banner → 错误条） */
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
      <div className="dswf-kn-error" data-dswf-kn-error="" role="alert">
        <span>{`知识详情加载失败：${error.message}`}</span>
        <button type="button" className="dswf-kn-retry" data-dswf-kn-drawer-retry="" onClick={retry}>
          重试
        </button>
      </div>
    </div>
  )
}

/** 详情三区（AC1：摘要块 + 两列元数据 + Markdown 正文） */
function DrawerContent({ detail, now }: { readonly detail: EntryDetail; readonly now: number }): ReactNode {
  const rows = entryMetaRows(detail, now)
  return (
    <div className="dswf-kn-drawer-content">
      <section className="dswf-kn-drawer-summary" data-dswf-kn-summary="" aria-label="摘要">
        <div className="dswf-kn-drawer-seclabel">摘要</div>
        <h2 className="dswf-kn-drawer-title">{detail.title}</h2>
        <p className="dswf-kn-drawer-abs">{detail.summary}</p>
      </section>
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
      <section className="dswf-kn-drawer-body" data-dswf-kn-body="" aria-label="正文">
        <div className="dswf-kn-drawer-seclabel">正文</div>
        <MarkdownDoc text={detail.body} variant="body" />
      </section>
    </div>
  )
}

/**
 * 抽屉纯渲染（状态注入——静态可测全相位）：右侧滑入层（形态对齐官方 dockkit 浮层：
 * 层级令牌 + 抬升面 + 顶栏行尾关闭位，见 knowledge.css）；三区呈现归 DrawerContent。
 */
export function EntryDrawerBody({ state, onClose, retry, now }: EntryDrawerBodyProps): ReactNode {
  return (
    <aside className="dswf-kn-drawer" data-dswf-kn-drawer="" aria-label="知识详情抽屉">
      <div className="dswf-kn-drawer-top">
        <span className="dswf-kn-drawer-toptitle">知识详情</span>
        <Button
          variant="toolbar"
          size="sm"
          className="dswf-kn-drawer-close"
          data-dswf-kn-drawer-close=""
          aria-label="关闭抽屉"
          title="关闭（Esc）"
          onClick={onClose}
        >
          <IconCloseFillRegular size={14} />
        </Button>
      </div>
      {state.phase === 'loading' ? (
        <DrawerSkeleton />
      ) : state.phase === 'error' && state.error !== undefined ? (
        <DrawerError error={state.error} retry={retry} />
      ) : state.detail !== undefined ? (
        <DrawerContent detail={state.detail} now={now ?? Date.now()} />
      ) : null}
    </aside>
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

/**
 * 详情抽屉装载壳（3.8 装配挂知识浏览视图；onEntryOpen(entryId) → entryId 态）。
 * 首帧 = 滑入壳 + 骨架（详情按需拉取不阻塞呈现）。
 */
export function EntryDrawer({ projectId, entryId, onClose, makeClient, now }: EntryDrawerProps): ReactNode {
  useEntryDrawerEscape(entryId, onClose)
  const [state, { retry }] = useEntryDetail(projectId, entryId, makeClient)
  if (entryId === null) return null
  return <EntryDrawerBody state={state} onClose={onClose} retry={retry} now={now} />
}

/** 缺省构造：preload 传输真身（缺席由 mapBrowseError 收敛为错误条——非 Electron 载体不炸壳） */
function defaultClient(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
