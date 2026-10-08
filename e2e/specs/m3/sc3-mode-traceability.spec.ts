// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// M3 5.2 SC3 mode 溯源解耦（PRD Goals SC3 / 裁决⑥——feature 恒远征）：
//   ① mode chip ↔ 库一致（proposals.mode 直出——远征/突击/未标记三态）；
//   ② 无溯源缺省占位（mode NULL → 键缺席 → chip 未标记态不可点 + 悬停说明）；
//   ③ 人工变更后既有任务快照不变（setProposalMode 唯一正门只写 proposals.mode——
//      tasks.mode 创建时快照永不回溯·律三）；
//   ④ feature 恒远征（成链门保证：accepted ∧ expedition 才成链；feature 容器任务
//      mode 恒 'expedition' 快照）+ 突击提案直挂任务快照 = blitz（整数 ID 语义面）。
// 载体：写动词经测试钩子直调（回放主径——Hard Rule 禁真实模型）；读面/UI 面 = RPC 单发
// + 概览提案子 tab。库级断言 = openForgeDbAt（产品面 RPC deriveTaskStoreDir 单源目录）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { PROPOSALS_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf } from '../../support/anchors.js'

const WS_NAME = 'ws-sc3'

test('@web-e2e @m3 SC3·mode 溯源解耦：chip↔库一致/缺省占位/快照不回溯/feature 恒远征', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-sc3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // ── 三提案世界：远征（有溯源）/ 无溯源（mode NULL）/ 突击 ──
    const expProp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'sc3-exp', title: 'SC3 远征提案', mode: 'expedition',
    })) as { proposalId: string; slug: string }
    const unmarked = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'sc3-old', title: 'SC3 无溯源提案（扫描吸收形态）',
    })) as { proposalId: string; slug: string }
    const blitzProp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'sc3-blitz', title: 'SC3 突击提案', mode: 'blitz',
    })) as { proposalId: string; slug: string }

    // ── ② 直挂任务快照（proposal 容器取 proposals.mode 创建时快照）──
    const expTaskId = ((await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: expProp.slug }, title: '远征提案直挂任务', type: 'doc',
    })) as { taskId: string }).taskId
    const blitzTask = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: blitzProp.slug }, title: '突击提案直挂任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    expect(/^\d+(\.\d+)?$/.test(blitzTask.localId), `突击直挂任务整数 ID 语义（localId=${blitzTask.localId}）`).toBe(true)

    // ── ③ 人工变更唯一正门：setProposalMode 只写 proposals.mode（快照不回溯）──
    await forgeInvoke(page, PROPOSALS_CHANNELS.setMode, { projectId, proposalId: expProp.proposalId, mode: 'blitz', reason: 'SC3 人工降级演示（快照不回溯断言）' })
    const db = openForgeDbAt(dir)
    try {
      const modes = db.prepare<unknown[], { slug: string; mode: string | null }>(`SELECT slug, mode FROM proposals`).all()
      expect(modes.find((r) => r.slug === expProp.slug)?.mode, '库 proposals.mode 即时更新 = blitz').toBe('blitz')
      expect(modes.find((r) => r.slug === unmarked.slug)?.mode, '无溯源提案 mode NULL（缺省占位判据）').toBeNull()
      expect(modes.find((r) => r.slug === blitzProp.slug)?.mode, '突击提案 mode = blitz').toBe('blitz')
      const snapshots = db.prepare<unknown[], { local_id: string; mode: string | null }>(`SELECT local_id, mode FROM tasks WHERE slug = ?`).all(expProp.slug)
      expect(snapshots[0]?.mode, '既有任务快照不变（创建时 expedition——律三不回溯）').toBe('expedition')
      const blitzSnap = db.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM tasks WHERE slug = ?`).get(blitzProp.slug)
      expect(blitzSnap?.mode, '突击直挂任务快照 = blitz').toBe('blitz')
    } finally {
      db.close()
    }
    // 读面单发：任务详情容器水化即时反映新 mode（proposals.mode 单侧更新）；既有任务快照
    // 不回溯的库级断言见上（tasks.mode 仍 expedition——TaskSnapshot.mode 无 RPC 面，db 为权威）
    const detail = await refetchOnce<{ container?: { mode?: string } }>(page, TASKS_CHANNELS.detail, { projectId, taskId: String(expTaskId) })
    expect(detail.container?.mode, '任务详情容器水化 = 新值 blitz（即时更新）').toBe('blitz')

    // ── ① mode chip ↔ 库一致（UI 投影）+ ② 缺省占位（未标记不可点）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    // 行锚 = 展开钮 title 携带提案标题——按标题定位行
    const rowByTitle = (title: string) => page.locator(`[data-dswf-ov-parent-toggle][title="${title}"]`).first().locator('xpath=..')
    const expRow = rowByTitle('SC3 远征提案')
    await expect(expRow.locator('[data-dswf-mode-chip]'), '远征行 mode chip 在场').toBeVisible({ timeout: 30_000 })
    await expect(expRow.locator('[data-dswf-mode-chip]')).toHaveAttribute('data-dswf-mode-chip', 'blitz', { timeout: 15_000 })
    await expect(expRow.locator('[data-dswf-mode-chip]')).toContainText('突击')
    const unmarkedRow = rowByTitle('SC3 无溯源提案（扫描吸收形态）')
    await expect(unmarkedRow.locator('[data-dswf-mode-chip]')).toHaveAttribute('data-dswf-mode-chip', 'unmarked')
    await expect(unmarkedRow.locator('[data-dswf-mode-chip]')).toContainText('未标记')
    await expect(unmarkedRow.locator('[data-dswf-mode-chip]')).toBeDisabled()
    await expect(unmarkedRow.locator('[data-dswf-mode-chip]')).toHaveAttribute('title', '扫描吸收的旧提案无溯源')

    // ── ④ feature 恒远征：expedition 提案 accepted 成链 → feature 容器任务快照恒 expedition ──
    const chainProp = (await driver.call('forgeProposals', 'createProposal', {
      projectId, slug: 'sc3-chain', title: 'SC3 成链提案', mode: 'expedition',
    })) as { proposalId: string; slug: string }
    const chained = (await driver.call('forgeProposals', 'transitionProposal', {
      projectId, proposalId: chainProp.proposalId, toStatus: 'accepted',
    })) as { chained?: { featureId: string; slug: string } }
    expect(chained.chained, '成链返回 chained feature（accepted ∧ expedition）').toBeDefined()
    const featTask = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: chainProp.slug }, title: 'feature 容器任务（恒远征）', type: 'doc',
    })) as { taskId: string; slug: string }
    const db2 = openForgeDbAt(dir)
    try {
      const featSnap = db2.prepare<unknown[], { mode: string | null }>(`SELECT mode FROM tasks WHERE id = ?`).get(featTask.taskId)
      expect(featSnap?.mode, 'feature 容器任务快照恒远征（成链门保证）').toBe('expedition')
      const features = db2.prepare<unknown[], { slug: string; proposal_id: string | null }>(`SELECT slug, proposal_id FROM features`).all()
      expect(features.find((f) => f.slug === chainProp.slug)?.proposal_id, 'feature 行谱系 proposal_id 在场').toBe(chainProp.proposalId)
      expect(features.find((f) => f.slug === blitzProp.slug), '突击提案零 feature 行（恒远征边界——本世界无 accepted 突击）').toBeUndefined()
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
