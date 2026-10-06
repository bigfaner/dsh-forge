// 任务 2.4 测试 —— claimTask 全路径（tech-design §Interface 1「动词内聚不变量」claimTask 行 +
// §6-35⑧ 就绪选择三分支 + C1 幂等重入 + 交互一派发链前半 + Z1 出口）。临时 SQLite 夹具
// （harness——db.test.ts 形制）。dispatchPrompt 断言锚定 2.2 组成序（人格段 + 三标签块）与
// BLOCKERS/PHASE_SUMMARY 注入（领取瞬间取数）。
import { afterEach, describe, expect, it } from 'vitest'
import { claimTask } from './claim.js'
import { DependenciesUnmetError, InvalidTransitionError, TaskNotFoundError } from './errors.js'
import { dispatchDigest } from './prompt/digest.js'
import { createTasksHarness, seedEdge, seedFeature, seedTask, type TasksHarness } from './harness.js'

let h: TasksHarness | undefined
afterEach(() => {
  h?.dispose()
  h = undefined
})

function svc() {
  h ??= createTasksHarness()
  return (input: Parameters<typeof claimTask>[1]) => claimTask({ store: h!.store, events: h!.events }, input)
}

const P = () => h!.projectId
const rows = (sql: string, ...args: unknown[]): unknown[] =>
  h!.db.prepare(sql).all(...args) as unknown[]

/** 种终态/活跃态（直写受控初值——updated_at 同步推，供「最近满足」锚定） */
function setStatus(featureSlug: string, localId: string, status: string, updatedAt: string): void {
  h!.db
    .prepare(`UPDATE tasks SET task_status = ?, updated_at = ? WHERE slug = ? AND local_id = ?`)
    .run(status, updatedAt, featureSlug, localId)
}

describe('AC1 claimTask 守卫：依赖全 ∈ {completed, skipped}，未满足 ERR_DEPENDENCIES_UNMET', () => {
  it('前置 pending → 拒绝（data.unmet 带清单：自然键 + 当前状态）；零写入', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    seedTask(h!.db, 'f', '1.2')
    seedEdge(h!.db, 't-f-1.2', 't-f-1.1')
    const err = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's-disp' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(DependenciesUnmetError)
    expect((err as DependenciesUnmetError).code).toBe('ERR_DEPENDENCIES_UNMET')
    expect((err as DependenciesUnmetError).data).toEqual({
      unmet: [{ slug: 'f', localId: '1.1', taskStatus: 'pending' }],
    })
    // 零写入（事务整体回滚）
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.2'`)).toEqual([{ task_status: 'pending' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
    expect(rows(`SELECT * FROM task_session_links`)).toEqual([])
    expect(h!.events.emitted).toEqual([])
  })

  it('rejected 前置不满足（§3.2 满足集排除——依赖路径死锁信号）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'rejected' })
    seedTask(h!.db, 'f', '1.2')
    seedEdge(h!.db, 't-f-1.2', 't-f-1.1')
    const err = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(DependenciesUnmetError)
    expect((err as DependenciesUnmetError).data.unmet).toEqual([
      { slug: 'f', localId: '1.1', taskStatus: 'rejected' },
    ])
  })

  it('前置 completed + skipped 混合全满足 → 放行（满足集两终态）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '1.2', { status: 'skipped' })
    seedTask(h!.db, 'f', '2.1')
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    seedEdge(h!.db, 't-f-2.1', 't-f-1.2')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-disp' })
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(r.reclaimed).toBe(false)
  })
})

describe('AC1 claimTask 全链：转移 + claim 记录（digest）+ 相位重算 + 事件', () => {
  it('pending → in_progress + claim 记录（from/to/digest/actor/派发会话）+ 相位 tasks → in-progress + 事件单发', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '2.1')
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-disp' })
    expect(r.task).toMatchObject({
      taskId: 't-f-2.1',
      slug: 'f',
      localId: '2.1',
      taskStatus: 'in_progress',
    })
    expect(r.reclaimed).toBe(false)
    // claim 记录：digest 落库（全文不入库 §6-11）、actor='plugin-tool'（tool 专属——通道即 actor）、
    // session_id = 派发会话
    const record = rows(
      `SELECT verb, from_status, to_status, dispatch_digest, reason, summary, actor, session_id
       FROM task_records WHERE task_id = 't-f-2.1'`,
    )
    expect(record).toEqual([
      {
        verb: 'claim',
        from_status: 'pending',
        to_status: 'in_progress',
        dispatch_digest: r.digest,
        reason: null,
        summary: null,
        actor: 'plugin-tool',
        session_id: 's-disp',
      },
    ])
    // digest = sha-256(dispatchPrompt 全文) 前 12 hex
    expect(r.digest).toBe(dispatchDigest(r.dispatchPrompt))
    expect(r.digest).toMatch(/^[0-9a-f]{12}$/)
    // 相位重算：pending 池入活跃集 → in-progress
    expect(
      h!.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'f'`).get(),
    ).toEqual({ feature_status: 'in-progress' })
    // 事务提交后单事件（同通道同载荷）
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('dispatchPrompt 组成序（2.2 单源合成）：人格段 + <constraints> + <task-context>（TASK_ID 自然键 + BLOCKERS 快照）+ <type-policy>', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '2.1', { type: 'coding-fix' })
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    const { dispatchPrompt } = await claim({
      projectId: P(),
      taskRef: { slug: 'f', localId: '2.1' },
      sessionId: 's',
    })
    expect(dispatchPrompt).toContain('You are a focused task executor.')
    const constraints = dispatchPrompt.indexOf('<constraints>')
    const taskContext = dispatchPrompt.indexOf('<task-context>')
    const typePolicy = dispatchPrompt.indexOf('<type-policy>')
    expect(constraints).toBeGreaterThan(0)
    expect(taskContext).toBeGreaterThan(constraints)
    expect(typePolicy).toBeGreaterThan(taskContext)
    expect(dispatchPrompt).toContain('TASK_ID: f/2.1')
    expect(dispatchPrompt).toContain('BLOCKERS: 1.1 completed')
    // 无前置任务 → 无 BLOCKERS 行
    seedTask(h!.db, 'f', '1.2')
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's' })
    expect(r2.dispatchPrompt).not.toContain('BLOCKERS:')
  })
})

describe('AC1 就绪选择（§6-35⑧）：分支延续优先 → priority → 创建序', () => {
  it('分支延续优先：最近完成任务的就绪直接后继胜过全局 P0（沿一条分支执行）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'flow', status: 'tasks' })
    seedTask(h!.db, 'flow', '1.1', { status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' })
    seedTask(h!.db, 'flow', '1.2', { createdAt: '2026-01-02T00:00:00.000Z' }) // 全局候选：无依赖 P0
    h!.db.prepare(`UPDATE tasks SET priority = 'P0' WHERE local_id = '1.2' AND slug = 'flow'`).run()
    seedTask(h!.db, 'flow', '2.1', { createdAt: '2026-01-03T00:00:00.000Z' }) // 延续候选：1.1 后继、P2
    h!.db.prepare(`UPDATE tasks SET priority = 'P2' WHERE local_id = '2.1' AND slug = 'flow'`).run()
    seedEdge(h!.db, 't-flow-2.1', 't-flow-1.1')
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task).toMatchObject({ localId: '2.1', taskStatus: 'in_progress' })
    expect(r.reclaimed).toBe(false)
  })

  it('priority 降序：P0 > P1 > P2 > 缺省（无延续时全局选取）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'pri', status: 'tasks' })
    seedTask(h!.db, 'pri', 'a', { createdAt: '2026-01-01T00:00:00.000Z' }) // 缺省 priority
    seedTask(h!.db, 'pri', 'b', { createdAt: '2026-01-02T00:00:00.000Z' })
    seedTask(h!.db, 'pri', 'c', { createdAt: '2026-01-03T00:00:00.000Z' })
    h!.db.prepare(
      `UPDATE tasks SET priority = CASE local_id WHEN 'a' THEN 'P2' WHEN 'b' THEN 'P0' ELSE NULL END WHERE slug = 'pri'`,
    ).run()
    expect((await claim({ projectId: P(), sessionId: 's' })).task?.localId).toBe('b') // P0
    expect((await claim({ projectId: P(), sessionId: 's2' })).task?.localId).toBe('a') // P2（P0 已领走）
  })

  it('创建序 tie-break：同 priority 取 created_at 最早', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'ord', status: 'tasks' })
    seedTask(h!.db, 'ord', 'later', { createdAt: '2026-01-02T00:00:00.000Z' })
    seedTask(h!.db, 'ord', 'earlier', { createdAt: '2026-01-01T00:00:00.000Z' })
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task?.localId).toBe('earlier')
  })

  it('featureSlug 限定：盲选只扫该 feature 就绪池', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fa', status: 'tasks' })
    seedFeature(h!.db, { slug: 'fb', status: 'tasks' })
    seedTask(h!.db, 'fb', '9.9')
    seedTask(h!.db, 'fa', '1.1')
    const r = await claim({ projectId: P(), featureSlug: 'fa', sessionId: 's' })
    expect(r.task).toMatchObject({ slug: 'fa', localId: '1.1' })
  })

  it('就绪集排除前置未满足者：pending 后继不在候选（守卫与就绪集同判定）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'flow', status: 'tasks' })
    seedTask(h!.db, 'flow', '1.1', { status: 'completed' })
    seedTask(h!.db, 'flow', '2.1') // 后继但前置 1.2 未满足 → 不就绪
    seedTask(h!.db, 'flow', '1.2')
    seedEdge(h!.db, 't-flow-2.1', 't-flow-1.1')
    seedEdge(h!.db, 't-flow-2.1', 't-flow-1.2')
    const r = await claim({ projectId: P(), sessionId: 's' })
    // 延续后继不就绪 → 回落全局池：2.1 同样不就绪 → 1.2（唯一无依赖 pending）
    expect(r.task).toMatchObject({ localId: '1.2' })
  })
})

describe('AC2 links upsert-ignore（claim = 唯一写源）+ in_progress 幂等重入', () => {
  it('claim → link 行；同任务同会话重复 claim 幂等（单行）；跨会话累积', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    seedTask(h!.db, 'f', '1.2')
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' }) // 重入
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's2' })
    expect(rows(`SELECT task_id, session_id FROM task_session_links ORDER BY task_id, session_id`)).toEqual([
      { task_id: 't-f-1.1', session_id: 's1' },
      { task_id: 't-f-1.2', session_id: 's2' },
    ])
  })

  it('显式 taskRef 重入：reclaimed=true、无状态转移、第二条 claim 记录 from/to 空、digest 重合成', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    const first = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    expect(first.reclaimed).toBe(false)
    const second = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    expect(second.reclaimed).toBe(true)
    expect(second.task).toMatchObject({ taskId: 't-f-1.1', taskStatus: 'in_progress' })
    // 无状态效应：无 transition 形态记录；claim 记录两条（重入 from/to 空——同 add 形制）
    expect(
      rows(`SELECT verb, from_status, to_status FROM task_records WHERE task_id = 't-f-1.1' ORDER BY id`),
    ).toEqual([
      { verb: 'claim', from_status: 'pending', to_status: 'in_progress' },
      { verb: 'claim', from_status: null, to_status: null },
    ])
    // 同状态重合成 → 同文同 digest（确定性合成）；digest 恒为当前简报指纹
    expect(second.digest).toBe(dispatchDigest(second.dispatchPrompt))
  })

  it('简报重合成 digest 新值：状态变化（PHASE_SUMMARY 消失）→ 重入 digest ≠ 首领', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'ph', status: 'tasks' })
    seedTask(h!.db, 'ph', '1.1', { status: 'completed' })
    seedTask(h!.db, 'ph', '2.1', { status: 'completed' })
    seedTask(h!.db, 'ph', '3.1')
    seedTask(h!.db, 'ph', '3.2')
    seedEdge(h!.db, 't-ph-3.1', 't-ph-2.1')
    const first = await claim({ projectId: P(), taskRef: { slug: 'ph', localId: '3.1' }, sessionId: 's1' })
    expect(first.dispatchPrompt).toContain('PHASE_SUMMARY: docs/features/ph/tasks/records/2.summary.md')
    // 中途同相位兄弟 3.2 完成（直写受控初态）→ maxCompleted=3 → 重入不再注入 PHASE_SUMMARY
    setStatus('ph', '3.2', 'completed', '2026-02-01T00:00:00.000Z')
    const second = await claim({ projectId: P(), taskRef: { slug: 'ph', localId: '3.1' }, sessionId: 's1' })
    expect(second.reclaimed).toBe(true)
    expect(second.dispatchPrompt).not.toContain('PHASE_SUMMARY:')
    expect(second.digest).not.toBe(first.digest)
    // 重入亦写 claim 记录（审计完备——每动词一行）+ 事件发射
    expect(rows(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = 't-ph-3.1'`)).toEqual([{ n: 2 }])
    expect(h!.events.emitted).toEqual([{ projectId: P() }, { projectId: P() }])
  })

  it('盲选重入：links 已含本会话的 in_progress 任务 → reclaimed=true（无 taskRef）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    seedTask(h!.db, 'f', '1.2')
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    const again = await claim({ projectId: P(), sessionId: 's1' }) // 盲选——恢复本会话最近派发
    expect(again.task).toMatchObject({ localId: '1.1' })
    expect(again.reclaimed).toBe(true)
  })

  it('盲选不领他会话 in_progress（双 dispatcher 并发不双派发）：无 pending 就绪 → Z1 出口', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    const r = await claim({ projectId: P(), sessionId: 's2' }) // 他会话盲选：1.1 in_progress 不可领
    expect(r).toEqual({ task: null, dispatchPrompt: '', digest: '', reclaimed: false })
    // 状态零污染：仍 in_progress、links 仍单会话
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT session_id FROM task_session_links`)).toEqual([{ session_id: 's1' }])
  })

  it('盲选不领他会话 in_progress：有其它 pending 就绪 → 领 pending（不双派发不打扰）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    seedTask(h!.db, 'f', '1.2')
    await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's1' })
    const r = await claim({ projectId: P(), sessionId: 's2' })
    expect(r.task).toMatchObject({ localId: '1.2' })
    expect(r.reclaimed).toBe(false)
  })
})

describe('AC3 无就绪任务出口（Z1 信号——run-tasks 循环等待/收工判据）', () => {
  it('空任务集 → { task: null, dispatchPrompt: "", digest: "", reclaimed: false }；纯读零事件', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'prd' })
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r).toEqual({ task: null, dispatchPrompt: '', digest: '', reclaimed: false })
    expect(h!.events.emitted).toEqual([])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
    expect(rows(`SELECT * FROM task_session_links`)).toEqual([])
  })

  it('有 pending 但前置未满足（in_progress 前置不在就绪判定内）→ 无就绪', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' }) // 他会话遗留——非 pending 池
    seedTask(h!.db, 'f', '2.1')
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    const r = await claim({ projectId: P(), sessionId: 's' }) // 本会话无挂接 → 就绪池唯一候选不满足
    expect(r).toEqual({ task: null, dispatchPrompt: '', digest: '', reclaimed: false })
  })

  it('终态集（completed/skipped）无 pending → 无就绪', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'completed' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '1.2', { status: 'skipped' })
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task).toBeNull()
    expect(h!.events.emitted).toEqual([])
  })
})

describe('PHASE_SUMMARY 注入（老 forge PhaseDetect DB 侧平移）', () => {
  it('首个进入新相位（2.x 无 completed）→ 注入 1.summary.md 路径；1.gate 完成不计相位（业务任务排除）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'm2', status: 'tasks' })
    seedTask(h!.db, 'm2', '1.1', { status: 'completed' })
    seedTask(h!.db, 'm2', '1.gate', { status: 'completed' }) // gate 完成——不计 maxCompleted
    seedTask(h!.db, 'm2', '2.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'm2', localId: '2.1' }, sessionId: 's' })
    expect(r.dispatchPrompt).toContain('PHASE_SUMMARY: docs/features/m2/tasks/records/1.summary.md')
  })

  it('相位已进入（同相位已有 completed）→ 不注入；1.x 任务 → 不注入；fix-N → 相位无关不注入', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'm2', status: 'tasks' })
    seedTask(h!.db, 'm2', '1.1', { status: 'completed' })
    seedTask(h!.db, 'm2', '2.1', { status: 'completed' }) // 相位 2 已进入
    seedTask(h!.db, 'm2', '2.2')
    seedEdge(h!.db, 't-m2-2.2', 't-m2-1.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'm2', localId: '2.2' }, sessionId: 's' })
    expect(r.dispatchPrompt).not.toContain('PHASE_SUMMARY:')
    // 1.x（currentPhase=1）与 fix-N（非数值前缀）
    seedFeature(h!.db, { slug: 'g', status: 'tasks' })
    seedTask(h!.db, 'g', '1.1')
    const r1 = await claim({ projectId: P(), taskRef: { slug: 'g', localId: '1.1' }, sessionId: 's' })
    expect(r1.dispatchPrompt).not.toContain('PHASE_SUMMARY:')
    seedTask(h!.db, 'm2', 'fix-1', { type: 'coding-fix', sourceTaskId: 't-m2-2.1' })
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'm2', localId: 'fix-1' }, sessionId: 's' })
    expect(r2.dispatchPrompt).not.toContain('PHASE_SUMMARY:')
    expect(r2.dispatchPrompt).toContain('fix-of m2/2.1') // 谱系标记水化（MARKERS 行）
  })
})

describe('claim 拒绝面（agent 面矩阵先验）与重派', () => {
  it('终态/挂起态显式 claim → ERR_INVALID_TRANSITION（agent 矩阵无出边）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'completed' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '1.2', { status: 'suspended' })
    const errC = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(errC).toBeInstanceOf(InvalidTransitionError)
    const errS = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(errS).toBeInstanceOf(InvalidTransitionError)
    expect((errS as InvalidTransitionError).data.face).toBe('agent')
  })

  it('blocked 显式重派（矩阵边 blocked → in_progress）+ claim 记录 from=blocked', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '1.1', { status: 'blocked' })
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's' })
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(r.reclaimed).toBe(false)
    expect(rows(`SELECT from_status, to_status FROM task_records WHERE task_id = 't-f-1.1'`)).toEqual([
      { from_status: 'blocked', to_status: 'in_progress' },
    ])
  })

  it('taskRef 未命中 → ERR_TASK_NOT_FOUND', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'prd' })
    const err = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '9.9' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(TaskNotFoundError)
  })
})
