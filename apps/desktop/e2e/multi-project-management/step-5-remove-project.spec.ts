// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-5-remove-project.md
//
// Step 5(移除一个注册项目)的三条 Outcome 腿:
//   success(非激活移除 + 重注册回环)— 二次确认文案承诺「仅移除工作台内的
//     注册信息,不删除仓库内的任何文件」;确认后仅注册信息删除 + 项目目录与
//     forge 数据零改动(测试进程文件树快照对拍 —— Hard Rule,不以「没报错」
//     为据);激活指针不变断言仅作用于本非激活移除腿(eval 勘误:字面互斥于
//     step-3 success 的激活语义);同一 code_root 此后可再次注册成功(FT-036
//     槽位释放)。
//   remove-active-with-remaining — 移除当前激活项目:激活指针清空(置 null,
//     不自动迁移,FT-036)→ 任务/feature 项目域页呈现引导卡(sc5 已裁决的
//     真实动词行为)。
//   remove-last-project — 移除最后一个项目:注册表清空 → 概览空态卡 + 注册
//     CTA 引导至向导(FT-053「无激活项目 → 概览空态引导至向导」;实装为空态
//     卡 CTA 打开向导,非自动弹出 —— 按源码实状编码)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'

/** The workbench-owned registry read (removal/activation oracle, FT-030). */
async function readRegistry(page: Page): Promise<{ rows: string[]; activeProjectId: string | null }> {
  return await page.evaluate(async () => {
    type Bridge = { getState?: () => Promise<{ projects: Array<{ id: string }>; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { rows: (state?.projects ?? []).map(row => row.id), activeProjectId: state?.activeProjectId ?? null }
  })
}

/** Register WITHOUT activating (bridge write verb; keeps the other project active). */
async function bridgeRegisterProject(page: Page, codeRoot: string): Promise<string> {
  return await page.evaluate(async (codeRootInput: string) => {
    type Bridge = { registerProject?: (input: { codeRoot: string; docLocationType: 'in_repo' }) => Promise<{ id: string }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    if (bridge?.registerProject === undefined) throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    const row = await bridge.registerProject({ codeRoot: codeRootInput, docLocationType: 'in_repo' })
    return row.id
  }, codeRoot)
}

/** The sanctioned fixture channel for 挂接行(FT-035:SoT = 工作台自有库)。 */
async function bridgeRecordSessionLink(page: Page, input: { projectId: string; taskKey: string; sessionId: string }): Promise<void> {
  await page.evaluate(async (args: { projectId: string; taskKey: string; sessionId: string }) => {
    type Bridge = { recordSessionLink?: (row: { projectId: string; taskKey: string; sessionId: string }) => Promise<unknown> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    if (bridge?.recordSessionLink === undefined) throw new Error('dshForge.workbench bridge is unavailable in the e2e renderer')
    await bridge.recordSessionLink(args)
  }, input)
}

function journeyBundles(): ReadonlyArray<{ name: string; source?: string; mandatory?: true }> {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
  ]
}

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
const cardOf = (page: Page, name: string) => page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

/** 走向导重注册(FT-036 槽位释放腿的用户面):①检出 → ②默认仓内 → ③完成。 */
async function wizardRegisterInRepo(page: Page, codeRoot: string, name: string): Promise<void> {
  await page.locator('[data-dsh-forge-add-project]').click()
  await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
  await expect(cardOf(page, name)).toBeVisible({ timeout: 30_000 })
}

test('step-5/success [@web-e2e @journey multi-project-management]: non-active removal deletes only the registration (tree hashes prove it) and releases the code_root slot for re-registration', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setA = generateTaskSet({ seed: 'mpm5ok', taskCount: 8, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm5okb', taskCount: 9, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm5-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm5') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm5') })
  const nameB = 'proj-b-mpm5'
  const featureB1 = setB.features[0]
  const taskB1 = featureB1?.tasks[0]
  if (featureB1 === undefined || taskB1 === undefined) throw new Error('fixture set B missing tasks')

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // Setup:A 激活;B 仅注册(桥接写动词,不激活)—— 非激活移除腿前提。
      const projectAId = await registerFixtureProject(page, projectA)
      const projectBId = await bridgeRegisterProject(page, projectB.codeRoot)
      expect((await readRegistry(page)).activeProjectId).toBe(projectAId)
      // 被移除项目的任务至少 1 条挂接(级联删除非空洞;FT-035)。
      await bridgeRecordSessionLink(page, {
        projectId: projectBId,
        taskKey: `${featureB1.slug}/${taskB1.localId}`,
        sessionId: 'session-mpm5-b-0001',
      })

      // 文件树快照(前):移除断言必须文件系统级对拍。
      const hashA = hashTree(projectA.codeRoot)
      const hashB = hashTree(projectB.codeRoot)

      // 移除 + 二次确认:文案必须承诺不动项目文件(Hard Rule 呈现面)。
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="remove"]').click()
      await expect(page.locator('[data-dsh-forge-remove-confirm]')).toBeVisible({ timeout: 10_000 })
      const promiseCopy = page.locator('[data-dsh-forge-remove-promise]')
      await expect(promiseCopy, '「仅删除注册信息,不动项目文件」承诺文案在(非空即据)').not.toHaveText('')
      await expect(promiseCopy).toContainText('文件')
      await page.locator('[data-dsh-forge-remove-confirm]').click()

      // 注册信息删除:卡片消失、行删除、(非激活移除腿)激活指针不变。
      await expect(cardOf(page, nameB)).toHaveCount(0, { timeout: 10_000 })
      let after = await readRegistry(page)
      expect(after.rows, 'projects 行删除').toEqual([projectAId])
      expect(after.activeProjectId, '非激活移除:激活指针仍指第一个项目(本腿作用域)').toBe(projectAId)

      // Hard Rule:项目仓内文件与 forge 数据零改动(前后树对拍)。
      assertTreesIdentical('A codeRoot across removing B', hashA, hashTree(projectA.codeRoot))
      assertTreesIdentical('B codeRoot across removing B', hashB, hashTree(projectB.codeRoot))

      // 同一 code_root 重新发起注册:槽位已随移除释放(FT-036),注册成功。
      await wizardRegisterInRepo(page, projectB.codeRoot, nameB)
      await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameB, { timeout: 10_000 })
      after = await readRegistry(page)
      expect(after.rows, '重注册落库,槽位释放').toHaveLength(2)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-5/remove-active-with-remaining [@web-e2e @journey multi-project-management]: removing the active project clears the activation pointer (no migration) and gates the project-scoped tabs', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setA = generateTaskSet({ seed: 'mpm5ra', taskCount: 8, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm5rb', taskCount: 8, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm5ra-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm5ra') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm5ra') })
  const nameA = 'proj-a-mpm5ra'
  const nameB = 'proj-b-mpm5ra'
  const featureA1 = setA.features[0]
  const taskA1 = featureA1?.tasks[0]
  if (featureA1 === undefined || taskA1 === undefined) throw new Error('fixture set A missing tasks')

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      // Setup:B 在册;A 注册并激活 —— A 为待移除的激活项目,移除后剩 B。
      const projectBId = await bridgeRegisterProject(page, projectB.codeRoot)
      const projectAId = await registerFixtureProject(page, projectA)
      expect((await readRegistry(page)).activeProjectId).toBe(projectAId)
      // 被移除(激活)项目的任务至少 1 条挂接(「不残留挂接数据」非空洞)。
      await bridgeRecordSessionLink(page, {
        projectId: projectAId,
        taskKey: `${featureA1.slug}/${taskA1.localId}`,
        sessionId: 'session-mpm5ra-a-0001',
      })

      const hashA = hashTree(projectA.codeRoot)
      const hashB = hashTree(projectB.codeRoot)

      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await cardOf(page, nameA).locator('[data-dsh-forge-card-action="remove"]').click()
      await expect(page.locator('[data-dsh-forge-remove-confirm]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-remove-confirm]').click()
      await expect(cardOf(page, nameA)).toHaveCount(0, { timeout: 10_000 })

      // State:激活指针清空(FT-036:事务内置空,不自动迁移到剩余项目)。
      const after = await readRegistry(page)
      expect(after.activeProjectId, 'active_project_id 置空,非自动迁移').toBeNull()
      expect(after.rows, '注册表不残留已移除项目(快照/挂接级联)').toEqual([projectBId])

      // 项目域页呈现引导卡(选择/注册引导):任务与 feature 两 tab 同 gate。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-gate]'), '任务页引导卡(激活指针置空)').toBeVisible({ timeout: 15_000 })
      await page.getByRole('tab', { name: /^feature$|^Features$/ }).click()
      await expect(page.locator('[data-dsh-forge-gate]'), 'feature 页同 gate').toBeVisible({ timeout: 15_000 })

      // 剩余项目仍可浏览(概览卡片在);文件零改动。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(cardOf(page, nameB), '剩余项目注册信息完好').toBeVisible()
      assertTreesIdentical('A codeRoot across removing active A', hashA, hashTree(projectA.codeRoot))
      assertTreesIdentical('B codeRoot across removing active A', hashB, hashTree(projectB.codeRoot))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})

test('step-5/remove-last-project [@web-e2e @journey multi-project-management]: removing the only project empties the registry and lands the overview empty state guided to the wizard, files untouched', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const setC = generateTaskSet({ seed: 'mpm5last', taskCount: 7, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm5last-'))
  const projectC = writeForgeProject(setC, { codeRoot: join(root, 'proj-c-mpm5last') })
  const nameC = 'proj-c-mpm5last'

  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectCId = await registerFixtureProject(page, projectC)
      expect((await readRegistry(page)).rows).toEqual([projectCId])
      const hashC = hashTree(projectC.codeRoot)

      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      await cardOf(page, nameC).locator('[data-dsh-forge-card-action="remove"]').click()
      await expect(page.locator('[data-dsh-forge-remove-confirm]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-remove-confirm]').click()
      await expect(cardOf(page, nameC)).toHaveCount(0, { timeout: 10_000 })

      // State:注册表清空 + 激活指针随之清空(FT-036)。
      const after = await readRegistry(page)
      expect(after.rows, '注册表清空').toEqual([])
      expect(after.activeProjectId).toBeNull()

      // Output:进入空态,引导至注册向导(UF1 States empty / FT-053;实装 =
      // 概览空态卡 + 注册 CTA 打开向导,见头注)。
      await expect(page.locator('[data-dsh-forge-overview-empty]')).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-overview-register]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]'), '空态 CTA 引导进入注册向导').toBeVisible({ timeout: 10_000 })

      // Hard Rule:项目仓内文件不被改动。
      assertTreesIdentical('C codeRoot across removing the last project', hashC, hashTree(projectC.codeRoot))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
