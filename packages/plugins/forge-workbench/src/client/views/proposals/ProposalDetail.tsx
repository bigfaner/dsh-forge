/**
 * The UF5 提案详情子视图, BUILD half (task 5.4, ui-design UF5 详情子视图):
 * the subview the 5.5 ProposalsPage carries once it holds a proposal slug —
 * 面包屑(提案看板 / <slug>,root crumb = the return seam)/ slug 16/24 +
 * 状态 Pill + 作者 · created / [proposal][eval] 双 tab(只读 markdown 渲染,
 * 内滚动).
 *
 * Tab matrix (ui-design): eval 缺失 (hasEval=false) renders its tab
 * DISABLED + tooltip 「无评估报告」— never hidden (the two-slot strip is the
 * stable map of what a proposal carries); the proposal tab is always live.
 * Per-tab body states: loading 骨架 / read failure (error 卡 + 重试) / the
 * populated MarkdownView / the empty-document hint.
 *
 * 只读硬约束 (PRD SC6 + Hard Rules): the subview's every interaction is
 * navigation (breadcrumb back, doc tabs) — no edit/transition/delete
 * affordance exists; the doc body renders through the ONE MarkdownView
 * whitelist (禁 raw HTML/脚本/外链离开应用,渲染区无交互元素 — the M2
 * TECH-markdown-001 discipline).
 *
 * 回流 (AC4): the OPEN document re-reads on project-scoped `sync` pushes —
 * the panel element persists across the re-render (same DOM node, new
 * tokens), so its scroll offset survives by construction (详情打开时文件
 * 变更 ≤5s 重渲染,保滚动位置). hasEval/enabled state follows the CURRENT
 * ProposalSummary the page re-reads (the board is the single source — this
 * component never re-reads the board itself).
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ProposalDoc, ProposalSummary } from '../../ipc-types'
import type { ProposalFace } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MarkdownView } from '../../components/common/MarkdownView'
import { createMockProposalsFace } from '../../mocks/workbench'
import { ProposalStatusPill, type ProposalTranslate } from './ProposalStatusPill'

/** The tab strip's selection space. */
type DocTab = 'proposal' | 'eval'

const DOC_TABS: readonly DocTab[] = ['proposal', 'eval']

/** Inputs of {@link ProposalDetail}. */
export interface ProposalDetailProps {
  /** The locale seat (the shell's `t`). */
  t: ProposalTranslate
  /** The active project — the readProposalDoc verb argument. */
  projectId?: string | undefined
  /** The proposal being detailed (the BOARD's row — the single source). */
  proposal: ProposalSummary
  /**
   * The proposals face — absent members fall back to the build-stage mock
   * (a pure READ face; 5.5 injects the IPC face).
   */
  face?: Partial<ProposalFace> | undefined
  /**
   * The return seam — the 5.5 page routes it to the view-key machine's tab
   * action (面包屑返回保列表滚动: the page keeps the list mounted, so the
   * board data and the page-level scroll survive the round trip).
   */
  onBack: () => void
}

const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** The breadcrumb row (ui-design: 面包屑「提案看板 / <slug>」, root clickable). */
const breadcrumbStyle = {
  alignItems: 'center',
  display: 'flex',
  gap: '6px',
} as const

const crumbButtonStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'var(--dsw-alias-link, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '2px 4px',
} as const

/** The current crumb: 14/22, mono — an ID. */
const crumbCurrentStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '14px',
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const headerStyle = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  minWidth: 0,
} as const

/** The detail title: slug 16/24 w500 mono (ui-design layout row 1). */
const titleStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** 作者 · created 12/18 次文字 (created = mono date token). */
const metaStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The doc tab strip (the FeatureDocs tab geometry: pad 8 14, r14). */
const tabsStyle = {
  borderBottom: '1px solid var(--dsh-border-color, transparent)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
} as const

const tabStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: '14px',
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'pointer',
  font: 'inherit',
  padding: '8px 14px',
} as const

const activeTabStyle = {
  ...tabStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  color: 'var(--dsw-alias-label-primary, inherit)',
  fontWeight: 500,
} as const

const disabledTabStyle = {
  ...tabStyle,
  color: 'var(--dsw-alias-label-secondary, inherit)',
  cursor: 'default',
  opacity: 0.5,
} as const

/** The doc body card: r14 · bg-layer-2, inner scroll (ui-design 内滚动). */
const panelStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: '18px 20px',
} as const

/** The per-tab error card (the FeatureDocs state-card twin). */
const stateCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
} as const

const cardTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
  margin: '0',
} as const

/** md primary pill (the retry CTA — the board page precedent). */
const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '18px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '36px',
  padding: '0 16px',
} as const

/** Skeleton gray doc blocks (ui-design loading 态). */
const skeletonBlockStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '16px',
} as const

/** 12/18 secondary hint (the empty-doc line). */
const emptyHintStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
} as const

const TAB_LABEL_KEYS: Record<DocTab, WorkbenchKey> = {
  proposal: 'proposals.detail.tab.proposal',
  eval: 'proposals.detail.tab.eval',
}

/**
 * The proposal-detail subview. Pure presentation over the ProposalSummary
 * plus the per-tab document read; the data assembly (board re-read on
 * reflux, slug addressing) is the 5.5 page's.
 */
export function ProposalDetail(props: ProposalDetailProps) {
  const { proposal, t } = props
  // Build-stage default face: one isolated mock twin per mount (the 5.5
  // assembly spreads the IPC-backed members over it).
  const [defaultFace] = useState(() => createMockProposalsFace())
  const face: ProposalFace = { ...defaultFace, ...props.face }
  const faceRef = useRef(face)
  faceRef.current = face

  const evalAvailable = proposal.hasEval
  const focusable: readonly DocTab[] = evalAvailable ? [...DOC_TABS] : ['proposal']
  const [requested, setRequested] = useState<DocTab | undefined>(undefined)
  const requestedValid = requested !== undefined
    && (requested === 'proposal' || (requested === 'eval' && evalAvailable))
  const activeTab: DocTab = requestedValid ? requested : 'proposal'

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [doc, setDoc] = useState<ProposalDoc | undefined>(undefined)
  const [retryNonce, setRetryNonce] = useState(0)
  const [refluxNonce, setRefluxNonce] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  // The per-tab read: one effect run per (slug, tab, retry, reflux) — the
  // alive flag drops stale resolutions when the tab switches mid-flight.
  useEffect(() => {
    let alive = true
    setPhase('loading')
    setDoc(undefined)
    void faceRef.current.readProposalDoc({ projectId: projectIdRef.current ?? '', slug: proposal.slug, kind: activeTab })
      .then((next) => {
        if (!alive) return
        setDoc(next)
        setPhase('ready')
      })
      .catch(() => {
        if (alive) setPhase('error')
      })
    return () => { alive = false }
  }, [proposal.slug, activeTab, retryNonce, refluxNonce])

  // The 回流 leg (AC4): project-scoped `sync` pushes bump the read nonce —
  // the OPEN document re-renders with fresh content while the PANEL element
  // persists (same node → scrollTop preserved by construction, 保滚动位置).
  useEffect(() => {
    const subscribe = faceRef.current.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      const mine = projectIdRef.current === undefined
        || events.some(event => event.type === 'sync' && event.projectId === projectIdRef.current)
      if (mine) setRefluxNonce(nonce => nonce + 1)
    })
  }, [])

  // Keyboard (the FeatureDocs precedent): arrows/Home/End move focus AND
  // select among the ENABLED tabs only — the disabled eval tab is unreachable.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = focusable.indexOf(activeTab)
    let next: number | undefined
    if (event.key === 'ArrowRight') next = (current + 1) % focusable.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + focusable.length) % focusable.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = focusable.length - 1
    if (next === undefined) return
    event.preventDefault()
    const selection = focusable[next]!
    setRequested(selection)
    tabRefs.current[DOC_TABS.indexOf(selection)]?.focus()
  }

  const tabId = (tab: DocTab): string => `dsh-forge-proposal-doc-tab-${tab}`

  return (
    <div data-dsh-forge-proposal-detail={proposal.slug} style={rootStyle}>
      <nav aria-label={t('proposals.detail.breadcrumb')} data-dsh-forge-proposal-breadcrumb="" style={breadcrumbStyle}>
        <ChromeButton
          type="button"
          data-dsh-forge-proposal-back=""
          style={crumbButtonStyle}
          onClick={props.onBack}
        >
          {t('proposals.detail.breadcrumb.root')}
        </ChromeButton>
        <span aria-hidden="true" style={metaStyle}>/</span>
        <span aria-current="page" title={proposal.slug} data-dsh-forge-proposal-crumb="" style={crumbCurrentStyle}>
          {proposal.slug}
        </span>
      </nav>

      <header data-dsh-forge-proposal-header="" style={headerStyle}>
        <h2 title={proposal.slug} data-dsh-forge-proposal-detail-title="" style={titleStyle}>{proposal.slug}</h2>
        <ProposalStatusPill status={proposal.status} t={t} />
        <span style={metaStyle}>
          {`${proposal.author ?? '—'} · ${proposal.created ?? ''}`}
        </span>
      </header>

      <div
        role="tablist"
        aria-label={t('proposals.detail.docs.tabsLabel')}
        data-dsh-forge-proposal-doc-tabs=""
        style={tabsStyle}
        onKeyDown={onKeyDown}
      >
        {DOC_TABS.map(tab => {
          const enabled = tab === 'proposal' || evalAvailable
          const active = tab === activeTab
          return (
            <ChromeButton
              key={tab}
              ref={element => { tabRefs.current[DOC_TABS.indexOf(tab)] = element }}
              type="button"
              role="tab"
              disabled={!enabled}
              aria-disabled={!enabled ? 'true' : undefined}
              aria-selected={active ? 'true' : 'false'}
              tabIndex={active ? 0 : -1}
              id={tabId(tab)}
              data-dsh-forge-proposal-doc-tab={tab}
              title={enabled ? undefined : t('proposals.detail.evalMissing')}
              style={!enabled ? disabledTabStyle : active ? activeTabStyle : tabStyle}
              onClick={() => { if (enabled) setRequested(tab) }}
            >
              {t(TAB_LABEL_KEYS[tab])}
            </ChromeButton>
          )
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={tabId(activeTab)}
        data-dsh-forge-proposal-doc-panel={activeTab}
        style={panelStyle}
      >
        {phase === 'loading' && (
          <div
            role="status"
            aria-label={t('proposals.detail.docs.loading')}
            data-dsh-forge-proposal-doc-skeleton=""
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {[0, 1, 2, 3].map(index => (
              <div
                key={index}
                aria-hidden="true"
                style={{ ...skeletonBlockStyle, width: index === 0 ? '60%' : '100%' }}
              />
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div data-dsh-forge-proposal-doc-error="" role="alert" style={stateCardStyle}>
            <h3 style={cardTitleStyle}>{t('proposals.detail.docs.error.title')}</h3>
            <div>
              <ChromeButton
                type="button"
                data-dsh-forge-proposal-doc-retry=""
                style={primaryButtonStyle}
                onClick={() => { setRetryNonce(nonce => nonce + 1) }}
              >
                {t('proposals.detail.docs.error.retry')}
              </ChromeButton>
            </div>
          </div>
        )}

        {phase === 'ready' && doc !== undefined
          && (doc.markdown.trim() !== ''
            ? <MarkdownView markdown={doc.markdown} />
            : <p data-dsh-forge-proposal-doc-empty="" style={emptyHintStyle}>{t('proposals.detail.docs.empty')}</p>)}
      </div>
    </div>
  )
}
