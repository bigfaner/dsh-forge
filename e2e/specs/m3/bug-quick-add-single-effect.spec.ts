// @web-e2e @fix-bug
// 实机走查（bug 2d5434d1 修复验证——症状级防御 insertReferenceAtTail）：
//   复现条件忠实台账事实：单次点击 / 当前会话有历史（先经 composer 直发落地一条消息）。
//   验收（单效）：
//     ① chip 落当前会话 composer（插入生效 + 还焦）；
//     ② 不开新会话：转录仍为当前会话内容、侧栏会话行数不变、无预填新会话。
//   截图取证：.forge/docs/proposals/composer-bug-reference/walkthrough/（留盘不进 git）。
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { registerProject, selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, ovSubtabOf, SESSION_ROW_ANY } from '../../support/anchors.js'
import { awaitNoLateModals } from '../../support/m3.js'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'

const WS_NAME = 'ws-bugwalk'
/** 会话历史标记消息（「当前会话有历史」复现条件载体——proposal 域退役后经 composer 直发） */
const MARKER = '双效走查容器会话消息'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空目录（bug 行 slug 隔离，单用例 spec 零跨用例账本耦合）。
const { test } = createSharedLaunchFixture({
  seedWorkspace: (dir) => mkdirSync(dir, { recursive: true }),
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

test('@web-e2e @fix-bug Bug 快速路径单效走查（2d5434d1）：「添加到会话中」→ chip 落当前会话、零新会话', async ({ sharedLaunch }) => {
  // 验收②（转录含消息文本 = 用户消息入转录投影）挂官方栈世代门（族① gate-environment 先例——
  // input-history-plugin 等 13 spec 同径）：rc.2 世代用户消息不入转录，整代 co-upgrade 后复跑。
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
  test.setTimeout(300_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  try {
    // ── 夹具：项目 + 台账 bug 行 ──
    await registerProject(page, wsDir, WS_NAME)
    await selectWorkspaceViaChip(page, WS_NAME)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const bugId = randomUUID()
    const now = new Date().toISOString()
    const db = openForgeDbAt(dir)
    try {
      db.prepare(
        `INSERT INTO bugs (id, summary, bug_desc, trigger_desc, expected, actual, suspected, error_type,
                           bug_status, source_task_id, report_session_id, reporter, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, 'e2e-walkthrough', ?, ?)`,
      ).run(bugId, '双效走查 Bug', '走查复现体', '点「添加到会话中」', '单效', '历史曾双效', null, 'walkthrough', now, now)
    } finally {
      db.close()
    }

    // ── 当前会话有历史（台账复现条件）：GUI 会话 composer 直发落地一条消息
    // （proposal 行头开新会话入口随 proposal 域退役——M2 SC6③ composer 会话夹具同径）──
    const composer = page.locator(COMPOSER_INPUT).last()
    await composer.click()
    await page.keyboard.insertText(MARKER)
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '当前会话有历史（消息落地 = 非 blank）').toContainText(MARKER, { timeout: 60_000 })
    await awaitNoLateModals(page)

    // ── Bug 子 tab：行在场 + 快速路径按钮在场 ──
    await openOverviewDock(page)
    await ensureNoBlockingDialog(page)
    await page.locator(ovSubtabOf('bugs')).click()
    await expect(page.locator(ovSubtabOf('bugs'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const bugRow = page.locator(`[data-dswf-ov-bugrow="${bugId}"]`).first()
    await expect(bugRow, '台账 bug 行在场').toBeVisible({ timeout: 30_000 })
    const addBtn = bugRow.locator('[data-dswf-ov-bugrow-add]')
    await expect(addBtn, '「添加到会话中」按钮在场').toBeVisible({ timeout: 15_000 })

    // ── 单次点击（台账复现动作）──
    const sessionRowsBefore = await page.locator(SESSION_ROW_ANY).count()
    expect(sessionRowsBefore, '前置：当前会话行在场（唯一非 blank）').toBeGreaterThanOrEqual(1)
    await addBtn.click()

    // ── 验收①：chip 落当前会话 composer（原子引用 label = bug 摘要投影）──
    const composerAfter = page.locator(COMPOSER_INPUT).first()
    await expect(composerAfter, 'chip/引用投影进入当前会话草稿').toContainText('双效走查 Bug', { timeout: 15_000 })

    // ── 验收②：零新会话（双效链切断）──
    await page.waitForTimeout(3_000) // 双效跳转窗（实机症状 = 点击后瞬时开新会话）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '转录仍为当前会话内容（未跳转新会话）').toContainText(MARKER)
    const sessionRowsAfter = await page.locator(SESSION_ROW_ANY).count()
    expect(sessionRowsAfter, `侧栏会话行数不变（前 ${String(sessionRowsBefore)} 后 ${String(sessionRowsAfter)}——未开新会话）`).toBe(sessionRowsBefore)
    await expect(page.locator(COMPOSER_INPUT).first(), '草稿仍持引用（无新会话预填劫持）').toContainText('双效走查 Bug')

    // ── 截图取证（留盘不进 git——AGENTS.md 提交规范）──
    const shotDir = join('.forge', 'docs', 'proposals', 'composer-bug-reference', 'walkthrough')
    mkdirSync(shotDir, { recursive: true })
    await page.screenshot({ path: join(shotDir, 'bug-2d5434d1-single-effect.png'), fullPage: false })
    writeFileSync(join(shotDir, 'bug-2d5434d1-walkthrough.md'), [
      '# bug 2d5434d1 实机走查（症状级防御验证）',
      '',
      `- 日期：${new Date().toISOString()}`,
      `- bugId（台账）：2d5434d1-8929-4ca6-aa90-68d6a64b04b9；台账行（夹具）：${bugId}`,
      '- 条件：当前会话有历史（composer 直发先落地一条消息）→ Bug 子 tab 单次点击「添加到会话中」',
      '- 结果：① chip 落当前会话 composer；② 转录保持当前会话、侧栏会话行数不变、无预填新会话',
      '- 截图：bug-2d5434d1-single-effect.png',
      '',
    ].join('\n'), 'utf8')

    if (pageErrors.length > 0) console.log(`[bugwalk-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
