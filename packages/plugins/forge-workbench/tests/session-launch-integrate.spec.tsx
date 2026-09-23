// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskBoardPage } from '../src/client/views/TaskBoardPage.tsx'
import type { TaskBoardPageProps } from '../src/client/views/TaskBoardPage.tsx'
import { WorkbenchShell } from '../src/client/WorkbenchShell.tsx'
import { createBoardSessionStore } from '../src/client/store/board-session.ts'
import { createMockTaskBoardFace, MOCK_TASK_BOARD } from '../src/client/mocks/workbench.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import type { WorkbenchShellProps } from '../src/client/contract.ts'
import type { ViewKeySnapshot, WorkbenchTabKey } from '../src/client/store/view-key.ts'
import type { SessionLaunchServices } from '../src/client/contract.ts'
import type { SessionLink, TaskBoardData, TaskDetail, WorkbenchEvent } from '../src/client/ipc-types.ts'
import type { LaunchSeatSnapshot, LaunchSeatStore } from '../src/client/launch-rpc.ts'

// Task 5.11 — the UF5 INTEGRATE units: the real-services seat flowing into
// BOTH mounts (node-card hover + panel-primary), the launch success hand-over
// (切会话视图 seam + the badge write), the 运行中徽标 across A/B/C + the dock,
// and the board session memory surviving the round-trip unmount (AC4). AC map:
//   AC1 双挂位入口可用(真服务注入,同一流)· AC2 发起成功 → hand-over + 返回
//   徽标正确 · AC3 徽标 A/B/C/侧板一致 + 结束撤下 · AC4 选中态/滚动位置保持.
// The rpc remotes themselves are launch-rpc.spec's (node) — here the SERVICE
// SEAM carries spied real-shaped members (the DI switch: same component,
// injected members win over the mocks).

// The upstream StateDot resolves through the module table at runtime; jsdom
// renders stub it (task-board.spec precedent — the real dot rides the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconBranchOutline16: () => null,
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// The board's DEFAULT view is 视图 A — the real ReactFlow needs d3-zoom +
// ResizeObserver (absent in jsdom), so every render goes through the
// lib-boundary standin (task-board.spec precedent).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en) }

const PROJECT_ID = 'proj-e2e'
const CODE_ROOT = 'Z:\\repo\\demo'
/**
 * The board task the launch targets — picked as one the MOCK DETAIL face also
 * covers (dsh-forge-m2/5.6, the MID fixture), so the dock opens with content.
 */
const TASK = MOCK_TASK_BOARD.tasks.find(task => task.key === 'dsh-forge-m2/5.6') as {
  key: string
  title: string
  featureSlug: string
}

const VERBATIM_PROMPT = '# prompt bytes\n\tindented line\n trailing \nEnd.\n'
const LAUNCHED_SESSION = 'session-integrate-1'

/** A spied REAL-shaped services face (what launch-rpc's seat would inject). */
function makeLaunchServices(overrides: Partial<SessionLaunchServices> = {}): SessionLaunchServices {
  return {
    probe: vi.fn(async () => ({ available: true as const, promptText: VERBATIM_PROMPT })),
    launch: vi.fn(async () => ({ ok: true as const, sessionId: LAUNCHED_SESSION })),
    launchViaClientChannel: vi.fn(async () => ({ ok: false as const, reasonCode: 'ERR_SESSION_CHANNEL_UNAVAILABLE', detail: 'unused' })),
    copyPromptToClipboard: vi.fn(async () => true),
    bringMainWindowToFront: vi.fn(),
    recordSessionLink: vi.fn(async (input: { projectId: string; taskKey: string; sessionId: string }) => ({
      id: 'link-1', status: 'active' as const, startedAt: '2026-09-23T00:00:00.000Z', endedAt: null, ...input,
    })),
    ...overrides,
  }
}

/** A board face over the shared mock data (load spied, events inert). */
function makeFace(initial: TaskBoardData = MOCK_TASK_BOARD) {
  const base = createMockTaskBoardFace(initial)
  return {
    loadBoard: vi.fn(base.loadBoard),
    subscribeEvents: vi.fn((_callback: (events: readonly WorkbenchEvent[]) => void) => () => {}),
  }
}

/** A detail face over a live detail thunk (the dock's data source). */
function makeDetailFace(detail: () => TaskDetail) {
  return { loadDetail: vi.fn(async () => detail()) }
}

/** A launch seat store fixed on one snapshot (the shell seam's input). */
function fixedSeat(snapshot: LaunchSeatSnapshot): LaunchSeatStore {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
}

/** Render the board page and settle its first load. */
async function renderBoard(props: Partial<TaskBoardPageProps> = {}) {
  const face = makeFace()
  render(<TaskBoardPage t={t.en} projectId={PROJECT_ID} codeRoot={CODE_ROOT} face={face} {...props} />)
  await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
  return face
}

const q = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement
/** The launch target's DAG node wrapper (view A is the default view). */
const nodeOf = (): HTMLElement => q(`[data-dsh-forge-dep-tree] [data-id="${TASK.key}"]`)
const hoverTriggerOf = (key: string): HTMLElement | null =>
  document.querySelector(`[data-dsh-forge-dep-tree] [data-id="${key}"] [data-dsh-forge-launch-trigger][data-mount="node-hover"]`)
const badgeOf = (scope: string): HTMLElement | null => document.querySelector(`${scope} [data-dsh-forge-badge="session-live"]`)

/** The detail payload the dock mock serves for the launch target. */
function detailOf(links: readonly SessionLink[]): TaskDetail {
  return {
    summary: { ...TASK, status: 'in_progress', blockers: [], branch: null, worktree: false, source: null, updatedAt: '2026-09-23T00:00:00.000Z' },
    descriptionMarkdown: 'body',
    depChain: [],
    records: [],
    links,
  }
}

/** Full launch gesture from a trigger: wait for the probe to arm, open confirm, activate the default-focused confirm. */
async function launchFrom(trigger: HTMLElement): Promise<void> {
  // The probe settles asynchronously after mount (the 5.10 discipline): the
  // trigger stays disabled until available — wait for it before the click.
  await waitFor(() => { expect((trigger as HTMLButtonElement).disabled).toBe(false) })
  fireEvent.click(trigger)
  await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).not.toBeNull() })
  fireEvent.click(q('[data-dsh-forge-launch-confirm-ok]'))
}

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// AC1 — 双挂位真服务全链
// ---------------------------------------------------------------------------

describe('5.11 AC1: both mounts launch the same flow over the injected services', () => {
  it('view A node card carries the hover entry in its reserved 28×28 slot', async () => {
    const services = makeLaunchServices()
    await renderBoard({ launchServices: services })
    const trigger = hoverTriggerOf(TASK.key)
    expect(trigger).not.toBeNull()
    expect(trigger?.closest('[data-dsh-forge-node-launch]')).not.toBeNull()
    // Without the project context (no codeRoot) the reserved slot stays
    // empty — the DI switch keeps whatever the mount context can supply.
    cleanup()
    await renderBoard({ codeRoot: undefined })
    expect(hoverTriggerOf(TASK.key)).toBeNull()
    expect(document.querySelector(`[data-dsh-forge-dep-tree] [data-id="${TASK.key}"] [data-dsh-forge-node-launch]`)).not.toBeNull()
  })

  it('the hover entry runs the chain: probe → confirm → launch(prompt byte-faithful) → recordSessionLink → hand-over', async () => {
    const services = makeLaunchServices()
    const onLaunched = vi.fn()
    await renderBoard({ launchServices: services, onLaunched })
    await launchFrom(hoverTriggerOf(TASK.key) as HTMLElement)
    await waitFor(() => { expect(onLaunched).toHaveBeenCalled() })
    expect(services.launch).toHaveBeenCalledWith({
      promptText: VERBATIM_PROMPT,
      title: TASK.title,
      cwd: CODE_ROOT,
    })
    expect(services.recordSessionLink).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      taskKey: TASK.key,
      sessionId: LAUNCHED_SESSION,
    })
    expect(onLaunched).toHaveBeenCalledWith(LAUNCHED_SESSION, expect.objectContaining({
      projectId: PROJECT_ID, codeRoot: CODE_ROOT, featureSlug: TASK.featureSlug, title: TASK.title,
    }))
  })

  it('the dock\'s panel-primary entry runs the same chain (same services object)', async () => {
    const services = makeLaunchServices()
    const onLaunched = vi.fn()
    await renderBoard({ launchServices: services, onLaunched })
    fireEvent.click(nodeOf())
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-detail]')).not.toBeNull() })
    const trigger = document.querySelector('[data-dsh-forge-task-detail] [data-dsh-forge-launch-trigger][data-mount="panel-primary"]')
    expect(trigger).not.toBeNull()
    await launchFrom(trigger as HTMLElement)
    await waitFor(() => { expect(onLaunched).toHaveBeenCalledWith(LAUNCHED_SESSION, expect.anything()) })
    expect(services.launch).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// AC2/AC3 — the 运行中徽标: launch writes it; A/B/C + dock read one source
// ---------------------------------------------------------------------------

describe('5.11 AC2/AC3: the running badge across A/B/C + the dock, end drops it', () => {
  it('a launch from view A lights the badge in the node card, then in B/C after a view switch, and in the dock', async () => {
    const services = makeLaunchServices()
    const session = createBoardSessionStore()
    const onLaunched = vi.fn()
    await renderBoard({ launchServices: services, onLaunched, session })
    expect(badgeOf(`[data-dsh-forge-node-card="${TASK.key}"]`)).toBeNull()
    await launchFrom(hoverTriggerOf(TASK.key) as HTMLElement)
    // The badge writes through the session store the hand-over carries.
    await waitFor(() => { expect(badgeOf(`[data-dsh-forge-node-card="${TASK.key}"]`)).not.toBeNull() })
    expect(session.getActiveLinks().get(TASK.key)).toBe(LAUNCHED_SESSION)

    // View B: the same badge on the status card.
    fireEvent.click(q('[data-dsh-forge-board-view="grouped"]'))
    await waitFor(() => { expect(badgeOf(`[data-dsh-forge-task-card="${TASK.key}"]`)).not.toBeNull() })

    // View C: the same badge on the list row.
    fireEvent.click(q('[data-dsh-forge-board-view="list"]'))
    await waitFor(() => { expect(badgeOf(`[data-dsh-forge-task-row="${TASK.key}"]`)).not.toBeNull() })

    // The dock: opening the task shows the badge in its header.
    fireEvent.click(q(`[data-dsh-forge-task-row="${TASK.key}"]`))
    await waitFor(() => { expect(badgeOf('[data-dsh-forge-task-detail]')).not.toBeNull() })
    expect(q('[data-dsh-forge-task-detail] [data-dsh-forge-badge="session-live"]').getAttribute('data-dsh-forge-session-id')).toBe(LAUNCHED_SESSION)
  })

  it('the end seam (markLinksEnded) drops the badge in the live view', async () => {
    const session = createBoardSessionStore()
    await renderBoard({ session })
    session.markLinkActive(PROJECT_ID, TASK.key, LAUNCHED_SESSION)
    await waitFor(() => { expect(badgeOf(`[data-dsh-forge-node-card="${TASK.key}"]`)).not.toBeNull() })
    session.markLinksEnded(PROJECT_ID, [TASK.key])
    await waitFor(() => { expect(badgeOf(`[data-dsh-forge-node-card="${TASK.key}"]`)).toBeNull() })
  })

  it('the dock\'s authoritative link read reconciles: active lights, ended drops', async () => {
    const session = createBoardSessionStore()
    let links: readonly SessionLink[] = [{ id: 'link-1', projectId: PROJECT_ID, taskKey: TASK.key, sessionId: 'session-live', status: 'active', startedAt: '2026-09-23T00:00:00.000Z', endedAt: null }]
    const detailFace = makeDetailFace(() => detailOf(links))
    await renderBoard({ session, detailFace })
    fireEvent.click(nodeOf())
    await waitFor(() => { expect(badgeOf('[data-dsh-forge-task-detail]')).not.toBeNull() })
    expect(session.getActiveLinks().get(TASK.key)).toBe('session-live')

    // The end arrives (the link row turned ended): close the dock, re-open —
    // the fresh detail load reconciles the badge away.
    links = [{ id: 'link-1', projectId: PROJECT_ID, taskKey: TASK.key, sessionId: 'session-live', status: 'ended', startedAt: '2026-09-23T00:00:00.000Z', endedAt: '2026-09-23T01:00:00.000Z' }]
    fireEvent.keyDown(q('[data-dsh-forge-task-detail]'), { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull() })
    fireEvent.click(nodeOf())
    await waitFor(() => { expect(detailFace.loadDetail).toHaveBeenCalledTimes(2) })
    await waitFor(() => { expect(badgeOf('[data-dsh-forge-task-detail]')).toBeNull() })
    expect(session.getActiveLinks().has(TASK.key)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC4 — 选中态与滚动位置保持 (the session store survives the unmount)
// ---------------------------------------------------------------------------

describe('5.11 AC4: selection + scroll survive the launch round-trip unmount', () => {
  it('re-mounting with the same session store restores the selection (dock re-opens on the task)', async () => {
    const session = createBoardSessionStore()
    await renderBoard({ session })
    fireEvent.click(nodeOf())
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-detail]')).not.toBeNull() })
    // The round-trip: the whole page unmounts (slot-path view switch) and
    // mounts again with the SAME session store.
    cleanup()
    await renderBoard({ session })
    await waitFor(() => { expect(document.querySelector(`[data-dsh-forge-task-detail="${TASK.key}"]`)).not.toBeNull() })
  })

  it('view B\'s stashed horizontal offset hydrates from the session store on re-entry', async () => {
    const session = createBoardSessionStore()
    session.saveScroll({ statusBoardScrollLeft: 120 })
    await renderBoard({ session })
    fireEvent.click(q('[data-dsh-forge-board-view="grouped"]'))
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-status-board]')).not.toBeNull() })
    expect(q('[data-dsh-forge-status-board]').scrollLeft).toBe(120)
  })

  it('the page\'s unmount saves the scroll stash back into the store', async () => {
    const session = createBoardSessionStore()
    await renderBoard({ session })
    // Drive the stash through the exposed seams: settle a tree viewport.
    const standin = await import('./helpers/xyflow-standin')
    standin.lastCanvasProps.current.onMoveEnd?.(undefined as never, { x: 5, y: 6, zoom: 0.5 })
    cleanup()
    expect(session.getScroll().treeViewport).toEqual({ x: 5, y: 6, zoom: 0.5 })
  })
})

// ---------------------------------------------------------------------------
// The shell seam — the seat flows into the board page
// ---------------------------------------------------------------------------

describe('5.11 shell seam: the launch seat + board session reach the board page', () => {
  /** A static view face (the shell.spec makeFace pattern, tasks tab). */
  function makeViewFace(): Pick<WorkbenchShellProps, 'useViewKey' | 'selectWorkbenchTab' | 'openFeatureDetail'> {
    const snapshot: ViewKeySnapshot = { view: 'workbench', workbenchTab: 'workbench/tasks', featureSlug: undefined }
    return {
      useViewKey: (selector: (current: ViewKeySnapshot) => ViewKeySnapshot) => selector(snapshot),
      selectWorkbenchTab: (_tab: WorkbenchTabKey) => {},
      openFeatureDetail: (_slug: string) => {},
    }
  }

  it('a committed seat mounts the hover entries + panel-primary through the shell (MOCK chrome project)', async () => {
    const services = makeLaunchServices()
    const onLaunched = vi.fn()
    const seat = fixedSeat({ services, onLaunched })
    const session = createBoardSessionStore()
    render(
      <WorkbenchShell
        t={t.en as WorkbenchShellProps['t']}
        {...makeViewFace()}
        launch={seat}
        boardSession={session}
      />,
    )
    // The mock registry's active project provides id + codeRoot (MOCK_WORKBENCH_STATE).
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-launch-trigger][data-mount="node-hover"]')).not.toBeNull() })
    // The dock entry mounts with the same services after a selection (the
    // mock detail face covers 5.6, so the dock opens with content).
    fireEvent.click(q('[data-dsh-forge-dep-tree] [data-id="dsh-forge-m2/5.6"]'))
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-launch-trigger][data-mount="panel-primary"]')).not.toBeNull() })
    await launchFrom(document.querySelector('[data-dsh-forge-launch-trigger][data-mount="panel-primary"]') as HTMLElement)
    await waitFor(() => { expect(onLaunched).toHaveBeenCalled() })
    expect(services.recordSessionLink).toHaveBeenCalled()
    expect(session.getActiveLinks().size).toBe(1)
  })

  it('an absent seat keeps the shell on the build-stage mocks (hostless)', async () => {
    render(<WorkbenchShell t={t.en as WorkbenchShellProps['t']} {...makeViewFace()} />)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-toolbar]')).not.toBeNull() })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-launch-trigger][data-mount="node-hover"]')).not.toBeNull() })
    // The mock probe answers: the trigger is enabled (probe=available mock).
    await waitFor(() => {
      expect((document.querySelector('[data-dsh-forge-launch-trigger][data-mount="node-hover"]') as HTMLButtonElement).disabled).toBe(false)
    })
  })
})
