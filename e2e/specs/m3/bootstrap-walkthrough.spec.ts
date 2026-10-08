// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: bootstrap-walkthrough（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/bootstrap-walkthrough/contracts/
//   step-{1..5}-*.md（eval-contract 947/1100 通过）。
//
// 载体形态：自举走查的**真实**运行期面（dsh-forge 自身开发 M3.5 + 总纲回归 + SC9 记账）=
// dogfood-sc-m3.spec.ts（5.3 SC-M3 门——本仓唯一真实 dispatchTask 走查面）。本件承载合约的
// 可回放半面：夹具工作区内的 M3.5 同构走查（评审成链 → 派发结算 → 记录入库 → 全景一致 →
// 零 manifest）——走查不变量（库记账唯一通道 / 记录 100% 入自身库 / 时序耦合）在受控世界
// 逐条落断言；「dsh-forge 自身靶」的差异（自举靶 = 夹具仓）不进入不变量语义。
//
// Fact Table 摘录（源码核实）：
//   - 评审流转对话框（ProposalVerdictDialog.tsx）：draft → under-review 单目标（bridge 前置
//     一段）；accepted 分叉文案 hint 值 = mode（远征支「单步成链建 feature」）；
//   - 成链三件（features 行 + proposal_id 谱系 + feature_records verb='register' actor='core'
//     ——sc5/sc6 同源断言面）；文档 = FEATURES_CHANNELS.upsertDoc（write-prd/ui-design/
//     tech-design 产出的 RPC 双门承载——sc5 形态）；
//   - 任务/记录 = addTask/claimTask/submitTask（回放五写动词）；执行记录含 commit_hash；
//   - 概览全景锚：提案行 [data-dswf-ov-parent]（hasText title）+ 展开元数据
//     following-sibling [data-dswf-ov-meta]（成链 → slug）+ feature 文档行 ovDocRowOf +
//     任务行 ttItemOf；
//   - manifest.md 扫描 = 夹具树递归 readdirSync（工作区树零 manifest——库记账唯一通道）。
//
// Outcome → 测试映射：
//   Step1 success（accepted → 走查启动 + registerFeature 成链三件）………………………「冒烟」
//   Step1 walkthrough-not-started（未接受 = 零 feature 行·无提前成链）……………………「冒烟」头
//   Step1 validation-error-reason-empty（空因拒绝留场 + 无成链）……………………………「Step1b」
//   Step2 success（派发执行链：claim → submit 全绿 + 记录入自身库）……………………「冒烟」
//   Step2 manifest-md-appears（零 manifest 断言红形态——检测面正向承载）…………………「冒烟」
//   Step3 success（任务/执行记录 100% 入自身 forge.db）………………………………………「冒烟」
//   Step4 success（三视图/文档/提案子 tab 全景一致）…………………………………………「冒烟」
//   Step2 interrupted-recovery（blocked/fix 链机制照旧）…………………………………诚实映射
//   Step3 record-drift / Step4 panorama-inconsistent（断言红形态）……………………检测面正向承载
//   Step5 success / constitution-regression-red / accounting-omission…………………诚实映射
//
// 诚实映射（无 e2e 通道 / 已有承载面——不伪造断言）：
//   - Step2 interrupted-recovery（blocked + reason / fix 链自动恢复）→ M2
//     fix-chain-auto-recovery.spec.ts（block_source 单事务/链深/恢复钩子）+
//     worker-provisioning.spec.ts（本批 T1——addTask 逃生通道）+ dogfood（真实受阻径）；
//   - Step3 record-drift / Step4 panorama-inconsistent：合约为「断言红」检测形态（违规态
//     描述，非可装载产品行为）——同一断言面的正向承载即其检测效力（记录对账 + 全景一致
//     断言红即拒绝走查放行）；
//   - Step5 全族（总纲 SC2/SC3/SC7 回归绿 + 顺延表 #1–#13 与回写四条款合入 = SC-M3 门）
//     → dogfood-sc-m3.spec.ts（真实总纲回归 + 记账合入面）+ SC 套件（SC2/SC3/SC7 本体）。
//
// Assertion depth: 34/37 behavioral（92%），其中 deep 14/34（41%）——两阈均过。

import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovDocRowOf, ovSubtabOf, ttItemOf } from '../../support/anchors.js'

const WS_NAME = 'ws-jbw'

/** 递归找 manifest.md（走查树零 manifest 纪律——库记账唯一通道的文件系统对账） */
function findManifestMd(root: string): string[] {
  const hits: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'manifest.md') hits.push(full)
    }
  }
  walk(root)
  return hits
}

test('@web-e2e @m3 自举走查·冒烟：M3.5 同构走查（成链时序耦合 + 记录 100% 入自身库 + 全景一致 + 零 manifest）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbw-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbw-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jbw-m35'

    // ── Step1 walkthrough-not-started：提案 Draft 在库（可评审态）→ 未接受 = 零成链 ──
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'M3.5（知识沉淀）走查演示', mode: 'expedition',
    })) as { proposalId: string; slug: string }
    const db0 = openForgeDbAt(dir)
    try {
      expect(db0.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '走查不启动（未接受 = 无提前成链）').toBe(0)
    } finally {
      db0.close()
    }

    // ── Step1：评审 accepted（走查启动 = 立项时序耦合）→ registerFeature 成链三件 ──
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'M3.5（知识沉淀）走查演示' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('accepted')
    await expect(page.locator('[data-dswf-ov-vd-accepted-hint="expedition"]'), '远征 accepted 分叉文案 = 单步成链').toContainText('单步成链')
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jbw 走查启动（M3.5 立项评审接受）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(row, '提案行 = 已接受（走查启动）').toContainText('已接受', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    let featureId = ''
    try {
      const feature = db.prepare<unknown[], { id: string; proposal_id: string | null }>(
        `SELECT id, proposal_id FROM features WHERE proposal_id = ?`,
      ).get(proposal.proposalId)
      expect(feature, '成链 feature 行在场（走查启动即立项）').toBeDefined()
      featureId = (feature as { id: string }).id
      expect((feature as { proposal_id: string | null }).proposal_id, 'proposal_id 谱系挂接').toBe(proposal.proposalId)
      const audit = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id`,
      ).all(featureId)
      expect(audit, 'feature_records 审计行伴随（register·actor=core）').toEqual([{ verb: 'register', actor: 'core' }])
    } finally {
      db.close()
    }

    // ── 规格文档（write-prd/ui-design/tech-design 产出的 RPC 双门承载）──
    const COMMIT = '2468ace13579bdf02468ace13579bdf02468ace1'
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'prd-spec', relPath: `docs/features/${PROP}/prd/prd-spec.md`, summary: 'Jbw 走查 PRD' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'ui-design', relPath: `docs/features/${PROP}/ui/ui-design.md`, summary: 'Jbw 走查 UI 设计' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: PROP, docKind: 'tech-design', relPath: `docs/features/${PROP}/design/tech-design.md`, summary: 'Jbw 走查技术设计' })

    // ── Step2：派发开发链（回放主径）——任务 + 执行记录全入自身 forge.db ──
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '走查任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: PROP }, title: '走查任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-jbw-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'Jbw 走查甲结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jbw-executor',
    })
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t2.slug, localId: t2.localId }, sessionId: 'e2e-jbw-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t2.slug, localId: t2.localId }, result: 'success',
      summary: 'Jbw 走查乙结算', gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: 'e2e-jbw-executor',
    })

    // ── Step3：记录入库核查——任务/执行记录 100% 入自身 forge.db（无漂移）──
    const db2 = openForgeDbAt(dir)
    try {
      const statuses = db2.prepare<unknown[], { task_status: string; n: number }>(
        `SELECT task_status, COUNT(*) AS n FROM tasks GROUP BY task_status`,
      ).all()
      expect(statuses, '全部任务终态 completed（2 行——100% 在自身库）').toEqual([{ task_status: 'completed', n: 2 }])
      const perTask = db2.prepare<unknown[], { task_id: string; verbs: string }>(
        `SELECT task_id, GROUP_CONCAT(verb, ',') AS verbs FROM task_records GROUP BY task_id ORDER BY task_id`,
      ).all()
      expect(perTask, '每任务审计链齐（add → claim → submit——100% 入自身库）').toHaveLength(2)
      for (const rec of perTask) {
        expect((rec.verbs as string).includes('submit'), `任务 ${rec.task_id} 执行记录在自身库`).toBe(true)
      }
      const commits = db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE verb = 'submit' AND commit_hash IS NOT NULL`,
      ).get()?.n
      expect(commits, '执行记录含提交哈希（两行——提交哈希入自身库）').toBe(2)
      const docs = db2.prepare<unknown[], { doc_kind: string }>(
        `SELECT doc_kind FROM feature_documents WHERE feature_id = ? ORDER BY doc_kind`,
      ).all(featureId)
      expect(docs.map((d) => d.doc_kind), '规格文档三行入 feature_documents').toEqual(['prd-spec', 'tech-design', 'ui-design'])
    } finally {
      db2.close()
    }

    // ── Step2b：零 manifest.md（文件系统对账——库记账是唯一记账通道）──
    expect(findManifestMd(fixtureRoot), '走查树零 manifest.md（断言红形态的正向承载）').toEqual([])

    // ── Step4：全景一致（提案/文档/任务/记录跨面相互印证）──
    const propToggle = row.locator('[data-dswf-ov-parent-toggle]')
    await propToggle.click()
    await expect(propToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
    const propMeta = row.locator('xpath=following-sibling::div[@data-dswf-ov-meta]')
    await expect(propMeta, '谱系成链行在场').toContainText(`成链 → ${PROP}`, { timeout: 15_000 })
    await page.locator(ovSubtabOf('features')).click()
    const featRow = page.locator('[data-dswf-ov-parent]', { hasText: PROP }).first()
    await expect(featRow, 'feature 行在场').toBeVisible({ timeout: 30_000 })
    await featRow.locator('[data-dswf-ov-parent-toggle]').click()
    await expect(page.locator(ovDocRowOf(`docs/features/${PROP}/prd/prd-spec.md`)).first(), 'PRD 文档行（真实路径）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ovDocRowOf(`docs/features/${PROP}/design/tech-design.md`)).first(), '技术设计文档行').toBeVisible({ timeout: 15_000 })
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '任务行甲 = 已完成（全景一致）').toContainText('已完成', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(t2.taskId)).first(), '任务行乙 = 已完成（全景一致）').toContainText('已完成', { timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 自举走查·Step1b：空因拒绝留场——走查不启动（无成链 + 库不变）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbw2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jbw2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jbw-gate', title: 'Jbw 空因门演示', mode: 'expedition',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: proposal.proposalId, toStatus: 'under-review' })

    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jbw 空因门演示' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('accepted')
    // 空因提交 → 拒绝留场：无部分写库 + 无成链（走查不启动）
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd-error="reason-required"]'), '空因拒绝错误条在场').toBeVisible({ timeout: 10_000 })
    await expect(dialog, '对话框留场（近场可更正重试）').toBeVisible()
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(proposal.proposalId)?.proposal_status, '库不变（仍 under-review）').toBe('under-review')
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '无成链（走查不启动）').toBe(0)
    } finally {
      db.close()
    }
    // 补因后可提交（时序耦合门放行——走查启动）
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jbw 补因接受（空因门对照）')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    await expect(row, '补因后走查启动（已接受）').toContainText('已接受', { timeout: 30_000 })
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '补因后成链（单步三件同在）').toBe(1)
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
