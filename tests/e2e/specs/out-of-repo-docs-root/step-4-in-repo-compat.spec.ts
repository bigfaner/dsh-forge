// @feature dsh-forge-m3 | @web-e2e | @journey out-of-repo-docs-root
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// contracts/step-4-in-repo-compat.md — one test per Outcome:
//   success                  — 既有仓内项目显式仓内注册 + 迁移:全部 M3 读写
//                              兼容(claim/submit、记录读回、阶段资产、提案);
//                              文档根仍在仓内;应用管理 docs 根零创建。
//   external-change-backflow — 仓内文档外部修改:任务与提案 ≤5s 回流;
//                              阶段资产/文档视图呈现最新内容(持续感知)。
// fixture_spec: Project(in_repo)/Task/StageAsset/Proposal/Feature。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, normPath, proposalMarkdown, recordMarkdown, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildInRepoWorld, OOR_FEATURE, registerInRepoViaWizard } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const TASK_KEY = `${OOR_FEATURE}/1`
const RECORD_MARK = 'oor 仓内兼容记录锚点 — 记录落仓内原位,taskGet 读回。'
const STAGE_GOAL = 'oor 仓内兼容阶段资产目标锚点。'

test.describe.serial('out-of-repo-docs-root / step 4: 既有仓内项目兼容', () => {
  const manager = new WorldManager()
  let inrepo: KernelWorld | null = null

  test.beforeAll(async () => {
    inrepo = await buildInRepoWorld(freshRoot('oor-s4'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 仓内兼容读写 + 管理空间零创建。
  test.fixme('step4/success: the in-repo project registers (explicit in_repo) + migrates in place; M3 read/writes land at the original in-repo seats; the app-managed docs root is NEVER created', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const world = await manager.acquire(inrepo as KernelWorld, 'inrepo', { activate: false, tab: 'workbench/overview' })
    const { page } = world
    const featuresRoot = join((inrepo as KernelWorld).docsRoot, 'docs', 'features')

    await registerInRepoViaWizard(page, (inrepo as KernelWorld).codeRoot)

    // 注册行 in_repo;激活 → 看板读回(仓内文档树)。
    const displayName = (inrepo as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    const state = await bridgeInvoke<{ activeProjectId: string | null; projects: Array<{ codeRoot: string; docLocationType: string; docLocationPath: string | null }> }>(page, 'getState', [])
    const projectId = state.activeProjectId as string
    expect(state.projects.find(row => normPath(row.codeRoot) === normPath((inrepo as KernelWorld).codeRoot))?.docLocationType,
      '项目行保持 in_repo(默认值翻转不回溯)').toBe('in_repo')

    // 任务写读正常:claim → 记录落仓内原位 → submit → 读回。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"]`), '看板读回(仓内)').toBeVisible({ timeout: 20_000 })
    const actor = 'session:oor-inrepo-agent'
    await bridgeInvoke(page, 'taskClaim', [{ projectId, taskKey: TASK_KEY }, actor])
    const recordsDir = join(featuresRoot, OOR_FEATURE, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: RECORD_MARK }), 'utf8')
    await bridgeInvoke(page, 'taskSubmit', [{ projectId, taskKey: TASK_KEY }, actor])
    const detail = await bridgeInvoke<{ records: Array<{ summary: string }> }>(page, 'taskGet', [{ projectId, taskKey: TASK_KEY }])
    expect(detail.records.some(row => row.summary.includes(RECORD_MARK)), '记录读回(仓内原位)').toBe(true)

    // 阶段资产:stageSummarize 落仓内原位 + manifest 原位翻转。
    const summarized = await bridgeInvoke<{ path: string }>(page, 'stageSummarize', [{
      projectId, featureSlug: OOR_FEATURE, stage: 'tasks', goal: STAGE_GOAL, summary: 'oor 仓内摘要锚点。\n',
    }])
    expect(summarized.path, `资产相对路径 = ${OOR_FEATURE}/stages/tasks.md`).toBe(`${OOR_FEATURE}/stages/tasks.md`)
    const assetAbs = join(featuresRoot, OOR_FEATURE, 'stages', 'tasks.md')
    expect(assetAbs.startsWith((inrepo as KernelWorld).docsRoot), '阶段资产绝对路径落【代码仓】内').toBe(true)
    expect(readFileSync(assetAbs, 'utf8'), '资产含目标锚点(逐字)').toContain(STAGE_GOAL)
    const advanced = await bridgeInvoke<{ status: string }>(page, 'advanceStage', [projectId, OOR_FEATURE])
    expect(advanced.status, '推进 → in-progress(manifest 原位翻转)').toBe('in-progress')

    // 提案:仓内原位 proposals → 提案板行。
    const proposalDir = join((inrepo as KernelWorld).docsRoot, 'docs', 'proposals', 'oor-inrepo-proposal')
    mkdirSync(proposalDir, { recursive: true })
    writeFileSync(join(proposalDir, 'proposal.md'), proposalMarkdown({
      status: 'draft', author: 'oor-inrepo-agent', created: '2026-09-25', title: 'oor 仓内提案', mark: 'oor 仓内提案锚点。',
    }), 'utf8')
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await expect(page.locator('[data-dsh-forge-proposal-row="oor-inrepo-proposal"]'), '仓内 proposals → 提案板行').toBeVisible({ timeout: 20_000 })

    // 极性对照:应用管理文档根从未被创建(写入不旁落)。
    expect(existsSync(join((inrepo as KernelWorld).userDataDir, 'workbench', 'docs')), '应用管理 docs 根零创建').toBe(false)
  })

  // Outcome "external-change-backflow" — 仓内项目的外部变更回流。
  test.fixme('step4/external-change-backflow: external edits to the in-repo docs reflux — task + proposal ≤5s; stage-asset/doc views show the latest content', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(inrepo as KernelWorld, 'inrepo')
    const { page } = world
    const featuresRoot = join((inrepo as KernelWorld).docsRoot, 'docs', 'features')

    // 外部修改①:新增提案文件 → 提案板新行 ≤5s。
    const proposalDir = join((inrepo as KernelWorld).docsRoot, 'docs', 'proposals', 'oor-backflow-proposal')
    mkdirSync(proposalDir, { recursive: true })
    const tProposal = Date.now()
    writeFileSync(join(proposalDir, 'proposal.md'), proposalMarkdown({
      // 词表内状态(PROPOSAL_STATUS_VOCAB:draft/accepted/rejected/superseded
      // —— 越界词表状态被索引器静默跳过,生成稿曾用 'review')。
      status: 'accepted', author: 'external-writer', created: '2026-09-25', title: 'oor 回流提案', mark: 'oor 外部回流锚点。',
    }), 'utf8')
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await page.locator('[data-dsh-forge-proposal-row="oor-backflow-proposal"]').waitFor({ state: 'visible', timeout: 20_000 })
    expect(Date.now() - tProposal, '外部新增提案 → 板行 ≤5s(免手动刷新)').toBeLessThanOrEqual(5_000 + 1_000)

    // 外部修改②:阶段资产文件改写 → 资产面板呈现最新内容(持续感知)。
    const assetPath = join(featuresRoot, OOR_FEATURE, 'stages', 'tasks.md')
    const refreshedMark = 'oor 资产外部修订锚点(回流腿)。'
    writeFileSync(assetPath, readFileSync(assetPath, 'utf8').replace('oor 仓内摘要锚点。', refreshedMark), 'utf8')
    await page.locator('[data-dsh-forge-tab="workbench/features"]').click()
    const card = page.locator(`[data-dsh-forge-feature-card="${OOR_FEATURE}"]`)
    await card.click()
    const detail = page.locator(`[data-dsh-forge-feature-detail="${OOR_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await detail.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const tasksCard = detail.locator('[data-dsh-forge-feature-doc-panel="assets"] [data-dsh-forge-stage-asset="tasks"]')
    await expect(tasksCard, '资产面板呈现最新内容(外部修订锚点)').toContainText(refreshedMark, { timeout: 20_000 })
  })
})
