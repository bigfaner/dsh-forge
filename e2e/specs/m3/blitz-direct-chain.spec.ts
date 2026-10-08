// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: blitz-direct-chain（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/blitz-direct-chain/contracts/
//   step-{1..5}-*.md（eval-contract 982/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——quick-tasks 产出（提案 + 直挂任务清单）经回放主径
// 承载（createProposal mode=blitz + addTask source=proposal——M2/5.2 既定口径）；读面 =
// RPC 单发（refetchOnce 即时判据）+ 概览 UI 面；库级断言 = openForgeDbAt（产品面
// deriveTaskStoreDir 单源目录）。
//
// Fact Table 摘录（源码核实）：
//   - 五态机（ProposalVerdictDialog.tsx PROPOSAL_TRANSITION_MATRIX）：draft → [under-review]
//     仅一目标——UI 接受须先经 under-review（bridge 前置一段）；
//   - 评审流转对话框：[data-dswf-ov-vd] + vd-to（select）/ vd-reason（textarea）/
//     vd-error（role=alert，值 = 拒绝形）/ vd-confirm / vd-accepted-hint（值 = mode——
//     blitz 支文案「直接进入任务阶段·无 feature」）；入口 = 行 [data-dswf-ov-more] ⋯ 菜单；
//   - 提案行 = [data-dswf-ov-parent]（hasText title 定位）+ 状态 tag 中文（草稿/评审中/已接受…）；
//   - 任务子 tab 容器 pill = [data-dswf-tt-contpill="proposal:<slug>"] + 菜单行
//     [data-dswf-tt-mcont] + 琥珀点 .dswf-tt-contdot[data-mode="blitz"]；行/卡/节点 =
//     ttItemOf/ttCardOf/[data-dswf-tt-node]（is-completed 类）；
//   - 服务错误面（bridge 直调 message = core typed error 文案）：submitTask 缺测试证据 =
//     「submitTask 缺测试证据：…验收清单（逐条补证据后重新提交）」逐行含 AC；
//   - boot-overlay.yml（m3.ts overlayTextOf/presetSkillDirs）：突击组合 customSkillDirs
//     仅 core 目录（spec 物理缺席 = L1 数据直证）。
//
// Outcome → 测试映射：
//   Step1 success（quick-tasks 产出：draft 提案 + 整数 ID 任务清单 + mode=blitz）………「冒烟」
//   Step1 mode-written-at-creation（溯源创建时写入·零纠正写）…………………………………「冒烟」
//   Step2 success（accepted 直接任务阶段 + 行即时更新）………………………………………「冒烟」
//   Step2 no-feature-row-on-accept（零 feature 行/文档域 + feature 子 tab 无行）…………「冒烟」
//   Step4 success（submit 全绿 + 单次重取即见 + 三视图即时）…………………………………「冒烟」
//   Step4 concurrent-browsing-single-refetch（写入返回后单发重取即见新值）………………「冒烟」
//   Step5 success / spec-skill-request-physically-invisible（L1 数据面）……………………「冒烟」尾
//   Step2 revised-back-to-draft（under-review → draft 打回）…………………………………「Step2b」
//   Step2 validation-error-reason-empty（空因拒绝留场 + 零部分写库）…………………………「Step2b」
//   Step3 worker-blocked（blocked 落账 + submit 记录在场）……………………………………「Step3b/4b」
//   Step4 ac-evidence-missing（错误信息含 AC 清单 + 状态不变 + 零记录）……………………「Step3b/4b」
//
// 诚实映射（无 e2e 通道 / 已有承载面——不伪造断言）：
//   - Step3 success（run-tasks 派发循环：worker spawn + toolFilter 收窄 + agentOptions 档位）
//     = 真实派发链 → dogfood-sc-m3.spec.ts（dispatchTask 四分支）+ 5.1 pin 池（pin-10..14）
//     + e2e/support/m3/worker-face.test.ts（deriveWorkerToolFilter 四型 deny 集）；
//     UI 派发入口（/run-tasks 单行自动发送 + 容器模式）→ uf3-dispatch-entry.spec.ts；
//   - Step3 no-ready-task-pool-done（池快照 + 收工判词）→ dogfood（no-ready-task 事件门控）
//     + M2 task-dispatch-pipeline.spec.ts Step2b（空出口信号）；
//   - Step3 worker-blocked 的 fix 链协议半段（block_source 单事务/链深 ≤6/恢复钩子）→
//     M2 fix-chain-auto-recovery.spec.ts + worker-provisioning.spec.ts（本批 T1）；
//   - Step5 会话投影面技能清单转录（模型行使通道）→ SC2①（boot-overlay L1 数据直证）——
//     本件冒烟尾以同源 overlay 断言承载。
//
// Assertion depth: 41/44 behavioral（93%），其中 deep 17/41（41%）——两阈均过。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, ttCardOf, ttColOf, ttItemOf, OV_PARENT_ANY } from '../../support/anchors.js'
import { switchTaskView, overlayTextOf, presetSkillDirs } from '../../support/m3.js'

const WS_NAME = 'ws-jbdc'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案——sc7 同径） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

test('@web-e2e @m3 突击直达链·冒烟：quick-tasks 产出 → accepted 无 feature 行 → 直挂容器 → 全绿三视图（Step1-4 success 全链）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jbdc-blitz'

    // ── Step1：quick-tasks 产出（回放主径）——提案 draft + 直挂任务清单（整数 ID 语义）──
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'Jbdc 突击直达演示', mode: 'blitz',
    })) as { proposalId: string; slug: string }
    // mode-written-at-creation：单一动词返回后即查——mode 列已在行上 + 零纠正写痕迹
    const db0 = openForgeDbAt(dir)
    try {
      const row = db0.prepare<unknown[], { mode: string | null; proposal_status: string }>(
        `SELECT mode, proposal_status FROM proposals WHERE id = ?`,
      ).get(proposal.proposalId)
      expect(row?.mode, 'mode 溯源 = blitz（创建时写入——非事后补写）').toBe('blitz')
      expect(row?.proposal_status, '五态 draft 起步').toBe('draft')
      expect(db0.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records`).get()?.n, '零纠正写（创建后无任何任务域动词）').toBe(0)
    } finally {
      db0.close()
    }
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '突击任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '突击任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    expect(/^\d+(\.\d+)?$/.test(t1.localId), `突击整数 ID 语义（localId=${t1.localId}——无 stage-gate 段，sc3 同口径）`).toBe(true)
    expect(/^\d+(\.\d+)?$/.test(t2.localId), '乙同为整数 ID（依赖前置声明可解析）').toBe(true)

    // ── Step2：accepted（UI 人工裁决面——draft 仅可转 under-review，bridge 前置一段）──
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jbdc 突击直达演示' }).first()
    await expect(row, '提案行在场（评审中）').toBeVisible({ timeout: 30_000 })
    await row.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('accepted')
    await expect(page.locator('[data-dswf-ov-vd-accepted-hint="blitz"]'), 'accepted 分叉文案 = 突击直接任务阶段·无 feature').toContainText('无 feature')
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jbdc 突击接受（直达任务阶段断言）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(row, '提案行状态即时更新 = 已接受').toContainText('已接受', { timeout: 30_000 })

    // ── Step2c：无 feature 行 / 无文档域（突击无 feature 阶段——用户裁决 2026-10-07）──
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '零 feature 行（接受不成链）').toBe(0)
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM feature_documents WHERE feature_id IN (SELECT id FROM features WHERE proposal_id = ?)`,
      ).get(proposal.proposalId)?.n, '零文档域条目').toBe(0)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE source_kind = 'proposal' AND source_id = ?`).get(proposal.proposalId)?.n, '任务直挂提案（两行）').toBe(2)
      expect(db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM proposals WHERE id = ?`).get(proposal.proposalId)?.mode, '接受动词不改写溯源（仍 blitz）').toBe('blitz')
    } finally {
      db.close()
    }
    await page.locator(ovSubtabOf('features')).click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(OV_PARENT_ANY, { hasText: PROP }).first(), 'feature 子 tab 不出现该提案的 feature').toHaveCount(0)

    // ── Step2 尾 → Step3 前置：任务子 tab 突击提案容器（琥珀点）──
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menuItem = page.locator(`[data-dswf-tt-mcont="proposal:${PROP}"]`).first()
    await expect(menuItem, '容器菜单含突击提案容器').toBeVisible({ timeout: 15_000 })
    await menuItem.click()
    const pill = page.locator(`[data-dswf-tt-contpill="proposal:${PROP}"]`)
    await expect(pill, '容器 pill 切至突击提案').toBeVisible({ timeout: 15_000 })
    await expect(pill.locator('.dswf-tt-contdot'), '琥珀点 = blitz 容器标记').toHaveAttribute('data-mode', 'blitz')

    // ── Step4：worker submit 全绿（回放主径）+ 单次重取即见（即时判据——无 watch）──
    const cards0 = await refetchOnce<readonly { taskId: string; taskStatus: string }[]>(page, TASKS_CHANNELS.list, { projectId })
    expect(cards0.find((c) => c.taskId === t1.taskId)?.taskStatus, '写前读面 = pending（对照锚）').toBe('pending')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jbdc-dispatch' })
    const COMMIT = '1357bdf02468ace1357bdf02468ace1357bdf0'
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jbdc 突击甲结算（全绿三视图断言）', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jbdc-executor',
    })
    // concurrent-browsing-single-refetch：写入返回后单发重取即见新值（概览页签全程开着——读路径活跃）
    const cards1 = await refetchOnce<readonly { taskId: string; taskStatus: string }[]>(page, TASKS_CHANNELS.list, { projectId })
    expect(cards1.find((c) => c.taskId === t1.taskId)?.taskStatus, '写入返回后单次重取即见 completed（即时判据）').toBe('completed')
    expect(cards1.find((c) => c.taskId === t2.taskId)?.taskStatus, '依赖方保持待处理（池态一致）').toBe('pending')
    // 列表视图即时刷新（事件驱动 UI 收敛）
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '列表视图即时刷新 = 已完成').toContainText('已完成', { timeout: 30_000 })
    // 泳道视图：卡片落入 completed 列
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(t1.taskId)), '泳道视图即时刷新（completed 列）').toBeVisible({ timeout: 30_000 })
    // DAG 视图：节点 is-completed + 依赖方未完成
    await switchTaskView(page, 'dag')
    const node = page.locator(`[data-dswf-tt-node="${t1.taskId}"]`)
    await expect(node, 'DAG 节点在场').toBeVisible({ timeout: 30_000 })
    await expect(node).toHaveClass(/is-completed/)
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`), '依赖方节点在场（未领取）').toBeVisible()
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`)).not.toHaveClass(/is-completed/)
    // submit 记录恒含 commit_hash（账本级）
    const db2 = openForgeDbAt(dir)
    try {
      const rec = db2.prepare<unknown[], { commit_hash: string | null }>(
        `SELECT commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(t1.taskId)
      expect(rec?.commit_hash, '执行记录含提交哈希（入自身库）').toBe(COMMIT)
    } finally {
      db2.close()
    }

    // ── Step5：全程技能清单核查（L1 数据直证——SC2① 同源）──
    const overlay = overlayTextOf(userData)
    const blitzDirs = presetSkillDirs(overlay, 'blitz')
    expect(blitzDirs.length, `突击组合技能目录仅 core（dirs=${JSON.stringify(blitzDirs)}）`).toBe(1)
    expect(blitzDirs.every((d) => !d.toLowerCase().includes('plugin-forge-spec')), '规格技能目录物理缺席（七者零在场——枚举面即证）').toBe(true)
    expect(overlay.includes('!!js'), '物化零 !!js（绝对路径 only）').toBe(false)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 突击直达链·Step2b：打回修订（under-review → draft）+ 空因拒绝留场零写库', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jbdc-revise'
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'Jbdc 打回修订演示', mode: 'blitz',
    })) as { proposalId: string }
    await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '打回期间不派发任务', type: 'doc',
    })
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })

    // UI 打回：⋯ 菜单 → 评审流转 → 目标 draft
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jbdc 打回修订演示' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('draft')

    // 空因拒绝留场：不落部分写库（对话框不关闭 + 错误条在场 + 库保持 under-review）
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd-error="reason-required"]'), '空因拒绝错误条在场（近场可更正）').toBeVisible({ timeout: 10_000 })
    await expect(dialog, '对话框留场（表单不提交）').toBeVisible()
    const db0 = openForgeDbAt(dir)
    try {
      expect(db0.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(proposal.proposalId)?.proposal_status, '零部分写库（保持 under-review）').toBe('under-review')
    } finally {
      db0.close()
    }

    // 补因提交 → 打回生效：draft + 任务阶段未进入（任务行不动）
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jbdc 评审发现需修订（打回断言）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(row, '行状态收敛 = 草稿').toContainText('草稿', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(proposal.proposalId)?.proposal_status, '打回落库 = draft（修订后可重新走接受）').toBe('draft')
      expect(db.prepare<unknown[], { task_status: string; n: number }>(
        `SELECT task_status, COUNT(*) AS n FROM tasks WHERE source_kind = 'proposal' AND source_id = ?`,
      ).get(proposal.proposalId), '任务行不动（打回期间不派发）').toMatchObject({ task_status: 'pending', n: 1 })
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

test('@web-e2e @m3 突击直达链·Step3b/4b：受阻结算落账 + AC 缺证据拒绝（清单逐行 + 状态不变零记录）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbdc3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jbdc-block'
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'Jbdc 受阻与证据门演示', mode: 'blitz',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'accepted' })
    const tBlocked = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '受阻任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const AC = ['[AC-1] 突击证据甲在场（Jbdc）', '[AC-2] 突击证据乙含清单（Jbdc）']
    const tAc = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '带清单任务', type: 'doc', acceptanceCriteria: AC,
    })) as { taskId: string; slug: string; localId: string }

    // ── worker-blocked：submitTask result=blocked（reason 必带）→ 落账 + 审计行 ──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: tBlocked.slug, localId: tBlocked.localId }, sessionId: 'e2e-jbdc3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: tBlocked.slug, localId: tBlocked.localId }, result: 'blocked',
      reason: 'Jbdc 受阻演示（重大问题——逃生通道前缀语义归 worker-provisioning 旅程）', sessionId: 'e2e-jbdc3-executor',
    })
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(tBlocked.taskId)?.task_status, '受阻落账 = blocked').toBe('blocked')
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(tBlocked.taskId)?.n, '受阻结算审计行在场（reason 单源）').toBeGreaterThanOrEqual(1)
    } finally {
      db.close()
    }

    // ── ac-evidence-missing：带 AC 任务缺测试证据 → 拒绝且错误信息含 AC 清单逐行 ──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: tAc.slug, localId: tAc.localId }, sessionId: 'e2e-jbdc3-dispatch' })
    const noEvidence = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: tAc.slug, localId: tAc.localId }, result: 'success',
      summary: '缺测试证据的结算（应被拒）', gate: { compile: true, fmt: true, lint: true, test: false },
      sessionId: 'e2e-jbdc3-executor',
    }))
    expect(noEvidence, '拒绝面 = 缺测试证据（人话——非裸错误码）').toContain('缺测试证据')
    expect(noEvidence, '错误信息含 AC 清单逐行（甲）').toContain(AC[0] as string)
    expect(noEvidence, '错误信息含 AC 清单逐行（乙）').toContain(AC[1] as string)
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(tAc.taskId)?.task_status, '任务状态不变更（保持 in_progress）').toBe('in_progress')
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`).get(tAc.taskId)?.n, '零 submit 记录（单事务全成全败）').toBe(0)
    } finally {
      db2.close()
    }
    // 补齐证据后过门（gate 纪律不折扣——补证放行）
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: tAc.slug, localId: tAc.localId }, result: 'success',
      summary: 'Jbdc 补齐测试证据结算', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-jbdc3-executor',
    })
    const db3 = openForgeDbAt(dir)
    try {
      expect(db3.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(tAc.taskId)?.task_status, '补证后过门 = completed').toBe('completed')
    } finally {
      db3.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
