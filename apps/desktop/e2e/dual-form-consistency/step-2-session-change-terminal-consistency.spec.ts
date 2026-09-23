// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-2-session-change-terminal-consistency.md
//
// Step 2 应用会话变更在终端一致:
//   success —— 应用侧挂接会话完成任务操作后,终端 `forge task status`(stub
//     CLI TSV,测试进程代查,cwd = 项目根)与看板展示一致。会话通道口径 =
//     先落 session actor 记录、后翻状态(file-mutate 判定序纪律:record 先、
//     status 后);active 挂接经桥直达 recordSessionLink 建立(sanctioned:
//     发起链路(sc2/sc3)不是本旅程被测面 —— 挂接索引为工作台自有 SoT,
//     Interface 1 动词即其登记通道)。看板侧来源 = [会话](FT-045:active 挂接
//     → session);终端输出是否携带来源 = UNKNOWN(FT-032 来源为工作台侧字
//     段)→ 不列入对拍维度。
//     对拍维度收敛:status 经 stub TSV;依赖列 stub TSV 不携带(eval 残差已
//     记录)→ 依赖维经测试进程直读 index.json vs getTaskBoard blockers。
//   high-frequency-terminal-changes —— 钉距节奏(相邻变更 ≥1.5s > 感知链
//     合流窗:400ms trailing 防抖 + 500ms 批推,FT-047)下三笔连续终端变更
//     逐笔回流:每笔落盘后先经 boardStatusOf 轮询观测到中间态,才允许下一
//     笔(无丢失/无错误合并的可观测形态);终态四路对拍。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import type { GeneratedTaskSet, GeneratedTaskStatus } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import { createFixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import type { FixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import {
  boardBlockersOf, boardSourceOf, boardStatusEntries, boardStatusOf, bridgeRecordSessionLink,
  expectFourWayAgreement, expectStatusMapsEqual, fileStatusMap, measureReflow, pickTaskKey,
  readIndexEntries, readTerminalStatuses, workbenchBundles,
} from './helpers.ts'

/** Step-2 fixture:12 任务双 feature、零记录(挂接/actor 全由腿内显式建立)。 */
function stepTwoFixture(): { set: GeneratedTaskSet; root: string; project: WrittenForgeProject; stub: StubCli; mutator: FixtureMutator } {
  const set = generateTaskSet({ seed: 'dfc2', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfc2-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-dfc2') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator = createFixtureMutator(set, project)
  return { set, root, project, stub, mutator }
}

test('step-2/success [@web-e2e @journey dual-form-consistency]: after a session-attributed change the terminal forge task status agrees with the board ([会话] mark)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepTwoFixture()
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
      await openTasksBoard(page, set.facts.taskCount)

      // 挂接会话就绪(Interface 1 动词直达;发起链路归 sc2/sc3 旅程)。
      const sessionTask = pickTaskKey(set, task => task.status !== 'completed')
      const sessionId = 'dfc2-session-1'
      const link = await bridgeRecordSessionLink(page, { projectId, taskKey: sessionTask.key, sessionId })
      expect(typeof link.id).toBe('string')

      // 对照组:同板一个无挂接无记录任务(未变更行保留历史来源 [终端])。
      const terminalTask = pickTaskKey(set, task => task.status !== 'completed', sessionTask.key)
      const terminalBaseline = await boardSourceOf(page, projectId, terminalTask.key)
      expect(terminalBaseline, '初始扫描的未变更行来源 = terminal(历史事实)').toBe('terminal')

      // 会话侧操作口径:record 先(actor = session:<id>,FT-045 路径①输入)、
      // status 后 —— ≤5s 回流且来源徽标 [会话](判定序:actor 标记优先)。
      const next = mutator.nextStatusOf(sessionTask.key)
      const elapsed = await measureReflow(page, sessionTask.key, 'session', next, () => {
        mutator.writeRecord(sessionTask.key, `session:${sessionId}`)
        mutator.mutateStatus(sessionTask.key, next)
      })
      expect(elapsed, `会话侧变更 ≤5000ms 回流(实际 ${String(elapsed)}ms)`).toBeLessThanOrEqual(5_000)
      expect(await boardSourceOf(page, projectId, sessionTask.key), '会话侧变更行来源 = session').toBe('session')
      expect(await boardSourceOf(page, projectId, terminalTask.key), '未变更行保留历史来源 terminal(仅变更行判定)').toBe('terminal')

      // ---- 终端读一致:stub CLI `forge task status`(测试进程代查)。--------
      const terminal = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal.get(sessionTask.key), '终端读看到会话侧变更(同源:同一 forge 文件)').toBe(next)
      expectStatusMapsEqual('终端 vs 数据面(会话变更后)', terminal, new Map(await boardStatusEntries(page, projectId)))

      // 依赖维对拍(stub TSV 无依赖列,eval 残差口径):直读 index.json 的
      // dependencies 原词 ≡ 数据面 blockers(FT-032:同 feature 本地上游 key)。
      const indexPath = project.indexPaths.find(row => row.slug === sessionTask.featureSlug)?.path ?? ''
      const entry = Object.values(readIndexEntries(indexPath)).find(row => row.id === sessionTask.localId)
      expect(entry, '会话任务在 index.json 直读中在场').toBeDefined()
      expect(await boardBlockersOf(page, projectId, sessionTask.key), '依赖维:文件直读 ≡ 数据面 blockers').toEqual(entry?.dependencies ?? [])

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

test('step-2/high-frequency-terminal-changes [@web-e2e @journey dual-form-consistency]: pinned spacing (>FT-047 merge window) keeps every terminal change individually visible; final four-way agreement', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepTwoFixture()
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
      await openTasksBoard(page, set.facts.taskCount)

      const target = pickTaskKey(set, task => task.status !== 'completed')
      // 三笔互异的连续变更 —— 中间态互不相同,「错误合并」即不可见中间态。
      const walk: GeneratedTaskStatus[] = ['in_progress', 'completed', 'blocked']
      expect(mutator.statusOf(target.key) !== walk[0], '起始态与首笔互异').toBe(true)

      const perChangeMs: number[] = []
      for (let i = 0; i < walk.length; i += 1) {
        const next = walk[i] as GeneratedTaskStatus
        const t0 = Date.now()
        mutator.mutateStatus(target.key, next)
        // 逐笔观测:本笔中间态在看板可见之后,才允许下一笔(钉距节奏断言面)。
        await expect.poll(() => boardStatusOf(page, projectId, target.key), { timeout: 15_000 },
          `第 ${String(i + 1)} 笔变更逐笔回流(${next})`).toBe(next)
        perChangeMs.push(Date.now() - t0)
        if (i < walk.length - 1) {
          // FT-047 钉距:> 400ms trailing 防抖 + 500ms 批推的合流窗(取 1.5s)。
          await new Promise(resolve => setTimeout(resolve, 1_500))
        }
      }
      console.log(`[dual-form] step-2 high-frequency per-change reflow(ms)=${JSON.stringify(perChangeMs)} spacing=1500ms (FT-047 合流窗外钉距,逐笔可观测)`)
      expect(perChangeMs.every(ms => ms <= 5_000),
        `每笔变更 ≤5000ms 逐笔回流(分布 ${JSON.stringify(perChangeMs)})`).toBe(true)

      // 最终状态与 forge 数据一致:文件直读 + 终端 TSV + 四路对拍。
      const finalStatus = walk[walk.length - 1] as GeneratedTaskStatus
      expect(fileStatusMap(project).get(target.key), '终态 = 最后一笔(文件直读)').toBe(finalStatus)
      expect(readTerminalStatuses(stub, project.codeRoot).get(target.key), '终态 = 最后一笔(终端读)').toBe(finalStatus)
      await expectFourWayAgreement(page, projectId, stub, project.codeRoot, '高频后终态')

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
