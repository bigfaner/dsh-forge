// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC7 规格域 gate 与提交定式（PRD Goals SC7 / db-schema §6-24/§6-31）：
//   ① 带 AC 任务 submit 缺测试证据被拒（ERR_TEST_EVIDENCE_REQUIRED——错误信息含 AC 清单
//      逐行·Hard Rule 禁裸错误码）；补齐 gate.test 后放行；
//   ② gate 任务类型：success 结算缺 gate 载荷拒（ERR_GATE_SUMMARY_REQUIRED）；带全四门
//      → gate_json 结构化落账（compile/fmt/lint/test 布尔四项）；
//   ③ commit 两态：submit 携 commit_hash → task_records.commit_hash 落账；缺席 → NULL
//      （提交定式「submit 记录含 commit_hash」= worker 侧定式产物——Conventional Commits
//      信息面归 5.3 dogfood 运行期断言，本件断账本两态）。
// 载体：写动词经测试钩子直调（回放主径——与 tool 面同一服务路径）；错误面捕获 =
// bridge 直调 typed error 文案（formatErr 渲染前同源）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'

const WS_NAME = 'ws-sc7'
const FEATURE = 'sc7-feat'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

test('@web-e2e @m3 SC7·gate 与提交定式：AC 拒含清单 + gate_json 落账 + commit 两态', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc7-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc7-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    await forgeInvoke(page, 'forge:features/register', { projectId, slug: FEATURE, title: 'SC7 gate 演示' })
    const add = async (title: string, type: string, acceptanceCriteria?: string[]): Promise<{ taskId: string; slug: string; localId: string }> =>
      (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title, type, ...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
      })) as { taskId: string; slug: string; localId: string }

    // ── ① AC 双门：缺测试证据拒（清单逐行）→ 补齐放行 ──
    const AC = ['[AC-1] 断言甲在场（SC7 演示）', '[AC-2] 断言乙含清单呈现（SC7 演示）']
    const acTask = await add('SC7 带验收清单任务', 'doc', AC)
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: acTask.slug, localId: acTask.localId }, sessionId: 'e2e-sc7-dispatch' })
    const noEvidence = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: acTask.slug, localId: acTask.localId }, result: 'success',
      summary: '缺测试证据的结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 'e2e-sc7-executor',
    }))
    expect(noEvidence, 'AC 拒 = ERR_TEST_EVIDENCE_REQUIRED 面').toContain('缺测试证据')
    expect(noEvidence, '错误信息含 AC 清单逐行（甲）').toContain(AC[0] as string)
    expect(noEvidence, '错误信息含 AC 清单逐行（乙）').toContain(AC[1] as string)
    const COMMIT_A = '2468ace13579bdf02468ace13579bdf02468ace1'
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: acTask.slug, localId: acTask.localId }, result: 'success',
      summary: 'SC7 补齐测试证据结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT_A, sessionId: 'e2e-sc7-executor',
    })

    // ── ② gate 任务：缺摘要拒 → 全四门 gate_json 落账 ──
    const gateTask = await add('SC7 gate 摘要任务', 'gate')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, sessionId: 'e2e-sc7-dispatch' })
    const noGate = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, result: 'success',
      summary: '缺 gate 载荷的结算（应被拒）', sessionId: 'e2e-sc7-executor',
    }))
    expect(noGate, 'gate 缺摘要 = ERR_GATE_SUMMARY_REQUIRED 面').toContain('需要 gate 数字摘要')
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, result: 'success',
      summary: 'SC7 gate 四门结算', gate: { compile: true, fmt: true, lint: false, test: true },
      sessionId: 'e2e-sc7-executor',
    })

    // ── ③ commit 两态 + gate_json 账本断言 ──
    const plainTask = await add('SC7 无 commit 结算任务', 'doc')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: plainTask.slug, localId: plainTask.localId }, sessionId: 'e2e-sc7-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: plainTask.slug, localId: plainTask.localId }, result: 'success',
      summary: 'SC7 无 commit 结算（缺席态）', sessionId: 'e2e-sc7-executor',
    })
    const db = openForgeDbAt(dir)
    try {
      const acRow = db.prepare<unknown[], { commit_hash: string | null; gate_json: string | null }>(
        `SELECT commit_hash, gate_json FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(acTask.taskId)
      expect(acRow?.commit_hash, 'commit_hash 落账（携带态）').toBe(COMMIT_A)
      const gateOf = (taskId: string): Record<string, unknown> | undefined => {
        const row = db.prepare<unknown[], { gate_json: string | null }>(`SELECT gate_json FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(taskId)
        return row?.gate_json === null || row?.gate_json === undefined ? undefined : (JSON.parse(row.gate_json) as Record<string, unknown>)
      }
      expect(gateOf(acTask.taskId), 'AC 任务 gate_json 四布尔').toMatchObject({ compile: true, fmt: true, lint: true, test: true })
      expect(gateOf(gateTask.taskId), 'gate 任务 gate_json 结构化（lint=false 如实）').toMatchObject({ compile: true, fmt: true, lint: false, test: true })
      const plainRow = db.prepare<unknown[], { commit_hash: string | null }>(
        `SELECT commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(plainTask.taskId)
      expect(plainRow?.commit_hash, 'commit 缺席态 = NULL（两态账本）').toBeNull()
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
