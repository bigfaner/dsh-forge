// @feature:dsh-forge-m2-pipeline @web-e2e
// 5.2 B.5 六断言锚（AC5，e2e 侧经回放主径——db-schema §B.5「本示例直接可写的单测」的
// 运行面落位）：全部写动词经主侧测试钩子（createBridgeDriver——与 tool 面同一 dispatchRpc
// 入口，零真实模型；Hard Rule 回放主径），读断言经产品读面单发 + forge.db 直读双面。
//   ① 环构造双 flag：addTask(T, dependsOn D, blockSource S)——既有 D 等待 S → 环
//     S→T→D→S → ERR_CYCLE_DETECTED 回报环路径（M2 动词面唯一环构造入口）；
//   ② 满足集：fix → rejected ≠ {completed, skipped} → 源不恢复（死锁信号——liveness 诊断域）；
//   ③ 两级去重：任务级（同源同型未终态 → reused=true 复用）/ 终态后新建（completed →
//     新 fix 行）；边级幂等经 fix-chain 边行数恒 1 观测；
//   ④ 同 feature 约束：跨 feature 前置（feat-y/1.1 作 dependsOn）→ 服务不变量拒绝 + 零行写入；
//   ⑤ append-only：task_records UPDATE/DELETE → 触发器 ABORT（双触发器机械防线）；
//   ⑥ 边持久：fix 完成恢复后 fix-chain 边仍在场（满足 = 读时派生，边不删）。
// dogfood 首录夹具（e2e/fixtures/m2/dogfood-dispatch-chain.jsonl）verb 载荷绑定录制期
// projectId 不可跨库重放——本 spec 经同机构造 hand 夹具/直调（5.1「手工构造同格式可用」裁决）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'

/** addTask 结果面（回放动词结算收窄） */
interface AddResult {
  readonly taskId: string
  readonly slug: string
  readonly localId: string
  readonly reused: boolean
}

/** submitTask 结果面 */
interface SubmitResult {
  readonly taskId: string
  readonly status: string
  readonly restored: readonly { slug: string; localId: string }[]
}

test('@web-e2e @m2 5.2 B.5 六断言锚：环双 flag / 满足集 rejected / 两级去重 / 同 feature / append-only / 边持久', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-b5-'))
  const wsDir = join(fixtureRoot, 'ws-b5')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-b5-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 底座：注册 + 两 feature（b5 主域 / b5-other 跨域锚点）──
    const project = await registerProject(page, wsDir, 'B.5 六锚演示')
    const projectId = project.id
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'b5', title: 'B.5 主域' })
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'b5-other', title: 'B.5 跨域' })
    const driver = createBridgeDriver(app)
    const add = (input: Record<string, unknown>): Promise<AddResult> =>
      driver.call('forgeTasks', 'addTask', { projectId, source: { kind: 'feature', slug: 'b5' }, ...input }) as Promise<AddResult>
    const taskCount = (db: ReturnType<typeof openForgeDbAt>): number =>
      db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE slug = 'b5'`).get()?.n ?? 0

    // ══ ① 环构造双 flag（B.5-1）：S(1.1) ← D(1.2) 既有等待链 + T(dependsOn D, blockSource S) ══
    const s = await add({ title: '源任务 S（环构造）', type: 'doc' })
    const d = await add({ title: '等待任务 D（dependsOn S）', type: 'doc', dependsOn: [s.localId] })
    expect(s.localId).toBe('1.1')
    expect(d.localId).toBe('1.2')
    const derived = await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })
    const db = openForgeDbAt(derived.dir)
    try {
      const countBeforeCycle = taskCount(db)
      const cycleRejection = await add({ title: '环构造 T（dependsOn D × blockSource S）', type: 'doc', dependsOn: [d.localId], sourceTask: { slug: 'b5', localId: s.localId }, blockSource: true })
        .then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
      expect(cycleRejection, '双 flag 组合 → ERR_CYCLE_DETECTED（动词面唯一环构造入口）').toContain('依赖环')
      expect(cycleRejection, '环路径回报（首尾相接——S → T → D → S）').toContain('b5/1.1')
      expect(cycleRejection).toContain('b5/1.2')
      expect(taskCount(db), '环拒绝零残留（单事务回滚——T 未建）').toBe(countBeforeCycle)

      // ══ ④ 同 feature 约束（B.5-4）：跨 feature 前置写入即拒（服务不变量——DB CHECK 退役裁决）══
      const countBeforeCross = taskCount(db)
      const crossRejection = await driver
        .call('forgeTasks', 'addTask', { projectId, source: { kind: 'feature', slug: 'b5-other' }, title: '跨域任务', type: 'doc', dependsOn: ['1.1'] })
        .then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
      expect(crossRejection, '跨 feature 边 → 同 feature 前置解析未命中拒（slug 作用域查捞）').toContain('任务未命中')
      expect(crossRejection).toContain('b5-other/1.1')
      const otherCount = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE slug = 'b5-other'`).get()?.n ?? 0
      expect(otherCount, '跨域任务零行写入（写入即 ABORT——事务回滚）').toBe(0)
      expect(taskCount(db)).toBe(countBeforeCross)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_edges`).get()?.n, '跨域边零行（既有边仅 D←S 一条）').toBe(1)

      // ══ ② 满足集（B.5-2）：fix → rejected ≠ {completed, skipped} → 源不恢复 ══
      const s2 = await add({ title: '源任务 S2（满足集）', type: 'doc' })
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: 'b5', localId: s2.localId }, sessionId: 'e2e-b5-s2' })
      await driver.call('forgeTasks', 'submitTask', { projectId, taskRef: { slug: 'b5', localId: s2.localId }, result: 'blocked', reason: 'B.5② 满足集演示受阻', sessionId: 'e2e-b5-s2' })
      const f2 = await add({ title: 'fix（→ rejected 终态）', type: 'doc', sourceTask: { slug: 'b5', localId: s2.localId }, blockSource: true })
      expect(f2.localId).toMatch(/^fix-\d+$/)
      // 人类径 RPC：fix → rejected（transitionTask 仅 RPC 面——与 G1「不注册 tool」面分治一致）
      await forgeInvoke(page, TASKS_CHANNELS.transition, { projectId, taskId: f2.taskId, toStatus: 'rejected', reason: 'B.5② 满足集：rejected 不满足（liveness 死锁信号）' })
      const s2AfterRejected = await forgeInvoke<{ taskStatus: string }>(page, TASKS_CHANNELS.detail, { projectId, taskId: s2.taskId })
      expect(s2AfterRejected.taskStatus, 'rejected ≠ 满足集 {completed, skipped} → 源不恢复（仍 blocked）').toBe('blocked')
      const s2Verbs = db.prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records WHERE task_id = ? ORDER BY id`).all(s2.taskId).map((r) => r.verb)
      expect(s2Verbs, 'S2 记录链无 auto-restore（恢复钩子未触发）').not.toContain('auto-restore')

      // ══ ③ 两级去重（B.5-3）：任务级复用（未终态）/ 终态后新建 + 边级幂等 ══
      const s3 = await add({ title: '源任务 S3（两级去重）', type: 'doc' })
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: 'b5', localId: s3.localId }, sessionId: 'e2e-b5-s3' })
      await driver.call('forgeTasks', 'submitTask', { projectId, taskRef: { slug: 'b5', localId: s3.localId }, result: 'blocked', reason: 'B.5③ 两级去重演示受阻', sessionId: 'e2e-b5-s3' })
      const f3 = await add({ title: 'fix（未终态复用锚）', type: 'doc', sourceTask: { slug: 'b5', localId: s3.localId }, blockSource: true })
      expect(f3.reused).toBe(false)
      const countWithF3 = taskCount(db)
      // 任务级去重：同源同型且未终态 → 纯读复用（老 forge「Dedup is a pure read」平移）
      const f3Again = await add({ title: 'fix（重复声明——应复用）', type: 'doc', sourceTask: { slug: 'b5', localId: s3.localId }, blockSource: true })
      expect(f3Again.reused, '任务级去重：reused=true').toBe(true)
      expect(f3Again.taskId, '复用既有 fix 行（同 taskId）').toBe(f3.taskId)
      expect(taskCount(db), '复用零新建（纯读零变更）').toBe(countWithF3)
      // 边级幂等观测：fix-chain 边 (S3←F3) 恰一条（重复声明不增边）
      const fixEdgeCount = db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(s3.taskId, f3.taskId)?.n ?? 0
      expect(fixEdgeCount, '边级 PK 幂等：fix-chain 边恰一条').toBe(1)
      // fix 完成（claim + submit success）→ 恢复钩子 auto-restore（前置全满足）
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: 'b5', localId: f3.localId }, sessionId: 'e2e-b5-f3' })
      const f3Submit = (await driver.call('forgeTasks', 'submitTask', {
        projectId,
        taskRef: { slug: 'b5', localId: f3.localId },
        result: 'success',
        summary: 'B.5③⑥ fix 完成（恢复钩子 + 边持久锚）',
        gate: { compile: true, fmt: true, lint: true, test: true },
        sessionId: 'e2e-b5-f3',
      })) as SubmitResult
      expect(f3Submit.restored.map((r) => r.localId), '恢复钩子：S3 auto-restore（blocked→pending）').toContain(s3.localId)
      // ══ ⑥ 边持久（B.5-6）：恢复后 fix-chain 边仍在场（满足 = 读时派生，边不删）══
      const edgeAfterRestore = db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(s3.taskId, f3.taskId)?.n ?? 0
      expect(edgeAfterRestore, '边持久：恢复后 (S3, F3) 边仍在（可观测证据）').toBe(1)
      const s3Status = await forgeInvoke<{ taskStatus: string }>(page, TASKS_CHANNELS.detail, { projectId, taskId: s3.taskId })
      expect(s3Status.taskStatus, 'S3 恢复后 pending（读时派生满足）').toBe('pending')
      // 终态后新建：F3 completed（终态）→ 再次受阻声明 → 新 fix 行（reused=false）
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: 'b5', localId: s3.localId }, sessionId: 'e2e-b5-s3b' })
      await driver.call('forgeTasks', 'submitTask', { projectId, taskRef: { slug: 'b5', localId: s3.localId }, result: 'blocked', reason: 'B.5③ 二次受阻（终态后新建锚）', sessionId: 'e2e-b5-s3b' })
      const f4 = await add({ title: 'fix（终态后新建）', type: 'doc', sourceTask: { slug: 'b5', localId: s3.localId }, blockSource: true })
      expect(f4.reused, '既有 fix 已终态 → 不复用').toBe(false)
      expect(f4.taskId, '新建 fix 行（新 taskId）').not.toBe(f3.taskId)
      expect(f4.localId).toMatch(/^fix-\d+$/)

      // ══ ⑤ append-only（B.5-5）：task_records UPDATE/DELETE → 触发器 ABORT ══
      const firstRecordId = db.prepare<unknown[], { id: number }>(`SELECT id FROM task_records ORDER BY id LIMIT 1`).get()?.id
      expect(firstRecordId, '记录行在场（断言目标）').toBeDefined()
      const rid = firstRecordId as number
      let updateError = ''
      try {
        db.prepare(`UPDATE task_records SET reason = 'tamper' WHERE id = ?`).run(rid)
      } catch (cause) {
        updateError = String((cause as Error)?.message ?? cause)
      }
      expect(updateError, 'append-only 触发器：UPDATE ABORT').toContain('append-only violation (update)')
      let deleteError = ''
      try {
        db.prepare(`DELETE FROM task_records WHERE id = ?`).run(rid)
      } catch (cause) {
        deleteError = String((cause as Error)?.message ?? cause)
      }
      expect(deleteError, 'append-only 触发器：DELETE ABORT').toContain('append-only violation (delete)')
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE id = ?`).get(rid)?.n, '记录未被篡改（行原样在场）').toBe(1)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
