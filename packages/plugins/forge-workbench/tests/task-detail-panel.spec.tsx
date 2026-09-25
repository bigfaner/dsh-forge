// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskDetailPanel } from '../src/client/views/tasks/TaskDetailPanel.tsx'
import type { TaskDetailPanelProps } from '../src/client/views/tasks/TaskDetailPanel.tsx'
import { TASK_STATUS_DOT_STATE, taskStatusLabel } from '../src/client/i18n/task-status.ts'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  createMockTaskDetailFace, MOCK_TASK_DETAIL_HEADER, MOCK_TASK_DETAIL_RICH, MOCK_TASK_DETAIL_SPARSE,
} from '../src/client/mocks/workbench.ts'
import type { TaskDetail } from '../src/client/ipc-types.ts'

// Task 5.7 — the UF3 detail dock BUILD units (mocked face; 5.8 mounts the
// dock into the board page, 5.15 wires the IPC verb). AC map:
//   AC1 五区块齐备 (header/description/depChain/records/links render matrix)
//   AC2 依赖链 same-order + clickable navigation
//   AC3 records 来源徽标 + time; links active/ended distinction
//   AC4 open/close (Esc/✕/外点) + focus trap + focus return
//   AC5 launch entry mount (panel-primary variant) / reserved placeholder
//   AC6 this suite itself (render matrix + focus + empty states).
// Hard Rule: the status labels route through the ONE shared vocabulary
// (i18n/task-status.ts) — asserted against the exported functions.

// The upstream StateDot resolves through the module table at runtime; the
// npm node entry carries undeclared transitive deps only the upstream
// monorepo supplies, so jsdom renders stub it (task-board.spec precedent —
// the real dot rides the e2e).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))

// The panel reuses TaskBoardPage's localIdOf; that module graph pulls the
// real ReactFlow, which needs d3-zoom + ResizeObserver (absent in jsdom) —
// the lib-boundary standin keeps the import inert (task-board.spec precedent).
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const RICH_KEY = MOCK_TASK_DETAIL_RICH.summary.key
const HEADER_KEY = MOCK_TASK_DETAIL_HEADER.summary.key
const SPARSE_KEY = MOCK_TASK_DETAIL_SPARSE.summary.key

/** The stateful harness: the parent owns the selection (the 5.8 shape). */
function Harness(props: Partial<TaskDetailPanelProps> & { initialKey: string | null; openKey?: string }) {
  const { initialKey, openKey, ...panelProps } = props
  const [taskKey, setTaskKey] = useState<string | null>(initialKey)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" data-testid="trigger" onClick={() => { setTaskKey(openKey ?? initialKey) }}>open</button>
      <TaskDetailPanel
        t={t.en}
        taskKey={taskKey}
        {...panelProps}
        onClose={() => {
          setTaskKey(null)
          panelProps.onClose?.()
        }}
      />
    </div>
  )
}

/** Render + settle the initial load into the populated state. */
async function renderPanel(props: Partial<TaskDetailPanelProps> & { initialKey: string | null }) {
  const view = render(<Harness {...props} />)
  await waitFor(() => {
    expect(document.querySelector('[data-dsh-forge-detail-header]')).not.toBeNull()
  })
  return view
}

/** The dock root (null until open). */
const root = (): HTMLElement =>
  document.querySelector('[data-dsh-forge-task-detail]') as HTMLElement

const q = (selector: string): HTMLElement =>
  document.querySelector(selector) as HTMLElement

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// AC4 — dock contract: mount geometry + close affordances
// ---------------------------------------------------------------------------

describe('dock: mount and close', () => {
  it('renders nothing while the selection is null', () => {
    render(<Harness initialKey={null} />)
    expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull()
  })

  it('renders at the right-edge dock geometry (min(440px,45vw), z100, no mask)', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const dock = root()
    expect(dock.getAttribute('role')).toBe('dialog')
    expect(dock.getAttribute('aria-modal')).toBe('true')
    expect(dock.style.width).toBe('min(440px, 45vw)')
    expect(dock.style.zIndex).toBe('100')
    // The dock is NOT a mask: nothing between it and the board dims.
    expect(document.querySelector('[data-dsh-forge-dialog-mask]')).toBeNull()
    // The slide-in settles (0.2s transform transition from off-canvas).
    expect(dock.style.transition).toContain('transform')
    await waitFor(() => { expect(dock.style.transform).toBe('translateX(0)') })
  })

  it('Esc and the ✕ button both fire onClose', async () => {
    const onClose = vi.fn()
    // Direct mount with a FIXED taskKey: each close affordance fires onClose
    // while the dock stays open for the next one (the parent decides).
    render(<TaskDetailPanel t={t.en} taskKey={RICH_KEY} onClose={onClose} />)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]')).not.toBeNull() })
    fireEvent.keyDown(root(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(q('[data-dsh-forge-detail-close]'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a pointerdown outside closes; one inside never does', async () => {
    const onClose = vi.fn()
    await renderPanel({ initialKey: RICH_KEY, onClose })
    fireEvent.pointerDown(root())
    fireEvent.pointerDown(q('[data-dsh-forge-detail-close]'))
    expect(onClose).not.toHaveBeenCalled()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    try {
      fireEvent.pointerDown(outside)
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      outside.remove()
    }
  })
})

// ---------------------------------------------------------------------------
// AC4 — focus contract: focus-in, trap, focus return
// ---------------------------------------------------------------------------

describe('dock: focus management', () => {
  it('focus enters the dock on open and returns to the trigger on close', async () => {
    render(<Harness initialKey={null} openKey={RICH_KEY} />)
    const trigger = q('[data-testid="trigger"]')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)
    fireEvent.click(trigger)
    await waitFor(() => { expect(root()).not.toBeNull() })
    expect(document.activeElement).toBe(root())
    fireEvent.keyDown(root(), { key: 'Escape' })
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-task-detail]')).toBeNull() })
    expect(document.activeElement).toBe(trigger)
  })

  it('focus arbitration: a modal dialog mounted in the same commit keeps the focus (SC2-1 确认默认焦点)', async () => {
    // The SC2-1 shape: a node-card click both opens the dock AND the launch
    // confirm dialog — the dialog's initial focus must survive the dock's
    // later-in-commit focus-in (Enter alone confirms the launch).
    render(<Harness initialKey={null} openKey={RICH_KEY} />)
    const trigger = q('[data-testid="trigger"]')
    trigger.focus()
    const dialogButton = document.createElement('button')
    dialogButton.type = 'button'
    dialogButton.setAttribute('data-dsh-forge-launch-confirm-ok', '')
    const dialogCard = document.createElement('div')
    dialogCard.setAttribute('data-dsh-forge-dialog', 'launch-confirm')
    dialogCard.appendChild(dialogButton)
    document.body.appendChild(dialogCard)
    dialogButton.focus()
    fireEvent.click(trigger)
    await waitFor(() => { expect(root()).not.toBeNull() })
    expect(document.activeElement).toBe(dialogButton)
    dialogCard.remove()
  })

  it('Tab/Shift+Tab cycle inside the dock (focus trap)', async () => {
    await renderPanel({
      initialKey: RICH_KEY,
      projectId: 'proj-1',
      codeRoot: 'Z:\\project\\dsh\\dsh-forge',
      onNavigate: () => {},
      onEnterSession: () => {},
    })
    // DOM focusable order: ✕ close, launch trigger, 4 section toggles,
    // 3 dep rows, 2 enter-session buttons — first = ✕, last = the second
    // link's enter button.
    const first = q('[data-dsh-forge-detail-close]')
    const last = q('[data-dsh-forge-detail-enter="session-7b2e4f60"]')
    first.focus()
    fireEvent.keyDown(root(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(root(), { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })
})

// ---------------------------------------------------------------------------
// AC1/AC2/AC3 — the five sections, render matrix (rich fixture)
// ---------------------------------------------------------------------------

describe('sections: header + description + depChain + records + links', () => {
  it('renders the summary header fields (title, qualified key, shared-vocab status pill, badges)', async () => {
    await renderPanel({ initialKey: HEADER_KEY })
    const summary = MOCK_TASK_DETAIL_HEADER.summary
    expect(q('[data-dsh-forge-detail-header] h2').textContent).toBe(summary.title)
    expect(q('[data-dsh-forge-detail-header]').textContent).toContain(summary.key)
    // 状态点进度: the pill's label + dot BOTH route through the shared
    // vocabulary (Hard Rule — asserted against the exported functions).
    const pill = q('[data-dsh-forge-detail-status="completed"]')
    expect(pill.textContent).toBe(taskStatusLabel(summary.status, t.en))
    expect(q('[data-dsh-forge-detail-status="completed"] [data-mock-state-dot]').getAttribute('data-mock-state-dot'))
      .toBe(TASK_STATUS_DOT_STATE[summary.status])
    // The full header matrix: branch (mono), worktree badge, 来源 badge.
    expect(q('[data-dsh-forge-detail-header]').textContent).toContain('release/v1')
    expect(q('[data-dsh-forge-detail-header] [data-dsh-forge-badge="worktree"]').textContent).toBe('worktree')
    expect(q('[data-dsh-forge-detail-header] [data-dsh-forge-badge="source:terminal"]').textContent).toBe('Terminal')
  })

  it('renders the description through the read-only MarkdownView', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const markdown = q('[data-dsh-forge-detail-section="description"] [data-dsh-forge-markdown]')
    expect(markdown).not.toBeNull()
    expect(markdown.textContent).toContain('Indexer dialect guard')
    expect(markdown.textContent).toContain('localIdOf')
  })

  it('renders the dep chain in fixture (topological) order with shared-vocab per-item status', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const rows = Array.from(document.querySelectorAll('[data-dsh-forge-detail-dep]'))
    expect(rows.map(row => row.getAttribute('data-dsh-forge-detail-dep'))).toEqual(
      MOCK_TASK_DETAIL_RICH.depChain.map(entry => entry.key),
    )
    // Same source as the DAG: statuses mirror the board fixture family.
    for (const entry of MOCK_TASK_DETAIL_RICH.depChain) {
      const row = q(`[data-dsh-forge-detail-dep="${entry.key}"]`)
      expect(row.textContent).toContain(taskStatusLabel(entry.status, t.en))
      expect(row.querySelector('[data-mock-state-dot]')?.getAttribute('data-mock-state-dot'))
        .toBe(TASK_STATUS_DOT_STATE[entry.status])
    }
    // The last hop carries the 「→ this task」 terminator.
    expect(rows[rows.length - 1]?.textContent).toContain(`→ ${t.en('detail.depChain.self')}`)
  })

  it('dep-chain rows navigate the selection seam on click; without a handler they stay inert text', async () => {
    const onNavigate = vi.fn()
    const withNav = await renderPanel({ initialKey: RICH_KEY, onNavigate })
    fireEvent.click(q('[data-dsh-forge-detail-dep="dsh-forge-m2/5.6"] button'))
    expect(onNavigate).toHaveBeenCalledWith('dsh-forge-m2/5.6')
    withNav.unmount()

    // The inert variant (no handler): a row renders as a span, never a dead control.
    const view = render(
      <TaskDetailPanel t={t.en} taskKey={RICH_KEY} onClose={() => {}} face={createMockTaskDetailFace()} />,
    )
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]')).not.toBeNull() })
    expect(q('[data-dsh-forge-detail-dep="dsh-forge-m2/5.6"] > span').tagName).toBe('SPAN')
    expect(document.querySelector('[data-dsh-forge-detail-dep="dsh-forge-m2/5.6"] button')).toBeNull()
    view.unmount()
  })

  it('renders the records timeline: time + kind + per-entry 来源 badges + markdown summaries', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const rows = Array.from(document.querySelectorAll('[data-dsh-forge-detail-record]'))
    expect(rows).toHaveLength(MOCK_TASK_DETAIL_RICH.records.length)
    const [first, second, third] = rows as Array<HTMLElement>
    // Time (deterministic YYYY-MM-DD HH:mm, ISO on title) + kind.
    expect(first.querySelector('time')?.textContent).toBe('2026-09-22 09:05')
    expect(first.querySelector('time')?.getAttribute('title')).toBe('2026-09-22T09:05:00.000Z')
    expect(first.textContent).toContain('coding.feature')
    // 逐笔来源徽标: [Session] / [Terminal] / none for null.
    expect(first.querySelector('[data-dsh-forge-badge="source:session"]')?.textContent).toBe('Session')
    expect(second.querySelector('[data-dsh-forge-badge="source:terminal"]')?.textContent).toBe('Terminal')
    expect(third.querySelector('[data-dsh-forge-badge]')).toBeNull()
    // Summaries render through the shared read-only markdown surface.
    expect(first.querySelectorAll('[data-dsh-forge-markdown]')).toHaveLength(1)
    expect(first.textContent).toContain('all green')
  })

  it('renders the link history 新→旧 with the active/ended distinction', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const rows = Array.from(document.querySelectorAll('[data-dsh-forge-detail-link]'))
    expect(rows.map(row => row.getAttribute('data-dsh-forge-detail-link'))).toEqual(
      MOCK_TASK_DETAIL_RICH.links.map(link => link.sessionId),
    )
    const [active, ended] = rows as Array<HTMLElement>
    expect(active.getAttribute('data-link-status')).toBe('active')
    expect(active.querySelector('[data-dsh-forge-badge="link:active"]')?.textContent).toBe('Active')
    expect(active.querySelector('time')?.textContent).toBe('2026-09-22 08:05')
    expect(ended.getAttribute('data-link-status')).toBe('ended')
    expect(ended.querySelector('[data-dsh-forge-badge="link:ended"]')?.textContent).toBe('Ended')
    expect(ended.querySelector('time')?.textContent).toBe('2026-09-21 14:02 — 2026-09-21 16:40')
  })

  it('the 「进入会话」 seam fires with the sessionId when provided; rows stay informational without it', async () => {
    const onEnterSession = vi.fn()
    const withSeam = await renderPanel({ initialKey: RICH_KEY, onEnterSession })
    fireEvent.click(q('[data-dsh-forge-detail-enter="session-a3f2c9d1"]'))
    expect(onEnterSession).toHaveBeenCalledWith('session-a3f2c9d1')
    withSeam.unmount()

    const view = render(<Harness initialKey={RICH_KEY} />)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-links]')).not.toBeNull() })
    expect(document.querySelector('[data-dsh-forge-detail-enter]')).toBeNull()
    view.unmount()
  })

  it('sections are accordions: default expanded, toggle collapses the body', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const toggle = q('[data-dsh-forge-detail-toggle="records"]')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('dsh-forge-detail-section-body-records')).not.toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('dsh-forge-detail-section-body-records')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC5 — the button slot (6.1: the M2 launch entry retired with the chain)
// ---------------------------------------------------------------------------

describe('button slot', () => {
  it('renders the reserved disabled placeholder when no dispatch mount is present (project ref irrelevant since 6.1)', async () => {
    await renderPanel({
      initialKey: RICH_KEY,
      projectId: '6f1a2d3e-8b44-4c9a-9d01-3c7f5a2b9e10',
      codeRoot: 'Z:\\project\\dsh\\dsh-forge',
    })
    const reserved = q('[data-dsh-forge-detail-launch-reserved]')
    expect(reserved.disabled).toBe(true)
    expect(reserved.textContent).toContain(t.en('launch.primary'))
    expect(reserved.getAttribute('title')).toBe(t.en('detail.launch.reserved'))
    expect(document.querySelector('[data-dsh-forge-launch-trigger]')).toBeNull()
  })

  it('renders the reserved disabled placeholder without the project ref', async () => {
    await renderPanel({ initialKey: RICH_KEY })
    const reserved = q('[data-dsh-forge-detail-launch-reserved]')
    expect(reserved.disabled).toBe(true)
    expect(reserved.textContent).toContain(t.en('launch.primary'))
    expect(reserved.getAttribute('title')).toBe(t.en('detail.launch.reserved'))
    expect(document.querySelector('[data-dsh-forge-launch-trigger]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC6 — empty states (sparse fixture)
// ---------------------------------------------------------------------------

describe('empty states', () => {
  it('every empty section renders its one-line hint; absent dimensions render no badge', async () => {
    await renderPanel({ initialKey: SPARSE_KEY })
    expect(q('[data-dsh-forge-detail-description-empty]').textContent).toBe(t.en('detail.description.empty'))
    expect(q('[data-dsh-forge-detail-dep-empty]').textContent).toBe(t.en('detail.depChain.empty'))
    expect(q('[data-dsh-forge-detail-records-empty]').textContent).toBe(t.en('detail.records.empty'))
    expect(q('[data-dsh-forge-detail-links-empty]').textContent).toBe(t.en('detail.links.empty'))
    // Sparse summary: worktree true (badge shown), source null (no badge).
    expect(q('[data-dsh-forge-detail-header] [data-dsh-forge-badge="worktree"]')).not.toBeNull()
    expect(q('[data-dsh-forge-detail-header] [data-dsh-forge-badge="source:session"]')).toBeNull()
    expect(q('[data-dsh-forge-detail-header] [data-dsh-forge-badge="source:terminal"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Load phases: skeleton / switch-no-flicker / error+retry / mock twin
// ---------------------------------------------------------------------------

describe('load phases', () => {
  it('first open shows the 分区骨架 until the load settles', async () => {
    const face = { loadDetail: vi.fn(() => new Promise<TaskDetail>(() => {})) }
    render(<TaskDetailPanel t={t.en} taskKey={RICH_KEY} face={face} onClose={() => {}} />)
    expect(q('[data-dsh-forge-detail-skeleton]').getAttribute('role')).toBe('status')
    expect(document.querySelector('[data-dsh-forge-detail-header]')).toBeNull()
    // The load carries the verb's argument pair.
    expect(face.loadDetail).toHaveBeenCalledWith('', RICH_KEY)
  })

  it('a task switch keeps the rendered detail up with aria-busy (无闪烁)', async () => {
    let call = 0
    const face = {
      loadDetail: vi.fn((_projectId: string, taskKey: string) => {
        call += 1
        return call === 1
          ? Promise.resolve(MOCK_TASK_DETAIL_RICH)
          : new Promise<TaskDetail>(() => {})
      }),
    }
    const view = render(<TaskDetailPanel t={t.en} taskKey={RICH_KEY} face={face} onClose={() => {}} />)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]')).not.toBeNull() })
    view.rerender(<TaskDetailPanel t={t.en} taskKey={HEADER_KEY} face={face} onClose={() => {}} />)
    expect(root().getAttribute('aria-busy')).toBe('true')
    expect(root().getAttribute('data-dsh-forge-task-detail')).toBe(HEADER_KEY)
    // The previous content stays painted while the new detail loads.
    expect(q('[data-dsh-forge-detail-header]').textContent).toContain(MOCK_TASK_DETAIL_RICH.summary.title)
  })

  it('a rejection shows the error card; retry reloads into content', async () => {
    let call = 0
    const face = {
      loadDetail: vi.fn((_projectId: string, taskKey: string): Promise<TaskDetail> => {
        call += 1
        return call === 1
          ? Promise.reject({ code: 'ERR_TASK_NOT_FOUND', message: 'build-stage mock: no task detail' })
          : Promise.resolve(MOCK_TASK_DETAIL_RICH)
      }),
    }
    const view = render(<TaskDetailPanel t={t.en} taskKey={RICH_KEY} face={face} onClose={() => {}} />)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-error]').getAttribute('role')).toBe('alert') })
    expect(q('[data-dsh-forge-detail-retry]').textContent).toBe(t.en('detail.error.retry'))
    fireEvent.click(q('[data-dsh-forge-detail-retry]'))
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]')).not.toBeNull() })
    expect(face.loadDetail).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it('the mock twin: known keys resolve, unknown keys reject the verb-error shape', async () => {
    const face = createMockTaskDetailFace()
    await expect(face.loadDetail('', RICH_KEY)).resolves.toBe(MOCK_TASK_DETAIL_RICH)
    await expect(face.loadDetail('', 'dsh-forge-m2/9.9')).rejects.toMatchObject({
      code: 'ERR_TASK_NOT_FOUND',
    })
  })
})

// ---------------------------------------------------------------------------
// Locale balance — the zh half renders the same surfaces
// ---------------------------------------------------------------------------

describe('zh locale', () => {
  it('renders the section titles and link badges from the zh dictionary', async () => {
    render(<Harness initialKey={RICH_KEY} t={t.zh} />)
    await waitFor(() => { expect(q('[data-dsh-forge-detail-header]')).not.toBeNull() })
    expect(q('[data-dsh-forge-detail-toggle="depChain"]').textContent).toContain('依赖链')
    expect(q('[data-dsh-forge-detail-toggle="links"]').textContent).toContain('挂接历史')
    expect(q('[data-dsh-forge-badge="link:active"]').textContent).toBe('会话中')
    expect(q('[data-dsh-forge-badge="link:ended"]').textContent).toBe('已结束')
    expect(q('[data-dsh-forge-detail-dep="dsh-forge-m2/5.5"]').textContent)
      .toContain(taskStatusLabel('in_progress', t.zh))
  })
})
