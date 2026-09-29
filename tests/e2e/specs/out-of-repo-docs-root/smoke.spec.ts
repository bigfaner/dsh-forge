// @feature dsh-forge-m3 | @web-e2e | @journey out-of-repo-docs-root
// Journey smoke test — the default-external chain END TO END in one world
// (happy-path Outcomes only):
//   Step 1 wizard doc-location default = external → Step 2 authorized
//   registration (row external) → Step 3 multi-asset produce at the doc root
//   (dispatch+record+stage asset+proposal; boards render; repo zero-write git
//   face).
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// journey.md (Happy Path Steps 1-3) + contracts success faces.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, gitStatusPorcelain, proposalMarkdown, recordMarkdown, snapshotTree, WorldManager, bridgeInvoke, openBoardPane, openOverviewPane } from '../_lib/journey-world.ts'
import { buildPureWorld, managedDocRoot, OOR_FEATURE, registerExternalViaWizard } from './harness.ts'

const TASK_KEY = `${OOR_FEATURE}/1`

test('smoke/out-of-repo-docs-root: 向导默认仓外 → 授权注册(external 行)→ 多类资产读写落文档根(板呈现)→ 代码仓零新增(git 断言)', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildPureWorld(freshRoot('oor-smoke'))
  try {
    const world = await manager.acquire(kernel, 'smoke', { activate: false, tab: 'workbench/overview' })
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')
    const docRoot = managedDocRoot(kernel.root, 'repo')
    const featuresRoot = join(docRoot, 'docs', 'features')
    const repoBaseline = snapshotTree(kernel.codeRoot)

    // ---- Step 1:文档位置步骤(默认仓外三面)--------------------------
    await page.locator('[data-dsh-forge-overview-register]').click() // 1.8 起注册入口 = 概览空态 CTA
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill(kernel.codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), 'Step 1:默认仓外').toBeChecked()
    await expect(page.locator('[data-dsh-forge-wizard-external-default]'), 'Step 1:已预填提示行').toBeVisible({ timeout: 10_000 })
    // 关闭向导(✕ 走 requestClose,与 Esc 同路):干净草稿立即关闭;脏草稿
    // 先弹放弃确认 —— 两者择一收敛后向导必关。
    await page.locator('[data-dsh-forge-dialog="register-wizard"] [data-dsh-forge-dialog-close]').click()
    const discard = page.locator('[data-dsh-forge-dialog="register-wizard-discard"]')
    if (await discard.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false)) {
      await discard.locator('[data-dsh-forge-wizard-discard-confirm]').click()
    }
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]'), '步骤①探查后关闭向导').toBeHidden({ timeout: 10_000 })

    // ---- Step 2:默认仓外完成注册(授权 → 迁移 → 注册行)-------------
    await registerExternalViaWizard(page, kernel.codeRoot)
    const state = await bridgeInvoke<{ activeProjectId: string | null; projects: Array<{ codeRoot: string; docLocationType: string }> }>(page, 'getState', [])
    expect(state.projects.some(row => row.docLocationType === 'external'), 'Step 2:注册行 external').toBe(true)

    // ---- Step 3:过程资产读写落于文档根 -------------------------------
    const displayName = kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    const projectId = (await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])).activeProjectId as string

    // ① 任务:派发 → stub 执行 → claim/submit。
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"]`)).toBeVisible({ timeout: 20_000 })
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await page.locator(`[data-dsh-forge-select-chk="${TASK_KEY}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"] [data-dsh-forge-orch-badge="running"]`).waitFor({ state: 'visible', timeout: 20_000 })
    const row = (await bridgeInvoke<Array<{ sessionId: string | null }>>(page, 'getDispatches', [projectId])).find(candidate => candidate.taskKey === TASK_KEY)
    const actor = `session:${row?.sessionId as string}`
    await bridgeInvoke(page, 'taskClaim', [{ projectId, taskKey: TASK_KEY }, actor])

    // ② 执行记录:落仓外 → 读回。
    const recordsDir = join(featuresRoot, OOR_FEATURE, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    const recordMark = 'oor smoke 记录锚点(仓外)。'
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: recordMark }), 'utf8')
    await bridgeInvoke(page, 'taskSubmit', [{ projectId, taskKey: TASK_KEY }, actor])
    const detail = await bridgeInvoke<{ records: Array<{ summary: string }> }>(page, 'taskGet', [{ projectId, taskKey: TASK_KEY }])
    expect(detail.records.some(candidate => candidate.summary.includes(recordMark)), 'Step 3:记录读回(仓外文档根)').toBe(true)

    // ③ 阶段资产:stageSummarize 落仓外。
    const summarized = await bridgeInvoke<{ path: string }>(page, 'stageSummarize', [{
      projectId, featureSlug: OOR_FEATURE, stage: 'tasks', goal: 'oor smoke 阶段目标锚点', summary: 'oor smoke 摘要锚点。\n',
    }])
    expect(summarized.path, 'Step 3:资产落仓外(<slug>/stages/tasks.md)').toBe(`${OOR_FEATURE}/stages/tasks.md`)
    expect(existsSync(join(featuresRoot, OOR_FEATURE, 'stages', 'tasks.md')), 'Step 3:资产文件在仓外文档根').toBe(true)

    // ④ proposals:落仓外 → 板行。
    const proposalDir = join(docRoot, 'docs', 'proposals', 'oor-smoke-proposal')
    mkdirSync(proposalDir, { recursive: true })
    writeFileSync(join(proposalDir, 'proposal.md'), proposalMarkdown({
      status: 'draft', author: 'oor-smoke-agent', created: '2026-09-25', title: 'oor smoke 提案', mark: 'oor smoke 提案锚点。',
    }), 'utf8')
    await openOverviewPane(page, 'proposals')
    await expect(page.locator('[data-dsh-forge-overview-prop-dir="oor-smoke-proposal"]'), 'Step 3:提案板行(仓外回流)').toBeVisible({ timeout: 20_000 })

    // Invariant:代码仓零新增过程文档。
    expect(existsSync(join(kernel.codeRoot, 'docs')), '代码仓内 docs/ 不存在').toBe(false)
    expect(snapshotTree(kernel.codeRoot), '代码仓与基线全等').toEqual(repoBaseline)
    expect(gitStatusPorcelain(kernel.codeRoot), 'git status 为空').toBe('')
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
