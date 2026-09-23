// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-1..step-5
//
// Journey smoke(happy path 全程串联,success Outcomes 依序执行,步间传递
// 状态:任务键;每步后断言其 Output 与 Journey Invariants):
//
//   Step 1 打开看板 —— 依赖树节点全集 + 悬空标记 + 状态与 forge 文件直读
//           全等 + sync idle。
//   Step 2 切换视图 —— 状态分组 7 态列(计数和 = 全集)→ 列表视图分支列
//           恒空占位「—」(方言:branch 恒 null / worktree 恒 false)。
//   Step 3 筛选 —— feature 筛选集合等价 + 计数随筛选更新 + 恢复全量。
//   Step 4 worktree 标识(code-faithful)—— 三视图零 worktree 徽标、开关
//           初始未按下。
//   Step 5 打开详情 —— 描述原文/依赖链/执行记录可读,挂接历史区空态。
//
// Journey Invariants:人侧只读(FT-030 白名单对拍,零任务写动词);只读浏览
// 零 forge 数据变更(codeRoot 树 md5 前后全等 —— 不写入注册表/挂接索引等
// 工作台自有事实数据,视图态本地记忆除外)。
import { expect, test } from '@playwright/test'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import { hashTree } from '../helpers/plugins.ts'
import {
  BOARD_SEED, assertReadonlyBridgeFace, diffSamples, disposeBoardJourney,
  expectedDepChain, groundOf, pickTaskKey, readBoard, readForgeIndexTruth,
  setUpBoardJourney,
} from './helpers.ts'

test('task-board-browsing journey smoke [@web-e2e @journey task-board-browsing]: board → views → filter → worktree (code-faithful) → detail, read-only throughout', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  expect(set.facts.taskCount).toBe(12)
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const { ground, byKey, danglingKeys } = groundOf(set)
  const DETAIL_KEY = pickTaskKey(set,
    task => task.record !== null && task.record.actor.startsWith('session:') && task.dependencies.length > 0,
    '会话来源记录任务(详情对象)')
  const detailSubject = byKey.get(DETAIL_KEY)
  if (detailSubject === undefined) throw new Error(`ground model lost ${DETAIL_KEY}`)
  // 只读浏览不变量的基线(stub 的 attachProject 已落盘后取)。
  const forgeTreeBaseline = hashTree(project.codeRoot)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)

      // ---- Step 1:打开任务看板(依赖树视图)-------------------------------
      await openTasksBoard(page, set.facts.taskCount)
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '依赖树节点全集').toBe(set.facts.taskCount)
      const board = await readBoard(page, projectId)
      expect(board.sync.state, 'sync idle(FT-056)').toBe('idle')
      const truth = readForgeIndexTruth(project)
      const statusMismatches = board.tasks
        .filter(task => task.status !== truth.get(task.key)?.status)
        .map(task => `${task.key}: ${task.status} != ${String(truth.get(task.key)?.status)}`)
      expect(statusMismatches, 'Step 1:状态与 forge 文件直读全等').toEqual([])
      const danglingCards = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-node-card] [data-dsh-forge-badge="dangling"]'))
        .map(badge => badge.closest('[data-dsh-forge-node-card]')?.getAttribute('data-dsh-forge-node-card') ?? ''))
      expect(diffSamples([...danglingKeys], danglingCards), 'Step 1:悬空标记集 = 模型悬空键集').toEqual([])
      await assertReadonlyBridgeFace(page)

      // ---- Step 2:切换状态分组/列表视图 -----------------------------------
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      const columns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-status-column]')).map(column => ({
        status: column.getAttribute('data-dsh-forge-status-column') ?? '',
        count: Number(column.querySelector('[data-dsh-forge-status-count]')?.textContent ?? '0'),
      })))
      expect(columns.map(column => column.status), 'Step 2:7 态分组词表(canonical 序)').toEqual([...TASK_STATUSES])
      expect(columns.reduce((sum, column) => sum + column.count, 0), '分组计数和 = 任务全集').toBe(set.facts.taskCount)
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const branchCells = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]'))
        .map(row => `${row.children[4]?.textContent ?? ''}/${row.children[5]?.textContent ?? ''}`))
      expect(branchCells.filter(cell => cell !== '—/—'), 'Step 2:分支/worktree 列恒空占位(FT-032)').toEqual([])

      // ---- Step 3:筛选与排序 ----------------------------------------------
      const firstFeature = ground[0]?.feature
      if (firstFeature === undefined) throw new Error('empty fixture')
      await page.locator('[data-dsh-forge-menu-trigger="feature"]').click()
      await page.getByRole('menuitemradio', { name: firstFeature }).click()
      await page.keyboard.press('Escape')
      const featureRows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]'))
        .map(row => row.getAttribute('data-dsh-forge-task-row') ?? ''))
      const expectedFeatureKeys = ground.filter(task => task.feature === firstFeature).map(task => task.key)
      expect(diffSamples(expectedFeatureKeys, featureRows), 'Step 3:feature 筛选集合等价').toEqual([])
      const countText = await page.locator('[data-dsh-forge-tasks-count]').textContent()
      expect(countText, 'Step 3:计数随筛选更新').toContain(`${String(expectedFeatureKeys.length)}/${String(set.facts.taskCount)}`)
      await page.locator('[data-dsh-forge-menu-trigger="feature"]').click()
      await page.getByRole('menuitemradio', { name: /^全部 feature$|^All features$/ }).click()
      await page.keyboard.press('Escape')
      expect(await page.locator('[data-dsh-forge-task-row]').count(), 'Step 3:恢复全量').toBe(set.facts.taskCount)

      // ---- Step 4:查看 worktree 标识(code-faithful,方言恒 false)------
      await page.locator('[data-dsh-forge-board-view="tree"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="tree"]')).toBeVisible({ timeout: 30_000 })
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), 'Step 4:三视图零 worktree 徽标(不虚构)').toBe(0)
      await expect(page.locator('[data-dsh-forge-tasks-worktree]'), 'Step 4:worktree 开关初始未按下').toHaveAttribute('aria-pressed', 'false')

      // ---- Step 5:打开任务详情 --------------------------------------------
      await page.locator(`[data-dsh-forge-node-card="${DETAIL_KEY}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${DETAIL_KEY}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })
      const dockData = await page.evaluate((key: string) => {
        const root = document.querySelector(`[data-dsh-forge-task-detail="${key}"]`)
        return {
          descriptionText: root?.querySelector('[data-dsh-forge-detail-section="description"]')?.textContent ?? '',
          depKeys: Array.from(root?.querySelectorAll('[data-dsh-forge-detail-dep]') ?? [])
            .map(item => item.getAttribute('data-dsh-forge-detail-dep') ?? ''),
          recordBadges: Array.from(root?.querySelectorAll('[data-dsh-forge-detail-record] [data-dsh-forge-badge]') ?? [])
            .map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
          linksEmptyHint: root?.querySelector('[data-dsh-forge-detail-links-empty]') !== null,
        }
      }, DETAIL_KEY)
      expect(dockData.descriptionText, 'Step 5:描述按 forge 原文渲染').toContain(`Fixture task body for ${DETAIL_KEY} `)
      expect(dockData.depKeys, 'Step 5:依赖链拓扑序(buildDepChain 镜像)').toEqual(expectedDepChain(byKey, DETAIL_KEY))
      expect(dockData.recordBadges, 'Step 5:执行记录来源徽标与会话来源一致').toEqual(['source:session'])
      expect(dockData.linksEmptyHint, 'Step 5:挂接历史区空态(FT-052)').toBe(true)

      // ---- Journey Invariant:只读浏览零 forge 数据变更 ---------------------
      expect(hashTree(project.codeRoot), 'codeRoot 树 md5 前后全等(零 forge 写入)').toBe(forgeTreeBaseline)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})
