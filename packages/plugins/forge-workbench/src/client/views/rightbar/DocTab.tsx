/**
 * The 文档 tab BODY (M4 task 2.4, layout §4.5): 路径栏 h38 (路径小字 + 右端 ↻
 * 重新读取 + 只读标记) over the read-only 正文 — the ONE MarkdownView face
 * (TECH-markdown-001 三禁: raw HTML/外链跳转/交互元素 all inert by construction).
 *
 * Identity (裁决 #22-①): the tab 名 = `slug/产物名称` rides the `doc`
 * navigation params the 2.3 open seam carries (the chip title seat renders
 * it — DocTree.DocTabTitle); the path bar's `title` is the 全路径口径.
 *
 * Reads (零新读侧): the path parses through DocTree onto the EXISTING M3
 * verbs — workbench.readFeatureDoc / readProposalDoc — through the same
 * build-stage/IPC form selection the overview family uses (seat present or
 * bridge absent → the seat/mock twins; bridge live → the IPC faces). The
 * document belongs to the CURRENT project only (the tab's project source is
 * the plugin's active-project store; a project switch CLOSES the tab — the
 * 2.2 §4.7 linkage — so the body never renders a foreign project's doc).
 *
 * Re-read (Hard Rule): ONLY the explicit ↻ — no watcher, no auto-reload; the
 * ↻ doubles as the error card's retry. The body also registers itself in the
 * doc-tabs registry (AC1 dedupe: 重复打开激活既有 — see DocTree.tsx).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { UseSidebarRightTabInfo } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { FeatureDocFace, ProposalFace } from '../../contract'
import { MarkdownView } from '../../components/common/MarkdownView'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { getWorkbenchIpcBridge, createIpcFeatureDocFace, createIpcProposalFace } from '../../ipc/workbench'
import type { WorkbenchIpcBridge } from '../../ipc/workbench'
import { createMockFeatureDocFace, createMockProposalsFace } from '../../mocks/workbench'
import { INITIAL_ACTIVE_PROJECT_SNAPSHOT } from '../../store/active-project'
import type { ActiveProjectStore } from '../../store/active-project'
import { docParamsOf, parseDocPath, type DocTabsRegistry } from './DocTree'
import type { TabKindTranslate } from './tab-kinds'

/** The test/build-stage injection seat (the M3 page-seat discipline). */
export interface DocTabSeat {
  /** The feature-doc face override (absent members fall back to the mock twin). */
  readonly featureDocFace?: Partial<FeatureDocFace> | undefined
  /** The proposals face override (the read member is the tab's consumption). */
  readonly proposalsFace?: Partial<ProposalFace> | undefined
}

/** Inputs of {@link DocTab} (all optional so the bare hostless render degrades
 * to the resolving skeleton — never a throw, never a mock project). */
export interface DocTabProps {
  /** The locale seat (the plugin's bound `t`). */
  readonly t: TabKindTranslate
  /** The plugin-lifetime active-project store — the tab's ONLY project source. */
  readonly activeProject?: ActiveProjectStore | undefined
  /** The doc-tabs registry (AC1 dedupe); absent = the body stays unregistered. */
  readonly docTabs?: DocTabsRegistry | undefined
  /** The test/build-stage seat — present wins over the bridge (one rule). */
  readonly seat?: DocTabSeat | undefined
  /** The slot runtime's tab-info hook (the params + tab identity carrier). */
  readonly useTabInfo?: UseSidebarRightTabInfo | undefined
}

/** The tab's column. */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: 0,
} as const

/** The 路径栏: h38, the path in small text + ↻ + 只读 (§4.5 wireframe row 2). */
const PATH_BAR_HEIGHT = '38px'
const pathBarStyle = {
  alignItems: 'center',
  borderBottom: '0.5px solid var(--dsh-border-color, rgba(128, 128, 128, 0.35))',
  display: 'flex',
  flex: '0 0 auto',
  gap: '8px',
  height: PATH_BAR_HEIGHT,
  minWidth: 0,
  padding: '0 12px',
} as const

const pathStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  flex: '1 1 auto',
  fontSize: '12px',
  lineHeight: '18px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const readonlyStyle = {
  color: 'var(--dsw-alias-label-tertiary, rgb(129, 133, 140))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
} as const

const reloadStyle = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '18px',
  padding: '2px 6px',
} as const

/** The 正文 scroller (只读 — no editing surface anywhere in the tree). */
const bodyStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflowY: 'auto',
  padding: '12px 16px',
} as const

/** Shared card face for the non-data states (the M3 board page precedent). */
const cardStyle = {
  background: 'var(--dsw-alias-bg-layer-2, var(--dsh-bg, Canvas))',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  padding: '14px',
} as const

const errorCardStyle = {
  ...cardStyle,
  border: '1.5px solid var(--dsw-alias-state-error-primary, rgb(236, 19, 19))',
} as const

const cardTitleStyle = {
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '22px',
  margin: '0 0 8px',
  overflowWrap: 'anywhere',
} as const

const primaryButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  padding: '4px 12px',
} as const

/** Skeleton gray rows (the family's resolving 态 twin). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '20px',
  margin: '10px 0',
} as const

const auxStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  overflowWrap: 'anywhere',
} as const

/** The noop subscription every optional store falls back to (never a throw). */
const NOOP_SUBSCRIBE = (): (() => void) => () => {}

/** One read's settled state (loading is the pre-first-settle state). */
type DocPhase = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'ready'; readonly markdown: string }

/**
 * The 文档 tab body. An unresolved project pointer, an absent tab-info hook,
 * or missing params render the resolving skeleton (the family discipline);
 * a parse-failing path renders the error card naming the path — never a
 * silent empty pane.
 */
export function DocTab(props: DocTabProps): ReactNode {
  const { t } = props
  const info = props.useTabInfo?.()
  const params = docParamsOf(info)
  // Memoized on the PATH STRING: parsing is pure, but a fresh object per
  // render would re-fire the read effect below on every parent render.
  const pathKey = params?.path
  const target = useMemo(
    () => (pathKey === undefined ? undefined : parseDocPath(pathKey)),
    [pathKey],
  )

  const snapshot = useSyncExternalStore(
    props.activeProject?.subscribe ?? NOOP_SUBSCRIBE,
    props.activeProject?.getSnapshot ?? (() => INITIAL_ACTIVE_PROJECT_SNAPSHOT),
  )
  const projectId = snapshot.activeProjectId ?? undefined

  // Form selection: bridge presence is fixed for the tab's life (the
  // OverviewTab rule verbatim).
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  const seatForm = props.seat !== undefined || bridge === undefined
  const [featureFace] = useState<FeatureDocFace>(() => {
    if (!seatForm && bridge !== undefined) return createIpcFeatureDocFace(bridge)
    return { ...createMockFeatureDocFace(), ...props.seat?.featureDocFace }
  })
  const [proposalFace] = useState<ProposalFace>(() => {
    if (!seatForm && bridge !== undefined) return createIpcProposalFace(bridge)
    return { ...createMockProposalsFace(), ...props.seat?.proposalsFace }
  })

  // The registry leg (AC1 dedupe): register on mount, drop on unmount. The
  // body IS the liveness signal — a closed tab unmounts and unregisters.
  const docTabs = props.docTabs
  const tabId = info?.tab.id
  const path = params?.path
  useEffect(() => {
    if (docTabs === undefined || tabId === undefined || path === undefined) return
    docTabs.register(tabId, path)
    return () => { docTabs.unregister(tabId, path) }
  }, [docTabs, tabId, path])

  // The ONE read: per (project, path, reload nonce). The ↻ bumps the nonce —
  // the ONLY re-read route (Hard Rule: no auto-reload contract).
  const [reload, setReload] = useState(0)
  const [phase, setPhase] = useState<DocPhase>({ kind: 'loading' })
  const readRef = useRef(0)
  useEffect(() => {
    if (projectId === undefined || target === undefined) return
    const ticket = ++readRef.current
    let alive = true
    setPhase({ kind: 'loading' })
    const read = target.area === 'features'
      ? featureFace.readFeatureDoc(projectId, target.slug, target.kind)
      : proposalFace.readProposalDoc({ projectId, slug: target.slug, kind: target.kind })
    read.then(
      (doc) => {
        if (!alive || ticket !== readRef.current) return
        setPhase({ kind: 'ready', markdown: doc.markdown })
      },
      (error: unknown) => {
        if (!alive || ticket !== readRef.current) return
        const message = typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error)
        setPhase({ kind: 'error', message })
      },
    )
    return () => { alive = false }
  }, [projectId, target, reload, featureFace, proposalFace])

  const onReload = (): void => { setReload(nonce => nonce + 1) }

  // Unresolved identity/project = the resolving skeleton (never an error
  // flash; a restored tab without params rides the same branch).
  if (projectId === undefined || params === undefined) {
    return (
      <div data-dsh-forge-doc="" aria-busy="true" style={{ ...rootStyle, padding: '12px' }}>
        <div style={skeletonRowStyle} aria-hidden="true" />
        <div style={{ ...skeletonRowStyle, width: '70%' }} aria-hidden="true" />
        <div style={{ ...skeletonRowStyle, width: '85%' }} aria-hidden="true" />
      </div>
    )
  }

  // A parse-failing path is a PERMANENT error (the read side is never
  // reached with a malformed address) — the card names the path.
  if (target === undefined) {
    return (
      <div data-dsh-forge-doc={params.path} style={rootStyle}>
        <div data-dsh-forge-doc-pathbar="" style={pathBarStyle}>
          <span data-dsh-forge-doc-path="" title={params.path} style={pathStyle}>{params.path}</span>
          <span style={readonlyStyle}>{t('rightbar.doc.readonly')}</span>
        </div>
        <div data-dsh-forge-doc-body="" style={bodyStyle}>
          <div data-dsh-forge-doc-error="" role="alert" style={errorCardStyle}>
            <h3 style={cardTitleStyle}>{t('rightbar.doc.loadError.title')}</h3>
            <p data-dsh-forge-doc-unparsed="" style={auxStyle}>{params.path}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-dsh-forge-doc={params.path} style={rootStyle}>
      {/* 路径栏 h38: 路径小字 (title=全路径) + ↻ 重新读取 + 只读. */}
      <div data-dsh-forge-doc-pathbar="" style={pathBarStyle}>
        <span data-dsh-forge-doc-path="" title={params.path} style={pathStyle}>{params.path}</span>
        <span style={readonlyStyle}>{t('rightbar.doc.readonly')}</span>
        <button
          type="button"
          data-dsh-forge-doc-reload=""
          style={reloadStyle}
          title={t('rightbar.doc.reload')}
          aria-label={t('rightbar.doc.reload')}
          onClick={onReload}
        >
          ↻
        </button>
      </div>

      {/* 只读正文 — the loading/error/ready branches. */}
      <div data-dsh-forge-doc-body="" style={bodyStyle}>
        {phase.kind === 'loading' && (
          <div role="status" aria-label={t('rightbar.doc.loading')} data-dsh-forge-doc-skeleton="">
            <div style={skeletonRowStyle} aria-hidden="true" />
            <div style={{ ...skeletonRowStyle, width: '70%' }} aria-hidden="true" />
            <div style={{ ...skeletonRowStyle, width: '85%' }} aria-hidden="true" />
          </div>
        )}
        {phase.kind === 'error' && (
          <div data-dsh-forge-doc-error="" role="alert" style={errorCardStyle}>
            <h3 style={cardTitleStyle}>{t('rightbar.doc.loadError.title')}</h3>
            <p style={auxStyle}>{phase.message}</p>
            <div>
              <ChromeButton
                type="button"
                data-dsh-forge-doc-retry=""
                style={primaryButtonStyle}
                onClick={onReload}
              >
                {t('rightbar.doc.loadError.retry')}
              </ChromeButton>
            </div>
          </div>
        )}
        {phase.kind === 'ready' && <MarkdownView markdown={phase.markdown} />}
      </div>
    </div>
  )
}
