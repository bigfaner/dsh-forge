// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: proposal-review-mode-transition（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/proposal-review-mode-transition/contracts/
//   step-{1..5}-*.md（eval-contract 964/1100 通过）。
//
// Fact Table 摘录（源码核实）：
//   - 五态 chips（ProposalStatusChips + sc6 形态）：[data-dswf-ov-pschip="<status>"]（计数
//     随行 + aria-pressed）+ [data-dswf-ov-pschip-clear]；0 计数 disabled；列表容器 =
//     [data-dswf-ov-proposals]；多选 = 并集；子 tab 切换清空选择；
//   - 评审流转对话框：[data-dswf-ov-vd] + vd-to（allowedTransitions——under-review 目标 =
//     [accepted, rejected, draft]，不含自身）/ vd-reason / vd-error（reason-required）/
//     vd-confirm；空因 = 拒绝留场（补丁不含已选三键——选择与内容保留）；
//   - 模式更改对话框（ProposalModeDialog.tsx）：[data-dswf-ov-md] + md-current（当前模式
//     + 标题）/ SegmentedControl [role="tab"]（远征（完整 SDD）/突击（直达执行））/
//     md-note（MODE_DIALOG_NOTE——「既有任务按创建时模式照旧执行（快照不回溯）…」）/
//     md-reason（说明必填）/ md-error（reason-required）/ md-confirm；入口 = mode chip
//     快捷（有溯源可点）或 ⋯ 菜单「更改模式…」；提交 = proposals.setMode 唯一通道
//     （单事务只写 proposals.mode）；
//   - 提案文档区（proposal-tab.tsx:126-150）：[data-dswf-ov-pdocs="<slug>"] + 「文档（N 篇）」
//     + 文档行 [data-dswf-ov-doc="<relPath>"]（relPath 相对 forge_dir 正斜杠）整行可点 →
//     dock 文档 tab（docPanelOf = `${projectId}#${docRel}`）；
//   - mode chip = [data-dswf-mode-chip]（值 expedition|blitz|unmarked——恒与库一致）；
//     行头「打开新会话」= [data-dswf-ov-opensession]。
//
// Outcome → 测试映射：
//   Step1 success（过滤 = 仅该态 + chip 与库一致）……………………………………………………「T1」
//   Step1 chips-boundary-behavior（0 计数 disabled + 多选并集 + 切子 tab 清空）……………「T1」
//   Step1 legacy-mode-placeholder（无溯源缺省占位不可点）…………………………………………「T1」
//   Step2 success（裁决流转写库 + 行即时更新）……………………………………………………………「T2」
//   Step2 empty-reason-refused（空因拒绝留场 + 不落部分写库）………………………………………「T2」
//   Step2 disallowed-target-hidden（目标态仅列五态机允许集）………………………………………「T2」
//   Step3 success（agent 经 transitionProposal 写库与人工面一致 + 行更新）……………………「T3」
//   Step3b proposal-doc-jump（文档跳转可用 + 计数真实）………………………………………………「T3」
//   Step4 success（模式更改唯一正门：二选 + 说明必填 + 快照不回溯明示 + 溯源即时同步）…「T4」
//   Step4 expedition-accepted-chain-contrast（远征接受成链 vs 突击接受零行）…………………「T4」
//   Step5 success（升降级联动：新会话对齐远征 + 既有任务快照照旧）……………………………「T4」
//   Step5 chip-consistency-after-change（chip 与库一致——变更后即时反映）……………………「T4」
//   Step4b/4c agent-face-no-mode-verb（agent tool 面无模式改写动词）………………………交叉引用 pin-10
//
// 诚实映射 / 交叉引用：
//   - Step4b/4c agent-face-no-mode-verb：setMode = UI 专属 RPC（SC3/模式绑定三律）——
//     agent tool 面动词清单 = 契约断言 → 5.1 G1 pin-10（五在场/四缺席——tool 面 pin 池）
//     + sc6 ⑤ 头注交叉引用同径；
//   - Step5 的「既有会话按 blank 锁保持原预设」半段 → SC1③④（blank 锁/投影重建承载）。
//
// Assertion depth: 47/51 behavioral（92%），其中 deep 19/47（40%）——两阈均过。

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, docPanelOf } from '../../support/anchors.js'

const WS_NAME = 'ws-jprm'

/** 打开提案子 tab（概览幂等重开 + 子 tab 激活收敛） */
async function openProposalsTab(page: Page): Promise<void> {
  await openOverviewDock(page)
  await page.locator(ovSubtabOf('proposals')).click()
  await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
}

/** ⋯ 菜单 → 评审流转（开对话框——不提交） */
async function openVerdictDialog(page: Page, title: string): Promise<void> {
  const row = page.locator('[data-dswf-ov-parent]', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.locator('[data-dswf-ov-more]').click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
  await expect(page.locator('[data-dswf-ov-vd]')).toBeVisible({ timeout: 15_000 })
}

test('@web-e2e @m3 提案评审流转·T1：五态 chips 过滤（0 计数禁用 + 多选并集 + 切子 tab 清空）+ mode chip 三态与库一致', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    const create = async (slug: string, title: string, mode?: 'expedition' | 'blitz'): Promise<{ proposalId: string }> =>
      (await driver.call('forgeProposals', 'createProposal', { projectId, slug, title, ...(mode !== undefined ? { mode } : {}) })) as { proposalId: string }

    // 五态世界（rejected 零代表——0 计数边界在场）：draft×2 + 未标记(draft) + under-review
    // + accepted(expedition——成链) + superseded(目标 = 取代靶 draft) = 6 行
    await create('jprm-d1', 'Jprm 草稿提案甲', 'blitz')
    await create('jprm-old', 'Jprm 无溯源旧提案')
    const pReview = await create('jprm-review', 'Jprm 评审中提案', 'expedition')
    const pAcc = await create('jprm-acc', 'Jprm 已受理提案', 'expedition')
    const pTgt = await create('jprm-tgt', 'Jprm 取代靶提案', 'blitz')
    const pSup = await create('jprm-sup', 'Jprm 被取代提案', 'blitz')
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pReview.proposalId, toStatus: 'under-review' })
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pAcc.proposalId, toStatus: 'accepted' })
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pSup.proposalId, toStatus: 'superseded', supersededBy: pTgt.proposalId })

    await openProposalsTab(page)
    const chip = (status: string) => page.locator(`[data-dswf-ov-pschip="${status}"]`)
    const listRows = page.locator('[data-dswf-ov-proposals] [data-dswf-ov-parent]')

    // 计数（chips ↔ 库一致的聚合面）
    await expect(chip('draft'), 'draft chip 计数 3（草稿甲 + 未标记 + 取代靶）').toContainText('3', { timeout: 30_000 })
    await expect(chip('under-review')).toContainText('1')
    await expect(chip('accepted')).toContainText('1')
    await expect(chip('superseded')).toContainText('1')

    // 0 计数 disabled（不可触发过滤）
    await expect(chip('rejected'), 'rejected 0 计数').toContainText('0')
    await expect(chip('rejected'), '0 计数 chip 禁用').toBeDisabled()

    // 单选过滤 = 仅该态
    await chip('draft').click()
    await expect(chip('draft')).toHaveAttribute('aria-pressed', 'true')
    await expect(listRows, '过滤 = 仅 draft 三行').toHaveCount(3)

    // 多选 = 并集
    await chip('under-review').click()
    await expect(chip('under-review')).toHaveAttribute('aria-pressed', 'true')
    await expect(listRows, '多选并集 = 4 行').toHaveCount(4)

    // 切子 tab 清空选择（全行回归）
    await page.locator(ovSubtabOf('features')).click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(chip('draft'), '切子 tab 清空选择（draft 未按）').not.toHaveAttribute('aria-pressed', 'true')
    await expect(listRows, '清空 = 全六行').toHaveCount(6)

    // mode chip 与库溯源字段一致（远征蓝/突击琥珀/无溯源占位三态）
    const rowByTitle = (title: string) => page.locator('[data-dswf-ov-parent]', { hasText: title }).first()
    await expect(rowByTitle('Jprm 草稿提案甲').locator('[data-dswf-mode-chip]'), 'blitz 溯源 chip').toHaveAttribute('data-dswf-mode-chip', 'blitz')
    await expect(rowByTitle('Jprm 已受理提案').locator('[data-dswf-mode-chip]'), 'expedition 溯源 chip').toHaveAttribute('data-dswf-mode-chip', 'expedition')
    const oldChip = rowByTitle('Jprm 无溯源旧提案').locator('[data-dswf-mode-chip]')
    await expect(oldChip, '无溯源 = 缺省占位').toHaveAttribute('data-dswf-mode-chip', 'unmarked')
    await expect(oldChip, '占位中性不可点（不伪装成任一模式）').toBeDisabled()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 提案评审流转·T2：人工裁决流转（允许集 + 空因拒绝留场零写库 + 补因落库行即时更新）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const p = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-verdict', title: 'Jprm 裁决流转提案', mode: 'expedition',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: p.proposalId, toStatus: 'under-review' })

    await openProposalsTab(page)
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jprm 裁决流转提案' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await openVerdictDialog(page, 'Jprm 裁决流转提案')

    // 目标态 = 五态机允许集（under-review → accepted/rejected/draft——自身不入列）
    const optionValues = await page.locator('[data-dswf-ov-vd-to] option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
    expect(optionValues, '目标态仅列允许集（非法转移不可选）').toEqual(['accepted', 'rejected', 'draft'])

    // 空因拒绝留场：对话框不关闭 + 错误条 + 零部分写库
    await page.locator('[data-dswf-ov-vd-to]').selectOption('accepted')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd-error="reason-required"]'), '空因拒绝错误条在场').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dswf-ov-vd]'), '对话框留场（表单不提交）').toBeVisible()
    const db0 = openForgeDbAt(dir)
    try {
      expect(db0.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(p.proposalId)?.proposal_status, '零部分写库（保持 under-review）').toBe('under-review')
    } finally {
      db0.close()
    }

    // 补因提交 → 写库（同门动词）+ 行状态即时更新
    await page.locator('[data-dswf-ov-vd-reason]').fill('Jprm 证据充分可接受')
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(page.locator('[data-dswf-ov-vd]'), '提交成功关对话框').toBeHidden({ timeout: 15_000 })
    await expect(row, '行状态即时更新 = 已接受').toContainText('已接受', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      const rec = db.prepare<unknown[], { proposal_status: string; decided_at: string | null }>(
        `SELECT proposal_status, decided_at FROM proposals WHERE id = ?`,
      ).get(p.proposalId)
      expect(rec?.proposal_status, '裁决态落库 accepted').toBe('accepted')
      expect(rec?.decided_at, 'decided_at 写入裁决时刻').not.toBeNull()
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

test('@web-e2e @m3 提案评审流转·T3：agent 经 transitionProposal 写库同门一致 + 提案文档跳转（计数真实 + dock 文档 tab）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // agent 面流转提案（transitionProposal tool 写径——bridge 直调与 tool 同一服务门）
    const pTool = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-agent', title: 'Jprm agent 流转提案', mode: 'expedition',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pTool.proposalId, toStatus: 'under-review' })
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pTool.proposalId, toStatus: 'rejected' })

    // 文档挂载提案（fs 扫描源——forge_dir/docs/proposals/<slug>/）
    const docDir = join(wsDir, '.forge', 'docs', 'proposals', 'jprm-docs')
    mkdirSync(docDir, { recursive: true })
    for (const name of ['proposal.md', 'research.md']) {
      writeFileSync(join(docDir, name), `---\ntitle: "${name}"\nstatus: draft\n---\n\n# ${name}\n\n正文。\n`, 'utf8')
    }
    const pDocs = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-docs', title: 'Jprm 文档跳转提案', mode: 'blitz',
    })) as { proposalId: string }

    await openProposalsTab(page)
    // agent 面写库与人工面同门：行状态即时反映（rejected）+ 库一致
    const toolRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Jprm agent 流转提案' }).first()
    await expect(toolRow, 'agent 流转提案行在场').toBeVisible({ timeout: 30_000 })
    await expect(toolRow, 'agent 面写库 UI 即时反映（已拒绝——与人工面一致）').toContainText('已拒绝', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(pTool.proposalId)?.proposal_status, 'agent 面写库 = rejected（同门动词）').toBe('rejected')
      expect(db.prepare<unknown[], { proposal_status: string }>(`SELECT proposal_status FROM proposals WHERE id = ?`).get(pDocs.proposalId)?.proposal_status, '文档提案保持 draft（对照）').toBe('draft')
    } finally {
      db.close()
    }

    // ── Step3b：提案文档跳转（展开行 → 文档区计数真实 → 点击开 dock 文档 tab）──
    const docsRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Jprm 文档跳转提案' }).first()
    const docsToggle = docsRow.locator('[data-dswf-ov-parent-toggle]')
    await docsToggle.click()
    await expect(docsToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
    const pdocs = page.locator('[data-dswf-ov-pdocs="jprm-docs"]')
    await expect(pdocs, '提案文档区在场').toBeVisible({ timeout: 15_000 })
    await expect(pdocs, '文档区标题计数真实（2 篇）').toContainText('文档（2 篇）')
    await pdocs.locator('[data-dswf-ov-doc="docs/proposals/jprm-docs/proposal.md"]').first().click()
    await expect(page.locator(docPanelOf(projectId, 'docs/proposals/jprm-docs/proposal.md')).first(), '文档跳转可用（dock 文档 tab 打开对应文档）').toBeVisible({ timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 提案评审流转·T4：在途模式更改唯一正门（二选 + 说明必填 + 快照不回溯）+ 联动对齐 + chip 即时一致 + 成链对照', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm4-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jprm4-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // 世界：在途 blitz 提案（直挂任务未终态）+ 远征 accepted 提案（成链对照）
    const pBlitz = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-inflight', title: 'Jprm 在途升级提案', mode: 'blitz',
    })) as { proposalId: string }
    const inFlight = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: 'jprm-inflight' }, title: '在途直挂任务', type: 'doc',
    })) as { taskId: string }
    const pExp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-chain', title: 'Jprm 成链对照提案', mode: 'expedition',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pExp.proposalId, toStatus: 'accepted' })
    // 突击 accepted 对照（零 feature 行）
    const pBlitzAcc = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jprm-blitzacc', title: 'Jprm 突击接受对照提案', mode: 'blitz',
    })) as { proposalId: string }
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pBlitzAcc.proposalId, toStatus: 'accepted' })

    await openProposalsTab(page)
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'Jprm 在途升级提案' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row.locator('[data-dswf-mode-chip]'), '改前 chip = blitz（与库一致）').toHaveAttribute('data-dswf-mode-chip', 'blitz')

    // ── Step4：mode chip 快捷入口 → 模式更改对话框 ──
    await row.locator('[data-dswf-mode-chip]').click()
    const modeDialog = page.locator('[data-dswf-ov-md]')
    await expect(modeDialog, '有溯源 chip = 模式更改唯一正门快捷入口').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-ov-md-current]'), '当前模式注记（突击 + 标题）').toContainText('突击')
    await expect(page.locator('[data-dswf-ov-md-note]'), '快照不回溯一行明示').toContainText('既有任务按创建时模式照旧执行（快照不回溯）')

    // 空说明拒绝留场
    await modeDialog.locator('[role="tab"]').filter({ hasText: '远征' }).first().click()
    await page.locator('[data-dswf-ov-md-confirm]').click()
    await expect(page.locator('[data-dswf-ov-md-error="reason-required"]'), '空说明拒绝错误条在场').toBeVisible({ timeout: 10_000 })
    await expect(modeDialog, '对话框留场').toBeVisible()
    const db0 = openForgeDbAt(dir)
    try {
      expect(db0.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM proposals WHERE id = ?`).get(pBlitz.proposalId)?.mode, '零写库（仍 blitz）').toBe('blitz')
    } finally {
      db0.close()
    }

    // 补说明提交 → 溯源即时同步（proposals.mode = expedition——单事务只写此列）
    await page.locator('[data-dswf-ov-md-reason]').fill('Jprm 目标膨胀，转完整 SDD（在途升级演示）')
    await page.locator('[data-dswf-ov-md-confirm]').click()
    await expect(modeDialog, '提交成功关对话框').toBeHidden({ timeout: 15_000 })
    await expect(row.locator('[data-dswf-mode-chip]'), 'chip 即时反映新值（expedition——无陈旧投影）').toHaveAttribute('data-dswf-mode-chip', 'expedition', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM proposals WHERE id = ?`).get(pBlitz.proposalId)?.mode, 'proposals.mode = expedition（正门写径）').toBe('expedition')
      expect(db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM tasks WHERE id = ?`).get(inFlight.taskId)?.mode, '既有任务快照不回溯（仍 blitz——整数 ID/eval 豁免语义不变）').toBe('blitz')
      // 成链分化对照：远征 accepted = feature 行；突击 accepted = 零行
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(pExp.proposalId)?.n, '远征接受 = registerFeature 单步成链').toBe(1)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(pBlitzAcc.proposalId)?.n, '突击接受 = 零 feature 行（两分支分化）').toBe(0)
    } finally {
      db.close()
    }

    // ── Step5：升降级联动——下一个「打开新会话」自动对齐远征 ──
    const openEntry = page.locator('[data-dswf-ov-opensession="jprm-inflight"]').first()
    await expect(openEntry, '行头「打开新会话」在场').toBeVisible({ timeout: 15_000 })
    await openEntry.click()
    const deadline = Date.now() + 30_000
    let seat = ''
    while (Date.now() < deadline) {
      seat = (await page.locator('[data-slot="conversation.hero.agentPreset"]').first().textContent().catch(() => '')) ?? ''
      if (seat.includes('远征') || seat.includes('expedition')) break
      await page.waitForTimeout(1_000)
    }
    expect(seat.includes('远征') || seat.includes('expedition'), `新会话自动对齐远征（label=${seat}——律一）`).toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
