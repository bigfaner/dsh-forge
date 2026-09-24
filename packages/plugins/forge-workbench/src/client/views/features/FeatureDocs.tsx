/**
 * The UF4 五类文档 tabs, BUILD half (task 5.9): the fixed canonical tab
 * strip (manifest/prd/design/ui/tasks — FEATURE_DOC_KINDS order) over the
 * per-tab read-only doc body (MarkdownView, task 5.2 — links inert, raw HTML
 * degraded; the read is the FeatureDocFace's one-shot verb).
 *
 * Tab matrix (Interface 1 note): a kind MISSING from `docKinds` renders its
 * tab DISABLED + tooltip 「无此类文档」 — never hidden (the five-slot strip is
 * the stable map of what a feature CAN carry).
 *
 * Body states (task AC 三分支齐备): loading 骨架 / read failure (error card +
 * retry) / ERR_SNAPSHOT_STALE (快照过期 — the spec's distinct presentation:
 * rescan guidance + retry; §Error Handling) plus the populated MarkdownView
 * and the empty-document hint. Task 5.16: the stale branch first AUTO-refetches
 * once silently (§Error Handling 静默触发重取; only a repeat failure shows the
 * dedicated card), and every read goes through the page-session doc cache
 * (docsCache prop — a hit renders without firing the verb; 重复打开不重拉).
 *
 * Keyboard (WAI-ARIA tabs, the 5.1 TabBar precedent): roving tabindex over
 * the ENABLED tabs, ArrowLeft/Right/Home/End move focus AND select
 * (automatic activation), disabled tabs are focusable by neither path.
 *
 * Task 4.4 (UF2/Integration #2): a present stageFace.listStageAssets
 * appends the sixth 「阶段资产」 tab at the strip's END — a DIFFERENT data
 * plane (StageAssetsTab reads listStageAssets + the stage_advanced reflux
 * itself), so the M2 doc-tab mechanism above is untouched by construction;
 * an absent stage face renders the five-tab M2 strip verbatim.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { DocKind, FeatureDoc } from '../../ipc-types'
import type { FeatureDocFace, StageFace } from '../../contract'
import type { FeatureDocsCache } from '../../store/feature-board'
import { FEATURE_DOC_KINDS, docKindLabel } from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MarkdownView } from '../../components/common/MarkdownView'
import { createMockFeatureDocFace } from '../../mocks/workbench'
import { normalizeWorkbenchVerbError } from '../../ipc/workbench'
import { StageAssetsTab } from './stages/StageAssetsTab'

/**
 * The strip's selection space (task 4.4): the five canonical DocKinds plus
 * the sixth 「阶段资产」 pseudo-kind — `assets` addresses the stage-assets
 * panel (a DIFFERENT data plane: listStageAssets, never readFeatureDoc).
 */
type TabSelection = DocKind | 'assets'

/** Inputs of {@link FeatureDocs}. */
export interface FeatureDocsProps {
  /** The locale seat (the shell's `t`). */
  t: FeatureStatusTranslate
  /** The active project — the readFeatureDoc verb argument. */
  projectId?: string | undefined
  /** The feature whose docs are being browsed. */
  featureSlug: string
  /** Kinds that actually exist (Interface 1: drives the disabled matrix). */
  docKinds: readonly DocKind[]
  /** The doc face — absent members fall back to the build-stage mock (5.16 injects the IPC face). */
  face?: Partial<FeatureDocFace> | undefined
  /**
   * The UF2 stage face (task 4.4, Integration #2): a PRESENT listStageAssets
   * member appends the sixth 「阶段资产」 tab at the strip's END (M2 文档 tab
   * 机制不动 — the five-kind strip, its disabled matrix, the doc cache and
   * the stale-refetch legs all stay untouched); an absent member keeps the
   * M2 five-tab form exactly.
   */
  stageFace?: Partial<StageFace> | undefined
  /**
   * The page-session doc cache (task 5.16): a hit renders WITHOUT firing the
   * verb (重复打开不重拉); a successful read writes back. The page owns the
   * cache and clears it on a project switch — this component only reads and
   * writes entries.
   */
  docsCache?: FeatureDocsCache | undefined
}

const tabsStyle = {
  borderBottom: '1px solid var(--dsh-border-color, transparent)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4px',
} as const

/** ui-design tab 条 geometry (the TabBar precedent): text tab pad 8 14, r14. */
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
  marginTop: '12px',
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: '14px',
} as const

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

const cardBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: '420px',
} as const

/** md primary pill (the retry CTAs — the board page precedent). */
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

/** Skeleton gray doc blocks (ui-design loading 态: 灰文档块). */
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

/**
 * Is the thrown value an ERR_SNAPSHOT_STALE rejection? Normalized through the
 * ONE envelope authority (ipc/workbench.ts), so both rejection forms count —
 * the plain shape the build-stage mocks throw AND the real IPC form (an Error
 * whose message is the serialized envelope).
 */
function isSnapshotStale(error: unknown): boolean {
  return normalizeWorkbenchVerbError(error).code === 'ERR_SNAPSHOT_STALE'
}

/**
 * The doc tab strip + body. The ACTIVE kind derives from the requested kind
 * validated against `docKinds` (a feature switch that strands the requested
 * kind falls back to the first available); no available kind renders the
 * strip with all five disabled and an empty body.
 */
export function FeatureDocs(props: FeatureDocsProps) {
  // Build-stage default face: one isolated mock twin per mount (the 5.16
  // assembly spreads the IPC-backed member over it).
  const [defaultFace] = useState(() => createMockFeatureDocFace())
  const face: FeatureDocFace = { ...defaultFace, ...props.face }

  const available = FEATURE_DOC_KINDS.filter(kind => props.docKinds.includes(kind))
  // The sixth tab's premise (task 4.4): the stage read leg exists. Absent =
  // the M2 five-tab strip verbatim (no assets pseudo-kind anywhere).
  const hasAssetsTab = props.stageFace?.listStageAssets !== undefined
  const focusable: readonly TabSelection[] = hasAssetsTab ? [...available, 'assets'] : [...available]
  const [requested, setRequested] = useState<TabSelection | undefined>(undefined)
  const requestedValid = requested !== undefined
    && (requested === 'assets' ? hasAssetsTab : props.docKinds.includes(requested))
  const activeTab: TabSelection | undefined = requestedValid
    ? requested
    : available[0] ?? (hasAssetsTab ? 'assets' : undefined)
  const activeKind: DocKind | undefined = activeTab === undefined || activeTab === 'assets'
    ? undefined
    : activeTab

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'stale'>('loading')
  const [doc, setDoc] = useState<FeatureDoc | undefined>(undefined)
  const [retryNonce, setRetryNonce] = useState(0)
  // ERR_SNAPSHOT_STALE's silent auto-refetch driver (task 5.16): the first
  // stale rejection re-fires the read ONCE without leaving the loading phase;
  // only a repeat failure surfaces the dedicated 快照过期 presentation (AC3:
  // 自动重取一次,仍失败才显错). The manual retry (retryNonce) re-arms the
  // allowance for the next chain.
  const [autoRefetchNonce, setAutoRefetchNonce] = useState(0)
  const staleRetriedRef = useRef(false)
  const attemptKeyRef = useRef('')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Latest-value ref for the load effect (the t seat never changes identity
  // in practice; projectId/slug arrive as props).
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  // The per-tab read: one effect run per (slug, kind, retry, auto-refetch) —
  // the alive flag drops stale resolutions when the tab switches mid-flight.
  // A cache hit short-circuits the verb entirely (页内缓存: 重复打开不重拉).
  // The sixth assets tab owns a DIFFERENT data plane (StageAssetsTab reads
  // listStageAssets itself): while it is active the doc leg is skipped
  // entirely — no verb fires, no doc state churns.
  useEffect(() => {
    if (activeTab === 'assets') return
    if (activeKind === undefined) {
      setDoc(undefined)
      setPhase('loading')
      return
    }
    const attemptKey = `${props.featureSlug}/${String(activeKind)}/${String(retryNonce)}`
    if (attemptKeyRef.current !== attemptKey) {
      attemptKeyRef.current = attemptKey
      staleRetriedRef.current = false
    }
    const cached = props.docsCache?.get(props.featureSlug, activeKind)
    if (cached !== undefined) {
      setDoc(cached)
      setPhase('ready')
      return
    }
    let alive = true
    setPhase('loading')
    void face.readFeatureDoc(projectIdRef.current ?? '', props.featureSlug, activeKind)
      .then((next) => {
        if (!alive) return
        props.docsCache?.put(props.featureSlug, activeKind, next)
        setDoc(next)
        setPhase('ready')
      })
      .catch((error: unknown) => {
        if (!alive) return
        if (isSnapshotStale(error) && !staleRetriedRef.current) {
          // Spec §Error Handling: 静默触发重取 — one silent refetch, still
          // loading; a repeat failure falls through to the presentation.
          staleRetriedRef.current = true
          setAutoRefetchNonce(nonce => nonce + 1)
          return
        }
        setPhase(isSnapshotStale(error) ? 'stale' : 'error')
      })
    return () => { alive = false }
    // The face + cache identities are fixed for the component's life (the
    // page precedents); the cache is consulted, never subscribed to.
  }, [props.featureSlug, activeKind, retryNonce, autoRefetchNonce])

  // Keyboard (the TabBar precedent): arrows/Home/End move focus AND select
  // among the ENABLED tabs only — a disabled tab is unreachable. The sixth
  // assets tab is always enabled, so it joins the roving set at the END
  // (task 4.4: End lands on it when the stage face is present).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = activeTab === undefined ? -1 : focusable.indexOf(activeTab)
    let next: number | undefined
    if (event.key === 'ArrowRight') next = focusable.length === 0 ? undefined : (current + 1) % focusable.length
    else if (event.key === 'ArrowLeft') next = focusable.length === 0 ? undefined : (current - 1 + focusable.length) % focusable.length
    else if (event.key === 'Home') next = focusable.length === 0 ? undefined : 0
    else if (event.key === 'End') next = focusable.length === 0 ? undefined : focusable.length - 1
    if (next === undefined) return
    event.preventDefault()
    const selection = focusable[next]!
    setRequested(selection)
    tabRefs.current[selection === 'assets' ? FEATURE_DOC_KINDS.length : FEATURE_DOC_KINDS.indexOf(selection)]?.focus()
  }

  const tabId = (kind: TabSelection): string => `dsh-forge-feature-doc-tab-${kind}`

  return (
    <div data-dsh-forge-feature-docs="">
      <div
        role="tablist"
        aria-label={props.t('features.docs.tabsLabel')}
        data-dsh-forge-feature-doc-tabs=""
        style={tabsStyle}
        onKeyDown={onKeyDown}
      >
        {FEATURE_DOC_KINDS.map((kind) => {
          const enabled = props.docKinds.includes(kind)
          const active = kind === activeTab
          return (
            <ChromeButton
              key={kind}
              ref={(element) => { tabRefs.current[FEATURE_DOC_KINDS.indexOf(kind)] = element }}
              type="button"
              role="tab"
              disabled={!enabled}
              aria-disabled={!enabled ? 'true' : undefined}
              aria-selected={active ? 'true' : 'false'}
              tabIndex={active ? 0 : -1}
              id={tabId(kind)}
              data-dsh-forge-feature-doc-tab={kind}
              title={enabled ? undefined : props.t('features.docs.disabledHint')}
              style={!enabled ? disabledTabStyle : active ? activeTabStyle : tabStyle}
              onClick={() => { if (enabled) setRequested(kind) }}
            >
              {docKindLabel(kind, props.t)}
            </ChromeButton>
          )
        })}
        {hasAssetsTab && (
          <ChromeButton
            ref={(element) => { tabRefs.current[FEATURE_DOC_KINDS.length] = element }}
            type="button"
            role="tab"
            aria-selected={activeTab === 'assets' ? 'true' : 'false'}
            tabIndex={activeTab === 'assets' ? 0 : -1}
            id={tabId('assets')}
            data-dsh-forge-feature-doc-tab="assets"
            style={activeTab === 'assets' ? activeTabStyle : tabStyle}
            onClick={() => { setRequested('assets') }}
          >
            {props.t('features.stages.assets.tab')}
          </ChromeButton>
        )}
      </div>

      {activeTab !== undefined && (
        <div
          role="tabpanel"
          aria-labelledby={tabId(activeTab)}
          data-dsh-forge-feature-doc-panel={activeTab}
          style={panelStyle}
        >
          {activeTab === 'assets' && (
            <StageAssetsTab
              t={props.t}
              projectId={props.projectId}
              featureSlug={props.featureSlug}
              face={props.stageFace}
            />
          )}

          {activeTab !== 'assets' && phase === 'loading' && (
            <div
              role="status"
              aria-label={props.t('features.docs.loading')}
              data-dsh-forge-feature-doc-skeleton=""
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

          {activeTab !== 'assets' && phase === 'error' && (
            <div data-dsh-forge-feature-doc-error="" role="alert" style={stateCardStyle}>
              <h3 style={cardTitleStyle}>{props.t('features.docs.error.title')}</h3>
              <div>
                <ChromeButton
                  type="button"
                  data-dsh-forge-feature-doc-retry=""
                  style={primaryButtonStyle}
                  onClick={() => { setRetryNonce(nonce => nonce + 1) }}
                >
                  {props.t('features.docs.error.retry')}
                </ChromeButton>
              </div>
            </div>
          )}

          {activeTab !== 'assets' && phase === 'stale' && (
            <div data-dsh-forge-feature-doc-stale="" role="status" style={stateCardStyle}>
              <h3 style={cardTitleStyle}>{props.t('features.docs.stale.title')}</h3>
              <p style={cardBodyStyle}>{props.t('features.docs.stale.body')}</p>
              <div>
                <ChromeButton
                  type="button"
                  data-dsh-forge-feature-doc-stale-retry=""
                  style={primaryButtonStyle}
                  onClick={() => { setRetryNonce(nonce => nonce + 1) }}
                >
                  {props.t('features.docs.stale.retry')}
                </ChromeButton>
              </div>
            </div>
          )}

          {activeTab !== 'assets' && phase === 'ready' && doc !== undefined
            && (doc.markdown.trim() !== ''
              ? <MarkdownView markdown={doc.markdown} />
              : <p data-dsh-forge-feature-doc-empty="" style={emptyHintStyle}>{props.t('features.docs.empty')}</p>)}
        </div>
      )}
    </div>
  )
}
