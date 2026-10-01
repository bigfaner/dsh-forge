/**
 * The workbench main-panel shell — since M4 task 1.7 the OVERVIEW ESCAPE
 * DOOR single page (tech-design §Integration #6: 旧视图退役). It mounts as
 * the `main` slot's `workbench` key — in the slot path chosen by the
 * upstream sidebar, in the fallback rail rendered inside the plugin-owned
 * overlay container — the SAME component either way, so the two forms cannot
 * diverge (Hard Rule). The M2/M3 chrome (TopBar identity + project switcher,
 * the four-tab strip, the registration state gate) retired with the tab
 * family: 项目枚举/切换/注册入口 now live in the C3 left project tree and the
 * C7 confirm card (1.5/1.6), and the boards (tasks/features/proposals)
 * re-home into the rightbar pane family in P2 — their component bodies
 * survive untouched elsewhere (收纳不推倒).
 *
 * What the escape door keeps (SC5 过渡载体, 零缩水): the UF1 overview
 * assembly (views/overview/OverviewView — 项目卡/插件管理/偏好/迁移入口)
 * over the same store-backed real chain (store/workbench-state.ts — ONE
 * getState per first paint, mutation refreshes, onEvents-derived 失联
 * signals), plus the shell-owned register wizard (`workbench/dialog/
 * register`, register + the prefilled repoint/rename EDIT mode) and the
 * shell-level toast. The 5.14 DI discipline survives: the explicit seats /
 * a hostless mount reproduce the build-stage forms (the mock twin).
 *
 * Data layering (breakdown rule): the page renders against Interface 1 DTO
 * types + the shared mock (mocks/workbench.ts) through the optional
 * WorkbenchChromeFace — the IPC-backed face takes over when the preload
 * bridge is live; absent members keep the build-stage stubs.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { WorkbenchShellProps } from './contract'
import type { Project, WorkbenchState } from './ipc-types'
import { WORKBENCH_DIALOG_PREFIX, type WorkbenchTabKey } from './store/view-key'
import { MOCK_WORKBENCH_STATE } from './mocks/workbench'
import {
  createIpcMigrationFace, createIpcRegisterWizardVerbs, getWorkbenchIpcBridge,
} from './ipc/workbench'
import {
  createWorkbenchStateStore, INITIAL_WORKBENCH_STATE_SNAPSHOT, type WorkbenchStateStore,
} from './store/workbench-state'
import { fillTemplate } from './views/overview/format'
import { TOAST_Z } from './views/tasks/launch/LaunchStates'
import { ChromeButton } from './components/chrome/ChromeButton'
import { OverviewView } from './views/overview/OverviewView'
import type { RegisterWizardResult } from './views/overview/RegisterWizard'
import { RegisterWizard } from './views/overview/RegisterWizard'

/**
 * view-key → container mapping table (task 3.3 AC5, M4 1.7 收缩): the escape
 * door's single interior page plus the 5.x dialog overlay family — every key
 * the page-map still defines reserves its mount container here (无死键: the
 * retired `workbench/tasks|features|proposals[:slug]` entries are gone).
 */
export const VIEW_MOUNT_TABLE = {
  'workbench/overview': { container: 'dsh-forge-view-overview' },
  [`${WORKBENCH_DIALOG_PREFIX}*`]: { container: 'dsh-forge-dialog-layer' },
} as const

/**
 * Resolve the active mount container for the workbench interior. The escape
 * door is the single member, so every snapshot addresses the overview
 * container — kept as the addressing API the shell (and the 1.8 e2e
 * assertions) consume rather than a bare string.
 * @param tab - the active workbench tab (always the escape door post-1.7).
 * @returns the mount container id from {@link VIEW_MOUNT_TABLE}.
 */
export function resolveViewMount(tab: WorkbenchTabKey): string {
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

/**
 * The real-path pre-read placeholder (task 5.14): while the first getState
 * is in flight (or failed with no last-good state) the shell holds NO
 * registry — never the build-stage mock fixtures (mock 全撤 covers the
 * escape door too). The overview page owns its loading branch in that
 * window.
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
 * The registered main-panel component: the overview escape door single page
 * (UF1 assembly over the real chain) with the shell-owned register wizard
 * and toast above it.
 * @param props - composed props: the main slot's runtime share, the `t` seat,
 *   the panel-lifecycle notifications, and (optionally, assembly-time) the
 *   chrome data face — absent members use the build-stage mock + local
 *   stubs.
 */
export function WorkbenchShell(props: WorkbenchShellProps) {
  // Task 5.14 — the real data path: with the preload bridge live and no
  // explicit chrome state member, the overview page and the register wizard
  // run on ONE store-backed getState chain (store/workbench-state.ts; mock
  // 全撤); the bridge absent (hostless jsdom / build stage) or the explicit
  // member present keeps the 5.1 mock + local stubs — the DI switch. Bridge
  // presence is fixed for the shell's life.
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
    void stateStore.refresh().catch(() => {})
  }, [stateStore])
  // The wizard's real WRITE pair (5.14): registerProject / updateProject
  // over the bridge, rejections normalized. The REAL probeCodeRoot (the
  // conditional migration step's premise must be real on the real chain)
  // and the migration family's face (the flipped default's paths read + the
  // in-place run after registration). probeExternalPath keeps the
  // build-stage twin (no Interface 1 verb — the real validation is the
  // submit-time main-side chain; ipc/workbench.ts notes).
  const [wizardVerbs] = useState(() => (bridge === undefined ? undefined : createIpcRegisterWizardVerbs(bridge)))
  const [wizardMigrationFace] = useState(() => (bridge === undefined ? undefined : createIpcMigrationFace(bridge)))
  // Build-stage defaults (UI dependency layering): the shared mock + a local
  // single-activation stub. Assembly (5.14) overrides the whole face with
  // the IPC-backed implementation.
  const [mockState, setMockState] = useState(() => MOCK_WORKBENCH_STATE)
  const workbenchState = props.workbenchState
    ?? (stateStore !== undefined ? (chromeSnapshot.state ?? UNRESOLVED_CHROME_STATE) : mockState)
  // The shell-level toast (the register-success 提示可切换 notice; the wizard
  // is shell-owned, so its success toast is too; the page keeps its own verb
  // toasts).
  const [shellToast, setShellToast] = useState<string | undefined>(undefined)
  // The external-mutation epoch (5.14): bumped when a mutation the overview
  // PAGE didn't fire (the wizard's register/repoint) refreshed the registry
  // — OverviewView rides it through as the page's reloadToken (re-read
  // without a remount).
  const [externalReloadNonce, setExternalReloadNonce] = useState(0)

  // External-selection sync (slot path): mounting means an actor selected the
  // workbench panel, unmounting means it left. Stable callbacks — run once.
  useEffect(() => {
    props.notifyPresented?.()
    return () => { props.notifyDismissed?.() }
  }, [])

  // The register wizard (task 5.4): the page's register / repoint seams open
  // the `workbench/dialog/register` overlay — register mode, or the prefilled
  // edit mode. The dialog runs its own per-mount mock twin (the OverviewPage
  // precedent); the 5.14 seat injects the IPC face over it. The opener
  // snapshots focus so close returns there.
  const [wizardTarget, setWizardTarget] = useState<WizardTarget | undefined>(undefined)
  const wizardTriggerRef = useRef<HTMLElement | null>(null)
  const openWizard = (target: WizardTarget): void => {
    wizardTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setWizardTarget(target)
  }
  const addProject = props.addProject ?? (() => { openWizard({ mode: 'register' }) })

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
    // so the page's registry stays coherent with the wizard's outcome.
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

  return (
    <div data-dsh-forge-plugin="forge-workbench" data-dsh-forge-shell="" style={shellStyle}>
      <div data-dsh-forge-content="" style={contentStyle}>
        {/* The escape door (M4 1.7): the overview single page in its reserved
            mount container — the transitional SC5 carrier (项目卡/插件管理/
            偏好/迁移入口零缩水). The ASSEMBLED view swaps the page's mock data
            plane for the real chain when the shell's store is live (IPC
            faces + store-routed getState + sync-derived 失联 signals); the
            explicit overview seat / a hostless mount reproduces the 5.3
            build-stage page. The page's register CTA fires the same
            addProject seam (the wizard's owner); the lost-card repoint
            defaults to the wizard's EDIT mode (the seat can override
            either). */}
        <div data-dsh-forge-view={resolveViewMount('workbench/overview')}>
          <OverviewView
            t={props.t}
            onRegister={addProject}
            onRepoint={props.overview?.onRepoint ?? ((project) => { openWizard({ mode: 'edit', project }) })}
            reloadToken={externalReloadNonce}
            seat={props.overview}
            store={stateStore}
          />
        </div>
      </div>

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
          migrationFace={stateStore !== undefined ? wizardMigrationFace : undefined}
          onLocate={props.wizard?.onLocate ?? locateProject}
          onClose={closeWizard}
        />
      )}

      {/* The shell-level toast (5.14): the register-success 提示可切换 notice
          (the OverviewPage toast twin). */}
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
