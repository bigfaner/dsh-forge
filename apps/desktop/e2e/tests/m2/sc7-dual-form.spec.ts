// @feature dsh-forge-m2 | @web-e2e | @journey sc7-dual-form
// Traceability: docs/features/dsh-forge-m2/tasks/6.5-sc67-plugin-model-dual-form.md
//
// SC7 双形态一致验收腿(tech-design Interface 3 / PRD SC7 + Story4):同一
// fixture 同时驱动终端形态(stub forge CLI `task status`,测试进程直启 ——
// win32 经 node.exe 副本的 main-entry 解析协议,与插件宿主同一 spawn 契约)
// 与应用形态(真实链注册 + 感知),词表直通对拍:
//
//   SC7-1 静态对拍 —— 终端 TSV 状态集 vs 应用三路读取(数据面 getTaskBoard
//     直调 + view-B 分组列 + view-C 列表行)逐键逐状态相等;状态即 forge
//     原始词表(终端 TSV 原样;view-C 标签经 SC1 的双语标签表回映)。终端
//     读以 journal 留痕(argv + cwd = 项目根)。
//   SC7-2 交替读写(状态无损坏)——
//     ① 终端侧写:纯 index.json 状态翻转(6.3 终端形态变更口径:无记录、
//       无挂接)→ 应用看板回流可见 + 终端自读一致;
//     ② 应用侧发起的变更(6.3 会话通道口径:先落 session actor 记录、后
//       翻状态 —— 记录先、状态后)→ 看板回流且来源徽标 [会话] → 终端
//       读取路径(fresh stub 进程再读)同样可见 —— 两形态读同一 forge 文
//       件(同源断言);
//     ③ 终态四路对拍:终端 TSV vs 数据面 vs view-B vs view-C 再次全等,
//       两处变更键的终态在三处一致。
//
// Hard Rules:启动前单实例探测(factory 内建);DSH_FORGE_USER_DATA 隔离;
// fixture/stub 全住 journey 临时目录。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball,
} from '../../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../../fixtures/forge-project.ts'
import { TASK_STATUSES, generateTaskSet } from '../../fixtures/task-generator.ts'
import type { GeneratedTask, GeneratedTaskStatus } from '../../fixtures/task-generator.ts'
import { materializeStubCli } from '../../fixtures/stubs/cli.ts'
import type { StubCli } from '../../fixtures/stubs/cli.ts'
import { createFixtureMutator } from './helpers/file-mutate.ts'
import type { FixtureMutator } from './helpers/file-mutate.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard } from './helpers/restart-app.ts'
import { en } from '../../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import type { WorkbenchKey } from '../../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import { zh } from '../../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'

/** 最小产品配置:基座 + 必备 forge 核心(SC7 无第三方插件面)。 */
function sc7Bundles() {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

/** view-C 状态标签 → 状态(双语,SC1 同款回映表)。 */
const STATUS_LABEL_KEY_OF: Readonly<Record<GeneratedTaskStatus, WorkbenchKey>> = {
  pending: 'tasks.status.pending',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  blocked: 'tasks.status.blocked',
  suspended: 'tasks.status.suspended',
  skipped: 'tasks.status.skipped',
  rejected: 'tasks.status.rejected',
}
const statusOfLabel = new Map<string, GeneratedTaskStatus>()
for (const status of TASK_STATUSES) {
  const key = STATUS_LABEL_KEY_OF[status]
  statusOfLabel.set(zh[key], status)
  statusOfLabel.set(en[key], status)
}

/** 终端形态读:`forge task status` TSV → Map<taskKey, status>(词表原样)。 */
function readTerminalStatuses(stub: StubCli, codeRoot: string): ReadonlyMap<string, string> {
  const result = spawnSync(stub.cliPath, ['task', 'status'], { cwd: codeRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`stub forge task status exited ${String(result.status)}: ${result.stderr ?? ''}`)
  }
  const byKey = new Map<string, string>()
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue
    const parts = line.split('\t')
    const key = parts[0] ?? ''
    const status = parts[1] ?? ''
    if (parts.length !== 2 || key === '' || status === '') {
      throw new Error(`unparseable status row: ${JSON.stringify(line)}`)
    }
    byKey.set(key, status)
  }
  return byKey
}

/** 两张状态图的逐键逐状态对拍(带差异样本)。 */
function expectStatusMapsEqual(label: string, left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): void {
  const samples: string[] = []
  for (const [key, status] of left) {
    const other = right.get(key)
    if (other === undefined) samples.push(`${label}: ${key} missing on the right`)
    else if (other !== status) samples.push(`${label}: ${key} ${status} != ${other}`)
    if (samples.length >= 5) break
  }
  for (const key of right.keys()) {
    if (!left.has(key)) samples.push(`${label}: ${key} unexpected on the right`)
    if (samples.length >= 8) break
  }
  expect(samples, `${label}: status-map diff samples`).toEqual([])
  expect(left.size, `${label}: key count`).toBe(right.size)
}

/** 应用形态读·数据面:getTaskBoard 直调 → entries。 */
async function boardStatusEntries(page: Page, projectId: string): Promise<Array<[string, string]>> {
  return await page.evaluate(async (id: string) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string }> }> } }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(id)
    if (board === undefined) throw new Error('dshForge.workbench.getTaskBoard bridge unavailable in the e2e renderer')
    return board.tasks.map(task => [task.key, task.status] as [string, string])
  }, projectId)
}

/** 应用形态读·view-B(分组列):column 属性携带原始状态词。 */
async function groupedStatusEntries(page: Page): Promise<Array<[string, string]>> {
  return await page.evaluate(() => {
    const rows: Array<[string, string]> = []
    for (const column of document.querySelectorAll('[data-dsh-forge-status-column]')) {
      const status = column.getAttribute('data-dsh-forge-status-column') ?? ''
      for (const card of column.querySelectorAll('[data-dsh-forge-task-card]')) {
        rows.push([card.getAttribute('data-dsh-forge-task-card') ?? '', status])
      }
    }
    return rows
  })
}

/** 应用形态读·view-C(列表行):状态标签文本(回映到状态)。 */
async function listRowStatusTexts(page: Page): Promise<Array<[string, string]>> {
  return await page.evaluate(() => Array.from(document.querySelectorAll('[data-dsh-forge-task-row]')).map((row) => {
    const key = row.getAttribute('data-dsh-forge-task-row') ?? ''
    const statusText = row.children[2]?.textContent ?? ''
    return [key, statusText] as [string, string]
  }))
}

/** view-C 行状态(单键,poll 面)。 */
async function listRowStatus(page: Page, taskKey: string): Promise<string | undefined> {
  return await page.evaluate((key: string) => {
    const row = document.querySelector(`[data-dsh-forge-task-row="${key}"]`)
    return row?.children[2]?.textContent ?? undefined
  }, taskKey)
}

/** 数据面单键状态(poll 面)。 */
async function boardStatusOf(page: Page, projectId: string, taskKey: string): Promise<string | undefined> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as {
      dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<{ tasks: Array<{ key: string; status: string }> }> } }
    }).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(input.id)
    return board?.tasks.find(task => task.key === input.key)?.status
  }, { id: projectId, key: taskKey })
}

test('6.5/sc7-dual-form [@web-e2e @journey sc7-dual-form]: terminal forge task status vs app board status sets + alternating same-source writes', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // --- journey fixtures ------------------------------------------------------
  const set = generateTaskSet({ seed: 'sc7dual', taskCount: 24, featureCount: 3, danglingRate: 0, recordRate: 0.25 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc7-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-sc7') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  // win32:task 子命令经 spawn cwd 的 main-entry(task.js)派发 —— 挂到项目根。
  stub.attachProject(project.codeRoot)
  const mutator: FixtureMutator = createFixtureMutator(set, project)

  const session = createAppSessionFactory({
    bundles: sc7Bundles(),
    stageTarballs: [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }],
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
  })

  try {
    const shell = await session.boot()
    try {
      const { page } = shell
      const projectId = await registerFixtureProject(page, project)
      await openTasksBoard(page, set.facts.taskCount)

      // ======================================================================
      // SC7-1 · 静态对拍:终端 TSV vs 应用三路读取。
      // ======================================================================
      const terminal1 = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal1.size, '终端形态读回全量任务').toBe(set.facts.taskCount)
      for (const status of terminal1.values()) {
        expect(TASK_STATUSES as readonly string[], `终端词表直通(原始 forge 词表): ${status}`).toContain(status)
      }
      // 终端读留痕(journal:argv[0]='task' argv[1]='status',cwd = 项目根)。
      expect(
        stub.readJournal().some(invocation => invocation.argv[0] === 'task' && invocation.argv[1] === 'status' && invocation.cwd === project.codeRoot),
        'stub journal 记录了终端形态读取',
      ).toBe(true)

      const board1 = new Map(await boardStatusEntries(page, projectId))

      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      const viewB1 = new Map(await groupedStatusEntries(page))

      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const viewC1Rows = await listRowStatusTexts(page)
      const viewC1 = new Map<string, string>()
      for (const [key, label] of viewC1Rows) {
        const status = statusOfLabel.get(label.trim())
        if (status === undefined) throw new Error(`view-C 行 ${key} 状态标签无法回映: ${JSON.stringify(label)}`)
        viewC1.set(key, status)
      }

      expectStatusMapsEqual('终端 vs 数据面', terminal1, board1)
      expectStatusMapsEqual('view-B vs 数据面', viewB1, board1)
      expectStatusMapsEqual('view-C vs 数据面', viewC1, board1)

      // ======================================================================
      // SC7-2① · 终端侧写 → 应用回流 + 终端自读一致。
      // ======================================================================
      const pickTask = (predicate: (task: GeneratedTask) => boolean, ...exclude: string[]): GeneratedTask => {
        const excluded = new Set(exclude)
        for (const feature of set.features) {
          for (const task of feature.tasks) {
            if (excluded.has(`${feature.slug}/${task.localId}`)) continue
            if (predicate(task)) return task
          }
        }
        throw new Error('sc7: no fixture task matches the pick predicate')
      }
      const terminalTask = pickTask(task => task.record === null)
      const terminalKey = `${set.features.find(feature => feature.tasks.includes(terminalTask))?.slug ?? ''}/${terminalTask.localId}`
      const next1 = mutator.nextStatusOf(terminalKey)
      mutator.mutateStatus(terminalKey, next1)

      await expect.poll(() => boardStatusOf(page, projectId, terminalKey), { timeout: 15_000 }).toBe(next1)
      await expect.poll(async () => statusOfLabel.get(((await listRowStatus(page, terminalKey)) ?? '').trim()), { timeout: 15_000 })
        .toBe(next1)

      const terminal2 = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal2.get(terminalKey), '终端侧写后终端自读一致').toBe(next1)
      expectStatusMapsEqual('终端侧写后 终端 vs 数据面', terminal2, new Map(await boardStatusEntries(page, projectId)))

      // ======================================================================
      // SC7-2② · 应用侧发起(会话通道口径:记录先、状态后)→ 终端同源可见。
      // ======================================================================
      const sessionTask = pickTask(task => task.record === null, terminalKey)
      const sessionKey = `${set.features.find(feature => feature.tasks.includes(sessionTask))?.slug ?? ''}/${sessionTask.localId}`
      const next2 = mutator.nextStatusOf(sessionKey)
      mutator.writeRecord(sessionKey, 'session:sc7-dual-form')
      mutator.mutateStatus(sessionKey, next2)

      await expect.poll(() => boardStatusOf(page, projectId, sessionKey), { timeout: 15_000 }).toBe(next2)
      await expect(
        page.locator(`[data-dsh-forge-task-row="${sessionKey}"] [data-dsh-forge-badge="source:session"]`),
        '应用侧变更的来源徽标 [会话]',
      ).toBeVisible({ timeout: 15_000 })

      // 同源断言:fresh stub 进程的终端读取路径同样可见。
      const terminal3 = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal3.get(sessionKey), '应用侧发起的变更在终端读取路径同样可见(同源)').toBe(next2)
      expect(terminal3.get(terminalKey), '① 的终端侧写不被 ② 回退(无损坏)').toBe(next1)

      // ======================================================================
      // SC7-2③ · 终态四路对拍(状态无损坏)。
      // ======================================================================
      const boardFinal = new Map(await boardStatusEntries(page, projectId))
      expectStatusMapsEqual('终态 终端 vs 数据面', terminal3, boardFinal)

      await page.locator('[data-dsh-forge-board-view="grouped"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="grouped"]')).toBeVisible({ timeout: 30_000 })
      expectStatusMapsEqual('终态 view-B vs 数据面', new Map(await groupedStatusEntries(page)), boardFinal)

      await page.locator('[data-dsh-forge-board-view="list"]').click()
      await expect(page.locator('[data-dsh-forge-board-panel="list"]')).toBeVisible({ timeout: 30_000 })
      const viewCFinal = new Map<string, string>()
      for (const [key, label] of await listRowStatusTexts(page)) {
        const status = statusOfLabel.get(label.trim())
        if (status === undefined) throw new Error(`终态 view-C 行 ${key} 状态标签无法回映: ${JSON.stringify(label)}`)
        viewCFinal.set(key, status)
      }
      expectStatusMapsEqual('终态 view-C vs 数据面', viewCFinal, boardFinal)
      expect(viewCFinal.get(terminalKey), '① 变更键终态(view-C)').toBe(next1)
      expect(viewCFinal.get(sessionKey), '② 变更键终态(view-C)').toBe(next2)

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    // Journey cleanup(6.1 Hard Rule)。
    rmSync(root, { recursive: true, force: true })
    expect(existsSync(root)).toBe(false)
  }
})
