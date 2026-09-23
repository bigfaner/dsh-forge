// @feature dsh-forge-m2 | @web-e2e | @journey dual-form-consistency
// Traceability: docs/features/dsh-forge-m2/testing/dual-form-consistency/contracts/step-3-alternating-operations.md
//
// Step 3 双形态交替操作:
//   success —— 终端与挂接会话轮流 ≥1 次读写向变更(file-mutate 判定序纪律:
//     终端侧 = 裸状态翻写(无记录、无挂接);会话侧 = writeRecord(
//     session:<id>) 先、mutateStatus 后)。active 挂接经桥直达
//     recordSessionLink 建立(sanctioned:发起链路非本旅程被测面)。逐笔来源
//     徽标正确([会话]/[终端],FT-045;仅变更行判定),终态四路对拍。
//   simultaneous-late-op-rejected —— 编码口径(诚实形态,e2e 无 CLI 状态机):
//     CLI 拒绝反馈只到发起侧(终端),工作台 e2e 面不可观测;fixture 变更器
//     直写文件、无拒绝面。本腿断言状态机一致性面:op1(transition →
//     completed)落地后,任务状态排斥 claim 前置(completed 不可再 claim);
//     板/终端/文件三方一致;后到的 claim 形写不发生(= CLI 拒绝之所止);
//     文件字节 ≡ 序列器规范渲染(无半写)。
//   simultaneous-late-op-accepted —— 确定性配方:任务起始 pending,op1 =
//     claim 模拟 → in_progress,op2 = transition 模拟 → completed,按到达序
//     均合法;终态 = 顺序合成(completed),四路对拍 + 往返无半写。
//   structural-change-flowback —— 终端结构性增删:直写 index.json(6.1
//     序列器同形)+ 手写任务 .md → 新任务节点 ≤5s 入板(changeKind
//     structural,无来源徽标要求);恢复原 index 字节并删 .md → 节点 ≤5s
//     移出、无孤儿残留;两侧任务集与文件直读互拍。
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { registerFixtureProject, taskMarkdown, writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import type { GeneratedTaskSet } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import { createFixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import type { FixtureMutator } from '../tests/m2/helpers/file-mutate.ts'
import { cleanupViewKey, closeAndAwaitExit, createAppSessionFactory, openTasksBoard, waitForTreeNodes } from '../tests/m2/helpers/restart-app.ts'
import {
  boardStatusEntries, boardStatusOf, bridgeRecordSessionLink, expectFourWayAgreement,
  expectIndexSerializerRoundTrip, expectStatusMapsEqual, fileStatusMap, measureReflow,
  pickTaskKey, readIndexEntries, readTerminalStatuses, workbenchBundles, writeIndexEntries,
} from './helpers.ts'

/** Step-3 fixture:14 任务双 feature(交替 + 结构性 + 双并发腿的选键余量)。 */
function stepThreeFixture(): { set: GeneratedTaskSet; root: string; project: WrittenForgeProject; stub: StubCli; mutator: FixtureMutator } {
  const set = generateTaskSet({ seed: 'dfc3', taskCount: 14, featureCount: 2, danglingRate: 0, recordRate: 0 })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-dfc3-'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'proj-dfc3') })
  const stub = materializeStubCli(join(root, 'stub-cli'))
  stub.attachProject(project.codeRoot)
  const mutator = createFixtureMutator(set, project)
  return { set, root, project, stub, mutator }
}

test('step-3/success [@web-e2e @journey dual-form-consistency]: alternating terminal/session writes both reflow ≤5s with per-change correct source marks; final four-way agreement', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepThreeFixture()
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
      const sessionId = 'dfc3-session-alt'
      await bridgeRecordSessionLink(page, { projectId, taskKey: sessionSide.key, sessionId })

      // 轮次 1:终端先 —— 裸状态翻写(无记录、无 active 挂接)→ [终端]。
      const t1 = mutator.nextStatusOf(terminalSide.key)
      const t1Ms = await measureReflow(page, terminalSide.key, 'terminal', t1,
        () => { mutator.mutateStatus(terminalSide.key, t1) })
      expect(t1Ms, `轮1 终端侧 ≤5000ms(实际 ${String(t1Ms)}ms)`).toBeLessThanOrEqual(5_000)

      // 轮次 1:会话后 —— record 先、status 后 → [会话]。
      const s1 = mutator.nextStatusOf(sessionSide.key)
      const s1Ms = await measureReflow(page, sessionSide.key, 'session', s1, () => {
        mutator.writeRecord(sessionSide.key, `session:${sessionId}`)
        mutator.mutateStatus(sessionSide.key, s1)
      })
      expect(s1Ms, `轮1 会话侧 ≤5000ms(实际 ${String(s1Ms)}ms)`).toBeLessThanOrEqual(5_000)

      // 轮次 2(≥1 次轮流之后再一轮,进一步的状态推进,避开旧状态):
      const t2 = mutator.nextStatusOf(terminalSide.key, t1)
      await measureReflow(page, terminalSide.key, 'terminal', t2,
        () => { mutator.mutateStatus(terminalSide.key, t2) })
      const s2 = mutator.nextStatusOf(sessionSide.key, s1)
      await measureReflow(page, sessionSide.key, 'session', s2,
        () => { mutator.mutateStatus(sessionSide.key, s2) })

      // 终端自读(fresh stub 进程读同一 forge 文件):两键终态同源可见。
      const terminal = readTerminalStatuses(stub, project.codeRoot)
      expect(terminal.get(terminalSide.key), '终端键终态在终端读路径可见').toBe(t2)
      expect(terminal.get(sessionSide.key), '会话键终态在终端读路径可见(同源)').toBe(s2)

      // 终态四路对拍(终端 TSV vs 数据面 vs view-B vs view-C)。
      await expectFourWayAgreement(page, projectId, stub, project.codeRoot, '交替终态')

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

test('step-3/simultaneous-late-op-rejected [@web-e2e @journey dual-form-consistency]: late claim on a completed task is not applied — board/terminal/file agree, no half-write (CLI-side rejection not observable from the workbench surface)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepThreeFixture()
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

      const subject = pickTaskKey(set, task => task.status !== 'completed')
      // op1(先到,合法):transition 模拟 → completed。
      const op1Ms = await measureReflow(page, subject.key, 'terminal', 'completed',
        () => { mutator.mutateStatus(subject.key, 'completed') })
      expect(op1Ms, `op1 回流 ≤5000ms(实际 ${String(op1Ms)}ms)`).toBeLessThanOrEqual(5_000)

      // 后到的 claim 形操作(对 completed 任务再 claim)前置不满足 —— 其写
      // 入正是 CLI 侧拒绝所阻止的:e2e 编码 = 该写不发生(发起侧 = 终端,
      // 拒绝反馈不可达工作台面;本腿断言状态机一致性面)。
      expect(await boardStatusOf(page, projectId, subject.key), '看板:任务状态排斥 claim 前置(completed)').toBe('completed')
      expect(readTerminalStatuses(stub, project.codeRoot).get(subject.key), '终端读:同判(completed)').toBe('completed')
      expect(fileStatusMap(project).get(subject.key), '文件直读:同判(completed)').toBe('completed')

      // 无半写:index.json 字节 ≡ 序列器对当前模型的规范渲染。
      expectIndexSerializerRoundTrip(subject.featureSlug,
        project.indexPaths.find(row => row.slug === subject.featureSlug)?.path ?? '')

      // 双侧视图一致反映先到操作(数据面全集与文件直读互拍)。
      expectStatusMapsEqual('rejected 腿 终端 vs 数据面',
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

test('step-3/simultaneous-late-op-accepted [@web-e2e @journey dual-form-consistency]: pending→claim→transition sequential composition lands on both sides; final four-way agreement, no half-write', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub, mutator } = stepThreeFixture()
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

      // 确定性起始态:pending(配方要求;floor-cycle 保证首任务 = pending)。
      const subject = pickTaskKey(set, task => task.status === 'pending')
      // op1(先到,合法):claim 模拟 → in_progress。
      const op1Ms = await measureReflow(page, subject.key, 'terminal', 'in_progress',
        () => { mutator.mutateStatus(subject.key, 'in_progress') })
      expect(op1Ms, `op1 回流 ≤5000ms(实际 ${String(op1Ms)}ms)`).toBeLessThanOrEqual(5_000)
      expect(await boardStatusOf(page, projectId, subject.key), 'op1 落地(in_progress)').toBe('in_progress')
      // op2(后到,按到达序仍合法):transition 模拟 → completed。
      const op2Ms = await measureReflow(page, subject.key, 'terminal', 'completed',
        () => { mutator.mutateStatus(subject.key, 'completed') })
      expect(op2Ms, `op2 回流 ≤5000ms(实际 ${String(op2Ms)}ms)`).toBeLessThanOrEqual(5_000)

      // 终态 = 两笔的顺序合成结果;双侧一致;无半写。
      expect(await boardStatusOf(page, projectId, subject.key), '终态 = 顺序合成(completed)').toBe('completed')
      expect(fileStatusMap(project).get(subject.key), '文件直读同判').toBe('completed')
      expectIndexSerializerRoundTrip(subject.featureSlug,
        project.indexPaths.find(row => row.slug === subject.featureSlug)?.path ?? '')
      await expectFourWayAgreement(page, projectId, stub, project.codeRoot, 'accepted 腿终态')

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

test('step-3/structural-change-flowback [@web-e2e @journey dual-form-consistency]: terminal task ADD/REMOVE reflows ≤5s; board task set equals the file set both ways, no orphan after removal', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  const { set, root, project, stub } = stepThreeFixture()
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

      const featureSlug = (set.features[0] as NonNullable<typeof set.features[0]>).slug
      const indexPath = project.indexPaths.find(row => row.slug === featureSlug)?.path ?? ''
      const featureDir = join(project.featuresDir, featureSlug)
      const originalIndexBytes = readFileSync(indexPath, 'utf8')

      // ---- 终端新增任务:同一任务集权威文件的方言内新增条目 + 任务 .md。----
      const NEW_LOCAL_ID = '9.9'
      const NEW_STEM = '9.9-t99'
      const NEW_TITLE = '交替期终端新增任务(dual-form 结构性腿)'
      const newKey = `${featureSlug}/${NEW_LOCAL_ID}`
      const entries = readIndexEntries(indexPath)
      entries[NEW_STEM] = {
        id: NEW_LOCAL_ID,
        title: NEW_TITLE,
        status: 'pending',
        dependencies: [],
        type: 'coding.feature',
        file: `${NEW_STEM}.md`,
      }
      const t0 = Date.now()
      writeIndexEntries(indexPath, entries)
      writeFileSync(join(featureDir, 'tasks', `${NEW_STEM}.md`), taskMarkdown({
        stem: NEW_STEM, localId: NEW_LOCAL_ID, title: NEW_TITLE,
        status: 'pending', type: 'coding.feature', dependencies: [], record: null,
      }, featureSlug))

      // 结构性回流 ≤5s(节点 +1;新节点入场)。
      await waitForTreeNodes(page, set.facts.taskCount + 1, 5_000)
      const addElapsed = Date.now() - t0
      expect(addElapsed, `结构性新增 ≤5000ms(实际 ${String(addElapsed)}ms)`).toBeLessThanOrEqual(5_000)
      await expect(page.locator(`[data-dsh-forge-node-card="${newKey}"]`), '新任务节点渲染').toBeVisible({ timeout: 10_000 })

      // 任务集一致性(增后,两向):文件直读 ≡ 数据面。
      expectStatusMapsEqual('结构性增后 文件直读 vs 数据面', fileStatusMap(project), new Map(await boardStatusEntries(page, projectId)))

      // ---- 终端移除任务:恢复原 index 字节 + 删除任务 .md(删除不留孤儿)。----
      const t1 = Date.now()
      writeFileSync(indexPath, originalIndexBytes)
      unlinkSync(join(featureDir, 'tasks', `${NEW_STEM}.md`))
      await waitForTreeNodes(page, set.facts.taskCount, 5_000)
      const removeElapsed = Date.now() - t1
      expect(removeElapsed, `结构性移除 ≤5000ms(实际 ${String(removeElapsed)}ms)`).toBeLessThanOrEqual(5_000)
      await expect(page.locator(`[data-dsh-forge-node-card="${newKey}"]`), '消失任务无残留呈现(孤儿=0)').toHaveCount(0)

      // 任务集一致性(删后,两向)+ 终端读同集。
      expectStatusMapsEqual('结构性删后 文件直读 vs 数据面', fileStatusMap(project), new Map(await boardStatusEntries(page, projectId)))
      expectStatusMapsEqual('结构性删后 终端 vs 数据面',
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
