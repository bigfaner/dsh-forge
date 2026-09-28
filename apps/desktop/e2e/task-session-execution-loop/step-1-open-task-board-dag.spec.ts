// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-1-open-task-board-dag.md
//
// Step 1「打开任务看板浏览依赖树」Outcome success:
//   - 一次性 fixture 项目(临时目录 + 隔离 userData),12 任务/2 feature,
//     danglingRate 0.15 + recordRate 0.4 —— 链/菱形(生成器构造性保证:
//     1-3 个近期前置依赖 + 偶发长跳)/ 悬空依赖各至少一处(fixture 自检
//     expect 兜底);执行记录来源 会话/终端 各 ≥1(FT-045 判定序两路 ground truth)。
//   - 首屏 ≤2s 可交互(sc1 计量口径:t0 = 页内「任务」tab click 派发前一瞬
//     performance.now,t1 = 依赖树节点齐全后再过两帧 rAF;本旅程 Setup 实际
//     任务规模 ≪ 预算,单发计量 —— 500 任务性能腿属 SC1/task-board-browsing,
//     不在此复制)。
//   - 任务数/状态/依赖关系一致性:双通道对拍 —— ① 测试进程直读 fixture
//     forge 文件(tasks/index.json 权威读数);② stub CLI stdout(`forge task
//     status` TSV,测试进程直启;浏览器侧不自行观测 CLI 输出)。桥面
//     getTaskBoard 与两通道逐键全等;依赖 = TaskSummary.blockers ≡ index.json
//     dependencies(限定地址键方言,FT-032/FT-040)。
//   - 悬空依赖:卡片悬空徽标集 ≡ 模型悬空键集(悬空依赖不画边只打标 ——
//     数据面由 blockers 对拍承载,DOM 面只走 data-dsh-forge-* 钩子)。
//   - sync 状态 idle(FT-056);看板对人只读:FT-030 16 动词白名单对拍,
//     无任何任务写动词(Journey Invariant「看板不出现任务状态变更的写操作
//     入口」的数据面断言;DOM 面零写入口由后续 step 的交互断言承载)。
import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { registerFixtureProject } from '../fixtures/forge-project.ts'
import { switchToWorkbench, waitForTreeNodes, cleanupViewKey, closeAndAwaitExit } from '../tests/m2/helpers/restart-app.ts'
import {
  assertReadonlyBridgeFace, diffSamples, disposeJourney, groundOf, readBoard,
  readForgeIndexTruth, setUpJourney,
} from './helpers.ts'

/** Setup 实际任务规模的首屏预算(契约 Output:首屏 2 秒内可交互)。 */
const FIRST_INTERACTIVE_BUDGET_MS = 2_000

// [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
test.fixme('step-1/success [@web-e2e @journey task-session-execution-loop]: task board DAG vs forge files (dual channel) + first interactive ≤2s + read-only face', async ({ }, testInfo) => {
  testInfo.setTimeout(300_000)

  // --- fixture(seed 固定 ⇒ 同模型 ⇒ 同文件字节;自检兜底方言形状)----------
  const setup = setUpJourney()
  const { set, stub, project, session } = setup
  expect(set.facts.taskCount, 'fixture 任务数(≥10,契约 Preconditions)').toBe(12)
  expect(set.facts.dangling.length, '悬空依赖至少一处(链/菱形由生成器构造性保证)').toBeGreaterThan(0)
  expect(set.facts.recordsWithSessionActor, '会话来源执行记录 ≥1(FT-045 path ① ground truth)').toBeGreaterThan(0)
  expect(set.facts.recordsWithTerminalActor, '终端来源执行记录 ≥1').toBeGreaterThan(0)
  const { ground, byKey, danglingKeys } = groundOf(set)
  expect(ground.length).toBe(set.facts.taskCount)

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      expect(typeof projectId).toBe('string')

      // ---- 首屏 ≤2s(sc1 口径,单发:t0+click 同一 evaluate,零驱动延迟)--
      await switchToWorkbench(page)
      await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('[data-dsh-forge-shell] [role="tab"]'))
          .find((el) => { const text = (el.textContent ?? '').trim(); return text === '任务' || text === 'Tasks' })
        if (tab === undefined) throw new Error('tasks tab not found inside the workbench shell')
        (globalThis as { __tselT0?: number }).__tselT0 = performance.now()
        ;(tab as HTMLElement).click()
      })
      await waitForTreeNodes(page, set.facts.taskCount)
      const { t0, t1 } = await page.evaluate(() => new Promise<{ t0: number; t1: number }>((resolve) => {
        const g = globalThis as { __tselT0?: number }
        const started = g.__tselT0 ?? performance.now()
        const settle = (): void => resolve({ t0: started, t1: performance.now() })
        const frame = requestAnimationFrame(() => { requestAnimationFrame(settle) })
        setTimeout(() => { cancelAnimationFrame(frame); settle() }, 5_000)
      }))
      console.log(`[session-loop] step-1 first-interactive(ms)=${String(Math.round(t1 - t0))} budget=${String(FIRST_INTERACTIVE_BUDGET_MS)} (12 任务 Setup 口径,单发)`)
      expect(
        t1 - t0,
        `首屏可交互 ${String(Math.round(t1 - t0))}ms > ${String(FIRST_INTERACTIVE_BUDGET_MS)}ms(口径 = Setup 实际任务规模,不含 SC1 500 任务性能腿)`,
      ).toBeLessThanOrEqual(FIRST_INTERACTIVE_BUDGET_MS)

      // ---- 视图 A 节点全集 + 悬空标记(仅 data-dsh-forge-* 钩子)----------
      const tree = await page.evaluate(() => ({
        nodeKeys: Array.from(document.querySelectorAll('[data-dsh-forge-node-card]'))
          .map(card => card.getAttribute('data-dsh-forge-node-card') ?? ''),
        danglingCards: Array.from(document.querySelectorAll('[data-dsh-forge-node-card] [data-dsh-forge-badge="dangling"]'))
          .map(badge => badge.closest('[data-dsh-forge-node-card]')?.getAttribute('data-dsh-forge-node-card') ?? ''),
      }))
      expect(tree.nodeKeys.length, 'view A node count').toBe(set.facts.taskCount)
      expect(diffSamples([...byKey.keys()], tree.nodeKeys), 'view A node-key diff samples').toEqual([])
      expect(diffSamples([...danglingKeys], tree.danglingCards), 'view A dangling-mark diff samples').toEqual([])

      // ---- 通道 ①:测试进程直读 fixture forge 文件(权威读数)-------------
      const truth = readForgeIndexTruth(project)
      expect(truth.size).toBe(set.facts.taskCount)

      // ---- 通道 ②:stub CLI stdout(`forge task status` TSV)--------------
      const statusRun = spawnSync(stub.cliPath, ['task', 'status'], { cwd: project.codeRoot, encoding: 'utf8', windowsHide: true })
      expect(statusRun.status, `stub task status exit (stderr: ${String(statusRun.stderr)})`).toBe(0)
      const cliStatuses = new Map<string, string>()
      for (const line of statusRun.stdout.split('\n')) {
        if (line.trim() === '') continue
        const parts = line.split('\t')
        if (parts.length !== 2) throw new Error(`unparseable status row: ${JSON.stringify(line)}`)
        cliStatuses.set(parts[0] ?? '', parts[1] ?? '')
      }
      expect(cliStatuses.size, 'stub CLI 全量任务读回').toBe(set.facts.taskCount)

      // ---- 桥面 getTaskBoard vs 双通道逐键全等(状态 + 依赖 + 7 态词表)---
      const board = await readBoard(page, projectId)
      expect(board.sync.state, 'sync 状态 idle(FT-056,State 要求)').toBe('idle')
      expect(board.tasks.length, '任务数与 forge 输出一致').toBe(set.facts.taskCount)
      const boardByKey = new Map(board.tasks.map(task => [task.key, task] as const))
      expect(diffSamples([...byKey.keys()], [...boardByKey.keys()]), 'board key diff samples').toEqual([])
      const mismatches: string[] = []
      for (const task of ground) {
        const row = boardByKey.get(task.key)
        if (row === undefined) continue
        if (row.status !== task.status) mismatches.push(`${task.key}: board ${row.status} != model ${task.status}`)
        if (row.status !== truth.get(task.key)?.status) mismatches.push(`${task.key}: board != index.json ${String(truth.get(task.key)?.status)}`)
        if (cliStatuses.get(task.key) !== row.status) mismatches.push(`${task.key}: board != stub CLI ${String(cliStatuses.get(task.key))}`)
        if (JSON.stringify([...row.blockers]) !== JSON.stringify([...task.dependencies])) mismatches.push(`${task.key}: blockers != index.json dependencies`)
        if (row.worktree !== false || row.branch !== null) mismatches.push(`${task.key}: branch/worktree 虚构(方言恒 null/false,FT-032)`)
        if (mismatches.length >= 5) break
      }
      expect(mismatches, 'board vs (model | index.json | stub CLI stdout) diff samples').toEqual([])

      // ---- 看板对人只读(FT-030 白名单 + 零任务写动词)---------------------
      await assertReadonlyBridgeFace(page)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    // Journey cleanup(6.1 Hard Rule: 测试后清理)。
    disposeJourney(setup)
  }
})
