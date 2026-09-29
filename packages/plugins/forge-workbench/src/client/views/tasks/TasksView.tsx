/**
 * The 任务看板 assembled view (task 5.15; M4 2.1 re-homed HOST-AGNOSTIC —
 * tech-design §Integration #5): the board mounts in TWO hosts, and this
 * component carries ZERO host knowledge of its own (去 TabBar/视图键耦合 —
 * no view-key import, no chrome assumption; the retired `workbench/tasks`
 * main-panel seat is gone since 1.7). The hosts:
 *
 *   the rightbar pane (2.2, `TabKind='board'`) — injects `host="pane"` (the
 *     width breakpoint: the board's fixed-geometry chrome contracts to the
 *     board's own box) and feeds `projectId` from the ACTIVE project;
 *   the detached window (4.3, `view='board'`) — the default `host="window"`
 *     (the M2/M3 geometry verbatim) with `projectId` PINNED to the source
 *     project (不随主窗激活指针 — the prop is the board's only project
 *     source; nothing here reads an active-project pointer).
 *
 * It swaps the 5.5/5.8 build-stage page's mocked data plane for the REAL IPC
 * chain (mock 全撤 in the real host: no mock twin ever executes when the
 * dshForge bridge is live).
 *
 * Form selection (one rule, no page knowledge — the OverviewView/FeaturesView
 * precedent):
 *   seat present (the explicit test/build injection) or bridge ABSENT (jsdom /
 *     hostless mounts)
 *       → TaskBoardPage on the injected/mock faces, exactly the 5.5/5.8
 *         behavior;
 *   bridge live and no seat (the real host), projectId still unresolved (the
 *     host's first getState in flight)
 *       → the resolving skeleton (the tab page owns its loading branch —
 *         never the build-stage mock fixtures, never an error flash);
 *   bridge live, no seat, project resolved
 *       → the real chain below.
 *
 * The real chain (the 5.14/5.16 pattern + the G3 event loop):
 *   1. store/task-board.ts is the page's data plane — ONE getTaskBoard per
 *      first paint (read-through with in-flight coalescing), the 回流
 *      coalesce-then-fetch merge over the SINGLE-SUBSCRIBER event channel
 *      (ipc/workbench-events.ts: the store's data leg and the page's
 *      presentation leg — row highlights + aria-live — multiplex over one
 *      preload subscription for the page's lifetime), and the event-merged
 *      sync projection for the toolbar light. The view re-feeds the page
 *      through the page's reloadToken on every store-initiated publish
 *      (rows update in place — the Hard Rule: 回流 never rebuilds).
 *   2. The dock's face is the ipc adapter's getTaskDetail (1:1, rejections
 *      normalized); the page's structural-deletion coupling flips the dock
 *      to its error card (the 板↔侧板 contract 5.8 reserved for this task).
 *   3. The session jump hand-over passes through untouched (5.11 seat, M3 slim).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { TaskSummary } from '../../ipc-types'
import type {
  BoardSessionStore,
} from '../../store/board-session'
import type {
  SessionLaunchHandover, TaskBoardSeat,
} from '../../contract'
import type { WorkbenchKey } from '../../locale/en'
import {
  createIpcDispatchFace, createIpcTaskDetailFace, getWorkbenchIpcBridge,
} from '../../ipc/workbench'
import type { WorkbenchIpcBridge } from '../../ipc/workbench'
import type { BoardHostForm } from './launch/LaunchStates'
import {
  createTaskBoardStore, INITIAL_TASK_BOARD_SNAPSHOT, type TaskBoardStore,
} from '../../store/task-board'
import { TaskBoardPage } from '../TaskBoardPage'
import type { EnterSessionSeam } from './detail/LinkHistory'

/** Inputs of {@link TasksView}. */
export interface TasksViewProps {
  /** The locale seat (the host's `t`). */
  t: (key: WorkbenchKey) => string
  /**
   * The project the board reads (the Interface 1 verb argument) — the board's
   * ONLY project source (M4 2.1 双宿主): the pane host feeds the ACTIVE
   * project's id; the detached-window host PINS the source project's id
   * (不随主窗激活指针 — a main-window activation change never re-points that
   * board; a project switch is a re-key, i.e. a NEW mount).
   */
  projectId?: string | undefined
  /**
   * The host's width breakpoint (M4 2.1 双宿主 — injected, never probed):
   * 'window' (default) = the detached window's window-grade geometry verbatim;
   * 'pane' = the rightbar pane's narrow form (the docks/float bar contract to
   * the board's own box). See {@link BoardHostForm}.
   */
  host?: BoardHostForm | undefined
  /** The active project's codeRoot (the UF5 entries' launch ref, 5.11). */
  codeRoot?: string | undefined
  /** The UF3 selection seam OBSERVATION (the assembly's per-activation hook). */
  onSelect?: ((task: TaskSummary) => void) | undefined
  /** The explicit assembly seat (tests / build stage) — present wins over the bridge. */
  seat?: TaskBoardSeat | undefined
  /** The session jump hand-over (5.11; M3 6.1: the dispatch chain's 「进入会话」 seam). */
  onLaunched?: SessionLaunchHandover | undefined
  /** The board session store (5.11 AC3/AC4): the plugin-lifetime memory. */
  session?: BoardSessionStore | undefined
  /**
   * The C5 [打开] dual-channel seam (M4 2.7): the Interface 6 channel behind
   * the 挂接历史 rows' [打开] (顶层 sessionId / subagent SubagentAddress). A
   * rejecting promise return surfaces the section's open-failed toast.
   */
  onEnterSession?: EnterSessionSeam | undefined
}

/** The view's column geometry (the page's container twin). */
const viewStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
} as const

/** Skeleton gray rows (the page's loading 态 twin: 列表灰行). */
const skeletonRowStyle = {
  background: 'var(--dsh-interactive-bg-hover, rgba(128, 128, 128, 0.2))',
  borderRadius: '8px',
  height: '32px',
} as const

/**
 * The tasks tab's assembled view. The real form mounts the store-backed
 * chain over the resolved active project; the seat/bridge-absent forms
 * reproduce the 5.5/5.8 build-stage page exactly.
 */
export function TasksView(props: TasksViewProps) {
  // Bridge presence is fixed for the view's life (the preload namespace
  // exists before any renderer code runs) — resolve once, never re-probe.
  const [bridge] = useState<WorkbenchIpcBridge | undefined>(() => getWorkbenchIpcBridge())
  const seatForm = props.seat !== undefined || bridge === undefined

  // The real chain's fixed identities: one store per view mount (the HOST
  // re-keys the view per project — the pane host on active-project switches,
  // the detached window never; a project switch is a NEW store, the
  // page-session scope the feature-board store set) + the dock's IPC face.
  // The store subscribes its event leg AT CREATION (the page's
  // lifetime subscription) and detaches on unmount.
  const [store] = useState<TaskBoardStore | undefined>(() =>
    seatForm || props.projectId === undefined ? undefined : createTaskBoardStore(bridge, props.projectId))
  const [boardFace] = useState(() => (store === undefined ? undefined : store.asFace()))
  const [detailFace] = useState(() => (bridge === undefined ? undefined : createIpcTaskDetailFace(bridge)))
  // The UF1 dispatch face (task 3.9): the six orchestration verbs over the
  // same bridge — the real host's UF1 surface (派发/审批/编排回流) goes live
  // through it; mock 全撤 (no mock twin ever answers when the bridge lives).
  const [dispatchFace] = useState(() => (bridge === undefined ? undefined : createIpcDispatchFace(bridge)))
  useEffect(() => {
    if (store === undefined) return
    return () => { store.dispose() }
  }, [store])

  // The re-feed leg: store-initiated publishes (event refresh / sync merge)
  // advance `feed`; the view answers each advance with a reloadToken bump so
  // the page re-fires load() and SERVES the published snapshot (zero extra
  // verbs — the two-counter discipline in store/task-board.ts keeps a
  // page-initiated fetch from ever answering itself with a second fetch).
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => INITIAL_TASK_BOARD_SNAPSHOT),
  )
  const fedFeed = useRef<number>(snapshot.feed)
  const [reloadToken, setReloadToken] = useState(0)
  useEffect(() => {
    if (snapshot.feed === fedFeed.current) return
    fedFeed.current = snapshot.feed
    setReloadToken(snapshot.feed)
  }, [snapshot.feed])

  if (seatForm) {
    // The 5.5/5.8 form, verbatim: the seat's faces (or the build-stage mock
    // twins when absent) over the page's own machinery.
    return (
      <TaskBoardPage
        t={props.t}
        projectId={props.projectId}
        host={props.host}
        codeRoot={props.codeRoot}
        onSelect={props.onSelect}
        face={props.seat?.face}
        detailFace={props.seat?.detailFace}
        dispatchFace={props.seat?.dispatchFace}
        {...(props.onLaunched === undefined ? {} : { onLaunched: props.onLaunched })}
        {...(props.session === undefined ? {} : { session: props.session })}
        {...(props.onEnterSession === undefined ? {} : { onEnterSession: props.onEnterSession })}
      />
    )
  }

  if (props.projectId === undefined || store === undefined || boardFace === undefined) {
    // The real path's pre-resolution window: the chrome's first getState is
    // still in flight (or failed with no last-good state) — the tab page
    // owns its loading branch (mock 全撤 covers this window too; the 5.1
    // state gate takes over once the registry resolves empty).
    return (
      <div data-dsh-forge-task-board="" aria-busy="true" style={viewStyle}>
        <div
          role="status"
          aria-label={props.t('tasks.loading')}
          data-dsh-forge-tasks-resolving=""
          style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {[0, 1, 2, 3, 4].map(index => <div key={index} aria-hidden="true" style={skeletonRowStyle} />)}
        </div>
      </div>
    )
  }

  // The real chain: the store-backed board face + the IPC detail face over
  // the resolved project; the store's publishes re-feed the page
  // through reloadToken (rows update in place — never a remount). Since 3.9
  // the dispatch face rides along (the UF1 orchestration surface).
  return (
    <TaskBoardPage
      t={props.t}
      projectId={props.projectId}
      host={props.host}
      codeRoot={props.codeRoot}
      onSelect={props.onSelect}
      face={boardFace}
      detailFace={detailFace}
      dispatchFace={dispatchFace}
      reloadToken={reloadToken}
      {...(props.onLaunched === undefined ? {} : { onLaunched: props.onLaunched })}
      {...(props.session === undefined ? {} : { session: props.session })}
      {...(props.onEnterSession === undefined ? {} : { onEnterSession: props.onEnterSession })}
    />
  )
}
