// 任务 2.6 测试 —— taskDetail（tech-design §Interface 1 taskDetail「全量水化」：records
// 时间线（verb/from→to/reason/summary/gate/commit/digest）/prerequisites/waitingOnMe/
// sessions 双源分型/actualFiles（files_json→commit 查找）/allowedTransitions
// （transitionTargets(current,'human') 同源——Interface 10 所见即所得）/refs 水化
// （vars·description 锚点 → feature_documents ∪ proposals docRel 匹配；命中链接态、未命中置灰）。
// git 只读查找经注入桩受控断言（ENOENT/失败同路回退记录语归 git-lookup.test）。
import { afterEach, describe, expect, it } from 'vitest'
import { TASK_STATUSES } from '@dsh-forge/contracts'
import { GIT_LOOKUP_FALLBACK_ENTRY, type GitExecFile } from './git-lookup.js'
import { taskDetail } from './detail.js'
import { TaskNotFoundError } from './errors.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedLink,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

/** git 注入桩（记录调用；受控 stdout/错误） */
function gitSpy(outcome: { stdout?: string; error?: Error & { code?: string | number | null } }) {
  const calls: Array<{ command: string; args: readonly string[]; options: { cwd: string; timeout: number } }> = []
  const execFile: GitExecFile = (command, args, options, callback) => {
    calls.push({ command, args, options })
    if (outcome.error !== undefined) {
      queueMicrotask(() => callback(outcome.error as Error & { code?: string | number | null }, '', ''))
      return
    }
    queueMicrotask(() => callback(null, outcome.stdout ?? '', ''))
  }
  return { calls, execFile }
}

interface DetailDepsOverrides {
  gitExec?: GitExecFile
}

function deps(o: DetailDepsOverrides = {}) {
  h ??= createTasksHarness()
  return {
    store: h!.store,
    resolveWsPath: (projectId: string): string => `C:\\ws-${projectId}`,
    git: { execFile: o.gitExec },
  }
}

/** 全字段任务 + 双前置锚点注册面（feature_documents + proposals docRel 在册） */
function seedFullTask(): string {
  h ??= createTasksHarness()
  const d = h.db
  seedFeature(d, { slug: 'f1', status: 'in-progress' })
  d.prepare(
    `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, priority,
       estimated_time, vars_json, source_task_id, blocked_reason, breaking,
       coverage, complexity, surface_key, surface_type, source_kind, source_id, mode, created_at, updated_at)
     VALUES ('tid-1', 'f1', '2.1', '标题', 'coding-feature', 'in_progress', ?, 'P1', '4h',
       ?, NULL, NULL, 0, 0.9, 'low', 'web', 'web', 'feature', 'f-f1', 'expedition',
       '2026-10-06T08:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
  ).run(
    '描述锚点 docs/features/f1/design/tech-design.md 与未注册 docs/gone/x.md',
    JSON.stringify({ SPEC: 'proposals/p1/proposal.md', NOTE: '非路径自由文本' }),
  )
  // 注册面：feature_documents（docRel 命中 → 链接态 + summary 标题）+ proposals（命中 → 链接态 + title）
  d.prepare(
    `INSERT INTO feature_documents (feature_id, doc_kind, rel_path, summary, created_at, updated_at)
     VALUES ('f-f1', 'tech-design', 'docs/features/f1/design/tech-design.md', '设计文档摘要',
       '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
  ).run()
  d.prepare(
    `INSERT INTO proposals (id, slug, title, proposal_status, rel_path, created_at, updated_at)
     VALUES ('p-1', 'p1', '提案甲', 'accepted', 'proposals/p1/proposal.md',
       '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
  ).run()
  return 'tid-1'
}

describe('AC3 taskDetail：全量水化（TaskCard 全量 + 深字段）', () => {
  it('快照深字段 + 副行水化四件 + allowedTransitions（human = 七态 − 当前态）+ refs 命中/置灰', async () => {
    const taskId = seedFullTask()
    const d = h!.db
    const pre = seedTask(d, 'f1', '1.0', { status: 'completed' })
    const waiter = seedTask(d, 'f1', '3.0')
    seedEdge(d, taskId, pre, 'manual') // 本任务 ← 前置
    seedEdge(d, waiter, taskId, 'fix-chain') // 后继等我
    seedLink(d, taskId, 's-dispatch')
    seedRecord(d, taskId, {
      verb: 'claim',
      digest: 'abc123def456',
      sessionId: 's-dispatch',
      createdAt: '2026-10-06T08:30:00.000Z',
    })
    seedRecord(d, taskId, {
      verb: 'transition',
      from: 'pending',
      to: 'in_progress',
      reason: '人工开工',
      actor: 'ui',
      sessionId: 's-exec',
      createdAt: '2026-10-06T08:40:00.000Z',
    })

    const detail = await taskDetail(deps(), { projectId: h!.projectId, taskId })

    // TaskCard 全量（副行水化四件）
    expect(detail.taskId).toBe('tid-1')
    expect(detail.slug).toBe('f1')
    expect(detail.localId).toBe('2.1')
    expect(detail.prerequisites).toEqual([{ slug: 'f1', localId: '1.0', taskStatus: 'completed' }])
    expect(detail.sessionCount).toBe(2) // s-dispatch（link + record 同会话去重）+ s-exec
    expect(detail.sourceTask).toBeUndefined()
    // 快照深字段
    expect(detail.container).toEqual({ kind: 'feature', slug: 'f1', title: '特性 f1', mode: 'expedition', phase: 'in-progress' })
    expect(detail.taskDesc).toContain('tech-design.md')
    expect(detail.vars).toEqual({ SPEC: 'proposals/p1/proposal.md', NOTE: '非路径自由文本' })
    expect(detail.coverage).toBe(0.9)
    expect(detail.complexity).toBe('low')
    expect(detail.breaking).toBe(false)
    expect(detail.createdAt).toBe('2026-10-06T08:00:00.000Z')
    // records 时间线（自增序；verb/from→to/reason/digest/actor/session 织入）
    expect(detail.records).toHaveLength(2)
    expect(detail.records[0]).toMatchObject({ verb: 'claim', digest: 'abc123def456', sessionId: 's-dispatch' })
    expect(detail.records[1]).toMatchObject({
      verb: 'transition',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      reason: '人工开工',
      actor: 'ui',
      sessionId: 's-exec',
    })
    // waitingOnMe（后继摘要——恢复钩子反查面的读侧呈现）
    expect(detail.waitingOnMe).toEqual([{ slug: 'f1', localId: '3.0', taskStatus: 'pending' }])
    // sessions 双源分型：s-dispatch 双侧参与 → link + record 两卡并存（§6-24④ 不合并）+ s-exec record
    expect(detail.sessions.map((s) => [s.sessionId, s.source])).toEqual([
      ['s-dispatch', 'link'],
      ['s-dispatch', 'record'],
      ['s-exec', 'record'],
    ])
    // allowedTransitions = transitionTargets(in_progress, 'human')——七态 − 当前态（Interface 10 同源）
    expect(detail.allowedTransitions).toEqual(TASK_STATUSES.filter((s) => s !== 'in_progress'))
    // refs 水化：desc 两锚点（命中链接态 + 未命中置灰）+ vars 一锚点（命中提案）；非路径文本不入
    expect(detail.refs).toEqual([
      { docRel: 'docs/features/f1/design/tech-design.md', resolved: true, title: '设计文档摘要' },
      { docRel: 'docs/gone/x.md', resolved: false, title: undefined },
      { docRel: 'proposals/p1/proposal.md', resolved: true, title: '提案甲' },
    ])
    // 无 submit 记录 → actualFiles = []（files/commit 双缺省）
    expect(detail.actualFiles).toEqual([])
  })

  it('completed 任务：副行 actualDurationMs 水化 + allowedTransitions 排除 completed', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const taskId = seedTask(d, 'f1', '1.1', { status: 'completed' })
    seedRecord(d, taskId, { verb: 'claim', createdAt: '2026-10-06T08:00:00.000Z' })
    seedRecord(d, taskId, { verb: 'submit', createdAt: '2026-10-06T09:00:00.000Z' })
    const detail = await taskDetail(deps(), { projectId: h!.projectId, taskId })
    expect(detail.actualDurationMs).toBe(3600_000)
    expect(detail.allowedTransitions).toEqual(TASK_STATUSES.filter((s) => s !== 'completed'))
  })

  it('未知 taskId → ERR_TASK_NOT_FOUND（data.taskId 附载）', async () => {
    h ??= createTasksHarness()
    seedFeature(h!.db, { slug: 'f1' })
    await expect(taskDetail(deps(), { projectId: h!.projectId, taskId: 'nope' })).rejects.toBeInstanceOf(
      TaskNotFoundError,
    )
  })
})

describe('AC3/AC4 actualFiles：files_json → commit 只读 git 查找回填', () => {
  it('最新 submit files_json 在场 → 直接解码（零 git 发起）', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const taskId = seedTask(d, 'f1', '1.1', { status: 'completed' })
    seedRecord(d, taskId, { verb: 'submit', filesJson: '["src/a.ts"]', createdAt: '2026-10-06T08:00:00.000Z' })
    seedRecord(d, taskId, {
      verb: 'submit',
      filesJson: '["src/b.ts","src/c/d.ts"]',
      createdAt: '2026-10-06T09:00:00.000Z',
    })
    const spy = gitSpy({ stdout: 'should-not-run.ts\n' })
    const detail = await taskDetail(deps({ gitExec: spy.execFile }), { projectId: h!.projectId, taskId })
    expect(detail.actualFiles).toEqual(['src/b.ts', 'src/c/d.ts']) // 最新 submit 胜出
    expect(spy.calls).toHaveLength(0)
  })

  it('files 缺省 + commit_hash 在场 → git diff-tree 查找（cwd = resolveWsPath(projectId)）', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const taskId = seedTask(d, 'f1', '1.1', { status: 'completed' })
    // 最新 submit 无 files 有 commit → git 查找；更早 submit 的 files 不抢源（files_json 优先于旧 files）
    seedRecord(d, taskId, { verb: 'submit', filesJson: '["stale.ts"]', createdAt: '2026-10-06T08:00:00.000Z' })
    d.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, summary, files_json,
         gate_json, commit_hash, dispatch_digest, actor, session_id, created_at, updated_at)
       VALUES (?, 'submit', 'in_progress', 'completed', NULL, 's', NULL, NULL, 'deadbeef', NULL,
         'plugin-tool', 's-exec', '2026-10-06T09:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
    ).run(taskId)
    const spy = gitSpy({ stdout: 'src/new.ts\nsrc/deep/x.ts\n' })
    const detail = await taskDetail(deps({ gitExec: spy.execFile }), { projectId: h!.projectId, taskId })
    expect(detail.actualFiles).toEqual(['src/new.ts', 'src/deep/x.ts'])
    expect(spy.calls).toHaveLength(1)
    expect(spy.calls[0]?.options.cwd).toBe(`C:\\ws-${h!.projectId}`)
    expect(spy.calls[0]?.args.at(-1)).toBe('deadbeef')
  })

  it('git 失败（非零退出）→ 同路回退记录语（单元素列表）', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const taskId = seedTask(d, 'f1', '1.1', { status: 'completed' })
    d.prepare(
      `INSERT INTO task_records (task_id, verb, commit_hash, actor, created_at, updated_at)
       VALUES (?, 'submit', 'abc', 'plugin-tool', '2026-10-06T09:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
    ).run(taskId)
    const spy = gitSpy({ error: Object.assign(new Error('exit 128'), { code: 1 }) })
    const detail = await taskDetail(deps({ gitExec: spy.execFile }), { projectId: h!.projectId, taskId })
    expect(detail.actualFiles).toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
  })

  it('生产缺省注入面：git 未注入 → 真实 execFile（临时目录非 git 仓 → 同路回退记录语）', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const taskId = seedTask(d, 'f1', '1.1', { status: 'completed' })
    d.prepare(
      `INSERT INTO task_records (task_id, verb, commit_hash, actor, created_at, updated_at)
       VALUES (?, 'submit', 'abc', 'plugin-tool', '2026-10-06T09:00:00.000Z', '2026-10-06T09:00:00.000Z')`,
    ).run(taskId)
    const detail = await taskDetail(deps(), { projectId: h!.projectId, taskId })
    expect(detail.actualFiles).toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
  })
})

describe('AC3 refs 水化边界（vars·description 锚点提取）', () => {
  it('无 desc/vars → refs = []；同锚点重复声明去重（首次出现序）', async () => {
    h ??= createTasksHarness()
    const d = h!.db
    seedFeature(d, { slug: 'f1' })
    const plain = seedTask(d, 'f1', '1.1')
    const detail0 = await taskDetail(deps(), { projectId: h!.projectId, taskId: plain })
    expect(detail0.refs).toEqual([])

    d.prepare(
      `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, task_desc, vars_json,
         source_kind, source_id, mode, created_at, updated_at)
       VALUES ('tid-2', 'f1', '1.2', 't', 'doc', 'pending', ?, ?, 'feature', 'f-f1', 'expedition',
         '2026-10-06T08:00:00.000Z', '2026-10-06T08:00:00.000Z')`,
    ).run(
      '见 a/b/c.md 与 a/b/c.md 重复',
      JSON.stringify({ X: 'docs/a.md', Y: 'docs/a.md' }),
    )
    const detail = await taskDetail(deps(), { projectId: h!.projectId, taskId: 'tid-2' })
    expect(detail.refs.map((r) => r.docRel)).toEqual(['a/b/c.md', 'docs/a.md'])
    expect(detail.refs.every((r) => r.resolved === false)).toBe(true) // 均未在册 → 置灰
  })
})
