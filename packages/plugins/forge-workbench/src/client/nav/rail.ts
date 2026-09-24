/**
 * The fallback rail (task 3.3 AC2, decision D3's degraded form): the
 * plugin-drawn slim rail that carries the dual-view switch when the upstream
 * navigation slots never arrive (upstream version drift). 48px fixed column
 * at the main window's left edge, two icon buttons — chat above, kanban below
 * (DOM/Tab order 会话 → 工作台, ui-design §Navigation) — and, when the plugin
 * owns the workbench surface, a full-height overlay container next to the
 * rail that keeps the shell MOUNTED while the session view is active
 * (workbench view state survives switches in session memory; the 0.2s
 * opacity/visibility fade is the ui-design 主内容区容器切换).
 *
 * Behavior contract = the slot path's, item by item (task Hard Rule): the
 * buttons drive the SAME ViewSwitchController transitions, read the SAME
 * view-key machine, and persist the SAME projection; keyboard activation is
 * the same native-button surface (click / Enter / Space); the workbench
 * content is the SAME WorkbenchShell component with the SAME view face.
 *
 * Zero shell code: the rail is a plugin-owned React root under a container
 * appended to document.body, and every style is inline on this plugin's own
 * elements — no stylesheet is injected and the upstream DOM is untouched
 * (Hard Rule: 作用域样式,防污染上游界面).
 */
import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { IconBranchOutline16, IconNewChatOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ViewKeySnapshot, ViewKeyStore, WorkbenchTabKey } from '../store/view-key'
import type { BoardSessionStore } from '../store/board-session'
import type { SessionHandover } from '../session-handover'
import { WorkbenchShell } from '../WorkbenchShell'
import type { ViewCarrier, ViewSwitchController } from './view-switch'

/** What the rail mounts besides its buttons (decided by the form coordinator). */
export type RailContentMode =
  /** The plugin owns the workbench surface: the overlay container hosts the shell. */
  | 'overlay'
  /** The main-slot registration is live (mixed drift): the slot carrier presents, the rail is only the visible toggle. */
  | 'chrome'

/** Inputs of {@link installRailNav}. */
export interface RailNavOptions {
  /** The shared switching controller both forms drive. */
  readonly controller: ViewSwitchController
  /** The view-key machine the rail renders from. */
  readonly store: ViewKeyStore
  /** The locale-bound translate of the workbench namespace. */
  readonly t: TranslateNS<'workbench'>
  /** Whether the rail also owns the workbench surface (see {@link RailContentMode}). */
  readonly content: RailContentMode
  /** The session hand-over seat (5.11; M3 6.1 slimmed) — threaded into the overlay's shell (form parity with the slot path). */
  readonly launch?: SessionHandover | undefined
  /** The board session store (5.11 AC3/AC4) — threaded into the overlay's shell. */
  readonly boardSession?: BoardSessionStore | undefined
}

/** The rail column's geometry (ui-design: 宽 48px,主窗口左缘,垂直两枚 icon 按钮). */
const RAIL_WIDTH = 48

/**
 * Rail chrome sits above the app frame but under the 5.x dialog layer
 * (ui-design z-order: side panel z100, dialogs z1200).
 */
const RAIL_Z_INDEX = 900

const railStyle = {
  alignItems: 'center',
  bottom: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  left: '0',
  padding: '10px 0',
  position: 'fixed',
  top: '0',
  width: `${RAIL_WIDTH}px`,
  zIndex: RAIL_Z_INDEX,
  background: 'var(--dsh-bg, transparent)',
  borderRight: '1px solid var(--dsh-border-color, transparent)',
} as const

const buttonBaseStyle = {
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  color: 'inherit',
  cursor: 'pointer',
  display: 'flex',
  height: '40px',
  justifyContent: 'center',
  width: '40px',
} as const

/** Active button (ui-design rail contract): interactive-bg-hover 填充 + 左缘 2px --dsw-alias-link 指示条;非当前为 ghost. */
const buttonActiveStyle = {
  ...buttonBaseStyle,
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderLeft: '2px solid var(--dsw-alias-link, currentColor)',
} as const

/** One rail button: a native button (click/Enter/Space — the same activation surface the upstream sidebar row offers). */
function RailButton(props: {
  active: boolean
  label: string
  target: 'session' | 'workbench'
  onClick: () => void
  children: ReactNode
}): ReactNode {
  return createElement('button', {
    type: 'button',
    role: 'tab',
    'aria-selected': props.active ? 'true' : 'false',
    'aria-label': props.label,
    title: props.label,
    'data-dsh-forge-rail-button': props.target,
    style: props.active ? buttonActiveStyle : buttonBaseStyle,
    onClick: props.onClick,
  }, props.children)
}

/** The rail column (both content modes). */
function RailChrome(props: RailNavOptions): ReactNode {
  const view = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
  return createElement('div', {
    'data-dsh-forge-plugin': 'forge-workbench',
    'data-dsh-forge-rail': '',
    role: 'tablist',
    'aria-label': props.t('rail.label'),
    style: railStyle,
  },
  RailButton({
    active: view.view === 'session',
    label: props.t('view.session'),
    target: 'session',
    onClick: () => { props.controller.switchSession() },
    children: createElement(IconNewChatOutline16, { size: 18 }),
  }),
  RailButton({
    active: view.view === 'workbench',
    label: props.t('panel'),
    target: 'workbench',
    onClick: () => { props.controller.switchWorkbench() },
    children: createElement(IconBranchOutline16, { size: 18 }),
  }))
}

/**
 * The workbench overlay (overlay mode only): fixed beside the rail, faded
 * with the session view, and — deliberately — NOT unmounted on switch-out:
 * the shell keeps its session-memory state (ui-design 切出后保留), exactly the
 * retention the keyed slot path gets from the machine carrying the tab.
 */
function RailOverlay(props: RailNavOptions): ReactNode {
  const view = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot)
  const workbench = view.view === 'workbench'
  return createElement('div', {
    'data-dsh-forge-plugin': 'forge-workbench',
    'data-dsh-forge-rail-overlay': '',
    style: {
      bottom: '0',
      left: `${RAIL_WIDTH}px`,
      opacity: workbench ? '1' : '0',
      position: 'fixed',
      right: '0',
      top: '0',
      transition: 'opacity 0.2s ease, visibility 0.2s ease',
      visibility: workbench ? 'visible' : 'hidden',
      zIndex: RAIL_Z_INDEX,
      background: 'var(--dsh-bg, inherit)',
    },
  },
  createElement(WorkbenchShell, {
    t: props.t,
    useViewKey: bindViewKeyHook(props.store),
    selectWorkbenchTab: (tab: WorkbenchTabKey) => { props.controller.switchWorkbenchTab(tab) },
    openFeatureDetail: (slug: string) => { props.controller.openFeatureDetail(slug) },
    openProposalDetail: (slug: string) => { props.controller.openProposalDetail(slug) },
    ...(props.launch === undefined ? {} : { launch: props.launch }),
    ...(props.boardSession === undefined ? {} : { boardSession: props.boardSession }),
  }))
}

/** Bind the store as the shell's `useViewKey` selector (the hand-bound twin of the slot registration's synthesized hook). */
function bindViewKeyHook(store: ViewKeyStore): SnapshotSelectorHook<ViewKeySnapshot> {
  return <S>(selector: (snapshot: ViewKeySnapshot) => S): S =>
    useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
}

/**
 * Mount the fallback rail: one plugin-owned React root under a container
 * appended to document.body. The rail renders declaratively from the machine
 * (its carrier's present() is a no-op by design — the store subscription IS
 * the projection), so the form can never desync from the slot path's machine.
 * @param options - controller/store/translate + content mode.
 * @returns disposer unmounting the rail and detaching its carrier.
 */
export function installRailNav(options: RailNavOptions): () => void {
  const host = document.createElement('div')
  host.setAttribute('data-dsh-forge-plugin', 'forge-workbench')
  host.setAttribute('data-dsh-forge-rail-root', '')
  // Position-fixed children; the host itself stays out of layout.
  host.style.display = 'contents'
  document.body.append(host)
  const root: Root = createRoot(host)

  // The rail carrier: projection is declarative (store subscription), so
  // present() carries no imperative work — it exists to claim the controller's
  // single-carrier slot (attach-time projection inclusive).
  const carrier: ViewCarrier = {
    form: 'rail',
    present: () => {},
  }
  options.controller.attach(carrier)

  root.render(createElement(() => createElement('div', null,
    createElement(RailChrome, options),
    options.content === 'overlay' ? createElement(RailOverlay, options) : null)))

  return () => {
    options.controller.detach(carrier)
    root.unmount()
    host.remove()
  }
}
