// Bug 台账右栏预览件（定位：业务视图——composer-bug-reference 1.3）：消息中 bug chip
// 点击 → source.openReference 官方路由 → 本件作为 `sidebar.right.pane.tab` keyed
// 'dswf-bug' 占用者呈现（multiple + 地址去重——同 dswf-doc 资源型先例，plugin.ts 同源
// 登记面）。数据 = bugs.list 现查（openReference 时点非 pick 时点——预览恒见最新台账）；
// 查询失败/未命中 = 缺省态不崩溃。投影 = BugCard 全量：摘要行 + 状态·错误类型徽标 +
// 五字段 kv 区（Bug/Trigger/Expected/Actual/Suspected）+ 三分支——fixed 证据区
// commit/worktree/branch、unresolved 未修原因、open 无证据区。样式沿 bug-dialog.css
// 行语言（双列表单 + 官方令牌，dswf-br-* 自持皮——pane 体非 dialog，零拖移壳）。
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BUG_STATUS_LABELS, type BugCard } from '@dsh-forge/contracts'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { EmptyState } from '../../components/index.js'
import { preloadRpcClientFactory, type RpcClientFactory } from '../../rpc/index.js'
import { TabInfoReader, type UseDockTabInfoMirror } from '../../workbench/dock-tabs.js'
import './bug-preview.css'

/** Bug 台账 tab 类型 kind（= keyed body dispatch 键；plugin.ts BUG_TAB_KIND 字面量同源镜像） */
export const DSWF_BUG_TAB_KIND = 'dswf-bug'
/** Bug 台账资源地址前缀（dsh-resource:// 资源面——plugin.ts BUG_ADDRESS_PREFIX 字面量同源镜像） */
export const DSWF_BUG_ADDRESS_PREFIX = `dsh-resource://${DSWF_BUG_TAB_KIND}/`

/** Bug tab 地址（= 去重键 contentId：同 projectId+bugId 同 tab、异地址新开） */
export function forgeBugAddress(projectId: string, bugId: string): string {
  return `${DSWF_BUG_ADDRESS_PREFIX}${projectId}/${bugId}`
}

/** Bug tab 地址解析（纯函数）：前缀 + `<projectId>/<bugId>`；形状非法 → null（缺省态） */
export function parseForgeBugAddress(
  address: string,
): { readonly projectId: string; readonly bugId: string } | null {
  if (!address.startsWith(DSWF_BUG_ADDRESS_PREFIX)) return null
  const rest = address.slice(DSWF_BUG_ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash <= 0 || slash === rest.length - 1) return null
  return { projectId: rest.slice(0, slash), bugId: rest.slice(slash + 1) }
}

/** 五字段 kv 行序（bug-dialog KV_FIELDS 同构——提案线框 Bug → Trigger → Expected → Actual → Suspected） */
const KV_FIELDS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'expected', label: 'Expected' },
  { key: 'actual', label: 'Actual' },
  { key: 'suspected', label: 'Suspected' },
]

function kvValueOf(bug: BugCard, key: string): string {
  switch (key) {
    case 'bug':
      return bug.bugDesc
    case 'trigger':
      return bug.triggerDesc
    case 'expected':
      return bug.expected
    case 'actual':
      return bug.actual
    default:
      return bug.suspected ?? '—'
  }
}

/** 双列表单行（bug-dialog FormRow 同构——dswf-br-* 命名域） */
function Row({ label, kv, data, children }: { readonly label: string; readonly kv?: string; readonly data?: string; readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="dswf-br-row"
      {...(kv !== undefined ? { 'data-dswf-br-kv': kv } : {})}
      {...(data !== undefined ? { [`data-dswf-br-${data}`]: '' } : {})}
    >
      <span className="dswf-br-label">{label}</span>
      <span className="dswf-br-value">{children}</span>
    </div>
  )
}

/** 台账加载态（loading = 现查在途 / error = 查询失败 / missing = 未命中 / ready = 全量投影） */
interface BugLoad {
  readonly phase: 'loading' | 'error' | 'missing' | 'ready'
  readonly bug?: BugCard
}

/**
 * 全量投影（BugCard 全量——摘要行 + 状态·错误类型徽标 + 五字段 kv + 三分支；导出面 =
 * renderToStaticMarkup 分支直测——全仓零 effect 口径）。
 */
export function BugPreviewReady({ bug }: { readonly bug: BugCard }): ReactNode {
  return (
    <aside className="dswf-br" data-dswf-br="" data-dswf-br-id={bug.bugId}>
      <div className="dswf-br-summaryline">
        <span className="dswf-br-summarytext" data-dswf-br-summary="">{bug.summary}</span>
        <span className="dswf-br-chips">
          <span data-dswf-br-status={bug.bugStatus}>
            <Tag tone="neutral">{BUG_STATUS_LABELS[bug.bugStatus].zh}</Tag>
          </span>
          {bug.errorType !== undefined ? (
            <span data-dswf-br-type={bug.errorType}>
              <Tag tone="neutral">{bug.errorType}</Tag>
            </span>
          ) : null}
        </span>
      </div>
      {KV_FIELDS.map(({ key, label }) => (
        <Row key={key} label={label} kv={key}>
          {kvValueOf(bug, key)}
        </Row>
      ))}
      {bug.bugStatus === 'fixed' ? (
        <Row label="修复证据" data="evidence">
          {[
            ...(bug.commitHash !== undefined ? [`commit ${bug.commitHash}`] : []),
            ...(bug.worktree !== undefined ? [`worktree ${bug.worktree}`] : []),
            ...(bug.branch !== undefined ? [`branch ${bug.branch}`] : []),
          ].join(' · ') || '—'}
        </Row>
      ) : null}
      {bug.bugStatus === 'unresolved' && bug.unresolvedReason !== undefined ? (
        <Row label="未修原因" data="unresolved">
          {bug.unresolvedReason}
        </Row>
      ) : null}
    </aside>
  )
}

/** 缺省态（查询失败 / 未命中——pane 不崩溃，导出面 = 静态直测同上） */
export function BugPreviewUnavailable({ missing }: { readonly missing: boolean }): ReactNode {
  return (
    <div className="dswf-br" data-dswf-br-error="">
      <EmptyState
        className="dswf-ov-dock-empty"
        title="台账暂不可用"
        description={missing ? '该 bug 不在当前台账中——可能已被清理。' : '查询失败——稍后从消息中的 bug 引用重新打开。'}
      />
    </div>
  )
}

/** 预览体：地址解析 → bugs.list 现查（时点 = openReference 开出时刻）→ 三分支投影 */
function BugPreviewBody({ contentId, makeClient }: { readonly contentId: string; readonly makeClient?: RpcClientFactory }): ReactNode {
  const parsed = parseForgeBugAddress(contentId)
  const clientFactory = makeClient ?? preloadRpcClientFactory
  const [load, setLoad] = useState<BugLoad>({ phase: 'loading' })
  const seqRef = useRef(0)
  useEffect(() => {
    if (parsed === null) return
    const seq = ++seqRef.current
    setLoad({ phase: 'loading' })
    let alive = true
    void clientFactory()
      .bugs.list({ projectId: parsed.projectId })
      .then((bugs) => {
        if (!alive || seq !== seqRef.current) return
        const found = bugs.find((bug) => bug.bugId === parsed.bugId)
        setLoad(found === undefined ? { phase: 'missing' } : { phase: 'ready', bug: found })
      })
      .catch(() => {
        if (alive && seq === seqRef.current) setLoad({ phase: 'error' })
      })
    return () => {
      alive = false
    }
  }, [contentId, clientFactory])
  if (parsed === null) {
    return (
      <div data-dswf-br-invalid="">
        <EmptyState
          className="dswf-ov-dock-empty"
          title="Bug 地址无效"
          description="该 tab 携带的 bug 地址无法解析——关闭后从消息中的 bug 引用重新打开。"
        />
      </div>
    )
  }
  if (load.phase === 'loading') {
    return (
      <div className="dswf-br" data-dswf-br-loading="">
        加载中…
      </div>
    )
  }
  if (load.phase !== 'ready' || load.bug === undefined) return <BugPreviewUnavailable missing={load.phase === 'missing'} />
  return <BugPreviewReady bug={load.bug} />
}

/**
 * Bug 台账 tab body（`sidebar.right.pane.tab` keyed 'dswf-bug' 占用者——product-views
 * 发布件）：tabInfo 读取 contentId（= 开出地址）→ 现查投影。useTabInfo 缺席（非壳载体
 * /SSR 单测）= null（生产面 seat inject 恒递达——ForgeDocsTab 同径）。
 */
export interface ForgeBugPreviewProps {
  /** 官方 tabInfo 钩子（seat inject 递达——contentId 读取源） */
  readonly useTabInfo?: UseDockTabInfoMirror
  /** RPC client 构造器（缺省 preload 真身；注入 = 测试面） */
  readonly makeClient?: RpcClientFactory
}

export function ForgeBugPreview({ useTabInfo, makeClient }: ForgeBugPreviewProps): ReactNode {
  if (useTabInfo === undefined) return null
  return (
    <TabInfoReader hook={useTabInfo}>
      {(info) => <BugPreviewBody contentId={info.tab.contentId} makeClient={makeClient} />}
    </TabInfoReader>
  )
}
