// @feature dsh-forge-m3 | @web-e2e | @journey out-of-repo-docs-root
// Traceability: docs/features/dsh-forge-m3/testing/out-of-repo-docs-root/
// contracts/step-3-assets-land-doc-root.md — one test per Outcome:
//   success         — 多类过程资产(任务/执行记录/阶段资产/proposals)产出
//                     后:各看板/面板呈现与产出一致且全部来自仓外文档根;
//                     代码仓工作区零应用/agent 新增过程文档(git 断言)。
//   legacy-in-repo-docs-invisible — 仓内既有过程文档(无 index.json)项目
//                     按默认仓外注册:不插入迁移步骤;视图按仓外寻址,仓内
//                     文档零改动零搬迁不出现在视图。
//   remove-registration — 移除注册:仅级联清除自有数据;仓内文件与 forge
//                     数据零改动;再次注册同一代码根可行。
// fixture_spec: Project(external)/Task/StageAsset/Proposal/ExecutionRecord +
// (legacy: ForgeProjectCodeRoot hasInRepoProcessDocs, hasIndexJson=false)。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { freshRoot, gitStatusPorcelain, normPath, proposalMarkdown, recordMarkdown, snapshotTree, WorldManager, bridgeInvoke } from '../_lib/journey-world.ts'
import { buildLegacyWorld, buildPureWorld, managedDocRoot, OOR_FEATURE, registerExternalViaWizard } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const TASK_KEY = `${OOR_FEATURE}/1`
const RECORD_MARK = 'oor 记录读写锚点 — 记录 md 落仓外文档根,taskGet 读回。'
const STAGE_GOAL = 'oor 阶段资产目标锚点 — stageSummarize 落仓外文档根。'
const PROPOSAL_MARK = 'oor 提案锚点 — proposals/ 落仓外文档根,提案板行回流。'

test.describe.serial('out-of-repo-docs-root / step 3: 过程资产读写落于文档根', () => {
  const manager = new WorldManager()
  let pure: KernelWorld | null = null
  let legacy: KernelWorld | null = null

  test.beforeAll(async () => {
    pure = await buildPureWorld(freshRoot('oor-s3a'))
    legacy = await buildLegacyWorld(freshRoot('oor-s3b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  // Outcome "success" — 四类资产同源仓外 + 代码仓零新增。
  test.fixme('step3/success: tasks/records/stage-assets/proposals all read+write at the doc root; boards render them; the code repo workspace stays clean (git face)', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const world = await manager.acquire(pure as KernelWorld, 'pure', { activate: false, tab: 'workbench/overview' })
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')
    const docRoot = managedDocRoot((pure as KernelWorld).root, 'repo')
    const featuresRoot = join(docRoot, 'docs', 'features')
    const repoBaseline = snapshotTree((pure as KernelWorld).codeRoot)

    await registerExternalViaWizard(page, (pure as KernelWorld).codeRoot)

    // 激活 → 任务 tab(读面经仓外文档根)。
    const displayName = (pure as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId as string
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"]`), '任务读回(仓外文档根)').toBeVisible({ timeout: 20_000 })

    // ① 任务:派发(产物齐 → 直达确认)→ stub 执行 → 记录落仓外 → claim/submit。
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    await page.locator(`[data-dsh-forge-select-chk="${TASK_KEY}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-go]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐 → 无警告直达确认').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await page.locator(`[data-dsh-forge-node-card="${TASK_KEY}"] [data-dsh-forge-orch-badge="running"]`)
      .waitFor({ state: 'visible', timeout: 20_000 })
    const dispatchRow = (await bridgeInvoke<Array<{ id: string; sessionId: string | null }>>(page, 'getDispatches', [projectId])).find(row => row.taskKey === TASK_KEY)
    const actor = `session:${dispatchRow?.sessionId as string}`
    await bridgeInvoke(page, 'taskClaim', [{ projectId, taskKey: TASK_KEY }, actor])
    const recordsDir = join(featuresRoot, OOR_FEATURE, 'tasks', 'records')
    mkdirSync(recordsDir, { recursive: true })
    writeFileSync(join(recordsDir, '1-x.md'), recordMarkdown({ actor, summary: RECORD_MARK }), 'utf8')
    await bridgeInvoke(page, 'taskSubmit', [{ projectId, taskKey: TASK_KEY }, actor])

    // ② 记录:读回(taskGet;读的 = 仓外的)。
    const detail = await bridgeInvoke<{ records: Array<{ summary: string }> }>(page, 'taskGet', [{ projectId, taskKey: TASK_KEY }])
    expect(detail.records.some(row => row.summary.includes(RECORD_MARK)), '记录读回(仓外 records/ 方言)').toBe(true)

    // ③ 阶段资产:stageSummarize 落仓外 + advanceStage manifest 原位翻转。
    const summarized = await bridgeInvoke<{ path: string; gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId, featureSlug: OOR_FEATURE, stage: 'tasks', goal: STAGE_GOAL, summary: 'oor 摘要锚点。\n',
    }])
    expect(summarized.path, '资产相对路径 = <slug>/stages/tasks.md').toBe(`${OOR_FEATURE}/stages/tasks.md`)
    expect(existsSync(join(featuresRoot, OOR_FEATURE, 'stages', 'tasks.md')), '阶段资产落【仓外文档根】').toBe(true)
    const advanced = await bridgeInvoke<{ status: string }>(page, 'advanceStage', [projectId, OOR_FEATURE])
    expect(advanced.status, '推进 → in-progress').toBe('in-progress')

    // ④ proposals:外部落提案 → 提案板行(感知回流)。
    const proposalDir = join(docRoot, 'docs', 'proposals', 'oor-pipeline-proposal')
    mkdirSync(proposalDir, { recursive: true })
    writeFileSync(join(proposalDir, 'proposal.md'), proposalMarkdown({
      status: 'draft', author: 'oor-agent', created: '2026-09-25', title: 'oor 仓外提案语料', mark: PROPOSAL_MARK,
    }), 'utf8')
    await page.locator('[data-dsh-forge-tab="workbench/proposals"]').click()
    await expect(page.locator('[data-dsh-forge-proposal-row="oor-pipeline-proposal"]'), 'proposals/ 落仓外 → 提案板行').toBeVisible({ timeout: 20_000 })

    // 代码仓零新增过程文档(3b 并档:各资产类型 ≥1 后的 git 级检查)。
    expect(existsSync(join((pure as KernelWorld).codeRoot, 'docs')), '代码仓内 docs/ 根本不存在').toBe(false)
    expect(snapshotTree((pure as KernelWorld).codeRoot), '代码仓文件树与基线全等').toEqual(repoBaseline)
    expect(gitStatusPorcelain((pure as KernelWorld).codeRoot), 'git status 为空(git 断言面)').toBe('')
  })

  // Outcome "legacy-in-repo-docs-invisible" — 仓内既有文档不被呈现、零搬迁。
  test.fixme('step3/legacy-in-repo-docs-invisible: the legacy tree (in-repo docs, NO index.json) registers default-external: no migration step, views address the external root, in-repo files untouched', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(legacy as KernelWorld, 'legacy', { activate: false, tab: 'workbench/overview' })
    const { page } = world
    const legacyTreeBefore = snapshotTree((legacy as KernelWorld).codeRoot)

    // 向导:默认仓外;不插入迁移步骤(未检出 index.json)。
    await page.locator('[data-dsh-forge-add-project]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-path-input]').fill((legacy as KernelWorld).codeRoot)
    await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
    await expect(page.locator('[data-dsh-forge-wizard-doc-external]'), '保持默认仓外').toBeChecked()
    await page.locator('[data-dsh-forge-wizard-authorize]').check()
    await page.locator('[data-dsh-forge-wizard-next]').click()
    await expect(page.locator('[data-dsh-forge-wizard-step-migrate]'), '未检出 index.json → 不插入迁移确认步骤').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-wizard-step-summary]'), '直达摘要步骤').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-wizard-finish]').click()
    await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toHaveCount(0, { timeout: 15_000 })

    // 视图按仓外文档根寻址:仓内既有过程文档不出现在视图;文件零改动零搬迁。
    const displayName = (legacy as KernelWorld).codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    // 任务视图可寻址:空语料 = 看板空态卡呈现(任务卡/提案行仅在语料非空
    // 时存在,生成稿曾误以为空态也有行元素)。
    await expect(page.locator('[data-dsh-forge-task-board-empty]'),
      '任务视图可寻址(空态 = 无任务空态卡呈现)').toBeVisible({ timeout: 20_000 })
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string; docLocationType: string }> }>(page, 'getState', [])
    expect(state.projects.find(row => normPath(row.codeRoot) === normPath((legacy as KernelWorld).codeRoot))?.docLocationType,
      '注册行 external(按仓外寻址)').toBe('external')
    expect(snapshotTree((legacy as KernelWorld).codeRoot), '仓内既有过程文档零改动、零搬迁').toEqual(legacyTreeBefore)
  })

  // Outcome "remove-registration" — 移除 = 仅自有数据级联;仓内零触碰。
  test.fixme('step3/remove-registration: removing the registration cascades ONLY app-owned data; repo files + forge data untouched; re-registering the same root works', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(pure as KernelWorld, 'pure', { activate: false, tab: 'workbench/overview' })
    const { page } = world
    const repoBefore = snapshotTree((pure as KernelWorld).codeRoot)

    const stateBefore = await bridgeInvoke<{ projects: Array<{ id: string; codeRoot: string }> }>(page, 'getState', [])
    const project = stateBefore.projects.find(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot))
    if (project === undefined) throw new Error('前置:项目已注册(serial 前驱)')

    // 移除注册(级联清除快照/挂接等自有数据)。
    await bridgeInvoke(page, 'removeProject', [project.id])
    const stateAfter = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(stateAfter.projects.some(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot)),
      '移除完成(注册表不含该项目)').toBe(false)

    // 项目仓内文件与 forge 数据零改动;仓外文档根归宿不作断言(PRD 未定界)。
    expect(snapshotTree((pure as KernelWorld).codeRoot), '项目仓零改动(.forge 含内)').toEqual(repoBefore)

    // 再次注册同一代码根可行(文档根 index.json 已归档 → 无迁移步骤路径)。
    await registerExternalViaWizard(page, (pure as KernelWorld).codeRoot, { expectMigration: false })
    const stateRe = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(stateRe.projects.some(row => normPath(row.codeRoot) === normPath((pure as KernelWorld).codeRoot)),
      '再次注册同一代码根可行').toBe(true)
  })
})
