// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC6 提案五态流转与单步成链（PRD Goals SC6）：
//   ① 五态 chips 过滤（五态计数 + toggle 过滤 + 文档跳转可用性归 SC9 文档面——本件断
//      chips 过滤行为）；
//   ② 双面同门写库一致：UI 人工裁决（⋯ 菜单评审流转对话框 → proposals/transition RPC）
//      与 bridge 直调 transitionProposal 同写 proposals 表——库态等价；
//   ③ 成链原子三行 + 审计伴随表断言：accepted ∧ expedition → features 行 + proposal_id
//      谱系 + feature_records(register)（单事务全在）；feature 域后续动词（transition）
//      每次写入伴随审计行（表断言）；
//   ④ 模式不可变 UI 正门：未标记提案 ⋯ 菜单无「更改模式…」入口（入口守卫）+ 有溯源
//      chip 可点开模式更改对话框；
//   ⑤ agent tool 面无模式改写动词 = 契约断言（G1 pin-10 五在场/四缺席——本 spec 头注
//      交叉引用，运行期 tool 目录面归 5.3 dogfood）。
import { mkdtempSync } from 'node:fs'
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
import { ovSubtabOf } from '../../support/anchors.js'

const WS_NAME = 'ws-sc6'

test('@web-e2e @m3 SC6·五态流转：chips 过滤 + UI 双面同门 + 成链原子三行 + 审计伴随 + 模式正门守卫', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc6-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc6-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const create = async (slug: string, title: string, mode?: 'expedition' | 'blitz'): Promise<{ proposalId: string; slug: string }> =>
      (await driver.call('forgeProposals', 'createProposal', { projectId, slug, title, ...(mode !== undefined ? { mode } : {}) })) as { proposalId: string; slug: string }

    // ── 五态世界（bridge 面 = agent 技能代笔承载）：draft / under-review / accepted / rejected / superseded ──
    const pDraft = await create('sc6-draft', 'SC6 评审中提案')
    const pReview = await create('sc6-review', 'SC6 转审提案', 'expedition')
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pReview.proposalId, toStatus: 'under-review' })
    const pAccepted = await create('sc6-accepted', 'SC6 受理提案', 'expedition')
    const chained = (await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pAccepted.proposalId, toStatus: 'accepted' })) as { chained?: { featureId: string } }
    expect(chained.chained, '单步成链（仅远征提案）').toBeDefined()
    const pRejected = await create('sc6-rejected', 'SC6 驳回提案')
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pRejected.proposalId, toStatus: 'rejected' })
    const pTarget = await create('sc6-target', 'SC6 取代目标提案')
    const pSuperseded = await create('sc6-sup', 'SC6 被取代提案')
    await driver.call('forgeProposals', 'transitionProposal', { projectId, proposalId: pSuperseded.proposalId, toStatus: 'superseded', supersededBy: pTarget.proposalId })
    await create('sc6-unmarked', 'SC6 未标记提案')

    // ── ① 五态 chips：计数 + 过滤 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const chip = (status: string) => page.locator(`[data-dswf-ov-pschip="${status}"]`)
    await expect(chip('draft'), 'draft chip 计数 3（draft + 未标记 + 取代目标）').toContainText('3', { timeout: 30_000 })
    await expect(chip('under-review')).toContainText('1')
    await expect(chip('accepted')).toContainText('1')
    await expect(chip('rejected')).toContainText('1')
    await expect(chip('superseded')).toContainText('1')
    await chip('draft').click()
    await expect(chip('draft')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-dswf-ov-proposals] [data-dswf-ov-parent]'), '过滤 = 仅 draft 三行').toHaveCount(3)
    await page.locator('[data-dswf-ov-pschip-clear]').click()
    await expect(page.locator('[data-dswf-ov-proposals] [data-dswf-ov-parent]'), '清过滤 = 全七行').toHaveCount(7)

    // ── ② UI 人工裁决面（双面同门）：draft → under-review 经对话框（proposals/transition RPC）──
    const draftRow = page.locator('[data-dswf-ov-parent]', { hasText: 'SC6 评审中提案' }).first()
    await draftRow.locator('[data-dswf-ov-more]').click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator('button, [role="menuitem"]').filter({ hasText: '评审流转' }).first().click()
    const dialog = page.locator('[data-dswf-ov-vd]')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-vd-to]').selectOption('under-review')
    await page.locator('[data-dswf-ov-vd-reason]').fill('SC6 UI 人工裁决面（双面同门断言）')
    // 确认钮在官方 Modal footer（body div 外——portal 同层），全局锚定位
    await page.locator('[data-dswf-ov-vd-confirm]').click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    // 库态等价（UI 面与 bridge 面同写 proposals 表——写后事件驱动 UI 收敛）
    await expect(draftRow, '行状态 tag 收敛 = 评审中').toContainText('评审中', { timeout: 30_000 })
    const db = openForgeDbAt(dir)
    try {
      const row = db.prepare<unknown[], { proposal_status: string; decided_at: string | null }>(`SELECT proposal_status, decided_at FROM proposals WHERE id = ?`).get(pDraft.proposalId)
      expect(row?.proposal_status, 'UI 裁决写库一致（under-review）').toBe('under-review')
      expect(row?.decided_at, '非裁决转移不改写 decided_at（NULL 保持）').toBeNull()
      const sup = db.prepare<unknown[], { superseded_by: string | null }>(`SELECT superseded_by FROM proposals WHERE id = ?`).get(pSuperseded.proposalId)
      expect(sup?.superseded_by, 'superseded 谱系链（bridge 面）').toBe(pTarget.proposalId)
    } finally {
      db.close()
    }

    // ── ③ 审计伴随表断言：feature 域动词每次写入伴随 feature_records 行 ──
    const featureId = chained.chained?.featureId ?? ''
    await forgeInvoke(page, FEATURES_CHANNELS.transition, { projectId, featureId, toStatus: 'design', reason: 'SC6 审计伴随（UI 转移面）' })
    const db2 = openForgeDbAt(dir)
    try {
      const records = db2.prepare<unknown[], { verb: string; actor: string }>(`SELECT verb, actor FROM feature_records WHERE feature_id = ? ORDER BY id`).all(featureId)
      expect(records, '审计伴随（register·core → transition·ui——每动词一行）').toEqual([
        { verb: 'register', actor: 'core' },
        { verb: 'transition', actor: 'ui' },
      ])
    } finally {
      db2.close()
    }

    // ── ④ 模式正门守卫：未标记 ⋯ 菜单无「更改模式…」；有溯源 chip 可点开对话框 ──
    const unmarkedRow = page.locator('[data-dswf-ov-parent]', { hasText: 'SC6 未标记提案' }).first()
    await unmarkedRow.locator('[data-dswf-ov-more]').click()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await expect(menu.locator('button, [role="menuitem"]').filter({ hasText: '更改模式' }), '未标记提案无模式更改入口（守卫）').toHaveCount(0)
    await page.keyboard.press('Escape')
    const reviewRow = page.locator('[data-dswf-ov-parent]', { hasText: 'SC6 转审提案' }).first()
    await reviewRow.locator('[data-dswf-mode-chip]').click()
    const modeDialog = page.locator('[data-dswf-ov-md]')
    await expect(modeDialog, '有溯源 chip = 模式更改唯一正门快捷入口').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-ov-md-cancel]').click()
    await expect(modeDialog).toBeHidden({ timeout: 10_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
