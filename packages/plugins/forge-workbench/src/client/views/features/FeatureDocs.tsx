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
 * and the empty-document hint.
 *
 * Keyboard (WAI-ARIA tabs, the 5.1 TabBar precedent): roving tabindex over
 * the ENABLED tabs, ArrowLeft/Right/Home/End move focus AND select
 * (automatic activation), disabled tabs are focusable by neither path.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { DocKind, FeatureDoc, WorkbenchVerbError } from '../../ipc-types'
import type { FeatureDocFace } from '../../contract'
import { FEATURE_DOC_KINDS, docKindLabel } from '../../i18n/feature-status'
import type { FeatureStatusTranslate } from '../../i18n/feature-status'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { MarkdownView } from '../../components/common/MarkdownView'
import { createMockFeatureDocFace } from '../../mocks/workbench'

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

/** Is the thrown value an ERR_SNAPSHOT_STALE rejection (the serialized verb shape)? */
function isSnapshotStale(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && (error as WorkbenchVerbError).code === 'ERR_SNAPSHOT_STALE'
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
  const [requested, setRequested] = useState<DocKind | undefined>(undefined)
  const activeKind = requested !== undefined && props.docKinds.includes(requested)
    ? requested
    : available[0]

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error' | 'stale'>('loading')
  const [doc, setDoc] = useState<FeatureDoc | undefined>(undefined)
  const [retryNonce, setRetryNonce] = useState(0)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Latest-value ref for the load effect (the t seat never changes identity
  // in practice; projectId/slug arrive as props).
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  // The per-tab read: one effect run per (slug, kind, retry) — the alive flag
  // drops stale resolutions when the tab switches mid-flight.
  useEffect(() => {
    if (activeKind === undefined) {
      setDoc(undefined)
      setPhase('loading')
      return
    }
    let alive = true
    setPhase('loading')
    void face.readFeatureDoc(projectIdRef.current ?? '', props.featureSlug, activeKind)
      .then((next) => {
        if (!alive) return
        setDoc(next)
        setPhase('ready')
      })
      .catch((error: unknown) => {
        if (!alive) return
        setPhase(isSnapshotStale(error) ? 'stale' : 'error')
      })
    return () => { alive = false }
    // The face identity is fixed for the component's life (the page precedents).
  }, [props.featureSlug, activeKind, retryNonce])

  // Keyboard (the TabBar precedent): arrows/Home/End move focus AND select
  // among the ENABLED tabs only — a disabled tab is unreachable.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = activeKind === undefined ? -1 : available.indexOf(activeKind)
    let next: number | undefined
    if (event.key === 'ArrowRight') next = available.length === 0 ? undefined : (current + 1) % available.length
    else if (event.key === 'ArrowLeft') next = available.length === 0 ? undefined : (current - 1 + available.length) % available.length
    else if (event.key === 'Home') next = available.length === 0 ? undefined : 0
    else if (event.key === 'End') next = available.length === 0 ? undefined : available.length - 1
    if (next === undefined) return
    event.preventDefault()
    setRequested(available[next]!)
    tabRefs.current[FEATURE_DOC_KINDS.indexOf(available[next]!)]?.focus()
  }

  const tabId = (kind: DocKind): string => `dsh-forge-feature-doc-tab-${kind}`

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
          const active = kind === activeKind
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
      </div>

      {activeKind !== undefined && (
        <div
          role="tabpanel"
          aria-labelledby={tabId(activeKind)}
          data-dsh-forge-feature-doc-panel={activeKind}
          style={panelStyle}
        >
          {phase === 'loading' && (
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

          {phase === 'error' && (
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

          {phase === 'stale' && (
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

          {phase === 'ready' && doc !== undefined
            && (doc.markdown.trim() !== ''
              ? <MarkdownView markdown={doc.markdown} />
              : <p data-dsh-forge-feature-doc-empty="" style={emptyHintStyle}>{props.t('features.docs.empty')}</p>)}
        </div>
      )}
    </div>
  )
}
