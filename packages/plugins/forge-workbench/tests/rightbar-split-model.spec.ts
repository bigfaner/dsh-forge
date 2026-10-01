// M4 task 4.4 — the C9 multi-pane split MODEL (tabs-model.ts's 4.4 block):
// the clamped ratio band, the keyboard stepping, the drag math, the open
// routing (board via openTab preferNewPane / aside via the 2.7 channel's
// exact openResource call), the pane-set derivation over the open-tab
// inventory, and the plugin-lifetime store — pane 增删流 / 全部 pane 关闭 →
// 回活跃区单视图 / 比例即时存 through the onLayoutChange seam (the 4.5
// collection point; nothing persists here).
import { describe, expect, it, vi } from 'vitest'
import type { LineageSubagentAddress } from '../src/client/lineage/index.ts'
import { SUBAGENT_CHAT_ADDRESS_PREFIX } from '../src/client/session-open.ts'
import {
  clampSplitRatio, createSplitPaneStore, deriveSplitPanes, INITIAL_SPLIT_LAYOUT, isSplitActive,
  openSplitPane, ratioFromDrag, stepSplitRatio, toRightbarTabsFace,
  SPLIT_RATIO_MAX, SPLIT_RATIO_MIN, SPLIT_RATIO_RESET, SPLIT_RATIO_STEP, SPLIT_RATIO_STEP_LARGE,
} from '../src/client/views/rightbar/tabs-model.ts'
import type { OpenTabRow, RightbarSplitFace, SplitLayoutState } from '../src/client/views/rightbar/tabs-model.ts'

/** The address fixture (a lineage hit's triple). */
const ADDRESS: LineageSubagentAddress = {
  parentSessionId: 'parent-1',
  childSessionId: 'child-1',
  mode: 'one-shot',
}

/** The open-ops face fake: records the issued opens. */
function makeFace() {
  const calls = {
    openedTabs: [] as Array<{ kind: string; options?: { preferNewPane?: boolean } }>,
    openedResources: [] as Array<{ address: string; options?: { kind?: string; preferNewPane?: boolean } }>,
    closed: [] as string[],
  }
  const face: RightbarSplitFace = {
    openTab: (kind, options) => { calls.openedTabs.push({ kind, options }) },
    openResource: (address, options) => { calls.openedResources.push({ address, options }) },
  }
  return { face, calls }
}

/** A close face over a mutable inventory (the native store's settle emulation). */
function makeCloseFace(rows: OpenTabRow[]) {
  const calls = { closed: [] as string[] }
  return {
    calls,
    rows,
    face: {
      close: (tabId: string): void => {
        calls.closed.push(tabId)
        const index = rows.findIndex(row => row.tabId === tabId)
        if (index >= 0) rows.splice(index, 1)
      },
      openTabs: { getSnapshot: (): readonly OpenTabRow[] => rows },
    },
  }
}

describe('AC3: the ratio band and the drag math', () => {
  it('clamps into 30%–70% (两侧 pane 最小宽 30%) and resets non-finite input', () => {
    expect(SPLIT_RATIO_MIN).toBe(0.3)
    expect(SPLIT_RATIO_MAX).toBe(0.7)
    expect(clampSplitRatio(0.5)).toBe(0.5)
    expect(clampSplitRatio(0.1)).toBe(0.3)
    expect(clampSplitRatio(0.95)).toBe(0.7)
    expect(clampSplitRatio(Number.NaN)).toBe(SPLIT_RATIO_RESET)
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(SPLIT_RATIO_RESET)
  })

  it('ratioFromDrag maps the pixel delta onto the split container, clamped, and never divides by zero', () => {
    expect(ratioFromDrag(0.5, 100, 1000)).toBe(0.6)
    expect(ratioFromDrag(0.5, -400, 1000)).toBe(0.3)
    expect(ratioFromDrag(0.5, 400, 1000)).toBe(0.7)
    // A zero-measured container (a jsdom mount) degrades to the committed ratio.
    expect(ratioFromDrag(0.6, 250, 0)).toBe(0.6)
  })
})

describe('AC4: the 分隔条 keyboard model', () => {
  it('focused ←/→ steps ±2%, Shift ±10%, clamped like the drag', () => {
    expect(SPLIT_RATIO_STEP).toBe(0.02)
    expect(SPLIT_RATIO_STEP_LARGE).toBe(0.1)
    expect(stepSplitRatio(0.5, 'ArrowRight', false)).toBeCloseTo(0.52)
    expect(stepSplitRatio(0.5, 'ArrowLeft', false)).toBeCloseTo(0.48)
    expect(stepSplitRatio(0.5, 'ArrowRight', true)).toBeCloseTo(0.6)
    expect(stepSplitRatio(0.5, 'ArrowLeft', true)).toBeCloseTo(0.4)
    // 钳制同拖拽: the steps clamp at the band edges, never beyond.
    expect(stepSplitRatio(0.69, 'ArrowRight', true)).toBe(0.7)
    expect(stepSplitRatio(0.31, 'ArrowLeft', true)).toBe(0.3)
  })

  it('Home/End both 复位 50/50; Enter/Space 无激活语义 (unchanged)', () => {
    expect(stepSplitRatio(0.7, 'Home', false)).toBe(0.5)
    expect(stepSplitRatio(0.3, 'End', false)).toBe(0.5)
    expect(stepSplitRatio(0.62, 'Enter', false)).toBe(0.62)
    expect(stepSplitRatio(0.62, ' ', false)).toBe(0.62)
    expect(stepSplitRatio(0.62, 'Enter', true)).toBe(0.62)
  })
})

describe('AC1/AC2: openSplitPane — 添加 pane 并选视图 (Menu: 会话旁置/看板)', () => {
  it('board → openTab("board", { preferNewPane: true }) through the native placement', () => {
    const { face, calls } = makeFace()
    expect(openSplitPane(face, { view: 'board' })).toBe(true)
    expect(calls.openedTabs).toEqual([{ kind: 'board', options: { preferNewPane: true } }])
    expect(calls.openedResources).toEqual([])
  })

  it('aside → openResource(subagentChatAddress, { kind: "subagentchat", preferNewPane: true }) — the 2.7 channel\'s exact call', () => {
    const { face, calls } = makeFace()
    expect(openSplitPane(face, { view: 'session-aside', address: ADDRESS })).toBe(true)
    expect(calls.openedTabs).toEqual([])
    expect(calls.openedResources).toHaveLength(1)
    const open = calls.openedResources[0]
    expect(open.address.startsWith(`${SUBAGENT_CHAT_ADDRESS_PREFIX}child-1?`)).toBe(true)
    expect(open.address).toContain('parent=parent-1')
    expect(open.address).toContain('mode=one-shot')
    expect(open.options).toEqual({ kind: 'subagentchat', preferNewPane: true })
  })

  it('an absent face (service degraded) is a no-op, never a throw', () => {
    expect(openSplitPane(undefined, { view: 'board' })).toBe(false)
    expect(openSplitPane(undefined, { view: 'session-aside', address: ADDRESS })).toBe(false)
  })
})

describe('AC1: the pane-set derivation over the open-tab inventory', () => {
  it('board and subagentchat rows are C9 panes; every other kind is not', () => {
    const rows: readonly OpenTabRow[] = [
      { tabId: 'g1', kind: 'guide' },
      { tabId: 'b1', kind: 'board' },
      { tabId: 'd1', kind: 'doc' },
      { tabId: 's1', kind: 'subagentchat' },
      { tabId: 'o1', kind: 'overview' },
    ]
    expect(deriveSplitPanes(rows)).toEqual([
      { view: 'board', tabId: 'b1' },
      { view: 'session-aside', tabId: 's1' },
    ])
  })

  it('an empty inventory answers the single-view pane set (全部 pane 关闭)', () => {
    expect(deriveSplitPanes([])).toEqual([])
    expect(isSplitActive(INITIAL_SPLIT_LAYOUT)).toBe(false)
    expect(isSplitActive({ panes: [{ view: 'board', tabId: 'b1' }], ratio: 0.5 })).toBe(false)
    expect(isSplitActive({
      panes: [{ view: 'board', tabId: 'b1' }, { view: 'session-aside', tabId: 's1' }],
      ratio: 0.5,
    })).toBe(true)
  })
})

describe('AC1/AC3: the split store — 增删流 / 即时存 / the report seam', () => {
  it('openPane issues the open, tracks the pane, and reports through onLayoutChange', () => {
    const reported: SplitLayoutState[] = []
    const store = createSplitPaneStore({ onLayoutChange: layout => reported.push(layout) })
    const { face, calls } = makeFace()
    expect(store.openPane(face, { view: 'board' })).toBe(true)
    expect(calls.openedTabs).toHaveLength(1)
    expect(store.getSnapshot().panes).toEqual([{ view: 'board' }])
    expect(reported.at(-1)?.panes).toEqual([{ view: 'board' }])
  })

  it('reconcile adopts the opened panes\' tab ids and adopts foreign-opened C9 panes', () => {
    const store = createSplitPaneStore()
    const { face } = makeFace()
    store.openPane(face, { view: 'board' })
    // The inventory publish after the open: the board tab lands, AND a
    // subagentchat aside the C5 [打开] opened directly joins the set.
    store.reconcile([
      { tabId: 'guide-1', kind: 'guide' },
      { tabId: 'board-9', kind: 'board' },
      { tabId: 'aside-2', kind: 'subagentchat' },
    ])
    expect(store.getSnapshot().panes).toEqual([
      { view: 'board', tabId: 'board-9' },
      { view: 'session-aside', tabId: 'aside-2' },
    ])
    expect(isSplitActive(store.getSnapshot())).toBe(true)
  })

  it('closePane closes the pane\'s tab (the LAST of the view) and drops the row', () => {
    const store = createSplitPaneStore()
    store.reconcile([
      { tabId: 'board-1', kind: 'board' },
      { tabId: 'board-2', kind: 'board' },
    ])
    const { face, calls } = makeCloseFace([
      { tabId: 'board-1', kind: 'board' },
      { tabId: 'board-2', kind: 'board' },
    ])
    expect(store.closePane(face, 'board')).toBe(true)
    expect(calls.closed).toEqual(['board-2'])
    expect(store.getSnapshot().panes).toEqual([{ view: 'board', tabId: 'board-1' }])
  })

  it('closePane resolves a not-yet-reconciled pane\'s tab from the live inventory (never a dead click)', () => {
    const store = createSplitPaneStore()
    const { face } = makeFace()
    store.openPane(face, { view: 'board' }) // no reconcile yet — tabId unknown
    const closeFake = makeCloseFace([{ tabId: 'board-x', kind: 'board' }])
    expect(store.closePane(closeFake.face, 'board')).toBe(true)
    expect(closeFake.calls.closed).toEqual(['board-x'])
  })

  it('全部 pane 关闭 → the empty pane set reports (回活跃区单视图, observed through the inventory)', () => {
    const reported: SplitLayoutState[] = []
    const store = createSplitPaneStore({ onLayoutChange: layout => reported.push(layout) })
    store.reconcile([
      { tabId: 'board-1', kind: 'board' },
      { tabId: 'aside-1', kind: 'subagentchat' },
    ])
    expect(isSplitActive(store.getSnapshot())).toBe(true)
    // The native closes land in the inventory (chip × / project switch) — the
    // watcher's next reconcile observes the emptied pane set.
    store.reconcile([{ tabId: 'guide-1', kind: 'guide' }])
    expect(store.getSnapshot().panes).toEqual([])
    expect(isSplitActive(store.getSnapshot())).toBe(false)
    expect(reported.at(-1)).toEqual({ panes: [], ratio: SPLIT_RATIO_RESET })
  })

  it('the empty transition RESETS a moved ratio (换台重置 for the C9 share — P-7: the plugin-lifetime store never carries the previous split\'s share into another project\'s first collect)', () => {
    // The 换台 shape: a moved share, then the switch closes every closable tab
    // → the inventory publish empties the pane set → the share resets.
    const store = createSplitPaneStore()
    store.reconcile([
      { tabId: 'board-1', kind: 'board' },
      { tabId: 'board-2', kind: 'board' },
    ])
    store.setRatio(0.3)
    expect(store.getSnapshot().ratio).toBe(0.3)
    store.reconcile([{ tabId: 'guide-1', kind: 'guide' }])
    expect(store.getSnapshot(), 'reconcile 空集 = 比例复位(比例是活动 split 的属性)')
      .toEqual({ panes: [], ratio: SPLIT_RATIO_RESET })
    // The next project's first pane open carries the RESET share — never the
    // previous project's 30 (the cross-project blob leak this pins).
    const { face } = makeFace()
    store.openPane(face, { view: 'board' })
    expect(store.getSnapshot().ratio).toBe(SPLIT_RATIO_RESET)
    // The pane-头 close leg empties the set the same way (store-side removal):
    // a split re-formed afterwards must also start from the baseline share.
    store.reconcile([{ tabId: 'board-9', kind: 'board' }])
    store.setRatio(0.7)
    const closeFake = makeCloseFace([{ tabId: 'board-9', kind: 'board' }])
    store.closePane(closeFake.face, 'board')
    expect(store.getSnapshot(), 'closePane 清空 = 同款比例复位')
      .toEqual({ panes: [], ratio: SPLIT_RATIO_RESET })
  })

  it('setRatio clamps and reports EVERY commit (即时存 — no preview-then-settle)', () => {
    const reported: SplitLayoutState[] = []
    const store = createSplitPaneStore({ onLayoutChange: layout => reported.push(layout) })
    expect(store.setRatio(0.42)).toBe(true)
    expect(store.setRatio(0.05)).toBe(true) // clamped, still a commit
    expect(store.getSnapshot().ratio).toBe(0.3)
    expect(store.setRatio(0.3)).toBe(false) // a no-move clamp is no commit
    // A drag's every move lands here one commit at a time.
    const moves = [0.31, 0.33, 0.9]
    for (const ratio of moves) store.setRatio(ratio)
    expect(reported.map(layout => layout.ratio)).toEqual([0.42, 0.3, 0.31, 0.33, 0.7])
  })

  it('an idle reconcile of an unchanged inventory reports nothing', () => {
    const onLayoutChange = vi.fn()
    const store = createSplitPaneStore({ onLayoutChange })
    store.reconcile([{ tabId: 'b1', kind: 'board' }])
    const callsAfterFirst = onLayoutChange.mock.calls.length
    store.reconcile([{ tabId: 'b1', kind: 'board' }])
    expect(onLayoutChange.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('the guarded controller face (the extended 2.2 subset)', () => {
  it('toRightbarTabsFace now REQUIRES openResource and accepts the optional inventory subscribe', () => {
    const base = {
      openTab: (): void => {},
      openResource: (): void => {},
      close: (): void => {},
      focus: (): void => {},
      isExpanded: (): boolean => true,
      toggleExpanded: (): void => {},
      openTabs: { getSnapshot: (): readonly OpenTabRow[] => [] },
    }
    expect(toRightbarTabsFace(base)).toBe(base)
    // A subscribable inventory passes; a non-function subscribe is a drift.
    const subscribable = { ...base, openTabs: { ...base.openTabs, subscribe: (): (() => void) => () => {} } }
    expect(toRightbarTabsFace(subscribable)).toBe(subscribable)
    expect(toRightbarTabsFace({ ...base, openTabs: { ...base.openTabs, subscribe: 'nope' } })).toBeUndefined()
    // openResource is now part of the required surface (the 旁置 verb).
    expect(toRightbarTabsFace({ ...base, openResource: undefined })).toBeUndefined()
  })
})
