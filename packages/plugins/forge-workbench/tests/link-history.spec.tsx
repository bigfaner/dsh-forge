// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinkHistory } from '../src/client/views/tasks/detail/LinkHistory.tsx'
import { TaskDetailPanel } from '../src/client/views/tasks/TaskDetailPanel.tsx'
import type { TaskDetailPanelProps } from '../src/client/views/tasks/TaskDetailPanel.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { SessionLink, TaskDetail, TaskStatus } from '../src/client/ipc-types.ts'
import type {
  LineageCatalogEntry, LineageSessionRow, LineageSessionsSnapshot,
} from '../src/client/lineage'

// Task 2.6 — the C5 挂接历史 增强 matrix (ui-design §Component C5, 裁决 #27:
// the enhancement lives INSIDE the existing links section — no new panel).
// AC map:
//   AC1 行展开血缘后代 (active+ended / DFS+depth / disposed 不可用 / 20 上限
//      查看全部 / 新→旧 + ended 行完整呈现继承 M2)
//   AC2 [打开] 双通道 (top → sessionId; subagent → address triple; 打开失败
//      toast 不静默)
//   AC3 No-link 态 [发起] + todo#30 终态禁用矩阵 (panel-level wiring)
//   AC4 Inference-degraded (仅顶层 + 血缘位「不可用」 + 顶层可打开)
//   AC5 形态零变更 (dock geometry / no mask / dual-host pane form / Esc)
// The upstream StateDot renders through the module-table stub (the
// task-detail-panel.spec precedent — the real dot rides the e2e); the panel
// leg pulls the board's ReactFlow graph, stubbed inert likewise.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: (props: { state: string }) => <span data-mock-state-dot={props.state} />,
}))
vi.mock('@xyflow/react', async () => await import('./helpers/xyflow-standin'))

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

// ---------------------------------------------------------------------------
// Fixtures — links (M2 DTO rows, 新→旧) + the upstream sessions snapshot
// (the 2.5 lineage service's duck-typed input faces, verbatim shapes)
// ---------------------------------------------------------------------------

const link = (
  sessionId: string,
  status: 'active' | 'ended',
  startedAt: string,
  endedAt: string | null = null,
): SessionLink => ({
  id: `link-${sessionId}`, projectId: 'p-1', taskKey: 'dsh-forge-m4/2.6',
  sessionId, status, startedAt, endedAt,
})

const LINKS: readonly SessionLink[] = Object.freeze([
  link('top-live', 'active', '2026-09-28T08:00:00.000Z'),
  link('top-ended-live', 'ended', '2026-09-27T10:00:00.000Z', '2026-09-27T12:00:00.000Z'),
  link('top-disposed', 'ended', '2026-09-26T09:00:00.000Z', '2026-09-26T11:00:00.000Z'),
])

const row = (id: string, extra: Partial<LineageSessionRow> = {}): LineageSessionRow => ({ id, ...extra })

const child = (
  id: string,
  mode: 'one-shot' | 'continuable',
  extra: Partial<Extract<LineageCatalogEntry, { kind: 'child' }>> = {},
): LineageCatalogEntry => ({ kind: 'child', id, mode, ...extra })

/** The populated snapshot: a live active tree, a live ENDED tree (历史快照), and a disposed top. */
const SNAPSHOT: LineageSessionsSnapshot = Object.freeze({
  byId: Object.freeze({
    'top-live': Object.freeze(row('top-live', { displayTitle: 'dispatch top', running: true })),
    'top-ended-live': Object.freeze(row('top-ended-live', { title: 'the earlier round' })),
    'top-disposed': undefined,
    'sub-a': Object.freeze(row('sub-a', {
      title: 'dsh-forge-m4/2.6 C5 挂接历史增强', origin: 'subagent', parentId: 'top-live', running: true,
    })),
    'sub-a-1': Object.freeze(row('sub-a-1', {
      title: 'dsh-forge-m4/2.6 grandchild leg', origin: 'subagent', parentId: 'sub-a',
    })),
    'sub-b': Object.freeze(row('sub-b', {
      displayTitle: 'dsh-forge-m4/2.7 channel', origin: 'subagent', parentId: 'top-live',
    })),
    'sub-e1': Object.freeze(row('sub-e1', {
      title: 'dsh-forge-m4/2.5 service leg', origin: 'subagent', parentId: 'top-ended-live',
    })),
  }),
  subagentsByParent: Object.freeze({
    'top-live': Object.freeze({ entries: Object.freeze([
      child('sub-a', 'continuable', { activity: 'running' }),
      child('sub-b', 'one-shot', { activity: 'inactive' }),
    ] as const) }),
    'sub-a': Object.freeze({ entries: Object.freeze([child('sub-a-1', 'one-shot')]) }),
    'top-ended-live': Object.freeze({ entries: Object.freeze([child('sub-e1', 'one-shot')]) }),
  }),
})

/** 22 direct children — the 20-cap 「查看全部」 fold fixture. */
const MANY_SNAPSHOT: LineageSessionsSnapshot = Object.freeze({
  byId: Object.freeze({
    'top-many': Object.freeze(row('top-many')),
    ...Object.fromEntries(Array.from({ length: 22 }, (_, index) => [`many-${index}`, Object.freeze(row(`many-${index}`, {
      title: `dsh-forge-m4/2.6 child ${index}`, origin: 'subagent', parentId: 'top-many',
    }))])),
  }),
  subagentsByParent: Object.freeze({
    'top-many': Object.freeze({
      entries: Object.freeze(Array.from({ length: 22 }, (_, index) => child(`many-${index}`, 'one-shot'))),
    }),
  }),
})

const q = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement

/** The descendant rows' session ids in DOM order (DFS assertion helper). */
const descendantIds = (): string[] =>
  Array.from(document.querySelectorAll('[data-dsh-forge-detail-descendant]'))
    .map(el => (el as HTMLElement).getAttribute('data-dsh-forge-detail-descendant') ?? '')

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// AC1 — 行展开血缘后代
// ---------------------------------------------------------------------------

describe('AC1: row expansion — lineage descendants', () => {
  it('active 与 ended 行均可展开:DFS 树序 + 深度缩进 + 命名(mono)+ 后代 [打开]', () => {
    render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} />)
    // 新→旧 order + ended rows fully presented (M2 inheritance).
    expect(Array.from(document.querySelectorAll('[data-dsh-forge-detail-link]')).map(
      el => (el as HTMLElement).getAttribute('data-dsh-forge-detail-link'),
    )).toEqual(['top-live', 'top-ended-live', 'top-disposed'])
    expect(Array.from(document.querySelectorAll('[data-dsh-forge-detail-link]')).map(
      el => (el as HTMLElement).getAttribute('data-link-status'),
    )).toEqual(['active', 'ended', 'ended'])

    // ACTIVE row = the CURRENT tree (DFS: sub-a → sub-a-1 → sub-b).
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    expect(descendantIds()).toEqual(['sub-a', 'sub-a-1', 'sub-b'])
    const firstRow = q('[data-dsh-forge-detail-descendant="sub-a"]')
    expect(firstRow.textContent).toContain('dsh-forge-m4/2.6 C5 挂接历史增强')
    expect(firstRow.querySelector('[data-mock-state-dot]')?.getAttribute('data-mock-state-dot')).toBe('ongoing')
    // Depth indent ladder (C3 展开态): depth-2 grandchild indents 12px past depth-1.
    expect(q('[data-dsh-forge-detail-descendant="sub-a"]').style.paddingLeft).toBe('0px')
    expect(q('[data-dsh-forge-detail-descendant="sub-a-1"]').style.paddingLeft).toBe('12px')
    // ENDED row (session still live upstream) = the historical snapshot view.
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-ended-live"]'))
    expect(descendantIds()).toEqual(['sub-a', 'sub-a-1', 'sub-b', 'sub-e1'])
    // The toggle is a disclosure (aria-expanded flips, the body is labelled).
    expect(q('[data-dsh-forge-detail-link-toggle="top-live"]').getAttribute('aria-expanded')).toBe('true')
    expect(q('[data-dsh-forge-detail-link-toggle="top-disposed"]').getAttribute('aria-expanded')).toBe('false')
  })

  it('disposed 会话(ended,byId 缺席)行可展开但血缘位「不可用」', () => {
    render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} />)
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-disposed"]'))
    const slot = q('[data-dsh-forge-detail-lineage-unavailable="top-disposed"]')
    expect(slot.textContent).toBe('Unavailable')
    expect(descendantIds()).toEqual([])
  })

  it('超上限 20:20 条呈现 + 「查看全部 N」折行(全量计数)', () => {
    render(<LinkHistory t={t.en} links={[link('top-many', 'active', '2026-09-28T08:00:00.000Z')]} lineage={{ snapshot: MANY_SNAPSHOT }} />)
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-many"]'))
    expect(document.querySelectorAll('[data-dsh-forge-detail-descendant]').length).toBe(20)
    const fold = q('[data-dsh-forge-detail-descendants-more]')
    expect(fold.getAttribute('data-dsh-forge-detail-descendants-more')).toBe('22')
    expect(fold.textContent).toBe('Show all 22')
  })

  it('空树展开 = 一行空提示(正常态,非错误)', () => {
    render(<LinkHistory t={t.en} links={[link('top-live', 'active', '2026-09-28T08:00:00.000Z')]} lineage={{ snapshot: { byId: { 'top-live': row('top-live') }, subagentsByParent: {} } }} />)
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    expect(q('[data-dsh-forge-detail-descendants-empty]').textContent).toBe('No subagent sessions under this link.')
  })

  it('seam 缺席(无 lineage 座位)→ 行保持 M2 信息态:无展开钮/无「不可用」', () => {
    render(<LinkHistory t={t.en} links={LINKS} />)
    expect(document.querySelector('[data-dsh-forge-detail-link-toggle]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-detail-lineage-off]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-detail-links-launch]')).toBeNull()
    // The M2 rows themselves are intact.
    expect(Array.from(document.querySelectorAll('[data-dsh-forge-detail-link]')).map(
      el => (el as HTMLElement).getAttribute('data-dsh-forge-detail-link'),
    )).toEqual(['top-live', 'top-ended-live', 'top-disposed'])
  })
})

// ---------------------------------------------------------------------------
// AC2 — [打开] 双通道 + Open-failed
// ---------------------------------------------------------------------------

describe('AC2: the [打开] dual channel', () => {
  it('顶层 [打开] → session-focus 通道(sessionId 字符串)', () => {
    const onEnterSession = vi.fn()
    render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={onEnterSession} />)
    fireEvent.click(q('[data-dsh-forge-detail-enter="top-live"]'))
    expect(onEnterSession).toHaveBeenCalledWith('top-live')
  })

  it('subagent 后代 [打开] → SubagentAddress 地址三元组(逐字来自 lineage hit)', () => {
    const onEnterSession = vi.fn()
    render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={onEnterSession} />)
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    fireEvent.click(q('[data-dsh-forge-detail-descendant-open="sub-a-1"]'))
    expect(onEnterSession).toHaveBeenCalledWith({
      parentSessionId: 'sub-a', childSessionId: 'sub-a-1', mode: 'one-shot',
    })
  })

  it('打开失败(拒绝的 promise)→ toast「会话不存在或已清理」不静默 + 可关闭;void seam 不 toast', async () => {
    const rejecting = vi.fn(() => Promise.reject(new Error('gone')))
    const view = render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={rejecting} />)
    fireEvent.click(q('[data-dsh-forge-detail-enter="top-live"]'))
    await waitFor(() => { expect(q('[data-dsh-forge-detail-links-toast]').getAttribute('role')).toBe('status') })
    expect(q('[data-dsh-forge-detail-links-toast]').textContent).toContain('Session not found or already cleaned up.')
    fireEvent.click(q('[data-dsh-forge-detail-links-toast-dismiss]'))
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-detail-links-toast]')).toBeNull() })
    view.unmount()

    // The subagent channel's failure toasts the same way.
    const view2 = render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={rejecting} />)
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    fireEvent.click(q('[data-dsh-forge-detail-descendant-open="sub-a"]'))
    await waitFor(() => { expect(q('[data-dsh-forge-detail-links-toast]').textContent).toContain('Session not found') })
    view2.unmount()

    // A void (sync) seam never toasts — the M3 implementations' form.
    render(<LinkHistory t={t.en} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={vi.fn(() => {})} />)
    fireEvent.click(q('[data-dsh-forge-detail-enter="top-live"]'))
    expect(document.querySelector('[data-dsh-forge-detail-links-toast]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC3 — No-link 态 [发起] + todo#30 终态禁用
// ---------------------------------------------------------------------------

describe('AC3: the No-link state and todo#30', () => {
  it('「未挂接会话」+ [发起] sm 主按钮 — 点击走 M3 发起链 seam', () => {
    const onLaunch = vi.fn()
    render(<LinkHistory t={t.en} links={[]} onLaunch={onLaunch} />)
    expect(q('[data-dsh-forge-detail-links-empty]').textContent).toBe('No session has been attached to this task yet.')
    const launch = q('[data-dsh-forge-detail-links-launch]')
    expect(launch.textContent).toBe('Launch')
    expect(launch.disabled).toBe(false)
    fireEvent.click(launch)
    expect(onLaunch).toHaveBeenCalledTimes(1)
  })

  it('launchDisabled → [发起] 禁用 + 终态 tooltip,点击不触发', () => {
    const onLaunch = vi.fn()
    render(<LinkHistory t={t.en} links={[]} onLaunch={onLaunch} launchDisabled />)
    const launch = q('[data-dsh-forge-detail-links-launch]')
    expect(launch.disabled).toBe(true)
    expect(launch.getAttribute('title')).toBe('The task is in a terminal state — launching a new session is disabled.')
    fireEvent.click(launch)
    expect(onLaunch).not.toHaveBeenCalled()
  })

  it('无 onLaunch seam → 仅信息态提示(零缩水 M2 空态)', () => {
    render(<LinkHistory t={t.en} links={[]} />)
    expect(q('[data-dsh-forge-detail-links-empty]').textContent).toBe('No session has been attached to this task yet.')
    expect(document.querySelector('[data-dsh-forge-detail-links-launch]')).toBeNull()
  })

  it('panel 接线矩阵:终态(completed/skipped/rejected)禁用,非终态(pending/in_progress/blocked)可用(todo#30)', async () => {
    const detailOf = (status: TaskStatus): TaskDetail => ({
      summary: {
        key: 'dsh-forge-m4/2.6', title: 'C5 link history', status, featureSlug: 'dsh-forge-m4',
        blockers: [], branch: null, worktree: false, source: null, updatedAt: '2026-09-28T08:00:00.000Z',
      },
      descriptionMarkdown: '', depChain: [], records: [], links: [],
    })
    const mount = (status: TaskStatus): TaskDetailPanelProps['dispatch'] => ({
      verbs: {
        checkStageArtifacts: vi.fn(async () => ({ missing: [] })),
        dispatchTasks: vi.fn(async () => ({ dispatched: [] })),
        redispatch: vi.fn(async () => ({ dispatched: [] })),
      },
      rows: [], entries: [],
      onOpenApproval: () => {},
    })
    for (const [status, disabled] of [
      ['completed', true], ['skipped', true], ['rejected', true],
      ['pending', false], ['in_progress', false], ['blocked', false], ['suspended', false],
    ] as Array<[TaskStatus, boolean]>) {
      const face = { loadDetail: vi.fn(async () => detailOf(status)) }
      const view = render(
        <TaskDetailPanel t={t.en} taskKey="dsh-forge-m4/2.6" face={face} dispatch={mount(status)} onClose={() => {}} />,
      )
      await waitFor(() => { expect(q('[data-dsh-forge-detail-links-launch]')).not.toBeNull() })
      expect(q('[data-dsh-forge-detail-links-launch]').disabled, `${status} → disabled=${disabled}`).toBe(disabled)
      view.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// AC4 — Inference-degraded
// ---------------------------------------------------------------------------

describe('AC4: inference-degraded', () => {
  it('仅顶层会话行(无展开钮)+ 血缘位「不可用」次文字 + 顶层可打开', () => {
    const onEnterSession = vi.fn()
    render(<LinkHistory t={t.en} links={LINKS} lineage={{}} onEnterSession={onEnterSession} />)
    expect(document.querySelector('[data-dsh-forge-detail-link-toggle]')).toBeNull()
    for (const sessionId of ['top-live', 'top-ended-live', 'top-disposed']) {
      expect(q(`[data-dsh-forge-detail-lineage-off="${sessionId}"]`).textContent).toBe('Unavailable')
    }
    // 顶层可打开 — the [打开] seam stays live.
    fireEvent.click(q('[data-dsh-forge-detail-enter="top-live"]'))
    expect(onEnterSession).toHaveBeenCalledWith('top-live')
  })
})

// ---------------------------------------------------------------------------
// AC5 — 形态零变更(the enhancement live inside the unchanged dock form)
// ---------------------------------------------------------------------------

describe('AC5: form invariants with the enhancement live', () => {
  const DETAIL_WITH_LINKS: TaskDetail = {
    summary: {
      key: 'dsh-forge-m4/2.6', title: 'C5 link history', status: 'in_progress', featureSlug: 'dsh-forge-m4',
      blockers: [], branch: null, worktree: false, source: null, updatedAt: '2026-09-28T08:00:00.000Z',
    },
    descriptionMarkdown: '', depChain: [], records: [], links: [LINKS[0] as SessionLink],
  }

  it('右缘 min(440px,45vw)/z100/无遮罩/滑入 0.2s — 后代展开在 dock 内呈现,Esc 关闭', async () => {
    const face = { loadDetail: vi.fn(async () => DETAIL_WITH_LINKS) }
    const seat = { snapshot: SNAPSHOT }
    const onClose = vi.fn()
    render(
      <TaskDetailPanel
        t={t.en} taskKey="dsh-forge-m4/2.6" face={face} linkLineage={seat}
        onEnterSession={() => {}} onClose={onClose}
      />,
    )
    await waitFor(() => { expect(q('[data-dsh-forge-detail-link="top-live"]')).not.toBeNull() })
    const dock = q('[data-dsh-forge-task-detail]')
    expect(dock.style.width).toBe('min(440px, 45vw)')
    expect(dock.style.zIndex).toBe('100')
    expect(document.querySelector('[data-dsh-forge-dialog-mask]')).toBeNull()
    expect(dock.style.transition).toContain('transform')
    // The expansion renders INSIDE the dock (no new panel, board interactive).
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    expect(dock.contains(q('[data-dsh-forge-detail-descendant="sub-a"]'))).toBe(true)
    // The four accordion sections all stay (零缩水).
    for (const section of ['description', 'depChain', 'records', 'links']) {
      expect(dock.contains(q(`[data-dsh-forge-detail-section="${section}"]`))).toBe(true)
    }
    // Esc closes through the dock's close seam (the parent clears the selection).
    fireEvent.keyDown(dock, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('pane 宿主(2.1 双宿主):同一增强呈现,宽度收 min(440px,100%)', async () => {
    const face = { loadDetail: vi.fn(async () => DETAIL_WITH_LINKS) }
    render(
      <TaskDetailPanel
        t={t.en} taskKey="dsh-forge-m4/2.6" host="pane" face={face} linkLineage={{ snapshot: SNAPSHOT }}
        onEnterSession={() => {}} onClose={() => {}}
      />,
    )
    await waitFor(() => { expect(q('[data-dsh-forge-detail-link-toggle="top-live"]')).not.toBeNull() })
    expect(q('[data-dsh-forge-task-detail]').style.width).toBe('min(440px, 100%)')
    fireEvent.click(q('[data-dsh-forge-detail-link-toggle="top-live"]'))
    expect(q('[data-dsh-forge-detail-descendant="sub-a"]')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Locale balance — the zh half renders the same C5 surfaces
// ---------------------------------------------------------------------------

describe('zh locale', () => {
  it('增强面走 zh 词表:打开/发起/不可用/打开失败', () => {
    const onEnterSession = vi.fn(() => Promise.reject(new Error('gone')))
    const view = render(
      <LinkHistory t={t.zh} links={LINKS} lineage={{}} onLaunch={() => {}} onEnterSession={onEnterSession} />,
    )
    expect(q('[data-dsh-forge-detail-lineage-off="top-live"]').textContent).toBe('不可用')
    expect(q('[data-dsh-forge-detail-enter="top-live"]').textContent).toBe('打开')
    view.unmount()

    const view2 = render(<LinkHistory t={t.zh} links={[]} onLaunch={() => {}} />)
    expect(q('[data-dsh-forge-detail-links-empty]').textContent).toBe('该任务尚未挂接会话。')
    expect(q('[data-dsh-forge-detail-links-launch]').textContent).toBe('发起')
    view2.unmount()

    const view3 = render(
      <LinkHistory t={t.zh} links={LINKS} lineage={{ snapshot: SNAPSHOT }} onEnterSession={onEnterSession} />,
    )
    fireEvent.click(q('[data-dsh-forge-detail-enter="top-live"]'))
    void waitFor(() => { expect(q('[data-dsh-forge-detail-links-toast]').textContent).toContain('会话不存在或已清理') })
    view3.unmount()
  })
})
