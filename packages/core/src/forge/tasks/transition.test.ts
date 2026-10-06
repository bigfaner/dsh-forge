// 任务 2.5 测试 —— transitionTask（人工转移面：tech-design §Interface 1 L110-112 +
// §Interface 10 提前校验零漂移 + db-schema §3.1 人类通道 + §6-26 逃生通道裁决 +
// C3 恢复钩子同族）。断言面：提前校验（human 面目标集）/ reason 必带 / record（from→to，
// actor 由通道推断恒 'ui'）/ →completed·skipped 恢复钩子（前置全满足才 auto-restore，
// 边不删，actor 'core'）/ 相位重算 + 写前增量断言回滚 / 写后事件单发。
import type Database from 'better-sqlite3'
import { TASK_STATUSES } from '@dsh-forge/contracts'
import { describe, expect, it } from 'vitest'
import { addTask } from './add.js'
import { InvalidTransitionError, ReasonRequiredError, TaskNotFoundError } from './errors.js'
import { createTasksHarness, seedFeature, seedTask } from './harness.js'
import { PhaseInvariantViolationError } from './phase-deriver.js'
import { transitionTargets } from './state-machine.js'
import { transitionTask } from './transition.js'

/** 任务记录行直读（from/to/reason/actor 断言面——append-only 时间线） */
interface RecordRow {
  verb: string
  from_status: string | null
  to_status: string | null
  reason: string | null
  actor: string
}

function recordsOf(db: Database.Database, taskId: string): RecordRow[] {
  return db
    .prepare<unknown[], RecordRow>(
      `SELECT verb, from_status, to_status, reason, actor FROM task_records WHERE task_id = ? ORDER BY id`,
    )
    .all(taskId)
}

describe('transitionTask：提前校验 + reason 必带 + record', () => {
  it('pending → skipped：状态更新 + transition 记录（from/to/reason/actor=ui）+ 返回新态快照 + 事件单发', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      const id = seedTask(h.db, 'feat', '1.1')

      const snap = await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: id, toStatus: 'skipped', reason: '人工决策：范围外' },
      )

      expect(snap).toMatchObject({ taskId: id, slug: 'feat', localId: '1.1', taskStatus: 'skipped' })
      expect(snap.updatedAt > snap.createdAt).toBe(true)
      expect(h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(id)?.task_status).toBe('skipped')
      expect(recordsOf(h.db, id)).toEqual([
        { verb: 'transition', from_status: 'pending', to_status: 'skipped', reason: '人工决策：范围外', actor: 'ui' },
      ])
      expect(h.events.emitted).toEqual([{ projectId: h.projectId }])
    } finally {
      h.dispose()
    }
  })

  it('to === current 拒绝：ERR_INVALID_TRANSITION（human 面 = 七态 − 当前态——allowed 为 transitionTargets 单源证物）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      const id = seedTask(h.db, 'feat', '1.1', { status: 'in_progress' })

      const err: unknown = await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: id, toStatus: 'in_progress', reason: '重入' },
      ).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(InvalidTransitionError)
      const e = err as InvalidTransitionError
      expect(e.code).toBe('ERR_INVALID_TRANSITION')
      expect(e.data).toEqual({
        current: 'in_progress',
        to: 'in_progress',
        face: 'human',
        allowed: transitionTargets('in_progress', 'human'), // 与 UI 菜单同源纯函数
      })
      expect(e.data.allowed).toEqual(TASK_STATUSES.filter((s) => s !== 'in_progress'))
      expect(h.events.emitted).toHaveLength(0) // 拒绝路径零事件零残留
    } finally {
      h.dispose()
    }
  })

  it('human 面任意通道：blocked → in_progress（unblock 常规人工决策）合法', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const id = seedTask(h.db, 'feat', '1.1', { status: 'blocked' })

      const snap = await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: id, toStatus: 'in_progress', reason: '人工解锁重派' },
      )
      expect(snap.taskStatus).toBe('in_progress')
    } finally {
      h.dispose()
    }
  })

  it('reason 空白拒绝：ERR_REASON_REQUIRED（空串与纯空白两形）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      const id = seedTask(h.db, 'feat', '1.1')

      for (const reason of ['', '   \t ']) {
        const err: unknown = await transitionTask(
          { store: h.store, events: h.events },
          { projectId: h.projectId, taskId: id, toStatus: 'skipped', reason },
        ).catch((e: unknown) => e)
        expect(err).toBeInstanceOf(ReasonRequiredError)
        expect((err as ReasonRequiredError).code).toBe('ERR_REASON_REQUIRED')
      }
      expect(recordsOf(h.db, id)).toHaveLength(0) // 先于写校验——零记录
    } finally {
      h.dispose()
    }
  })

  it('taskId 未命中：ERR_TASK_NOT_FOUND（data.taskId 附载——UI/RPC 面 id 直查路径）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      seedTask(h.db, 'feat', '1.1')
      const err: unknown = await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: 'no-such-id', toStatus: 'skipped', reason: 'x' },
      ).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(TaskNotFoundError)
      const e = err as TaskNotFoundError
      expect(e.code).toBe('ERR_TASK_NOT_FOUND')
      expect(e.data.taskId).toBe('no-such-id')
    } finally {
      h.dispose()
    }
  })
})

describe('transitionTask 恢复钩子（C3——与 submitTask 钩子同族）', () => {
  it('→ completed：blocked 后继前置全满足 → auto-restore（blocked→pending + auto-restore 记录 actor=core，边不删）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const fix = seedTask(h.db, 'feat', '1.1', { status: 'in_progress' })
      const waiter = seedTask(h.db, 'feat', '1.2', { status: 'blocked' })
      h.db.prepare(
        `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
         VALUES (?, ?, 'manual', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ).run(waiter, fix)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: fix, toStatus: 'completed', reason: '人工结案' },
      )

      const w = h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(waiter)
      expect(w?.task_status).toBe('pending') // 恢复钩子：前置全满足 → blocked→pending
      expect(recordsOf(h.db, waiter)).toEqual([
        { verb: 'auto-restore', from_status: 'blocked', to_status: 'pending', reason: null, actor: 'core' },
      ])
      // 边持久不删（§6-5——满足 = 读时派生）
      const edge = h.db
        .prepare<unknown[], { task_id: string; prerequisite_id: string }>(
          `SELECT task_id, prerequisite_id FROM task_edges WHERE task_id = ? AND prerequisite_id = ?`,
        )
        .get(waiter, fix)
      expect(edge).toBeDefined()
      expect(h.events.emitted).toHaveLength(1) // 单写闭包单事件（恢复同事务）
    } finally {
      h.dispose()
    }
  })

  it('→ skipped：同挂恢复钩子（满足集 {completed, skipped} 双终态）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const skipMe = seedTask(h.db, 'feat', '1.1', { status: 'pending' })
      const waiter = seedTask(h.db, 'feat', '1.2', { status: 'blocked' })
      h.db.prepare(
        `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
         VALUES (?, ?, 'manual', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ).run(waiter, skipMe)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: skipMe, toStatus: 'skipped', reason: '范围裁撤' },
      )
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(waiter)?.task_status,
      ).toBe('pending')
    } finally {
      h.dispose()
    }
  })

  it('前置未全满足不恢复：双前置仅一满足（前置全满足才 auto-restore）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const p1 = seedTask(h.db, 'feat', '1.1', { status: 'in_progress' })
      const p2 = seedTask(h.db, 'feat', '1.2', { status: 'pending' })
      const waiter = seedTask(h.db, 'feat', '1.3', { status: 'blocked' })
      const ins = h.db.prepare(
        `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
         VALUES (?, ?, 'manual', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      )
      ins.run(waiter, p1)
      ins.run(waiter, p2)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: p1, toStatus: 'completed', reason: '先结一项' },
      )
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(waiter)?.task_status,
      ).toBe('blocked') // p2 仍 pending——不恢复
      expect(recordsOf(h.db, waiter)).toHaveLength(0)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: p2, toStatus: 'skipped', reason: '第二前置完成' },
      )
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(waiter)?.task_status,
      ).toBe('pending') // 链式：最后一前置终态 → 恢复
    } finally {
      h.dispose()
    }
  })

  it('→ rejected：满足集外（§6-4 rejected 不满足）——不触发恢复', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const rej = seedTask(h.db, 'feat', '1.1', { status: 'in_progress' })
      const waiter = seedTask(h.db, 'feat', '1.2', { status: 'blocked' })
      h.db.prepare(
        `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
         VALUES (?, ?, 'manual', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ).run(waiter, rej)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: rej, toStatus: 'rejected', reason: '否决' },
      )
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(waiter)?.task_status,
      ).toBe('blocked')
    } finally {
      h.dispose()
    }
  })

  it('非满足集终态（→ in_progress）不触发钩子；后继非 blocked（pending）不动', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const t = seedTask(h.db, 'feat', '1.1', { status: 'blocked' })
      const pendingWaiter = seedTask(h.db, 'feat', '1.2') // pending 后继——钩子只动 blocked
      h.db.prepare(
        `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
         VALUES (?, ?, 'manual', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      ).run(pendingWaiter, t)

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: t, toStatus: 'in_progress', reason: '人工解锁' },
      )
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(pendingWaiter)?.task_status,
      ).toBe('pending')
      expect(recordsOf(h.db, pendingWaiter)).toHaveLength(0)
    } finally {
      h.dispose()
    }
  })

  it('fix 链端到端：addTask block-source 置源 blocked → fix →completed → 源 auto-restore（C2/C3 接力）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'tasks' })
      const deps = { store: h.store, events: h.events }
      await addTask(deps, { projectId: h.projectId, featureSlug: 'feat', title: '源任务', type: 'coding-feature' })
      const fix = await addTask(deps, {
        projectId: h.projectId,
        featureSlug: 'feat',
        title: '修复',
        type: 'coding-fix',
        sourceTask: { slug: 'feat', localId: '1.1' },
        blockSource: true,
      })
      const sourceId = h.db
        .prepare<unknown[], { id: string }>(`SELECT id FROM tasks WHERE slug = 'feat' AND local_id = '1.1'`)
        .get()?.id as string
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(sourceId)?.task_status,
      ).toBe('blocked') // C2：addTask 同事务置源 blocked

      await transitionTask(deps, {
        projectId: h.projectId,
        taskId: fix.taskId,
        toStatus: 'completed',
        reason: 'fix 完成（人工代提交）',
      })

      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(sourceId)?.task_status,
      ).toBe('pending') // C3：源恢复
      const verbs = recordsOf(h.db, sourceId).map((r) => r.verb)
      expect(verbs).toContain('auto-restore')
    } finally {
      h.dispose()
    }
  })
})

describe('transitionTask 相位闭包（§6-29 触发器清单含 transitionTask）', () => {
  it('相位重算：末任务终态 → feature completed（有任务 taskDerived 覆盖）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'in-progress' })
      const id = seedTask(h.db, 'feat', '1.1', { status: 'in_progress' })

      await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: id, toStatus: 'completed', reason: '收尾' },
      )
      expect(
        h.db.prepare<unknown[], { feature_status: string }>(`SELECT feature_status FROM features WHERE slug = 'feat'`).get()
          ?.feature_status,
      ).toBe('completed')
    } finally {
      h.dispose()
    }
  })

  it('写前增量断言：既有漂移 → PhaseInvariantViolationError 整体回滚（零记录零状态变更）', async () => {
    const h = createTasksHarness()
    try {
      seedFeature(h.db, { slug: 'feat', status: 'completed' }) // 漂移：有 pending 任务应推导 'tasks'
      const id = seedTask(h.db, 'feat', '1.1')

      const err: unknown = await transitionTask(
        { store: h.store, events: h.events },
        { projectId: h.projectId, taskId: id, toStatus: 'skipped', reason: 'x' },
      ).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(PhaseInvariantViolationError)
      expect(
        h.db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(id)?.task_status,
      ).toBe('pending') // 回滚——状态未动
      expect(recordsOf(h.db, id)).toHaveLength(0) // 回滚——记录未落
      expect(h.events.emitted).toHaveLength(0)
    } finally {
      h.dispose()
    }
  })
})
