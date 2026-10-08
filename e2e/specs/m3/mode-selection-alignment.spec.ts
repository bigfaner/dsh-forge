// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: mode-selection-alignment（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/mode-selection-alignment/contracts/
//   step-{1..5}-*.md（eval-contract 972/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——会话夹具 = hero 座位点选（blank 期 select 写入，
// 无需消息）；提案经回放主径建行。本件与 SC1（hero 投影四断言 + 自动对齐）旅程分工：
// SC1 承载 ①座位在场/默认远征 ②菜单序 ③blank 锁双信号 ④恢复投影重建 ⑤自动对齐主径；
// 本件承载合约其余 Outcome（幂等点选 / 无溯源不切换 / 错配守卫可读面）并交叉引用。
//
// Fact Table 摘录（源码核实）：
//   - 预设座位（m3.ts）：SEAT_ROOT = [data-slot="conversation.hero.agentPreset"]；座位
//     label = awaitSeatLabel（名册水化窗口轮询）；selectPreset（菜单「显示名+描述」组合
//     文本——中文显示名直出：远征模式/突击模式）；
//   - 提案行 mode chip = [data-dswf-mode-chip]（值 = expedition|blitz|unmarked；unmarked
//     = 缺省占位不可点——sc3 断言面）；行头「打开新会话」= [data-dswf-ov-opensession="<slug>"]；
//   - 任务容器 pill = [data-dswf-tt-contpill="proposal:<slug>"] + 琥珀点 .dswf-tt-contdot
//     [data-mode]（错配对照面：会话组合 vs 所打开内容模式）；派发按钮 =
//     [data-dswf-tt-dispatch="on"]（零阻断判据——亮起可点）；
//   - 座位菜单序 = order 1（远征）/ 2（突击）——SC1② 已断相对序。
//
// Outcome → 测试映射：
//   Step1 success（座位在场 + 折叠标签远征 + 菜单双入口中文直出）……………………………「T1」
//   Step2 success（blank 期点选突击 → 组合即时切换）…………………………………………………「T1」
//   Step2b idempotent-default-select（点选当前已选 = 投影稳定零漂移）……………………「T1」
//   Step4 success（提案绑定入口自动对齐——座位标签突击）…………………………………………「T2」
//   Step4b no-mode-source-keeps-default（无溯源不切换——select 不调用沿 registry 当前
//     选择（净默认远征世界归 T1 Step1）+ chip 缺省占位）…………………………………………………「T2」
//   Step5 success / 5b honest-accounting-mismatch（错配守卫可读面 + 零阻断 +
//     下游读溯源字段不读会话预设）…………………………………………………………………………………「T3」
//   Step1b hero-switch-off / Step1c settings-toggle-roundtrip………………………………诚实映射
//   Step2c restart-mid-state / Step3b post-lock-no-switch / Step3c restart-restore…交叉引用 SC1
//
// 诚实映射 / 交叉引用（无 e2e 通道或已有承载面——不伪造断言）：
//   - Step1b hero-switch-off + Step1c settings-toggle-roundtrip：ui-settings 行属官方
//     上游设置域（enabled 开关 + 行所有权让位）——官方设置对话框开启通道在 e2e 无先例锚
//     （本仓零 spec 曾开官方设置面）；表单行为由上游 ui-settings 插件承载 + boot 首启预置
//     由 apps/host/src/boot/overlay*.test.ts 承载（welcomeNoticeVersion/预置行让位面）；
//   - Step2c restart-mid-state（已选未锁中间态恢复）：与 SC1④ 同一投影重建通道（合约
//     reasoning 自证「恢复投影按会话 agentPreset 重建——S5 已验」）→ sc1-hero-projection
//     .spec.ts ④ 承载（复启 → 会话头投影标签同款）；
//   - Step3b post-lock-no-switch（座位卸载/点选超时双信号 + 阳性对照）→ SC1③ 承载；
//   - Step3c restart-restore-existing（既有会话重启投影重建同款组合）→ SC1④ 承载；
//   - 派发入口提示行（错配守卫的提示半段）= run-tasks 技能提示词面（3.6 core skills
//     改写——「错配守卫提示行」）→ 技能文件内容承载，非浏览器 DOM 面。
//
// Assertion depth: 26/28 behavioral（93%），其中 deep 10/26（38%）——两阈均过。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { forgeInvoke } from '../../support/rpc.js'
import { ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { awaitSeatLabel, seatLabel, seatPresent, seatRoot, selectPreset } from '../../support/m3.js'

const WS_NAME = 'ws-jmsa'

test('@web-e2e @m3 模式选择·T1：座位在场默认远征 + 菜单双入口中文直出 + blank 点选突击 + 幂等点选零漂移', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page, pageErrors } = launched
  try {
    await registerProject(page, wsDir, WS_NAME)
    await selectWorkspaceViaChip(page, WS_NAME)

    // ── Step1：预设座位在场 + 折叠标签 = 远征（registry 默认）──
    expect(await seatPresent(page), '预设座位在场（hero 面——ui-settings 首启预置开启）').toBe(true)
    const label = await awaitSeatLabel(page)
    expect(label.includes('远征') || label.includes('expedition'), `默认预设 = 远征（label=${label}）`).toBe(true)

    // ── 菜单双入口：中文显示名直出 + 远征在前（order 1/2——相对序）──
    await seatRoot(page).locator('button').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    const itemTexts = await menu.locator('[role="menuitem"], li, button').allInnerTexts()
    const idxExp = itemTexts.findIndex((t) => t.includes('远征模式'))
    const idxBlitz = itemTexts.findIndex((t) => t.includes('突击模式'))
    expect(idxExp, `菜单含「远征模式」中文直出（items=${JSON.stringify(itemTexts)}）`).toBeGreaterThanOrEqual(0)
    expect(idxBlitz, '菜单含「突击模式」中文直出').toBeGreaterThanOrEqual(0)
    expect(idxExp, '远征在前（order 1/2）').toBeLessThan(idxBlitz)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden({ timeout: 10_000 })

    // ── Step2b：幂等点选——点选当前已选「远征模式」→ 组合不漂移 ──
    await selectPreset(page, '远征模式')
    const idempotent = await awaitSeatLabel(page)
    expect(idempotent.includes('远征') || idempotent.includes('expedition'), `幂等点选后标签保持远征（label=${idempotent}）`).toBe(true)

    // ── Step2：blank 期点选「突击模式」→ 组合即时切换 ──
    await selectPreset(page, '突击模式')
    const switched = await awaitSeatLabel(page)
    expect(switched.includes('突击') || switched.includes('blitz'), `切换后标签 = 突击（label=${switched}）`).toBe(true)
    // 再点远征可回切（blank 期未锁——可逆窗口佐证）
    await selectPreset(page, '远征模式')
    const back = await awaitSeatLabel(page)
    expect(back.includes('远征') || back.includes('expedition'), 'blank 期可再切（未锁窗口）').toBe(true)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 模式选择·T2：提案绑定入口自动对齐（突击）+ 无溯源提案不切换（沿 registry 当前选择不重绑 + chip 占位）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    const blitzProp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jmsa-blitz', title: 'Jmsa 突击对齐提案', mode: 'blitz',
    })) as { proposalId: string; slug: string }
    const unmarked = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jmsa-old', title: 'Jmsa 无溯源提案（扫描吸收形态）',
    })) as { proposalId: string; slug: string }
    await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: blitzProp.slug }, title: '对齐演示直挂任务', type: 'doc',
    })

    // ── Step4：经提案绑定入口创建新会话 → 自动对齐突击（blank 期 select）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const blitzOpen = page.locator(`[data-dswf-ov-opensession="${blitzProp.slug}"]`).first()
    await expect(blitzOpen, '突击提案行头「打开新会话」在场').toBeVisible({ timeout: 30_000 })
    await blitzOpen.click()
    expect(await seatPresent(page), '新会话预设座位在场（blank 期）').toBe(true)
    const deadline = Date.now() + 30_000
    let label = ''
    while (Date.now() < deadline) {
      label = await seatLabel(page)
      if (label.includes('突击') || label.includes('blitz')) break
      await page.waitForTimeout(1_000)
    }
    expect(label.includes('突击') || label.includes('blitz'), `自动对齐 = 突击（label=${label}——无需逐会话手选）`).toBe(true)

    // ── Step4b：无溯源提案（mode NULL）经绑定入口 → 不切换——open-session.ts 机制：
    // mode 缺席 = agentPreset.select 不调用，座位沿 registry 当前选择（Step4 已立 = 突击；
    // 「registry 默认 = 远征」的净默认世界由 T1 Step1 承载）。不切换的可观测 = 座位横跨
    // 本动作保持既有选择不变（若误按默认重绑远征，此处即红）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    const unmarkedRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Jmsa 无溯源提案（扫描吸收形态）' }).first()
    await expect(unmarkedRow, '无溯源提案行在场').toBeVisible({ timeout: 30_000 })
    await expect(unmarkedRow.locator('[data-dswf-mode-chip]'), 'mode chip 缺省占位（不伪装成任一模式）').toHaveAttribute('data-dswf-mode-chip', 'unmarked')
    const unmarkedOpen = page.locator(`[data-dswf-ov-opensession="${unmarked.slug}"]`).first()
    await expect(unmarkedOpen, '无溯源行头「打开新会话」在场').toBeVisible({ timeout: 15_000 })
    await unmarkedOpen.click()
    expect(await seatPresent(page), '第二新会话座位在场（blank 期）').toBe(true)
    const deadline2 = Date.now() + 30_000
    let label2 = ''
    while (Date.now() < deadline2) {
      label2 = await seatLabel(page)
      if (label2.includes('突击') || label2.includes('blitz')) break
      await page.waitForTimeout(1_000)
    }
    expect(label2.includes('突击') || label2.includes('blitz'), `无溯源不切换（select 未调用——沿 registry 当前选择突击；label=${label2}）`).toBe(true)
    // 溯源不变（不伪装成任一模式——库面）
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM proposals WHERE id = ?`).get(unmarked.proposalId)?.mode, '无溯源提案 mode NULL（不切换判据的库面）').toBeNull()
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

test('@web-e2e @m3 模式选择·T3：错配守卫可读面零阻断（会话组合 vs 内容模式对照 + 下游读溯源字段）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jmsa3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    // Step5b 世界：hero 自由远征会话（默认——无提案上下文）+ 带直挂任务的 blitz 提案
    const blitzProp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'jmsa-guard', title: 'Jmsa 错配守卫演示提案', mode: 'blitz',
    })) as { proposalId: string; slug: string }
    const task = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: blitzProp.slug }, title: '错配守卫直挂任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    await selectWorkspaceViaChip(page, WS_NAME)

    // 会话组合 = 远征（hero 自由——座位标签对照面）
    const seat = await awaitSeatLabel(page)
    expect(seat.includes('远征') || seat.includes('expedition'), `会话组合 = 远征（label=${seat}——hero 自由会话）`).toBe(true)

    // 所打开内容模式 = blitz（提案行 mode chip + 任务容器琥珀点——mode chip 对照面）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    const propRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Jmsa 错配守卫演示提案' }).first()
    await expect(propRow, '提案行在场').toBeVisible({ timeout: 30_000 })
    await expect(propRow.locator('[data-dswf-mode-chip]'), 'mode chip 对照 = 突击（内容模式投影）').toHaveAttribute('data-dswf-mode-chip', 'blitz')

    // 任务子 tab：切突击提案容器（琥珀点）+ 派发入口亮起（守卫零阻断——可继续工作）
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menuItem = page.locator(`[data-dswf-tt-mcont="proposal:${blitzProp.slug}"]`).first()
    await expect(menuItem, '容器菜单含突击提案容器').toBeVisible({ timeout: 15_000 })
    await menuItem.click()
    const pill = page.locator(`[data-dswf-tt-contpill="proposal:${blitzProp.slug}"]`)
    await expect(pill, '容器 pill 切至突击提案').toBeVisible({ timeout: 15_000 })
    await expect(pill.locator('.dswf-tt-contdot'), '琥珀点 = blitz 容器标记（内容模式对照面）').toHaveAttribute('data-mode', 'blitz')
    await expect(page.locator(ttItemOf(task.taskId)).first(), '直挂任务行在场（任务工作可继续）').toBeVisible({ timeout: 30_000 })
    const dispatchOn = page.locator('[data-dswf-tt-dispatch="on"]').first()
    await expect(dispatchOn, '派发入口亮起（可见性守卫零阻断）').toBeVisible({ timeout: 15_000 })
    await expect(dispatchOn, '派发按钮可点（不阻断）').toBeEnabled()

    // 下游读溯源字段不读会话预设（SC3）：任务 mode 快照 = blitz（会话远征不改语义）
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM tasks WHERE id = ?`).get(task.taskId)?.mode, '任务语义按创建时快照（blitz——会话组合零影响）').toBe('blitz')
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
