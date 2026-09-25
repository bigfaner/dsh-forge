// @vitest-environment jsdom
// Task 3.8 — the UF1 detail-side orchestration BUILD units (mock verbs; 3.9
// wires the TaskDetailPanel/TaskBoardPage integration). AC map:
//   AC1 「派发执行」主按钮:依赖/终态不满足 disabled + tooltip;可执行 → 单任务
//      派发链(检查 → confirming → dispatchTasks,等价选中 1 项);busy 面 =
//      spinner「正在派发…」;超时 → error 对话框 + 重试
//   AC2 编排分区:当前态 + 派发时间 + 会话链接(进入会话)+ 预合成要素行
//      (三要素 ✓ 与 prompt_hash 元数据);失败时原因 + 重派发可用;无编排
//      记录 = 空态
//   AC3 重派发:二次确认对话框(原因回显);确认后重走检查(redispatch →
//      blocked → warning 门 → ack → dispatchTasks);拒绝路径回侧板
//   AC4 待审批:[去审批]/角标切审批面板(onOpenApproval 接线位)
//   AC5 = 本件本身(vitest + jsdom,mock 动词)
// Plus the pure-machine units (detailDispatchReducer phase guards + retry leg
// routing, currentDispatchRow latest-row semantics).
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import {
  DispatchExecuteButton, OrchestrationSection, currentDispatchRow, detailDispatchReducer,
  isDetailDispatchBusy, isDetailDispatchDialogOpen, INITIAL_DETAIL_DISPATCH, useDetailDispatchChain,
  type DetailDispatchVerbs, type RedispatchTarget,
} from '../src/client/views/tasks/dispatch/OrchestrationSection.tsx'
import {
  type DispatchRow, type DispatchTasksInput, type DispatchTasksResult, type MissingItem,
  type SelectionTaskEntry,
} from '../src/client/views/tasks/dispatch/selection-mode.ts'

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

const PROJECT_ID = 'proj-orch-1'
const TASK_KEY = 'alpha/2.2'
const TASK_TITLE = 'systemPrompt 预合成'
const PROMPT_HASH = 'aa11bb22cc33dd44'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** dispatchable = 2.2;deps-unmet = 1.4;in_progress = 1.5;terminal = 1.7. */
const ENTRIES: readonly SelectionTaskEntry[] = [
  { key: 'alpha/1.1', title: '迁移数据模型', status: 'completed', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.2', title: '备份与原子回滚', status: 'pending', featureSlug: 'alpha', blockers: ['1.1'] },
  { key: 'alpha/1.4', title: '偏好三级 API', status: 'pending', featureSlug: 'alpha', blockers: ['1.2'] },
  { key: 'alpha/1.5', title: 'dsh tool 写通道', status: 'in_progress', featureSlug: 'alpha', blockers: [] },
  { key: 'alpha/1.7', title: '提案看板数据链', status: 'rejected', featureSlug: 'alpha', blockers: [] },
  { key: TASK_KEY, title: TASK_TITLE, status: 'pending', featureSlug: 'alpha', blockers: ['1.1'] },
]

const ENTRY: SelectionTaskEntry = ENTRIES[ENTRIES.length - 1] as SelectionTaskEntry

const dispatchRow = (over: Partial<DispatchRow> & { id: string }): DispatchRow => ({
  batchId: 'b-1',
  projectId: PROJECT_ID,
  featureSlug: 'alpha',
  taskKey: TASK_KEY,
  state: 'running',
  sessionId: null,
  promptHash: PROMPT_HASH,
  actor: 'workbench',
  dispatchedAt: '2026-09-24T10:12:00.000Z',
  endedAt: null,
  error: null,
  ...over,
})

const FAILED_ROW = dispatchRow({
  id: 'd-fail',
  state: 'failed',
  dispatchedAt: '2026-09-24T09:40:00.000Z',
  endedAt: '2026-09-24T09:41:00.000Z',
  error: 'subagent 退出码 1:宿主会话通道未就绪',
})

const MISSING: readonly MissingItem[] = [
  { stage: 'design', rule: 'file-missing', artifact: 'docs/features/x/design/tech-design.md', detail: 'design/tech-design.md 不存在' },
]

/** Deferred promise seat (the manual verbs' parkable legs). */
interface Seat<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Seat<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** Swap a seat to a fresh deferred (park / program the NEXT leg); returns it. */
function park<T>(seat: Seat<T>): Seat<T> {
  const next = deferred<T>()
  Object.assign(seat, { promise: next.promise, resolve: next.resolve, reject: next.reject })
  return next
}

/**
 * The MANUAL mock verbs: check answers programmed per test, the dispatch and
 * redispatch legs parked on swappable seats, every call recorded.
 */
function makeVerbs() {
  const calls = {
    check: [] as Array<{ projectId: string; featureSlug: string }>,
    dispatch: [] as Array<{ input: DispatchTasksInput; actor: string }>,
    redispatch: [] as Array<{ dispatchId: string; actor: string }>,
  }
  let checkMissing: readonly MissingItem[] = []
  const dispatchSeat: Seat<DispatchTasksResult> = deferred<DispatchTasksResult>()
  dispatchSeat.resolve({ dispatched: [dispatchRow({ id: 'd-new', state: 'starting' })] })
  const redispatchSeat: Seat<DispatchTasksResult> = deferred<DispatchTasksResult>()
  redispatchSeat.resolve({ dispatched: [dispatchRow({ id: 'd-new', state: 'starting' })] })
  return {
    calls,
    dispatchSeat,
    redispatchSeat,
    setCheckMissing: (missing: readonly MissingItem[]): void => { checkMissing = missing },
    verbs: {
      checkStageArtifacts: async (input: { projectId: string; featureSlug: string }) => {
        calls.check.push(input)
        return { stage: 'tasks' as const, satisfied: checkMissing.length === 0, missing: checkMissing }
      },
      dispatchTasks: async (input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult> => {
        calls.dispatch.push({ input, actor })
        return dispatchSeat.promise
      },
      redispatch: async (dispatchId: string, actor: string): Promise<DispatchTasksResult> => {
        calls.redispatch.push({ dispatchId, actor })
        return redispatchSeat.promise
      },
    } satisfies DetailDispatchVerbs,
  }
}

/** The dock twin: execute button + orchestration section sharing ONE controller. */
function Harness(props: {
  verbs: DetailDispatchVerbs
  rows?: readonly DispatchRow[]
  entry?: SelectionTaskEntry
  budgetMs?: number
  onDispatched?: (rows: readonly DispatchRow[]) => void
  onEnterSession?: (sessionId: string) => void
  onOpenApproval?: (taskKey: string) => void
  onDockKeyDown?: (event: { key: string }) => void
}) {
  const controller = useDetailDispatchChain({
    projectId: PROJECT_ID,
    taskKey: TASK_KEY,
    title: TASK_TITLE,
    featureSlug: 'alpha',
    verbs: props.verbs,
    budgetMs: props.budgetMs ?? 60_000,
    onDispatched: props.onDispatched,
  })
  const current = currentDispatchRow(props.rows ?? [], TASK_KEY)
  return (
    <div data-dsh-forge-harness-dock="" onKeyDown={props.onDockKeyDown}>
      <DispatchExecuteButton
        t={t.zh}
        controller={controller}
        entry={props.entry ?? ENTRY}
        entries={ENTRIES}
        currentRow={current}
      />
      <OrchestrationSection
        t={t.zh}
        controller={controller}
        taskKey={TASK_KEY}
        taskTitle={TASK_TITLE}
        rows={props.rows ?? []}
        onEnterSession={props.onEnterSession}
        onOpenApproval={props.onOpenApproval}
      />
    </div>
  )
}

const byHook = (selector: string): Element | null => document.querySelector(selector)
const hook = (selector: string): Element => {
  const found = byHook(selector)
  if (found === null) throw new Error(`missing ${selector}`)
  return found
}
const executeButton = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>('[data-dsh-forge-orch-execute]') as HTMLButtonElement

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Pure machine + view-model units
// ---------------------------------------------------------------------------

describe('currentDispatchRow (latest-row semantics)', () => {
  it('picks the LATEST row of the task; other tasks and stale order never win', () => {
    const older = dispatchRow({ id: 'd-1', dispatchedAt: '2026-09-24T08:00:00.000Z' })
    const newer = dispatchRow({ id: 'd-2', dispatchedAt: '2026-09-24T09:00:00.000Z', state: 'failed' })
    const other = dispatchRow({ id: 'd-3', taskKey: 'beta/9.9', dispatchedAt: '2026-09-24T10:00:00.000Z' })
    expect(currentDispatchRow([newer, other, older], TASK_KEY)).toBe(newer)
    expect(currentDispatchRow([], TASK_KEY)).toBeNull()
    expect(currentDispatchRow([other], TASK_KEY)).toBeNull()
  })
})

describe('detailDispatchReducer (phase guards + retry leg routing)', () => {
  it('fresh chain: startDispatch → checking → warning/confirming → dispatching → dispatched', () => {
    let state = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, { type: 'startDispatch' })
    expect(state.phase).toBe('checking')
    state = detailDispatchReducer(state, { type: 'checkResolved', missing: MISSING })
    expect(state.phase).toBe('warning')
    state = detailDispatchReducer(state, { type: 'acknowledgeMissing' })
    expect(state.phase).toBe('confirming')
    expect(state.acknowledgedMissing).toBe(true)
    state = detailDispatchReducer(state, { type: 'confirmDispatch' })
    expect(state.phase).toBe('dispatching')
    state = detailDispatchReducer(state, { type: 'dispatchResolved', count: 1 })
    expect(state.phase).toBe('idle')
    expect(state.dispatchedCount).toBe(1)
  })

  it('redispatch chain: confirm → redispatching; blocked re-opens the warning door (ack reset)', () => {
    const target: RedispatchTarget = { dispatchId: 'd-fail', reason: 'boom' }
    let state = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, {
      type: 'startRedispatch', dispatchId: target.dispatchId, reason: target.reason,
    })
    expect(state.phase).toBe('redispatch-confirm')
    expect(state.redispatch).toEqual(target)
    state = detailDispatchReducer(state, { type: 'redispatchConfirmed' })
    expect(state.phase).toBe('redispatching')
    state = detailDispatchReducer(state, { type: 'redispatchBlocked', missing: MISSING })
    expect(state.phase).toBe('warning')
    expect(state.acknowledgedMissing).toBe(false)
    state = detailDispatchReducer(state, { type: 'acknowledgeMissing' })
    state = detailDispatchReducer(state, { type: 'confirmDispatch' })
    expect(state.phase).toBe('dispatching')
  })

  it('phase guards drop stale settles; cancelDialog is dialog-scoped and returns to pristine idle', () => {
    // A BUSY leg (checking) is not a dialog — cancelDialog cannot touch it
    let busy = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, { type: 'startDispatch' })
    busy = detailDispatchReducer(busy, { type: 'cancelDialog' })
    expect(busy.phase).toBe('checking')
    const warned = detailDispatchReducer(
      detailDispatchReducer(INITIAL_DETAIL_DISPATCH, { type: 'startDispatch' }),
      { type: 'checkResolved', missing: MISSING },
    )
    const cancelled = detailDispatchReducer(warned, { type: 'cancelDialog' })
    expect(cancelled).toEqual(INITIAL_DETAIL_DISPATCH)
    // A stale settle after cancel is a no-op (belt-and-braces under the tokens)
    expect(detailDispatchReducer(cancelled, { type: 'checkResolved', missing: MISSING }).phase).toBe('idle')
  })

  it('flowFailed records the failed leg; retry re-enters that leg with its context KEPT', () => {
    const error = { kind: 'failed' as const, message: 'x' }
    let state = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, { type: 'startDispatch' })
    state = detailDispatchReducer(state, { type: 'flowFailed', error, leg: 'check' })
    expect(state.phase).toBe('error')
    expect(state.failedLeg).toBe('check')
    state = detailDispatchReducer(state, { type: 'retry' })
    expect(state.phase).toBe('checking')
    // The dispatch retry keeps the acknowledged face
    let acked = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, { type: 'startDispatch' })
    acked = detailDispatchReducer(acked, { type: 'checkResolved', missing: MISSING })
    acked = detailDispatchReducer(acked, { type: 'acknowledgeMissing' })
    acked = detailDispatchReducer(acked, { type: 'confirmDispatch' })
    acked = detailDispatchReducer(acked, { type: 'flowFailed', error, leg: 'dispatch' })
    acked = detailDispatchReducer(acked, { type: 'retry' })
    expect(acked.phase).toBe('dispatching')
    expect(acked.acknowledgedMissing).toBe(true)
    // The redispatch retry keeps the target
    let redis = detailDispatchReducer(INITIAL_DETAIL_DISPATCH, {
      type: 'startRedispatch', dispatchId: 'd-fail', reason: null,
    })
    redis = detailDispatchReducer(redis, { type: 'redispatchConfirmed' })
    redis = detailDispatchReducer(redis, { type: 'flowFailed', error, leg: 'redispatch' })
    redis = detailDispatchReducer(redis, { type: 'retry' })
    expect(redis.phase).toBe('redispatching')
    expect(redis.redispatch?.dispatchId).toBe('d-fail')
  })

  it('busy/dialog predicates cover exactly the verb legs and dialog phases', () => {
    for (const phase of ['checking', 'dispatching', 'redispatching'] as const) {
      expect(isDetailDispatchBusy(phase)).toBe(true)
    }
    expect(isDetailDispatchBusy('idle')).toBe(false)
    for (const phase of ['warning', 'confirming', 'redispatch-confirm', 'error'] as const) {
      expect(isDetailDispatchDialogOpen(phase)).toBe(true)
    }
    expect(isDetailDispatchDialogOpen('idle')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC1 · the 「派发执行」 button
// ---------------------------------------------------------------------------

describe('派发执行 button (AC1)', () => {
  it('pre-guard faces: terminal/deps → disabled + tooltip; failed row keeps the door open', () => {
    const { verbs } = makeVerbs()
    // terminal + a FAILED row: terminal wins (reopen first — kernel rejects regardless)
    const { rerender } = render(
      <Harness verbs={verbs} entry={ENTRIES[4] as SelectionTaskEntry} rows={[FAILED_ROW]} />,
    )
    let button = executeButton()
    expect(button.disabled).toBe(true)
    expect(button.title).toBe(t.zh('tasks.dispatch.disabled.terminal'))
    expect(button.getAttribute('data-dsh-forge-orch-execute-face')).toBe('disabled')

    // deps-unmet WITHOUT a failed row → disabled + the deps tooltip
    rerender(<Harness verbs={verbs} entry={ENTRIES[2] as SelectionTaskEntry} rows={[]} />)
    button = executeButton()
    expect(button.disabled).toBe(true)
    expect(button.title).toBe(t.zh('tasks.dispatch.disabled.deps'))

    // in_progress + a FAILED orchestration → the redispatch door stays OPEN
    rerender(<Harness verbs={verbs} entry={ENTRIES[3] as SelectionTaskEntry} rows={[FAILED_ROW]} />)
    button = executeButton()
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('data-dsh-forge-orch-execute-face')).toBe('redispatch')

    // terminal again (via the task itself) to close the loop
    rerender(
      <Harness verbs={verbs} entry={{ ...ENTRY, status: 'rejected' } as SelectionTaskEntry} rows={[FAILED_ROW]} />,
    )
    expect(executeButton().disabled).toBe(true)
  })

  it('dispatchable click → single-task chain: check → confirming(1 task) → dispatchTasks → done', async () => {
    const mock = makeVerbs()
    const onDispatched = vi.fn()
    render(<Harness verbs={mock.verbs} onDispatched={onDispatched} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    expect(mock.calls.check).toEqual([{ projectId: PROJECT_ID, featureSlug: 'alpha' }])
    expect(hook('[data-dsh-forge-dispatch-confirm-item]').textContent).toContain(TASK_KEY)
    expect(hook('[data-dsh-forge-dispatch-confirm-item]').textContent).toContain(TASK_TITLE)

    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeNull() })
    expect(mock.calls.dispatch.length).toBe(1)
    expect(mock.calls.dispatch[0]!.input.taskKeys).toEqual([TASK_KEY])
    expect(mock.calls.dispatch[0]!.input.acknowledgeMissing).toBeUndefined()
    expect(mock.calls.dispatch[0]!.actor).toBe('workbench')
    expect(onDispatched).toHaveBeenCalledTimes(1)
    expect(hook('[data-dsh-forge-orch-announce]').textContent).toContain(TASK_KEY)
  })

  it('missing artifacts → warning door → 继续派发 → dispatchTasks carries acknowledgeMissing', async () => {
    const mock = makeVerbs()
    mock.setCheckMissing(MISSING)
    render(<Harness verbs={mock.verbs} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })
    expect(hook('[data-dsh-forge-dispatch-missing-item]').textContent).toContain(MISSING[0]!.artifact)

    fireEvent.click(hook('[data-dsh-forge-dispatch-warning-continue]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(mock.calls.dispatch.length).toBe(1) })
    expect(mock.calls.dispatch[0]!.input.acknowledgeMissing).toBe(true)
  })

  it('busy face: spinner + 「正在派发…」 while the verb is in flight; settle recovers', async () => {
    const mock = makeVerbs()
    park(mock.dispatchSeat) // park the dispatch leg
    render(<Harness verbs={mock.verbs} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    const button = executeButton()
    await waitFor(() => { expect(button.disabled).toBe(true) })
    expect(button.textContent).toContain(t.zh('tasks.orch.execute.busy'))
    expect(document.querySelector('[data-dsh-forge-launch-spinner]')).not.toBeNull()
    expect(button.getAttribute('data-dsh-forge-orch-execute-busy')).toBe('true')

    await act(async () => { mock.dispatchSeat.resolve({ dispatched: [dispatchRow({ id: 'd-new' })] }) })
    await waitFor(() => { expect(executeButton().disabled).toBe(false) })
    expect(executeButton().textContent).toContain(t.zh('tasks.orch.execute'))
  })

  it('timeout → error dialog + 重试 re-runs the dispatch leg', async () => {
    vi.useFakeTimers()
    const mock = makeVerbs()
    park(mock.dispatchSeat) // never settles within this leg
    render(<Harness verbs={mock.verbs} budgetMs={3000} />)
    fireEvent.click(executeButton())
    await act(async () => {})
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await act(async () => { vi.advanceTimersByTime(3100) })

    expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).not.toBeNull()
    expect(hook('[data-dsh-forge-dispatch-error-body]').textContent)
      .toBe(t.zh('tasks.dispatch.error.timeoutBody'))
    expect(document.activeElement).toBe(hook('[data-dsh-forge-dispatch-error-retry]'))

    const second = park(mock.dispatchSeat)
    second.resolve({ dispatched: [dispatchRow({ id: 'd-new' })] })
    fireEvent.click(hook('[data-dsh-forge-dispatch-error-retry]'))
    await act(async () => { await Promise.resolve() })
    expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).toBeNull()
    expect(mock.calls.dispatch.length).toBe(2)
    expect(mock.calls.dispatch[1]!.input.taskKeys).toEqual([TASK_KEY])
  })

  it('clicking the button with a FAILED row opens the redispatch door (same slot, no parallel entry)', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} rows={[FAILED_ROW]} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).not.toBeNull() })
    expect(mock.calls.check.length).toBe(0) // the redispatch door, not the fresh chain
  })

  it('confirming 取消 → back to the panel without firing dispatchTasks (拒绝路径)', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-cancel]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeNull() })
    expect(mock.calls.dispatch.length).toBe(0)
    expect(byHook('[data-dsh-forge-orchestration-section]')).not.toBeNull() // 侧板内容原样
  })

  it('verb rejection → error dialog with the envelope message; 关闭 returns to the panel', async () => {
    const mock = makeVerbs()
    park(mock.dispatchSeat) // parked only to force the async window
    render(<Harness verbs={mock.verbs} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await act(async () => {
      mock.dispatchSeat.reject({ code: 'ERR_TASK_DEPS_UNSATISFIED', message: 'task alpha/2.2 has unmet dependencies' })
    })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).not.toBeNull() })
    expect(hook('[data-dsh-forge-dispatch-error-body]').textContent).toContain('has unmet dependencies')

    fireEvent.click(hook('[data-dsh-forge-dispatch-error-close]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-error"]')).toBeNull() })
    expect(executeButton().disabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC2 / AC4 · the 编排 partition
// ---------------------------------------------------------------------------

describe('编排 partition content (AC2/AC4)', () => {
  it('no orchestration record → the 尚未派发 empty hint (no state line)', () => {
    const { verbs } = makeVerbs()
    render(<Harness verbs={verbs} rows={[]} />)
    expect(hook('[data-dsh-forge-orch-empty]').textContent).toBe(t.zh('tasks.orch.empty'))
    expect(byHook('[data-dsh-forge-orch-state-line]')).toBeNull()
  })

  it('running row: state badge + dispatched time + session link + presynth row with prompt_hash', async () => {
    const onEnterSession = vi.fn()
    const { verbs } = makeVerbs()
    const row = dispatchRow({ id: 'd-run', state: 'running', sessionId: 'sess-live' })
    render(<Harness verbs={verbs} rows={[row]} onEnterSession={onEnterSession} />)

    expect(hook('[data-dsh-forge-orch-state-line]').querySelector('[data-dsh-forge-orch-badge="running"]'))
      .not.toBeNull()
    // formatTimestamp: ISO → `YYYY-MM-DD HH:mm` (deterministic, title keeps the original)
    expect(hook('[data-dsh-forge-orch-dispatched-at]').textContent).toContain('2026-09-24 10:12')
    expect(hook('[data-dsh-forge-orch-dispatched-at]').getAttribute('title')).toBe(row.dispatchedAt)

    expect(hook('[data-dsh-forge-orch-session-line]').textContent).toContain('sess-live')
    fireEvent.click(hook(`[data-dsh-forge-orch-enter-session="${row.sessionId}"]`))
    expect(onEnterSession).toHaveBeenCalledWith('sess-live')

    const presynth = hook('[data-dsh-forge-orch-presynth-line]') as HTMLElement
    expect(presynth.textContent).toContain('协议 ✓')
    expect(presynth.textContent).toContain('目标摘要 ✓')
    expect(presynth.textContent).toContain('偏好 ✓')
    expect(presynth.title).toBe(t.zh('tasks.orch.presynth.tooltip'))
    const hash = hook('[data-dsh-forge-orch-prompt-hash]') as HTMLElement
    expect(hash.textContent).toContain(PROMPT_HASH.slice(0, 12))
    expect(hash.title).toBe(PROMPT_HASH) // full hash rides as the metadata title
  })

  it('failed row: reason line + [重派发] available', () => {
    const { verbs } = makeVerbs()
    render(<Harness verbs={verbs} rows={[FAILED_ROW]} />)
    expect(hook('[data-dsh-forge-orch-reason]').textContent)
      .toContain('subagent 退出码 1:宿主会话通道未就绪')
    expect(byHook(`[data-dsh-forge-orch-redispatch="${FAILED_ROW.id}"]`)).not.toBeNull()
  })

  it('failed row with null error: the none-recorded fallback copy still shows 重派发', async () => {
    const { verbs } = makeVerbs()
    render(<Harness verbs={verbs} rows={[dispatchRow({ id: 'd-fail2', state: 'failed', error: null })]} />)
    expect(hook('[data-dsh-forge-orch-reason]').textContent).toBe(t.zh('tasks.orch.failedReason.none'))
    expect(byHook('[data-dsh-forge-orch-redispatch="d-fail2"]')).not.toBeNull()

    // The redispatch dialog echoes the SAME none-recorded fallback (reason = null)
    fireEvent.click(hook('[data-dsh-forge-orch-redispatch="d-fail2"]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).not.toBeNull() })
    expect(hook('[data-dsh-forge-redispatch-reason]').textContent).toBe(t.zh('tasks.redispatch.reason.none'))
    expect(hook('[data-dsh-forge-redispatch-reason]').getAttribute('data-dsh-forge-redispatch-reason-recorded'))
      .toBe('false')
  })

  it('awaiting row: [去审批] and the clickable badge both route onOpenApproval (AC4)', () => {
    const onOpenApproval = vi.fn()
    const { verbs } = makeVerbs()
    render(
      <Harness
        verbs={verbs}
        rows={[dispatchRow({ id: 'd-await', state: 'awaiting', sessionId: 'sess-wait' })]}
        onOpenApproval={onOpenApproval}
      />,
    )
    fireEvent.click(hook(`[data-dsh-forge-orch-go-approval="${TASK_KEY}"]`))
    expect(onOpenApproval).toHaveBeenCalledWith(TASK_KEY)
    fireEvent.click(hook(`[data-dsh-forge-orch-jump="${TASK_KEY}"]`))
    expect(onOpenApproval).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// AC3 · the redispatch chain
// ---------------------------------------------------------------------------

describe('redispatch chain (AC3)', () => {
  it('[重派发] → second-confirmation dialog with the reason echo; 取消 returns to the panel, verb untouched', async () => {
    const mock = makeVerbs()
    render(<Harness verbs={mock.verbs} rows={[FAILED_ROW]} />)
    fireEvent.click(hook('[data-dsh-forge-orch-redispatch="d-fail"]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).not.toBeNull() })
    expect(hook('[data-dsh-forge-redispatch-task]').textContent).toContain(TASK_KEY)
    expect(hook('[data-dsh-forge-redispatch-reason]').textContent)
      .toContain('subagent 退出码 1:宿主会话通道未就绪')
    expect(hook('[data-dsh-forge-redispatch-note]').textContent).toBe(t.zh('tasks.redispatch.note'))
    expect(document.activeElement).toBe(hook('[data-dsh-forge-redispatch-go]'))

    fireEvent.click(hook('[data-dsh-forge-redispatch-cancel]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).toBeNull() })
    expect(mock.calls.redispatch.length).toBe(0) // 拒绝路径:零动词调用
    expect(byHook('[data-dsh-forge-orchestration-section]')).not.toBeNull() // 侧板内容原样
  })

  it('确认 → redispatch(dispatchId, actor); dispatched → back to idle + onDispatched', async () => {
    const mock = makeVerbs()
    const onDispatched = vi.fn()
    render(<Harness verbs={mock.verbs} rows={[FAILED_ROW]} onDispatched={onDispatched} />)
    fireEvent.click(hook('[data-dsh-forge-orch-redispatch="d-fail"]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-redispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).toBeNull() })
    expect(mock.calls.redispatch).toEqual([{ dispatchId: 'd-fail', actor: 'workbench' }])
    expect(onDispatched).toHaveBeenCalledTimes(1)
  })

  it('redispatch blocked (re-check found gaps) → warning door → ack continues through dispatchTasks', async () => {
    const mock = makeVerbs()
    park(mock.redispatchSeat).resolve({ blocked: 'artifacts-missing', missing: MISSING })
    render(<Harness verbs={mock.verbs} rows={[FAILED_ROW]} />)
    fireEvent.click(hook('[data-dsh-forge-orch-redispatch="d-fail"]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="redispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-redispatch-go]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })

    fireEvent.click(hook('[data-dsh-forge-dispatch-warning-continue]'))
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-confirm"]')).not.toBeNull() })
    fireEvent.click(hook('[data-dsh-forge-dispatch-confirm-go]'))
    await waitFor(() => { expect(mock.calls.dispatch.length).toBe(1) })
    expect(mock.calls.dispatch[0]!.input.taskKeys).toEqual([TASK_KEY])
    expect(mock.calls.dispatch[0]!.input.acknowledgeMissing).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Esc containment (the dialogs must not ALSO close the dock behind them)
// ---------------------------------------------------------------------------

describe('Esc layering', () => {
  it('Esc with a chain dialog open closes the dialog but never the dock behind it', async () => {
    const mock = makeVerbs()
    mock.setCheckMissing(MISSING)
    const onDockKeyDown = vi.fn()
    render(<Harness verbs={mock.verbs} onDockKeyDown={onDockKeyDown} />)
    fireEvent.click(executeButton())
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).not.toBeNull() })

    fireEvent.keyDown(hook('[data-dsh-forge-dialog="dispatch-warning"]'), { key: 'Escape' })
    await waitFor(() => { expect(byHook('[data-dsh-forge-dialog="dispatch-warning"]')).toBeNull() })
    expect(onDockKeyDown).not.toHaveBeenCalled()

    // No dialog open → Esc passes THROUGH to the dock (the M2 contract)
    fireEvent.keyDown(hook('[data-dsh-forge-harness-dock]'), { key: 'Escape' })
    expect(onDockKeyDown).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Locale parity (the typed registration enforces the bilingual balance)
// ---------------------------------------------------------------------------

describe('locale halves', () => {
  it('stay populated for the 3.8 orchestration/redispatch keys (en + zh)', () => {
    const keys: WorkbenchKey[] = [
      'tasks.orch.section',
      'tasks.orch.execute', 'tasks.orch.execute.busy', 'tasks.orch.execute.note',
      'tasks.orch.empty', 'tasks.orch.currentState', 'tasks.orch.dispatchedAt', 'tasks.orch.session',
      'tasks.orch.failedReason', 'tasks.orch.failedReason.none', 'tasks.orch.redispatch',
      'tasks.orch.presynth', 'tasks.orch.presynth.tooltip', 'tasks.orch.presynth.hash',
      'tasks.orch.goApproval', 'tasks.orch.announce.dispatched',
      'tasks.redispatch.title', 'tasks.redispatch.reason', 'tasks.redispatch.reason.none',
      'tasks.redispatch.note', 'tasks.redispatch.go', 'tasks.redispatch.cancel',
    ]
    for (const key of keys) {
      expect(t.en(key) !== '', key).toBe(true)
      expect(t.zh(key) !== '', key).toBe(true)
    }
  })
})
