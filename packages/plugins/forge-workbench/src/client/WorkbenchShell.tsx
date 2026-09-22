/**
 * The workbench main-panel shell (task 3.2 scaffold, view-key driven since
 * task 3.3, chrome since task 5.1). It mounts as the `main` slot's
 * `workbench` key — in the slot path chosen by the upstream sidebar, in the
 * fallback rail rendered inside the plugin-owned overlay container — the SAME
 * component either way, so the two forms cannot diverge (Hard Rule).
 *
 * Task 3.3 added the dual-view face: the view-key selector drives the tab
 * strip (概览/任务/feature, role=tab + aria-selected per ui-design) and the
 * view-key → container mapping table below; the mount/lifecycle notifications
 * report external panel selection back to the shared controller.
 *
 * Task 5.1 lands the page chrome inside that shell: the top bar (app
 * identity + project switcher + 「添加项目」, ui-design 顶栏), the three-tab
 * strip as the TabBar component (the view-key machine's tab dimension — the
 * only tab state, persisted by 3.3), and the page-map STATE GATE: with no
 * active project the tasks/features tabs present a registration guide
 * (引导态, never an error), while the UF1-UF6 views land inside the reserved
 * mount containers in the remaining 5.x tasks.
 *
 * Task 5.3 fills the first seat: the UF1 overview page mounts into the
 * reserved `workbench/overview` container (ungated — the page owns its own
 * empty state), its register CTA firing the same addProject seam as the
 * chrome; the optional `overview` prop is the 5.14 assembly seat (IPC face +
 * sync signals), absent in the build stage where the page runs its mock twin.
 *
 * Task 5.14 completes the overview family's ASSEMBLY: with the preload
 * bridge live and no explicit chrome state member, the shell runs its whole
 * chrome (switcher + gate), the overview tab, and the register wizard on ONE
 * store-backed real chain (store/workbench-state.ts — a single getState per
 * first paint, onEvents-derived 失联 signals, mutation refreshes through the
 * same store) and mounts the ASSEMBLED view (views/overview/OverviewView)
 * on the overview seat; the wizard's WRITE pair goes over the bridge while
 * its probes keep the build-stage twin (no Interface 1 probe verb). The
 * explicit seats / hostless mounts reproduce the build-stage forms — the
 * DI switch discipline every assembly keeps.
 *
 * Task 5.4 owns the register entry: the addProject seam (chrome 「添加项目」/
 * overview empty card / state-gate card) and the overview lost-card repoint
 * seam open the UF1 register wizard overlay (`workbench/dialog/register`) —
 * register mode and the prefilled edit mode (repoint/rename) respectively.
 * The optional `wizard` prop is its assembly seat (IPC face + locate
 * treatment); absent, the dialog runs on its build-stage mock twin.
 *
 * Task 5.5 fills the tasks seat: the UF2 board page (toolbar + 视图 B 状态
 * 分组 + 视图 C 列表 over the mock twin; 视图 A remains the switcher's 5.6
 * placeholder). The optional `taskBoard` prop is its assembly seat — the
 * IPC face arrives with 5.15, the row-selection seam is 5.7's detail dock.
 *
 * Task 5.15 completes the tasks seat's ASSEMBLY: the shell mounts the
 * assembled view (views/tasks/TasksView) — the real dshForge bridge drives
 * the store-backed board chain (ONE getTaskBoard first paint, the 回流
 * event loop, the IPC detail face; mock 全撤), while the explicit seat /
 * hostless mounts reproduce the 5.5/5.8 build-stage page.
 *
 * Task 5.9 filled the LAST reserved seat: the UF4 feature board page mounts
 * into `workbench/features`, routing list↔detail on the view-key machine's
 * featureSlug dimension (enter = the view face's openFeatureDetail, return =
 * the tab action clearing the slug — the machine stays the single addressing
 * authority). Task 5.16 completes the seat: the shell now mounts the
 * ASSEMBLED view (views/features/FeaturesView) — the real dshForge bridge
 * drives it (getState-sourced active project + the getFeatureBoard /
 * readFeatureDoc IPC faces, mock 全撤), while the optional `features` prop
 * (the explicit seat) and hostless mounts reproduce the 5.9 build-stage
 * page. With 5.9 the 3.2 placeholder retired — every tab of the strip
 * carries its page.
 *
 * Data layering (breakdown rule): the chrome renders against Interface 1 DTO
 * types + the shared mock (mocks/workbench.ts) through the optional
 * WorkbenchChromeFace — the 5.14-5.16 assembly tasks inject the IPC-backed
 * face; absent members keep the build-stage stubs.
 *
 * The board area stays wrapped in @xyflow/react's ReactFlowProvider: the
 * shell establishes the flow context once, so 5.x task-board views consume
 * useReactFlow without mounting their own provider — and the dependency-tree
 * engine (D4) enters through this plugin's bundle, never the shell's.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import type { WorkbenchShellProps } from './contract'
import type { Project, WorkbenchState } from './ipc-types'
import type { WorkbenchKey } from './locale/en'
import { WORKBENCH_DIALOG_PREFIX, type WorkbenchTabKey } from './store/view-key'
import { MOCK_WORKBENCH_STATE } from './mocks/workbench'
import { createIpcRegisterWizardVerbs, getWorkbenchIpcBridge, normalizeWorkbenchVerbError } from './ipc/workbench'
import {
  createWorkbenchStateStore, INITIAL_WORKBENCH_STATE_SNAPSHOT, type WorkbenchStateStore,
} from './store/workbench-state'
import { fillTemplate } from './views/overview/format'
import { TOAST_Z } from './views/tasks/launch/LaunchStates'
import { ChromeButton } from './components/chrome/ChromeButton'
import { TabBar } from './components/chrome/TabBar'
import { TopBar } from './components/chrome/TopBar'
import { OverviewView } from './views/overview/OverviewView'
import type { RegisterWizardResult } from './views/overview/RegisterWizard'
import { RegisterWizard } from './views/overview/RegisterWizard'
import { TasksView } from './views/tasks/TasksView'
import { FeaturesView } from './views/features/FeaturesView'

/**
 * view-key → container mapping table (task 3.3 AC5): every workbench view key
 * the page-map defines reserves its mount container here. M2 5.x lands the UF
 * views INTO these seats — the reservation is the contract, no shell change
 * will be needed then. `:slug` is the feature-detail subview
 * (`workbench/features/<slug>`), `workbench/dialog/*` the 5.x overlay family.
 */
export const VIEW_MOUNT_TABLE = {
  'workbench/overview': { container: 'dsh-forge-view-overview' },
  'workbench/tasks': { container: 'dsh-forge-view-tasks' },
  'workbench/features': { container: 'dsh-forge-view-features' },
  'workbench/features/:slug': { container: 'dsh-forge-view-feature-detail' },
  [`${WORKBENCH_DIALOG_PREFIX}*`]: { container: 'dsh-forge-dialog-layer' },
} as const

/**
 * Resolve the active mount container for a snapshot's workbench interior.
 * @param tab - the active workbench tab.
 * @param featureSlug - the feature-detail slug, when the subview is open.
 * @returns the mount container id from {@link VIEW_MOUNT_TABLE}.
 */
export function resolveViewMount(
  tab: WorkbenchTabKey,
  featureSlug: string | undefined,
): string {
  if (tab === 'workbench/features' && featureSlug !== undefined) {
    return VIEW_MOUNT_TABLE['workbench/features/:slug'].container
  }
  return VIEW_MOUNT_TABLE[tab].container
}

/** Inline shell chrome: no stylesheet pipeline, host `--dsh-*` vars carry the theme (scoped styles only — Hard Rule). */
const shellStyle = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minWidth: '0',
} as const

const contentStyle = {
  display: 'flex',
  flex: 1,
  flexDirection: 'column',
  minHeight: 0,
  overflowY: 'auto',
  padding: '16px',
} as const

/** The gate card's base: dashed placeholder geometry (only the state gate uses it since 5.9). */
const gateBaseStyle = {
  alignItems: 'center',
  border: '1px dashed var(--dsh-border-color, currentColor)',
  borderRadius: 8,
  display: 'flex',
  flex: 1,
  justifyContent: 'center',
} as const

/** The gate card: ui-design 空态卡 geometry, dashed, with the register CTA. */
const gateStyle = {
  ...gateBaseStyle,
  flexDirection: 'column',
  gap: '8px',
  textAlign: 'center',
} as const

const gateTitleStyle = {
  fontSize: '16px',
  fontWeight: 500,
  lineHeight: '24px',
} as const

const gateBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: '420px',
} as const

/** The register CTA: md primary pill (brand action color). */
const gateButtonStyle = {
  background: 'var(--dsw-alias-link, rgb(65, 118, 230))',
  border: 'none',
  borderRadius: '14px',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
  height: '28px',
  padding: '0 12px',
} as const

/**
 * The real-path chrome's pre-read placeholder (task 5.14): while the first
 * getState is in flight (or failed with no last-good state) the chrome holds
 * NO registry — never the build-stage mock fixtures (mock 全撤 covers the
 * chrome too). The tab pages own their loading branches in that window.
 */
const UNRESOLVED_CHROME_STATE: WorkbenchState = Object.freeze({
  projects: Object.freeze([]),
  activeProjectId: null,
  plugins: Object.freeze([]),
})

/** The shell-level toast card (z1100, role=status — the OverviewPage twin). */
const shellToastStyle = {
  background: 'var(--dsh-bg, Canvas)',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  bottom: '16px',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  gap: '10px',
  maxWidth: '360px',
  padding: '12px 14px',
  position: 'fixed',
  right: '16px',
  zIndex: TOAST_Z,
} as const

const shellToastBodyStyle = {
  color: 'var(--dsw-alias-label-secondary, inherit)',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
  maxWidth: 'none',
} as const

const shellToastDismissStyle = {
  background: 'transparent',
  border: '1px solid var(--dsh-border-color, CanvasText)',
  borderRadius: '14px',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
  height: '24px',
  padding: '0 8px',
} as const

/** The wizard's open target: fresh register, or the prefilled edit (repoint/rename) row. */
type WizardTarget = { mode: 'register' } | { mode: 'edit'; project: Project }

/**
 * The state gate (page-map Route Guard equivalence): without an active
 * project the project-scoped tabs guide to registration — a guidance card,
 * deliberately NOT an error surface.
 */
function StateGate(props: { t: (key: WorkbenchKey) => string; onRegister: () => void }) {
  return (
    <div data-dsh-forge-gate="" style={gateStyle}>
      <strong style={gateTitleStyle}>{props.t('gate.title')}</strong>
      <p style={gateBodyStyle}>{props.t('gate.body')}</p>
      <ChromeButton
        type="button"
        data-dsh-forge-gate-register=""
        style={gateButtonStyle}
        onClick={() => { props.onRegister() }}
      >
        {props.t('gate.register')}
      </ChromeButton>
    </div>
  )
}

/**
 * The registered main-panel component: top bar (identity + project switcher +
 * add action), the three-tab strip (the view-key machine's tab dimension),
 * and the gated/ungated mount container the active view key addresses (the
 * 3.2 placeholder retired: since 5.9 every tab of the strip carries its page).
 * @param props - composed props: the main slot's runtime share, the `t` seat,
 *   the view face (selector + tab action + panel lifecycle), and (optionally,
 *   assembly-time) the chrome data face — absent members use the build-stage
 *   mock + local stubs.
 */
export function WorkbenchShell(props: WorkbenchShellProps) {
  const view = props.useViewKey(snapshot => snapshot)
  // The UF5 launch seat (5.11): an observable — the rpc members land when the
  // remote namespaces mount; absent seat = the entries keep the build-stage
  // mocks (hostless mounts, unit tests).
  const launch = useSyncExternalStore(
    props.launch?.subscribe ?? (() => () => {}),
    props.launch?.getSnapshot ?? (() => undefined),
  )
  // Task 5.14 — the real chrome data path: with the preload bridge live and
  // no explicit chrome state member, the chrome (switcher + gate), the UF1
  // page, and the register wizard run on ONE store-backed getState chain
  // (store/workbench-state.ts; mock 全撤); the bridge absent (hostless jsdom
  // / build stage) or the explicit member present keeps the 5.1 mock + local
  // stubs — the DI switch. Bridge presence is fixed for the shell's life.
  const [bridge] = useState(() => getWorkbenchIpcBridge())
  const [stateStore] = useState<WorkbenchStateStore | undefined>(() =>
    props.workbenchState === undefined && bridge !== undefined
      ? createWorkbenchStateStore(bridge)
      : undefined)
  const chromeSnapshot = useSyncExternalStore(
    stateStore?.subscribe ?? (() => () => {}),
    stateStore?.getSnapshot ?? (() => INITIAL_WORKBENCH_STATE_SNAPSHOT),
  )
  useEffect(() => {
    if (stateStore === undefined) return
    // The store lives and dies with the shell's mount (the keyed main slot /
    // the rail overlay both remount the whole shell on view switches).
    return () => { stateStore.dispose() }
  }, [stateStore])
  useEffect(() => {
    if (stateStore === undefined) return
    // The first paint's read — the page's own loadState shares it through
    // the store's in-flight coalescing (ONE round trip). A rejection's
    // observable lives in the snapshot phase; nothing to rethrow here.
    // The same effect re-arms on every TAB switch: a context switch is the
    // natural re-sync point for registry drift written behind the shell
    // (devtools/bridge-side writes) — the shell-owned mutations refresh on
    // their own, the boot-mounted shell otherwise wouldn't.
    void stateStore.refresh().catch(() => {})
  }, [stateStore, view.workbenchTab])
  // The wizard's real WRITE pair (5.14): registerProject / updateProject
  // over the bridge, rejections normalized. The step-①/② probes keep the
  // wizard's build-stage twin (no Interface 1 probe verb — the real
  // validation is the submit-time main-side chain; ipc/workbench.ts notes).
  const [wizardVerbs] = useState(() => (bridge === undefined ? undefined : createIpcRegisterWizardVerbs(bridge)))
  // Build-stage defaults (UI dependency layering): the shared mock + a local
  // single-activation stub. Assembly (5.14-5.16) overrides the whole face
  // with the IPC-backed implementation.
  const [mockState, setMockState] = useState(() => MOCK_WORKBENCH_STATE)
  const workbenchState = props.workbenchState
    ?? (stateStore !== undefined ? (chromeSnapshot.state ?? UNRESOLVED_CHROME_STATE) : mockState)
  // The shell-level toast (the register-success 提示可切换 notice + the
  // chrome verb failure copy — the wizard is shell-owned, so its success
  // toast is too; the page keeps its own verb toasts).
  const [shellToast, setShellToast] = useState<string | undefined>(undefined)
  // The external-mutation epoch (5.14): bumped when a mutation the overview
  // PAGE didn't fire (the wizard's register/repoint, the chrome switcher's
  // activation) refreshed the registry — OverviewView rides it through as
  // the page's reloadToken (re-read without a remount).
  const [externalReloadNonce, setExternalReloadNonce] = useState(0)
  const activateProject = props.activateProject
    ?? (stateStore !== undefined
      ? (id: string) => {
        void stateStore.bridge.activateProject(id)
          .then(() => stateStore.refresh())
          .then(() => { setExternalReloadNonce(nonce => nonce + 1) })
          .catch((error: unknown) => {
            setShellToast(fillTemplate(props.t('overview.toast.failed'), {
              message: normalizeWorkbenchVerbError(error).message,
            }))
          })
      }
      : (id: string) => { setMockState(state => ({ ...state, activeProjectId: id })) })

  // The register wizard (task 5.4): the addProject / repoint seams open the
  // `workbench/dialog/register` overlay — register mode, or the prefilled edit
  // mode. The dialog runs its own per-mount mock twin (the OverviewPage
  // precedent); the 5.14 seat injects the IPC face over it. The opener
  // snapshots focus so close returns there.
  const [wizardTarget, setWizardTarget] = useState<WizardTarget | undefined>(undefined)
  const wizardTriggerRef = useRef<HTMLElement | null>(null)
  const openWizard = (target: WizardTarget): void => {
    wizardTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setWizardTarget(target)
  }
  const addProject = props.addProject ?? (() => { openWizard({ mode: 'register' }) })

  // External-selection sync (slot path): mounting means an actor selected the
  // workbench panel, unmounting means it left. Stable callbacks — run once.
  useEffect(() => {
    props.notifyPresented?.()
    return () => { props.notifyDismissed?.() }
  }, [])

  /** Close the wizard and return focus to the opener (the dialog contract). */
  const closeWizard = (result?: RegisterWizardResult): void => {
    setWizardTarget(undefined)
    const trigger = wizardTriggerRef.current
    if (trigger !== null && document.contains(trigger)) trigger.focus()
    if (result === undefined) return
    // A completed submit (5.14): refresh the registry the whole family reads
    // (single-source consistency) and surface the register-success 提示可切换
    // notice (AC4 — the new project is immediately visible in the grid; the
    // register verb itself never activates, activateProject is the
    // single-active transaction).
    if (stateStore !== undefined) {
      void stateStore.refresh()
        .then(() => {
          setExternalReloadNonce(nonce => nonce + 1)
          if (result.action === 'register') {
            setShellToast(fillTemplate(props.t('overview.toast.registered'), {
              name: result.project.displayName,
            }))
          }
        })
        .catch(() => {})
      return
    }
    // The build-stage twin: mirror the completion into the local mock state
    // so the chrome's registry stays coherent with the wizard's outcome.
    if (result.action === 'register') {
      setMockState(state => ({ ...state, projects: [...state.projects, result.project] }))
      setShellToast(fillTemplate(props.t('overview.toast.registered'), {
        name: result.project.displayName,
      }))
    } else {
      setMockState(state => ({
        ...state,
        projects: state.projects.map(row => (row.id === result.project.id ? result.project : row)),
      }))
    }
  }

  /**
   * The build-stage locate (ERR_PROJECT_EXISTS terminal): scroll the existing
   * card into view — the 5.14 seat's onLocate replaces the treatment
   * (scroll + highlight + toast).
   */
  const locateProject = (project: Project): void => {
    const card = document.querySelector(`[data-dsh-forge-project-card="${project.id}"]`)
    if (card !== null && typeof (card as HTMLElement).scrollIntoView === 'function') {
      ;(card as HTMLElement).scrollIntoView({ block: 'center' })
    }
  }

  // The page-map state gate: project-scoped tabs (tasks/features, the
  // feature-detail subview included) need an active project; the overview tab
  // owns its own empty state (UF1/5.3) and keeps its mount container. The
  // real path gates only on a RESOLVED registry — while the first getState is
  // pending (or failed with no last-good state) the tab pages own their own
  // loading branches, so no gate flash precedes them.
  const chromeUnresolved = stateStore !== undefined && chromeSnapshot.state === undefined
  const gated = !chromeUnresolved
    && workbenchState.activeProjectId === null
    && view.workbenchTab !== 'workbench/overview'
  // The real path's switch contract (ui-design UF1 切换 interaction): a chrome
  // activation re-keys the project-scoped tab mounts so their data rebuilds
  // for the new active project (loading skeleton first — never stale rows).
  const activeProjectKey = stateStore !== undefined && workbenchState.activeProjectId !== null
    ? workbenchState.activeProjectId
    : undefined

  // 仓外角标 premise (ui-design UF4 / DF005): the feature detail badges the
  // active project's external doc location.
  const activeProject = workbenchState.projects.find(
    project => project.id === workbenchState.activeProjectId,
  )

  // The board's vertical scroll memory (5.11 AC4): this div is the vertical
  // scroller; with a board session store it restores on entering the tasks
  // tab and saves on leaving (a UF5 round-trip unmounts the whole shell in
  // the slot path — the store is the memory that survives it).
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view.workbenchTab !== 'workbench/tasks') return
    const element = contentRef.current
    const session = props.boardSession
    if (element === null || session === undefined) return
    element.scrollTop = session.getScroll().contentScrollTop
    return () => { session.saveScroll({ contentScrollTop: element.scrollTop }) }
    // The store identity is fixed for the app's life (created in the client
    // apply); re-arming per tasks-tab entry is the restore contract.
  }, [view.workbenchTab, props.boardSession])

  return (
    <div data-dsh-forge-plugin="forge-workbench" data-dsh-forge-shell="" style={shellStyle}>
      <TopBar
        t={props.t}
        projects={workbenchState.projects}
        activeProjectId={workbenchState.activeProjectId}
        onActivate={activateProject}
        onAddProject={addProject}
      />
      <TabBar t={props.t} activeTab={view.workbenchTab} onSelect={props.selectWorkbenchTab} />
      <ReactFlowProvider>
        <div ref={contentRef} data-dsh-forge-content="" style={contentStyle}>
          {gated
            ? <StateGate t={props.t} onRegister={addProject} />
            : view.workbenchTab === 'workbench/overview'
              ? (
                // UF1 (task 5.3 build · 5.14 assembly): the overview tab owns
                // its own empty state, so it takes the reserved seat WITHOUT
                // the state gate. The ASSEMBLED view swaps the page's mock
                // data plane for the real chain when the shell's store is
                // live (IPC faces + store-routed getState + sync-derived 失联
                // signals); the explicit overview seat / a hostless mount
                // reproduces the 5.3 build-stage page. The register CTA fires
                // the same addProject seam as the chrome; the lost-card
                // repoint defaults to the 5.4 wizard's EDIT mode (the seat
                // can override either).
                <div data-dsh-forge-view={resolveViewMount(view.workbenchTab, view.featureSlug)}>
                  <OverviewView
                    t={props.t}
                    onRegister={addProject}
                    onRepoint={props.overview?.onRepoint ?? ((project) => { openWizard({ mode: 'edit', project }) })}
                    reloadToken={externalReloadNonce}
                    seat={props.overview}
                    store={stateStore}
                  />
                </div>
              )
              : view.workbenchTab === 'workbench/tasks'
                ? (
                  // UF2 (task 5.5 build · 5.15 assembly) + UF3 integration
                  // (task 5.8): the tasks seat now mounts the ASSEMBLED view
                  // — with the real dshForge bridge live it runs the
                  // store-backed chain (ONE getTaskBoard per first paint +
                  // the 回流 coalesce-then-fetch event loop over the shared
                  // single-subscriber channel + the IPC detail face, mock
                  // 全撤); the explicit taskBoard seat / a hostless mount
                  // reproduces the 5.5/5.8 build-stage page. The active
                  // project's codeRoot mounts the UF5 entries (5.11:
                  // node-card hover + the panel-primary, real services via
                  // the launch seat); the key re-mounts per project switch.
                  <div data-dsh-forge-view={resolveViewMount(view.workbenchTab, view.featureSlug)}>
                    <TasksView
                      key={activeProjectKey}
                      t={props.t}
                      projectId={workbenchState.activeProjectId ?? undefined}
                      codeRoot={activeProject?.codeRoot}
                      onSelect={props.taskBoard?.onSelect}
                      seat={props.taskBoard}
                      {...(launch === undefined ? {} : { launchServices: launch.services })}
                      {...(launch === undefined || launch.onLaunched === undefined ? {} : { onLaunched: launch.onLaunched })}
                      {...(props.boardSession === undefined ? {} : { session: props.boardSession })}
                    />
                  </div>
                )
                : (
                  // UF4 (task 5.16 assembly): the features seat now mounts the
                  // COMPLETION view — with the real dshForge bridge live it
                  // resolves the active project over getState and hands
                  // FeaturesPage the IPC faces (getFeatureBoard /
                  // readFeatureDoc, mock 全撤); the explicit seat / a hostless
                  // mount reproduces the 5.9 build-stage page exactly. The
                  // list↔detail routing stays on the view-key machine's
                  // featureSlug dimension (enter = openFeatureDetail, return =
                  // the tab action clearing the slug).
                  <div data-dsh-forge-view={resolveViewMount(view.workbenchTab, view.featureSlug)}>
                    <FeaturesView
                      key={activeProjectKey}
                      t={props.t}
                      featureSlug={view.featureSlug}
                      onOpenFeature={props.openFeatureDetail}
                      onBack={() => { props.selectWorkbenchTab('workbench/features') }}
                      onRegister={addProject}
                      seat={props.features}
                      chromeProjectId={workbenchState.activeProjectId ?? undefined}
                      chromeExternalDocs={activeProject?.docLocationType === 'external'}
                    />
                  </div>
                )}
        </div>
      </ReactFlowProvider>

      {/* UF1 (task 5.4): the register wizard overlay — `workbench/dialog/
          register` in the page-map's dialog family. The 5.14 `wizard` seat
          injects the IPC face + locate treatment over the mock twin; on the
          real path the shell itself hands the wizard's WRITE pair (the
          bridge's registerProject/updateProject over the build-stage twin's
          probes) and the store-backed registry. */}
      {wizardTarget !== undefined && (
        <RegisterWizard
          t={props.t}
          mode={wizardTarget.mode}
          project={wizardTarget.mode === 'edit' ? wizardTarget.project : undefined}
          projects={workbenchState.projects}
          face={props.wizard?.face ?? (stateStore !== undefined ? wizardVerbs : undefined)}
          onLocate={props.wizard?.onLocate ?? locateProject}
          onClose={closeWizard}
        />
      )}

      {/* The shell-level toast (5.14): the register-success 提示可切换 notice
          and the chrome verb-failure copy (the OverviewPage toast twin). */}
      {shellToast !== undefined && (
        <div role="status" aria-live="polite" data-dsh-forge-shell-toast="" style={shellToastStyle}>
          <p style={shellToastBodyStyle}>{shellToast}</p>
          <ChromeButton
            type="button"
            aria-label={props.t('overview.toast.dismiss')}
            data-dsh-forge-shell-toast-dismiss=""
            style={shellToastDismissStyle}
            onClick={() => { setShellToast(undefined) }}
          >
            <span aria-hidden="true">✕</span>
          </ChromeButton>
        </div>
      )}
    </div>
  )
}
