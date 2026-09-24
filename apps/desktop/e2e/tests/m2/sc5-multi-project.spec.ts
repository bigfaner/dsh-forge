// @feature dsh-forge-m2 | @web-e2e | @journey sc5-multi-project
// Traceability: docs/features/dsh-forge-m2/tasks/6.4-sc45-features-external-docs.md
//
// SC5 验收腿(tech-design Key Test Scenarios / PRD SC5 + Story5 多项目):
//
//   SC5-1 仓外注册走授权交互 —— 第二项目经向导步骤②(external + 显式授权
//         确认)注册成功(6.4 补齐的 authorize-external-doc-path 动词在
//         submit 时先落授权记录);全功能可用:任务看板/feature/文档读的
//         都是仓外树,发起入口 probe=available。
//   路径失效 → 错误态 + 重新指向恢复 —— 删除仓外 docs 树(被 watch 的
//         features 目录):watcher 感知 → 扫描失败 → sync error 事件 →
//         概览失联卡(重新指向入口);文档读取逐次复验(T4)→ 文档 tab
//         错误卡;快照数据仍在(错误态不静默清数据)。重指向向导(编辑
//         模式)指向第二仓外树 → 校验链过(新路径授权)→ 重扫 → 快照按
//         新树重建(旧 slug 消失、新 slug 出现、文档内容随新树)。
//   SC5-2 切换 —— B 上留下选中态(任务 dock + 搜索过滤)与 feature 详情
//         子视图,经 chrome 切换器切 A:三页数据为 A,选中/筛选重置干净
//         (dock 关、过滤清、feature 子视图回列表、无跨项目徽标)。
//   SC5-3 移除 —— 确认后列表消失;对项目目录与仓外 doc 目录做前后哈希
//         对拍(Hard Rule:文件系统级,UI 消失不算充分);移除 ACTIVE 项目
//         → 激活指针清空 → 任务/feature 页呈现注册引导卡(5.14 已裁决的
//         真实动词行为:指针置 null,非自动迁移)。
//
// Hard Rules:腿内启动前单实例探测守卫;DSH_FORGE_USER_DATA 隔离;跑腿前
// pnpm build:plugins && pnpm stage:plugin-tarballs;仓外 fixture 全部住在
// journey 临时目录(TEST-isolation-000)。
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../../fixtures/forge-project.ts'
import { generateTaskSet } from '../../fixtures/task-generator.ts'
import type { GeneratedFeature, GeneratedTask } from '../../fixtures/task-generator.ts'
import { materializeStubCli } from '../../fixtures/stubs/cli.ts'
import { createChannelStub } from '../../fixtures/stubs/channel.ts'
import {
  cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, switchToWorkbench, waitForTreeNodes,
} from './helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from './helpers/tree-hash.ts'

/** The active project's lost-card repoint entry (the wizard EDIT mode door). */
const repointButton = (page: Page) => page.locator('[data-dsh-forge-overview-repoint]')

/** The card whose registered displayName is `name` (codeRoot 目录名 default). */
const cardOf = (page: Page, name: string) => page.locator('[data-dsh-forge-project-card]', { hasText: name }).first()

/** The wizard's external leg: step ② 仓外 + path + 授权确认. */
async function wizardExternal(page: Page, codeRoot: string, externalPath: string): Promise<void> {
  await page.locator('[data-dsh-forge-wizard-path-input]').fill(codeRoot)
  await expect(page.locator('[data-dsh-forge-wizard-probe="detected"]')).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-doc-external]').click()
  await page.locator('[data-dsh-forge-wizard-external-input]').fill(externalPath)
  await page.locator('[data-dsh-forge-wizard-authorize]').check()
  await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
  await page.locator('[data-dsh-forge-wizard-next]').click()
  await page.locator('[data-dsh-forge-wizard-finish]').click()
}

function sc5Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

test('6.4/sc5-multi-project [@web-e2e @journey sc5-multi-project]: external-authorized registration + invalidation→repoint recovery + switch/remove with tree hashes', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- journey fixtures: A(in_repo)/B(仓外 docs1)/B'(repoint 目标 docs2) ----
  const setA = generateTaskSet({ seed: 'sc5a', taskCount: 14, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const setB1 = generateTaskSet({ seed: 'sc5b1', taskCount: 15, featureCount: 3, danglingRate: 0, recordRate: 0 })
  const setB2 = generateTaskSet({ seed: 'sc5b2', taskCount: 11, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const featureA1 = setA.features[0] as GeneratedFeature
  const taskB1 = setB1.features[0]?.tasks[0] as GeneratedTask
  const featureB1 = setB1.features[0] as GeneratedFeature
  const featureB2 = setB2.features[0] as GeneratedFeature
  // The one-task search needle: generator titles end `#<globalIndex>` — task
  // index 7 (the 8th task of B1) is unique as a substring ('#17' ≠ '#7').
  const flatB1 = setB1.features.flatMap(feature => feature.tasks)
  const needleTask = flatB1[7] as GeneratedTask
  const needle = `#${needleTask.title.split('#')[1] ?? '7'}`

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc5-'))
  const projectA: WrittenForgeProject = writeForgeProject(setA, { codeRoot: join(root, 'proj-a-sc5') })
  const externalDocs1 = join(root, 'sc5-ext-docs-1')
  const projectB: WrittenForgeProject = writeForgeProject(setB1, {
    codeRoot: join(root, 'proj-b-sc5'),
    docsRoot: externalDocs1,
  })
  const externalDocs2 = join(root, 'sc5-ext-docs-2')
  writeForgeProject(setB2, { codeRoot: join(root, 'proj-b2-scratch'), docsRoot: externalDocs2 })
  const nameA = 'proj-a-sc5'
  const nameB = 'proj-b-sc5'

  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  stub.attachProject(projectA.codeRoot)
  stub.attachProject(projectB.codeRoot)
  // The 仓外 shape's stub docs roots (6.1 stub control): B's spawned cwd is
  // its codeRoot, where no docs/features exists — the prompt probe consults
  // the external tree instead (cwd-relative roots keep first-match priority).
  stub.writeControl({ docsRoots: [join(externalDocs1, 'docs', 'features')] })
  const session = createAppSessionFactory({
    bundles: sc5Bundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    // DSH_FORGE_PROJECT_ROOTS is a HOST-SPAWN-time env fact (6.3 lesson): the
    // launch probe's allowlist covers BOTH code roots explicitly.
    env: {
      ...stub.env,
      ...channel.env,
      DSH_FORGE_PROJECT_ROOTS: JSON.stringify([projectA.codeRoot, projectB.codeRoot]),
    },
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell

      // --- A over the bridge (activates); the SC5-1 subject is B via wizard --
      const projectAId = await registerFixtureProject(page, projectA)
      expect(typeof projectAId).toBe('string')

      await switchToWorkbench(page)
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]')).toBeVisible()

      // ======================================================================
      // SC5-1 · 仓外注册走授权交互:向导步骤② external + 授权确认 → 完成。
      // ======================================================================
      await page.locator('[data-dsh-forge-add-project]').click()
      await wizardExternal(page, projectB.codeRoot, externalDocs1)
      await expect(cardOf(page, nameB)).toBeVisible({ timeout: 30_000 })
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'false')
      await expect(page.locator('[data-dsh-forge-shell-toast]')).toContainText(nameB, { timeout: 10_000 })
      // 注册信息落库形态:仓外路径 ≠ codeRoot,经 getState 对拍。
      interface Sc5ProjectRow { id: string; displayName: string; codeRoot: string; docLocationType: string; docLocationPath: string | null }
      const registeredB = await page.evaluate(async () => {
        type Bridge = { getState?: () => Promise<{ projects: Sc5ProjectRow[] }> }
        const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
        const state = await bridge?.getState?.() ?? null
        return state?.projects.find(row => row.displayName === 'proj-b-sc5') ?? null
      })
      expect(registeredB).not.toBeNull()
      expect(registeredB?.docLocationType).toBe('external')
      expect(registeredB?.docLocationPath).not.toBe(registeredB?.codeRoot)

      // 激活 B(单激活事务)。
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="activate"]').click()
      await expect(cardOf(page, nameB)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameB)

      // ---- SC5-1 全功能:任务/feature/文档读的都是仓外树 -------------------
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      await waitForTreeNodes(page, setB1.facts.taskCount, 60_000)
      // 仓外树的任务详情可读(6.1:M2 发起入口随 ForgeBridge 退役;读面即
      // 仓外数据链的证词)。
      const taskBKey = `${featureB1.slug}/${taskB1.localId}`
      await page.locator(`[data-dsh-forge-node-card="${taskBKey}"]`).click()
      await expect(
        page.locator(`[data-dsh-forge-task-detail="${taskBKey}"]`),
        'the external project task detail reads over the out-of-repo tree',
      ).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-detail-close]').click()
      await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0)

      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      const featureB1Card = page.locator(`[data-dsh-forge-feature-card="${featureB1.slug}"]`)
      await expect(featureB1Card).toBeVisible({ timeout: 30_000 })
      await featureB1Card.click()
      const detailB1 = page.locator(`[data-dsh-forge-feature-detail="${featureB1.slug}"]`)
      await expect(detailB1).toBeVisible({ timeout: 15_000 })
      // 仓外角标(DF005)+ 文档内容 = 仓外树文件(规范化对比)。
      await expect(detailB1.locator('[data-dsh-forge-badge="external-docs"]')).toBeVisible()
      const normalize = (text: string): string => text.replaceAll(/\s+/g, '')
      const manifestProjection = (root: string, slug: string): string => normalize(
        readFileSync(join(root, 'docs', 'features', slug, 'manifest.md'), 'utf8')
          .split('\n')
          .filter(line => line.trim() !== '---')
          .map(line => line.replace(/^\s{0,3}#{1,6}\s+/, ''))
          .join('\n'))
      await expect.poll(async () => normalize(
        await detailB1.locator('[data-dsh-forge-feature-doc-panel="manifest"]').innerText({ timeout: 30_000 }),
      ), { timeout: 30_000 }).toBe(manifestProjection(externalDocs1, featureB1.slug))

      // ======================================================================
      // 路径失效 → 错误态:删除仓外 docs 树(被 watch 的 features 目录随父
      // 层消失 —— 深度优先删除先触发子事件,debounce 尾沿的扫描必见根缺失)。
      // ======================================================================
      rmSync(join(externalDocs1, 'docs'), { recursive: true, force: true })
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await expect(page.locator('[data-dsh-forge-overview-lost]'), 'the active external project turns 失联').toBeVisible({ timeout: 60_000 })
      await expect(repointButton(page)).toBeVisible()
      await expect(cardOf(page, nameB).locator('[data-dsh-forge-card-lost-badge]')).toBeVisible()

      // 文档读取逐次复验(T4):fresh 页会话(切页重挂载清 doc 缓存)→
      // 默认 manifest tab 即错误卡;任务页数据仍在(快照不因错误态清空)。
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      const detailB1Again = page.locator(`[data-dsh-forge-feature-detail="${featureB1.slug}"]`)
      if (await detailB1Again.count() === 0) {
        await page.locator(`[data-dsh-forge-feature-card="${featureB1.slug}"]`).click()
      }
      await expect(detailB1Again).toBeVisible({ timeout: 15_000 })
      await expect(detailB1Again.locator('[data-dsh-forge-feature-doc-error]')).toBeVisible({ timeout: 30_000 })
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setB1.facts.taskCount, 60_000)

      // ======================================================================
      // 重新指向 → 恢复:失联卡入口 → 向导编辑模式 → 指向 docs2(新路径
      // 的授权确认在 submit 落记录)→ 重扫后快照按新树重建。
      // ======================================================================
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await repointButton(page).click()
      // 编辑模式:步骤① codeRoot 只读直进;步骤② 改路径(重置授权)+ 重确认。
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-external-input]').fill(externalDocs2)
      await page.locator('[data-dsh-forge-wizard-authorize]').check()
      await expect(page.locator('[data-dsh-forge-wizard-next]')).toBeEnabled()
      await page.locator('[data-dsh-forge-wizard-next]').click()
      await page.locator('[data-dsh-forge-wizard-finish]').click()
      // 恢复:失联卡随 sync idle 事件消退;概览的仓外路径指向 docs2。
      await expect(page.locator('[data-dsh-forge-overview-lost]')).toHaveCount(0, { timeout: 30_000 })
      const repointed = await page.evaluate(async (id: string) => {
        type Bridge = { getState?: () => Promise<{ projects: { id: string; docLocationPath: string | null }[] }> }
        const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
        const state = await bridge?.getState?.() ?? null
        return state?.projects.find(row => row.id === id)?.docLocationPath ?? null
      }, registeredB?.id ?? '')
      expect(repointed).toBe(externalDocs2.replaceAll('\\', '/'))

      // 快照重建:任务数与 feature slug 换成 docs2 的(setB2)。The features
      // TAB entry is itself the machine's slug-clearing transition (5.16),
      // so the rebuilt LIST is the correct landing — B1's slugs gone, B2's in.
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setB2.facts.taskCount, 60_000)
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureB2.slug}"]`)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureB1.slug}"]`)).toHaveCount(0)
      await page.locator(`[data-dsh-forge-feature-card="${featureB2.slug}"]`).click()
      const detailB2 = page.locator(`[data-dsh-forge-feature-detail="${featureB2.slug}"]`)
      await expect(detailB2).toBeVisible({ timeout: 15_000 })
      await expect(detailB2.locator('[data-dsh-forge-badge="external-docs"]')).toBeVisible()
      await expect.poll(async () => normalize(
        await detailB2.locator('[data-dsh-forge-feature-doc-panel="manifest"]').innerText({ timeout: 30_000 }),
      ), { timeout: 30_000 }).toBe(manifestProjection(externalDocs2, featureB2.slug))

      // ======================================================================
      // SC5-2 · 切换:B 上留选中/过滤态,切 A 后数据重建 + 态重置干净。
      // ======================================================================
      // 选中态:开一个任务 dock;过滤态:搜索唯一任务(计数 1/total)。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      const anyB2Task = setB2.features[0]?.tasks[0] as NonNullable<typeof setB2.features[0]['tasks'][number]>
      await page.locator(`[data-dsh-forge-node-card="${featureB2.slug}/${anyB2Task.localId}"]`).click()
      await expect(page.locator(`[data-dsh-forge-task-detail="${featureB2.slug}/${anyB2Task.localId}"]`)).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-dsh-forge-tasks-search]').fill(needle)
      await expect(page.locator('[data-dsh-forge-tasks-count]'))
        .toContainText(new RegExp(`1\\s*(?:of|\\/)\\s*${String(setB2.facts.taskCount)}`), { timeout: 15_000 })
      // feature 选中态:详情子视图开着(上面已开,回列表再开一次以留痕)。
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureB2.slug}"]`)).toBeVisible()
      await page.locator(`[data-dsh-forge-feature-card="${featureB2.slug}"]`).click()
      await expect(detailB2).toBeVisible({ timeout: 15_000 })

      // 切换(chrome switcher 的真实数据路径)。The trigger carries the active
      // name immediately (the chrome is tab-independent).
      await page.locator('[data-dsh-forge-switcher-trigger]').click()
      await page.locator('[data-dsh-forge-switcher-menu] [data-dsh-forge-switcher-item]', { hasText: nameA }).click()
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).toContainText(nameA, { timeout: 10_000 })

      // 三页数据为新项目:A 的任务全集(节点数),旧 dock 关、过滤清。
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await waitForTreeNodes(page, setA.facts.taskCount, 60_000)
      await expect(page.locator('[data-dsh-forge-task-detail]'), 'the cross-project dock selection retired').toHaveCount(0)
      await expect(page.locator('[data-dsh-forge-tasks-count]'))
        .toContainText(new RegExp(`${String(setA.facts.taskCount)}\\s*(?:of|\\/)\\s*${String(setA.facts.taskCount)}`), { timeout: 15_000 })
      await expect(page.locator('[data-dsh-forge-badge="session-live"]'), 'no cross-project live-link badge').toHaveCount(0)
      // feature 页:A 的列表(非 not-found 残留),B 的卡片不在。
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureA1.slug}"]`)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-dsh-forge-feature-notfound]'), 'the stale feature-detail selection cleared').toHaveCount(0)
      await expect(page.locator(`[data-dsh-forge-feature-card="${featureB2.slug}"]`)).toHaveCount(0)

      // ======================================================================
      // SC5-3 · 移除:哈希对拍(项目目录 + 仓外 doc 目录)零变更;列表消失;
      // 移除 ACTIVE 项目 → 指针清空 → 引导卡(真实动词行为)。
      // ======================================================================
      const hashA = hashTree(projectA.codeRoot)
      const hashBCode = hashTree(projectB.codeRoot)
      const hashBDocs = hashTree(externalDocs2)

      // 移除非激活的 B(仓外):卡片消失 + 双树原样。
      await page.getByRole('tab', { name: /^概览$|^Overview$/ }).click()
      await cardOf(page, nameB).locator('[data-dsh-forge-card-action="remove"]').click()
      await page.locator('[data-dsh-forge-remove-confirm]').click()
      await expect(cardOf(page, nameB)).toHaveCount(0, { timeout: 10_000 })
      assertTreesIdentical('B codeRoot across remove', hashBCode, hashTree(projectB.codeRoot))
      assertTreesIdentical('B external doc dir across remove', hashBDocs, hashTree(externalDocs2))

      // 移除 ACTIVE 的 A:指针清空(非迁移)→ 项目域页呈现引导卡;目录原样。
      await cardOf(page, nameA).locator('[data-dsh-forge-card-action="remove"]').click()
      await page.locator('[data-dsh-forge-remove-confirm]').click()
      await expect(cardOf(page, nameA)).toHaveCount(0, { timeout: 10_000 })
      await expect(page.locator('[data-dsh-forge-switcher-trigger]')).not.toContainText(nameA, { timeout: 10_000 })
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-gate]'), 'pointer cleared → the state-gate guidance card').toBeVisible({ timeout: 15_000 })
      await page.getByRole('tab', { name: /^Feature$|^Features$/ }).click()
      await expect(page.locator('[data-dsh-forge-gate]'), 'the features tab gates the same way').toBeVisible({ timeout: 15_000 })
      assertTreesIdentical('A codeRoot across remove', hashA, hashTree(projectA.codeRoot))

      // 注册表终态:journey 隔离 DB,两行皆清。
      const finalProjects = await page.evaluate(async () => {
        type Bridge = { getState?: () => Promise<{ projects: unknown[] }> }
        const bridge = (globalThis as { dshForge?: { workbench?: Bridge } }).dshForge?.workbench
        return await bridge?.getState?.() ?? null
      })
      expect(finalProjects?.projects.length).toBe(0)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    // Journey cleanup (6.1 Hard Rule: 测试后清理 — fixtures + stubs + userData).
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
