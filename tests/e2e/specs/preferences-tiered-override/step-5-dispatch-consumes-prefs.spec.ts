// @feature dsh-forge-m3 | @web-e2e | @journey preferences-tiered-override
// Traceability: docs/features/dsh-forge-m3/testing/preferences-tiered-override/
// contracts/step-5-dispatch-consumes-prefs.md — one test per Outcome:
//   success               — 修改 feature 级 coverage 偏好(55%)后派发 → 注入
//                           反映最新生效值;默认 80 退场;编辑面生效值与派发
//                           消费值同源一致(getPrefs 同源)。
//   no-retroactive-rewrite — 偏好再改(55 → 66%)后:修改前已派发 subagent
//                           的 prompt_hash 不变(不追溯改写);新派发消费 66。
// fixture_spec: Project(sqlite)/Feature/Task(pending ×3)/PrefEntry(feature 级
// coverage 覆盖)+ Dispatch — served by harness.buildMainWorld + dispatch。

import { expect, test } from '@playwright/test'
import {
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  openKernelDb,
  recomputePresynth,
  waitForOrchBadge,
  waitForPromptRow,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { COVERAGE_KEY, buildMainWorld } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const TASK_1 = 'prefs-loop/1'
const TASK_2 = 'prefs-loop/2'
const TASK_3 = 'prefs-loop/3'

test.describe.serial('preferences-tiered-override / step 5: 派发链消费生效值断言', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('prefs-s5'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  /** Set the feature-level coverage override through the editing surface. */
  async function setCoverageThroughSurface(world: Awaited<ReturnType<WorldManager['acquire']>>, percentage: string): Promise<void> {
    const { page } = world
    const slug = (kernel as KernelWorld).featureSlug
    await page.locator('[data-dsh-forge-tab="workbench/overview"]').click()
    await expect(page.locator('[data-dsh-forge-prefs-section]'), '偏好面在场').toBeVisible({ timeout: 30_000 })
    await page.locator('[data-dsh-forge-pref-tier="feature"]').click()
    await page.locator('[data-dsh-forge-prefs-feature-trigger]').click()
    await page.locator(`[data-dsh-forge-prefs-feature-item="${slug}"]`).click()
    const row = page.locator(`[data-dsh-forge-pref-group-body="coverage"] [data-dsh-forge-pref-row="${COVERAGE_KEY}"]`)
    await expect(row).toBeVisible({ timeout: 30_000 })
    const input = row.locator('[data-dsh-forge-pref-control="coverage-input"]')
    await input.fill(percentage)
    await input.press('Enter')
    await expect(row.locator('[data-dsh-forge-pref-override]'), `feature 级覆盖落库(${percentage}%)`).toBeVisible({ timeout: 15_000 })
    const dismiss = page.locator('[data-dsh-forge-prefs-toast-dismiss]')
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
  }

  // Outcome "success" — 修改后派发消费新生效值(55%)。
  test('step5/success: post-change dispatch injects the NEW effective value (55%); the registry default 80 retreats; editing surface and dispatch consume the same resolution', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')
    const slug = (kernel as KernelWorld).featureSlug

    // 修改偏好:feature 级 coverage = 55(编辑面写口)。
    await setCoverageThroughSurface(world, '55')
    const rows = await bridgeInvoke<Array<{ key: string; value: unknown; source: string | null }>>(
      page, 'getPrefs', [{ feature: `${world.projectId}/${slug}` }],
    )
    expect(rows.find(row => row.key === COVERAGE_KEY)?.value, '编辑面生效值 = 55%(getPrefs 同源)').toEqual({ type: 'percentage', percentage: 55 })

    // 派发任务一 → 注入反映新生效值。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await dispatchFromBoard(page, [TASK_1])
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    if (row === undefined) throw new Error('dispatch row missing')
    const prompt = await waitForPromptRow(page, stub, row.sessionId as string)

    expect(prompt.text, '生效偏好反映修改后的最终生效值(55%)').toContain('Target: Achieve 55% test coverage')
    expect(prompt.text, '注册表默认(80)不再生效').not.toContain('Achieve 80% test coverage')

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      expect(verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, TASK_1),
        promptHash: row.promptHash,
        sessionId: row.sessionId as string,
        requestId: prompt.requestId,
      }), '注入 oracle 四件套(编辑面与派发链同源一致)').toEqual({ ok: true })
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "no-retroactive-rewrite" — 已派发不追溯;仅新派发消费新值。
  test('step5/no-retroactive-rewrite: after a further change (55 → 66) the pre-change row keeps its prompt_hash; only the NEW dispatch consumes 66%', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // 修改前派发(任务二 @55)。
    await dispatchFromBoard(page, [TASK_2])
    await waitForOrchBadge(page, TASK_2, 'running', 20_000)
    const preRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_2)
    if (preRow === undefined) throw new Error('pre-change dispatch row missing')
    const prePrompt = await waitForPromptRow(page, stub, preRow.sessionId as string)
    expect(prePrompt.text, '前置:修改前注入 = 55%').toContain('Target: Achieve 55% test coverage')

    // 偏好再改:55 → 66。
    await setCoverageThroughSurface(world, '66')

    // 修改后再派发(任务三)→ 消费 66。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await dispatchFromBoard(page, [TASK_3])
    await waitForOrchBadge(page, TASK_3, 'running', 20_000)
    const postRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_3)
    if (postRow === undefined) throw new Error('post-change dispatch row missing')
    const postPrompt = await waitForPromptRow(page, stub, postRow.sessionId as string)
    expect(postPrompt.text, '新派发消费新生效值(66%)').toContain('Target: Achieve 66% test coverage')

    // 已派发 subagent 不被追溯改写:旧行 hash 原值。
    const preRowAfter = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.id === preRow.id)
    expect(preRowAfter?.promptHash, '既有派发行 prompt_hash 不变(不追溯改写)').toBe(preRow.promptHash)
    expect(preRowAfter?.state, '既有行态不变').toBe(preRow.state)
  })
})
