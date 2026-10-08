// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC4 突击直达链（PRD Goals SC4 / 图 12 上链；用户裁决 2026-10-07：突击无 feature 阶段）：
//   quick-tasks 产出形态（回放主径承载：createProposal mode=blitz + addTask source=proposal
//   直挂——Hard Rule 禁真实模型）→ 提案 accepted → **无 feature 行断言**（成链分叉：blitz
//   不成链——任务直挂提案）→ 任务子 tab 突击提案容器在场（琥珀点 data-mode=blitz）→
//   claim/submit → 三视图（列表/泳道/DAG）即时刷新（写推送事件驱动——M2 机制）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { PROPOSALS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { ProposalCard } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, ttCardOf, ttColOf, ttItemOf } from '../../support/anchors.js'
import { switchTaskView } from '../../support/m3.js'

const WS_NAME = 'ws-sc4'
const PROP = 'sc4-blitz'

test('@web-e2e @m3 SC4·突击直达链：accepted 无 feature 行 + 直挂任务 + 三视图即时刷新', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc4-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc4-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // ── quick-tasks 产出（回放主径）：突击提案 + 任务清单直挂（mode 溯源 = blitz）──
    const proposal = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: PROP, title: 'SC4 突击直达链演示', mode: 'blitz',
    })) as { proposalId: string; slug: string }
    const t1 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '突击任务甲', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const t2 = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '突击任务乙', type: 'doc', dependsOn: [t1.localId],
    })) as { taskId: string; slug: string; localId: string }

    // ── accepted → 无 feature 行（成链分叉：blitz 不成链——任务直挂提案）──
    const verdict = (await driver.call('forgeProposals', 'transitionProposal', {
      projectId, proposalId: proposal.proposalId, toStatus: 'accepted',
    })) as { chained?: unknown }
    expect(verdict.chained, 'blitz accepted 不成链（chained 键缺席）').toBeUndefined()
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM features WHERE proposal_id = ?`).get(proposal.proposalId)?.n, '零 feature 行（突击无 feature 阶段）').toBe(0)
      const direct = db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM tasks WHERE source_kind = 'proposal' AND source_id = ?`,
      ).get(proposal.proposalId)?.n
      expect(direct, '任务直挂提案（source 双列——两行）').toBe(2)
    } finally {
      db.close()
    }
    // 读面：提案卡 taskCount = 2（容器 pill「有任务的提案」判据）
    const cards = await refetchOnce<ProposalCard[]>(page, PROPOSALS_CHANNELS.list, { projectId })
    expect(cards.find((c) => c.slug === PROP)?.taskCount, '提案卡 taskCount = 2（直挂并入同计）').toBe(2)

    // ── 任务子 tab：突击提案容器在场（琥珀点）+ 行加载 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menuItem = page.locator('[data-dswf-tt-mcont="proposal:sc4-blitz"]').first()
    await expect(menuItem, '容器菜单含突击提案容器').toBeVisible({ timeout: 15_000 })
    await menuItem.click()
    const pill = page.locator('[data-dswf-tt-contpill="proposal:sc4-blitz"]')
    await expect(pill, '容器 pill 切至突击提案').toBeVisible({ timeout: 15_000 })
    await expect(pill.locator('.dswf-tt-contdot'), '琥珀点 = blitz 容器标记').toHaveAttribute('data-mode', 'blitz')
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '直挂任务行在场（列表视图）').toBeVisible({ timeout: 30_000 })

    // ── 派发（回放主径承载）：claim + submit 甲 → 三视图即时刷新 ──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: t1.slug, localId: t1.localId }, sessionId: 'e2e-sc4-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: t1.slug, localId: t1.localId }, result: 'success',
      summary: 'SC4 突击甲结算（三视图即时刷新断言）', gate: { compile: true, fmt: true, lint: true, test: true },
      sessionId: 'e2e-sc4-executor',
    })
    // 列表视图：行收敛已完成（写推送事件驱动重取——即时判据 UI 面）
    await expect(page.locator(ttItemOf(t1.taskId)).first(), '列表视图即时刷新 = 已完成').toContainText('已完成', { timeout: 30_000 })
    // 泳道视图：卡片落入 completed 列
    await switchTaskView(page, 'swim')
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(t1.taskId)), '泳道视图即时刷新（completed 列）').toBeVisible({ timeout: 30_000 })
    // DAG 视图：节点 is-completed
    await switchTaskView(page, 'dag')
    const node = page.locator(`[data-dswf-tt-node="${t1.taskId}"]`)
    await expect(node, 'DAG 视图节点在场').toBeVisible({ timeout: 30_000 })
    await expect(node).toHaveClass(/is-completed/)
    // 乙保持待处理（依赖未领——池态一致性）
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`), '依赖方节点在场（未领取）').toBeVisible()
    await expect(page.locator(`[data-dswf-tt-node="${t2.taskId}"]`)).not.toHaveClass(/is-completed/)

    // 提案子 tab 联动：行状态 tag = 已接受（评审直入任务阶段——无 feature 阶段的提案全景）
    await page.locator(ovSubtabOf('proposals')).click()
    const row = page.locator('[data-dswf-ov-parent]', { hasText: 'SC4 突击直达链演示' }).first()
    await expect(row, '提案行在场（已接受）').toBeVisible({ timeout: 30_000 })
    await expect(row).toContainText('已接受')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
