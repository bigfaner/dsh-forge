// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-4-verify-forge-data-consistency.md
//
// Step 4 校验 forge 数据一致性(SC7 验收脚本往返断言,测试进程执行):
//   success —— Preconditions 引 Step 3(腿内先完成一轮双侧交替:终端裸写 +
//     会话侧 record-先/status-后)。校验三面:
//     ① 序列器往返:每 feature 的 index.json 字节 ≡ tasksIndexJson(文件重建
//        模型)渲染 —— 方言自洽、零半写;
//     ② 工作台状态 = 文件投影:getTaskBoard 全集 ≡ 直读 index.json 任务集;
//     ③ 混写检测:项目根零工作台自有产物(根清单仅 .forge/docs + win32 侧
//        stub CLI 派发件);docs 树哈希 ≡ 终态模型全新渲染(零意外文件)。
//   offline-terminal-changes —— 应用未启动期间终端已完成变更:先变后启;
//     初始全量扫描建立视图(快照 = forge 数据投影):板读 = 文件直读全集、
//     变更键可见、不误标(来源 = terminal + SessionLink-0 经 getTaskDetail
//     .links === [] 钉零 —— eval 残差要求的判定输入钉定)。
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
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
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard } from '../tests/m2/helpers/restart-app.ts'
import { assertTreesIdentical, hashTree } from '../tests/m2/helpers/tree-hash.ts'
import {
  boardSourceOf, boardStatusEntries, bridgeRecordSessionLink, detailLinksOf, expectIndexSerializerRoundTrip,
  expectStatusMapsEqual, fileStatusMap, measureReflow, pickTaskKey, readTerminalStatuses,
  workbenchBundles,
} from './helpers.ts'

/** Step-4 fixture:12 任务双 feature、零记录(交替腿的会话侧记录由腿内建立)。 */
function stepFourFixture(): { set: GeneratedTaskSet; root: string; project: WrittenForgeProject; stub: StubCli; mutator: FixtureMutator } {
  const set = generateTaskSet({ seed: 'dfc4', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfc4-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-dfc4') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator = createFixtureMutator(set, project)
  return { set, root, project, stub, mutator }
}

// [M4 1.8 e2e 迁移·迁移清单 第②行] 2.10 已按新宿主恢复:入口 = 右栏任务看板 pane
// (openTasksBoard/openBoardPane:概览任务行 seam + registerFixtureProject 的列表推送位);断言本体零删改。
test('step-4/success [@web-e2e @journey dual-form-consistency]: SC7 round-trip integrity after alternation — serializer round-trip + board≡files + zero workbench-owned artifacts in the forge tree', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepFourFixture()
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

      // ---- Preconditions(引 Step 3):双侧多笔读写向交替已发生。------------
      const terminalSide = pickTaskKey(set, task => task.status !== 'completed')
      const sessionSide = pickTaskKey(set, task => task.status !== 'completed', terminalSide.key)
      const sessionId = 'dfc4-session-consistency'
      await bridgeRecordSessionLink(page, { projectId, taskKey: sessionSide.key, sessionId })

      const t1 = mutator.nextStatusOf(terminalSide.key)
      await measureReflow(page, terminalSide.key, 'terminal', t1,
        () => { mutator.mutateStatus(terminalSide.key, t1) })
      const s1 = mutator.nextStatusOf(sessionSide.key)
      await measureReflow(page, sessionSide.key, 'session', s1, () => {
        mutator.writeRecord(sessionSide.key, `session:${sessionId}`)
        mutator.mutateStatus(sessionSide.key, s1)
      })

      // ---- ① 序列器往返:每 feature 的 index.json ≡ 规范渲染。--------------
      for (const { slug, path } of project.indexPaths) {
        expectIndexSerializerRoundTrip(slug, path)
      }

      // ---- ② 工作台状态 = 文件投影(全集对拍)。-----------------------------
      const board = new Map(await boardStatusEntries(page, projectId))
      expectStatusMapsEqual('校验面 文件直读 vs 数据面', fileStatusMap(project), board)
      expectStatusMapsEqual('校验面 终端 TSV vs 数据面', readTerminalStatuses(stub, project.codeRoot), board)

      // ---- ③ 混写检测:全新渲染 + 变更器重放 sanctioned 写 → 树哈希对拍。------
      // (mutateStatus 只重写 index.json;任务 .md 描述体不随状态翻写 —— 6.1
      // writer 语义,镜像模型重渲染会漂移。)
      const scratchRender = writeForgeProject(set, { codeRoot: join(root, 'scratch-final-render') })
      const oracleMutator = createFixtureMutator(set, scratchRender)
      oracleMutator.mutateStatus(terminalSide.key, t1)
      oracleMutator.writeRecord(sessionSide.key, `session:${sessionId}`)
      oracleMutator.mutateStatus(sessionSide.key, s1)
      assertTreesIdentical('docs 树 vs 终态模型全新渲染(零意外文件)',
        hashTree(join(scratchRender.codeRoot, 'docs')), hashTree(join(project.codeRoot, 'docs')))

      // 项目根清单:forge 自有物 + win32 stub 派发件之外零文件(挂接/插件
      // 覆盖等工作台自有状态绝不落入项目目录)。
      const stubArtifacts = process.platform === 'win32' ? ['prompt.js', 'task.js'] : []
      expect(readdirSync(project.codeRoot).sort(), '项目根零工作台自有产物(混写检测)')
        .toEqual(['.forge', 'docs', ...stubArtifacts].sort())

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})

// [M4 1.8 e2e 迁移·迁移清单 第②行] 2.10 已按新宿主恢复:入口 = 右栏任务看板 pane
// (openTasksBoard/openBoardPane:概览任务行 seam + registerFixtureProject 的列表推送位);断言本体零删改。
test('step-4/offline-terminal-changes [@web-e2e @journey dual-form-consistency]: pre-boot terminal changes surface on the initial scan, complete and correctly attributed ([终端], SessionLink-0)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepFourFixture()

  // ---- 应用未运行:终端侧先完成变更(测试进程先变后启)。---------------------
  const offlineA = pickTaskKey(set, task => task.status !== 'completed')
  const offlineB = pickTaskKey(set, task => task.status !== 'completed', offlineA.key)
  const nextA = mutator.nextStatusOf(offlineA.key)
  const nextB = mutator.nextStatusOf(offlineB.key)
  mutator.mutateStatus(offlineA.key, nextA)
  mutator.mutateStatus(offlineB.key, nextB)
  const unchangedWitness = pickTaskKey(set, task => task.status !== 'completed', offlineA.key, offlineB.key)
  const witnessBefore = mutator.statusOf(unchangedWitness.key)

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

      // 启动全量扫描建立视图:离线变更逐键可见、不遗漏(全集对拍)。
      expectStatusMapsEqual('离线变更后 文件直读 vs 初始看板', fileStatusMap(project), new Map(await boardStatusEntries(page, projectId)))

      // 不误标:无 actor、无挂接 → 判定序路径 2 → [终端];SessionLink-0 钉零。
      expect(await boardSourceOf(page, projectId, offlineA.key), '离线变更 A 来源 = terminal').toBe('terminal')
      expect(await boardSourceOf(page, projectId, offlineB.key), '离线变更 B 来源 = terminal').toBe('terminal')
      expect(await detailLinksOf(page, projectId, offlineA.key), 'SessionLink-0(判定输入钉零)').toEqual([])

      // 未变更键不受离线窗口影响;终端读同源可见。
      expect(await boardStatusEntries(page, projectId).then(rows => new Map(rows).get(unchangedWitness.key)),
        '未变更任务保持原状(无遗漏面外的误改)').toBe(witnessBefore)
      expectStatusMapsEqual('离线变更后 终端 TSV vs 初始看板',
        readTerminalStatuses(stub, project.codeRoot), new Map(await boardStatusEntries(page, projectId)))

      expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      await cleanupViewKey(shell.page)
      await closeAndAwaitExit(shell)
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    expect(existsSync(root)).toBe(false)
  }
})
