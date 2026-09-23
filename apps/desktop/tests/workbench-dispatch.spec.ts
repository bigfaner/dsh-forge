// Task 3.3 kernel legs — the dispatch/approval orchestration domain (repos +
// verbs + approval decisions + events + the host launch callback seam). AC groups:
//
//   AC-1 dispatchTasks — 可派发集校验(状态允许 + 依赖终态;悬空依赖 claim
//            语境 vacuously satisfied)、产物缺失未确认 → blocked 联合返回 +
//            missing 清单、acknowledgeMissing → 受理、同批多任务 batch_id
//            聚合(每任务独立行)、files 项目权限界、预合成契约拒绝。
//   AC-2 状态机 — dispatch 5 态合法迁移(host 回调 session_id 回填 /
//            failed+error / 终局驱动,内核事务落库);非法边/终态出边拒绝;
//            launch-port 成功/失败/抛错三路。
//   AC-3 审批 — receiveApproval 入列 → awaiting 联动、decideApproval 显式
//            决策(decided_by/decided_at 审计)、重复决策 →
//            ERR_APPROVAL_DECIDED、失效条目 → ERR_APPROVAL_NOT_FOUND。
//   AC-4 不变式 — awaiting ⇔ 同 dispatch pending 审批,在全部迁移路径成立
//            (全生命周期逐断言 + 库级全量复核;awaiting 终局守卫拒绝)。
//   AC-5 事件 — dispatch_updated/approval_received 经注入 onEvents 单批直发
//            (动词完成一批;≤500ms 批推通道由 sink 承载,形态断言)。
//   IPC 面 — 五动词通道路由 + 参数形状校验 + 域错误封装原码透传 + 装配
//            缺省(3.4 前无预合成 → 契约拒绝;3.5 前行留 starting)。
//
// Everything runs against the real migrated db (node:sqlite) — no spawn, no
// CLI, no network. checkStageArtifacts 的消费以注入 stub 表达(清单判定
// 本体 = 3.2 全矩阵;此处测 dispatch 对报告的 blocked/acknowledge 语义)。

import { createHash } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import type { RepoDb, TaskStatus } from '../src/main/workbench/repos/types.ts'
import { insertTask } from '../src/main/workbench/tasks/task-repo.ts'
import type { AuthoritativeTask } from '../src/main/workbench/tasks/task-repo.ts'
import type { MissingItem, StageArtifactsReport, WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { createDispatchVerbService, type DispatchVerbService } from '../src/main/workbench/dispatch/dispatch-service.ts'
import type { DispatchLaunchInput, DispatchLaunchOutcome, DispatchLaunchPort } from '../src/main/workbench/dispatch/launch-port.ts'
import { countPendingApprovals } from '../src/main/workbench/dispatch/approval-repo.ts'
import { listDispatches } from '../src/main/workbench/dispatch/dispatch-repo.ts'
import {
  WORKBENCH_VERB_CHANNELS,
} from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  installWorkbenchVerbs,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'

const FIXED_AT = '2026-09-24T10:00:00.000Z'

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []
let scratchSeq = 0

function makeScratch(): string {
  scratchSeq += 1
  const dir = join(tmpdir(), `dsh-forge-dispatch-${String(process.pid)}-${String(scratchSeq)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  // 先关库再删树(win32 打开句柄 → EPERM);断言失败提前抛出的测试由这里兜底。
  for (const db of openDbs.splice(0)) {
    try {
      db.close()
    } catch {
      // already closed by the test — nothing to do
    }
  }
  for (const dir of scratches.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
    } catch {
      // best effort:句柄竞态留给下一个唯一命名(不复用序列号)
    }
  }
})

/** 联合返回的 dispatched 分支收窄(blocked 分支 = 测试失败)。 */
function dispatchedOf(result: { dispatched: unknown } | { blocked: 'artifacts-missing' }): unknown[] {
  if (!('dispatched' in result)) throw new Error(`expected the dispatched union member, got blocked: ${JSON.stringify(result)}`)
  return result.dispatched as unknown[]
}

/** 域错误 code 断言(message 与 code 分立面)。 */
function expectErrorCode(run: () => unknown, code: string): void {
  try {
    run()
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
    return
  }
  throw new Error(`expected ${code} but nothing was thrown`)
}

// ---------------------------------------------------------------------------
// Fixture seeding(sqlite 权威项目 + alpha 任务族)
// ---------------------------------------------------------------------------

interface SeedTask {
  readonly localId: string
  readonly title?: string
  readonly status: TaskStatus
  readonly blockers?: readonly string[]
  readonly taskType?: string | null
}

/** 任务族:1.1 就绪 / 1.2 依赖未满足 / 1.3 终态 / 1.4 在跑 / 1.5 挂起 /
 * 2.1 blocked+依赖已满足 / 3.1 rejected / dang 悬空依赖(claim 语境放行)。 */
const DEFAULT_TASKS: readonly SeedTask[] = [
  { localId: '1.1', title: 'ready task', status: 'pending' },
  { localId: '1.2', title: 'dependent task', status: 'pending', blockers: ['1.1'] },
  { localId: '1.3', title: 'completed task', status: 'completed' },
  { localId: '1.4', title: 'running task', status: 'in_progress' },
  { localId: '1.5', title: 'suspended task', status: 'suspended' },
  { localId: '2.1', title: 'unblocked task', status: 'blocked', blockers: ['1.3'] },
  { localId: '3.1', title: 'rejected task', status: 'rejected' },
  { localId: 'dang', title: 'dangling dep task', status: 'pending', blockers: ['9.9'] },
]

interface Harness {
  readonly db: DatabaseSyncLike
  readonly projectId: string
  readonly events: WorkbenchEvent[]
  /** 事件批收集端(每动词调用一批)。 */
  readonly batches: WorkbenchEvent[][]
  readonly checkArtifacts: { mockReturnValue(report: StageArtifactsReport): void }
  readonly composePrompt: { mockReturnValueOnce(value: string): void }
  readonly launchInputs: DispatchLaunchInput[]
  service(overrides?: { launchPort?: DispatchLaunchPort }): DispatchVerbService
}

async function seedHarness(options?: { authority?: 'files' | 'sqlite'; tasks?: readonly SeedTask[] }): Promise<Harness> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  const projectId = 'p-1'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)
  const authority = options?.authority ?? 'sqlite'
  db.prepare('UPDATE projects SET data_authority = ? WHERE id = ?').run(authority, projectId)
  for (const task of options?.tasks ?? DEFAULT_TASKS) {
    insertTask(db, {
      projectId,
      taskKey: `alpha/${task.localId}`,
      featureSlug: 'alpha',
      title: task.title ?? task.localId,
      status: task.status,
      blockers: [...(task.blockers ?? [])],
      taskType: task.taskType ?? null,
      descPath: null,
      updatedBy: 'kernel',
      updatedAt: FIXED_AT,
    })
  }

  const events: WorkbenchEvent[] = []
  const batches: WorkbenchEvent[][] = []
  const checkArtifacts = vi.fn(
    (): StageArtifactsReport => ({ stage: 'tasks', satisfied: true, missing: [] }),
  )
  const composePrompt = vi.fn((task: AuthoritativeTask) => `PROMPT[${task.taskKey}]`)
  const launchInputs: DispatchLaunchInput[] = []

  openDbs.push(db) // 兜底关库注册(断言失败提前抛出时由 afterEach 收口)
  return {
    db,
    projectId,
    events,
    batches,
    checkArtifacts,
    composePrompt,
    launchInputs,
    service(overrides?: { launchPort?: DispatchLaunchPort }): DispatchVerbService {
      return createDispatchVerbService({
        db,
        checkArtifacts: () => checkArtifacts(),
        composePrompt: task => composePrompt(task),
        ...(overrides?.launchPort === undefined ? {} : { launchPort: overrides.launchPort }),
        onEvents: (batch) => {
          batches.push([...batch])
          for (const event of batch) events.push(event)
        },
      })
    },
  }
}

/** 端口 stub:默认全部成功(sessionId = s-<n>),可按 dispatch 序号覆写结果。 */
function stubPort(
  launchInputs: DispatchLaunchInput[],
  resolve: (index: number, input: DispatchLaunchInput) => DispatchLaunchOutcome = i => ({ ok: true, sessionId: `s-${String(i + 1)}` }),
): DispatchLaunchPort {
  return {
    launch(input: DispatchLaunchInput) {
      launchInputs.push(input)
      const index = launchInputs.length - 1
      return resolve(index, input)
    },
  }
}

function missingItem(artifact: string): MissingItem {
  return { stage: 'tasks', rule: 'file-missing', artifact, detail: `expected ${artifact} does not exist` }
}

// ---------------------------------------------------------------------------
// AC-1: dispatchTasks 可派发集校验 + blocked 联合返回 + batch_id 聚合
// ---------------------------------------------------------------------------

describe('AC-1 dispatchTasks — dispatchable-set checks and batch semantics', () => {
  it('creates one independent dispatch row per task, all sharing one batch_id (starting state, no port)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1', 'alpha/2.1'] }, 'session:board-1')
    interface RowShape {
      id: string
      batchId: string
      state: string
      sessionId: string | null
      actor: string
      promptHash: string
      endedAt: string | null
    }
    const rows = dispatchedOf(result) as RowShape[]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.batchId).toBe(rows[1]?.batchId)
    expect(rows[0]?.id).not.toBe(rows[1]?.id)
    for (const row of rows) {
      expect(row.state).toBe('starting')
      expect(row.sessionId).toBeNull()
      expect(row.actor).toBe('session:board-1')
      expect(row.promptHash).toMatch(/^[0-9a-f]{64}$/)
      expect(row.endedAt).toBeNull()
    }
    h.db.close()
  })

  it('stores prompt_hash = sha256(composed prompt) per row (SC3 anchor form)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    const row = (dispatchedOf(result) as { taskKey: string; promptHash: string }[])[0]
    const expected = createHash('sha256').update('PROMPT[alpha/1.1]', 'utf8').digest('hex')
    expect(row?.promptHash).toBe(expected)
    h.db.close()
  })

  it('blocks on unmet dependencies with the unmet list and writes nothing', async () => {
    const h = await seedHarness()
    const service = h.service()
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.2'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_TASK_DEPS_UNSATISFIED',
      message: expect.stringContaining('1.1'),
    })
    expect(listDispatches(h.db, h.projectId)).toHaveLength(0)
    h.db.close()
  })

  it('blocks terminal / in-progress / suspended tasks with ERR_TASK_STATE_INVALID', async () => {
    const h = await seedHarness()
    const service = h.service()
    for (const [key, fragment] of [
      ['alpha/1.3', 'already completed'],
      ['alpha/3.1', 'rejected'],
      ['alpha/1.4', 'already being executed'],
      ['alpha/1.5', 'suspended'],
    ] as const) {
      await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: [key] }, 'kernel')).rejects.toMatchObject({
        code: 'ERR_TASK_STATE_INVALID',
        message: expect.stringContaining(fragment),
      })
    }
    expect(listDispatches(h.db, h.projectId)).toHaveLength(0)
    h.db.close()
  })

  it('treats dangling exact deps as vacuously satisfied (claim-context semantics)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/dang'] }, 'kernel')
    expect(dispatchedOf(result)).toHaveLength(1)
    h.db.close()
  })

  it('returns the blocked union with the missing list when artifacts are missing and unacknowledged', async () => {
    const h = await seedHarness()
    h.checkArtifacts.mockReturnValue({ stage: 'tasks', satisfied: false, missing: [missingItem('design/tech-design.md')] })
    const service = h.service()
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    expect(result).toEqual({
      blocked: 'artifacts-missing',
      missing: [{ stage: 'tasks', rule: 'file-missing', artifact: 'design/tech-design.md', detail: 'expected design/tech-design.md does not exist' }],
    })
    expect(listDispatches(h.db, h.projectId)).toHaveLength(0) // 受理前零落行
    h.db.close()
  })

  it('dispatches past the missing list once acknowledgeMissing is set', async () => {
    const h = await seedHarness()
    h.checkArtifacts.mockReturnValue({ stage: 'tasks', satisfied: false, missing: [missingItem('design/tech-design.md')] })
    const service = h.service()
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'], acknowledgeMissing: true }, 'kernel')
    expect(dispatchedOf(result)).toHaveLength(1)
    h.db.close()
  })

  it('rejects non-sqlite projects with ERR_TASK_NOT_AUTHORITATIVE (dual-form discipline)', async () => {
    const h = await seedHarness({ authority: 'files' })
    const service = h.service()
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_TASK_NOT_AUTHORITATIVE',
    })
    h.db.close()
  })

  it('refuses to dispatch without presynthesized content (ERR_SYSTEM_PROMPT_CONTRACT)', async () => {
    const h = await seedHarness()
    const service = createDispatchVerbService({
      db: h.db,
      checkArtifacts: () => ({ stage: 'tasks', satisfied: true, missing: [] }),
      onEvents: () => {},
    })
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_SYSTEM_PROMPT_CONTRACT',
    })
    h.composePrompt.mockReturnValueOnce('') // 空产物同拒(契约查:内容非空)
    const withEmptyPrompt = h.service()
    await expect(withEmptyPrompt.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_SYSTEM_PROMPT_CONTRACT',
    })
    expect(listDispatches(h.db, h.projectId)).toHaveLength(0)
    h.db.close()
  })

  it('validates input shape: empty / duplicate taskKeys and empty actor are contract errors', async () => {
    const h = await seedHarness()
    const service = h.service()
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: [] }, 'kernel')).rejects.toThrow(/taskKeys must be a non-empty array/)
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1', 'alpha/1.1'] }, 'kernel')).rejects.toThrow(/distinct/)
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, '')).rejects.toThrow(/actor must be a non-empty string/)
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha11'] }, 'kernel')).rejects.toMatchObject({ code: 'ERR_TASK_KEY_INVALID' })
    await expect(service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/9.9'] }, 'kernel')).rejects.toMatchObject({ code: 'ERR_TASK_NOT_FOUND' })
    h.db.close()
  })
})

// ---------------------------------------------------------------------------
// AC-2: 5 态状态机 + host 回调驱动(launch-port 三路 + notify 面)
// ---------------------------------------------------------------------------

describe('AC-2 dispatch state machine — host callbacks drive legal transitions', () => {
  it('backfills session_id and moves starting → running on a successful launch', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs)
    const service = h.service({ launchPort: port })
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    const row = (dispatchedOf(result) as { id: string; state: string; sessionId: string | null }[])[0]
    expect(row?.state).toBe('running')
    expect(row?.sessionId).toBe('s-1')
    expect(h.launchInputs).toHaveLength(1)
    expect(h.launchInputs[0]).toMatchObject({ taskKey: 'alpha/1.1', taskType: null, projectId: h.projectId })
    expect(h.launchInputs[0]?.prompt).toBe('PROMPT[alpha/1.1]')
    h.db.close()
  })

  it('moves starting → failed with the reason when the launch fails (degradation chain)', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs, () => ({ ok: false, error: 'session controller unavailable' }))
    const service = h.service({ launchPort: port })
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    const row = (dispatchedOf(result) as { state: string; error: string | null; endedAt: string | null }[])[0]
    expect(row?.state).toBe('failed')
    expect(row?.error).toBe('session controller unavailable')
    expect(row?.endedAt).not.toBeNull()
    h.db.close()
  })

  it('treats a throwing port as a launch failure (verb never rejects on host errors)', async () => {
    const h = await seedHarness()
    const port: DispatchLaunchPort = {
      launch() {
        throw new Error('host exploded')
      },
    }
    const service = h.service({ launchPort: port })
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    const row = (dispatchedOf(result) as { state: string; error: string | null }[])[0]
    expect(row?.state).toBe('failed')
    expect(row?.error).toContain('host exploded')
    h.db.close()
  })

  it('keeps dispatches independent within a parallel batch (distinct sessions, no cross-talk)', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs)
    const service = h.service({ launchPort: port })
    const result = await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1', 'alpha/2.1', 'alpha/dang'] }, 'kernel')
    const rows = dispatchedOf(result) as { id: string; sessionId: string | null; state: string }[]
    expect(rows.map(row => row.sessionId)).toEqual(['s-1', 's-2', 's-3'])
    expect(rows.map(row => row.state)).toEqual(['running', 'running', 'running'])
    expect(new Set(h.launchInputs.map(input => input.dispatchId)).size).toBe(3)
    expect(new Set(h.launchInputs.map(input => input.promptHash)).size).toBe(3)
    h.db.close()
  })

  it('drives a full happy-path lifecycle: starting → running → awaiting → running → done', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    const running = service.notifySessionStarted(id, 'sess-1')
    expect(running.state).toBe('running')
    expect(running.sessionId).toBe('sess-1')
    const approval = service.receiveApproval({ dispatchId: id, payload: { kind: 'workspace-write', message: 'rm -rf tests' } })
    const awaiting = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(awaiting.state).toBe('awaiting')
    service.decideApproval({ approvalId: approval.id, approve: true }, 'session:board-1')
    const resumed = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(resumed.state).toBe('running')
    const done = service.notifyDispatchEnded(id, 'done')
    expect(done.state).toBe('done')
    expect(done.endedAt).not.toBeNull()
    h.db.close()
  })

  it('notifySessionStarted is idempotent for the same session and rejects state races', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    const again = service.notifySessionStarted(id, 'sess-1')
    expect(again.state).toBe('running')
    const repeat = service.notifySessionStarted(id, 'sess-1') // 幂等回填 no-op
    expect(repeat.state).toBe('running')
    expect(() => service.notifySessionStarted(id, 'sess-2')).toThrowError(/expected starting/)
    expectErrorCode(() => service.notifySessionStarted('nope', 'sess-1'), 'ERR_DISPATCH_NOT_FOUND')
    h.db.close()
  })

  it('rejects transitions out of terminal states and approvals on non-running dispatches', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    service.notifyLaunchFailed(id, 'boom')
    expectErrorCode(() => service.notifyDispatchEnded(id, 'done'), 'ERR_DISPATCH_STATE_INVALID') // failed 无出边
    expectErrorCode(() => service.receiveApproval({ dispatchId: id, payload: {}, sessionId: 'sess-9' }), 'ERR_DISPATCH_STATE_INVALID')
    h.db.close()
  })

  it('redispatch re-runs the checks on a failed dispatch and leaves the original row as audit trail', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs, () => ({ ok: false, error: 'first launch failed' }))
    let service = h.service({ launchPort: port })
    const first = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string; state: string }[]
    const failed = first[0] as { id: string; state: string }
    expect(failed.state).toBe('failed')

    // 重走检查:产物缺失 → blocked 联合返回(二次确认在 UI),零新行。
    h.checkArtifacts.mockReturnValue({ stage: 'tasks', satisfied: false, missing: [missingItem('prd/prd-spec.md')] })
    const blocked = await service.redispatch(failed.id, 'kernel')
    expect(blocked).toMatchObject({ blocked: 'artifacts-missing' })
    expect(listDispatches(h.db, h.projectId)).toHaveLength(1)

    h.checkArtifacts.mockReturnValue({ stage: 'tasks', satisfied: true, missing: [] })
    const okPort = stubPort(h.launchInputs)
    service = h.service({ launchPort: okPort })
    const again = await service.redispatch(failed.id, 'kernel')
    const rows = dispatchedOf(again) as { id: string; taskKey: string; state: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).not.toBe(failed.id)
    expect(rows[0]?.taskKey).toBe('alpha/1.1')
    expect(rows[0]?.state).toBe('running')
    const original = h.db.prepare('SELECT state, error FROM dispatch WHERE id = ?').get(failed.id) as { state: string; error: string }
    expect(original).toMatchObject({ state: 'failed', error: 'first launch failed' })
    h.db.close()
  })

  it('redispatch rejects non-failed rows and unknown ids', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    await expect(service.redispatch(id, 'kernel')).rejects.toMatchObject({ code: 'ERR_DISPATCH_STATE_INVALID' })
    await expect(service.redispatch('missing-id', 'kernel')).rejects.toMatchObject({ code: 'ERR_DISPATCH_NOT_FOUND' })
    h.db.close()
  })
})

// ---------------------------------------------------------------------------
// AC-3: 审批 —— 入列联动 + 显式决策审计 + 重复/失效拒绝
// ---------------------------------------------------------------------------

describe('AC-3 approval lifecycle — explicit decisions with audit', () => {
  async function runningDispatch(h: Harness): Promise<string> {
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    service.notifySessionStarted(id, 'sess-1')
    return id
  }

  it('creates a pending approval and moves the dispatch to awaiting in one transaction', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    h.batches.length = 0
    const approval = service.receiveApproval({ dispatchId: id, payload: { kind: 'workspace-write', message: 'delete tests' } })
    expect(approval.state).toBe('pending')
    expect(approval.decidedAt).toBeNull()
    expect(approval.decidedBy).toBeNull()
    expect(approval.sessionId).toBe('sess-1')
    expect(approval.payload).toEqual({ kind: 'workspace-write', message: 'delete tests' })
    const dispatch = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(dispatch.state).toBe('awaiting')
    expect(service.listApprovals(h.projectId)).toHaveLength(1)
    h.db.close()
  })

  it('records decided_by/decided_at on an explicit approval and resumes the dispatch', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    const approval = service.receiveApproval({ dispatchId: id, payload: 'write' })
    const decided = service.decideApproval({ approvalId: approval.id, approve: true }, 'session:human-1')
    expect(decided.state).toBe('approved')
    expect(decided.decidedBy).toBe('session:human-1')
    expect(decided.decidedAt).not.toBeNull()
    const dispatch = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(dispatch.state).toBe('running') // ⇔ 离开边:最后 pending 决策
    h.db.close()
  })

  it('records explicit rejections the same way (no auto-approval anywhere)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    const approval = service.receiveApproval({ dispatchId: id, payload: 'write' })
    const decided = service.decideApproval({ approvalId: approval.id, approve: false }, 'session:human-1')
    expect(decided.state).toBe('rejected')
    const dispatch = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(dispatch.state).toBe('running')
    h.db.close()
  })

  it('rejects duplicate decisions with ERR_APPROVAL_DECIDED and stale entries with ERR_APPROVAL_NOT_FOUND', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    const approval = service.receiveApproval({ dispatchId: id, payload: 'write' })
    service.decideApproval({ approvalId: approval.id, approve: true }, 'session:human-1')
    expectErrorCode(() => service.decideApproval({ approvalId: approval.id, approve: false }, 'session:human-2'), 'ERR_APPROVAL_DECIDED')
    expectErrorCode(() => service.decideApproval({ approvalId: 'ghost', approve: true }, 'session:human-1'), 'ERR_APPROVAL_NOT_FOUND')
    h.db.close()
  })

  it('keeps the dispatch awaiting while any approval is still pending (multi-pending batch)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    const a1 = service.receiveApproval({ dispatchId: id, payload: 'one' })
    const a2 = service.receiveApproval({ dispatchId: id, payload: 'two' })
    service.decideApproval({ approvalId: a1.id, approve: true }, 'session:human-1')
    let dispatch = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(dispatch.state).toBe('awaiting') // a2 仍 pending
    service.decideApproval({ approvalId: a2.id, approve: true }, 'session:human-1')
    dispatch = h.db.prepare('SELECT state FROM dispatch WHERE id = ?').get(id) as { state: string }
    expect(dispatch.state).toBe('running')
    h.db.close()
  })

  it('lists approvals pending-first (dock order) and rejects unknown projects', async () => {
    const h = await seedHarness()
    const service = h.service()
    const id = await runningDispatch(h)
    const a1 = service.receiveApproval({ dispatchId: id, payload: 'one' })
    const a2 = service.receiveApproval({ dispatchId: id, payload: 'two' })
    service.decideApproval({ approvalId: a1.id, approve: true }, 'session:human-1')
    const listed = service.listApprovals(h.projectId)
    expect(listed.map(row => row.id)).toEqual([a2.id, a1.id]) // pending 前,已决后
    expectErrorCode(() => service.listApprovals('ghost'), 'ERR_PROJECT_NOT_FOUND')
    expectErrorCode(() => service.getDispatches('ghost'), 'ERR_PROJECT_NOT_FOUND')
    expect(service.getDispatches(h.projectId)).toHaveLength(1)
    h.db.close()
  })
})

// ---------------------------------------------------------------------------
// AC-4: 不变式 —— awaiting ⇔ 同 dispatch pending 审批,全路径成立
// ---------------------------------------------------------------------------

describe('AC-4 invariant — awaiting ⇔ pending approval on every transition path', () => {
  /** 库级全量复核:每个 dispatch 行 ⇔ 断言。 */
  function assertInvariant(db: RepoDb): void {
    const rows = db
      .prepare(
        `SELECT d.id, d.state,
           (SELECT COUNT(*) FROM approval_request a WHERE a.dispatch_id = d.id AND a.state = 'pending') AS pending
         FROM dispatch d`,
      )
      .all() as { id: string; state: string; pending: number }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(
        row.state === 'awaiting',
        `dispatch ${row.id}: state=${row.state} pending=${String(row.pending)} (awaiting ⇔ pending)`,
      ).toBe(row.pending > 0)
    }
  }

  it('holds across a full lifecycle with multiple approvals and a guarded ending', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1', 'alpha/2.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    assertInvariant(h.db) // starting ⇔ 0 pending

    service.notifySessionStarted(id, 'sess-1')
    assertInvariant(h.db) // running ⇔ 0 pending

    const a1 = service.receiveApproval({ dispatchId: id, payload: 'one' })
    assertInvariant(h.db) // awaiting ⇔ 1 pending
    const a2 = service.receiveApproval({ dispatchId: id, payload: 'two' })
    assertInvariant(h.db) // awaiting ⇔ 2 pending

    // 终局守卫:pending 未清零时 done/failed 拒绝(无默认决策,不静默失效)。
    expect(() => service.notifyDispatchEnded(id, 'done')).toThrowError(/pending approval/)
    assertInvariant(h.db)

    service.decideApproval({ approvalId: a1.id, approve: true }, 'session:human-1')
    assertInvariant(h.db) // 仍 awaiting ⇔ 1 pending
    service.decideApproval({ approvalId: a2.id, approve: false }, 'session:human-1')
    assertInvariant(h.db) // running ⇔ 0 pending

    const again = service.receiveApproval({ dispatchId: id, payload: 'three' })
    assertInvariant(h.db) // awaiting ⇔ 1 pending(二度进入)
    service.decideApproval({ approvalId: again.id, approve: true }, 'session:human-1')
    const done = service.notifyDispatchEnded(id, 'done')
    expect(done.state).toBe('done')
    assertInvariant(h.db) // done ⇔ 0 pending
    h.db.close()
  })

  it('keeps the invariant when the launch fails (failed ⇔ 0 pending)', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs, () => ({ ok: false, error: 'launch failed' }))
    const service = h.service({ launchPort: port })
    await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    const rows = h.db.prepare("SELECT id FROM dispatch WHERE state = 'failed'").all() as { id: string }[]
    expect(rows).toHaveLength(1)
    expect(countPendingApprovals(h.db, rows[0]?.id as string)).toBe(0)
    h.db.close()
  })
})

// ---------------------------------------------------------------------------
// AC-5: 事件 —— dispatch_updated / approval_received 批量通道形态
// ---------------------------------------------------------------------------

describe('AC-5 events — dispatch_updated / approval_received through the batch sink', () => {
  it('emits one batch per verb call: starting events, then post-launch states', async () => {
    const h = await seedHarness()
    const port = stubPort(h.launchInputs)
    const service = h.service({ launchPort: port })
    h.batches.length = 0
    await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1', 'alpha/2.1'] }, 'kernel')
    expect(h.batches).toHaveLength(1) // 单动词单批(批量通道)
    const batch = h.batches[0] as WorkbenchEvent[]
    expect(batch).toHaveLength(4) // 2× starting + 2× running
    expect(batch.filter(event => event.type === 'dispatch_updated')).toHaveLength(4)
    const states = batch.filter(event => event.type === 'dispatch_updated').map(event => (event as { state: string }).state)
    expect(states).toEqual(['starting', 'starting', 'running', 'running'])
    for (const event of batch) {
      if (event.type === 'dispatch_updated') {
        expect(event.projectId).toBe(h.projectId)
        expect(event.taskKey).toMatch(/^alpha\//)
      }
    }
    h.db.close()
  })

  it('emits no events for the blocked union (nothing happened)', async () => {
    const h = await seedHarness()
    h.checkArtifacts.mockReturnValue({ stage: 'tasks', satisfied: false, missing: [missingItem('prd/prd-spec.md')] })
    const service = h.service()
    h.batches.length = 0
    await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')
    expect(h.batches).toHaveLength(0)
    h.db.close()
  })

  it('emits approval_received plus the awaiting transition on intake, and dispatch_updated on the deciding resume', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    service.notifySessionStarted(id, 'sess-1')

    h.batches.length = 0
    const approval = service.receiveApproval({ dispatchId: id, payload: 'write' })
    const intakeBatch = h.batches[0] as WorkbenchEvent[]
    expect(intakeBatch).toHaveLength(2)
    expect(intakeBatch[0]).toMatchObject({ type: 'dispatch_updated', state: 'awaiting' })
    expect(intakeBatch[1]).toMatchObject({ type: 'approval_received', approvalId: approval.id, taskKey: 'alpha/1.1', projectId: h.projectId })

    h.batches.length = 0
    service.decideApproval({ approvalId: approval.id, approve: true }, 'session:human-1')
    const decideBatch = h.batches[0] as WorkbenchEvent[]
    expect(decideBatch).toHaveLength(1)
    expect(decideBatch[0]).toMatchObject({ type: 'dispatch_updated', state: 'running', dispatchId: id })
    h.db.close()
  })

  it('emits the awaiting state on host notify transitions (single-event batches)', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    h.batches.length = 0
    service.notifySessionStarted(id, 'sess-1')
    expect(h.batches[0]?.[0]).toMatchObject({ type: 'dispatch_updated', state: 'running', dispatchId: id })
    service.notifyDispatchEnded(id, 'failed', 'tests exploded')
    expect(h.batches[1]?.[0]).toMatchObject({ type: 'dispatch_updated', state: 'failed' })
    h.db.close()
  })
})

// ---------------------------------------------------------------------------
// IPC 面 — 通道路由 + 形状校验 + 错误封装 + 装配缺省
// ---------------------------------------------------------------------------

describe('IPC face — routing, shape validation, envelope passthrough, assembly defaults', () => {
  const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

  function install(services: WorkbenchVerbServices): Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown> {
    const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
    const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
    installWorkbenchVerbs(registrar, services, {
      sink: () => {},
      subscribe: () => {},
      unsubscribe: () => {},
      get size() { return 0 },
    })
    return handlers
  }

  function stubServices(): WorkbenchVerbServices {
    return {
      dispatchTasks: vi.fn(() => Promise.resolve({ dispatched: [] })),
      redispatch: vi.fn(() => Promise.resolve({ dispatched: [] })),
      getDispatches: vi.fn(() => []),
      listApprovals: vi.fn(() => []),
      decideApproval: vi.fn(() => ({ id: 'a-1', state: 'approved' })),
    } as unknown as WorkbenchVerbServices
  }

  it('routes the five dispatch verbs on their own whitelisted channels', () => {
    const handlers = install(stubServices())
    for (const channel of [
      WORKBENCH_VERB_CHANNELS.dispatchTasks,
      WORKBENCH_VERB_CHANNELS.redispatch,
      WORKBENCH_VERB_CHANNELS.getDispatches,
      WORKBENCH_VERB_CHANNELS.listApprovals,
      WORKBENCH_VERB_CHANNELS.decideApproval,
    ]) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  it('validates argument shapes before reaching the service', async () => {
    const services = stubServices()
    const handlers = install(services)
    // 形状错 = 同步 throw,封装为 ERR_WORKBENCH_DB envelope(detail 携带原文),
    // 不达服务面(下方 not.toHaveBeenCalled 钉定)。
    expect(() =>
      (handlers.get(WORKBENCH_VERB_CHANNELS.dispatchTasks) as (e: unknown, ...a: unknown[]) => unknown)(OWNED, { projectId: 'p-1', taskKeys: 'alpha/1.1' }, 'kernel'),
    ).toThrow(/input\.taskKeys must be a non-empty array/)
    expect(() =>
      (handlers.get(WORKBENCH_VERB_CHANNELS.dispatchTasks) as (e: unknown, ...a: unknown[]) => unknown)(OWNED, { projectId: 'p-1', taskKeys: ['alpha/1.1'], acknowledgeMissing: 'yes' }, 'kernel'),
    ).toThrow(/acknowledgeMissing must be a boolean/)
    expect(() =>
      (handlers.get(WORKBENCH_VERB_CHANNELS.decideApproval) as (e: unknown, ...a: unknown[]) => unknown)(OWNED, { approvalId: 'a-1', approve: 'true' }, 'kernel'),
    ).toThrow(/approve must be a boolean/)
    expect(services.dispatchTasks).not.toHaveBeenCalled()
    expect(services.decideApproval).not.toHaveBeenCalled()
  })

  it('maps domain rejections to the { code, message } envelope verbatim', async () => {
    const h = await seedHarness()
    const service = h.service()
    const dispatched = dispatchedOf(await service.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')) as { id: string }[]
    const id = dispatched[0]?.id as string
    service.notifySessionStarted(id, 'sess-1')
    const approval = service.receiveApproval({ dispatchId: id, payload: 'write' })
    service.decideApproval({ approvalId: approval.id, approve: true }, 'session:human-1')

    const handlers = install({
      decideApproval: vi.fn(() => { throw Object.assign(new Error('already decided'), { code: 'ERR_APPROVAL_DECIDED' }) }),
    } as unknown as WorkbenchVerbServices)
    expect(() =>
      (handlers.get(WORKBENCH_VERB_CHANNELS.decideApproval) as (e: unknown, ...a: unknown[]) => unknown)(OWNED, { approvalId: approval.id, approve: true }, 'kernel'),
    ).toThrow(/\{"code":"ERR_APPROVAL_DECIDED"/)
    h.db.close()
  })

  it('assembly wiring: files projects surface ERR_TASK_NOT_AUTHORITATIVE through the real service assembly', async () => {
    const h = await seedHarness({ authority: 'files' })
    const assembly = createWorkbenchIpcServices({
      db: h.db,
      pluginBundlesPath: 'unused.json',
      userDataPath: join(tmpdir(), `dsh-forge-dispatch-assembly-${String(process.pid)}`),
      onEvents: () => {},
      perception: { retarget: () => {}, rescan: () => {} },
    })
    await expect(assembly.verbs.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_TASK_NOT_AUTHORITATIVE',
    })
    assembly.dispose()
    h.db.close()
  })

  it('assembly default: dispatch refuses to run without the pre-synthesis engine (no self-synthesis path)', async () => {
    const h = await seedHarness()
    const assembly = createWorkbenchIpcServices({
      db: h.db,
      pluginBundlesPath: 'unused.json',
      userDataPath: join(tmpdir(), `dsh-forge-dispatch-assembly-${String(process.pid)}`),
      onEvents: () => {},
      perception: { retarget: () => {}, rescan: () => {} },
    })
    // checkArtifacts seam = 3.2 真实现;alpha feature 目录缺失 → 读侧先拒,
    // 与本断言无关 —— 这里走人为满足检查的面:直接经域面注入的 stub 已在
    // 上文覆盖;装配面断言 = 权威界(files 项目)之上,sqlite 项目的首次
    // 真实派发必经 3.4 引擎,此处以 ERR_FEATURE_NOT_FOUND 证装配缝已接通
    // (checkStageArtifacts = stagesVerbs 真实现,非自由 stub)。
    await expect(assembly.verbs.dispatchTasks({ projectId: h.projectId, taskKeys: ['alpha/1.1'] }, 'kernel')).rejects.toMatchObject({
      code: 'ERR_FEATURE_NOT_FOUND',
    })
    assembly.dispose()
    h.db.close()
  })
})
