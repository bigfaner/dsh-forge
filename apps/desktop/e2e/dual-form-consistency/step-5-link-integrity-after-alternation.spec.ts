// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-5-link-integrity-after-alternation.md
//
// Step 5 交替后挂接状态完整性:
//   success —— 常规 CLI 形态交替(终端裸写 + 会话侧 record-先/status-后)
//     后查看任务详情与挂接:当前挂接呈现(active 行);挂接索引 = 工作台自有
//     SoT,挂接登记 + 详情查看全程 forge 树哈希不变(自有状态独立存放、互
//     不混写)。
//   frozen-plugin-compat —— 真实 3.x 冻结 CLI 在 fixture 不可得 → 按 contract
//     自带的回退配方:经 3.x 形态校准的方言副本代写(spike-1:index.json 为
//     双形态共写往返文件,旧写者重写丢弃未知字段)。3.x-shaped 序列器 = 仅
//     往返 index.json、不写记录文件、丢弃该任务条目的 record: 指针字段
//     (与常规 CLI 形态腿的 tasksIndexJson 全量渲染可区分);同时翻一档状态
//     (变更事实)。断言:应用按同一方言正常解析并回流(≤5s、[终端] 徽标)、
//     文件回读有效(JSON 合法、条目在场)、零损坏(序列器往返)、看板 ≡ 文件
//     真相、record 指针失联被尊重(getTaskDetail.records = []。
//   ended-link-history-retained —— 双挂接(S1 先、S2 后,均经 Interface 1
//     动词直达)后 endSessionLink(L1)(入参 = linkId —— ipc/types.ts 契约,
//     非入参镜像)结束旧挂接:详情挂接历史新→旧 [S2 active, S1 ended],
//     ended 行含结束时间(endedAt 非空)、不删行;全程 forge 树哈希不变
//     (挂接仅存在于工作台自有状态,FT-035)。
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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
  boardSourceOf, boardStatusEntries, boardStatusOf, bridgeEndSessionLink, bridgeRecordSessionLink,
  detailLinksOf, detailRecordsOf, expectIndexSerializerRoundTrip, expectStatusMapsEqual,
  fileStatusMap, measureReflow, pickTaskKey, readIndexEntries, workbenchBundles, writeIndexEntries,
} from './helpers.ts'

/** Step-5 fixture:12 任务双 feature、recordRate 0(record 指针由腿内显式建立)。 */
function stepFiveFixture(): { set: GeneratedTaskSet; root: string; project: WrittenForgeProject; stub: StubCli; mutator: FixtureMutator } {
  const set = generateTaskSet({ seed: 'dfc5', taskCount: 12, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfc5-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-dfc5') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator = createFixtureMutator(set, project)
  return { set, root, project, stub, mutator }
}

/** 详情 dock 打开(节点卡点击 → 侧板可见)。 */
async function openDetailDock(page: Page, taskKey: string): Promise<void> {
  await page.locator(`[data-dsh-forge-node-card="${taskKey}"]`).click()
  await expect(page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`)).toBeVisible({ timeout: 15_000 })
}

test('step-5/success [@web-e2e @journey dual-form-consistency]: after alternation the task detail shows the intact active link; recording/viewing links writes zero bytes into the forge tree', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepFiveFixture()
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

      const terminalSide = pickTaskKey(set, task => task.status !== 'completed')
      const sessionSide = pickTaskKey(set, task => task.status !== 'completed', terminalSide.key)
      const sessionId = 'dfc5-session-link'

      // ---- 常规 CLI 形态交替:终端裸写 → 会话侧 record-先/status-后。--------
      const t1 = mutator.nextStatusOf(terminalSide.key)
      await measureReflow(page, terminalSide.key, 'terminal', t1,
        () => { mutator.mutateStatus(terminalSide.key, t1) })

      // 交替后、挂接登记前:forge 树哈希锚点。
      const forgeTreeBeforeLink = hashTree(join(project.codeRoot, 'docs'))

      // 挂接登记(Interface 1 动词直达;发起链路非本旅程被测面)。
      await bridgeRecordSessionLink(page, { projectId, taskKey: sessionSide.key, sessionId })
      const s1 = mutator.nextStatusOf(sessionSide.key)
      await measureReflow(page, sessionSide.key, 'session', s1, () => {
        mutator.writeRecord(sessionSide.key, `session:${sessionId}`)
        mutator.mutateStatus(sessionSide.key, s1)
      })

      // ---- 用户查看参与交替任务的详情与挂接状态。----------------------------
      await openDetailDock(page, sessionSide.key)
      const dock = page.locator(`[data-dsh-forge-task-detail="${sessionSide.key}"]`)
      await expect(dock.locator(`[data-dsh-forge-detail-link="${sessionId}"][data-link-status="active"]`),
        '详情挂接区呈现当前(active)挂接').toBeVisible({ timeout: 15_000 })

      // 挂接索引读数对拍(工作台自有 SoT;新→旧含 active)。
      const links = await detailLinksOf(page, projectId, sessionSide.key)
      expect(links.length, '挂接历史至少一行(本腿登记)').toBeGreaterThanOrEqual(1)
      expect(links[0]?.sessionId, '首行 = 当前挂接会话').toBe(sessionId)
      expect(links[0]?.status, '当前挂接 active').toBe('active')

      // ---- 交替操作不触碰挂接数据;挂接/查看零 forge 写入(混写检测)。------
      assertTreesIdentical('挂接登记+详情查看全程 forge 树',
        forgeTreeBeforeLink, hashTree(join(project.codeRoot, 'docs')))
      expectStatusMapsEqual('交替后 终端 vs 数据面',
        readTerminalStatuses(stub, project.codeRoot), new Map(await boardStatusEntries(page, projectId)))

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

test('step-5/frozen-plugin-compat [@web-e2e @journey dual-form-consistency]: a 3.x-shaped dialect copy-write (index.json round-trip, record: pointer dropped) renders fine, format intact, board≡files', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepFiveFixture()
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

      // 冻结插件形态的操作对象:先经常规形态建立 record 指针(可区分对象 ——
      // 3.x 写者的字段丢弃要有一个可丢的字段)。前置写走 actor 记录路径①
      // (不建挂接 —— 冻结腿是终端形态写,判定序应落路径 2 = [终端])。
      const subject = pickTaskKey(set, task => task.status !== 'completed')
      const sessionId = 'dfc5-session-frozen-pre'
      const pre = mutator.nextStatusOf(subject.key)
      await measureReflow(page, subject.key, 'session', pre, () => {
        mutator.writeRecord(subject.key, `session:${sessionId}`)
        mutator.mutateStatus(subject.key, pre)
      })
      expect((await detailRecordsOf(page, projectId, subject.key)).length, '前置:record 指针在场').toBe(1)

      // ---- 3.x-shaped 写(回退配方):仅往返 index.json、丢 record: 指针、----
      // 翻一档状态;不写记录文件。与常规 CLI 形态腿(tasksIndexJson 全量
      // 渲染、record 指针随模型保留)可区分。
      const indexPath = project.indexPaths.find(row => row.slug === subject.featureSlug)?.path ?? ''
      const entries = readIndexEntries(indexPath)
      const stem = Object.keys(entries).find(key => entries[key]?.id === subject.localId)
      expect(stem, '目标条目在场').toBeDefined()
      const target = entries[stem ?? '']
      if (target === undefined) throw new Error('step-5 frozen: target index entry missing')
      const frozenNext = mutator.nextStatusOf(subject.key, pre)
      delete target.record // 旧写者丢弃未知字段(spike-1 方向)
      target.status = frozenNext
      const frozenMs = await measureReflow(page, subject.key, 'terminal', frozenNext,
        () => { writeIndexEntries(indexPath, entries) })
      expect(frozenMs, `冻结插件形态变更回流 ≤5000ms(实际 ${String(frozenMs)}ms)`).toBeLessThanOrEqual(5_000)

      // ---- 格式完好:回读有效 JSON、条目在场、零损坏(序列器往返)。---------
      const reparsed = readIndexEntries(indexPath)
      expect(reparsed[stem ?? '']?.id, '条目仍在(应用解析同一方言)').toBe(subject.localId)
      expectIndexSerializerRoundTrip(subject.featureSlug, indexPath)

      // ---- 看板 ≡ 文件真相;record 指针失联被尊重(不虚构记录)。-------------
      expect(await boardStatusOf(page, projectId, subject.key), '看板状态 = 冻结侧写入').toBe(frozenNext)
      expect(await boardSourceOf(page, projectId, subject.key), '无 actor 记录 → 来源 terminal(判定序路径 2)').toBe('terminal')
      expect(await detailRecordsOf(page, projectId, subject.key), 'record 指针被旧写者丢弃 → 记录面为空(不虚构)').toEqual([])
      expectStatusMapsEqual('冻结腿 文件直读 vs 数据面', fileStatusMap(project), new Map(await boardStatusEntries(page, projectId)))

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

test('step-5/ended-link-history-retained [@web-e2e @journey dual-form-consistency]: ended link stays in the newest-first history [S2 active, S1 ended] with endedAt; forge tree untouched across the leg', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project } = stepFiveFixture()
  const session = createAppSessionFactory({
    bundles: workbenchBundles(),
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

      const subject = pickTaskKey(set, task => task.status !== 'completed')
      const forgeTreeBefore = hashTree(join(project.codeRoot, 'docs'))

      // 双挂接:S1 先(将被结束)、S2 后(保持 active)。开始时间隔开,
      // 新→旧排序确定(started_at DESC)。
      const linkOne = await bridgeRecordSessionLink(page, { projectId, taskKey: subject.key, sessionId: 'dfc5-s1' })
      await new Promise(resolve => setTimeout(resolve, 1_100))
      const linkTwo = await bridgeRecordSessionLink(page, { projectId, taskKey: subject.key, sessionId: 'dfc5-s2' })
      expect(linkTwo.id).not.toBe(linkOne.id)

      // 结束旧挂接(endSessionLink 入参 = linkId,ipc/types.ts 契约)。
      await bridgeEndSessionLink(page, linkOne.id)

      // ---- 详情挂接历史:新→旧 [S2 active, S1 ended],ended 行可回溯。------
      await openDetailDock(page, subject.key)
      const dock = page.locator(`[data-dsh-forge-task-detail="${subject.key}"]`)
      await expect.poll(async () => {
        const rows = dock.locator('[data-dsh-forge-detail-link]')
        if (await rows.count() < 2) return []
        return await rows.evaluateAll(nodes => nodes.map(node => ({
          sessionId: node.getAttribute('data-dsh-forge-detail-link') ?? '',
          status: node.getAttribute('data-link-status') ?? '',
        })))
      }, { timeout: 15_000 }).toEqual([
        { sessionId: 'dfc5-s2', status: 'active' },
        { sessionId: 'dfc5-s1', status: 'ended' },
      ])

      // 数据面读数(FT-035:endSessionLink 置 ended 不删行;endedAt 已写入)。
      const links = await detailLinksOf(page, projectId, subject.key)
      expect(links.length, '两行皆在(ended 不删行)').toBe(2)
      expect(links[0]).toMatchObject({ sessionId: 'dfc5-s2', status: 'active' })
      expect(links[1]?.sessionId, '旧挂接行保留').toBe('dfc5-s1')
      expect(links[1]?.status, '旧挂接 ended').toBe('ended')
      expect(links[1]?.endedAt, '结束时间已写入(可回溯)').not.toBeNull()

      // ---- 挂接仅存在于工作台自有状态:全程 forge 树哈希不变。----------------
      assertTreesIdentical('双挂接+结束+查看全程 forge 树', forgeTreeBefore, hashTree(join(project.codeRoot, 'docs')))

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
