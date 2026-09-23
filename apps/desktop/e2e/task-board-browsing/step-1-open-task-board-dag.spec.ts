// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-1-open-task-board-dag.md
//
// Step 1「打开任务看板(依赖树视图)」四 Outcome:
//
//   success —— sc1 式三视图/模型一致性(small-scale:本旅程 12 任务 fixture;
//   契约 state_requirements 的 500 任务/50 feature 首屏计时腿属 SC1 preset,
//   已由 sc1 e2e 落地,不在此复制):视图 A 节点全集 + 悬空徽标集、视图 B
//   7 态分组列(计数/卡片字段/来源徽标/悬空标记/零 worktree 虚构)、视图 C
//   列表行(标题/状态标签回映/feature/分支列空占位/来源/更新时间);状态集
//   与 双通道(测试进程直读 tasks/index.json + stub CLI `task status` TSV)
//   逐键全等;执行记录来源 会话/终端 各 ≥1(fixture 自检);sync idle(FT-056)。
//
//   read-error —— 方言注记:UF2「读取失败」error 态的看板错误卡片
//   ([data-dsh-forge-task-board-error])只在「首次 getTaskBoard 即拒绝」时出
//   现 —— 该通道无确定性 fixture 注入面(注册探测先行拒绝)。健康载入后注
//   入 index.json 损坏 ⇒ 感知链故障物化为 FT-056 sync-error 工具栏指示 +
//   静默重试,最后良好看板保留(tasks = null 的 feature 行不参与 diff,无结
//   构性删除,不展示残缺数据);修复文件 → 点击重试 → 看板恢复渲染且与
//   forge 文件直读全等。
//
//   empty-state —— 零任务 fixture(手建 typed 模型,Task 实体以缺席表达,
//   不虚构字段;sc4 先例):空态卡「无任务」引导(指向 forge 初始化),
//   不显示错误。
//
//   loading-state —— 就绪门控(UF2 States loading 行):在点击「任务」tab
//   之前武装页内 MutationObserver,记录骨架/error/empty 三态节点的出现次序;
//   数据就绪后回放断言 —— loading 期间先行显示骨架且不显示错误态或空态。
//   96 任务 fixture 加宽加载窗口(契约 min_count 10;窗口宽度供给)。
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { switchToWorkbench, waitForTreeNodes, cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  BOARD_LOADING_SEED, BOARD_SEED, diffSamples, disposeBoardJourney, emptyTaskSet,
  groundOf, labelsOf, readBoard, readForgeIndexTruth, readTerminalStatuses,
  setUpBoardJourney,
} from './helpers.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

test('step-1/success [@web-e2e @journey task-board-browsing]: default DAG + three-view/model consistency (12 tasks, dual oracle channel) + sync idle', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  expect(set.facts.taskCount, 'fixture 任务数(≥10,契约 Preconditions)').toBe(12)
  expect(set.facts.dangling.length, '悬空依赖 ≥1(链/菱形由生成器构造性保证)').toBeGreaterThan(0)
  expect(set.facts.recordsWithSessionActor, '会话来源记录 ≥1(契约 TaskRecord.source)').toBeGreaterThan(0)
  expect(set.facts.recordsWithTerminalActor, '终端来源记录 ≥1').toBeGreaterThan(0)
  const setup = setUpBoardJourney(set)
  const { stub, project, session } = setup
  const { ground, byKey, danglingKeys } = groundOf(set)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // ---- 视图 A(默认依赖树):节点全集 + 悬空标记 ------------------------
      expect(await page.locator('[data-dsh-forge-board-panel="tree"]').count(), '默认视图 = 依赖树').toBe(1)
      const tree = await page.evaluate(() => ({
        nodeKeys: Array.from(document.querySelectorAll('[data-dsh-forge-node-card]'))
          .map(card => card.getAttribute('data-dsh-forge-node-card') ?? ''),
        danglingCards: Array.from(document.querySelectorAll('[data-dsh-forge-node-card] [data-dsh-forge-badge="dangling"]'))
          .map(badge => badge.closest('[data-dsh-forge-node-card]')?.getAttribute('data-dsh-forge-node-card') ?? ''),
      }))
      expect(tree.nodeKeys.length, '节点数与 forge 输出一致').toBe(set.facts.taskCount)
      expect(diffSamples([...byKey.keys()], tree.nodeKeys), 'node-key diff samples').toEqual([])
      expect(diffSamples([...danglingKeys], tree.danglingCards), '悬空标记集 = 模型悬空键集').toEqual([])

      // ---- 视图 B(状态分组):7 态列 + 计数 + 卡片字段 ----------------------
      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      const columns = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-status-column]')).map(column => ({
        status: column.getAttribute('data-dsh-forge-status-column') ?? '',
        count: column.querySelector('[data-dsh-forge-status-count]')?.textContent ?? '',
        cards: Array.from(column.querySelectorAll('[data-dsh-forge-task-card]')).map(card => ({
          key: card.getAttribute('data-dsh-forge-task-card') ?? '',
          ariaLabel: card.getAttribute('aria-label') ?? '',
          badges: Array.from(card.querySelectorAll('[data-dsh-forge-badge]')).map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
        })),
      })))
      expect(columns.map(column => column.status), '7 态分组词表与 forge 状态一致(FT-033,canonical 序)').toEqual([...TASK_STATUSES])
      const bMismatches: string[] = []
      for (const column of columns) {
        const expectedTasks = ground.filter(task => task.status === column.status)
        if (column.count !== String(expectedTasks.length)) bMismatches.push(`column ${column.status}: count ${column.count} != ${String(expectedTasks.length)}`)
        if (column.cards.length !== expectedTasks.length) {
          bMismatches.push(`column ${column.status}: ${String(column.cards.length)} cards != ${String(expectedTasks.length)}`)
          continue
        }
        for (const card of column.cards) {
          const task = byKey.get(card.key)
          if (task === undefined) {
            bMismatches.push(`column ${column.status}: unknown card ${card.key}`)
            continue
          }
          if (card.ariaLabel !== `${task.key} · ${task.title}`) bMismatches.push(`card ${task.key}: aria-label mismatch`)
          if (!card.badges.includes(`source:${task.source}`)) bMismatches.push(`card ${task.key}: no ${task.source} source badge`)
          if (card.badges.includes('worktree')) bMismatches.push(`card ${task.key}: worktree badge fabricated`)
          if (task.dangling.length > 0 && !card.badges.includes('dangling')) bMismatches.push(`card ${task.key}: dangling mark missing`)
          if (task.dangling.length === 0 && card.badges.includes('dangling')) bMismatches.push(`card ${task.key}: dangling mark fabricated`)
          if (bMismatches.length >= 5) break
        }
        if (bMismatches.length >= 5) break
      }
      expect(bMismatches, 'view B field mismatches (samples)').toEqual([])

      // ---- 视图 C(列表):行字段 vs 模型 + forge 文件 -----------------------
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map(row => ({
        key: row.getAttribute('data-dsh-forge-task-row') ?? '',
        title: row.children[1]?.textContent ?? '',
        statusText: row.children[2]?.textContent ?? '',
        feature: row.children[3]?.textContent ?? '',
        branch: row.children[4]?.textContent ?? '',
        worktree: row.children[5]?.textContent ?? '',
        sourceBadge: row.querySelector('[data-dsh-forge-badge^="source:"]')?.getAttribute('data-dsh-forge-badge') ?? null,
        updatedAt: row.children[7]?.textContent ?? '',
      })))
      expect(rows.length, '列表行数 = 任务全集').toBe(set.facts.taskCount)
      const labelToStatus = new Map<string, string>()
      for (const status of TASK_STATUSES) {
        for (const label of labelsOf.get(status) ?? []) labelToStatus.set(label, status)
      }
      const rowByKey = new Map(rows.map(row => [row.key, row] as const))
      const cMismatches: string[] = []
      for (const task of ground) {
        const row = rowByKey.get(task.key)
        if (row === undefined) {
          cMismatches.push(`row ${task.key} missing`)
          if (cMismatches.length >= 5) break
          continue
        }
        const diffs = [
          row.title === task.title ? null : `title ${JSON.stringify(row.title)} != ${JSON.stringify(task.title)}`,
          labelToStatus.get(row.statusText.trim()) === task.status ? null : `status "${row.statusText}" != ${task.status}`,
          row.feature === task.feature ? null : `feature "${row.feature}" != ${task.feature}`,
          row.branch === '—' ? null : `branch "${row.branch}" != —(方言:恒 null,FT-032)`,
          row.worktree === '—' ? null : `worktree "${row.worktree}" != —(方言:恒 false)`,
          row.sourceBadge === `source:${task.source}` ? null : `source ${String(row.sourceBadge)} != ${task.source}`,
          row.updatedAt !== '' ? null : 'updatedAt empty',
        ].filter((diff): diff is string => diff !== null)
        if (diffs.length > 0) cMismatches.push(`${task.key}: ${diffs.join('; ')}`)
        if (cMismatches.length >= 5) break
      }
      expect(cMismatches, 'view C row-field mismatches (samples)').toEqual([])

      // ---- 双通道对拍:index.json 直读 + stub CLI stdout ------------------
      const truth = readForgeIndexTruth(project)
      const cliStatuses = readTerminalStatuses(stub, project.codeRoot)
      expect(truth.size).toBe(set.facts.taskCount)
      expect(cliStatuses.size).toBe(set.facts.taskCount)
      const board = await readBoard(page, projectId)
      expect(board.sync.state, 'sync idle(FT-056)').toBe('idle')
      const oracleMismatches: string[] = []
      for (const task of ground) {
        const row = board.tasks.find(candidate => candidate.key === task.key)
        if (row === undefined) continue
        if (row.status !== truth.get(task.key)?.status) oracleMismatches.push(`${task.key}: board != index.json`)
        if (row.status !== cliStatuses.get(task.key)) oracleMismatches.push(`${task.key}: board != stub CLI`)
        if (JSON.stringify([...row.blockers]) !== JSON.stringify([...task.dependencies])) oracleMismatches.push(`${task.key}: blockers != dependencies`)
        if (oracleMismatches.length >= 5) break
      }
      expect(oracleMismatches, 'board vs (index.json | stub CLI) diff samples').toEqual([])

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

test('step-1/read-error [@web-e2e @journey task-board-browsing]: corrupt index.json → FT-056 sync-error toolbar + last-good board, retry after restore converges to the files', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: BOARD_SEED, taskCount: 12, featureCount: 2, danglingRate: 0.15, recordRate: 0.4 })
  const setup = setUpBoardJourney(set)
  const { project, session } = setup
  const corrupted = project.indexPaths[0]
  if (corrupted === undefined) throw new Error('fixture carries no feature index.json')

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 注入读取失败(健康载入后):index.json 损坏 → 重扫解析失败 → sync error。
      const originalBytes = readFileSync(corrupted.path, 'utf8')
      writeFileSync(corrupted.path, '{"tasks": [CORRUPT — not json\n')
      await expect(
        page.locator('[data-dsh-forge-tasks-sync="error"]'),
        '错误(error)态可见 —— 本方言下物化为 FT-056 sync-error 工具栏(见头注)',
      ).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('[data-dsh-forge-tasks-sync-retry]'), '重试入口可见').toBeVisible()

      // 不崩溃、不展示残缺数据:应用仍响应(bridge 直答),last-good 保留。
      const duringError = await readBoard(page, projectId)
      expect(duringError.tasks.length, '最后良好看板保留(整体失败语义,无残缺快照)').toBe(set.facts.taskCount)
      expect(await page.locator('[data-dsh-forge-node-card]').count(), 'last-good 节点全集保留').toBe(set.facts.taskCount)

      // 排除读取障碍 → 点击重试 → 看板恢复渲染且与 forge 数据一致。
      writeFileSync(corrupted.path, originalBytes)
      const retry = page.locator('[data-dsh-forge-tasks-sync-retry]')
      if (await retry.isVisible().catch(() => false)) await retry.click({ force: true }).catch(() => {})
      await expect.poll(async () => (await readBoard(page, projectId)).sync.state, { timeout: 20_000 }).toBe('idle')
      const converged = await readBoard(page, projectId)
      expect(converged.tasks.length).toBe(set.facts.taskCount)
      const truth = readForgeIndexTruth(project)
      const mismatches = converged.tasks
        .filter(task => task.status !== truth.get(task.key)?.status)
        .map(task => `${task.key}: ${task.status} != ${String(truth.get(task.key)?.status)}`)
      expect(mismatches, '重试后看板与 forge 文件直读全等(diff samples)').toEqual([])
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '看板恢复渲染(12 节点)').toBe(set.facts.taskCount)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

test('step-1/empty-state [@web-e2e @journey task-board-browsing]: zero-task project renders the 无任务 empty card, never an error', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  // 零任务以 Task 实体缺席表达(手建 typed 模型 —— 生成器不接受 0;sc4 先例)。
  const setup = setUpBoardJourney(emptyTaskSet())
  const { set, project, session } = setup
  expect(set.facts.taskCount).toBe(0)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      // 零任务看板没有树面板 —— 手动导航(不走 openTasksBoard 的节点等待)。
      await switchToWorkbench(page)
      await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
      await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
      const emptyCard = page.locator('[data-dsh-forge-task-board-empty]')
      await expect(emptyCard, '空(empty)态卡可见').toBeVisible({ timeout: 15_000 })
      await expect(
        emptyCard,
        '「无任务」引导(指向 forge 初始化,双语任一)',
      ).toContainText(new RegExp(`${escapeRegExp(zh['tasks.empty.title'])}|${escapeRegExp(en['tasks.empty.title'])}`))
      await expect(emptyCard).toContainText(new RegExp(`${escapeRegExp(zh['tasks.empty.body'])}|${escapeRegExp(en['tasks.empty.body'])}`))
      expect(await page.locator('[data-dsh-forge-task-board-error]').count(), '不显示错误').toBe(0)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

test('step-1/loading-state [@web-e2e @journey task-board-browsing]: skeleton shows before ready and error/empty never appear during loading (armed observer, 96 tasks)', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)

  const set = generateTaskSet({ seed: BOARD_LOADING_SEED, taskCount: 96, featureCount: 8, danglingRate: 0.1, recordRate: 0.4 })
  expect(set.facts.taskCount).toBe(96)
  const setup = setUpBoardJourney(set)
  const { project, session } = setup

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      await registerFixtureProject(page, project)
      await switchToWorkbench(page)

      // 就绪门控:点击「任务」tab 之前武装 MutationObserver,记录三态节点
      // 的出现次序(skeleton add/remove、error add、empty add)—— 事后回放,
      // 无竞态。
      await page.evaluate(() => {
        const g = globalThis as { __boardTimeline?: Array<{ kind: string; op: string }> }
        g.__boardTimeline = []
        const classify = (element: Element): string | null => {
          if (element.hasAttribute('data-dsh-forge-task-board-skeleton')) return 'skeleton'
          if (element.hasAttribute('data-dsh-forge-task-board-error')) return 'error'
          if (element.hasAttribute('data-dsh-forge-task-board-empty')) return 'empty'
          return null
        }
        const push = (element: Element, op: string): void => {
          const direct = classify(element)
          if (direct !== null) g.__boardTimeline?.push({ kind: direct, op })
          for (const child of element.querySelectorAll('[data-dsh-forge-task-board-skeleton], [data-dsh-forge-task-board-error], [data-dsh-forge-task-board-empty]')) {
            const kind = classify(child)
            if (kind !== null) g.__boardTimeline?.push({ kind, op })
          }
        }
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof Element) push(node, 'add')
            }
            for (const node of record.removedNodes) {
              if (node instanceof Element) push(node, 'remove')
            }
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
      })
      // 点击「任务」tab(进入任务看板 —— loading 窗口开启)。
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('[data-dsh-forge-shell] [role="tab"]'))
          .find((el) => { const text = (el.textContent ?? '').trim(); return text === '任务' || text === 'Tasks' })
        if (tab === undefined) throw new Error('tasks tab not found inside the workbench shell')
        ;(tab as HTMLElement).click()
      })
      // 数据就绪:96 节点齐全 → 转入正常树视图。
      await waitForTreeNodes(page, set.facts.taskCount, 60_000)

      // 回放:骨架出现过;loading 窗口内零 error/empty;就绪后正常视图在列。
      const timeline = await page.evaluate(() => {
        const g = globalThis as { __boardTimeline?: Array<{ kind: string; op: string }> }
        return g.__boardTimeline ?? []
      })
      expect(
        timeline.filter(entry => entry.kind === 'skeleton' && entry.op === 'add').length,
        `先行显示 loading 态(骨架)— timeline ${JSON.stringify(timeline)}`,
      ).toBeGreaterThan(0)
      const loadingEnd = timeline.findIndex(entry => entry.kind === 'skeleton' && entry.op === 'remove')
      expect(loadingEnd, '骨架在数据就绪后移除(转入正常树视图)').toBeGreaterThan(-1)
      const duringLoading = timeline.slice(0, loadingEnd).filter(entry => entry.op === 'add' && (entry.kind === 'error' || entry.kind === 'empty'))
      expect(duringLoading, '未就绪期间不显示错误态或空态(UF2 States:loading 行)').toEqual([])
      expect(await page.locator('[data-dsh-forge-task-board-nomatch]').count(), '就绪后非空态').toBe(0)
      expect(await page.locator('[data-dsh-forge-node-card]').count(), '就绪后正常树视图(96 节点)').toBe(set.facts.taskCount)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeBoardJourney(setup)
  }
})

/** Escape a literal for embedding into a RegExp(双语标签对拍)。 */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
