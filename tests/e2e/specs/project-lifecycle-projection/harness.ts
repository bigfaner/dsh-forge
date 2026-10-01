// tests/e2e/specs/project-lifecycle-projection/harness — the journey's worlds
// and the C8 生命周期 dialect (T-test-gen-scripts, contract-derived).
//
// Traceability: docs/features/dsh-forge-m4/testing/project-lifecycle-
// projection/contracts/step-{1..5}-*.md. Worlds:
//   main    — 承载项目 A `lc-carrier`(会话 + 任务语料)+ 其余项目 B
//             `lc-other`(布局隔离断言的存活项目);两项目均 pre-boot 注册,
//             A 另 seed REAL 会话(cwd = A anchor);
//   variant — archiveOther 型:A pre-boot 归档(archived-delete-branch 支路)。
// Techniques: sc3-sync ②③④(C8 ⋯ 菜单 + 归档/删除确认 Dialog)/ sc3-degrade
// ①(submitWorkspaceSnapshot 手改注入 + 静默门)/ sc4(readLayoutBlob 布局面)。

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import {
  bootM4World, bridgeInvoke, clickMenuItem, freshRoot, m4Env, openLifecycleMenu,
  type M4World, type M4WorldManager,
} from '../_lib/m4-world.ts'
import { buildKernelWorld, handBuiltTaskSet, type KernelWorld, type TaskSpec } from '../_lib/journey-world.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'

/** 承载项目 A 语料(改名/归档/删除的对象)。 */
export const CARRIER = 'lc-carrier'
export const CARRIER_TASK = `${CARRIER}/1.1`
export const CARRIER_RENAMED = 'lc-carrier-改名后'
/** 其余项目 B 语料(布局隔离的存活项目)。 */
export const OTHER = 'lc-other'
export const OTHER_TASK = `${OTHER}/1.1`
/** A 的 REAL 派发会话语料(归组/退组断言锚点)。 */
export const SESS_A = 'lc-sess-carrier'

const CARRIER_TASKS: readonly TaskSpec[] = [
  { stem: '1.1', localId: '1.1', title: 'lc carrier task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
]

export interface LcJourneyRoot {
  readonly root: string
  readonly dshHome: string
  readonly kernel: KernelWorld
  readonly other: { readonly projectId: string, readonly codeRoot: string }
}

/**
 * Build the lifecycle journey root:carrier A + 其余项目 B —— 两树均为未注册
 * 语料(register:false:文件在盘、userData 空),由 `registerLcProjects` 经
 * 【真动词】post-boot 注册(sc3 纪律:注册 → hook → plan → relay → 实况,
 * pre-boot repo 写径不触投影链)。A 另 seed REAL 会话(cwd = A anchor)。
 */
export async function buildLcJourneyRoot(): Promise<LcJourneyRoot> {
  const root = freshRoot('m4-lc')
  const kernel = await buildKernelWorld(root, {
    feature: { slug: CARRIER, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-lc' },
    tasks: CARRIER_TASKS,
    register: false,
  })
  // 其余项目 B:未注册语料树(布局隔离 + 删除不牵连断言的存活面)。
  const setB = handBuiltTaskSet(
    { slug: OTHER, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-lc-b' },
    [{ stem: '1.1', localId: '1.1', title: 'lc other project task', status: 'pending', type: 'coding.feature', dependencies: [] }],
  )
  const writtenB = writeForgeProject(setB, { codeRoot: join(root, 'repo-b') })
  const other = { projectId: '', codeRoot: writtenB.codeRoot }
  const dshHome = join(root, 'dsh-home')
  mkdirSync(dshHome, { recursive: true })
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: SESS_A, cwd: kernel.codeRoot, createdAt: Date.now() - 60_000, title: 'LC 承载会话', turnStart: true }],
  })
  return { root, dshHome, kernel, other }
}

/**
 * Register A + B through the REAL verb chain post-boot(B 先 A 后 —— A 终态
 * 活跃)。Returns the resolved ids (mutating `built` in place: the corpus ids
 * travel with the root object for the spec's convenience).
 */
export async function registerLcProjects(built: LcJourneyRoot, page: import('@playwright/test').Page): Promise<{ carrierId: string, otherId: string }> {
  const { registerFixtureProject } = await import('../../../../apps/desktop/e2e/fixtures/forge-project.ts')
  const asWritten = (codeRoot: string, docsRoot: string): Parameters<typeof registerFixtureProject>[0] =>
    ({ codeRoot, docsRoot, indexPaths: [], manifestPaths: [], featuresDir: join(docsRoot, 'docs', 'features') })
  const otherId = await registerFixtureProject(page, asWritten(built.other.codeRoot, built.other.codeRoot))
  const carrierId = await registerFixtureProject(page, asWritten(built.kernel.codeRoot, built.kernel.docsRoot))
  // 显示名对齐旅程语料(registerFixtureProject 以路径尾段命名 —— "repo"/
  // "repo-b";经【真动词】rename 落 CARRIER/OTHER,概览标题面与断言语汇一致,
  // 亦不触后续 lifecycle 改名腿的前提)。
  await bridgeInvoke<unknown>(page, 'renameProject', [{ projectId: carrierId, displayName: CARRIER }])
  await bridgeInvoke<unknown>(page, 'renameProject', [{ projectId: otherId, displayName: OTHER }])
  ;(built.other as { projectId: string }).projectId = otherId
  ;(built.kernel as { projectId: string }).projectId = carrierId
  return { carrierId, otherId }
}

/** Boot the lifecycle world over the journey root (isolated DSH_HOME). */
export async function bootLcWorld(manager: M4WorldManager, tag: string, built: LcJourneyRoot, extraEnv: Record<string, string> = {}): Promise<M4World> {
  return await manager.acquire(async () => await bootM4World({
    tag, root: built.root, dshHome: built.dshHome, kernel: built.kernel,
    env: m4Env(built.dshHome, extraEnv),
  }))
}

// ---------------------------------------------------------------------------
// The C8 lifecycle GUI dialect(sc3-sync ②③④ 的用户径)
// ---------------------------------------------------------------------------

/** 经 ⋯ 菜单 + 确认 Dialog 执行归档(必答⑤ copy 断言随行)。 */
export async function archiveViaMenu(page: Page, projectId: string): Promise<void> {
  await openLifecycleMenu(page, projectId)
  await clickMenuItem(page, projectId, /归档项目/)
  const dialog = page.locator('[data-dsh-forge-dialog="project-archive-confirm"]')
  await expect(dialog, '归档确认 Dialog 在座').toBeVisible({ timeout: 5_000 })
  await expect(dialog.locator('[data-dsh-forge-project-promise]'),
    '必答⑤ copy:「workspace 保留,会话仍按项目分组」').toContainText('workspace 保留,会话仍按项目分组')
  await dialog.locator('[data-dsh-forge-project-archive-confirm]').click()
  await expect(dialog).toHaveCount(0, { timeout: 5_000 })
}

/** 经 ⋯ 菜单 + 确认 Dialog 执行删除(必答⑤ copy 断言随行)。 */
export async function removeViaMenu(page: Page, projectId: string): Promise<void> {
  await openLifecycleMenu(page, projectId)
  await clickMenuItem(page, projectId, /删除项目/)
  const dialog = page.locator('[data-dsh-forge-dialog="project-remove-confirm"]')
  await expect(dialog, '删除确认 Dialog 在座').toBeVisible({ timeout: 5_000 })
  await expect(dialog.locator('[data-dsh-forge-project-promise]'),
    '必答⑤ copy:「投影移除,会话退未分组(历史不删除)」').toContainText('投影移除,会话退未分组')
  await dialog.locator('[data-dsh-forge-project-remove-confirm]').click()
  await expect(dialog).toHaveCount(0, { timeout: 5_000 })
}

/** 经 ⋯ 菜单行内编辑改名(Enter 提交)。 */
export async function renameViaMenu(page: Page, projectId: string, nextName: string): Promise<void> {
  await openLifecycleMenu(page, projectId)
  await clickMenuItem(page, projectId, /重命名/)
  const input = page.locator(`[data-dsh-forge-tree-project-rename-input="${projectId}"]`)
  await expect(input, '行内编辑输入在座').toBeVisible({ timeout: 5_000 })
  await input.fill(nextName)
  await input.press('Enter')
}

/** 经归档行 ⋯ 菜单恢复(confirm-free;C1 语义)。 */
export async function restoreViaMenu(page: Page, projectId: string): Promise<void> {
  await openLifecycleMenu(page, projectId)
  await clickMenuItem(page, projectId, /恢复/)
}
