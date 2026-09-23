// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-1-terminal-change-flowback.md
//
// Step 1 终端变更回流看板:
//   success —— 变更时看板未打开(进入时序):测试进程代终端改 fixture 任务
//     状态(index.json 直写,createFixtureMutator),感知链全链真实时钟 ≤5s
//     内数据面可见(status + source=terminal,FT-045 路径 2:无 actor 记录且
//     无 active 挂接),随后进入看板免手动刷新读到位 + 节点卡 [终端] 徽标;
//   board-open-change —— 看板已打开期间的到达变更(eval 残差:Task min_count
//     ≥2 才不空 —— fixture 12 任务,保留断言以未变更任务为证人):≤5s 可见、
//     节点数稳定、未变更节点 DOM 标记仍在(无整板重载);
//   perception-chain-error —— 感知链故障腿:健康加载后把某 feature 的
//     index.json 写成 INVALID JSON → 该 feature 解析失败(2.5 降级纪律:
//     tasks=null 保形,既有行不做结构性删除)+ sync_state error(FT-056)→
//     工具栏 sync-error + 错误原因可读(title 槽)+ last-good 看板保留(节点
//     数不变、无整板重载);恢复有效文件(内含故障窗内发生的终端状态变更)
//     → 点 [data-dsh-forge-tasks-sync-retry] → 收敛至恢复后状态。
//
// 判定输入钉零:隔离 userData + 全程零挂接写入(本文件不触挂接动词),
// 并以 getTaskDetail.links === [] 显式读数钉 SessionLink-0。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import type { GeneratedTaskSet } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import { createFixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import type { FixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import {
  REFLOW_BUDGET_MS, boardStatusOf, detailLinksOf, markTreeNode, measureReflow,
  pickTaskKey, treeNodeMarked, workbenchBundles,
} from './helpers.ts'

/** Step-1 fixture:12 任务双 feature、零记录零挂接(来源判定输入确定)。 */
function stepOneFixture(): { set: GeneratedTaskSet; root: string; project: WrittenForgeProject; stub: StubCli; mutator: FixtureMutator } {
  const set = generateTaskSet({ seed: 'dfc1', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfc1-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-dfc1') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator = createFixtureMutator(set, project)
  return { set, root, project, stub, mutator }
}

test('step-1/success [@web-e2e @journey dual-form-consistency]: terminal change flowbacks ≤5s with [终端] source (board entered after the change)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepOneFixture()
  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    env: { ...stub.env, DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]) },
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)

      // 变更前不进入任务看板(与 board-open-change 进入时序互斥)。
      const target = pickTaskKey(set, task => task.status !== 'completed')
      const next = mutator.nextStatusOf(target.key)
      const t0 = Date.now()
      mutator.mutateStatus(target.key, next)

      // 变更事实 = 测试进程直读 fixture 文件。
      const mutated = JSON.parse(readFileSync(
        project.indexPaths.find(row => row.slug === target.featureSlug)?.path ?? '', 'utf8',
      ) as { tasks: Record<string, { id: string; status: string }> })
      const mutatedStatus = Object.values(mutated.tasks).find(entry => entry.id === target.localId)?.status
      expect(mutatedStatus, '终端侧变更已落 fixture 文件(直读口径)').toBe(next)

      // 感知链全链(扫描→事件→快照)真实时钟 ≤5s:数据面可见新状态且来源=[终端]。
      await page.waitForFunction(async (input: { id: string; key: string; status: string }) => {
        const bridge = (globalThis as {
          dshForge?: {
            workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string; source: string | null }> }> }
          }
        }).dshForge?.workbench
        const board = await bridge?.getTaskBoard?.(input.id)
        const row = board?.tasks.find(task => task.key === input.key)
        return row !== undefined && row.status === input.status && row.source === 'terminal'
      }, { id: projectId, key: target.key, status: next }, { timeout: REFLOW_BUDGET_MS, polling: 50 })
      const elapsed = Date.now() - t0
      expect(elapsed, `终端变更 ≤${String(REFLOW_BUDGET_MS)}ms 感知可见(实际 ${String(elapsed)}ms)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

      // 判定输入钉零:无任何挂接行(隔离 userData + 本腿零挂接写入)。
      expect(await detailLinksOf(page, projectId, target.key), 'SessionLink-0 钉零(FT-045 判定输入)').toEqual([])

      // 随后进入看板(容差导航):免手动刷新可见 + 节点卡 [终端] 徽标(view-A)。
      await openTasksBoard(page, set.facts.taskCount)
      await expect(page.locator(`[data-dsh-forge-node-card="${target.key}"] [data-dsh-forge-badge="source:terminal"]`),
        '节点卡来源徽标 = [终端]').toBeVisible()
      expect(await boardStatusOf(page, projectId, target.key), '看板读数 = 终端变更后状态').toBe(next)

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

test('step-1/board-open-change [@web-e2e @journey dual-form-consistency]: arrival change on the OPEN board ≤5s, existing content retained (no full-board reload)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepOneFixture()
  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    env: { ...stub.env, DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]) },
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      // 看板已打开(非首次加载前的到达变更腿;容差导航进入)。
      await openTasksBoard(page, set.facts.taskCount)

      const changed = pickTaskKey(set, task => task.status !== 'completed')
      // 保留证人:另一任务(eval 残差 —— min_count≥2 才非空;另一 feature 更强)。
      const witness = pickTaskKey(set, () => true, changed.key)
      const witnessBefore = await boardStatusOf(page, projectId, witness.key)
      expect(witnessBefore).toBeDefined()
      expect(await markTreeNode(page, witness.key), '证人节点标记就位').toBe(true)

      const next = mutator.nextStatusOf(changed.key)
      const elapsed = await measureReflow(page, changed.key, 'terminal', next,
        () => { mutator.mutateStatus(changed.key, next) })
      expect(elapsed, `看板已打开时到达变更 ≤5000ms(实际 ${String(elapsed)}ms)`).toBeLessThanOrEqual(5_000)

      // 既有内容完整保留:证人节点仍在、状态未动、DOM 未重建;节点数稳定。
      expect(await boardStatusOf(page, projectId, witness.key), '未变更任务状态保留').toBe(witnessBefore)
      expect(await treeNodeMarked(page, witness.key), '证人节点 DOM 未重建(无整板重载)').toBe(true)
      await waitForTreeNodes(page, set.facts.taskCount, 10_000)
      await expect(page.locator(`[data-dsh-forge-node-card="${witness.key}"]`)).toBeVisible()

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

test('step-1/perception-chain-error [@web-e2e @journey dual-form-consistency]: sync-error toolbar + last-good board retained, retry after restore converges (FT-056)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepOneFixture()
  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    env: { ...stub.env, DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]) },
  })
  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      // 健康初始加载:存在 last-good 内容 + sync idle(容差导航进入)。
      await openTasksBoard(page, set.facts.taskCount)
      await expect(page.locator('[data-dsh-forge-tasks-sync="idle"]')).toBeVisible({ timeout: 30_000 })

      const target = pickTaskKey(set, task => task.status !== 'completed')
      const indexPath = project.indexPaths.find(row => row.slug === target.featureSlug)?.path ?? ''
      const targetLastGood = await boardStatusOf(page, projectId, target.key)
      const witness = pickTaskKey(set, () => true, target.key)
      expect(await markTreeNode(page, witness.key), 'last-good 证人节点标记就位').toBe(true)

      // ---- 故障注入:index.json = INVALID JSON → 该 feature 解析失败 ----------
      // (变更扫描持续失败:文件级降级 —— tasks=null 保形 + sync_state error。)
      writeFileSync(indexPath, '{ this is not valid json')
      await expect(page.locator('[data-dsh-forge-tasks-sync="error"]'),
        '感知链故障 → 工具栏 sync-error(FT-056)').toBeVisible({ timeout: 30_000 })
      // 错误原因可读(title 槽携带 sync_state.error 文案,FT-056,≤120 字符截断)。
      await expect(page.locator('[data-dsh-forge-tasks-sync="error"] [title]'),
        '错误原因可读(内层 span title = 解析失败明细)').toHaveAttribute('title', /index\.json/)

      // last-good 保留:节点数不变、被解析失败 feature 的既有行不清空(tasks=null
      // 保形)、无整板重载、无错误态整板替换。
      await waitForTreeNodes(page, set.facts.taskCount, 10_000)
      expect(await treeNodeMarked(page, witness.key), 'last-good 期间证人节点 DOM 未重建').toBe(true)
      expect(await boardStatusOf(page, projectId, witness.key), 'last-good 数据保留(派生缓存不被错误态清空)').toBeDefined()
      expect(await boardStatusOf(page, projectId, target.key), '故障 feature 的任务行保留 last-good(不空白、不残缺)').toBe(targetLastGood)

      // ---- 故障窗内发生的终端变更随恢复一并落盘(恢复 = 有效的方言文件,------
      // 内含状态翻转;故障窗内它不可回流 —— 上面 target 仍读 last-good 已钉)。
      const next = mutator.nextStatusOf(target.key)
      mutator.mutateStatus(target.key, next) // 序列器口径的合法文件(故障注入只坏过 JSON 语法)
      const restored = JSON.parse(readFileSync(indexPath, 'utf8')) as { tasks: Record<string, { id: string; status: string }> }
      expect(
        Object.values(restored.tasks).find(entry => entry.id === target.localId)?.status,
        '恢复后的 index.json 是有效 JSON 且携带故障窗内的终端变更',
      ).toBe(next)

      // ---- 感知链恢复(FT-056 双通道:后台静默重试 + 手动重试动词)。----------
      // 恢复写本身就会触发重扫;手动点击是用户面动词,若后台已先恢复则按钮已
      // 消失(点击尽力而为)—— 收敛断言才是判据(免手动刷新回流可见)。
      await page.locator('[data-dsh-forge-tasks-sync-retry]').click({ timeout: 2_000 }).catch(() => undefined)
      await expect(page.locator('[data-dsh-forge-tasks-sync="idle"]'),
        '恢复有效文件 → sync 回 idle(重扫成功,静默或手动通道任一)').toBeVisible({ timeout: 30_000 })
      await expect.poll(() => boardStatusOf(page, projectId, target.key), { timeout: 30_000 }).toBe(next)
      await waitForTreeNodes(page, set.facts.taskCount, 10_000)

      // 恢复后整板健康:证人仍在且状态不漂移。
      expect(await boardStatusOf(page, projectId, witness.key), '证人任务状态跨故障/恢复不漂移').toBeDefined()

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
