// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.3 SC2 性能验收（AC1）：@500 任务三读面（列表/图/详情）≤2s e2e 计时 + EQP 三查询
// 命中索引（与 2.6 单测呼应的 e2e 侧——对 app 实开域库 EXPLAIN QUERY PLAN）。
//   · 造数 = 5.1 直插通道（tech-design §录制-回放：@500 造数与受控初态不经动词——
//     task-loop.db 域账单源，openTaskLoopDbFull 全量形态直插；f84fabfa 账本迁移先例同锚）；
//   · 计时面 = 产品读面单发 invoke（refetchOnce——直读保证，无轮询/重试兜底；首读含
//     IPC 往返 = 概览首屏数据面的 e2e 口径；UI 走查归 5.2）；
//   · EQP = 三条热查询 SQL 常量（task-loop 域导出单源）对实库跑计划断言——SEARCH 命中
//     索引、禁全表 SCAN（PRD Performance：查询计划由断言锁死，防全表扫描回归）。

import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { TaskStatus } from '@dsh-forge/lib-api/labels'
import { TASKS_CHANNELS } from '@dsh-forge/lib-api/channels'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject } from '../../support/rpc.js'
import { projectKeyOf } from '../../../e2e/support/project-key.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { refetchOnce } from '../../support/replay/executor.js'
import { openTaskLoopDbFull } from '../../support/sqlite.js'
import { SQL_TASKS_BY_CONTAINER } from '../../../plugins/task-loop/host/domain/tasks/list.js'
import { RECORDS_BY_TASK_SQL } from '../../../plugins/task-loop/host/domain/tasks/query.js'
import { LINKS_BY_SESSION_SQL } from '../../../plugins/task-loop/host/domain/tasks/session-links.js'

/** SC2 压力上界（PRD Performance：@500 任务——单 feature 30–60 任务为日常形态） */
const TASK_COUNT = 500
/** ≤2s 机械判据（毫秒） */
const PERF_BUDGET_MS = 2_000

/** 三读面计时形态（产品读面单发——dt 含 IPC 往返 + 域直读水化） */
async function timedRefetch<T>(page: Launched['page'], channel: string, payload?: unknown): Promise<{ value: T; ms: number }> {
  const t0 = Date.now()
  const value = await refetchOnce<T>(page, channel, payload)
  return { value, ms: Date.now() - t0 }
}

test('@web-e2e @m2 5.3 SC2：@500 任务列表/图/详情 ≤2s（e2e 计时）+ EQP 三查询命中索引', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc2-'))
  const wsDir = join(fixtureRoot, 'ws-perf')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-sc2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { page, pageErrors } = launched
  try {
    // ── 底座：产品面注册（task-loop 域账挂载）──
    await registerProject(page, wsDir, 'SC2 性能演示')
    const projectKey = projectKeyOf(wsDir)

    // ── @500 造数（5.1 直插通道——task-loop.db 域账：七态轮转 + 499 链边 + 抽样记录/挂接）──
    const db = openTaskLoopDbFull(userData)
    const ids: string[] = []
    try {
      const statuses: readonly TaskStatus[] = [
        'pending',
        'in_progress',
        'completed',
        'blocked',
        'suspended',
        'skipped',
        'rejected',
      ]
      db.transaction(() => {
        const insert = db.prepare(
          `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, project_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'doc', ?, ?, ?, ?)`,
        )
        for (let i = 0; i < TASK_COUNT; i++) {
          const localId = String(i + 1)
          const id = randomUUID()
          ids.push(id)
          const ts = new Date(Date.parse('2026-10-06T00:00:00.000Z') + i * 1000).toISOString()
          insert.run(id, 'big', localId, `SC2 压测任务 ${localId}`, statuses[i % statuses.length]!, projectKey, ts, ts)
        }
        for (let i = 1; i < TASK_COUNT; i++) {
          const ts = '2026-10-06T00:30:00.000Z'
          db.prepare(
            `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at) VALUES (?, ?, 'manual', ?, ?)`,
          ).run(ids[i]!, ids[i - 1]!, ts, ts)
        }
        for (let i = 0; i < TASK_COUNT; i += 10) {
          const ts = '2026-10-06T01:00:00.000Z'
          db.prepare(
            `INSERT INTO task_records (id, task_id, verb, actor, session_id, created_at, updated_at)
             VALUES (?, ?, 'claim', 'plugin-tool', ?, ?, ?)`,
          ).run(randomUUID(), ids[i]!, `sc2-dispatch-${i}`, ts, ts)
        }
        const ts = '2026-10-06T01:10:00.000Z'
        db.prepare(
          `INSERT INTO task_session_links (id, task_id, session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).run(randomUUID(), ids[0]!, 'sc2-e2e-session', ts, ts)
      })()

      // ── EQP 三查询命中索引（对 app 实开实库——SEARCH 索引名在场、禁 SCAN 基表）──
      const plan = (sql: string, ...params: unknown[]): string =>
        db
          .prepare<unknown[], { detail: string }>(`EXPLAIN QUERY PLAN ${sql}`)
          .all(...params)
          .map((r) => r.detail)
          .join(' | ')
      const planFeature = plan(SQL_TASKS_BY_CONTAINER, projectKey, 'big')
      expect(planFeature, '① 容器作用域任务扫描 → idx_task_tasks_container').toContain('idx_task_tasks_container')
      expect(planFeature).not.toContain('SCAN task_tasks')
      const planRecords = plan(RECORDS_BY_TASK_SQL, ids[0]!)
      expect(planRecords, '② 记录时间线 → idx_task_records_task').toContain('idx_task_records_task')
      expect(planRecords).not.toContain('SCAN task_records')
      const planLinks = plan(LINKS_BY_SESSION_SQL, 'sc2-e2e-session')
      expect(planLinks, '③ 会话挂接查询 → idx_task_tsl_session').toContain('idx_task_tsl_session')
      expect(planLinks).not.toContain('SCAN task_session_links')
    } finally {
      db.close()
    }

    // ── 三读面 e2e 计时（产品读面单发——写入后首读即见，直读无 watch/回流）──
    const list = await timedRefetch<readonly { localId: string; taskStatus: TaskStatus }[]>(page, TASKS_CHANNELS.list, {
      projectKey,
      slug: 'big',
    })
    expect(list.value, '直插 500 行对产品读面全量可见（直读保证）').toHaveLength(TASK_COUNT)
    expect(list.ms, `任务列表 ≤2s（实测 ${list.ms}ms）`).toBeLessThan(PERF_BUDGET_MS)

    const graph = await timedRefetch<{ tasks: readonly unknown[]; edges: readonly unknown[] }>(page, TASKS_CHANNELS.graph, {
      projectKey,
      slug: 'big',
    })
    expect(graph.value.tasks).toHaveLength(TASK_COUNT)
    expect(graph.value.edges).toHaveLength(TASK_COUNT - 1)
    expect(graph.ms, `任务图 ≤2s（实测 ${graph.ms}ms）`).toBeLessThan(PERF_BUDGET_MS)

    const detailIndex = Math.floor(TASK_COUNT / 2) // ids[250]：抽样记录在位（i%10==0）+ 链边前置在位
    const detail = await timedRefetch<{ localId: string; records: readonly unknown[]; prerequisites: readonly unknown[] }>(
      page,
      TASKS_CHANNELS.detail,
      { projectKey, taskId: ids[detailIndex]! },
    )
    expect(detail.value.localId).toBe(String(detailIndex + 1))
    expect(detail.value.records.length).toBeGreaterThanOrEqual(1) // 抽样记录水化（idx_task_records_task 同源）
    expect(detail.value.prerequisites.length).toBe(1) // 链边 → 前置摘要
    expect(detail.ms, `任务详情 ≤2s（实测 ${detail.ms}ms）`).toBeLessThan(PERF_BUDGET_MS)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(launched.app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
