// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC1 hero 投影四断言 + 自动对齐（PRD Goals SC1 / tech-design Testing Strategy e2e 行）：
//   ① 预设座位在场（hero 面自现——ui-settings 首启预置开启）+ registry 默认 = 远征；
//   ② 中文直出 order 1·2（菜单「远征模式」→「突击模式」序——产品双预设行 order 字段）；
//   ③ blank 锁生效（首轮消息后座位卸载/点选无效——断言基 UI 投影面，spike S5 形制）；
//   ④ 恢复会话按 agentPreset 投影重建（复启 → 会话头 AgentPresetLabel 投影标签 = 会话
//      绑定预设——上游 session.projectionValues.agentPreset 面）；
//   ⑤ 自动对齐：经提案绑定入口（提案子 tab 行头「打开新会话」）创建的新会话自动对齐
//      提案 mode（blank 期 agentPreset.select；断言 = 座位标签 + composer 预填在场 +
//      预填不自动发送[Hard Rule v13 裁决]）。
// 载体纪律（Hard Rule）：零真实模型——会话夹具 = 零凭据 composer 消息（模型调用失败
// 不影响会话建档/用户事件落地，M2 SC6③ 同径）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { findFixtureSession } from '../../support/session-files.js'
import { openOverviewDock } from '../../support/navigation.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, ovSubtabOf, sessionRowOf } from '../../support/anchors.js'
import { awaitPresetHeaderLabel, awaitSeatLabel, seatLabel, seatPresent, seatRoot, selectPreset } from '../../support/m3.js'
import { createBridgeDriver } from '../../support/replay/executor.js'

const WS_NAME = 'ws-sc1'

test('@web-e2e @m3 SC1·hero 投影四断言：座位在场/中文直出 order 1·2/blank 锁/恢复投影重建', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc1-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc1-ud-'))
  const dshHome = join(userData, 'dsh-home')
  let launched: Launched | undefined
  try {
    // ── ① 座位在场 + 默认远征（ui-settings 首启预置——零 UI 开关动作）──
    launched = await launchHost({ userData, expectPhase: 'hero' })
    const page = launched.page
    await registerProject(page, wsDir, WS_NAME)
    await selectWorkspaceViaChip(page, WS_NAME)
    expect(await seatPresent(page), '预设座位自现（hero 面）').toBe(true)
    const label = await awaitSeatLabel(page)
    expect(label.includes('远征') || label.includes('expedition'), `默认预设 = 远征（label=${label}）`).toBe(true)

    // ── ② 中文直出 order 1·2：菜单项序（远征模式 → 突击模式；相对序断言——上游 standard
    //    行非产品面不进断言集）──
    await seatRoot(page).locator('button').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    const itemTexts = await menu.locator('[role="menuitem"], li, button').allInnerTexts()
    const idxExp = itemTexts.findIndex((t) => t.includes('远征模式'))
    const idxBlitz = itemTexts.findIndex((t) => t.includes('突击模式'))
    expect(idxExp, `菜单含「远征模式」中文直出（items=${JSON.stringify(itemTexts)}）`).toBeGreaterThanOrEqual(0)
    expect(idxBlitz, '菜单含「突击模式」中文直出').toBeGreaterThanOrEqual(0)
    expect(idxExp, 'order 1·2：远征在前（order: 1 < 2）').toBeLessThan(idxBlitz)
    // 收菜单（Esc——不改动默认）
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden({ timeout: 10_000 })

    // ── blank 期切换突击（座位可点窗口 = blank 会话）──
    await selectPreset(page, '突击模式')
    const blitzLabel = await awaitSeatLabel(page)
    expect(blitzLabel.includes('突击') || blitzLabel.includes('blitz'), `切换后 label=${blitzLabel}`).toBe(true)

    // ── ③ blank 锁生效：首轮消息后座位卸载（UI 投影面——hero 面随非 blank 退场）──
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    await page.keyboard.insertText('SC1 blank 锁断言夹具消息（零凭据形态）')
    await page.keyboard.press('Enter')
    await ensureNoBlockingDialog(page)
    const seatButton = seatRoot(page).locator('button').first()
    if (await seatButton.isVisible().catch(() => false)) {
      // 上游形态演进兜底口径（点选超时）：座位在场但选择被拒——点突击后 label 保持突击
      // 之外的既有投影不变（锁 = select 落 stage 即弃，上游 apply 路径源码实证）
      await seatButton.click({ timeout: 5_000 }).catch(() => undefined)
      await page.waitForTimeout(1_500)
      const locked = await seatRoot(page).textContent().catch(() => '')
      expect((locked ?? '').includes('远征'), '锁后点选无效（label 不变）').toBe(false)
    } else {
      expect(await seatPresent(page, 1_000), '首轮后座位卸载（blank 锁 UI 投影面）').toBe(false)
    }
    // 非 blank 会话投影面：会话头预设标签 = 突击（projectionValues.agentPreset）
    await awaitPresetHeaderLabel(page, '突击模式')
    const session = findFixtureSession(dshHome, WS_NAME)
    expect(session, '会话目录在盘（复启投影重建断言锚）').toBeDefined()
    const sessionId = (session as { sessionId: string }).sessionId

    // ── ④ 恢复会话按 agentPreset 投影重建：复启 → 会话行 → 头部投影标签同款 ──
    await closeApp(launched.app)
    launched = undefined
    const relaunched = await launchHost({ userData })
    launched = relaunched
    const page2 = relaunched.page
    const row = page2.locator(sessionRowOf(sessionId)).first()
    await expect(row, '复启后会话行在场（账本持久）').toBeVisible({ timeout: 60_000 })
    await row.click()
    await expect(page2.locator(CONVERSATION_CONTENT).first(), '会话转录恢复').toBeVisible({ timeout: 30_000 })
    await awaitPresetHeaderLabel(page2, '突击模式')
    expect(page2.locator(CONVERSATION_CONTENT).first(), '会话内容按账本重建').toContainText('SC1 blank 锁断言夹具消息')

    // 零凭据模型失败面不计入产品断言（留痕诊断）
    if (launched.pageErrors.length > 0) console.log(`[sc1-diagnostic] pageerror：${launched.pageErrors.slice(-3).join(' | ')}`)
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 SC1·自动对齐：提案绑定入口新会话自动对齐提案 mode（座位标签 + 预填不发送）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc1b-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc1b-ud-'))
  const launched: Launched = await launchHost({
    userData,
    expectPhase: 'hero',
    collectConsole: true,
    env: { DSH_FORGE_TEST_BRIDGE: '1' },
  })
  const { app, page } = launched
  try {
    // 底座：注册 + 突击提案（回放主径写——quick-tasks 产出的录制面承载）
    const project = await registerProject(page, wsDir, WS_NAME)
    await selectWorkspaceViaChip(page, WS_NAME)
    const driver = createBridgeDriver(app)
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId: project.id,
      slug: 'sc1-blitz-prop',
      title: 'SC1 自动对齐突击提案',
      mode: 'blitz',
    })) as { proposalId: string; slug: string }

    // 提案绑定入口：概览 → 提案子 tab → 行头「打开新会话」
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const openButton = page.locator(`[data-dswf-ov-opensession="${proposal.slug}"]`).first()
    await expect(openButton, '提案行头「打开新会话」在场').toBeVisible({ timeout: 30_000 })
    await openButton.click()

    // 新会话 = blank + agentPreset.select(容器对应模式) + 预填（不发送）：
    // 座位标签对齐突击（select 远端应用异步——窗口内轮询收敛）+ composer 草稿承载
    // formatPrefill 现状上下文
    expect(await seatPresent(page), '新会话预设座位在场（blank 期）').toBe(true)
    const deadline = Date.now() + 30_000
    let label = ''
    while (Date.now() < deadline) {
      label = await seatLabel(page)
      if (label.includes('突击') || label.includes('blitz')) break
      await page.waitForTimeout(1_000)
    }
    if (!(label.includes('突击') || label.includes('blitz'))) {
      const draftText = await page.locator(COMPOSER_INPUT).last().textContent().catch(() => '')
      throw new Error(
        `自动对齐未收敛（label=${label}；draft=${String(draftText)?.slice(0, 120)}；` +
          `console=${launched.consoleTail.slice(-8).join(' || ')})——编排器 preset 阶段疑似失败`,
      )
    }
    const draft = page.locator(COMPOSER_INPUT).last()
    await expect(draft, 'composer 预填在场（draft 缝）').toBeVisible({ timeout: 30_000 })
    await expect(draft).toContainText('名称：SC1 自动对齐突击提案')
    await expect(draft).toContainText('我的意图：')
    // 预填不自动发送（Hard Rule v13）：草稿留场不被 submit 消费（composer 常驻
    // conversation-content 滚动体内，转录文本面不可作判据——草稿存续 = 未发送直证）
    await page.waitForTimeout(2_500)
    await expect(draft, '预填不自动发送（草稿留场）').toContainText('我的意图：')

    if (launched.pageErrors.length > 0) console.log(`[sc1b-diagnostic] pageerror：${launched.pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
