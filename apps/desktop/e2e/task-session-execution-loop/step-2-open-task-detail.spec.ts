// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-2-open-task-detail.md
//
// Step 2「打开任务详情」两 Outcome:
//
//   success —— 点开一个「可执行状态」任务(契约的「可执行状态」非 7 态词表
//   字段;本腿解释 = status ∈ {pending, in_progress},契约 eval 已将其记为
//   non-vocabulary 约束)且带上游依赖、带执行记录的节点:详情侧板展开,
//   描述按 forge 任务文件原文只读渲染(测试进程直读 <stem>.md 对拍)、依赖
//   链 = 上游 blocker 传递链拓扑序(ipc/services buildDepChain 镜像,FT-055)、
//   执行记录 at/kind/来源/摘要 与记录 .md frontmatter 逐项一致(FT-045
//   path ① 的 actor 透传);不呈现 worktree 标识;详情面板零任务写操作入口。
//
//   worktree-trace-visible —— 方言注记(代码现实,Hard Rule 不虚构):契约
//   该腿要求「真实 git worktree + 执行痕迹写入 + 非空执行分支名」的 fixture,
//   但 parse-task.ts 对每个任务硬编码 branch = null / worktree = false(任务
//   文件不携带这些字段,缺失即空,不推断),索引器完全无视 git —— 今天不
//   存在任何 fixture 通道能产出 worktree = true 或非空 branch(不建 git
//   worktree fixture)。本腿按 code-faithful 形态断言:视图 A 卡片与全 DOM
//   零 worktree 徽标(不虚构)、列表视图分支列/worktree 列恒空占位「—」、
//   桥面 summary.branch === null && summary.worktree === false(FT-032
//   「worktree 布尔、branch 可空执行分支」的如实投影:未写即空)。契约的
//   「真实 git worktree 执行痕迹」腿在当前方言下不可达,记为任务注记。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { cleanupViewKey, closeAndAwaitExit, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  disposeJourney, expectedDepChain, groundOf, pickTaskKey, readBoard, readTaskDetail, setUpJourney,
} from './helpers.ts'

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-2/success [@web-e2e @journey task-session-execution-loop]: detail dock renders forge verbatim description, topological dep chain, records + no write affordance', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setup = setUpJourney()
  const { set, project, session } = setup
  const { byKey } = groundOf(set)
  // 「可执行状态」= status ∈ {pending, in_progress}(非词表字段,头注口径);
  // 且带上游依赖(依赖链可断言)且带执行记录(记录区可断言)。
  const KEY = pickTaskKey(set,
    task => (task.status === 'pending' || task.status === 'in_progress') && task.dependencies.length > 0 && task.record !== null,
    '可执行 + 带依赖 + 带记录')
  const subject = byKey.get(KEY)
  if (subject === undefined) throw new Error(`ground model lost ${KEY}`)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      await page.locator(`[data-dsh-forge-node-card="${KEY}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${KEY}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator('[data-dsh-forge-detail-section="description"]')).toBeVisible({ timeout: 15_000 })

      const dockData = await page.evaluate((taskKey: string) => {
        const root = document.querySelector(`[data-dsh-forge-task-detail="${taskKey}"]`)
        if (root === null) return null
        return {
          depKeys: Array.from(root.querySelectorAll('[data-dsh-forge-detail-dep]'))
            .map(item => item.getAttribute('data-dsh-forge-detail-dep') ?? ''),
          descriptionText: root.querySelector('[data-dsh-forge-detail-section="description"]')?.textContent ?? '',
          recordsText: root.querySelector('[data-dsh-forge-detail-section="records"]')?.textContent ?? '',
          recordTimes: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] time'))
            .map(time => time.getAttribute('dateTime') ?? ''),
          recordBadges: Array.from(root.querySelectorAll('[data-dsh-forge-detail-record] [data-dsh-forge-badge]'))
            .map(badge => badge.getAttribute('data-dsh-forge-badge') ?? ''),
          worktreeBadges: root.querySelectorAll('[data-dsh-forge-badge="worktree"]').length,
          buttonLabels: Array.from(root.querySelectorAll('button'))
            .map(button => `${button.getAttribute('aria-label') ?? ''}|${button.getAttribute('title') ?? ''}|${(button.textContent ?? '').trim()}`),
        }
      }, KEY)
      expect(dockData, `dock content for ${KEY}`).not.toBeNull()
      const detail = dockData as NonNullable<typeof dockData>

      // 描述:任务文件原文的只读渲染(测试进程直读 <stem>.md 对拍)。
      const featureIndex = project.indexPaths.find(row => row.slug === subject.feature)
      if (featureIndex === undefined) throw new Error(`no index.json recorded for ${subject.feature}`)
      const featureOfSubject = set.features.find(feature => feature.slug === subject.feature)
      const modelTask = featureOfSubject?.tasks.find(task => task.localId === subject.localId)
      if (modelTask === undefined) throw new Error(`model lost ${KEY}`)
      const descriptionFile = join(dirname(featureIndex.path), `${modelTask.stem}.md`)
      const fileBody = readFileSync(descriptionFile, 'utf8')
      const bodyLine = `Fixture task body for ${subject.feature}/${subject.localId} (status: ${subject.status}, type: ${subject.type}).`
      expect(fileBody, `oracle file carries the body line (${descriptionFile})`).toContain(bodyLine)
      expect(detail.descriptionText, `描述按 forge 原文渲染 for ${KEY}`).toContain(bodyLine)
      expect(detail.descriptionText, `blockers 行原文 for ${KEY}`).toContain(`Blockers: ${subject.dependencies.join(', ')}.`)

      // 依赖链:上游 blocker 传递链,拓扑序(buildDepChain 镜像,FT-055)。
      const expectedChain = expectedDepChain(byKey, KEY)
      expect(detail.depKeys, `depChain for ${KEY} (walk: ${expectedChain.join(' → ')})`).toEqual(expectedChain)

      // 执行记录:at/kind/来源/摘要 与记录 .md 逐项一致(FT-055:无虚构字段)。
      const record = subject.record
      if (record === null) throw new Error(`${KEY} was picked with a record`)
      expect(detail.recordTimes, `记录时间戳 verbatim for ${KEY}`).toEqual([record.completed])
      expect(detail.recordsText, `记录摘要 verbatim for ${KEY}`).toContain(record.summary)
      expect(detail.recordsText, `记录 kind = 任务 type for ${KEY}`).toContain(subject.type)
      expect(detail.recordBadges, `记录来源徽标(actor ${String(record.actor)})`).toEqual(['source:session'])

      // 不呈现 worktree 标识(该任务无 worktree 执行痕迹 —— 方言恒 false)。
      expect(detail.worktreeBadges, 'dock carries no worktree badge').toBe(0)

      // 详情面板零任务写操作入口(Journey Invariant;数据面白名单在 step-1)。
      const writeAffordances = detail.buttonLabels.filter(label =>
        /认领|提交|重开|claim|submit|reopen|transition|addtask/i.test(label))
      expect(writeAffordances, `dock buttons carry no task-write affordance (got: ${JSON.stringify(detail.buttonLabels)})`).toEqual([])

      // 桥面投影:branch/worktree 如实为空(FT-032)。
      const bridgeDetail = await readTaskDetail(page, projectId, KEY)
      expect(bridgeDetail.summary.branch).toBeNull()
      expect(bridgeDetail.summary.worktree).toBe(false)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})

test.fixme('step-2/worktree-trace-visible [@web-e2e @journey task-session-execution-loop]: code-faithful form — no worktree badge fabricated, branch column renders the empty placeholder (dialect: branch 恒 null / worktree 恒 false)', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  const setup = setUpJourney()
  const { set, project, session } = setup
  const { ground } = groundOf(set)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // 桥面:每个任务 branch = null / worktree = false(方言如实投影)。
      const boardRows = await readBoard(page, projectId)
      expect(boardRows.tasks.length).toBe(set.facts.taskCount)
      const fabricated = boardRows.tasks.filter(row => row.branch !== null || row.worktree !== false)
      expect(fabricated, '方言恒 null/false —— 任何 branch/worktree 值都是虚构').toEqual([])

      // 深读一口(getTaskDetail 的 summary 投影同口径)。
      const sample = ground.find(task => task.dependencies.length > 0)
      if (sample === undefined) throw new Error('fixture carries no task with dependencies')
      const sampleDetail = await readTaskDetail(page, projectId, sample.key)
      expect(sampleDetail.summary.branch).toBeNull()
      expect(sampleDetail.summary.worktree).toBe(false)

      // 视图 A 卡片:零 worktree 徽标(全 DOM 口径 —— 不存在就不打标)。
      expect(await page.locator('[data-dsh-forge-badge="worktree"]').count(), 'no worktree badge anywhere on the board').toBe(0)

      // 列表视图:分支列与 worktree 列恒空占位「—」(FT-032:可空,不虚构)。
      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map(row => ({
        key: row.getAttribute('data-dsh-forge-task-row') ?? '',
        branch: row.children[4]?.textContent ?? '',
        worktree: row.children[5]?.textContent ?? '',
      })))
      expect(rows.length).toBe(set.facts.taskCount)
      const nonPlaceholder = rows.filter(row => row.branch !== '—' || row.worktree !== '—')
      expect(nonPlaceholder, `分支/worktree 列恒「—」空占位(diff samples: ${JSON.stringify(nonPlaceholder.slice(0, 4))})`).toEqual([])

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    disposeJourney(setup)
  }
})
