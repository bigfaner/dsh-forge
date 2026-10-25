// 装配层测试（bug 548ea94b——机械③/④生产装配断链复核）：与既有 driver.test.ts 直调带桩
// 单测不同，本文件验证 createLoopDriver 依赖注入齐备后，**生产运行路径**会真实落检查点标记：
// checkpoints 面为**落库级测试装配缝**——插件禁 import core 是 src 面边界（boundaries.test
// AC1），测试文件取 core 域服务与 tsconfig rootDir/项目引用冲突（tsconfig.test rootDir 钉
// packages/plugin-forge，跨包相对 import 出界），故按宿主注入形态构造结构兼容域服务：in-memory
// sqlite 承载 + 真实迁移 DDL（core src/forge/workspace/migrations.ts v1 proposals / v5
// implementation_checkpoints 逐字摘录——partial unique index + append-only 双触发器在场）+
// createCheckpointsService 同语义实现（mark 词汇 / wave_seq max+1 自动递增 / 唯一预检 /
// proposals FK 真值预检），经 LoopDriverDeps.checkpoints 结构兼容注入——断言真实落行与唯一
// 约束兜底（重复 append 抛错被 fail-soft 吞、下轮自愈）。DDL 摘录漂移面 = core 迁移单源。
// resolveProposalId/resolveHeadCommit 同 index.ts 装配形态注入——first-pass-complete 与
// review-wave-N 各至少一例真实落行。
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AddTaskInput,
  ClaimTaskResult,
  ForgePluginEvent,
  ForgeTasksService,
  QueryTaskResult,
  TaskCard,
  TaskSnapshot,
  TaskStats,
  TaskStatus,
} from '@dsh-forge/contracts'
import Database from 'better-sqlite3'
import { createLoopDriver } from './driver.js'
import type { LoopCheckpointRowLite, LoopCheckpointSnapshot, LoopCheckpointsFace } from './driver.js'
import type { LoopDriverDeps } from './driver.js'
import { createNarrator } from '../notify/index.js'
import type { NarrationChannel, Narrator } from '../notify/index.js'
import type { ForgeEventSink } from '../events/sink.js'
import type { SpawnWorker, SpawnWorkerHandle } from '../dispatch-core/index.js'
import { resetExclusiveLoopSources } from '../dispatch-core/index.js'

const OWNER = 'owner-session-1'
const PROJECT = 'p-1'
const SOURCE = { kind: 'feature', slug: 'feat-x' } as const

afterEach(() => {
  resetExclusiveLoopSources()
  vi.restoreAllMocks()
})

function snapshot(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    taskId: 't-1',
    slug: 'feat-x',
    localId: '2.5',
    source: { kind: 'feature', slug: 'feat-x' },
    title: 'Fix the thing',
    taskType: 'coding-fix',
    taskStatus: 'in_progress',
    breaking: false,
    complexity: 'high',
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    ...over,
  }
}

function statsOf(over: Partial<Record<TaskStatus, number>> = {}): TaskStats {
  const byStatus: Record<TaskStatus, number> = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    completed: 0,
    skipped: 0,
    rejected: 0,
    suspended: 0,
    interrupted: 0,
    ...over,
  }
  return { total: 1, byStatus, unmetPending: 0 }
}

const NO_TASK: ClaimTaskResult = { task: null, dispatchPrompt: '', persona: 'PERSONA-MATRIX', digest: '', reclaimed: false }

function claimed(localId = '2.5'): ClaimTaskResult {
  return { task: snapshot({ localId }), dispatchPrompt: 'PERSONA + <task-context>', persona: 'PERSONA-MATRIX', digest: 'digestabc123', reclaimed: false }
}

function queryOf(status: TaskStatus): QueryTaskResult {
  return {
    task: snapshot({ taskStatus: status }),
    container: { kind: 'feature', slug: 'feat-x', title: 'feat-x' },
    records:
      status === 'completed'
        ? [{ verb: 'submit', toStatus: 'completed', summary: 'did it', commitHash: 'abc1234', actor: 'plugin-tool', createdAt: '2026-10-11T01:00:00.000Z' }]
        : [],
  }
}

function cardOf(localId: string, over: Partial<TaskCard> = {}): TaskCard {
  return {
    taskId: `card-feat-x-${localId}`,
    slug: 'feat-x',
    localId,
    title: `Task ${localId}`,
    taskType: 'coding-fix',
    taskStatus: 'pending',
    prerequisites: [],
    sessionCount: 0,
    ...over,
  }
}

// ─────────────────────────── 落库级测试装配缝（结构兼容 core createCheckpointsService） ───────────────────────────

/** DDL 逐字摘录（单源 = core src/forge/workspace/migrations.ts：v1 proposals + v5
 *  implementation_checkpoints 含 partial unique index 与 append-only 双触发器——测试缝内
 *  重放真实迁移约束，漂移面在摘录注释锚定单源） */
const SEAM_DDL = [
  `CREATE TABLE proposals (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    proposal_status TEXT NOT NULL DEFAULT 'draft'
                    CONSTRAINT ck_proposals_status CHECK (proposal_status IN
                      ('draft', 'under-review', 'accepted', 'rejected', 'superseded')),
    rel_path        TEXT,
    author          TEXT,
    mode            TEXT CONSTRAINT ck_proposals_mode
                    CHECK (mode IN ('expedition', 'blitz') OR mode IS NULL),
    superseded_by   TEXT REFERENCES proposals(id),
    decided_at      TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)`,
  `CREATE TABLE implementation_checkpoints (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id           TEXT NOT NULL REFERENCES proposals(id),
    mark                  TEXT NOT NULL
                          CONSTRAINT ck_impl_cp_mark CHECK (mark IN
                            ('first-pass-complete', 'retro-done', 'review-wave-N',
                             'stabilized', 'merged', 'derived-to-child')),
    wave_seq              INTEGER,
    created_at            TEXT NOT NULL,
    base_commit_hash      TEXT NOT NULL,
    tasks_total           INTEGER NOT NULL,
    commits_total         INTEGER NOT NULL,
    fixes_total           INTEGER NOT NULL,
    evidence_debts_total  INTEGER NOT NULL
)`,
  `CREATE UNIQUE INDEX uq_impl_cp_milestone ON implementation_checkpoints(proposal_id, mark, wave_seq)
     WHERE mark IN ('first-pass-complete', 'retro-done', 'review-wave-N', 'stabilized', 'merged')`,
  `CREATE INDEX idx_impl_cp_proposal ON implementation_checkpoints(proposal_id, created_at)`,
  `CREATE TRIGGER trg_impl_cp_no_update BEFORE UPDATE ON implementation_checkpoints
BEGIN SELECT RAISE(ABORT, 'implementation_checkpoints: append-only violation (update)'); END`,
  `CREATE TRIGGER trg_impl_cp_no_delete BEFORE DELETE ON implementation_checkpoints
BEGIN SELECT RAISE(ABORT, 'implementation_checkpoints: append-only violation (delete)'); END`,
] as const

/** implementation_checkpoints 存储行读形（snake_case——断言面直读落库行） */
interface SeamStorageRow {
  readonly id: number
  readonly proposal_id: string
  readonly mark: string
  readonly wave_seq: number | null
  readonly created_at: string
  readonly base_commit_hash: string
  readonly tasks_total: number
  readonly commits_total: number
  readonly fixes_total: number
  readonly evidence_debts_total: number
}

const SELECT_ROWS = `SELECT id, proposal_id, mark, wave_seq, created_at, base_commit_hash,
       tasks_total, commits_total, fixes_total, evidence_debts_total
FROM implementation_checkpoints`

/** 落库级 checkpoints 域服务缝（createCheckpointsService 同语义：mark 词汇 CHECK + 服务端
 *  预检、review-wave-N wave_seq 缺省 max+1 自动递增、里程碑唯一预检 + partial unique index
 *  兜底、proposals FK 真值预检、append-only 由触发器承载）。返回面 + 落库直读句柄。 */
function coreCheckpointsDbSeam() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const stmt of SEAM_DDL) db.exec(stmt)
  db.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, created_at, updated_at)
     VALUES ('prop-1', 'feat-x', 'feat-x', 'accepted', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run()

  const MILESTONE_MARKS = new Set(['first-pass-complete', 'retro-done', 'review-wave-N', 'stabilized', 'merged'])
  const MARKS = new Set([...MILESTONE_MARKS, 'derived-to-child'])

  const selectRowById = db.prepare<unknown[], SeamStorageRow>(`${SELECT_ROWS} WHERE id = last_insert_rowid()`)
  const selectByUnique = db.prepare<unknown[], { id: number }>(
    `SELECT id FROM implementation_checkpoints WHERE proposal_id = ? AND mark = ? AND wave_seq IS ?`,
  )
  const insertRow = db.prepare(
    `INSERT INTO implementation_checkpoints
       (proposal_id, mark, wave_seq, created_at, base_commit_hash,
        tasks_total, commits_total, fixes_total, evidence_debts_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const selectAll = db.prepare<unknown[], SeamStorageRow>(`${SELECT_ROWS} WHERE proposal_id = ? ORDER BY created_at, id`)

  const appendCheckpoint = async (input: {
    readonly projectId: string
    readonly proposalId: string
    readonly mark: string
    readonly baseCommitHash: string
    readonly snapshots: LoopCheckpointSnapshot
  }): Promise<SeamStorageRow> => {
    if (!MARKS.has(input.mark)) throw new Error(`未知检查点标记：${input.mark}（词汇外拒写）`)
    // wave_seq：仅 review-wave-N，缺省 max+1 自动递增（首波 = 1）——域侧同语义
    let waveSeq: number | undefined
    if (input.mark === 'review-wave-N') {
      const current = db
        .prepare<unknown[], { max_seq: number | null }>(
          `SELECT MAX(wave_seq) AS max_seq FROM implementation_checkpoints WHERE proposal_id = ? AND mark = 'review-wave-N'`,
        )
        .get(input.proposalId)
      waveSeq = (current?.max_seq ?? 0) + 1
    }
    // proposals FK 真值预检（悬空引用拒绝——零副作用）
    const proposal = db.prepare<unknown[], { id: string }>('SELECT id FROM proposals WHERE id = ?').get(input.proposalId)
    if (proposal === undefined) throw new Error(`proposal 悬空引用拒绝：${input.proposalId} 不存在（检查点零副作用）`)
    // 唯一约束预检（里程碑标记：DDL partial unique index 行为面同源；插件消费面 mark 词汇恒 NULL wave_seq）
    if (MILESTONE_MARKS.has(input.mark)) {
      const existing = selectByUnique.get(input.proposalId, input.mark, waveSeq ?? null)
      if (existing !== undefined) {
        throw new Error(
          `检查点已存在：${input.mark}${waveSeq !== undefined ? `#${String(waveSeq)}` : ''}（proposal ${input.proposalId}）——里程碑标记唯一约束命中`,
        )
      }
    }
    insertRow.run(
      input.proposalId,
      input.mark,
      waveSeq ?? null,
      new Date().toISOString(),
      input.baseCommitHash,
      input.snapshots.tasksTotal,
      input.snapshots.commitsTotal,
      input.snapshots.fixesTotal,
      input.snapshots.evidenceDebtsTotal,
    )
    return selectRowById.get() as SeamStorageRow
  }

  const face: LoopCheckpointsFace = {
    ensureCheckpoint: async (input) => {
      if (MILESTONE_MARKS.has(input.mark)) {
        const existing = selectByUnique.get(input.proposalId, input.mark, null)
        if (existing !== undefined) return { appended: false }
      }
      await appendCheckpoint(input)
      return { appended: true }
    },
    appendCheckpoint,
    listCheckpoints: async (q) => {
      const rows = selectAll.all(q.proposalId)
      return rows
        .map((r): LoopCheckpointRowLite => ({ mark: r.mark, tasksTotal: r.tasks_total, commitsTotal: r.commits_total, fixesTotal: r.fixes_total, evidenceDebtsTotal: r.evidence_debts_total }))
        .filter((r) => q.marks === undefined || q.marks.length === 0 || q.marks.includes(r.mark))
    },
  }

  const rows = (): SeamStorageRow[] => db.prepare<unknown[], SeamStorageRow>(SELECT_ROWS).all() as SeamStorageRow[]
  return { face, appendRaw: appendCheckpoint, db, rows }
}

/** tasks 服务桩（claim 队列 + 完成态 stats；listTasks 返回 created 桶） */
function tasksStub(options: { claim: ClaimTaskResult[]; lists?: TaskCard[] }) {
  const addTaskInputs: AddTaskInput[] = []
  const claimQueue = [...options.claim]
  const shift = <T,>(queue: T[]): T => (queue.length > 1 ? (queue.shift() as T) : (queue[0] as T))
  let statsQueue: TaskStats[] = [statsOf({ completed: 1 })]
  const tasks = {
    claimTask: async () => shift(claimQueue),
    taskStats: async () => shift(statsQueue),
    listTasks: async () => options.lists ?? [],
    queryTask: async () => queryOf('completed'),
    // 1.16 批量结算读面桩（wave 快照数据源——completed lists 投影，commit/债计数零值）
    taskSettlements: async () =>
      (options.lists ?? [])
        .filter((c) => c.taskStatus === 'completed')
        .map((c) => ({
          slug: c.slug,
          localId: c.localId,
          taskType: c.taskType,
          fixDerived: c.sourceTask !== undefined,
          commitHashes: ['abc1234'], // 同 queryOf('completed') 结算记录 commit——快照口径数据源同值
          evidenceDebtCount: 0,
        })),
    addTask: async (input: AddTaskInput) => {
      addTaskInputs.push(input)
      return { taskId: 'retro-uuid', slug: input.source.slug, localId: '9.1', reused: false }
    },
    submitTask: async () => {
      throw new Error('loop must never submit')
    },
    reconcileInterrupted: async () => {
      throw new Error('loop must never reconcile')
    },
  } as unknown as ForgeTasksService
  return {
    tasks,
    addTaskInputs,
    setStats: (q: TaskStats[]) => {
      statsQueue = q
    },
  }
}

function build(options: { claim: ClaimTaskResult[]; stats?: TaskStats[]; lists?: TaskCard[]; face?: LoopCheckpointsFace; seam?: ReturnType<typeof coreCheckpointsDbSeam> }) {
  const calls: Array<{ method: string; text: string }> = []
  const channel: NarrationChannel = {
    notice: async (_sessionId, text) => {
      calls.push({ method: 'notice', text })
    },
    followup: async (_sessionId, text) => {
      calls.push({ method: 'followup', text })
    },
  }
  const narrator: Narrator = createNarrator({ channel })
  const events: ForgePluginEvent[] = []
  const sink: ForgeEventSink = { emit: (e) => events.push(e), prepare: async () => {}, dirOf: () => undefined, remember: () => {} }
  const h = tasksStub({ claim: options.claim, lists: options.lists })
  if (options.stats !== undefined) h.setStats(options.stats)
  const seam = options.seam ?? coreCheckpointsDbSeam()
  let seq = 0
  const spawn: SpawnWorker = async () => {
    seq += 1
    const handle: SpawnWorkerHandle = {
      workerSessionId: `worker-${seq}`,
      result: Promise.resolve({ stopReason: 'completed', output: '' }),
      dispose: async () => {},
    }
    return handle
  }
  // index.ts 装配同形：ctx.forgeCheckpoints 落库级域面（真实 DDL 约束承载）直传注入
  const deps: LoopDriverDeps = {
    projectId: PROJECT,
    tasks: h.tasks,
    spawn,
    narrator,
    events: sink,
    checkpoints: options.face ?? seam.face,
    resolveProposalId: async () => 'prop-1',
    resolveHeadCommit: async () => 'head-9',
    commitLanding: async () => ({ ok: true, branch: 'feat-x' }),
    delays: { backoffBaseMs: 1, patiencePauseMs: 1, quiescenceWindowMs: 1, quiescencePollMs: 1 },
  }
  return { driver: createLoopDriver(deps), h, seam, calls }
}

async function untilSettled(driver: { activeOf(id: string): unknown }): Promise<void> {
  await vi.waitFor(
    () => {
      expect(driver.activeOf(OWNER)).toBeUndefined()
    },
    { timeout: 2000, interval: 5 },
  )
}

describe('机械③/④ · createLoopDriver 生产装配落库级落标记（bug 548ea94b——落库级装配缝）', () => {
  it('first-pass：no-task done 生产路径经 ensure 语义真实落库 first-pass-complete + 派生复盘任务', async () => {
    const built = build({
      claim: [NO_TASK],
      stats: [statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // 真实落行：唯一约束索引下恰一行 + proposal/mark/HEAD 锚/wave_seq NULL/ISO 时钟全在库
    const all = built.seam.rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ proposal_id: 'prop-1', mark: 'first-pass-complete', base_commit_hash: 'head-9', wave_seq: null })
    expect(all[0]?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    // 域服务 list 读面（真实 SQL 时序查询 + 标记过滤）读得同行
    const listed = await (built.seam.face as LoopCheckpointsFace).listCheckpoints({
      projectId: PROJECT,
      proposalId: 'prop-1',
      marks: ['first-pass-complete'],
    })
    expect(listed.map((r) => r.mark)).toEqual(['first-pass-complete'])
    // 复盘任务随标记派生（机械③承接面同轮真实发生）
    expect(built.h.addTaskInputs).toHaveLength(1)
    expect(built.h.addTaskInputs[0]).toMatchObject({ type: 'doc', title: 'first-pass 复盘：feat-x' })
  })

  it('review-wave：coding-fix 任务结算生产路径透传真实落库 review-wave-N（wave_seq 自动递增 = 1）', async () => {
    const built = build({
      claim: [claimed('3.1'), NO_TASK],
      stats: [
        statsOf({ pending: 1 }), // 启动读
        statsOf({ in_progress: 1 }), // claim 领取通知读
        statsOf({ in_progress: 1 }), // 结算核池读
        statsOf({ completed: 1 }), // 次轮 no-task 池读
        statsOf({ completed: 1 }), // 标记快照计数读
        statsOf({ completed: 1 }),
        statsOf({ completed: 1 }),
      ],
      lists: [cardOf('3.1')],
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // review-wave-N 真实落行：wave_seq 缺省域侧自动递增（max+1，首波 = 1）
    const wave = built.seam.rows().filter((r) => r.mark === 'review-wave-N')
    expect(wave).toHaveLength(1)
    expect(wave[0]).toMatchObject({ proposal_id: 'prop-1', base_commit_hash: 'head-9', wave_seq: 1 })
    // 同轮 first-pass 也由生产路径落行（机械③装配同链验证）
    const firstPass = built.seam.rows().filter((r) => r.mark === 'first-pass-complete')
    expect(firstPass).toHaveLength(1)
    expect(firstPass[0]).toMatchObject({ proposal_id: 'prop-1', base_commit_hash: 'head-9', wave_seq: null })
  })
})

describe('落库级唯一约束兜底（DDL partial unique index + append-only 触发器 + fail-soft 自愈）', () => {
  it('重复里程碑 append 被拒：域预检拒绝 + 裸 SQL 命中 partial unique index；append-only UPDATE/DELETE 触发器 ABORT', async () => {
    const seam = coreCheckpointsDbSeam()
    const input = { projectId: PROJECT, proposalId: 'prop-1', mark: 'merged' as const, baseCommitHash: 'head-9', snapshots: { tasksTotal: 1, commitsTotal: 1, fixesTotal: 0, evidenceDebtsTotal: 0 } }
    await seam.face.appendCheckpoint({ ...input, mark: 'review-wave-N' })
    await seam.face.ensureCheckpoint(input)
    // 域侧重复 append（ensure 语义外的裸 append）→ 唯一约束预检拒写零副作用
    await expect(seam.face.ensureCheckpoint(input)).resolves.toEqual({ appended: false })
    await expect(seam.appendRaw(input)).rejects.toThrow(/唯一约束命中/)
    // review-wave-N 裸 append 重复不拒（wave_seq 自动递增——多波各一行，域侧豁免语义）
    await seam.face.appendCheckpoint({ ...input, mark: 'review-wave-N' })
    // 裸 SQL 重复落行（review-wave-N #1 已在场）→ 真实 partial unique index 兜底
    //（UNIQUE constraint failed；NULL wave_seq 行由域侧预检唯一承担——SQLite UNIQUE 视 NULL 互异）
    expect(() =>
      seam.db
        .prepare(
          `INSERT INTO implementation_checkpoints
             (proposal_id, mark, wave_seq, created_at, base_commit_hash, tasks_total, commits_total, fixes_total, evidence_debts_total)
           VALUES ('prop-1', 'review-wave-N', 1, '2026-01-01T00:00:00.000Z', 'head-9', 1, 1, 0, 0)`,
        )
        .run(),
    ).toThrow(/UNIQUE/)
    // append-only 纪律：UPDATE/DELETE 直写 → 触发器 ABORT（流水只追加不可改写）
    expect(() => seam.db.prepare(`UPDATE implementation_checkpoints SET tasks_total = 9`).run()).toThrow(/append-only violation/)
    expect(() => seam.db.prepare(`DELETE FROM implementation_checkpoints`).run()).toThrow(/append-only violation/)
    // 零副作用（约束面内）：库内恰三行——merged 一行 + review-wave-N 两波（wave_seq 1/2）
    const marks = seam.rows().map((r) => r.mark).sort()
    expect(marks).toEqual(['merged', 'review-wave-N', 'review-wave-N'])
    expect(seam.rows().filter((r) => r.mark === 'review-wave-N').map((r) => r.wave_seq)).toEqual([1, 2])
  })

  it('唯一约束命中 fail-soft：落标记拒写被吞（warn 留痕）不影响收口——下一轮在场判定自愈不重派不重落', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seam = coreCheckpointsDbSeam()
    // 模拟唯一约束窄窗口竞态：ensure 在场判定通过后、append 落行前标记行已入库 → 域侧重复
    // append 命中唯一约束预检拒写。装配缝在 ensure 入口先直插行（落库级复现窗口），再绕过
    // 在场判定直走域 append（复现「判定通过、落行被拒」的真实时序）。
    const racyFace: LoopCheckpointsFace = {
      ensureCheckpoint: async (input) => {
        seam.db
          .prepare(
            `INSERT INTO implementation_checkpoints
               (proposal_id, mark, wave_seq, created_at, base_commit_hash, tasks_total, commits_total, fixes_total, evidence_debts_total)
             VALUES (?, ?, NULL, ?, ?, 1, 1, 0, 0)`,
          )
          .run(input.proposalId, input.mark, new Date().toISOString(), input.baseCommitHash)
        await seam.appendRaw(input)
        return { appended: true }
      },
      appendCheckpoint: seam.face.appendCheckpoint.bind(seam.face),
      listCheckpoints: seam.face.listCheckpoints.bind(seam.face),
    }
    const built = build({
      claim: [NO_TASK, NO_TASK],
      stats: [statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 }), statsOf({ completed: 1 })],
      face: racyFace,
      seam,
    })
    await built.driver.start({ source: SOURCE, ownerSessionId: OWNER, parent: {}, worktree: 'Z:\\wt\\feat-x' })
    await untilSettled(built.driver)
    // 拒写被 fail-soft 吞（warn 留痕），循环收口零受阻
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/first-pass mark failed/))
    // 下轮自愈：标记在场判定短路——库内 first-pass-complete 恰一行（唯一约束无重复）、
    // 复盘任务不重派（窄窗口幂等防护：首轮派生成功后标记拒写，次轮在场即不重派）
    expect(built.seam.rows().filter((r) => r.mark === 'first-pass-complete')).toHaveLength(1)
    expect(built.h.addTaskInputs).toHaveLength(1)
    expect(built.h.addTaskInputs[0]).toMatchObject({ type: 'doc', title: 'first-pass 复盘：feat-x' })
  })
})
