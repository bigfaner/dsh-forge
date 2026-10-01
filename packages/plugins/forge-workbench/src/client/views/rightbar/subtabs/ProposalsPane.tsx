/**
 * The 项目概览 → 提案 sub-tab (M4 task 2.3, layout §4.4①): the M3 提案板 face
 * re-homed into the pane as the DIRECTORY TREE the wireframe pins — 隐藏
 * docs/proposals/ 前缀,直接从 slug 起 (裁决 #9-⑤), one expandable dir row per
 * proposal (slug + the ONE status Pill vocabulary) with the feature doc names
 * as file rows whose click opens the DOC tab (§4.5; the kind 2.4 owns — the
 * openTab seam carries the identity today).
 *
 * 零缩水 discipline (Hard Rule): the M3 face's contract rides VERBATIM — the
 * same ProposalFace verb (loadBoard), the same four-state machine (loading
 * skeleton / error + retry / empty + the proposals-root hint / populated),
 * the same project-scoped `sync` 回流 (the loaded board stays rendered while
 * the re-read is in flight), and the feature 互跳 (the M3 row's feature
 * badge → the feature sub-tab, now via the pane's own seam). No M3 component
 * is modified; the M3 suites keep asserting their faces untouched (SC5).
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProposalBoardData } from '../../../ipc-types'
import type { ProposalFace } from '../../../contract'
import type { WorkbenchKey } from '../../../locale/en'
import { createMockProposalsFace } from '../../../mocks/workbench'
import { ChromeButton } from '../../../components/chrome/ChromeButton'
import { ProposalStatusPill } from '../../proposals/ProposalStatusPill'
import type { DocOpenInput } from '../OverviewTab'

/** Inputs of {@link ProposalsPane}. */
export interface ProposalsPaneProps {
  /** The locale seat (the plugin's bound `t`). */
  t: (key: WorkbenchKey) => string
  /** The ACTIVE project — the loadBoard verb argument; undefined = resolving. */
  projectId?: string | undefined
  /** The proposals face (the M3 verb twin; absent members fall back to the build-stage mock). */
  face?: Partial<ProposalFace> | undefined
  /** The 点文档名开文档 tab seam (§4.5 — 2.4 owns the tab's interior). */
  onOpenDoc: (input: DocOpenInput) => void
  /** The feature 互跳 seam — the M3 row's feature badge, routed to the feature sub-tab. */
  onOpenFeature?: ((featureSlug: string) => void) | undefined
}

/** The tree's column (the pane family's inline-token discipline). */
const rootStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  minWidth: 0,
  padding: '10px 8px',
} as const

/** One tree row (dir or file): full-width activation target, r8 hover fill. */
const rowStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  font: 'inherit',
  gap: '6px',
  minWidth: 0,
  padding: '6px 6px',
  textAlign: 'left',
} as const

/** The dir/file name slot: 14/22 mono, 单行截断 (the slug 代码栈 treatment). */
const nameStyle = {
  flex: '1 1 auto',
  fontSize: '13px',
  lineHeight: '20px',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const monoNameStyle = {
  ...nameStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** The trailing slot (dir status pill / file ⟶ hint): fixed, never truncated. */
const trailingStyle = {
  color: 'var(--dsw-alias-label-tertiary, rgb(129, 133, 140))',
  flex: '0 0 auto',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'nowrap',
} as const

/** The 互跳 feature chip (the M3 row's badge, the same brand-blue ghost). */
const featureChipStyle = {
  background: 'transparent',
  border: '1px solid var(--dsw-alias-link, rgb(65, 118, 230))',
  borderRadius: '8px',
  color: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  cursor: 'pointer',
  flex: '0 0 auto',
  font: 'inherit',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '18px',
  maxWidth: '120px',
  overflow: 'hidden',
  padding: '0 6px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

/** The file rows' indent (one tree level under the dir). */
const FILE_INDENT = '22px'

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

/** Skeleton gray rows (the M3 loading 态 twin). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '28px',
} as const

/** The empty/root hint: 12/18 secondary + mono root (the M3 empty card's hint). */
const auxStyle = {
  color: 'var(--dsw-alias-label-secondary, rgb(97, 102, 107))',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
  padding: '8px 6px',
} as const

const monoPathStyle = {
  ...auxStyle,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  overflowWrap: 'anywhere',
} as const

/**
 * The 提案 directory tree. Board load + 回流 follow the ProposalList contract
 * verbatim (the face identity is fixed for the mount; a projectId change is a
 * fresh session — the HOST re-keys the pane per project).
 */
export function ProposalsPane(props: ProposalsPaneProps): ReactNode {
  const t = props.t
  // Build-stage default face: one isolated mock twin per mount, seeded with
  // the mount-time project (the mock rejects foreign ids — the real verb's
  // ERR_PROJECT_NOT_FOUND discipline).
  const [defaultFace] = useState(() =>
    createMockProposalsFace(props.projectId === undefined ? {} : { projectId: props.projectId }))
  const face: ProposalFace = { ...defaultFace, ...props.face }
  const faceRef = useRef(face)
  faceRef.current = face
  const projectIdRef = useRef(props.projectId)
  projectIdRef.current = props.projectId

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [board, setBoard] = useState<ProposalBoardData | undefined>(undefined)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const hasLoaded = useRef(false)
  const seededRef = useRef(false)

  const load = async (): Promise<void> => {
    try {
      const next = await faceRef.current.loadBoard(projectIdRef.current ?? '')
      hasLoaded.current = true
      setBoard(next)
      setPhase('ready')
      // The FIRST dir rides expanded on a FRESH session only (the §4.4①
      // wireframe's ▾ first row); a 回流 refresh keeps the user's set, and a
      // user who collapses everything keeps it that way.
      if (!seededRef.current) {
        seededRef.current = true
        setExpanded(next.proposals.length > 0 ? new Set([next.proposals[0]!.slug]) : new Set())
      }
    } catch {
      // A failed FIRST load shows the retry card; a failed refresh keeps the
      // last good board (不打断 — the M3 contract).
      if (!hasLoaded.current) setPhase('load-error')
    }
  }

  // Initial load (unresolved project → the resolving skeleton, never a load).
  useEffect(() => {
    if (props.projectId === undefined) return
    hasLoaded.current = false
    seededRef.current = false
    setBoard(undefined)
    setPhase('loading')
    setExpanded(new Set())
    void load()
  }, [props.projectId])

  // The 回流 leg: project-scoped `sync` pushes re-fire the board read with
  // the loaded board kept rendered (the M3 ProposalList contract).
  useEffect(() => {
    const subscribe = faceRef.current.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      const mine = projectIdRef.current === undefined
        || events.some(event => event.type === 'sync' && event.projectId === projectIdRef.current)
      if (mine) void load()
    })
  }, [])

  const toggleDir = (slug: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  const rows = board?.proposals ?? []
  const isOpen = (slug: string): boolean => expanded.has(slug)

  return (
    <div data-dsh-forge-overview-proposals="" style={rootStyle}>
      {phase === 'loading' && (
        <div role="status" aria-label={t('proposals.loading')} data-dsh-forge-overview-proposals-skeleton="">
          {[0, 1, 2].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-overview-proposals-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{t('proposals.loadError.title')}</h3>
          <div>
            <ChromeButton
              type="button"
              data-dsh-forge-overview-proposals-retry=""
              style={primaryButtonStyle}
              onClick={() => {
                setPhase('loading')
                void load()
              }}
            >
              {t('proposals.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && board !== undefined && rows.length === 0 && (
        <div data-dsh-forge-overview-proposals-empty="">
          <p style={auxStyle}>{t('proposals.empty.title')}</p>
          <p data-dsh-forge-overview-proposals-root="" title={board.proposalsRoot} style={monoPathStyle}>
            {board.proposalsRoot}
          </p>
        </div>
      )}

      {phase === 'ready' && board !== undefined && rows.length > 0 && rows.map((row) => {
        const open = isOpen(row.slug)
        return (
          <div key={row.slug} data-dsh-forge-overview-prop-dir-group={row.slug}>
            <button
              type="button"
              data-dsh-forge-overview-prop-dir={row.slug}
              aria-expanded={open ? 'true' : 'false'}
              style={rowStyle}
              onClick={() => { toggleDir(row.slug) }}
            >
              <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: '10px' }}>{open ? '▾' : '▸'}</span>
              <span title={row.slug} style={monoNameStyle}>{`${row.slug}/`}</span>
              {row.featureSlug !== null && (
                <ChromeButton
                  type="button"
                  data-dsh-forge-overview-prop-feature={row.featureSlug}
                  aria-label={row.featureSlug}
                  title={row.featureSlug}
                  style={featureChipStyle}
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onOpenFeature?.(row.featureSlug ?? '')
                  }}
                >
                  {`→ ${row.featureSlug}`}
                </ChromeButton>
              )}
              <ProposalStatusPill status={row.status} t={t} />
            </button>
            {open && (
              <div role="group" aria-label={row.slug} style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: FILE_INDENT }}>
                <button
                  type="button"
                  data-dsh-forge-overview-doc={`proposals/${row.slug}/proposal`}
                  title={t('rightbar.overview.doc.open')}
                  style={rowStyle}
                  onClick={() => {
                    props.onOpenDoc({
                      path: `docs/proposals/${row.slug}/proposal.md`,
                      displayName: `${row.slug}/${t('proposals.detail.tab.proposal')}`,
                    })
                  }}
                >
                  <span title={t('proposals.detail.tab.proposal')} style={monoNameStyle}>
                    {t('proposals.detail.tab.proposal')}
                  </span>
                  <span aria-hidden="true" style={trailingStyle}>⟶ {t('rightbar.overview.doc.open')}</span>
                </button>
                {row.hasEval && (
                  <button
                    type="button"
                    data-dsh-forge-overview-doc={`proposals/${row.slug}/eval`}
                    title={t('rightbar.overview.doc.open')}
                    style={rowStyle}
                    onClick={() => {
                      props.onOpenDoc({
                        path: `docs/proposals/${row.slug}/eval`,
                        displayName: `${row.slug}/${t('proposals.detail.tab.eval')}`,
                      })
                    }}
                  >
                    <span title={t('proposals.detail.tab.eval')} style={monoNameStyle}>
                      {t('proposals.detail.tab.eval')}
                    </span>
                    <span aria-hidden="true" style={trailingStyle}>⟶ {t('rightbar.overview.doc.open')}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
