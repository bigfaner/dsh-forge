// 任务 2.4 测试 —— claimTask 全路径（tech-design §Interface 1「动词内聚不变量」claimTask 行 +
// §6-35⑧ 就绪选择三分支 + C1 幂等重入 + 交互一派发链前半 + Z1 出口）。临时 SQLite 夹具
// （harness——db.test.ts 形制）。dispatchPrompt 断言锚定 2.2 组成序（人格段 + 三标签块）与
// BLOCKERS/PHASE_SUMMARY 注入（领取瞬间取数）。
import { afterEach, describe, expect, it } from 'vitest'
import { claimTask } from './claim.js'
import { DependenciesUnmetError, InvalidTransitionError, TaskNotFoundError } from './errors.js'
import { dispatchDigest } from './prompt/digest.js'
import {
  createTasksHarness,
  seedEdge,
  seedFeature,
  seedLink,
  seedProposal,
  seedRecord,
  seedTask,
  type TasksHarness,
} from './harness.js'

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

  it('dispatchPrompt 组成（S2b 任务级收窄 + 无包裹）：单块简报（TASK_ID 自然键 + BLOCKERS 快照 + 结算出口）——无人格段/约束块/类型策略段（agent 级内容迁 persona）', async () => {
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
    // S2b 收窄形 + 无包裹：全文 = 单块简报正文；反锚（SC9）
    expect(dispatchPrompt).not.toContain('<task-context>')
    for (const antiAnchor of ['You are', '<constraints>', '<type-policy>', 'Workflow', 'Quality gate sequence']) {
      expect(dispatchPrompt).not.toContain(antiAnchor)
    }
    expect(dispatchPrompt).toContain('TASK_ID: f/2.1')
    expect(dispatchPrompt).toContain('BLOCKERS: 1.1 completed')
    expect(dispatchPrompt).not.toContain('Settlement exit')
    // 无前置任务 → 无 BLOCKERS 行
    seedTask(h!.db, 'f', '1.2')
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's' })
    expect(r2.dispatchPrompt).not.toContain('BLOCKERS:')
  })

  it('任务规格内嵌（5.3 dogfood 实证缺陷收口）：TITLE 首行/GOAL/ACCEPTANCE_CRITERIA 入简报——worker 面无 queryTask 时的定义唯一来源（S2b DESCRIPTION 键更名 GOAL）', async () => {
    // 缺陷背景（5.3 SC-M3 走查首跑实证）：简报无任务体 + worker 收窄面禁 queryTask
    // + M3 task_file 列砍除 → worker 三路皆无定义可读 → 全员 blocked（missing-input）。
    // 收口 = dispatchPrompt 内嵌任务规格（tech-design 图 4「角色唯一来源·纯任务规格」兑付）。
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '4.1')
    h!.db.prepare(`UPDATE tasks SET title = ?, task_desc = ?, ac_json = ? WHERE id = 't-f-4.1'`).run(
      '创建 notes.md 并提交',
      '达成：工作区根 notes.md 在场，内容恰好一行：ok',
      JSON.stringify(['notes.md 在场且内容逐字', '四门全绿']),
    )
    const { dispatchPrompt } = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '4.1' }, sessionId: 's' })
    // TITLE 裸值首行（无键前缀）
    expect(dispatchPrompt.split('\n')[0]).toBe('创建 notes.md 并提交')
    expect(dispatchPrompt).toContain(
      '<goal>\n达成：工作区根 notes.md 在场，内容恰好一行：ok\nACCEPTANCE_CRITERIA:\n- notes.md 在场且内容逐字\n- 四门全绿\n</goal>',
    )
    // 任务体在键值行之后——<goal> 段落于 VARS/键值区之后
    expect(dispatchPrompt.indexOf('<goal>')).toBeGreaterThan(dispatchPrompt.indexOf('TASK_ID:'))
    // 无 desc/AC 任务 → 段落省略（M2 形态兼容）
    seedTask(h!.db, 'f', '4.2')
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '4.2' }, sessionId: 's' })
    expect(r2.dispatchPrompt).not.toContain('<goal>')
    expect(r2.dispatchPrompt).not.toContain('ACCEPTANCE_CRITERIA:')
  })

  it('VARS 行透传（vars 注入面）：vars_json 解码入简报键值行——SKIP_EVAL_GATE/fix 链上下文的唯一送达面；键序字母序 + 缺席省行', async () => {
    // 缺陷背景：老形态任务=文件、vars 随文件到达 worker；新形态 db-only + 简报=定义唯一
    // 到达面，vars_json 不入合成 → SKIP_EVAL_GATE / fix 链 SOURCE_FILES 断流。收口 = VARS 行。
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '4.3')
    h!.db.prepare(`UPDATE tasks SET vars_json = ? WHERE id = 't-f-4.3'`).run(
      JSON.stringify({ TEST_SCRIPT: 'just test', SOURCE_FILES: 'src/a.ts,src/b.ts' }),
    )
    const { dispatchPrompt } = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '4.3' }, sessionId: 's' })
    // 键序字母序确定性渲染（同 vars_json 恒同简报——digest 幂等）
    expect(dispatchPrompt).toContain('VARS: SOURCE_FILES=src/a.ts,src/b.ts; TEST_SCRIPT=just test')
    expect(dispatchPrompt.indexOf('VARS:')).toBeGreaterThan(dispatchPrompt.indexOf('TASK_ID:'))
    // 无 vars 任务 → 行省略（M2 形态兼容）
    seedTask(h!.db, 'f', '4.4')
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '4.4' }, sessionId: 's' })
    expect(r2.dispatchPrompt).not.toContain('VARS:')
  })
})

// ─────────────────── expert-squad-forge-2：claim 变量路由（任务变量 expert 键透传档案取用面） ───────────────────

describe('claim 变量路由（expert-squad-forge-2）：任务变量 expert 键透传档案取用面', () => {
  /** 捕获型取用面（记录每笔 claim 的 (taskType, expertKey) 入参——投影返回 undefined 走程序段） */
  function svcCapturing() {
    h ??= createTasksHarness()
    const calls: Array<[string, string | undefined]> = []
    const resolveExpertProfile = async (taskType: string, expertKey?: string) => {
      calls.push([taskType, expertKey])
      return undefined
    }
    return {
      calls,
      claim: (input: Parameters<typeof claimTask>[1]) =>
        claimTask({ store: h!.store, events: h!.events, resolveExpertProfile }, input),
    }
  }

  it('变量在场：第二参收到变量专家键；变量缺席：第二参 undefined（两态）', async () => {
    const s = svcCapturing()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '9.1', { type: 'doc' })
    h!.db.prepare(`UPDATE tasks SET vars_json = ? WHERE id = 't-f-9.1'`).run(JSON.stringify({ expert: 'retro-reviewer' }))
    await s.claim({ projectId: P(), taskRef: { slug: 'f', localId: '9.1' }, sessionId: 's1' })
    seedTask(h!.db, 'f', '9.2', { type: 'doc' })
    await s.claim({ projectId: P(), taskRef: { slug: 'f', localId: '9.2' }, sessionId: 's2' })
    expect(s.calls).toEqual([['doc', 'retro-reviewer'], ['doc', undefined]])
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

  it('fix 优先键（block_source 挂接）：fix 与普通任务同轮就绪 → fix 先领（压过 P0 普通）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fxo', status: 'tasks' })
    seedTask(h!.db, 'fxo', '1.1', { status: 'completed' })
    seedTask(h!.db, 'fxo', 'fix-1', { type: 'coding-fix', sourceTaskId: 't-fxo-1.1' })
    seedEdge(h!.db, 't-fxo-fix-1', 't-fxo-1.1', 'fix-chain')
    seedTask(h!.db, 'fxo', '1.2', { createdAt: '2026-01-01T00:00:01.000Z' })
    h!.db.prepare(`UPDATE tasks SET priority = 'P0' WHERE local_id = '1.2' AND slug = 'fxo'`).run()
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task).toMatchObject({ localId: 'fix-1', taskStatus: 'in_progress' })
  })

  it('不跨轮饿死：fix 被领走（in_progress）后下一轮普通任务照常领出', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fxo', status: 'tasks' })
    seedTask(h!.db, 'fxo', '1.1', { status: 'completed' })
    seedTask(h!.db, 'fxo', 'fix-1', { type: 'coding-fix', sourceTaskId: 't-fxo-1.1' })
    seedEdge(h!.db, 't-fxo-fix-1', 't-fxo-1.1', 'fix-chain')
    seedTask(h!.db, 'fxo', '1.2', { createdAt: '2026-01-01T00:00:01.000Z' })
    expect((await claim({ projectId: P(), sessionId: 's' })).task?.localId).toBe('fix-1')
    // 同会话重入回领 fix-1（C1）→ 换会话盲选：fix 已不在 pending 就绪集 → 1.2
    expect((await claim({ projectId: P(), sessionId: 's2' })).task?.localId).toBe('1.2')
  })

  it('disc-N 非 fix：不享受 fix 优先键（与普通任务同 priority → 创建序）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'dxo', status: 'tasks' })
    seedTask(h!.db, 'dxo', '1.1', { createdAt: '2026-01-01T00:00:02.000Z' })
    seedTask(h!.db, 'dxo', 'disc-1', { type: 'doc', sourceTaskId: 't-dxo-1.1', createdAt: '2026-01-01T00:00:03.000Z' })
    seedTask(h!.db, 'dxo', '1.2', { createdAt: '2026-01-01T00:00:01.000Z' })
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task?.localId).toBe('1.2')
  })

  it('分支延续优先于 fix 优先键：延续后继（普通）胜过全局池 fix（§6-35⑧ 序：延续 → fix → priority → 创建序）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'mix', status: 'tasks' })
    seedTask(h!.db, 'mix', '1.1', { status: 'completed', createdAt: '2026-01-01T00:00:05.000Z' })
    seedTask(h!.db, 'mix', '1.2', { createdAt: '2026-01-01T00:00:02.000Z' }) // 延续候选：普通
    seedEdge(h!.db, 't-mix-1.2', 't-mix-1.1')
    seedTask(h!.db, 'mix', '2.1', { status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' })
    seedTask(h!.db, 'mix', 'fix-1', { type: 'coding-fix', sourceTaskId: 't-mix-2.1', createdAt: '2026-01-01T00:00:01.000Z' })
    seedEdge(h!.db, 't-mix-fix-1', 't-mix-2.1', 'fix-chain')
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task?.localId).toBe('1.2')
  })

  it('延续后继集内 fix 先选：锚点多就绪后继时 fix 后继胜出（创建序兜底时普通创建早仍被 fix 压过）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'anc', status: 'tasks' })
    seedTask(h!.db, 'anc', '1.1', { status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' })
    seedTask(h!.db, 'anc', '1.2', { createdAt: '2026-01-01T00:00:01.000Z' }) // 普通后继（创建早）
    seedEdge(h!.db, 't-anc-1.2', 't-anc-1.1')
    seedTask(h!.db, 'anc', 'fix-1', { type: 'coding-fix', sourceTaskId: 't-anc-1.1', createdAt: '2026-01-01T00:00:02.000Z' })
    seedEdge(h!.db, 't-anc-fix-1', 't-anc-1.1', 'fix-chain')
    const r = await claim({ projectId: P(), sessionId: 's' })
    expect(r.task?.localId).toBe('fix-1')
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
    const r = await claim({ projectId: P(), source: { kind: 'feature', slug: 'fa' }, sessionId: 's' })
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
    expect(r).toEqual({ task: null, dispatchPrompt: '', persona: '', digest: '', reclaimed: false })
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
    expect(r).toEqual({ task: null, dispatchPrompt: '', persona: '', digest: '', reclaimed: false })
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
    expect(r).toEqual({ task: null, dispatchPrompt: '', persona: '', digest: '', reclaimed: false })
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

describe('AC（2.4）claimTask 容器双轨：容器限定盲选 + dispatchPrompt SOURCE 语境行', () => {
  it('proposal 容器限定盲选：只扫该 proposal 就绪池（feature 任务不被领）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fa', status: 'tasks' })
    seedTask(h!.db, 'fa', '9.9') // feature 侧就绪候选（更早创建）
    seedProposal(h!.db, { slug: 'pa', mode: 'blitz' })
    seedTask(h!.db, 'pa', '1.1', { kind: 'proposal', mode: 'blitz', createdAt: '2026-01-02T00:00:00.000Z' })
    const r = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'pa' }, sessionId: 's' })
    expect(r.task).toMatchObject({ slug: 'pa', localId: '1.1', taskStatus: 'in_progress' })
    // feature 侧不被打扰
    expect(rows(`SELECT task_status FROM tasks WHERE slug = 'fa'`)).toEqual([{ task_status: 'pending' }])
  })

  it('成链撞键（feature 与 proposal 同 slug X）：kind 判别限定——feature 限定领 feature 侧 / proposal 限定领 proposal 侧', async () => {
    const claim = svc()
    seedProposal(h!.db, { slug: 'X', mode: 'blitz' })
    seedFeature(h!.db, { slug: 'X', status: 'tasks' })
    seedTask(h!.db, 'X', '1.1', { createdAt: '2026-01-01T00:00:00.000Z' }) // feature 侧
    seedTask(h!.db, 'X', '1.2', { kind: 'proposal', mode: 'blitz', createdAt: '2026-01-02T00:00:00.000Z' }) // proposal 侧
    const byFeature = await claim({ projectId: P(), source: { kind: 'feature', slug: 'X' }, sessionId: 's1' })
    expect(byFeature.task).toMatchObject({ source: { kind: 'feature', slug: 'X' }, localId: '1.1' })
    const byProposal = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'X' }, sessionId: 's2' })
    expect(byProposal.task).toMatchObject({ source: { kind: 'proposal', slug: 'X' }, localId: '1.2' })
  })

  it('容器限定缺席容器（proposal 无任务）→ Z1 出口（纯读零写入）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fa', status: 'tasks' })
    seedTask(h!.db, 'fa', '1.1')
    const r = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'ghost-p' }, sessionId: 's' })
    expect(r).toEqual({ task: null, dispatchPrompt: '', persona: '', digest: '', reclaimed: false })
    expect(h!.events.emitted).toEqual([])
  })

  it('dispatchPrompt SOURCE 容器语境行（任务带容器出厂）：feature/proposal 两形 + 行序紧随 TASK_ID', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    const rf = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's' })
    expect(rf.dispatchPrompt).toContain('SOURCE: feature f')
    expect(rf.dispatchPrompt.indexOf('SOURCE: feature f')).toBeGreaterThan(rf.dispatchPrompt.indexOf('TASK_ID: f/1.1'))
    expect(rf.dispatchPrompt.indexOf('TYPE:')).toBeGreaterThan(rf.dispatchPrompt.indexOf('SOURCE: feature f'))

    seedProposal(h!.db, { slug: 'pp', mode: 'blitz' })
    seedTask(h!.db, 'pp', '1.1', { kind: 'proposal', mode: 'blitz' })
    const rp = await claim({ projectId: P(), taskRef: { slug: 'pp', localId: '1.1' }, sessionId: 's' })
    expect(rp.dispatchPrompt).toContain('SOURCE: proposal pp')
    // 律四：proposal 容器无相位域——不注入 PHASE_SUMMARY
    expect(rp.dispatchPrompt).not.toContain('PHASE_SUMMARY:')
    // 幂等重入（proposal 任务）照常：reclaimed=true + SOURCE 行在场
    const again = await claim({ projectId: P(), taskRef: { slug: 'pp', localId: '1.1' }, sessionId: 's' })
    expect(again.reclaimed).toBe(true)
    expect(again.dispatchPrompt).toContain('SOURCE: proposal pp')
  })

  it('proposal 容器 claim：相位域零参与（features 恒空）+ 相位守卫不触发', async () => {
    const claim = svc()
    seedProposal(h!.db, { slug: 'zp', mode: null })
    seedTask(h!.db, 'zp', '1.1', { kind: 'proposal', mode: null })
    const r = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'zp' }, sessionId: 's' })
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(rows(`SELECT * FROM features`)).toEqual([])
    expect(rows(`SELECT COUNT(*) AS n FROM task_session_links`)).toEqual([{ n: 1 }])
  })

  it('容器限定盲选重入：本会话领过的他容器 in_progress 不被回领——领 scope 内就绪任务', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'fa', status: 'tasks' })
    seedTask(h!.db, 'fa', '1.1')
    seedProposal(h!.db, { slug: 'pa', mode: 'blitz' })
    seedTask(h!.db, 'pa', '2.2', { kind: 'proposal', mode: 'blitz' })
    // 全池时代先领他容器任务（本会话挂接 in_progress）
    await claim({ projectId: P(), taskRef: { slug: 'fa', localId: '1.1' }, sessionId: 's1' })
    // scoped 盲选：不得回领 fa/1.1，应领 pa/2.2
    const r = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'pa' }, sessionId: 's1' })
    expect(r.task).toMatchObject({ slug: 'pa', localId: '2.2', taskStatus: 'in_progress' })
    expect(r.reclaimed).toBe(false)
    // fa/1.1 零打扰：仍 in_progress、无第二条 claim 记录
    expect(rows(`SELECT task_status FROM tasks WHERE slug = 'fa'`)).toEqual([{ task_status: 'in_progress' }])
    expect(rows(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = 't-fa-1.1'`)).toEqual([{ n: 1 }])
  })

  it('容器限定盲选重入：scope 内本会话 in_progress 照常回领（reclaimed=true）', async () => {
    const claim = svc()
    seedProposal(h!.db, { slug: 'pa', mode: 'blitz' })
    seedTask(h!.db, 'pa', '1.1', { kind: 'proposal', mode: 'blitz' })
    await claim({ projectId: P(), taskRef: { slug: 'pa', localId: '1.1' }, sessionId: 's1' })
    const again = await claim({ projectId: P(), source: { kind: 'proposal', slug: 'pa' }, sessionId: 's1' })
    expect(again.task).toMatchObject({ slug: 'pa', localId: '1.1' })
    expect(again.reclaimed).toBe(true)
  })
})

// ── S3（run-tasks-host-command）：adopt 定向领取 + 循环来源标记（AC1/AC4——忽略 links、
//    interrupted → in_progress 恢复边、claim 记录 loop_sourced 持久痕迹） ──

describe('S3 claimTask adopt 定向领取（忽略 session links）', () => {
  it('links 异会话在场 → adopt 精确领目标（接管他会话 in_progress，reclaimed=true）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' }) // adopt 目标（他会话持有）
    seedTask(h!.db, 'f', '2.2', { status: 'in_progress' }) // links 干扰项（本会话挂接）
    seedLink(h!.db, 't-f-2.2', 's-loop')
    const r = await claim({
      projectId: P(),
      adopt: { slug: 'f', localId: '2.1' },
      sessionId: 's-loop',
    })
    // adopt 忽略 links：不回领本会话挂接的 2.2，直取 2.1（接管——reclaimed 幂等重入形）
    expect(r.task).toMatchObject({ slug: 'f', localId: '2.1', taskStatus: 'in_progress' })
    expect(r.reclaimed).toBe(true)
    // links 双行：原挂接 + adopt 会话 upsert（主会话真实 id 挂接——GUI jump 零适配）
    expect(rows(`SELECT task_id, session_id FROM task_session_links ORDER BY task_id`)).toEqual([
      { task_id: 't-f-2.1', session_id: 's-loop' },
      { task_id: 't-f-2.2', session_id: 's-loop' },
    ])
  })

  it('interrupted 任务 adopt → in_progress（矩阵新边——循环定向恢复领取；from=interrupted 记录）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'interrupted' })
    const r = await claim({
      projectId: P(),
      adopt: { slug: 'f', localId: '2.1' },
      sessionId: 's-owner',
      loopSourced: true,
    })
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(r.reclaimed).toBe(false) // 状态转移（非重入）
    expect(rows(`SELECT from_status, to_status FROM task_records WHERE task_id = 't-f-2.1'`)).toEqual([
      { from_status: 'interrupted', to_status: 'in_progress' },
    ])
  })

  it('adopt 目标未命中 → ERR_TASK_NOT_FOUND；守卫照常（依赖未满足即拒——一切 claim 路径）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    const err = await claim({ projectId: P(), adopt: { slug: 'f', localId: '9.9' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(TaskNotFoundError)

    seedTask(h!.db, 'f', '1.1') // pending 前置
    seedTask(h!.db, 'f', '1.2')
    seedEdge(h!.db, 't-f-1.2', 't-f-1.1')
    const unmet = await claim({ projectId: P(), adopt: { slug: 'f', localId: '1.2' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect(unmet).toBeInstanceOf(DependenciesUnmetError)
  })

  it('恢复闭环（AC4——对账 → adopt 径重派）：interrupted 经 adopt+loopSourced 领取后新 claim 记录仍带标记', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'in-progress' })
    seedTask(h!.db, 'f', '2.1', { status: 'interrupted' })
    seedRecord(h!.db, 't-f-2.1', { verb: 'claim', loopSourced: true })
    seedRecord(h!.db, 't-f-2.1', { verb: 'transition', from: 'in_progress', to: 'interrupted', actor: 'core' })
    await claim({ projectId: P(), adopt: { slug: 'f', localId: '2.1' }, sessionId: 's-owner', loopSourced: true })
    // 重启再对账判据可续：最新 claim 行 loop_sourced=1（再中断仍可真化）
    expect(
      rows(
        `SELECT loop_sourced FROM task_records WHERE task_id = 't-f-2.1' AND verb = 'claim' ORDER BY id DESC LIMIT 1`,
      ),
    ).toEqual([{ loop_sourced: 1 }])
  })
})

describe('S3 claim 记录循环来源标记（loop_sourced——TASK_RECORD_LOOP_SOURCED 单点定义）', () => {
  it('loopSourced=true → claim 行 loop_sourced=1（盲选径同承载——循环常规领取留痕）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    await claim({ projectId: P(), sessionId: 's-owner', loopSourced: true })
    expect(rows(`SELECT loop_sourced FROM task_records WHERE task_id = 't-f-1.1'`)).toEqual([{ loop_sourced: 1 }])
  })

  it('loopSourced 缺省（工具壳/skill 路线）→ loop_sourced=0（对账谓词不命中——幂等重入不受波及）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    await claim({ projectId: P(), sessionId: 's-skill' })
    expect(rows(`SELECT loop_sourced FROM task_records WHERE task_id = 't-f-1.1'`)).toEqual([{ loop_sourced: 0 }])
  })
})

describe('S1c claimTask 循环独占守卫（exclusivityGuard——目标解析命中即判，拒绝径事务回滚）', () => {
  it('盲选命中独占源行 → 守卫抛错即整体拒绝：零写入（状态/claim 记录/links/事件全零残留）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    const err = await claim({
      projectId: P(),
      sessionId: 's-external',
      exclusivityGuard: (target) => {
        if (target.slug === 'f') throw new Error(`source ${target.slug} is exclusive`)
      },
    }).catch((e: unknown) => e)
    expect((err as Error).message).toContain('source f is exclusive')
    // 单事务回滚——零状态残留（守卫位于一切写入之前的机械证据）
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '1.1'`)).toEqual([{ task_status: 'pending' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
    expect(rows(`SELECT * FROM task_session_links`)).toEqual([])
    expect(h!.events.emitted).toEqual([])
  })

  it('守卫收到目标行投影（sourceKind/slug/localId/taskStatus——判定材料完整）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'pending' })
    const seen: unknown[] = []
    await claim({
      projectId: P(),
      sessionId: 's-external',
      exclusivityGuard: (target) => {
        seen.push(target)
      },
    })
    expect(seen).toEqual([{ sourceKind: 'feature', slug: 'f', localId: '1.1', taskStatus: 'pending' }])
  })

  it('Z1 出口（无可领取目标）→ 守卫不触达（纯读零变更径先于守卫）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    let called = 0
    const r = await claim({
      projectId: P(),
      sessionId: 's-external',
      exclusivityGuard: () => {
        called += 1
      },
    })
    expect(r.task).toBeNull()
    expect(called).toBe(0)
  })

  it('放行径（守卫正常返回）→ claim 照常落全链（状态转移 + claim 记录 + links）', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    const r = await claim({
      projectId: P(),
      sessionId: 's-external',
      exclusivityGuard: () => {}, // 守卫放行（无抛错）——claim 照常
    })
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(rows(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = 't-f-1.1' AND verb = 'claim'`)).toEqual([{ n: 1 }])
    expect(rows(`SELECT session_id FROM task_session_links`)).toEqual([{ session_id: 's-external' }])
  })
})

// ─────────────────── worker-exec-evidence-replay 1.3：重入证据指针透传（Solution③/SC3） ───────────────────

describe('1.3 重入续跑规则段透传：claim 领取瞬间探测证据位 → 简报注入 <resume> 段', () => {
  /** 带 resolveEvidencePointer 注入的 claim（探测结果由夹具控制——pointer+stale 效度态） */
  function svcWithPointer(
    state: { pointer: string; stale: boolean } | undefined,
    seen: { slug: string; localId: string; checkoutRoot?: string }[],
  ) {
    h ??= createTasksHarness()
    return (input: Parameters<typeof claimTask>[1]) =>
      claimTask(
        {
          store: h!.store,
          events: h!.events,
          resolveEvidencePointer: (projectId, slug, localId, checkoutRoot) => {
            expect(projectId).toBe(h!.projectId)
            seen.push({ slug, localId, checkoutRoot })
            return state
          },
        },
        input,
      )
  }

  it('重入派发（幂等重入）：证据位指针在盘 → 简报注入 <resume> 段（变量指称 + 四条规则——中断重入续跑）', async () => {
    const seen: { slug: string; localId: string; checkoutRoot?: string }[] = []
    const claim = svcWithPointer({ pointer: 'logs/f/1.1/resume.md', stale: false }, seen)
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'in_progress' }) // 中断残留——重入径
    const r = await claim({ projectId: P(), sessionId: 's-new', adopt: { slug: 'f', localId: '1.1' } })
    expect(r.reclaimed).toBe(true)
    expect(r.dispatchPrompt).toContain('<resume>')
    expect(r.dispatchPrompt).toContain('{forge.task_logs_dir}/resume.md')
    expect(r.dispatchPrompt).toContain('不得重做已完成部分')
    expect(seen).toEqual([{ slug: 'f', localId: '1.1', checkoutRoot: undefined }]) // 领取瞬间取数——探测按目标行进行
  })

  it('disc 效度戳：checkoutRoot 随 claim 透传探测（效度比对检出根）；stale = true → 简报注入 stale 规则段（只叙不判强制重跑）', async () => {
    const seen: { slug: string; localId: string; checkoutRoot?: string }[] = []
    const claim = svcWithPointer({ pointer: 'logs/f/3.1/resume.md', stale: true }, seen)
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '3.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '3.1' }, sessionId: 's', checkoutRoot: 'Z:\\wt\\f' })
    expect(seen).toEqual([{ slug: 'f', localId: '3.1', checkoutRoot: 'Z:\\wt\\f' }])
    expect(r.dispatchPrompt).toContain('<resume>')
    expect(r.dispatchPrompt).toContain('不得复用')
    expect(r.dispatchPrompt).toContain('只叙不判')
    expect(r.dispatchPrompt).not.toContain('不得重做已完成部分') // fresh 规则段不注入
  })

  it('证据位无指针（undefined）→ 简报零 <resume> 段（首跑形态）；注入面缺席（dep 缺省）同样零段', async () => {
    const seen: { slug: string; localId: string; checkoutRoot?: string }[] = []
    const claim = svcWithPointer(undefined, seen)
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    seedTask(h!.db, 'f', '1.2')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's' })
    expect(r.dispatchPrompt).not.toContain('<resume>')
    // dep 缺省（生产装配方缺席可选注入 = 容忍）——零段且不因探测崩
    const plain = (input: Parameters<typeof claimTask>[1]) => claimTask({ store: h!.store, events: h!.events }, input)
    const r2 = await plain({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's2' })
    expect(r2.dispatchPrompt).not.toContain('<resume>')
  })

  it('指针注入 → claim 记录 digest 覆盖 <resume> 段（同任务有无指针 = 不同简报指纹）', async () => {
    const seen: { slug: string; localId: string; checkoutRoot?: string }[] = []
    const claim = svcWithPointer({ pointer: 'logs/f/2.1/resume.md', stale: false }, seen)
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's' })
    const expected = dispatchDigest(r.dispatchPrompt)
    expect(r.digest).toBe(expected)
    const digestRows = rows(`SELECT dispatch_digest FROM task_records WHERE task_id = 't-f-2.1' AND verb = 'claim'`)
    expect(digestRows).toEqual([{ dispatch_digest: expected }])
  })
})

// ─────────────────── worker-lean-execution 追加轮：任务目录锚点节追加 persona ───────────────────

describe('persona 领取瞬间追加：任务目录锚点节（worker 独享，主会话零感知）', () => {
  /** 带 resolveWorkerContext 注入的 claim（节文本由夹具控制——渲染本体归 worker-context.test） */
  function svcWithWorkerCtx(context: string | undefined) {
    h ??= createTasksHarness()
    return (input: Parameters<typeof claimTask>[1]) =>
      claimTask(
        {
          store: h!.store,
          events: h!.events,
          // 签名要求 string；缺席夹具 coerce ''（生产端 claim.ts 对 undefined/'' 同判缺席——语义等价）
          resolveWorkerContext: (_projectId, _source, _localId) => context ?? '',
        },
        input,
      )
  }

  it('锚点节非空 → persona 尾部空行分隔追加；persona 本体零绝对路径（变量指称不变）', async () => {
    const claim = svcWithWorkerCtx(
      [
        '## 任务目录锚点',
        '本任务领取的目录锚点（绝对路径即取用值；行下注释为该目录职责）：',
        '',
        'WORKSPACE: Z:\\ws',
        '  工作区仓库根——代码、测试与配置所在；检索与改动均在此树内。',
        'feature_dir: Z:\\ws\\.forge\\docs\\features\\f/',
        '  特性文档目录——prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。',
        'forge.project_logs_dir: C:\\ws-home\\logs\\f\\1.1/',
        '  任务运行产物根——按编号命名的各轮证据子文件夹与 resume.md 进度文件所在。',
      ].join('\n'),
    )
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '1.1' }, sessionId: 's' })
    expect(r.persona.endsWith('任务运行产物根——按编号命名的各轮证据子文件夹与 resume.md 进度文件所在。')).toBe(true)
    expect(r.persona).toContain('\n\n## 任务目录锚点')
    // digest 不受 persona 影响（persona 不入简报——分层面）
    expect(r.digest).toBe(dispatchDigest(r.dispatchPrompt))
  })

  it('workerContext 渲染产物注入裸 {{ → claim fail-loud 抛错（expert-squad-forge 1.10——拼接后最终全文防护）', async () => {
    const claimInject = svcWithWorkerCtx('## 任务目录锚点\n\nWORKSPACE: Z:\\ws{{evil}}')
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.4')
    await expect(
      claimInject({ projectId: P(), taskRef: { slug: 'f', localId: '1.4' }, sessionId: 's4' }),
    ).rejects.toThrow(/persona text must not contain bare '\{\{'/)
  })

  it('锚点节空串/dep 缺席 = 形态兼容（零追加——persona 原样）', async () => {
    const claimEmpty = svcWithWorkerCtx('') // 先建 harness（h 惰性初始化）
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.2')
    const r = await claimEmpty({ projectId: P(), taskRef: { slug: 'f', localId: '1.2' }, sessionId: 's2' })
    expect(r.persona).not.toContain('## 任务目录锚点')
    expect(r.persona).not.toContain('WORKSPACE:')
    const plain = (input: Parameters<typeof claimTask>[1]) => claimTask({ store: h!.store, events: h!.events }, input)
    seedTask(h!.db, 'f', '1.3')
    const r2 = await plain({ projectId: P(), taskRef: { slug: 'f', localId: '1.3' }, sessionId: 's3' })
    expect(r2.persona).not.toContain('## 任务目录锚点')
  })
})

// ─────────────────── bug 46f106c5：claim 事务窗口跨 await 并发交错 ───────────────────

describe('claim 事务窗口：档案取用挂起期间并发写动词不抛事务嵌套错误（bug 46f106c5）', () => {
  it('第二笔 claim 在档案取用挂起窗口内进入 → 不抛 SqliteError，两动词均正常落账', async () => {
    h ??= createTasksHarness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const resolveExpertProfile = async () => {
      calls++
      if (calls === 1) await gate // 第一笔 claim 挂在档案取用（模拟 settings 异步读窗口）
      return undefined
    }
    const claim = (input: Parameters<typeof claimTask>[1]) =>
      claimTask({ store: h!.store, events: h!.events, resolveExpertProfile }, input)
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1')
    seedTask(h!.db, 'f', '2.2')

    const p1 = claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's1' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // 让 claim1 进入档案取用挂起窗口
    const r2 = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.2' }, sessionId: 's2' })
    expect(r2.task?.taskStatus).toBe('in_progress')
    release()
    const r1 = await p1
    expect(r1.task?.taskStatus).toBe('in_progress')

    // 两动词均落账：各自一条 claim 记录 + 会话链接 + 状态转移
    expect(
      rows(`SELECT COUNT(*) AS n FROM task_records WHERE verb = 'claim' AND task_id IN ('t-f-2.1','t-f-2.2')`),
    ).toEqual([{ n: 2 }])
    expect(rows(`SELECT COUNT(*) AS n FROM task_session_links WHERE task_id IN ('t-f-2.1','t-f-2.2')`)).toEqual([
      { n: 2 },
    ])
    expect(rows(`SELECT local_id FROM tasks WHERE task_status = 'in_progress' ORDER BY local_id`)).toEqual([
      { local_id: '2.1' },
      { local_id: '2.2' },
    ])
  })
})

// ─────────────────── expert-squad-forge 1.3：claim 两段组装（档案人格段 + 程序段） ───────────────────

describe('persona 两段组装：专家档案取用面注入（expert-squad-forge 1.3）', () => {
  /** 带档案取用面注入的 claim（档案投影由夹具控制——键解析/档案解析归 plugin-forge faces.test） */
  function svcWithExperts(deps: {
    profile?: { name: string; title?: string; personaMd: string } | undefined
    error?: Error
  }) {
    h ??= createTasksHarness()
    let calls = 0
    const resolveExpertProfile = async () => {
      calls++
      if (deps.error !== undefined) throw deps.error
      return deps.profile
    }
    return {
      calls: () => calls,
      claim: (input: Parameters<typeof claimTask>[1]) =>
        claimTask({ store: h!.store, events: h!.events, resolveExpertProfile }, input),
    }
  }

  const PROFILE = {
    name: 'coding-fix',
    title: '缺陷修复专家',
    personaMd: '## 职责\n\n先以失败复现测试钉住根因，再做最小化修复。\n\n## 信条\n\n先通过复现定位根因，再最小化修复。',
  }

  it('档案段 + 程序段组装：身份头/personaMd 在前、核心纪律/质量门禁在后；取用按 task_type 恰一次', async () => {
    const { claim, calls } = svcWithExperts({ profile: PROFILE })
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's' })
    expect(r.persona.startsWith('你是缺陷修复专家。\n\n## 职责')).toBe(true)
    expect(r.persona).toContain('先通过复现定位根因，再最小化修复') // 档案信条
    expect(r.persona).toContain('## 核心纪律') // 程序段恒定
    expect(r.persona).toContain('## 质量门禁')
    expect(r.persona).not.toContain('{{')
    expect(calls()).toBe(1)
    // claim 其余语义零变化（转移 + 记录 + 链接照常）
    expect(r.task?.taskStatus).toBe('in_progress')
    expect(rows(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = 't-f-2.1' AND verb = 'claim'`)).toEqual([
      { n: 1 },
    ])
  })

  it('档案缺失/禁用 fail-loud：取用面抛错（消息含专家键名）→ claim 拒绝、任务留 pending、零写入、无事件', async () => {
    const { claim } = svcWithExperts({ error: new Error('expert not found: ghost-expert') })
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1')
    const err = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's' }).catch(
      (e: unknown) => e,
    )
    expect((err as Error).message).toContain('expert not found: ghost-expert')
    // 单事务整体回滚——任务留 pending，无转移/记录/链接残留
    expect(rows(`SELECT task_status FROM tasks WHERE local_id = '2.1'`)).toEqual([{ task_status: 'pending' }])
    expect(rows(`SELECT * FROM task_records`)).toEqual([])
    expect(rows(`SELECT * FROM task_session_links`)).toEqual([])
    expect(h!.events.emitted).toEqual([])
  })

  it('取用面缺席 = 形态兼容：persona 仅程序段（无档案身份行），claim 照常', async () => {
    const { claim } = svcWithExperts({ profile: undefined })
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's' })
    expect(r.persona).not.toContain('你是')
    expect(r.persona).toContain('## 核心纪律')
    expect(r.persona).toContain('## 质量门禁')
    expect(r.task?.taskStatus).toBe('in_progress')
  })
})

// ─────────────────── 并发双领 TOCTOU（bug 21764a56）：事务体内重读当前态 ───────────────────
describe('并发双领 TOCTOU：A 挂起（档案取用 await）期间 B 领走同任务 → A 恢复后拒绝', () => {
  it('显式 taskRef 径：B 转移 pending → in_progress 后 A 恢复 → ERR_INVALID_TRANSITION，无双 claim 记录/无双链接', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '1.1', { status: 'completed' })
    seedTask(h!.db, 'f', '2.1')
    seedEdge(h!.db, 't-f-2.1', 't-f-1.1')
    // 复现交错：A 目标解析读到 pending 后在档案取用 await 窗口挂起，B 同步完成同任务 claim
    const err = await claimTask(
      {
        store: h!.store,
        events: h!.events,
        resolveExpertProfile: () => {
          void claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-b' })
          return Promise.resolve(undefined)
        },
      },
      { projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-a' },
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(InvalidTransitionError)
    expect((err as InvalidTransitionError).code).toBe('ERR_INVALID_TRANSITION')
    expect((err as InvalidTransitionError).data.current).toBe('in_progress')
    // 仅 B 一条 claim 记录 + 一条会话链接（无重复 claim / 双链接）
    expect(
      rows(`SELECT session_id FROM task_records WHERE task_id = 't-f-2.1' AND verb = 'claim'`),
    ).toEqual([{ session_id: 's-b' }])
    expect(rows(`SELECT session_id FROM task_session_links WHERE task_id = 't-f-2.1'`)).toEqual([
      { session_id: 's-b' },
    ])
    // 事件仅 B 的领取单发（A 拒绝零写入零事件）
    expect(h!.events.emitted).toEqual([{ projectId: P() }])
  })

  it('幂等重入不受波及：快照即 in_progress（无漂移）的显式 taskRef 重入照常 reclaimed=true', async () => {
    const claim = svc()
    seedFeature(h!.db, { slug: 'f', status: 'tasks' })
    seedTask(h!.db, 'f', '2.1', { status: 'in_progress' })
    seedLink(h!.db, 't-f-2.1', 's-a')
    const r = await claim({ projectId: P(), taskRef: { slug: 'f', localId: '2.1' }, sessionId: 's-a' })
    expect(r.reclaimed).toBe(true)
    expect(r.task?.taskStatus).toBe('in_progress')
  })
})
