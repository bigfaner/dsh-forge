/**
 * The UF4 feature 看板 page, BUILD half (task 5.9): the page the shell mounts
 * into its reserved `workbench/features` seat — the four-state machine the
 * tech-design test plan demands (loading 骨架 / empty 空态卡 / error 重试卡 /
 * populated) over the Interface 1 DTOs through the FeatureBoardFace seam,
 * plus the list↔detail routing the view-key machine drives: `featureSlug`
 * undefined renders the list, a slug renders the detail subview. The build
 * stage defaults to the shared mock twins (mocks/workbench
 * createMockFeatureBoardFace / createMockFeatureDocFace); the 5.16 assembly
 * injects the IPC verbs. No IPC runtime is touched here (the 5.x BUILD
 * layering rule).
 *
 * 返回保留列表态 (ui-design Interactions): the page stays mounted across the
 * list↔detail swap (the shell keeps THIS component for the whole features
 * tab — only the mount container's data attribute changes), so the loaded
 * board and the list's scroll position survive the round trip by
 * construction. A slug missing from the loaded board renders the not-found
 * card + back (a defensive state the assembly's live refresh can produce).
 *
 * Completion state (task 5.16): the board load is KEYED on projectId (a
 * project switch is a fresh page session — reload + doc-cache clear, the
 * Hard Rule) and the page owns the page-session doc cache
 * (store/feature-board.ts) the doc tabs read through — repeated opens of a
 * read doc never re-fire readFeatureDoc. The IPC faces themselves arrive via
 * the features seat (views/features/FeaturesView.tsx assembles them from the
 * ipc/workbench.ts adapter).
 *
 * Read-only discipline: the page's every interaction is navigation (card →
 * detail, breadcrumb → list, doc tabs) — no write affordance exists.
 */
import { useEffect, useRef, useState } from 'react'
import type { FeatureBoardData } from '../ipc-types'
import type { FeatureBoardFace, FeatureDocFace, StageFace } from '../contract'
import type { WorkbenchKey } from '../locale/en'
import { ChromeButton } from '../components/chrome/ChromeButton'
import { createMockFeatureBoardFace, createMockFeatureDocFace } from '../mocks/workbench'
import { createFeatureDocsCache } from '../store/feature-board'
import { FeatureList } from './features/FeatureList'
import { FeatureDetail } from './features/FeatureDetail'

/** Inputs of {@link FeaturesPage}. */
export interface FeaturesPageProps {
  /** The locale seat (the shell's `t`). */
  t: (key: WorkbenchKey) => string
  /** The active project the board reads (the Interface 1 verb argument). */
  projectId?: string | undefined
  /**
   * The view-key machine's feature-detail slug (the shell's projection of
   * the machine snapshot): undefined = the list, a slug = the detail subview.
   */
  featureSlug?: string | undefined
  /**
   * The enter-detail seam — the shell routes this into the view-key machine's
   * openFeatureDetail(slug) (the machine owns subview addressing).
   */
  onOpenFeature?: ((slug: string) => void) | undefined
  /**
   * The return seam — the shell routes this to the machine's tab action
   * (selectWorkbenchTab('workbench/features') clears the slug).
   */
  onBack?: (() => void) | undefined
  /** 仓外角标 premise (the active project's docLocationType = external). */
  externalDocs?: boolean | undefined
  /** The board face — absent members fall back to the build-stage mock (5.16 injects the IPC face). */
  face?: Partial<FeatureBoardFace> | undefined
  /** The doc face — absent members fall back to the build-stage mock (5.16 injects the IPC face). */
  docFace?: Partial<FeatureDocFace> | undefined
  /**
   * The UF2 stage face (task 4.4, Integration #2): drives the detail's gate
   * verdict + advance entry + sixth tab, and the page's own board reflux
   * (stage_advanced / deviation_detected for THIS project → board reload,
   * ≤5s — the deviation badge's 即时出现 leg). Absent = the M2 page form.
   */
  stageFace?: Partial<StageFace> | undefined
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

const emptyCardStyle = {
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

/** Skeleton gray rows (ui-design loading 态: 灰卡). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/**
 * The feature-board page. Renders nothing but the skeleton until the first
 * loadFeatureBoard settles; a failed load shows the error card + retry.
 */
export function FeaturesPage(props: FeaturesPageProps) {
  // Build-stage default faces: one isolated mock twin per mount (the 5.16
  // assembly spreads the IPC-backed members over them).
  const [defaultBoardFace] = useState(() => createMockFeatureBoardFace())
  const [defaultDocFace] = useState(() => createMockFeatureDocFace())
  const boardFace: FeatureBoardFace = { ...defaultBoardFace, ...props.face }
  const docFace: FeatureDocFace = { ...defaultDocFace, ...props.docFace }

  const [phase, setPhase] = useState<'loading' | 'ready' | 'load-error'>('loading')
  const [board, setBoard] = useState<FeatureBoardData | undefined>(undefined)
  const hasLoaded = useRef(false)

  // The page-session doc cache (task 5.16): one per page mount — it survives
  // the list↔detail round trips (the page stays mounted) and is CLEARED on a
  // project switch below (Hard Rule: 文档缓存仅在页内会话期,不得跨项目残留).
  const [docsCache] = useState(() => createFeatureDocsCache())

  const load = async (projectId: string): Promise<void> => {
    try {
      const next = await boardFace.loadFeatureBoard(projectId)
      hasLoaded.current = true
      setBoard(next)
      setPhase('ready')
    } catch {
      // A failed FIRST load has nothing to render — the retry card (the
      // board page's load discipline).
      if (!hasLoaded.current) setPhase('load-error')
    }
  }

  // Initial load + the project-switch reload (task 5.16): a projectId change
  // is a FRESH page session — the old project's board never stays visible and
  // the doc cache drops with it. The face identity is fixed for the page's
  // life (like the board page's).
  useEffect(() => {
    hasLoaded.current = false
    docsCache.clear()
    setBoard(undefined)
    setPhase('loading')
    void load(props.projectId ?? '')
  }, [props.projectId])

  // The UF2 board reflux (task 4.4): stage_advanced / deviation_detected for
  // THIS project re-fire the board verb over the stage face's shared
  // single-subscriber channel (≤5s on the real chain — the deviation badge's
  // 即时出现 leg and the post-advance status refresh; the loaded board stays
  // rendered while the re-read is in flight, 不打断焦点/滚动). Other
  // projects' events never reload this board.
  useEffect(() => {
    const subscribe = props.stageFace?.subscribeEvents
    if (subscribe === undefined) return
    return subscribe((events) => {
      for (const event of events) {
        // M4: project_list_changed carries no projectId — not feature-reflux.
        if (!('projectId' in event) || event.projectId !== props.projectId) continue
        if (event.type === 'stage_advanced' || event.type === 'deviation_detected') {
          void load(props.projectId ?? '')
        }
      }
    })
  }, [props.stageFace, props.projectId])

  const inDetail = props.featureSlug !== undefined
  const summary = inDetail && board !== undefined
    ? board.features.find(feature => feature.slug === props.featureSlug)
    : undefined

  return (
    <div data-dsh-forge-feature-board="" aria-busy={phase === 'loading' ? 'true' : 'false'} style={pageStyle}>
      {phase === 'loading' && (
        <div
          role="status"
          aria-label={props.t('features.loading')}
          data-dsh-forge-feature-skeleton=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      )}

      {phase === 'load-error' && (
        <div data-dsh-forge-feature-error="" role="alert" style={errorCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('features.loadError.title')}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <ChromeButton
              type="button"
              data-dsh-forge-feature-retry=""
              style={primaryButtonStyle}
              onClick={() => {
                setPhase('loading')
                void load(props.projectId ?? '')
              }}
            >
              {props.t('features.loadError.retry')}
            </ChromeButton>
          </div>
        </div>
      )}

      {phase === 'ready' && board !== undefined && board.features.length === 0 && !inDetail && (
        <div data-dsh-forge-feature-empty="" style={emptyCardStyle}>
          <h3 style={cardTitleStyle}>{props.t('features.empty.title')}</h3>
          <p style={cardBodyStyle}>{props.t('features.empty.body')}</p>
        </div>
      )}

      {phase === 'ready' && board !== undefined && !inDetail && board.features.length > 0 && (
        <FeatureList t={props.t} features={board.features} onOpenFeature={props.onOpenFeature} />
      )}

      {inDetail && (
        summary !== undefined
          ? (
            <FeatureDetail
              t={props.t}
              projectId={props.projectId}
              feature={summary}
              externalDocs={props.externalDocs}
              docFace={docFace}
              stageFace={props.stageFace}
              onStageAdvanced={() => { void load(props.projectId ?? '') }}
              docsCache={docsCache}
              onBack={props.onBack ?? (() => {})}
            />
          )
          : phase === 'load-error'
            ? null
            : (
              // Board not settled yet (or the slug left the board): the
              // skeleton while loading, the not-found card once loaded.
              board !== undefined
                ? (
                  <div data-dsh-forge-feature-notfound="" style={errorCardStyle}>
                    <h3 style={cardTitleStyle}>{props.t('features.notFound.title')}</h3>
                    <p style={cardBodyStyle}>{props.t('features.notFound.body')}</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <ChromeButton
                        type="button"
                        data-dsh-forge-feature-notfound-back=""
                        style={primaryButtonStyle}
                        onClick={props.onBack ?? (() => {})}
                      >
                        {props.t('features.notFound.back')}
                      </ChromeButton>
                    </div>
                  </div>
                )
                : (
                  <div
                    role="status"
                    aria-label={props.t('features.loading')}
                    data-dsh-forge-feature-skeleton=""
                    style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                  >
                    {[0, 1, 2, 3].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
                  </div>
                )
            )
      )}
    </div>
  )
}
