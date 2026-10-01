// @feature dsh-forge-m4 | @web-e2e | @journey split-pane-layout-memory
// Traceability: docs/features/dsh-forge-m4/testing/split-pane-layout-memory/
// contracts/step-4-collapse-subagent-descendants.md — Outcomes:
//   success — parent 会话行 ▾ 展开/收起 subagent 后代:默认收起、递归展开;
//             收起/展开状态记入随项目记忆的布局状态(expandedSessions);
//   descendants-over-limit — 后代超上限(>20):上限截断 + 「查看全部」折叠
//             (边界口径注记:该 20 上限面 = 任务详情 dock 的血缘后代列表
//             [FT-107];树面全量递归渲染 —— 见 header)。
// fixture_spec: Project ×1 + Session(parent 带 subagent 后代)+ SubagentSession
// ×3(常规腿)/ ×21(超限腿)。
// Techniques: sc4 ②(TOP_A caret 展开/收起 + blob.expandedSessions)/
// sc7(M 语料 = 24 后代的「查看全部」权威面)。
//
// VERIFY(boundary consumed, descendants-over-limit):FT-107 LINEAGE_
// DESCENDANT_LIMIT=20 的截断 + 「查看全部」折叠面渲染于任务详情 dock 的血缘
// 后代列表(LinkDescendants;roundtrip 旅程 step-3 为其权威 e2e);C3 树面
// renderSubagentTree 为全量递归渲染(无 20 截断面)。本腿断言可达核:超限
// 后代的归拢不破(顶层零 subagent + parent 树下收起呈现)+ 展开/收起状态
// 入记忆;上限截断面经 roundtrip step-3 的 dock 权威腿承载(cross-ref)。

import { expect, test } from '@playwright/test'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  activateProjectByTreeRow, clickStable, ensureProjectGroupExpanded,
  M4WorldManager, readLayoutBlob, startAutoDismiss,
} from '../_lib/m4-world.ts'
import { buildKernelWorld } from '../_lib/journey-world.ts'
import { bootSpWorld, buildSpJourneyRoot, SUB_A, TOP_A } from './harness.ts'
import { bootM4World, freshRoot, m4Env } from '../_lib/m4-world.ts'

/** 超限腿的 subagent 后代语料(24 > LINEAGE_DESCENDANT_LIMIT=20)。 */
const MANY = 24

test.describe.serial('split-pane-layout-memory / step 4: 收起 subagent 后代', () => {
  const manager = new M4WorldManager()
  let stopAutoDismiss: () => void = () => {}

  test.afterAll(async () => {
    stopAutoDismiss()
    await manager.closeAll()
  })

  // Outcome "success" — 默认收起 + caret 展开/收起 + 状态入记忆。
  test('step4/success: subagent 后代默认收起 + ▾ 递归展开 + 收起状态记入随项目记忆', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const built = await buildSpJourneyRoot()
    const world = await bootSpWorld(manager, 'main', built)
    const { page, kernel } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // 默认收起:零 subagent 行渲染(顶层 + 血缘树下均收起)。
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      'parent 会话行在座').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      '默认收起:subagent 行不渲染').toHaveCount(0)

    // ▾ 展开:内嵌后代列表呈现。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      'A 展开后 subagent 行在场(归拢于 parent 血缘树下)').toBeVisible({ timeout: 10_000 })
    // 顶层列表永不出现 origin=subagent 条目(展开态下仍在 parent 块内)。
    const topIds = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dsh-forge-tree] > [data-dsh-forge-tree-session]')]
        .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? ''))
    expect(topIds, '顶层列表零 subagent 条目(SC7 断言)').not.toContain(SUB_A)

    // 收起(再次点击 caret):后代列表收起。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      '收起(调整后的收起态)').toHaveCount(0, { timeout: 10_000 })

    // State(深断言):收起状态入记忆(expandedSessions 无 TOP_A;去抖后)。
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.tree,
      { timeout: 15_000, message: '收起状态入 blob(该集无 TOP_A)' }).toMatchObject(
      expect.objectContaining({ expandedSessions: expect.not.arrayContaining([TOP_A]) }))
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })

  // Outcome "descendants-over-limit" — 超限归拢不破(可达核 + dock 权威 cross-ref)。
  test('step4/descendants-over-limit: 后代超上限 —— 归拢不破(顶层零 subagent + parent 树下收起呈现)+ 状态入记忆(上限面 = dock,见 header)', async ({ }, testInfo) => {
    testInfo.setTimeout(480_000)
    // 超限语料世界:TOP_M 带 24 个 subagent 后代(REAL persistence 预种)。
    const root = freshRoot('m4-sp-many')
    const kernel = await buildKernelWorld(root, {
      feature: { slug: 'sp-many', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sp-many' },
      tasks: [{ stem: '1.1', localId: '1.1', title: 'sp many task', status: 'pending', type: 'coding.feature', dependencies: [] }],
    })
    const dshHome = join(root, 'dsh-home')
    mkdirSync(dshHome, { recursive: true })
    const TOP_M = 'sp-sess-top-many'
    const now = Date.now()
    const seeds = [{ sessionId: TOP_M, cwd: kernel.codeRoot, createdAt: now - 1_000, title: 'SP 查看全部语料 M' }] as Array<{
      sessionId: string; cwd: string; createdAt: number; title?: string
      parentSession?: string; origin?: 'subagent'; mode?: 'one-shot' | 'continuable'; label?: string
    }>
    for (let index = 0; index < MANY; index += 1) {
      seeds.push({
        sessionId: `sp-sess-many-${String(index).padStart(2, '0')}`,
        cwd: kernel.codeRoot, createdAt: now - 900 + index,
        parentSession: TOP_M, origin: 'subagent', mode: 'one-shot', label: `SP 后代 #${String(index)}`,
      })
    }
    await seedLineageCorpus({ dshHome, seeds })
    const world = await manager.acquire(async () => await bootM4World({
      tag: 'many', root, dshHome, kernel, env: m4Env(dshHome),
    }))
    const { page } = world
    stopAutoDismiss = startAutoDismiss(page)
    await activateProjectByTreeRow(page, kernel.projectId)
    await ensureProjectGroupExpanded(page, kernel.projectId)

    // 超限不破归拢:顶层列表零 subagent 条目;parent 行在场可展开。
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_M}"]`),
      'parent 会话行在座(后代超限)').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      '默认收起:零 subagent 行渲染(超限同规则)').toHaveCount(0)
    // ▾ 展开:后代列表呈现(树面全量递归 —— 上限截断面 = dock 权威,cross-ref)。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_M}"]`)
    const rendered = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-tree-kind="subagent"]').length)
    expect(rendered, '展开后后代行呈现(超限不破坏归拢)').toBeGreaterThan(0)
    // 收起:多级同规则递归收起(再点 caret)。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_M}"]`)
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      '递归收起同规则(超限语料同规则)').toHaveCount(0, { timeout: 10_000 })
    // State:收起状态入记忆。
    await page.waitForTimeout(1_600)
    await expect.poll(async () => (await readLayoutBlob(kernel.userDataDir, kernel.projectId))?.tree,
      { timeout: 15_000, message: '收起状态入 blob(超限语料同规则)' }).toMatchObject(
      expect.objectContaining({ expandedSessions: expect.not.arrayContaining([TOP_M]) }))
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  })
})
