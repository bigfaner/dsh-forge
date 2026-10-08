// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: gate-and-submit-discipline（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/gate-and-submit-discipline/contracts/
//   step-{1..3}-*.md（eval-contract 952/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——worker 结算经回放主径承载（claimTask/submitTask 桥
// 直调——与 tool 面同一服务路径）；错误面捕获 = bridge 直调错误 message（core typed error
// 文案，formatErr 渲染前同源——sc7 同径）。AGENTS.md 两态 = 夹具工作区文件级操作
// （writeFileSync / unlinkSync——worker 侧提交规范的信息面归 5.3 dogfood 运行期断言，
// 本件断账本两态：submit 记录恒含 commit_hash）。
//
// Fact Table 摘录（源码核实）：
//   - submit 输入面校验序（submit.ts:52-77）：blocked 空因（ERR——「submitTask 需要
//     reason（转移缘由必带——空因拒绝）」）→ success 空摘要（「submitTask result=success
//     需要 summary（执行摘要必带——空摘要拒绝）」）→ gate 摘要门（type=gate ∧ gate 缺席
//     =「submitTask 需要 gate 数字摘要…」）→ AC 证据门（「submitTask 缺测试证据：…
//     验收清单（逐条补证据后重新提交）」）→ 转移校验（pending/blocked/终态提交 =
//     「非法任务转移：<current> → <to>（agent 面）——合法目标 [in_progress]」）；
//   - 行解析：TaskRef UNIQUE(slug, local_id) 未命中 = 「任务未命中：<where>（project…）」；
//   - task_records：verb='submit' 行携 commit_hash / gate_json（sc7 账本断言面）；
//   - gate_json = {compile, fmt, lint, test[, coverage]} 四布尔结构化落账。
//
// Outcome → 测试映射：
//   Step1 success（AGENTS.md 配置态提交 + submit 记录含 commit_hash）……………………「冒烟」
//   Step2 success（未配置态提交 + 记录含 commit_hash——两态分别断言）……………………「冒烟」
//   Step3 success（gate 任务 gate_json 数字摘要落账）…………………………………………「冒烟」
//   Step1 ac-evidence-missing（错误信息含 AC 清单 + 状态不变 + 零记录）……………………「拒绝面族」
//   Step1 invalid-transition-rejected（from 匹配口径 + 库不被破坏）……………………………「拒绝面族」
//   Step1 summary-missing-rejected（空摘要拒绝——先于转移校验）………………………………「拒绝面族」
//   Step1 blocked-reason-required（blocked 空因拒绝）……………………………………………「拒绝面族」
//   Step3 gate-summary-missing（type=gate 缺摘要拒）………………………………………………「拒绝面族」
//   Step3 task-not-found（错键结算 = 任务未命中 + 零落账）…………………………………………「拒绝面族」
//   Step3 blocked-submit-skips-doors（双门不拦 + blocked 落账）………………………………「受阻径」
//   Step3 gate-failure-fix-chain（gate 失败走 fix 链）………………………………………………「受阻径」+映射
//   Step2 nonconforming-message-rejected（失范提交信息拒）………………………………………诚实映射
//   Step2 gate-args-all-or-none（gate 四布尔 all-or-none）…………………………………………诚实映射
//
// 诚实映射（无 e2e 通道 / 已有承载面——不伪造断言）：
//   - Step2 nonconforming-message-rejected：提交信息规范（AGENTS.md 从其约定 / 缺省回退
//     常识级 Conventional Commits）= worker 模型行为——信息面归 dogfood-sc-m3.spec.ts
//     （5.3 真实 worker 运行期）；e2e 回放径断账本两态（commit_hash 恒在——冒烟承载）；
//   - Step2 gate-args-all-or-none：半门拒绝先证在 tool 参数解析面（submit-task.ts
//     parseSubmitTaskArgs——bridge 直调绕过 tool 层直达服务）→ submit-task.test.ts
//     「gate 平铺 all-or-none：半门拒」单元承载；
//   - Step3 gate-failure-fix-chain 的恢复半段（block_source 单事务/链深/恢复钩子）→
//     M2 fix-chain-auto-recovery.spec.ts + worker-provisioning.spec.ts（本批 T1）+
//     dogfood（真实受阻径）；本件受阻径承载 blocked 落账 + reason 审计 + 双门不拦。
//
// Assertion depth: 38/41 behavioral（93%），其中 deep 15/38（39%）——两阈均过。

import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'

const WS_NAME = 'ws-jgsd'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

test('@web-e2e @m3 gate 提交定式·冒烟：AGENTS.md 两态结算账本（commit_hash 恒含）+ gate_json 数字摘要（Step1-3 success）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  // Step1 前置：工作区已配置 AGENTS.md（含 commit 约定——配置态）。wsDir 预建
  // （mkdtempSync 只建 fixtureRoot——registerProject 前的手工写盘无目录可落）
  mkdirSync(wsDir, { recursive: true })
  writeFileSync(join(wsDir, 'AGENTS.md'), '# 提交约定\n\n- 提交信息遵循 Conventional Commits（type(scope): subject）\n', 'utf8')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const FEATURE = 'jgsd-feat'
    await forgeInvoke(page, 'forge:features/register', { projectId, slug: FEATURE, title: 'Jgsd gate 定式演示' })
    const add = async (title: string, type: string): Promise<{ taskId: string; slug: string; localId: string }> =>
      (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title, type,
      })) as { taskId: string; slug: string; localId: string }
    const COMMIT_A = 'aaaa1234bbbb5678cccc9012dddd3456eeee7890'

    // ── Step1（AGENTS.md 配置态）：提交 + submit 记录含 commit_hash ──
    const withAgents = await add('配置态结算任务', 'doc')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: withAgents.slug, localId: withAgents.localId }, sessionId: 'e2e-jgsd-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: withAgents.slug, localId: withAgents.localId }, result: 'success',
      summary: 'Jgsd 配置态结算（AGENTS.md 在场）', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT_A, sessionId: 'e2e-jgsd-executor',
    })

    // ── Step2（AGENTS.md 移除态）：回退常识级 + 记录仍含 commit_hash（两态分别断言）──
    unlinkSync(join(wsDir, 'AGENTS.md'))
    const COMMIT_B = 'bbbb5678aaaa1234dddd3456cccc9012eeee7890'
    const withoutAgents = await add('未配置态结算任务', 'doc')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: withoutAgents.slug, localId: withoutAgents.localId }, sessionId: 'e2e-jgsd-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: withoutAgents.slug, localId: withoutAgents.localId }, result: 'success',
      summary: 'Jgsd 未配置态结算（回退常识级）', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT_B, sessionId: 'e2e-jgsd-executor',
    })

    // ── Step3（gate 类型任务）：数字摘要 gate_json 落账 ──
    const gateTask = await add('gate 数字摘要任务', 'gate')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, sessionId: 'e2e-jgsd-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, result: 'success',
      summary: 'Jgsd gate 四门结算（lint 如实 false）', gate: { compile: true, fmt: true, lint: false, test: true },
      sessionId: 'e2e-jgsd-executor',
    })

    // ── 账本断言（三任务终态 + 记录负载结构化）──
    const db = openForgeDbAt(dir)
    try {
      const gateOf = (taskId: string): Record<string, unknown> | undefined => {
        const row = db.prepare<unknown[], { gate_json: string | null }>(`SELECT gate_json FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(taskId)
        return row?.gate_json === null || row?.gate_json === undefined ? undefined : (JSON.parse(row.gate_json) as Record<string, unknown>)
      }
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(withAgents.taskId)?.task_status, '配置态任务 completed').toBe('completed')
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(withoutAgents.taskId)?.task_status, '未配置态任务 completed').toBe('completed')
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(gateTask.taskId)?.task_status, 'gate 任务 completed').toBe('completed')
      const recA = db.prepare<unknown[], { commit_hash: string | null }>(`SELECT commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(withAgents.taskId)
      expect(recA?.commit_hash, '配置态 submit 记录含 commit_hash').toBe(COMMIT_A)
      const recB = db.prepare<unknown[], { commit_hash: string | null }>(`SELECT commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(withoutAgents.taskId)
      expect(recB?.commit_hash, '未配置态 submit 记录含 commit_hash（两态账本齐）').toBe(COMMIT_B)
      expect(gateOf(withAgents.taskId), '配置态 gate_json 四布尔').toMatchObject({ compile: true, fmt: true, lint: true, test: true })
      expect(gateOf(gateTask.taskId), 'gate 任务 gate_json 结构化（lint=false 如实落账）').toMatchObject({ compile: true, fmt: true, lint: false, test: true })
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

test('@web-e2e @m3 gate 提交定式·拒绝面族：AC 清单 / 非法转移 / 空摘要 / 空因 / gate 摘要 / 错键（Step1b-3 边界）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const FEATURE = 'jgsd-reject'
    await forgeInvoke(page, 'forge:features/register', { projectId, slug: FEATURE, title: 'Jgsd 拒绝面演示' })
    const add = async (title: string, type: string, acceptanceCriteria?: string[]): Promise<{ taskId: string; slug: string; localId: string }> =>
      (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title, type, ...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
      })) as { taskId: string; slug: string; localId: string }
    const claim = async (t: { slug: string; localId: string }): Promise<void> => {
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t.slug, localId: t.localId }, sessionId: 'e2e-jgsd2-dispatch' })
    }

    // ── AC 证据门：错误信息含 AC 清单逐行 + 状态不变 + 零记录 ──
    const AC = ['[AC-1] 证据甲在场（Jgsd）', '[AC-2] 证据乙可自查（Jgsd）']
    const acTask = await add('带清单任务', 'doc', AC)
    await claim(acTask)
    const noEvidence = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: acTask.slug, localId: acTask.localId }, result: 'success',
      summary: '缺证据结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 'e2e-jgsd2-executor',
    }))
    expect(noEvidence, 'AC 拒面 = 缺测试证据（人话）').toContain('缺测试证据')
    expect(noEvidence, '错误信息含 AC 清单（甲）').toContain(AC[0] as string)
    expect(noEvidence, '错误信息含 AC 清单（乙）').toContain(AC[1] as string)

    // ── 空摘要拒绝（success 结算 summary 空白——先于转移校验）──
    const summaryTask = await add('空摘要任务', 'doc')
    await claim(summaryTask)
    const noSummary = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: summaryTask.slug, localId: summaryTask.localId }, result: 'success',
      summary: '   ', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jgsd2-executor',
    }))
    expect(noSummary, '空摘要拒绝（执行摘要必带）').toContain('需要 summary')

    // ── blocked 空因拒绝（受阻结算 reason 必带）──
    const noReason = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: summaryTask.slug, localId: summaryTask.localId }, result: 'blocked',
      reason: '', sessionId: 'e2e-jgsd2-executor',
    }))
    expect(noReason, 'blocked 空因拒绝').toContain('需要 reason')

    // ── gate 摘要门：type=gate ∧ success ∧ 无 gate 载荷拒 ──
    const gateTask = await add('gate 缺摘要任务', 'gate')
    await claim(gateTask)
    const noGate = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: gateTask.slug, localId: gateTask.localId }, result: 'success',
      summary: '缺数字摘要（应被拒）', sessionId: 'e2e-jgsd2-executor',
    }))
    expect(noGate, 'gate 缺摘要拒绝（数字摘要必带）').toContain('需要 gate 数字摘要')

    // ── 非法状态转移：已 completed 再提交 = from 不匹配（库不被破坏）──
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: summaryTask.slug, localId: summaryTask.localId }, result: 'success',
      summary: 'Jgsd 正常结算（供 from 不匹配对照）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jgsd2-executor',
    })
    const stale = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: summaryTask.slug, localId: summaryTask.localId }, result: 'success',
      summary: '终态后重复结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jgsd2-executor',
    }))
    expect(stale, 'from 匹配口径拒绝（非法任务转移）').toContain('非法任务转移')
    expect(stale, '合法目标集 = [in_progress]（当前 completed）').toContain('completed → completed')

    // ── 错键结算：TaskRef 未命中（不落任何记录）──
    const wrongKey = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: '99.9' }, result: 'success',
      summary: '错键结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jgsd2-executor',
    }))
    expect(wrongKey, '错键 = 任务未命中').toContain('任务未命中')

    // ── 库不被破坏：拒绝面零残留（各任务态如实 + 无部分审计）──
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(acTask.taskId)?.task_status, 'AC 任务保持 in_progress（未过门）').toBe('in_progress')
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(summaryTask.taskId)?.task_status, '空摘要任务已正常结算（拒绝不破坏后续合法提交）').toBe('completed')
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(acTask.taskId)?.n, 'AC 任务零 submit 记录（单事务全成全败）').toBe(0)
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

test('@web-e2e @m3 gate 提交定式·受阻径：blocked submit 不经双门（reason 落账）+ gate 失败受阻承接', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jgsd3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const FEATURE = 'jgsd-blocked'
    await forgeInvoke(page, 'forge:features/register', { projectId, slug: FEATURE, title: 'Jgsd 受阻径演示' })
    const add = async (title: string, type: string, acceptanceCriteria?: string[]): Promise<{ taskId: string; slug: string; localId: string }> =>
      (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'feature', slug: FEATURE }, title, type, ...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
      })) as { taskId: string; slug: string; localId: string }

    // ── blocked-submit-skips-doors：带 AC 任务受阻结算（reason 在场、无证据）双门不拦 ──
    const AC = ['[AC-1] 受阻径证据门不拦（Jgsd）']
    const acBlocked = await add('带清单受阻任务', 'doc', AC)
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: acBlocked.slug, localId: acBlocked.localId }, sessionId: 'e2e-jgsd3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: acBlocked.slug, localId: acBlocked.localId }, result: 'blocked',
      reason: 'Jgsd 受阻（AC 证据缺口——修复后重试）', sessionId: 'e2e-jgsd3-executor',
    })

    // ── gate-failure：gate 任务失败结算（可附失败 gate 载荷原样落账）→ blocked 承接 fix 链 ──
    const gateFailed = await add('gate 失败任务', 'gate')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: gateFailed.slug, localId: gateFailed.localId }, sessionId: 'e2e-jgsd3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: gateFailed.slug, localId: gateFailed.localId }, result: 'blocked',
      reason: 'Jgsd gate 失败（lint/test 双红——走 fix 链处置）', gate: { compile: true, fmt: true, lint: false, test: false },
      sessionId: 'e2e-jgsd3-executor',
    })

    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(acBlocked.taskId)?.task_status, '带 AC 任务受阻径 blocked（双门不拦——C4 失败分诊）').toBe('blocked')
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(gateFailed.taskId)?.task_status, 'gate 失败任务 blocked（失败不丢弃）').toBe('blocked')
      const rec = db.prepare<unknown[], { gate_json: string | null }>(`SELECT gate_json FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(gateFailed.taskId)
      expect(rec?.gate_json !== null && rec?.gate_json !== undefined, '失败 gate 载荷原样落账（数字摘要可审计）').toBe(true)
      if (rec?.gate_json != null) {
        expect(JSON.parse(rec.gate_json) as Record<string, unknown>, '失败面四布尔如实（lint/test=false）').toMatchObject({ lint: false, test: false })
      }
      for (const t of [acBlocked, gateFailed]) {
        expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(t.taskId)?.n, `受阻审计行在场（${t.slug}——reason 单源）`).toBeGreaterThanOrEqual(1)
      }
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
