/**
 * The UF5 提案看板 page + its ASSEMBLY (task 5.5, tech-design §Integration
 * #5 / page-map `workbench/proposals`, the workbench's SECOND tab): the page
 * the shell mounts into the reserved proposals seat, composing the 5.4
 * component pair — ProposalList (the board rows, its own loadBoard state
 * machine) and ProposalDetail (the :slug subview) — over the view-key
 * machine's proposalSlug dimension (enter = the machine's openProposalDetail,
 * return = the tab action clearing the slug — the machine stays the single
 * addressing authority, the FeaturesPage discipline).
 *
 * 返回不重拉 (5.4's contract): the page keeps ProposalList MOUNTED while the
 * detail subview is open (the list seat just hides), so the loaded board and
 * the page-level scroll survive the round trip by construction. The detail's
 * own data = a page-side board read over the SAME face, re-fired on
 * project-scoped `sync` pushes while the subview is open (hasEval/status
 * follow the CURRENT ProposalSummary — the board is the single source; the
 * detail component never re-reads the board itself). A slug missing from the
 * settled board renders the not-found card + back (the FeaturesPage
 * precedent for a live-refresh race).
 *
 * Form selection (one rule, the TasksView/FeaturesView precedent):
 *   seat present (the shell's `proposals` prop — the explicit test/build
 *     injection) or bridge ABSENT (jsdom / hostless mounts)
 *       → the body on the injected/mock faces, exactly the build-stage form;
 *   bridge live and no seat (the real desktop host), project unresolved
 *       → the resolving skeleton (the page owns its loading branch — never
 *         an error flash);
 *   bridge live, no seat, project resolved → the IPC proposal face.
 *
 * Hard Rules honored (SC6 只读): the page's whole interaction surface is
 * navigation (row → detail, breadcrumb → board, feature badge → Feature
 * tab); no edit/transition/delete affordance exists — the 仓外路径失效 lost
 * card's repoint/remove seams are the SHELL's (wizard edit / RemoveConfirm),
 * routed out as callbacks.
 */
import { useEffect, useRef, useState } from 'react'
import type { ProposalBoardData } from '../ipc-types'
import type { ProposalFace, WorkbenchProposalsSeat } from '../contract'
import type { WorkbenchKey } from '../locale/en'
import { ChromeButton } from '../components/chrome/ChromeButton'
import { createIpcProposalFace, getWorkbenchIpcBridge } from '../ipc/workbench'
import type { WorkbenchIpcBridge } from '../ipc/workbench'
import { createMockProposalsFace } from '../mocks/workbench'
import { ProposalList } from './proposals/ProposalList'
import { ProposalDetail } from './proposals/ProposalDetail'

/** Inputs of {@link ProposalsPage}. */
export interface ProposalsPageProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The active project — the loadBoard verb argument (the shell's projection). */
  projectId?: string | undefined
  /**
   * The view-key machine's proposal-detail slug (the shell's projection of
   * the machine snapshot): undefined = the board list, a slug = the detail
   * subview (`workbench/proposals/:slug`).
   */
  proposalSlug?: string | undefined
  /** The enter-detail seam — the shell routes it into the machine's openProposalDetail. */
  onOpenProposal?: ((slug: string) => void) | undefined
  /**
   * The return seam — the shell routes it to the machine's tab action
   * (selectWorkbenchTab('workbench/proposals') clears the slug).
   */
  onBack?: (() => void) | undefined
  /**
   * The feature-jump seam (互跳): the shell routes it into the machine's
   * openFeatureDetail — the Feature tab's :slug detail, the 提案 tab being
   * the return path (面包屑记录来路,可返提案看板).
   */
  onOpenFeature?: ((featureSlug: string) => void) | undefined
  /**
   * 仓外路径失效 (real-path derivation from the store's sync-derived
   * lostProjectIds; the seat's docsLost wins in the seat form).
   */
  docsLost?: boolean | undefined
  /** The lost card's 重新指向 seam — the shell's register-wizard EDIT mode. */
  onRepoint?: (() => void) | undefined
  /** The lost card's 移除项目 seam — the shell's RemoveConfirm flow. */
  onRemove?: (() => void) | undefined
  /** The explicit assembly seat (tests / build stage) — present wins over the bridge. */
  seat?: WorkbenchProposalsSeat | undefined
}

/** Inputs of the shared board body (both forms render it with a resolved face). */
interface ProposalsBoardBodyProps {
  t: (key: WorkbenchKey) => string
  projectId?: string | undefined
  proposalSlug?: string | undefined
  onOpenProposal?: ((slug: string) => void) | undefined
  onBack?: (() => void) | undefined
  onOpenFeature?: ((featureSlug: string) => void) | undefined
  docsLost?: boolean | undefined
  onRepoint?: (() => void) | undefined
  onRemove?: (() => void) | undefined
  face?: Partial<ProposalFace> | undefined
}

const pageStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** Shared card face for the non-data states (the board page precedent). */
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

/** md primary pill (the retry / back CTAs — the board page precedent). */
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

/** Skeleton gray rows (ui-design loading 态: 灰行). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/** One resolving-skeleton block (the resolving + detail-reading branches share it). */
function ResolvingSkeleton(props: { label: string }) {
  return (
    <div
      role="status"
      aria-label={props.label}
      data-dsh-forge-proposal-skeleton=""
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
    </div>
  )
}

/**
 * The board body both forms render: the always-mounted list seat (hidden
 * while the detail subview is open — 返回不重拉) plus the page-side detail
 * feed. The face is FULLY resolved by the caller (seat injection over the
 * build-stage mock twin, or the IPC face on the real chain).
 */
function ProposalsBoardBody(props: ProposalsBoardBodyProps) {
  const t = props.t
  // Build-stage default face: one isolated mock twin per mount shared by the
  // list AND the page-side detail feed (the same board data both halves read).
  // Seeded with the mount-time active project (the mock twin's board rejects
  // foreign project ids — the real verb's ERR_PROJECT_NOT_FOUND discipline):
  // the shell re-keys the page per project switch, so the seed tracks the
  // board it must serve.
  const [defaultFace] = useState(() =>
    createMockProposalsFace(props.projectId === undefined ? {} : { projectId: props.projectId }))
  const face: ProposalFace = { ...defaultFace, ...props.face }
  const faceRef = useRef(face)
  faceRef.current = face
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  const inDetail = props.proposalSlug !== undefined
  const hasDetail = inDetail

  // The page-side detail feed: ONE board read per (slug, project, retry,
  // reflux) while the subview is open — the CURRENT ProposalSummary the
  // detail renders against (status/hasEval follow the board, the single
  // source). A FRESH (slug, project) drops the previous board (its rows
  // address the old proposal — a stale summary is never rendered); a reflux
  // or retry re-read keeps the last good board while in flight (不打断, the
  // list's last-good discipline). The alive flag drops stale resolutions.
  const [detailPhase, setDetailPhase] = useState<'reading' | 'ready' | 'error'>('reading')
  const [detailBoard, setDetailBoard] = useState<ProposalBoardData | undefined>(undefined)
  const [retryNonce, setRetryNonce] = useState(0)
  const [refluxNonce, setRefluxNonce] = useState(0)
  const detailKeyRef = useRef('')
  const detailKey = `${props.projectId ?? ''}::${props.proposalSlug ?? ''}`

  useEffect(() => {
    if (props.proposalSlug === undefined) return
    let alive = true
    const freshKey = detailKeyRef.current !== detailKey
    detailKeyRef.current = detailKey
    setDetailPhase('reading')
    if (freshKey) setDetailBoard(undefined)
    faceRef.current.loadBoard(projectIdRef.current ?? '')
      .then((board) => {
        if (!alive) return
        setDetailBoard(board)
        setDetailPhase('ready')
      })
      .catch(() => {
        // A failed re-read keeps the last good board rendered (last-good);
        // a failed FIRST read of the slug surfaces the retry card.
        if (alive) setDetailPhase('error')
      })
    return () => { alive = false }
  }, [props.proposalSlug, props.projectId, retryNonce, refluxNonce, detailKey])

  // The detail feed's reflux leg: project-scoped `sync` pushes re-fire the
  // board read while the subview is open (the OPEN detail re-renders with
  // the CURRENT summary ≤5s; foreign projects never reload it).
  useEffect(() => {
    const subscribe = faceRef.current.subscribeEvents
    if (subscribe === undefined || !hasDetail) return
    return subscribe((events) => {
      const mine = projectIdRef.current === undefined
        || events.some(event => event.type === 'sync' && event.projectId === projectIdRef.current)
      if (mine) setRefluxNonce(nonce => nonce + 1)
    })
    // The face identity is fixed for the page's life (the board precedents).
  }, [hasDetail])

  const summary = detailBoard !== undefined && props.proposalSlug !== undefined
    ? detailBoard.proposals.find(row => row.slug === props.proposalSlug)
    : undefined

  return (
    <div data-dsh-forge-proposal-page="" style={pageStyle}>
      {/* The list seat: MOUNTED for the page's life, hidden while the detail
          subview is open — the board data and the page-level scroll survive
          the round trip by construction (返回不重拉). */}
      <div data-dsh-forge-proposal-list-seat="" hidden={inDetail || undefined}>
        <ProposalList
          t={t}
          projectId={props.projectId}
          face={face}
          docsLost={props.docsLost}
          onRepoint={props.onRepoint}
          onRemove={props.onRemove}
          onOpenProposal={props.onOpenProposal}
          onOpenFeature={props.onOpenFeature}
        />
      </div>

      {inDetail && (
        detailBoard === undefined && detailPhase === 'error'
          ? (
            <div data-dsh-forge-proposal-detail-error="" role="alert" style={errorCardStyle}>
              <h3 style={cardTitleStyle}>{t('proposals.loadError.title')}</h3>
              <div>
                <ChromeButton
                  type="button"
                  data-dsh-forge-proposal-detail-retry=""
                  style={primaryButtonStyle}
                  onClick={() => { setRetryNonce(nonce => nonce + 1) }}
                >
                  {t('proposals.loadError.retry')}
                </ChromeButton>
              </div>
            </div>
          )
          : detailBoard === undefined
            ? <ResolvingSkeleton label={t('proposals.loading')} />
            : summary !== undefined
              ? (
                <ProposalDetail
                  t={t}
                  projectId={props.projectId}
                  proposal={summary}
                  face={face}
                  onBack={props.onBack ?? (() => {})}
                />
              )
              : (
                // The slug left the settled board (live-refresh race): the
                // not-found card + back (the FeaturesPage precedent).
                <div data-dsh-forge-proposal-notfound="" style={errorCardStyle}>
                  <h3 style={cardTitleStyle}>{t('proposals.notFound.title')}</h3>
                  <p style={cardBodyStyle}>{t('proposals.notFound.body')}</p>
                  <div>
                    <ChromeButton
                      type="button"
                      data-dsh-forge-proposal-notfound-back=""
                      style={primaryButtonStyle}
                      onClick={props.onBack ?? (() => {})}
                    >
                      {t('proposals.notFound.back')}
                    </ChromeButton>
                  </div>
                </div>
              )
      )}
    </div>
  )
}

/**
 * The proposals tab's assembled page. Bridge presence is fixed for the
 * page's life (the preload namespace exists before any renderer code runs) —
 * resolve once, never re-probe. The unresolved window (the chrome's first
 * getState in flight) renders the resolving skeleton: the tab page owns its
 * loading branch, never an error flash.
 */
export function ProposalsPage(props: ProposalsPageProps) {
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  const [ipcFace] = useState(() => (bridge === undefined ? undefined : createIpcProposalFace(bridge)))
  const seatForm = props.seat !== undefined || bridge === undefined

  if (seatForm) {
    // The build-stage form, verbatim: the seat's face (or the mock twin when
    // absent) + the seat's lost-card seams over the chrome's projections.
    return (
      <ProposalsBoardBody
        t={props.t}
        projectId={props.projectId}
        proposalSlug={props.proposalSlug}
        onOpenProposal={props.onOpenProposal}
        onBack={props.onBack}
        onOpenFeature={props.onOpenFeature}
        docsLost={props.seat?.docsLost ?? props.docsLost}
        onRepoint={props.seat?.onRepoint ?? props.onRepoint}
        onRemove={props.seat?.onRemove ?? props.onRemove}
        face={props.seat?.face}
      />
    )
  }

  if (props.projectId === undefined) {
    // Real chain, project unresolved: the resolving skeleton (the page owns
    // its loading branch — the gate question is the chrome's, not this one).
    return (
      <div data-dsh-forge-proposal-page="" aria-busy="true" style={pageStyle}>
        <ResolvingSkeleton label={props.t('proposals.loading')} />
      </div>
    )
  }

  // The real chain: the IPC proposal face over the resolved active project
  // (mock 全撤 — no mock twin ever executes when the bridge is live).
  return (
    <ProposalsBoardBody
      t={props.t}
      projectId={props.projectId}
      proposalSlug={props.proposalSlug}
      onOpenProposal={props.onOpenProposal}
      onBack={props.onBack}
      onOpenFeature={props.onOpenFeature}
      docsLost={props.docsLost}
      onRepoint={props.onRepoint}
      onRemove={props.onRemove}
      face={ipcFace}
    />
  )
}
