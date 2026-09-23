// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Journey smoke test (happy path): healthy load → 终端变更 ≤5s [终端] →
// 会话侧变更(record-先/status-后)≤5s [会话] → 终端 forge task status 一致 →
// SC7 文件往返完整性 + 树哈希洁净 → 挂接完整(详情历史行)。
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-{1..5}-*.md
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
  boardStatusEntries, boardSourceOf, bridgeRecordSessionLink, detailLinksOf, expectIndexSerializerRoundTrip,
  expectStatusMapsEqual, fileStatusMap, measureReflow, pickTaskKey, readTerminalStatuses, workbenchBundles,
} from './helpers.ts'

test('smoke/happy-path [@web-e2e @journey dual-form-consistency]: terminal change → session change → terminal agreement → SC7 integrity → link history', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  const set: GeneratedTaskSet = generateTaskSet({ seed: 'dfcsmoke', taskCount: 10, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfcsmoke-'))
  const project: WrittenForgeProject = writeForgeProject(set, { codeRoot: join(root, 'proj-dfcsmoke') })
  const stub: StubCli = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator: FixtureMutator = createFixtureMutator(set, project)
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

      // ---- Step 1(健康加载 + 终端变更 ≤5s [终端])----------------------------
      await openTasksBoard(page, set.facts.taskCount)
      const terminalSide = pickTaskKey(set, task => task.status !== 'completed')
      const t1 = mutator.nextStatusOf(terminalSide.key)
      const t1Ms = await measureReflow(page, terminalSide.key, 'terminal', t1,
        () => { mutator.mutateStatus(terminalSide.key, t1) })
      expect(t1Ms, `smoke·step1 终端变更 ≤5000ms(实际 ${String(t1Ms)}ms)`).toBeLessThanOrEqual(5_000)
      expect(await boardSourceOf(page, projectId, terminalSide.key), 'smoke·step1 来源 [终端]').toBe('terminal')

      // ---- Step 2/3(会话侧变更 ≤5s [会话] + 交替一致)------------------------
      const sessionSide = pickTaskKey(set, task => task.status !== 'completed', terminalSide.key)
      const sessionId = 'dfcsmoke-session'
      await bridgeRecordSessionLink(page, { projectId, taskKey: sessionSide.key, sessionId })
      const s1 = mutator.nextStatusOf(sessionSide.key)
      const s1Ms = await measureReflow(page, sessionSide.key, 'session', s1, () => {
        mutator.writeRecord(sessionSide.key, `session:${sessionId}`)
        mutator.mutateStatus(sessionSide.key, s1)
      })
      expect(s1Ms, `smoke·step2 会话侧变更 ≤5000ms(实际 ${String(s1Ms)}ms)`).toBeLessThanOrEqual(5_000)
      expect(await boardSourceOf(page, projectId, sessionSide.key), 'smoke·step2 来源 [会话]').toBe('session')

      // 终端 forge task status 一致(对拍维度:status)。
      const terminal = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal.get(terminalSide.key), 'smoke·step2 终端读一致(终端键)').toBe(t1)
      expect(terminal.get(sessionSide.key), 'smoke·step2 终端读一致(会话键)').toBe(s1)
      expectStatusMapsEqual('smoke·step2 终端 vs 数据面', terminal, new Map(await boardStatusEntries(page, projectId)))

      // ---- Step 4(SC7 文件往返完整性 + 树哈希洁净)---------------------------
      for (const { slug, path } of project.indexPaths) {
        expectIndexSerializerRoundTrip(slug, path)
      }
      expectStatusMapsEqual('smoke·step4 文件直读 vs 数据面', fileStatusMap(project), new Map(await boardStatusEntries(page, projectId)))
      // 终态模型渲染 = 全新渲染 + 以同一变更器重放本腿的全部 sanctioned 写
      // (mutateStatus 只重写 index.json;任务 .md 描述体不随状态翻写 —— 6.1
      // writer 语义,镜像模型重渲染会漂移)。
      const scratchRender = writeForgeProject(set, { codeRoot: join(root, 'scratch-final-render') })
      const oracleMutator = createFixtureMutator(set, scratchRender)
      oracleMutator.mutateStatus(terminalSide.key, t1)
      oracleMutator.writeRecord(sessionSide.key, `session:${sessionId}`)
      oracleMutator.mutateStatus(sessionSide.key, s1)
      assertTreesIdentical('smoke·step4 docs 树 vs 终态模型渲染', hashTree(join(scratchRender.codeRoot, 'docs')), hashTree(join(project.codeRoot, 'docs')))
      const stubArtifacts = process.platform === 'win32' ? ['prompt.js', 'task.js'] : []
      expect(readdirSync(project.codeRoot).sort(), 'smoke·step4 项目根零工作台自有产物').toEqual(['.forge', 'docs', ...stubArtifacts].sort())

      // ---- Step 5(挂接完整:详情挂接历史行)----------------------------------
      const forgeTreeBeforeDock = hashTree(join(project.codeRoot, 'docs'))
      await page.locator(`[data-dsh-forge-node-card="${sessionSide.key}"]`).click()
      const dock = page.locator(`[data-dsh-forge-task-detail="${sessionSide.key}"]`)
      await expect(dock).toBeVisible({ timeout: 15_000 })
      await expect(dock.locator(`[data-dsh-forge-detail-link="${sessionId}"][data-link-status="active"]`),
        'smoke·step5 当前挂接在详情历史中在场(active)').toBeVisible({ timeout: 15_000 })
      const links = await detailLinksOf(page, projectId, sessionSide.key)
      expect(links[0], 'smoke·step5 挂接索引首行 = 当前会话(active)').toMatchObject({ sessionId, status: 'active' })
      assertTreesIdentical('smoke·step5 挂接/查看零 forge 写入', forgeTreeBeforeDock, hashTree(join(project.codeRoot, 'docs')))

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
