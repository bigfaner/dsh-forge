/**
 * The UF4 features tab's COMPLETION assembly (task 5.16, Implementation
 * Notes file): the component the shell now mounts on the features seat —
 * it swaps the 5.9 build-stage page's mocked data plane for the REAL IPC
 * chain (mock 全撤 in the real host: no mock twin ever executes when the
 * dshForge bridge is live).
 *
 * Form selection (one rule, no shell knowledge):
 *   seat present (the shell's `features` prop — the explicit test/build
 *     injection) or bridge ABSENT (jsdom / hostless mounts)
 *       → FeaturesPage on the injected/mock faces, exactly the 5.9 behavior;
 *   bridge live and no seat (the real desktop host)
 *       → the real chain below.
 *
 * The real chain (the pattern 5.14 overview / 5.15 task board reuse):
 *   1. getState() resolves the ACTIVE PROJECT once per mount (+ retry):
 *      activeProjectId drives the page — null renders the 5.1 state-gate
 *      guidance card (page-map: 无激活项目 guides to registration, never an
 *      error; no board/doc verb fires without a project id).
 *   2. The faces are the ipc/workbench.ts adapter's (1:1 verb mapping,
 *      rejections normalized to the plain WorkbenchVerbError shape).
 *   3. FeaturesPage owns the page-session store (board reload + doc-cache
 *      clear on a project switch — the Hard Rule) and the list↔detail
 *      routing stays on the view-key machine exactly as built in 5.9.
 *
 * No event subscription here by design: 5.16's scope is the pulled reads
 * (getFeatureBoard / readFeatureDoc); the feature_updated → board refresh
 * leg rides the 5.15 assembly's single-subscriber channel, not this task.
 */
import { useEffect, useState } from 'react'
import type { WorkbenchFeaturesSeat } from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import { createIpcFeatureBoardFace, createIpcFeatureDocFace, getWorkbenchIpcBridge } from '../../ipc/workbench'
import type { WorkbenchIpcBridge } from '../../ipc/workbench'
import { ChromeButton } from '../../components/chrome/ChromeButton'
import { FeaturesPage } from '../FeaturesPage'

/** Inputs of {@link FeaturesView}. */
export interface FeaturesViewProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The view-key machine's feature-detail slug (the shell's projection). */
  featureSlug?: string | undefined
  /** The enter-detail seam (the machine's openFeatureDetail). */
  onOpenFeature?: ((slug: string) => void) | undefined
  /** The return seam (the machine's tab action clears the slug). */
  onBack?: (() => void) | undefined
  /**
   * The no-project guidance card's register entry — the shell's addProject
   * seam (the same CTA the 5.1 state gate fires).
   */
  onRegister?: (() => void) | undefined
  /** The explicit assembly seat (tests / build stage) — present wins over the bridge. */
  seat?: WorkbenchFeaturesSeat | undefined
  /** The chrome projection for the seat path (build-stage mock state's projectId). */
  chromeProjectId?: string | undefined
  /** The chrome projection for the seat path (mock active project's external flag). */
  chromeExternalDocs?: boolean | undefined
}

/** The active-project resolution (the real path's first read). */
type ProjectResolution =
  | { phase: 'resolving' }
  | { phase: 'missing' }
  | { phase: 'error' }
  | { phase: 'active'; projectId: string; externalDocs: boolean }

/** The page's column geometry (the FeaturesPage container's twin). */
const viewStyle = {
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

const gateCardStyle = {
  ...cardStyle,
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, CanvasText)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '48px 14px',
  textAlign: 'center',
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

/** md primary pill (the retry / register CTAs — the board page precedent). */
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

/** Skeleton gray rows (ui-design loading 态: 灰卡 — the page's twin). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/**
 * The features tab's assembled view. Resolves the active project over the
 * real bridge (one getState per mount, retryable), then hands FeaturesPage
 * the IPC faces; the seat/bridge-absent forms reproduce the 5.9 page exactly.
 */
export function FeaturesView(props: FeaturesViewProps) {
  // Bridge presence is fixed for the view's life (the preload namespace
  // exists before any renderer code runs) — resolve once, never re-probe.
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  // Face identities fixed with it (FeaturesPage keys its loads on projectId).
  const [boardFace] = useState(() => (bridge === undefined ? undefined : createIpcFeatureBoardFace(bridge)))
  const [docFace] = useState(() => (bridge === undefined ? undefined : createIpcFeatureDocFace(bridge)))

  const [project, setProject] = useState<ProjectResolution>({ phase: 'resolving' })
  const [resolveNonce, setResolveNonce] = useState(0)

  const seatForm = props.seat !== undefined || bridge === undefined

  // The real path's project resolution: one getState per mount / retry — the
  // activeProjectId the board + doc verbs are qualified with.
  useEffect(() => {
    if (seatForm || bridge === undefined) return
    let alive = true
    setProject({ phase: 'resolving' })
    bridge.getState()
      .then((state) => {
        if (!alive) return
        const active = state.projects.find(row => row.id === state.activeProjectId)
        if (state.activeProjectId === null) {
          setProject({ phase: 'missing' })
        } else if (active === undefined) {
          // Dangling pointer (registry damage the transactions prevent):
          // degrade to the retryable error read, never a cross-project guess.
          setProject({ phase: 'error' })
        } else {
          setProject({ phase: 'active', projectId: active.id, externalDocs: active.docLocationType === 'external' })
        }
      })
      .catch(() => {
        if (alive) setProject({ phase: 'error' })
      })
    return () => { alive = false }
  }, [seatForm, resolveNonce])

  if (seatForm) {
    // The 5.9 form, verbatim: the seat's faces (or the build-stage mock twins
    // when absent) over the chrome's project projection.
    return (
      <FeaturesPage
        t={props.t}
        projectId={props.chromeProjectId}
        featureSlug={props.featureSlug}
        onOpenFeature={props.onOpenFeature}
        onBack={props.onBack}
        externalDocs={props.chromeExternalDocs}
        face={props.seat?.face}
        docFace={props.seat?.docFace}
      />
    )
  }

  if (project.phase === 'resolving') {
    return (
      <div data-dsh-forge-feature-board="" aria-busy="true" style={viewStyle}>
        <div
          role="status"
          aria-label={props.t('features.loading')}
          data-dsh-forge-feature-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      </div>
    )
  }

  if (project.phase === 'missing') {
    // The page-map state gate's card (the 5.1 wording): a guidance card, not
    // an error — registration is the unlock.
    return (
      <div data-dsh-forge-feature-gate="" style={gateCardStyle}>
        <h3 style={cardTitleStyle}>{props.t('gate.title')}</h3>
        <p style={cardBodyStyle}>{props.t('gate.body')}</p>
        {props.onRegister !== undefined && (
          <ChromeButton
            type="button"
            data-dsh-forge-feature-gate-register=""
            style={primaryButtonStyle}
            onClick={() => { props.onRegister?.() }}
          >
            {props.t('gate.register')}
          </ChromeButton>
        )}
      </div>
    )
  }

  if (project.phase === 'error') {
    return (
      <div data-dsh-forge-feature-project-error="" role="alert" style={errorCardStyle}>
        <h3 style={cardTitleStyle}>{props.t('features.loadError.title')}</h3>
        <div>
          <ChromeButton
            type="button"
            data-dsh-forge-feature-project-retry=""
            style={primaryButtonStyle}
            onClick={() => { setResolveNonce(nonce => nonce + 1) }}
          >
            {props.t('features.loadError.retry')}
          </ChromeButton>
        </div>
      </div>
    )
  }

  // The real chain: the IPC faces over the resolved active project. A project
  // switch re-keys FeaturesPage's load (board reload + doc-cache clear).
  return (
    <FeaturesPage
      t={props.t}
      projectId={project.projectId}
      featureSlug={props.featureSlug}
      onOpenFeature={props.onOpenFeature}
      onBack={props.onBack}
      externalDocs={project.externalDocs}
      face={boardFace}
      docFace={docFace}
    />
  )
}
