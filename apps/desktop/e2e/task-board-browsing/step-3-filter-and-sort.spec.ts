// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-3-filter-and-sort.md
//
// Step 3「筛选与排序」两 Outcome(fixture = 手建 typed 模型:alpha 全 pending
// feature × beta 多状态混合 feature,会话/终端来源记录各一 —— 筛选维度覆盖
// 多 feature/多状态;sc4 手建先例):
//
//   success —— 筛选器族逐维断言(集合等价口径:匹配任务集成员与 forge 数据
//   —— 此处为模型/文件同源 —— 逐一对应;排序键未定约,仅断言排序切换不改
//   变任务集合):
//     · feature 筛选(feature ▾ menuitemradio)→ 可见键集 = 模型派生子集;
//     · 状态筛选(status ▾ menuitemcheckbox,双语标签):单笔「取消勾选」=
//       补集语义(客户端 toggleStatus:全选态首击 = 其余六态)+ 精选
//       completed(逐项收敛到 {completed})两种驱动面;
//     · worktree 筛选(toggle,aria-pressed)—— 方言注记:parse-task 恒
//       worktree = false(Hard Rule 不虚构),契约的 worktree true/false 并
//       存不可达;code-faithful 形态 = 开启即空集(no-match 空态)—— 断言
//       之,并确认关闭后恢复全量;
//     · 计数随筛选更新([data-dsh-forge-tasks-count] = "{visible}/{total}");
//     · 排序切换(状态/更新时间)不改任务集合。
//
//   no-match-empty —— 契约配方(真 feature × 该 feature 任务集中不存在的状
//   态):alpha(全 pending)× 状态精选 completed → 明确空态
//   ([data-dsh-forge-task-board-nomatch],非错误);「清除筛选」→ 视图恢复
//   (全量任务重现)。
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import type { GeneratedTaskStatus } from '../fixtures/task-generator.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  countTexts, diffSamples, disposeBoardJourney, expectedKeysOf, filterTaskSetFixture,
  groundOf, labelsOf, setUpBoardJourney,
} from './helpers.ts'
import type { GroundTask } from './helpers.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

/** The hand fixture's feature slugs (the feature ▾ options). */
const ALPHA = 'fixture-filter-alpha'

/** Escape a literal for embedding into a RegExp(双语标签对拍)。 */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Either-locale name matcher for a menu row. */
function eitherLocale(zhText: string, enText: string): RegExp {
  return new RegExp(`^${escapeRegExp(zhText)}$|^${escapeRegExp(enText)}$`)
}

/** 当前列表视图的可见键集合(集合等价断言的读面)。 */
async function visibleRowKeys(page: Page): Promise<string[]> {
  return await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]'))
    .map(row => row.getAttribute('data-dsh-forge-task-row') ?? ''))
}

/** 断言计数文案(visible/total 双语形态任一)。 */
async function expectCountText(page: Page, visible: number, total: number, what: string): Promise<void> {
  const countText = await page.locator('[data-dsh-forge-tasks-count]').textContent()
  expect(countTexts(visible, total), `${what}: 计数随筛选更新(got ${String(countText)})`).toContain(countText)
}

/** 断言可见键集合与模型派生子集相等 + 计数文案。 */
async function expectVisibleSet(
  page: Page,
  ground: readonly GroundTask[],
  filter: Parameters<typeof expectedKeysOf>[1],
  what: string,
): Promise<void> {
  const expected = expectedKeysOf(ground, filter)
  const visible = await visibleRowKeys(page)
  expect(diffSamples([...expected], visible), `${what}: 可见集合 = 模型派生子集`).toEqual([])
  expect(visible.length, `${what}: 行数 = ${String(expected.size)}`).toBe(expected.size)
  await expectCountText(page, expected.size, ground.length, what)
}

/**
 * 状态精选(客户端 toggleStatus 语义驱动):全选态起,逐项取消非目标态,
 * 收敛到恰好 {target};菜单保持打开(item 点击不关菜单),末位断言目标项
 * aria-checked 后 Esc 关闭。
 */
async function selectOnlyStatus(page: Page, target: GeneratedTaskStatus): Promise<void> {
  await page.locator('[data-dsh-forge-menu-trigger="status"]').click()
  for (const other of TASK_STATUSES) {
    if (other === target) continue
    const labels = labelsOf.get(other) ?? []
    const name = new RegExp(`^${labels.map(escapeRegExp).join('$|^')}$`)
    await page.getByRole('menuitemcheckbox', { name }).click()
  }
  const targetLabels = labelsOf.get(target) ?? []
  const targetItem = page.getByRole('menuitemcheckbox', { name: new RegExp(`^${targetLabels.map(escapeRegExp).join('$|^')}$`) })
  await expect(targetItem, `精选收敛到 {${target}}(目标项保持选中)`).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
}

// [M4 1.8 e2e 迁移·迁移清单 第②行] 2.10 已按新宿主恢复:入口 = 右栏任务看板 pane
// (openTasksBoard/openBoardPane:概览任务行 seam + registerFixtureProject 的列表推送位);断言本体零删改。
test('step-3/success [@web-e2e @journey task-board-browsing]: feature/status/worktree filters + count + sort switch keep set-equivalence vs the model', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = filterTaskSetFixture()
  expect(set.facts.taskCount).toBe(10)
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { ground } = groundOf(set)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      await expectVisibleSet(page, ground, {}, '无筛选基线')

      // ---- feature 筛选 ---------------------------------------------------
      await page.locator('[data-dsh-forge-menu-trigger="feature"]').click()
      await page.getByRole('menuitemradio', { name: ALPHA }).click()
      await page.keyboard.press('Escape')
      await expectVisibleSet(page, ground, { featureSlug: ALPHA }, `feature = ${ALPHA}`)
      // 恢复全部 feature(菜单 radio 的 featureAll 项)。
      await page.locator('[data-dsh-forge-menu-trigger="feature"]').click()
      await page.getByRole('menuitemradio', { name: eitherLocale(zh['tasks.filter.featureAll'], en['tasks.filter.featureAll']) }).click()
      await page.keyboard.press('Escape')
      await expectVisibleSet(page, ground, {}, 'feature 恢复全部')

      // ---- 状态筛选(补集语义单击 + 精选 completed 两面)-------------------
      await page.locator('[data-dsh-forge-menu-trigger="status"]').click()
      const pendingLabels = labelsOf.get('pending') ?? []
      await page.getByRole('menuitemcheckbox', { name: new RegExp(`^${pendingLabels.map(escapeRegExp).join('$|^')}$`) }).click()
      await page.keyboard.press('Escape')
      await expectVisibleSet(page, ground, {
        statuses: new Set(TASK_STATUSES.filter(status => status !== 'pending')),
      }, '状态筛选:取消 pending(其余六态)')
      // 重置为全选 — selectOnlyStatus 的「全选态起」前置(补集步已取消
      // pending,盲 toggle 会把 pending 重新勾上)。
      await page.locator('[data-dsh-forge-menu-trigger="status"]').click()
      await page.getByRole('menuitem', { name: eitherLocale(zh['tasks.filter.statusAll'], en['tasks.filter.statusAll']) }).click()
      await page.keyboard.press('Escape')
      await selectOnlyStatus(page, 'completed')
      await expectVisibleSet(page, ground, { statuses: new Set<GeneratedTaskStatus>(['completed']) }, '状态精选 = {completed}')
      // 重置状态(全部状态项)。
      await page.locator('[data-dsh-forge-menu-trigger="status"]').click()
      await page.getByRole('menuitem', { name: eitherLocale(zh['tasks.filter.statusAll'], en['tasks.filter.statusAll']) }).click()
      await page.keyboard.press('Escape')
      await expectVisibleSet(page, ground, {}, '状态恢复全部')

      // ---- worktree 筛选(方言:恒 false ⇒ 开启即空集;见头注)-----------
      const worktreeToggle = page.locator('[data-dsh-forge-tasks-worktree]')
      await expect(worktreeToggle).toHaveAttribute('aria-pressed', 'false')
      await worktreeToggle.click()
      await expect(worktreeToggle).toHaveAttribute('aria-pressed', 'true')
      expect(await visibleRowKeys(page), 'worktree-only 空集(方言恒 false 的 code-faithful 形态)').toEqual([])
      await expectCountText(page, 0, ground.length, 'worktree-only 计数')
      await worktreeToggle.click()
      await expect(worktreeToggle).toHaveAttribute('aria-pressed', 'false')
      await expectVisibleSet(page, ground, {}, 'worktree 筛选关闭恢复全量')

      // ---- 排序:切换不改集合(排序键未定约 —— 仅集合断言)---------------
      const beforeSort = (await visibleRowKeys(page)).slice().sort()
      await page.locator('[data-dsh-forge-menu-trigger="sort"]').click()
      await page.getByRole('menuitemradio', { name: eitherLocale(zh['tasks.sort.updatedAt'], en['tasks.sort.updatedAt']) }).click()
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      const afterSort = (await visibleRowKeys(page)).slice().sort()
      expect(afterSort, '排序切换不改变任务集合(仅序变)').toEqual(beforeSort)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

test('step-3/no-match-empty [@web-e2e @journey task-board-browsing]: all-pending feature × completed selection → explicit no-match card; clear filters restores the full set', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = filterTaskSetFixture()
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { ground } = groundOf(set)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })

      // 契约配方:真 feature(全 pending)× 该任务集中不存在的状态(completed)。
      await page.locator('[data-dsh-forge-menu-trigger="feature"]').click()
      await page.getByRole('menuitemradio', { name: ALPHA }).click()
      await page.keyboard.press('Escape')
      await expectVisibleSet(page, ground, { featureSlug: ALPHA }, 'feature = alpha(全 pending)')
      await selectOnlyStatus(page, 'completed')

      // 明确空态,非错误。
      const noMatch = page.locator('[data-dsh-forge-task-board-nomatch]')
      await expect(noMatch, '筛选组合无匹配 → 明确空态').toBeVisible({ timeout: 10_000 })
      await expect(
        noMatch,
        '空态标题(双语任一)',
      ).toContainText(new RegExp(`${escapeRegExp(zh['tasks.noMatch.title'])}|${escapeRegExp(en['tasks.noMatch.title'])}`))
      expect(await page.locator('[data-dsh-forge-task-board-error]').count(), '空态不是错误').toBe(0)
      expect(await visibleRowKeys(page), '零可见行').toEqual([])

      // 清除筛选 → 视图恢复(全量任务重现)。
      await page.locator('[data-dsh-forge-task-board-clear-filters]').click()
      await expect(noMatch).toHaveCount(0)
      await expectVisibleSet(page, ground, {}, '清除筛选后全量恢复')

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})
