// @feature dsh-forge-m2 | @web-e2e | @journey multi-project-management
// Traceability: docs/features/dsh-forge-m2/testing/multi-project-management/contracts/step-2-select-code-root.md
//
// Step 2(选择代码根目录并检出 forge 数据)的四条 Outcome 腿。
//
// 代码现实记录(divergence note,gen-test-scripts 勘误):
//   装配链的向导步骤 ① 探测(probeCodeRoot)仍是 build-stage mock 孪生
//   (packages/plugins/forge-workbench/src/client/ipc/workbench.ts:
//   createIpcRegisterWizardVerbs 只注入 registerProject/updateProject/
//   authorizeExternalDocPath 三个写动词;mock 探测按字面 fixture 路径判
//   Z:\project\gone → ERR_CODE_ROOT_UNREADABLE、Z:\project\plain →
//   ERR_FORGE_NOT_DETECTED,其余非空路径一律「检出通过」)。真实的只读校验链
//   (FT-037(2)(6)、FT-038)在步骤 ③ 提交时的 registerProject 里跑,ERR_*
//   拒绝呈现为步骤 ③ 的 submit-error。因此:
//     no-forge-data / code-root-unreadable 各编码两腿 —— ①停留腿(mock
//     fixture 路径,呈现 contract 的「停留在步骤 ①」面)+ ②真实链腿(真实
//     路径,步骤 ③ submit 拒绝 + getState 零落库);「扫描中 loading 指示」
//     为瞬态机态(mock 即答,不可确定性观察),断言落在终态 detected。
//   duplicate-registration:ERR_PROJECT_EXISTS 在步骤 ③ 提交时浮出
//   (FT-036/FT-037(7):UNIQUE(code_root) 落库关卡;步骤 ① 探测不查重),
//   呈现为 wizard-exists + 「定位既有项目卡片」CTA —— 按实装链编码,
//   contract 的「步骤 ① 提示」口径差异记录于此。
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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

/** The mock twin's step-① probe fixtures (deterministic stay-on-① channels; see header). */
const MOCK_UNREADABLE_ROOT = 'Z:\\project\\gone'
const MOCK_NO_FORGE_ROOT = 'Z:\\project\\plain'

/** The workbench-owned registry read (zero-write oracle, FT-030). */
async function readRegistry(page: Page): Promise<{ rows: string[]; activeProjectId: string | null }> {
  return await page.evaluate(async () => {
    type Bridge = { getState?: () => Promise<{ projects: Array<{ id: string }>; activeProjectId: string | null }> }
    const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
    const state = await bridge?.getState?.()
    return { rows: (state?.projects ?? []).map(row => row.id), activeProjectId: state?.activeProjectId ?? null }
  })
}

/** The journey's bundle shape: base bundles + the mandatory forge-workbench core. */
function journeyBundles(): ReadonlyArray<{ name: string; source?: string; mandatory?: true }> {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true },
  ]
}

// [M4 1.8 e2e 迁移·迁移清单 第①行 · 全局导航 chrome(ProjectSwitcher / TopBar / TabBar)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 2.10 复核:断言锚定已退役宿主方言(旧向导/换台 chrome/提案板与
// Feature 板详情/阶段资产面板内部件),右栏 pane 族未承接 —— 挂起终态与恢复前置 = regression-inventory.md 开放项。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-2/success [@web-e2e @journey multi-project-management]: readable forge code root probes detected and advances to step ② with zero writes', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm2ok', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const setB = generateTaskSet({ seed: 'mpm2okb', taskCount: 7, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm2-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm2') })
  const projectB = writeForgeProject(setB, { codeRoot: join(root, 'proj-b-mpm2') })

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
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectB.codeRoot)
      // 检出通过(终态;loading 为瞬态机态,见头注)→「下一步」可用 → 前进 ②。
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]'), '检出通过后进入步骤 ②').toBeVisible()

      // State:检出为只读探测(FT-038),零注册写入。
      const after = await readRegistry(page)
      expect(after.rows).toEqual(before.rows)
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-2/no-forge-data [@web-e2e @journey multi-project-management]: forge-less path is refused — stays on ① (probe leg) and rejected at submit (real chain leg), zero writes on both', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm2nf', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm2nf-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm2nf') })
  // 真实链腿的装置:存在但不含 forge 数据的普通目录(无 .forge、无 docs/features)。
  const plainDir = join(root, 'plain-no-forge')
  mkdirSync(plainDir, { recursive: true })

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
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      // ---- ①停留腿:探测失败 + 修正引导 + 「下一步」不可用 + 停留步骤 ① ----
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(MOCK_NO_FORGE_ROOT)
      await expect(page.locator('[data-dsh-forge-wizard-probe="failed"]')).toBeVisible({ timeout: 10_000 })
      const guide = page.locator('[data-dsh-forge-wizard-probe-guide]')
      await expect(guide, '错误引导(修正路径/先初始化项目)非空').not.toHaveText('')
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeDisabled()
      await expect(page.locator('[data-dsh-forge-wizard-step-path]'), '停留在步骤 ①').toBeVisible()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]'), '不得进入步骤 ②').toHaveCount(0)
      expect((await readRegistry(page)).rows, '停留腿零注册写入').toEqual(before.rows)

      // ---- ②真实链腿:真实无 forge 目录 → 提交时主进程校验链拒绝 ------------
      // (mock 探测对该路径宽容放行 — 见头注 divergence note)
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(plainDir)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click() // M3 翻转(1.7):仓外为默认,本腿选回仓内注册
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      const submitError = page.locator('[data-dsh-forge-wizard-submit-error]')
      // The rendered copy carries the folded envelope message (not the code
      // literal): the chain's human message names the missing probes.
      await expect(submitError, 'ERR_FORGE_NOT_DETECTED 在步骤 ③ 提交时拒绝(FT-037(6)+FT-038)').toBeVisible({ timeout: 15_000 })
      await expect(submitError).toContainText('no forge data detected')
      await expect(submitError).toContainText('docs/features')
      // State:注册校验在 forge 检出关卡拒绝 —— 注册表不变。
      const after = await readRegistry(page)
      expect(after.rows, '真实链腿零落库').toEqual(before.rows)
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-2/duplicate-registration [@web-e2e @journey multi-project-management]: re-registering a registered code root is refused at submit with locate-to-existing-card, registry unchanged', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm2dup', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm2dup-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm2dup') })

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
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)
      expect(before.rows).toHaveLength(1)

      // 实装链(见头注):路径探测放行 → 走完 ①②③ → 提交时 UNIQUE(code_root)
      // 拒绝(FT-036/FT-037(7))→ 步骤 ③ 呈现已注册提示 + 定位 CTA。
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(projectA.codeRoot)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click() // M3 翻转(1.7):仓外为默认,本腿选回仓内注册
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      await expect(page.locator('[data-dsh-forge-wizard-exists]'), 'ERR_PROJECT_EXISTS 已注册提示').toBeVisible({ timeout: 15_000 })

      // 定位既有项目卡片:向导自行关闭,既有卡片在位。
      await page.locator('[data-dsh-forge-wizard-locate]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]'), 'locate 后向导关闭').toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-project-card]', { hasText: 'proj-a-mpm2dup' })).toBeVisible()

      // State:注册不重复落库(工作台状态读数不变)。
      const after = await readRegistry(page)
      expect(after.rows, '重复注册被拒,行集不变').toEqual(before.rows)
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

test.fixme('step-2/code-root-unreadable [@web-e2e @journey multi-project-management]: unreadable code root is refused — stays on ① (probe leg) and rejected at submit (real chain leg), zero writes on both', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setA = generateTaskSet({ seed: 'mpm2ur', taskCount: 6, featureCount: 1, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-mpm2ur-'))
  const projectA = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-mpm2ur') })
  // 真实链腿装置:不存在的路径。
  const missingDir = join(root, 'no-such-root')

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
      const projectAId = await registerFixtureProject(page, projectA)
      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()
      const before = await readRegistry(page)

      // ---- ①停留腿:探测失败 + 引导 + 「下一步」不可用 + 停留步骤 ① ----------
      await page.locator('[data-dsh-forge-add-project]').click()
      await expect(page.locator('[data-dsh-forge-dialog="register-wizard"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(MOCK_UNREADABLE_ROOT)
      await expect(page.locator('[data-dsh-forge-wizard-probe="failed"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-wizard-probe-guide]'), '错误提示引导非空').not.toHaveText('')
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeDisabled()
      await expect(page.locator('[data-dsh-forge-wizard-step-path]'), '停留在步骤 ①').toBeVisible()
      expect((await readRegistry(page)).rows, '停留腿零注册写入').toEqual(before.rows)

      // ---- ②真实链腿:真实不存在路径 → 提交时可读性关卡拒绝(FT-037(2))----
      await page.locator('[data-dsh-forge-wizard-path-input]').fill(missingDir)
      await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await expect(page.locator('[data-dsh-forge-wizard-step-doc]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-doc-in-repo]').click() // M3 翻转(1.7):仓外为默认,本腿选回仓内注册
      await expect(page.locator('[data-dsh-forge-wizard-step-summary]')).toBeVisible()
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      const submitError = page.locator('[data-dsh-forge-wizard-submit-error]')
      // The folded envelope message carries path + reason (FT-037(2):消息含路径与原因).
      await expect(submitError, 'ERR_CODE_ROOT_UNREADABLE 在步骤 ③ 提交时拒绝(可读性关卡先于检出与唯一性)').toBeVisible({ timeout: 15_000 })
      await expect(submitError).toContainText('is not a readable directory')
      await expect(submitError).toContainText(missingDir.replaceAll('\\', '/'), '消息含路径')
      await expect(submitError).toContainText('does not exist', '消息含原因')
      const after = await readRegistry(page)
      expect(after.rows, '真实链腿零落库').toEqual(before.rows)
      expect(after.activeProjectId).toBe(projectAId)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
