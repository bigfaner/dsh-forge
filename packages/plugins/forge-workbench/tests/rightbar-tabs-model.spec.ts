import { describe, expect, it, vi } from 'vitest'
import {
  ensureBoardActive, ensureOverviewActive, followProjectSwitch, resetRightbarToDefault, toRightbarTabsFace,
  type OpenTabRow, type RightbarTabsFace,
} from '../src/client/views/rightbar/tabs-model.ts'

// M4 task 2.2 — AC4/AC6: the tab lifecycle + linkage model (§4.7/§4.8 +
// 裁决 #28-④) over a fake controller — the same face the real
// `ctx.sidebarRight` satisfies structurally.

interface FaceLog {
  closed: string[]
  opened: Array<[string, Record<string, unknown> | undefined]>
  focused: string[]
  toggles: number
}

function makeFace(rows: readonly OpenTabRow[], expanded = false): { face: RightbarTabsFace; log: FaceLog } {
  const log: FaceLog = { closed: [], opened: [], focused: [], toggles: 0 }
  const face: RightbarTabsFace = {
    openTab: vi.fn((kind: string, options?: Record<string, unknown>) => { log.opened.push([kind, options]) }) as never,
    close: vi.fn((tabId: string) => { log.closed.push(tabId) }),
    focus: vi.fn((tabId: string) => { log.focused.push(tabId) }),
    isExpanded: vi.fn(() => expanded),
    toggleExpanded: vi.fn(() => { log.toggles += 1 }),
    openTabs: { getSnapshot: () => rows },
  } as unknown as RightbarTabsFace
  return { face, log }
}

const FULL_ROWS: readonly OpenTabRow[] = [
  { tabId: 'guide-1', kind: 'guide' },
  { tabId: 'overview-1', kind: 'overview' },
  { tabId: 'board-1', kind: 'board' },
  { tabId: 'doc-1', kind: 'doc' },
  { tabId: 'doc-2', kind: 'doc' },
  { tabId: 'depgraph-1', kind: 'depgraph' },
  { tabId: 'terminal-1', kind: 'terminal' },
  { tabId: 'browser-1', kind: 'browser' },
]

describe('AC4 联动: followProjectSwitch (§4.7 整栏跟随当前项目)', () => {
  it('same project = zero action (同项目切会话右栏不动)', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    const outcome = followProjectSwitch(face, 'p1', 'p1')
    expect(outcome).toEqual({ projectChanged: false, closedTabIds: [], overviewActivated: false })
    expect(log.closed).toEqual([])
    expect(log.opened).toEqual([])
    expect(log.focused).toEqual([])
  })

  it('first observation (previous undefined) = record only, never a boot pass', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    const outcome = followProjectSwitch(face, undefined, 'p1')
    expect(outcome.projectChanged).toBe(false)
    expect(log.closed).toEqual([])
    expect(log.opened).toEqual([])
  })

  it('project switch closes EXACTLY the project-scoped tabs (doc/depgraph)', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    const outcome = followProjectSwitch(face, 'p1', 'p2')
    expect(outcome.projectChanged).toBe(true)
    expect(outcome.closedTabIds).toEqual(['doc-1', 'doc-2', 'depgraph-1'])
    // guide/overview/board and the upstream terminal/browser stay untouched.
    expect(log.closed).toEqual(['doc-1', 'doc-2', 'depgraph-1'])
  })

  it('expanded + overview open = FOCUS the existing overview (回概览激活态, no second open)', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    const outcome = followProjectSwitch(face, 'p1', 'p2')
    expect(outcome.overviewActivated).toBe(true)
    expect(log.focused).toEqual(['overview-1'])
    expect(log.opened).toEqual([])
  })

  it('expanded + no overview = OPEN one (重复打开激活 the native per-pane page dedupe complements)', () => {
    const rows = FULL_ROWS.filter(row => row.kind !== 'overview')
    const { face, log } = makeFace(rows, true)
    const outcome = followProjectSwitch(face, 'p1', 'p2')
    expect(outcome.overviewActivated).toBe(true)
    expect(log.opened).toEqual([['overview', undefined]])
    expect(log.focused).toEqual([])
  })

  it('collapsed column = scoped closes only, never a forced expansion', () => {
    const { face, log } = makeFace(FULL_ROWS, false)
    const outcome = followProjectSwitch(face, 'p1', 'p2')
    expect(outcome.overviewActivated).toBe(false)
    expect(log.opened).toEqual([])
    expect(log.focused).toEqual([])
    expect(log.toggles).toBe(0)
    expect(log.closed).toEqual(['doc-1', 'doc-2', 'depgraph-1'])
  })

  it('pointer to null (未激活) still closes the scoped tabs but activates nothing', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    const outcome = followProjectSwitch(face, 'p1', null)
    expect(outcome.projectChanged).toBe(true)
    expect(outcome.overviewActivated).toBe(false)
    expect(log.closed).toEqual(['doc-1', 'doc-2', 'depgraph-1'])
    expect(log.opened).toEqual([])
  })
})

describe('AC4 换台重置: resetRightbarToDefault (裁决 #28-④ 收起 + 开始页)', () => {
  it('closes EVERY open tab, then collapses once while expanded', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    resetRightbarToDefault(face)
    expect(log.closed).toEqual(FULL_ROWS.map(row => row.tabId))
    expect(log.toggles).toBe(1)
  })

  it('never toggles an already-collapsed column', () => {
    const { face, log } = makeFace(FULL_ROWS, false)
    resetRightbarToDefault(face)
    expect(log.closed).toEqual(FULL_ROWS.map(row => row.tabId))
    expect(log.toggles).toBe(0)
  })

  it('empty expanded column collapses alone (the native empty seed owns the next expansion)', () => {
    const { face, log } = makeFace([], true)
    resetRightbarToDefault(face)
    expect(log.closed).toEqual([])
    expect(log.toggles).toBe(1)
  })

  it('undefined face (service absent) is a no-op, never a throw', () => {
    expect(() => resetRightbarToDefault(undefined)).not.toThrow()
  })
})

describe('AC1 guard: toRightbarTabsFace (the project-seat adapter discipline)', () => {
  const full = {
    openTab: () => {}, close: () => {}, focus: () => {},
    isExpanded: () => false, toggleExpanded: () => {},
    openTabs: { getSnapshot: () => [] as readonly OpenTabRow[] },
  }

  it('narrows the complete service candidate onto itself', () => {
    expect(toRightbarTabsFace(full)).toBe(full)
  })

  it('rejects drifted candidates (missing command or inventory)', () => {
    expect(toRightbarTabsFace(undefined)).toBeUndefined()
    expect(toRightbarTabsFace({})).toBeUndefined()
    expect(toRightbarTabsFace({ ...full, openTabs: {} })).toBeUndefined()
    expect(toRightbarTabsFace({ ...full, close: undefined })).toBeUndefined()
  })
})

describe('ensureOverviewActive (the §4.7 回概览 primitive)', () => {
  it('focuses the existing overview and opens one when absent', () => {
    const withOverview = makeFace(FULL_ROWS, true)
    expect(ensureOverviewActive(withOverview.face)).toBe(true)
    expect(withOverview.log.focused).toEqual(['overview-1'])

    const without = makeFace(FULL_ROWS.filter(row => row.kind !== 'overview'), true)
    expect(ensureOverviewActive(without.face)).toBe(true)
    expect(without.log.opened).toEqual([['overview', undefined]])
  })
})

describe('ensureBoardActive (M4 2.7 — the C6 「查看任务」 jump pane leg)', () => {
  it('focuses the existing board tab', () => {
    const { face, log } = makeFace(FULL_ROWS, true)
    expect(ensureBoardActive(face)).toBe(true)
    expect(log.focused).toEqual(['board-1'])
    expect(log.opened).toEqual([])
  })

  it('opens one when no board tab lives', () => {
    const without = makeFace(FULL_ROWS.filter(row => row.kind !== 'board'), true)
    expect(ensureBoardActive(without.face)).toBe(true)
    expect(without.log.opened).toEqual([['board', undefined]])
  })

  it('undefined face (service absent) is a no-op — the selection leg still opened the dock', () => {
    expect(ensureBoardActive(undefined)).toBe(false)
  })
})
