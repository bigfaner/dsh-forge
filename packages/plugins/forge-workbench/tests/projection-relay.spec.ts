// Task 3.3 — the client projection relay matrix (tech-design §Testing
// Strategy·Per-Layer「relay:plan 执行序与错误映射;outcome 回填」):
//   ① WorkspaceChannel duck-typed 解析(缺席/部分面/完整面);
//   ② plan 执行序矩阵(mock channel:乱序 ops → ensure→rename→reorder→delete
//      规整;insertBefore 链自尾向头;ensure 的 create-后条件 rename);
//   ③ 错误映射(三上游码原码透传 + not-found 幂等折算 + transport 拒绝);
//   ④ outcome 回填(执行后快照先于 outcome;通道缺席/快照未建立/失败续跑);
//   ⑤ follow 快照上报(启动即报/phase 门/debounce/等值门/拒绝重试/有界轮询);
//   ⑥ relay 不在场重放(degraded·通道缺席行 → retryProjection;其余态不动)。
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyRegistryOrder, applyWorkspaceRow, canonicalOpsOf, createProjectionRelay,
  createSnapshotReporter, dropWorkspaceId, executeProjectionPlan, insertBeforeLinksOf,
  installProjectionRelay, PROJECTION_CHANNEL_UNAVAILABLE, snapshotEntriesOf, workspacesSourceOf,
  WORKSPACES_SERVICE_KEY, workspaceChannelOf, WORKSPACE_REMOTE_KEY,
} from '../src/client/projection'
import type {
  PlanExecutionResult, WorkspaceChannel, WorkspaceOpFailure, WorkspaceRow,
  WorkspaceSnapshotSource,
} from '../src/client/projection'
import type {
  ProjectionOp, ProjectionPlan, ProjectionStatusRow, ReportProjectionOutcomeInput,
  WorkbenchEvent, WorkspaceSnapshotEntry,
} from '../src/client/ipc-types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const row = (workspaceId: string, path: string, title: string): WorkspaceRow => ({ workspaceId, path, title })
const entry = (workspaceId: string, path: string, title: string, orderIdx: number): WorkspaceSnapshotEntry =>
  ({ workspaceId, path, title, orderIdx })

const ensureOp = (canonicalPath: string, title: string): ProjectionOp => ({ kind: 'ensure', canonicalPath, title })
const renameOp = (workspaceId: string, title: string): ProjectionOp => ({ kind: 'rename', workspaceId, title })
const deleteOp = (workspaceId: string): ProjectionOp => ({ kind: 'delete', workspaceId })
const reorderOp = (orderedIds: readonly string[]): ProjectionOp => ({ kind: 'reorder', orderedIds })

const planOf = (projectId: string, ops: readonly ProjectionOp[]): ProjectionPlan => ({ projectId, ops })

type Verb = 'create' | 'rename' | 'delete' | 'insertBefore'

/** A mock channel recording every call; per-test legs override the members. */
function makeChannel() {
  const calls: Array<{ verb: Verb; request: unknown }> = []
  const reject = (verb: Verb) => async (): Promise<never> => { throw new Error(`channel.${verb} not stubbed`) }
  const channel: WorkspaceChannel = {
    create: reject('create'), rename: reject('rename'), delete: reject('delete'), insertBefore: reject('insertBefore'),
  }
  return {
    channel, calls,
    stamp: (verb: Verb) => (request: unknown) => { calls.push({ verb, request }) },
    verbs: (): string[] => calls.map(call => call.verb),
  }
}

const failure = (code: string, message: string): WorkspaceOpFailure => ({ code, message })
const okCreate = (workspace: WorkspaceRow, created = true) => ({ ok: true as const, value: { workspace, created } })
const okRename = (workspace: WorkspaceRow) => ({ ok: true as const, value: { workspace } })
const okDelete = () => ({ ok: true as const, value: { deleted: true as const } })
const okOrder = (workspaceIds: string[]) => ({ ok: true as const, value: { workspaceIds } })

/** One macrotask round — flushes the relay's promise queue fully. */
const flush = async (): Promise<void> => { await new Promise((resolve) => { setTimeout(resolve, 0) }) }

function fakeContext() {
  const serviceTable = new Map<string, unknown>()
  return { context: { get: (key: string) => serviceTable.get(key) }, serviceTable }
}

// ---------------------------------------------------------------------------
// ① WorkspaceChannel duck-typed resolution
// ---------------------------------------------------------------------------

describe('projection relay: workspace channel resolution', () => {
  it('resolves the full four-verb face; partial/absent/non-object values degrade to undefined', () => {
    const { context, serviceTable } = fakeContext()
    expect(workspaceChannelOf(context as never)).toBeUndefined()
    serviceTable.set(WORKSPACE_REMOTE_KEY, null)
    expect(workspaceChannelOf(context as never)).toBeUndefined()
    serviceTable.set(WORKSPACE_REMOTE_KEY, { create: async () => okCreate(row('w', 'p', 't')) })
    expect(workspaceChannelOf(context as never)).toBeUndefined() // partial face ≠ channel
    serviceTable.set(WORKSPACE_REMOTE_KEY, {
      create: async () => okCreate(row('w', 'p', 't')),
      rename: async () => okRename(row('w', 'p', 't')),
      delete: async () => okDelete(),
      insertBefore: async () => okOrder(['w']),
    })
    expect(workspaceChannelOf(context as never)).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// ② Plan execution-order matrix (mock channel)
// ---------------------------------------------------------------------------

describe('projection relay: plan execution order matrix', () => {
  it('scrambled ops are normalized to ensure → rename → reorder → delete', async () => {
    const mock = makeChannel()
    mock.channel.create = async (request) => { mock.stamp('create')(request); return okCreate(row('ws-1', 'Z:/a', 'A')) }
    mock.channel.rename = async (request) => { mock.stamp('rename')(request); return okRename(row('ws-1', 'Z:/a', request.title)) }
    mock.channel.insertBefore = async (request) => { mock.stamp('insertBefore')(request); return okOrder(['ws-1', 'ws-2']) }
    mock.channel.delete = async (request) => { mock.stamp('delete')(request); return okDelete() }
    const result = await executeProjectionPlan(mock.channel, planOf('p1', [
      deleteOp('ws-x'),
      reorderOp(['ws-2', 'ws-1']),
      renameOp('ws-1', 'A1'),
      ensureOp('Z:/a', 'A'),
    ]), [entry('ws-2', 'Z:/b', 'B', 0)])
    expect(mock.verbs()).toEqual(['create', 'rename', 'insertBefore', 'delete'])
    expect(result.ok).toBe(true)
  })

  it('canonicalOpsOf groups by kind preserving arrival order inside each group', () => {
    const ops = [reorderOp(['a']), ensureOp('p1', 'T'), deleteOp('d'), renameOp('r', 'R'), ensureOp('p2', 'U')]
    expect(canonicalOpsOf(ops).map(o => o.kind)).toEqual(['ensure', 'ensure', 'rename', 'reorder', 'delete'])
  })

  it('reorder executes the insertBefore chain tail-first (anchors settle before their movers)', async () => {
    const mock = makeChannel()
    mock.channel.insertBefore = async (request) => { mock.stamp('insertBefore')(request); return okOrder(['x', 'a', 'b', 'c']) }
    await executeProjectionPlan(mock.channel, planOf('p1', [reorderOp(['a', 'b', 'c'])]), [])
    expect(mock.calls.map(call => call.request)).toEqual([
      { workspaceId: 'b', beforeWorkspaceId: 'c' },
      { workspaceId: 'a', beforeWorkspaceId: 'b' },
    ])
    expect(insertBeforeLinksOf(['a', 'b', 'c'])).toEqual([
      { workspaceId: 'b', beforeWorkspaceId: 'c' },
      { workspaceId: 'a', beforeWorkspaceId: 'b' },
    ])
    expect(insertBeforeLinksOf(['solo'])).toEqual([])
  })

  it('ensure with a matching title makes no rename; a differing title converges via conditional rename', async () => {
    const adopt = makeChannel()
    adopt.channel.create = async (request) => { adopt.stamp('create')(request); return okCreate(row('ws-1', 'Z:/a', 'A'), false) }
    adopt.channel.rename = async (request) => { adopt.stamp('rename')(request); return okRename(row('ws-1', 'Z:/a', request.title)) }
    const adopted = await executeProjectionPlan(adopt.channel, planOf('p1', [ensureOp('Z:/a', 'A')]), [])
    expect(adopt.verbs()).toEqual(['create'])
    expect(adopted.ok).toBe(true)
    expect(adopted.entries).toEqual([entry('ws-1', 'Z:/a', 'A', 0)])

    const fresh = makeChannel()
    fresh.channel.create = async (request) => { fresh.stamp('create')(request); return okCreate(row('ws-2', 'Z:/a', 'dirname'), true) }
    fresh.channel.rename = async (request) => { fresh.stamp('rename')(request); return okRename(row('ws-2', 'Z:/a', request.title)) }
    const created = await executeProjectionPlan(fresh.channel, planOf('p1', [ensureOp('Z:/a', 'A')]), [])
    expect(fresh.verbs()).toEqual(['create', 'rename'])
    expect(fresh.calls[1]?.request).toEqual({ workspaceId: 'ws-2', title: 'A' })
    expect(created.entries).toEqual([entry('ws-2', 'Z:/a', 'A', 0)])
  })

  it('an empty plan touches nothing and reports ok', async () => {
    const mock = makeChannel()
    const result = await executeProjectionPlan(mock.channel, planOf('p1', []), [])
    expect(mock.calls).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.entries).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// ③ Error mapping: upstream codes pass through verbatim; idempotent delete;
//    transport rejections fold to the channel-unavailable code
// ---------------------------------------------------------------------------

describe('projection relay: error mapping + continue-on-failure', () => {
  it('a failed ensure records the verbatim upstream code but later ops still run (first failure wins)', async () => {
    const mock = makeChannel()
    mock.channel.create = async (request) => { mock.stamp('create')(request); return { ok: false, error: failure('workspace/invalid-path', 'anchor path rejected') } }
    mock.channel.rename = async (request) => { mock.stamp('rename')(request); return okRename(row('ws-1', 'Z:/a', request.title)) }
    mock.channel.delete = async (request) => { mock.stamp('delete')(request); return okDelete() }
    const result = await executeProjectionPlan(mock.channel, planOf('p1', [
      ensureOp('Z:/a', 'A'),
      renameOp('ws-1', 'A2'),
      deleteOp('ws-9'),
    ]), [])
    expect(mock.verbs()).toEqual(['create', 'rename', 'delete'])
    expect(result.ok).toBe(false)
    expect(result.error).toEqual({ code: 'workspace/invalid-path', message: 'anchor path rejected' })
  })

  it('workspace/name-conflict on rename and workspace/move-invalid on reorder pass through verbatim', async () => {
    const conflict = makeChannel()
    conflict.channel.rename = async (request) => { conflict.stamp('rename')(request); return { ok: false, error: failure('workspace/name-conflict', `Workspace name '${request.title}' is already in use`) } }
    const renamed = await executeProjectionPlan(conflict.channel, planOf('p1', [renameOp('ws-1', 'Taken')]), [])
    expect(renamed.error?.code).toBe('workspace/name-conflict')

    const move = makeChannel()
    move.channel.insertBefore = async (request) => { move.stamp('insertBefore')(request); return { ok: false, error: failure('workspace/move-invalid', 'anchor gone') } }
    const moved = await executeProjectionPlan(move.channel, planOf('p1', [reorderOp(['a', 'b'])]), [])
    expect(moved.error?.code).toBe('workspace/move-invalid')
  })

  it('delete treats workspace/not-found as success (idempotent) but other codes as failure', async () => {
    const gone = makeChannel()
    gone.channel.delete = async (request) => { gone.stamp('delete')(request); return { ok: false, error: failure('workspace/not-found', 'Workspace "ws-1" not found') } }
    const removed = await executeProjectionPlan(gone.channel, planOf('p1', [deleteOp('ws-1')]),
      [entry('ws-1', 'Z:/a', 'A', 0), entry('ws-2', 'Z:/b', 'B', 1)])
    expect(removed.ok).toBe(true)
    expect(removed.entries).toEqual([entry('ws-2', 'Z:/b', 'B', 0)])

    const broken = makeChannel()
    broken.channel.delete = async () => ({ ok: false, error: failure('gateway/bad-request', 'malformed') })
    const failed = await executeProjectionPlan(broken.channel, planOf('p1', [deleteOp('ws-1')]), [])
    expect(failed.ok).toBe(false)
    expect(failed.error?.code).toBe('gateway/bad-request')
  })

  it('a transport rejection folds to ERR_PROJECTION_CHANNEL_UNAVAILABLE without aborting the plan', async () => {
    const mock = makeChannel()
    mock.channel.create = async (request) => { mock.stamp('create')(request); throw new Error('carrier reset') }
    mock.channel.delete = async (request) => { mock.stamp('delete')(request); return okDelete() }
    const result = await executeProjectionPlan(mock.channel, planOf('p1', [
      ensureOp('Z:/a', 'A'),
      deleteOp('ws-1'),
    ]), [])
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe(PROJECTION_CHANNEL_UNAVAILABLE)
    expect(mock.verbs()).toEqual(['create', 'delete'])
  })
})

// ---------------------------------------------------------------------------
// Snapshot merge pure functions
// ---------------------------------------------------------------------------

describe('projection relay: snapshot merge helpers', () => {
  it('applyWorkspaceRow replaces by id, displaces stale same-path rows, and appends unknown ids', () => {
    const base = [entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1)]
    expect(applyWorkspaceRow(base, row('w1', 'Z:/a', 'A2'))).toEqual([entry('w1', 'Z:/a', 'A2', 0), entry('w2', 'Z:/b', 'B', 1)])
    expect(applyWorkspaceRow(base, row('w9', 'Z:/a', 'A3'))).toEqual([entry('w9', 'Z:/a', 'A3', 0), entry('w2', 'Z:/b', 'B', 1)])
    expect(applyWorkspaceRow(base, row('w3', 'Z:/c', 'C'))).toEqual([
      entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1), entry('w3', 'Z:/c', 'C', 2),
    ])
  })

  it('applyRegistryOrder follows the complete order and conservatively keeps unlisted rows', () => {
    const base = [entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1), entry('w3', 'Z:/c', 'C', 2)]
    expect(applyRegistryOrder(base, ['w3', 'w1', 'w2'])).toEqual([
      entry('w3', 'Z:/c', 'C', 0), entry('w1', 'Z:/a', 'A', 1), entry('w2', 'Z:/b', 'B', 2),
    ])
    expect(applyRegistryOrder(base, ['w2', 'unknown-id', 'w1'])).toEqual([
      entry('w2', 'Z:/b', 'B', 0), entry('w1', 'Z:/a', 'A', 1), entry('w3', 'Z:/c', 'C', 2),
    ])
  })

  it('dropWorkspaceId removes and reindexes; snapshotEntriesOf maps array-index orderIdx', () => {
    expect(dropWorkspaceId([entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1)], 'w1'))
      .toEqual([entry('w2', 'Z:/b', 'B', 0)])
    expect(snapshotEntriesOf([row('w1', 'Z:/a', 'A'), row('w2', 'Z:/b', 'B')])).toEqual([
      entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1),
    ])
  })
})

// ---------------------------------------------------------------------------
// ④ The relay: outcome backfill over the 3.2 verb face
// ---------------------------------------------------------------------------

const statusRow = (overrides: Partial<ProjectionStatusRow> = {}): ProjectionStatusRow => ({
  projectId: 'p1', displayName: 'P1', path: 'Z:/a', orderIdx: 0, archived: false,
  state: 'healthy', workspaceId: null, pushedAt: null, lastError: null, deviations: [],
  ...overrides,
})

interface RelayHarness {
  calls: string[]
  outcomes: readonly ReportProjectionOutcomeInput[]
  retries: readonly string[]
  readonly submitted: readonly (readonly WorkspaceSnapshotEntry[])[]
  push: (events: readonly WorkbenchEvent[]) => void
  setEntries: (entries: readonly WorkspaceSnapshotEntry[] | undefined) => void
  dispose: () => void
}

function relayHarness(overrides: {
  /** null = force the absent-channel world; omitted = the default stubbed channel. */
  channel?: WorkspaceChannel | null
  status?: readonly ProjectionStatusRow[]
} = {}): RelayHarness {
  const mock = makeChannel()
  mock.channel.create = async (request) => { mock.stamp('create')(request); return okCreate(row('ws-1', request.path, 'A')) }
  mock.channel.rename = async (request) => { mock.stamp('rename')(request); return okRename(row(request.workspaceId, 'Z:/a', request.title)) }
  mock.channel.insertBefore = async (request) => { mock.stamp('insertBefore')(request); return okOrder(['ws-1']) }
  mock.channel.delete = async (request) => { mock.stamp('delete')(request); return okDelete() }
  const calls: string[] = []
  const submitted: WorkspaceSnapshotEntry[][] = []
  const outcomes: ReportProjectionOutcomeInput[] = []
  const retries: string[] = []
  const listeners: Array<(events: readonly WorkbenchEvent[]) => void> = []
  const channel: WorkspaceChannel | undefined = overrides.channel === null ? undefined : overrides.channel ?? mock.channel
  let entries: readonly WorkspaceSnapshotEntry[] | undefined
  const relay = createProjectionRelay({
    getChannel: () => channel,
    subscribeEvents: (listener) => {
      listeners.push(listener)
      return () => { listeners.splice(listeners.indexOf(listener), 1) }
    },
    getEntries: () => entries,
    submitSnapshot: async (workspaces) => { calls.push('submit'); entries = [...workspaces]; submitted.push([...workspaces]) },
    reportOutcome: async (input) => { calls.push('outcome'); outcomes.push(input) },
    getProjectionStatus: async () => overrides.status ?? [],
    retryProjection: async (input) => { calls.push(`retry:${input.projectId}`); retries.push(input.projectId); return { state: 'degraded' } },
    armPollMs: 5,
    armMaxTries: 3,
    log: () => {},
  })
  return {
    calls, outcomes, retries,
    get submitted() { return submitted },
    push: (events) => { for (const listener of [...listeners]) listener(events) },
    setEntries: (next) => { entries = next },
    dispose: relay.dispose,
  }
}

const pushEvent = (projectId: string, ops: readonly ProjectionOp[]): WorkbenchEvent =>
  ({ type: 'projection_push_required', projectId, plan: planOf(projectId, ops) })

describe('projection relay: outcome backfill', () => {
  it('executes the plan, submits the post-execution snapshot BEFORE the outcome, and backfills ok', async () => {
    const h = relayHarness()
    h.setEntries([entry('ws-9', 'Z:/user', 'User', 0)])
    h.push([pushEvent('p1', [ensureOp('Z:/a', 'A')])])
    await flush()
    expect(h.calls).toEqual(['submit', 'outcome'])
    expect(h.submitted[0]).toEqual([
      entry('ws-9', 'Z:/user', 'User', 0),
      entry('ws-1', 'Z:/a', 'A', 1),
    ])
    expect(h.outcomes).toEqual([{ projectId: 'p1', ok: true }])
  })

  it('a failing plan backfills ok:false with the verbatim upstream code', async () => {
    const failing = makeChannel()
    failing.channel.rename = async () => ({ ok: false, error: failure('workspace/name-conflict', 'taken') })
    const h = relayHarness({ channel: failing.channel })
    h.setEntries([])
    h.push([pushEvent('p1', [renameOp('ws-1', 'Taken')])])
    await flush()
    expect(h.outcomes).toEqual([
      { projectId: 'p1', ok: false, error: { code: 'workspace/name-conflict', message: 'taken' } },
    ])
  })

  it('an absent channel backfills ERR_PROJECTION_CHANNEL_UNAVAILABLE without touching the snapshot face', async () => {
    const h = relayHarness({ channel: null })
    h.setEntries([])
    h.push([pushEvent('p1', [ensureOp('Z:/a', 'A')])])
    await flush()
    expect(h.calls).toEqual(['outcome'])
    expect(h.outcomes[0]).toMatchObject({ projectId: 'p1', ok: false, error: { code: PROJECTION_CHANNEL_UNAVAILABLE } })
  })

  it('no established snapshot (never reported) → no partial submit, outcome still backfills', async () => {
    const h = relayHarness()
    h.setEntries(undefined)
    h.push([pushEvent('p1', [ensureOp('Z:/a', 'A')])])
    await flush()
    expect(h.calls).toEqual(['outcome'])
    expect(h.outcomes).toEqual([{ projectId: 'p1', ok: true }])
  })

  it('non-projection events are ignored; two plans in one batch execute sequentially in arrival order', async () => {
    const mock = makeChannel()
    const created: string[] = []
    mock.channel.create = async (request) => {
      mock.stamp('create')(request)
      created.push(request.path)
      return okCreate(row(`ws-${request.path}`, request.path, 'T'))
    }
    const h = relayHarness({ channel: mock.channel })
    h.setEntries([])
    h.push([
      { type: 'project_list_changed' },
      pushEvent('p1', [ensureOp('Z:/one', 'T')]),
      pushEvent('p2', [ensureOp('Z:/two', 'T')]),
    ])
    await flush()
    expect(created).toEqual(['Z:/one', 'Z:/two'])
    expect(h.outcomes.map(outcome => outcome.projectId)).toEqual(['p1', 'p2'])
    expect(h.calls.filter(call => call === 'submit')).toHaveLength(2)
  })

  it('dispose unsubscribes — later pushes never execute', async () => {
    const h = relayHarness()
    h.dispose()
    h.push([pushEvent('p1', [deleteOp('ws-1')])])
    await flush()
    expect(h.calls).toEqual([])
  })

  it('a rejected outcome report is absorbed (logged, never thrown into the event dispatch)', async () => {
    const mock = makeChannel()
    mock.channel.delete = async () => okDelete()
    const listeners: Array<(events: readonly WorkbenchEvent[]) => void> = []
    createProjectionRelay({
      getChannel: () => mock.channel,
      subscribeEvents: (listener) => { listeners.push(listener); return () => {} },
      getEntries: () => [],
      submitSnapshot: async () => {},
      reportOutcome: async () => { throw new Error('verb rejected') },
      getProjectionStatus: async () => [],
      retryProjection: async () => ({ state: 'pending' }),
      log: () => {},
    })
    expect(() => {
      for (const listener of listeners) listener([pushEvent('p1', [deleteOp('ws-1')])])
    }).not.toThrow()
    await flush()
  })
})

// ---------------------------------------------------------------------------
// ⑥ Boot replay (relay 不在场重放)
// ---------------------------------------------------------------------------

describe('projection relay: boot replay of channel-absent plans', () => {
  it('replays degraded·ERR_PROJECTION_CHANNEL_UNAVAILABLE rows via retryProjection; other states untouched', async () => {
    const h = relayHarness({
      status: [
        statusRow({ projectId: 'p-degraded', state: 'degraded', lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE: projection relay absent after one retry (plan preserved — retryProjection re-pushes)' }),
        statusRow({ projectId: 'p-opfailed', state: 'degraded', lastError: 'ERR_PROJECTION_OP_FAILED (upstream workspace/name-conflict): taken' }),
        statusRow({ projectId: 'p-pending', state: 'pending' }),
        statusRow({ projectId: 'p-deviation', state: 'deviation' }),
        statusRow({ projectId: 'p-archived', state: 'degraded', archived: true, lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE: x' }),
        statusRow({ projectId: 'p-healthy', state: 'healthy' }),
      ],
    })
    await flush()
    expect(h.retries).toEqual(['p-degraded'])
  })

  it('waits for the channel (bounded poll) before reading status; a status rejection logs and never throws', async () => {
    vi.useFakeTimers()
    try {
      const mock = makeChannel()
      let statusReads = 0
      let channel: WorkspaceChannel | undefined
      const base = {
        subscribeEvents: (): (() => void) => () => {},
        getEntries: () => undefined,
        submitSnapshot: async (): Promise<void> => {},
        reportOutcome: async (): Promise<void> => {},
        log: () => {},
      }
      const relay = createProjectionRelay({
        ...base,
        getChannel: () => channel,
        getProjectionStatus: async () => {
          statusReads += 1
          throw new Error('status read failed')
        },
        retryProjection: async () => ({ state: 'degraded' }),
        armPollMs: 5,
        armMaxTries: 100,
      })
      expect(statusReads).toBe(0) // channel absent — the replay waits
      channel = mock.channel
      await vi.advanceTimersByTimeAsync(10)
      expect(statusReads).toBe(1) // the read fired once and its rejection was absorbed
      relay.dispose()

      // A fresh install (the next boot) retries — the one-shot replay re-runs.
      const retries: string[] = []
      const relay2 = createProjectionRelay({
        ...base,
        getChannel: () => channel,
        getProjectionStatus: async () => [statusRow({ projectId: 'p1', state: 'degraded', lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE: absent' })],
        retryProjection: async (input) => { retries.push(input.projectId); return { state: 'degraded' } },
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(retries).toEqual(['p1'])
      relay2.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('never waits forever: the replay fires once after the poll cap even without a channel', async () => {
    vi.useFakeTimers()
    try {
      const reads: number[] = []
      const relay = createProjectionRelay({
        getChannel: () => undefined,
        subscribeEvents: (): (() => void) => () => {},
        getEntries: () => undefined,
        submitSnapshot: async (): Promise<void> => {},
        reportOutcome: async (): Promise<void> => {},
        getProjectionStatus: async () => { reads.push(reads.length); return [] },
        retryProjection: async () => ({ state: 'pending' }),
        armPollMs: 5,
        armMaxTries: 2,
        log: () => {},
      })
      await vi.advanceTimersByTimeAsync(20)
      expect(reads).toHaveLength(1)
      relay.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// ⑤ The follow-flow snapshot reporter
// ---------------------------------------------------------------------------

/** A mutable fake snapshot source (follow-flow materialization twin). */
function fakeSource(initial: { items: readonly WorkspaceRow[]; phase: 'pending' | 'ready' }) {
  const listeners = new Set<() => void>()
  let snapshot = initial
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    } satisfies WorkspaceSnapshotSource,
    set: (next: { items: readonly WorkspaceRow[]; phase: 'pending' | 'ready' }): (void) => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
  }
}

describe('projection relay: follow-flow snapshot reporter', () => {
  const logs: string[] = []
  afterEach(() => { logs.length = 0 })

  it('reports once immediately at boot when a ready baseline exists (存量 pending 收数)', async () => {
    const fake = fakeSource({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
    const submitted: WorkspaceSnapshotEntry[][] = []
    const reporter = createSnapshotReporter({
      resolveSource: () => fake.source,
      submit: async (workspaces) => { submitted.push([...workspaces]) },
      log: (message) => { logs.push(message) },
    })
    await flush()
    expect(submitted).toEqual([[entry('w1', 'Z:/a', 'A', 0)]])
    reporter.dispose()
  })

  it('never reports a pending phase (empty ≠ unknown); the first ready notice reports', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeSource({ items: [], phase: 'pending' })
      const submitted: WorkspaceSnapshotEntry[][] = []
      createSnapshotReporter({
        resolveSource: () => fake.source,
        submit: async (workspaces) => { submitted.push([...workspaces]) },
        log: (message) => { logs.push(message) },
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(submitted).toEqual([]) // pending — no report (the source is present: no poll churn)
      fake.set({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
      await vi.advanceTimersByTimeAsync(1000)
      expect(submitted).toEqual([[entry('w1', 'Z:/a', 'A', 0)]])
    } finally {
      vi.useRealTimers()
    }
  })

  it('debounces bursty notices and re-reads at flush; identical content never re-submits', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeSource({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
      const submitted: WorkspaceSnapshotEntry[][] = []
      createSnapshotReporter({
        resolveSource: () => fake.source,
        submit: async (workspaces) => { submitted.push([...workspaces]) },
        debounceMs: 300,
        log: (message) => { logs.push(message) },
      })
      expect(submitted).toHaveLength(1) // boot leg
      fake.set({ items: [row('w1', 'Z:/a', 'A'), row('w2', 'Z:/b', 'B')], phase: 'ready' })
      fake.set({ items: [row('w1', 'Z:/a', 'A'), row('w2', 'Z:/b', 'B'), row('w3', 'Z:/c', 'C')], phase: 'ready' })
      await vi.advanceTimersByTimeAsync(150)
      expect(submitted).toHaveLength(1) // inside the window — coalesced
      await vi.advanceTimersByTimeAsync(200)
      expect(submitted).toHaveLength(2) // flushed with the FRESHEST read
      expect(submitted[1]).toEqual([
        entry('w1', 'Z:/a', 'A', 0), entry('w2', 'Z:/b', 'B', 1), entry('w3', 'Z:/c', 'C', 2),
      ])
      fake.set({ items: [row('w1', 'Z:/a', 'A'), row('w2', 'Z:/b', 'B'), row('w3', 'Z:/c', 'C')], phase: 'ready' })
      await vi.advanceTimersByTimeAsync(1000)
      expect(submitted).toHaveLength(2) // equality gate absorbs no-op notices
    } finally {
      vi.useRealTimers()
    }
  })

  it('a rejected submit re-arms the equality gate so the next notice retries', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeSource({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
      let rejectNext = true
      const submitted: WorkspaceSnapshotEntry[][] = []
      createSnapshotReporter({
        resolveSource: () => fake.source,
        submit: async (workspaces) => {
          submitted.push([...workspaces])
          if (rejectNext) { rejectNext = false; throw new Error('verb rejected') }
        },
        log: (message) => { logs.push(message) },
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(submitted).toHaveLength(1)
      expect(logs[0]).toContain('snapshot submit rejected')
      fake.set({ items: [row('w1', 'Z:/a', 'A2')], phase: 'ready' })
      await vi.advanceTimersByTimeAsync(1000)
      expect(submitted).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('polls until the source appears (late app-tier service), then boot-reports; dispose stops the poll', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeSource({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
      let present = false
      const submitted: WorkspaceSnapshotEntry[][] = []
      const reporter = createSnapshotReporter({
        resolveSource: () => (present ? fake.source : undefined),
        submit: async (workspaces) => { submitted.push([...workspaces]) },
        pollMs: 50,
        log: (message) => { logs.push(message) },
      })
      await vi.advanceTimersByTimeAsync(120)
      expect(submitted).toEqual([])
      present = true
      await vi.advanceTimersByTimeAsync(60)
      expect(submitted).toEqual([[entry('w1', 'Z:/a', 'A', 0)]])
      reporter.dispose()
      fake.set({ items: [row('w1', 'Z:/a', 'A9')], phase: 'ready' })
      await vi.advanceTimersByTimeAsync(1000)
      expect(submitted).toHaveLength(1) // unsubscribed — no further reports
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspacesSourceOf bridges the nested ctx.workspaces.list store (guarded)', () => {
    const { context, serviceTable } = fakeContext()
    expect(workspacesSourceOf(context as never)).toBeUndefined()
    serviceTable.set(WORKSPACES_SERVICE_KEY, { list: 'not-a-store' })
    expect(workspacesSourceOf(context as never)).toBeUndefined()
    const fake = fakeSource({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
    serviceTable.set(WORKSPACES_SERVICE_KEY, { list: fake.source })
    const bridged = workspacesSourceOf(context as never)
    expect(bridged?.getSnapshot()).toEqual({ items: [row('w1', 'Z:/a', 'A')], phase: 'ready' })
    expect(typeof bridged?.subscribe(() => {})).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// Result-shape sanity (the declared union compiles both legs)
// ---------------------------------------------------------------------------

describe('projection relay: execution result shape', () => {
  it('priorEntries undefined → submittable false with undefined entries', async () => {
    const mock = makeChannel()
    mock.channel.delete = async () => okDelete()
    const result: PlanExecutionResult = await executeProjectionPlan(
      mock.channel, planOf('p1', [deleteOp('w1')]), undefined,
    )
    expect(result.submittable).toBe(false)
    expect(result.entries).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.error).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// ⑦ The installer (ctx + bridge wiring; the dispatch-relay installer harness)
// ---------------------------------------------------------------------------

describe('projection relay: installer', () => {
  it('wires reporter + relay + boot replay over one ctx and bridge (end-to-end shape)', async () => {
    const mock = makeChannel()
    mock.channel.create = async (request) => { mock.stamp('create')(request); return okCreate(row('ws-1', request.path, 'A')) }
    const { context, serviceTable } = fakeContext()
    serviceTable.set(WORKSPACE_REMOTE_KEY, mock.channel)
    const fake = fakeSource({ items: [row('ws-9', 'Z:/user', 'User')], phase: 'ready' })
    serviceTable.set(WORKSPACES_SERVICE_KEY, { list: fake.source })

    const calls: string[] = []
    let eventListener: ((events: readonly WorkbenchEvent[]) => void) | undefined
    const bridge = {
      onEvents: (listener: (events: readonly WorkbenchEvent[]) => void) => {
        eventListener = listener
        return () => { eventListener = undefined }
      },
      submitWorkspaceSnapshot: async (input: { workspaces: readonly WorkspaceSnapshotEntry[] }) => {
        calls.push(`submit:${String(input.workspaces.length)}`)
      },
      reportProjectionOutcome: async (input: ReportProjectionOutcomeInput) => {
        calls.push(input.ok === true ? `outcome:${input.projectId}:ok` : `outcome:${input.projectId}:err`)
      },
      getProjectionStatus: async () => [
        statusRow({ projectId: 'p-degraded', state: 'degraded', lastError: 'ERR_PROJECTION_CHANNEL_UNAVAILABLE: absent' }),
      ],
      retryProjection: async (input: { projectId: string }) => {
        calls.push(`retry:${input.projectId}`)
        return { state: 'degraded' }
      },
    } as unknown as import('../src/client/ipc/workbench').WorkbenchIpcBridge

    const uninstall = installProjectionRelay(context as never, bridge)
    await flush()
    // Boot legs: the reporter's immediate snapshot report + the boot replay's
    // retryProjection for the channel-absent row.
    expect(calls).toEqual(['submit:1', 'retry:p-degraded'])

    // The plan leg rides the shared event source; entries flow through the
    // shared submit seam (prior = the reported snapshot).
    eventListener?.([pushEvent('p1', [ensureOp('Z:/a', 'A')])])
    await flush()
    expect(mock.verbs()).toEqual(['create'])
    expect(calls[2]).toBe('submit:2') // user row + the ensured row
    expect(calls[3]).toBe('outcome:p1:ok')

    uninstall()
    eventListener?.([pushEvent('p1', [deleteOp('ws-1')])])
    await flush()
    expect(mock.verbs()).toEqual(['create']) // unsubscribed — no execution after dispose
  })

  it('an absent workspaces source never blocks the plan leg (degraded service ≠ dead relay)', async () => {
    const mock = makeChannel()
    mock.channel.delete = async (request) => { mock.stamp('delete')(request); return okDelete() }
    const { context, serviceTable } = fakeContext()
    serviceTable.set(WORKSPACE_REMOTE_KEY, mock.channel)
    let eventListener: ((events: readonly WorkbenchEvent[]) => void) | undefined
    const bridge = {
      onEvents: (listener: (events: readonly WorkbenchEvent[]) => void) => {
        eventListener = listener
        return () => { eventListener = undefined }
      },
      submitWorkspaceSnapshot: async () => { throw new Error('unexpected submit') },
      reportProjectionOutcome: async (input: ReportProjectionOutcomeInput) => {
        expect(input).toEqual({ projectId: 'p1', ok: true })
      },
      getProjectionStatus: async () => [],
      retryProjection: async () => ({ state: 'pending' }),
    } as unknown as import('../src/client/ipc/workbench').WorkbenchIpcBridge
    const uninstall = installProjectionRelay(context as never, bridge)
    await flush()
    eventListener?.([pushEvent('p1', [deleteOp('ws-1')])])
    await flush()
    expect(mock.verbs()).toEqual(['delete'])
    uninstall()
  })
})
