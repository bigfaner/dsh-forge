// @vitest-environment jsdom
// Task 3.6 — the UF1 dispatch-selection component family BUILD units (mock
// verbs; 3.9 wires the TaskBoardPage integration). AC map:
//   AC1 选择模式:进入后 checkbox 显现;整面点击 = 切换勾选;依赖冲突/终态
//      disabled + tooltip;已选计数实时更新;工具栏入口 disabled + tooltip
//   AC2 键盘契约:Space = 切换焦点卡片勾选(M2 语义覆写);Enter = 详情;
//      方向键遍历;浮动条 Tab 可达(计数 → 取消 → 派发所选)
//   AC3 Esc 分层:对话框开 → Esc 关对话框、留在选择模式、已勾选保留;
//      无对话框 → Esc 退出并清空
//   AC4 warning 链:缺失清单 mono 逐行;继续派发 = acknowledgeMissing 进
//      confirming;取消回选择模式(已选保留);产物齐全直接进 confirming
//   AC5 dispatching:按钮 spinner;超时 → error 对话框 + 重试;verb 拒绝 →
//      error 对话框 + 关闭回选择模式;全程不打断看板其余交互
//   AC6 = 本件本身(vitest + jsdom,mock 动词)
// Plus the pure-machine units (selection-mode.ts): dispatchability matrix
// (kernel semantics: pending+blocked 可派发 / completed+skipped 满足依赖 /
// 悬空 vacuously satisfied), Esc layering table, reducer phase guards.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  dispatchSelectionReducer, escActionForPhase, hasDispatchableEntry, INITIAL_DISPATCH_SELECTION,
  selectionDisabledReason,
  type DispatchRow, type DispatchTasksInput, type DispatchTasksResult, type DispatchVerbs,
  type MissingItem, type SelectionTaskEntry,
} from '../src/client/views/tasks/dispatch/selection-mode.ts'
import {
  DetailJumpButton, SelectionCheckbox, SelectionLayer, useDispatchSelection,
} from '../src/client/views/tasks/dispatch/SelectionLayer.tsx'
import { DispatchToolbarButton } from '../src/client/views/tasks/dispatch/DispatchToolbarButton.tsx'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'proj-dispatch-1'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 7-态 + 依赖 + 双 feature 覆盖:dispatchable = 1.2 / 1.3 / beta/2.1. */
const ENTRIES: readonly SelectionTaskEntry[] = [
  { key: 'alpha/1.1', title: '迁移数据模型与 SQLite 内核', status: 'completed', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.2', title: '备份与原子回滚', status: 'pending', featureSlug: 'alpha', blockers: ['1.1'] },
  { key: 'alpha/1.3', title: '对拍器与差异报告', status: 'blocked', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.4', title: '偏好三级 API', status: 'pending', featureSlug: 'alpha', blockers: ['1.2'] },
  { key: 'alpha/1.5', title: 'dsh tool 写通道', status: 'in_progress', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.6', title: 'systemPrompt 预合成', status: 'suspended', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.7', title: '提案看板数据链', status: 'rejected', featureSlug: 'alpha', blockers: [] },
  { key: 'beta/2.1', title: '审批面板组件', status: 'pending', featureSlug: 'beta', blockers: [] },
]

const MISSING: readonly MissingItem[] = [
  { stage: 'design', rule: 'file-missing', artifact: 'docs/features/x/design/tech-design.md', detail: 'design/tech-design.md 不存在' },
  { stage: 'tasks', rule: 'task-md-empty', artifact: 'alpha/1.2', detail: '任务 md 描述为空' },
]

const dispatchRow = (taskKey: string): DispatchRow => ({
  id: `d-${taskKey}`,
  batchId: 'b-1',
  projectId: PROJECT_ID,
  featureSlug: taskKey.slice(0, taskKey.indexOf('/')),
  taskKey,
  state: 'starting',
  sessionId: null,
  promptHash: 'hash',
  actor: 'workbench',
  dispatchedAt: '2026-09-24T08:00:00.000Z',
  endedAt: null,
  error: null,
})

/** Deferred promise helper (the manual verbs' parkable legs). */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** The programmable dispatch-leg seat: tests park/swap the promise per leg. */
interface DispatchSeat {
  promise: Promise<DispatchTasksResult>
  resolve: (value: DispatchTasksResult) => void
  reject: (error: unknown) => void
}

/**
 * The MANUAL mock verbs: check answers programmed per test, the dispatch
 * leg parked on a swappable deferred seat, every call recorded.
 */
function makeVerbs() {
  const calls = {
    check: [] as Array<{ projectId: string; featureSlug: string }>,
    dispatch: [] as Array<{ input: DispatchTasksInput; actor: string }>,
  }
  let checkMissing: readonly MissingItem[] = []
  const seat: DispatchSeat = deferred<DispatchTasksResult>()
  seat.resolve({ dispatched: [dispatchRow('alpha/1.2')] })
  return {
    calls,
    seat,
    setCheckMissing: (missing: readonly MissingItem[]): void => { checkMissing = missing },
    verbs: {
      checkStageArtifacts: async (input: { projectId: string; featureSlug: string }) => {
        calls.check.push(input)
        return { stage: 'tasks' as const, satisfied: checkMissing.length === 0, missing: checkMissing }
      },
      dispatchTasks: async (input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult> => {
        calls.dispatch.push({ input, actor })
        return seat.promise
      },
    } satisfies DispatchVerbs,
  }
}

/** Swap the seat's promise to a fresh deferred (park / program the next leg). */
function parkSeat(seat: DispatchSeat): DispatchSeat {
  const next = deferred<DispatchTasksResult>()
  Object.assign(seat, { promise: next.promise, resolve: next.resolve, reject: next.reject })
  return seat as DispatchSeat
}

/** The standalone harness: toolbar entry + layer + one card per entry. */
function Harness(props: {
  entries?: readonly SelectionTaskEntry[]
  verbs: DispatchVerbs
  budgetMs?: number
  onDispatched?: (rows: readonly DispatchRow[]) => void
  onOpenDetail?: (taskKey: string) => void
}) {
  const entries = props.entries ?? ENTRIES
  const openDetail = props.onOpenDetail ?? ((): void => {})
  const controller = useDispatchSelection({
    entries,
    projectId: PROJECT_ID,
    verbs: props.verbs,
    budgetMs: props.budgetMs,
    onDispatched: props.onDispatched,
  })
  return (
    <div>
      <DispatchToolbarButton
        t={t.zh}
        disabled={!hasDispatchableEntry(entries)}
        tooltip={t.zh('tasks.dispatch.entry.disabledTooltip')}
        active={controller.snapshot.phase !== 'idle'}
        onEnter={controller.enter}
      />
      <SelectionLayer controller={controller} t={t.zh} onOpenDetail={openDetail}>
        {entries.map(entry => (
          <div key={entry.key} data-dsh-forge-select-card={entry.key} tabIndex={0} role="button">
            <SelectionCheckbox taskKey={entry.key} title={entry.title} />
            <DetailJumpButton taskKey={entry.key} />
            <span data-harness-title="">{entry.title}</span>
          </div>
        ))}
      </SelectionLayer>
    </div>
  )
}

const byHook = (selector: string): Element | null => document.querySelector(selector)
const hook = (selector: string): Element => {
  const found = byHook(selector)
  if (found === null) throw new Error(`missing ${selector}`)
  return found
}
const cardOf = (taskKey: string): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-dsh-forge-select-card="${taskKey}"]`) as HTMLElement
const titleOf = (taskKey: string): HTMLElement =>
  cardOf(taskKey).querySelector<HTMLElement>('[data-harness-title]') as HTMLElement
const checkboxOf = (taskKey: string): HTMLInputElement =>
  document.querySelector<HTMLInputElement>(`[data-dsh-forge-select-chk="${taskKey}"] input`) as HTMLInputElement
const countText = (): string => (hook('[data-dsh-forge-dispatch-count]').textContent ?? '')

/** enter → select the dispatchable keys (the common chain prefix, real timers). */
async function enterAndSelect(keys: readonly string[]): Promise<void> {
  fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
  await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })
  for (const key of keys) fireEvent.click(titleOf(key))
  await waitFor(() => { expect(countText()).toContain(String(keys.length)) })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Pure machine units
// ---------------------------------------------------------------------------

describe('selection-mode view-model (kernel-semantics mirror)', () => {
  const entry = (over: Partial<SelectionTaskEntry>): SelectionTaskEntry => ({
    key: 'alpha/1.1', title: 't', status: 'pending', featureSlug: 'alpha', blockers: [], ...over,
  })

  it('marks terminal / in_progress / suspended / deps-unsatisfied disabled (AC1)', () => {
    const entries = [
      entry({ key: 'alpha/a', status: 'pending', blockers: [] }),
      entry({ key: 'alpha/b', status: 'completed' }),
      entry({ key: 'alpha/c', status: 'skipped' }),
      entry({ key: 'alpha/d', status: 'rejected' }),
      entry({ key: 'alpha/e', status: 'in_progress' }),
      entry({ key: 'alpha/f', status: 'suspended' }),
      entry({ key: 'alpha/g', status: 'pending', blockers: ['a'] }),
    ]
    expect(selectionDisabledReason(entries[0]!, entries)).toBeNull()
    expect(selectionDisabledReason(entries[1]!, entries)).toBe('tasks.dispatch.disabled.terminal')
    expect(selectionDisabledReason(entries[2]!, entries)).toBe('tasks.dispatch.disabled.terminal')
    expect(selectionDisabledReason(entries[3]!, entries)).toBe('tasks.dispatch.disabled.terminal')
    expect(selectionDisabledReason(entries[4]!, entries)).toBe('tasks.dispatch.disabled.inProgress')
    expect(selectionDisabledReason(entries[5]!, entries)).toBe('tasks.dispatch.disabled.suspended')
    expect(selectionDisabledReason(entries[6]!, entries)).toBe('tasks.dispatch.disabled.deps')
  })

  it('kernel dispatchability: blocked status dispatchable, deps satisfied by completed OR skipped, dangling vacuous', () => {
    const entries = [
      entry({ key: 'alpha/p', status: 'pending', blockers: [] }),
      entry({ key: 'alpha/q', status: 'blocked', blockers: [] }),
      entry({ key: 'alpha/ok1', status: 'pending', blockers: ['skip-me'] }),
      entry({ key: 'alpha/skipped', status: 'skipped' }),
      entry({ key: 'alpha/ok2', status: 'pending', blockers: ['skipped'] }),
      entry({ key: 'alpha/no', status: 'pending', blockers: ['rejected'] }),
      entry({ key: 'alpha/rejected', status: 'rejected' }),
    ]
    // blocked 状态 = 可派发(kernel DISPATCHABLE_STATUSES;依赖另查)
    expect(selectionDisabledReason(entries[1]!, entries)).toBeNull()
    // 悬空依赖 vacuously satisfied(kernel claim 语境)
    expect(selectionDisabledReason(entries[2]!, entries)).toBeNull()
    // skipped 满足依赖;rejected 不满足(kernel SATISFIED_STATUSES)
    expect(selectionDisabledReason(entries[4]!, entries)).toBeNull()
    expect(selectionDisabledReason(entries[5]!, entries)).toBe('tasks.dispatch.disabled.deps')
    expect(hasDispatchableEntry(entries)).toBe(true)
    expect(hasDispatchableEntry([entries[6]!])).toBe(false)
  })

  it('deps reason subsumes 多选含互相依赖 (batch mate still pending = unmet dep)', () => {
    const entries = [
      entry({ key: 'alpha/first', status: 'pending', blockers: [] }),
      entry({ key: 'alpha/second', status: 'pending', blockers: ['first'] }),
    ]
    expect(selectionDisabledReason(entries[1]!, entries)).toBe('tasks.dispatch.disabled.deps')
  })
})

describe('escActionForPhase (AC3 layering table)', () => {
  it('dialogs consume Esc; selecting exits; idle/busy pass', () => {
    expect(escActionForPhase('warning')).toBe('close-dialog')
    expect(escActionForPhase('confirming')).toBe('close-dialog')
    expect(escActionForPhase('dispatch-error')).toBe('close-dialog')
    expect(escActionForPhase('selecting')).toBe('exit-selection')
    expect(escActionForPhase('idle')).toBe('none')
    expect(escActionForPhase('checking')).toBe('none')
    expect(escActionForPhase('dispatching')).toBe('none')
  })
})

describe('dispatchSelectionReducer phase guards', () => {
  it('enter is idle→selecting only (idempotent); exit clears the selection', () => {
    let state = dispatchSelectionReducer(INITIAL_DISPATCH_SELECTION, { type: 'enter' })
    expect(state.phase).toBe('selecting')
    const again = dispatchSelectionReducer(state, { type: 'enter' })
    expect(again).toBe(state)
    state = dispatchSelectionReducer(state, { type: 'toggle', key: 'alpha/1.2' })
    expect(state.selectedKeys).toEqual(['alpha/1.2'])
    state = dispatchSelectionReducer(state, { type: 'exit' })
    expect(state.phase).toBe('idle')
    expect(state.selectedKeys).toEqual([])
    expect(state.outcome).toEqual({ type: 'exited' })
  })

  it('toggle only in selecting; dispatchResolved resets to idle with the dispatched outcome', () => {
    let state = dispatchSelectionReducer(INITIAL_DISPATCH_SELECTION, { type: 'toggle', key: 'alpha/1.2' })
    expect(state.selectedKeys).toEqual([])
    state = dispatchSelectionReducer(state, { type: 'enter' })
    state = dispatchSelectionReducer(state, { type: 'toggle', key: 'alpha/1.2' })
    state = dispatchSelectionReducer(state, { type: 'requestDispatch' })
    expect(state.phase).toBe('checking')
    expect(state.pendingKeys).toEqual(['alpha/1.2'])
    state = dispatchSelectionReducer(state, { type: 'checkResolved', missing: [] })
    expect(state.phase).toBe('confirming')
    state = dispatchSelectionReducer(state, { type: 'confirmDispatch' })
    state = dispatchSelectionReducer(state, { type: 'dispatchResolved', count: 1 })
    expect(state.phase).toBe('idle')
    expect(state.selectedKeys).toEqual([])
    expect(state.outcome).toEqual({ type: 'dispatched', count: 1 })
  })

  it('dispatchBlocked re-opens the warning door with the race list', () => {
    let state = { ...INITIAL_DISPATCH_SELECTION, phase: 'dispatching' as const, pendingKeys: ['alpha/1.2'] }
    state = dispatchSelectionReducer(state, { type: 'dispatchBlocked', missing: MISSING })
    expect(state.phase).toBe('warning')
    expect(state.missing).toEqual(MISSING)
    expect(state.acknowledgedMissing).toBe(false)
    state = dispatchSelectionReducer(state, { type: 'acknowledgeMissing' })
    expect(state.phase).toBe('confirming')
    expect(state.acknowledgedMissing).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC1 · 选择模式
// ---------------------------------------------------------------------------

describe('selection mode (AC1)', () => {
  it('enters via the toolbar entry: checkboxes appear, whole-surface click toggles, count updates live', async () => {
    const verbs = makeVerbs().verbs
    render(<Harness verbs={verbs} />)
    // idle:checkbox 与浮动条不显现
    expect(byHook('[data-dsh-forge-select-chk]')).toBeNull()
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull()

    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })
    expect(document.querySelectorAll('[data-dsh-forge-select-chk]').length).toBe(ENTRIES.length)
    expect(countText()).toContain('0')

    // 整面点击(卡片标题区,非 checkbox)= 切换勾选
    fireEvent.click(titleOf('alpha/1.2'))
    await waitFor(() => { expect(countText()).toContain('1') })
    expect(checkboxOf('alpha/1.2').checked).toBe(true)
    fireEvent.click(titleOf('alpha/1.2'))
    await waitFor(() => { expect(countText()).toContain('0') })
  })

  it('disabled faces carry the reason tooltip (terminal / in_progress / suspended / deps)', async () => {
    render(<Harness verbs={makeVerbs().verbs} />)
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })

    const cases: Array<[string, WorkbenchKey]> = [
      ['alpha/1.7', 'tasks.dispatch.disabled.terminal'],
      ['alpha/1.5', 'tasks.dispatch.disabled.inProgress'],
      ['alpha/1.6', 'tasks.dispatch.disabled.suspended'],
      ['alpha/1.4', 'tasks.dispatch.disabled.deps'],
    ]
    for (const [key, reasonKey] of cases) {
      const input = checkboxOf(key)
      expect(input.disabled, key).toBe(true)
      expect(input.title, key).toBe(t.zh(reasonKey))
    }
    // 点击 disabled 卡面 = 无操作(计数不变)
    fireEvent.click(titleOf('alpha/1.4'))
    expect(countText()).toContain('0')
  })

  it('toolbar entry: disabled + tooltip when nothing is dispatchable', () => {
    const allTerminal = ENTRIES.map(entry => ({ ...entry, status: 'completed' as const }))
    render(<Harness verbs={makeVerbs().verbs} entries={allTerminal} />)
    const entryButton = hook('[data-dsh-forge-dispatch-entry]') as HTMLButtonElement
    expect(entryButton.disabled).toBe(true)
    expect(entryButton.title).toBe(t.zh('tasks.dispatch.entry.disabledTooltip'))
  })

  it('checkbox is the 28×28 native primitive with aria-label = 任务标题 (Hard Rule)', async () => {
    render(<Harness verbs={makeVerbs().verbs} />)
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-select-chk]')).not.toBeNull() })
    const input = checkboxOf('alpha/1.2')
    expect(input.type).toBe('checkbox')
    expect(input.getAttribute('aria-label')).toBe('备份与原子回滚')
    expect(input.style.width).toBe('28px')
    expect(input.style.height).toBe('28px')
    expect(input.style.borderRadius).toBe('14px')
  })
})

// ---------------------------------------------------------------------------
// AC2 · 键盘契约
// ---------------------------------------------------------------------------

describe('keyboard contract (AC2)', () => {
  async function enterSelection(): Promise<void> {
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })
  }

  it('Space toggles the focused card (M2 Enter/Space override, selection mode only); Enter opens the detail without exiting', async () => {
    const openDetail = vi.fn()
    render(<Harness verbs={makeVerbs().verbs} onOpenDetail={openDetail} />)
    await enterSelection()

    const card = cardOf('alpha/1.2')
    card.focus()
    fireEvent.keyDown(card, { key: ' ' })
    await waitFor(() => { expect(checkboxOf('alpha/1.2').checked).toBe(true) })
    expect(countText()).toContain('1')
    fireEvent.keyDown(card, { key: ' ' })
    await waitFor(() => { expect(checkboxOf('alpha/1.2').checked).toBe(false) })

    fireEvent.keyDown(card, { key: 'Enter' })
    expect(openDetail).toHaveBeenCalledWith('alpha/1.2')
    // 打开详情不退出选择模式
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()

    // Esc 退出后(非选择模式)Enter 不再归本层接管
    fireEvent.keyDown(card, { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
    openDetail.mockClear()
    fireEvent.keyDown(cardOf('alpha/1.2'), { key: 'Enter' })
    expect(openDetail).not.toHaveBeenCalled()
  })

  it('arrow keys traverse the cards in DOM order', async () => {
    render(<Harness verbs={makeVerbs().verbs} />)
    await enterSelection()
    const first = cardOf(ENTRIES[0]!.key)
    const second = cardOf(ENTRIES[1]!.key)
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(first)
  })

  it('the float bar joins the tab order: 计数 → 取消 → 派发所选', async () => {
    render(<Harness verbs={makeVerbs().verbs} />)
    await enterSelection()
    const count = hook('[data-dsh-forge-dispatch-count]') as HTMLElement
    const cancel = hook('[data-dsh-forge-dispatch-cancel]') as HTMLElement
    const go = hook('[data-dsh-forge-dispatch-go]') as HTMLElement
    expect(count.tabIndex).toBe(0)
    // DOM 顺序 = Tab 顺序:count precedes cancel precedes go
    expect(count.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(cancel.compareDocumentPosition(go) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// AC3 · Esc 分层
// ---------------------------------------------------------------------------

describe('Esc layering (AC3)', () => {
  it('warning open → Esc closes the dialog, stays in selection mode, selection kept', async () => {
    const mock = makeVerbs()
    mock.setCheckMissing(MISSING)
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })

    // Esc 落在对话框焦点位(取消按钮)上 —— 对话框消费,不透传退出
    fireEvent.keyDown(hook('[data-dsh-forge-dispatch-warning-cancel]'), { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).toBeNull() })
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    expect(countText()).toContain('1')
    expect(checkboxOf('alpha/1.2').checked).toBe(true)
  })

  it('confirming open → Esc closes the dialog, selection kept', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.keyDown(hook('[data-dsh-forge-dispatch-confirm-cancel]'), { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeNull() })
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    expect(countText()).toContain('1')
  })

  it('no dialog → Esc exits selection mode and clears the selection', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2', 'beta/2.1'])
    fireEvent.keyDown(cardOf('alpha/1.2'), { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
    expect(document.querySelectorAll('[data-dsh-forge-select-chk]').length).toBe(0)
    // 再入 = 干净重开
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(countText()).toContain('0') })
  })
})

// ---------------------------------------------------------------------------
// AC4 · warning 对话框链
// ---------------------------------------------------------------------------

describe('warning dialog chain (AC4)', () => {
  it('missing list renders mono line-by-line; 取消 returns to selecting; 继续派发 → confirming → dispatch with acknowledgeMissing', async () => {
    const mock = makeVerbs()
    mock.setCheckMissing(MISSING)
    const onDispatched = vi.fn()
    render(<Harness verbs={mock.verbs} onDispatched={onDispatched} />)
    await enterAndSelect(['alpha/1.2'])

    // —— 派发所选 → checking → warning(缺失清单)——
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })
    const items = document.querySelectorAll('[data-dsh-forge-dispatch-missing-item]')
    expect(items.length).toBe(MISSING.length)
    const artifact = items[0]!.querySelector('span') as HTMLElement
    expect(artifact.textContent).toBe(MISSING[0]!.artifact)
    expect(artifact.style.fontFamily).toContain('monospace')
    expect(mock.calls.check).toEqual([{ projectId: PROJECT_ID, featureSlug: 'alpha' }])

    // —— 取消 → 回选择模式,已勾选保留 ——
    fireEvent.click(hook('[data-dsh-forge-dispatch-warning-cancel]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })
    expect(countText()).toContain('1')

    // —— 重走:warning → 继续派发(acknowledgeMissing)→ confirming → 派发 ——
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-warning-continue]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })

    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
    expect(mock.calls.dispatch.length).toBe(1)
    expect(mock.calls.dispatch[0]!.input).toEqual({
      projectId: PROJECT_ID,
      taskKeys: ['alpha/1.2'],
      acknowledgeMissing: true,
    })
    expect(mock.calls.dispatch[0]!.actor).toBe('workbench')
    expect(onDispatched).toHaveBeenCalledTimes(1)
    expect(onDispatched.mock.calls[0]![0].map(row => row.taskKey)).toEqual(['alpha/1.2'])
    expect(hook('[data-dsh-forge-dispatch-announce]').textContent)
      .toBe(t.zh('tasks.dispatch.announce.dispatched').replace('{count}', '1'))
  })

  it('satisfied artifacts go straight to confirming (acknowledgeMissing absent)', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).toBeNull()
    // 所选列表呈现 key + 标题
    expect(hook('[data-dsh-forge-dispatch-confirm-list]').textContent).toContain('alpha/1.2')
    expect(hook('[data-dsh-forge-dispatch-confirm-list]').textContent).toContain('备份与原子回滚')

    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
    expect(mock.calls.dispatch[0]!.input.acknowledgeMissing).toBeUndefined()
  })

  it('multi-feature batch checks once per distinct feature (kernel parity)', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2', 'beta/2.1'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    expect(mock.calls.check.map(call => call.featureSlug).sort()).toEqual(['alpha', 'beta'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(mock.calls.dispatch[0]!.input.taskKeys).toEqual(['alpha/1.2', 'beta/2.1']) })
  })
})

// ---------------------------------------------------------------------------
// AC5 · dispatching 态
// ---------------------------------------------------------------------------

describe('dispatching state (AC5)', () => {
  it('spinner busy face while the verb is in flight; board interactions unaffected; success exits', async () => {
    const mock = makeVerbs()
    parkSeat(mock.seat) // park the dispatch leg
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))

    const go = hook('[data-dsh-forge-dispatch-go]') as HTMLButtonElement
    await waitFor(() => { expect(go.disabled).toBe(true) })
    expect(go.textContent).toContain(t.zh('tasks.dispatch.float.busy'))
    expect(go.getAttribute('data-dsh-forge-dispatch-go-busy')).toBe('true')
    expect(document.querySelector('[data-dsh-forge-launch-spinner]')).not.toBeNull()

    // 全程不打断看板:卡片点击无操作但不崩;详情入口仍可用(计数不受扰)
    expect(() => { fireEvent.click(titleOf('alpha/1.3')) }).not.toThrow()
    fireEvent.click(cardOf('alpha/1.1').querySelector('[data-dsh-forge-select-detail]') as HTMLElement)
    expect(countText()).toContain('1')

    // 完成 → 退出选择模式
    await act(async () => { mock.seat.resolve({ dispatched: [dispatchRow('alpha/1.2')] }) })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
  })

  it('timeout → error dialog + 重试 re-runs the dispatch leg', async () => {
    vi.useFakeTimers()
    const mock = makeVerbs()
    parkSeat(mock.seat) // never settles within this leg
    render(<Harness verbs={mock.verbs} />)
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await act(async () => {})
    fireEvent.click(titleOf('alpha/1.2'))
    await act(async () => {})
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await act(async () => {})
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await act(async () => { vi.advanceTimersByTime(3100) })

    expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).not.toBeNull()
    expect(hook('[data-dsh-forge-dispatch-error-body]').textContent)
      .toBe(t.zh('tasks.dispatch.error.timeoutBody'))
    // 重试 = 默认焦点
    expect(document.activeElement).toBe(hook('[data-dsh-forge-dispatch-error-retry]'))

    // 重试:第二腿立即成功 → 退出
    const second = parkSeat(mock.seat)
    second.resolve({ dispatched: [dispatchRow('alpha/1.2')] })
    fireEvent.click(hook('[data-dsh-forge-dispatch-error-retry]'))
    await act(async () => { await Promise.resolve() })
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull()
    expect(mock.calls.dispatch.length).toBe(2)
    expect(mock.calls.dispatch[1]!.input.taskKeys).toEqual(['alpha/1.2'])
  })

  it('verb rejection → error dialog with the message; 关闭 returns to selecting with selection kept', async () => {
    const mock = makeVerbs()
    const parked = parkSeat(mock.seat)
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    // 派发中(spinner)→ 拒绝到达 → error 对话框
    await waitFor(() => {
      expect((hook('[data-dsh-forge-dispatch-go]') as HTMLButtonElement).disabled).toBe(true)
    })
    await act(async () => {
      parked.reject({ code: 'ERR_TASK_DEPS_UNSATISFIED', message: 'task alpha/1.4 has unmet dependencies' })
    })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).not.toBeNull() })
    expect(hook('[data-dsh-forge-dispatch-error-body]').textContent)
      .toContain('task alpha/1.4 has unmet dependencies')

    fireEvent.click(hook('[data-dsh-forge-dispatch-error-close]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull() })
    expect(countText()).toContain('1')
  })

  it('dispatchTasks blocked (race) re-opens the warning with the new list; acknowledge continues', async () => {
    const mock = makeVerbs()
    const raceList: readonly MissingItem[] = [
      { stage: 'tasks', rule: 'stage-asset-missing', artifact: 'alpha/stages/tasks.md', detail: '阶段资产缺失' },
    ]
    parkSeat(mock.seat).resolve({ blocked: 'artifacts-missing', missing: raceList })
    render(<Harness verbs={mock.verbs} />)
    await enterAndSelect(['alpha/1.2'])
    fireEvent.click(hook('[data-dsh-forge-dispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })
    expect(document.querySelectorAll('[data-dsh-forge-dispatch-missing-item]').length).toBe(raceList.length)
    expect(hook('[data-dsh-forge-dispatch-missing-list]').textContent).toContain('alpha/stages/tasks.md')

    fireEvent.click(hook('[data-dsh-forge-dispatch-warning-continue]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    parkSeat(mock.seat).resolve({ dispatched: [dispatchRow('alpha/1.2')] })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dispatch-float-bar]')).toBeNull() })
    expect(mock.calls.dispatch[1]!.input.acknowledgeMissing).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

describe('card primitives', () => {
  it('DetailJumpButton: ⤢ opens the detail without leaving selection mode; its click does not toggle', async () => {
    const openDetail = vi.fn()
    render(<Harness verbs={makeVerbs().verbs} onOpenDetail={openDetail} />)
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-select-detail]')).not.toBeNull() })
    const jump = cardOf('alpha/1.2').querySelector('[data-dsh-forge-select-detail]') as HTMLElement
    expect(jump.getAttribute('aria-label')).toBe(t.zh('tasks.dispatch.detail'))
    fireEvent.click(jump)
    expect(openDetail).toHaveBeenCalledWith('alpha/1.2')
    expect(byHook('[data-dsh-forge-dispatch-float-bar]')).not.toBeNull()
    expect(countText()).toContain('0')
  })

  it('checkbox toggling rides the machine (input click path)', async () => {
    render(<Harness verbs={makeVerbs().verbs} />)
    fireEvent.click(hook('[data-dsh-forge-dispatch-entry]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-select-chk]')).not.toBeNull() })
    fireEvent.click(checkboxOf('alpha/1.3'))
    await waitFor(() => { expect(checkboxOf('alpha/1.3').checked).toBe(true) })
    expect(countText()).toContain('1')
  })

  it('locale halves stay populated for the dispatch keys (en fallback parity)', () => {
    const keys: WorkbenchKey[] = [
      'tasks.dispatch.entry', 'tasks.dispatch.entry.disabledTooltip', 'tasks.dispatch.detail',
      'tasks.dispatch.disabled.terminal', 'tasks.dispatch.disabled.inProgress',
      'tasks.dispatch.disabled.suspended', 'tasks.dispatch.disabled.deps',
      'tasks.dispatch.float.label', 'tasks.dispatch.float.count', 'tasks.dispatch.float.cancel',
      'tasks.dispatch.float.go', 'tasks.dispatch.float.busy',
      'tasks.dispatch.warning.title', 'tasks.dispatch.warning.listLabel', 'tasks.dispatch.warning.intro',
      'tasks.dispatch.warning.note', 'tasks.dispatch.warning.continue', 'tasks.dispatch.warning.cancel',
      'tasks.dispatch.confirm.title', 'tasks.dispatch.confirm.intro', 'tasks.dispatch.confirm.presynth',
      'tasks.dispatch.confirm.go', 'tasks.dispatch.confirm.cancel',
      'tasks.dispatch.error.timeoutTitle', 'tasks.dispatch.error.failedTitle', 'tasks.dispatch.error.timeoutBody',
      'tasks.dispatch.error.retry', 'tasks.dispatch.error.close',
      'tasks.dispatch.announce.entered', 'tasks.dispatch.announce.exited', 'tasks.dispatch.announce.dispatched',
    ]
    for (const key of keys) {
      expect(t.en(key) !== '', key).toBe(true)
      expect(t.zh(key) !== '', key).toBe(true)
    }
  })
})
