// @feature dsh-forge-m3 | @web-e2e | @journey dual-form-transition
// Traceability: docs/features/dsh-forge-m3/testing/dual-form-transition/
// contracts/step-3-alternating-interop.md — Outcomes:
//   success             — 两轮交替(先终端后应用 / 反序)后双方数据与行为
//                         互不破坏;已注册侧看板 = 内核权威表;未注册侧
//                         = CLI 权威文件;无跨项目串扰。
//   in-flight-coexistence — 两项目各存在在途变更时的交替提交:各自全集
//                         一致、无交叉污染(单写者纪律)。
//   channel-unavailable-asymmetric — 已注册侧通道异常(create 注错面,SC3
//                         口径)→ failed + 恢复;未注册侧 CLI 形态完全不受
//                         影响。
//   cross-project-isolation — 终局核查:两数据域无一行/一文件互相渗入。
// fixture_spec: UnregisteredForgeProject + Project(sqlite)/Task ×2。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  normPath,
  openKernelDb,
  resolveForgeCli,
  runForgeCli,
  snapshotTree,
  waitForOrchBadge,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { buildRegisteredWorld, buildUnregisteredCliCorpus, CLI_BASE_ID, CLI_BASE_TITLE, cliIndexTasks, writeCliRecordData } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('dual-form-transition / step 3: 双形态交替互不破坏', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let forgeExe = ''
  let cli: { codeRoot: string; indexPath: string } | null = null

  test.beforeAll(async () => {
    kernel = await buildRegisteredWorld(freshRoot('dual-s3'))
    forgeExe = resolveForgeCli()
    cli = buildUnregisteredCliCorpus(join(mkdtempSync(join(tmpdir(), 'dual-cli-s3-')), 'cli-repo'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 两轮交替(终端→应用,应用→终端)。
  // [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
  test.fixme('step3/success: two alternating rounds (terminal→app, then app→terminal) leave both worlds intact — board = kernel rows on the registered side, CLI files on the unregistered side', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // ---- 第 1 轮:先终端(未注册任务 1 推进至提交)--------------------
    runForgeCli(forgeExe, ['task', 'add', '--title', '交替第 1 轮 CLI 任务', '--type', 'doc', '--id', '7', '--description', 'round 1 cli'], (cli as { codeRoot: string }).codeRoot)
    // 真 CLI 口径:claim 无位置参数,领取下一个可领任务(任务 1/7 同深度
    // 同优先级,ID 语义序 1 < 7 → 第 1 轮确定性命中基础任务,与步注释一致)。
    runForgeCli(forgeExe, ['task', 'claim'], (cli as { codeRoot: string }).codeRoot)
    runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData((cli as { codeRoot: string }).codeRoot, CLI_BASE_ID)], (cli as { codeRoot: string }).codeRoot)
    expect(cliIndexTasks((cli as { indexPath: string }).indexPath).get(CLI_BASE_ID)?.status, '第 1 轮 CLI:任务 1 → completed').toBe('completed')

    // ---- 第 1 轮:后应用(任务 1 推进至提交)--------------------------
    await dispatchFromBoard(page, ['dual-form/1'])
    await waitForOrchBadge(page, 'dual-form/1', 'running', 20_000)
    const row1 = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === 'dual-form/1')
    await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, `session:${row1?.sessionId as string}`])
    await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, `session:${row1?.sessionId as string}`])

    // ---- 第 2 轮:反序(先应用,后终端)--------------------------------
    await dispatchFromBoard(page, ['dual-form/2'])
    await waitForOrchBadge(page, 'dual-form/2', 'running', 20_000)
    const row2 = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === 'dual-form/2')
    await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: 'dual-form/2' }, `session:${row2?.sessionId as string}`])
    await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: 'dual-form/2' }, `session:${row2?.sessionId as string}`])
    // 第 2 轮终端腿:领取下一个可领任务 = 第 1 轮新增的任务 7(1 已完成)。
    runForgeCli(forgeExe, ['task', 'claim'], (cli as { codeRoot: string }).codeRoot)
    runForgeCli(forgeExe, ['task', 'submit', '7', '--data', writeCliRecordData((cli as { codeRoot: string }).codeRoot, '7')], (cli as { codeRoot: string }).codeRoot)

    // ---- 两轮交替后的双方一致面 --------------------------------------
    // 已注册侧:看板呈现 = 内核权威表(状态对拍)。
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(board.tasks.find(row => row.key === 'dual-form/1')?.status, '已注册:任务 1 completed').toBe('completed')
    expect(board.tasks.find(row => row.key === 'dual-form/2')?.status, '已注册:任务 2 completed').toBe('completed')
    // 未注册侧:CLI 任务视图 = 仓内 forge 文件。
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], (cli as { codeRoot: string }).codeRoot)
    expect(listOut.stdout, '未注册:基础任务在场(CLI 权威文件)').toContain(CLI_BASE_TITLE)
    const cliRows = cliIndexTasks((cli as { indexPath: string }).indexPath)
    expect(cliRows.get(CLI_BASE_ID)?.status, '未注册:基础任务(第 1 轮)completed').toBe('completed')
    expect(cliRows.get('7')?.status, '未注册:第 1 轮新增任务(第 2 轮)completed').toBe('completed')
  })

  // Outcome "cross-project-isolation" — 终局核查(数据域归属)。
  test('step3/cross-project-isolation: the terminal audit — registered tasks live ONLY in the kernel table; unregistered data ONLY in its repo files; zero cross-seepage', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 已注册侧:全部任务行仅存在于内核权威表(且仅该项目域)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { all: (...args: string[]) => Array<{ task_key: string }> } }
      const rows = sqlite.prepare('SELECT task_key FROM task WHERE project_id = ?').all(world.projectId)
      expect(rows.every(row => row.task_key.startsWith('dual-form/')), '内核行全部属已注册 feature 域').toBe(true)
      expect(rows.length, '已注册域行集非空').toBeGreaterThan(0)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }

    // 未注册侧:全部任务数据仅存在于其仓内 forge 文件(零内核渗入)。
    const cliTasks = cliIndexTasks((cli as { indexPath: string }).indexPath)
    expect(cliTasks.size, '未注册域文件集非空').toBeGreaterThan(0)
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    // 注册表行集里不存在未注册仓的代码根(smoke/step1 同口径的路径比对;
    // 生成稿曾误写为对语料路径自身做子串检查 —— 恒真断言,不是注册面)。
    expect(state.projects.some(row => normPath(row.codeRoot) === normPath((cli as { codeRoot: string }).codeRoot)), '未注册仓不经注册(零内核渗入)').toBe(false)
    // 已注册任务的 md 文件不出现在未注册仓(零文件渗入)。
    const cliTree = snapshotTree((cli as { codeRoot: string }).codeRoot)
    expect([...cliTree.keys()].every(rel => !rel.startsWith('docs/features/dual-form/')), '已注册 feature 文档不出现在未注册仓').toBe(true)
  })

  // Outcome "in-flight-coexistence" — 在途变更共存下的交替提交。
  // [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。
  test.fixme('step3/in-flight-coexistence: in-flight changes on BOTH sides commit alternately (CLI first, then app) with zero cross-pollution', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    // 独立世界(在途态干净):CLI 侧新任务在途 + 应用侧任务在途。
    const kernelB = await buildRegisteredWorld(freshRoot('dual-s3b'))
    const cliB = buildUnregisteredCliCorpus(join(mkdtempSync(join(tmpdir(), 'dual-cli-s3b-')), 'cli-repo'))
    const world = await manager.acquire(kernelB, 'inflight')
    const { page } = world

    // 在途:CLI 领取(未提交;真 CLI 无位置参数,语料仅任务 1 可领)+ 应用派发并领取(未提交)。
    runForgeCli(forgeExe, ['task', 'claim'], cliB.codeRoot)
    expect(cliIndexTasks(cliB.indexPath).get(CLI_BASE_ID)?.status, 'CLI 在途(in_progress)').toBe('in_progress')
    await dispatchFromBoard(page, ['dual-form/1'])
    await waitForOrchBadge(page, 'dual-form/1', 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === 'dual-form/1')
    await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, `session:${row?.sessionId as string}`])

    // 交替提交:先终端,再应用。
    runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData(cliB.codeRoot, CLI_BASE_ID)], cliB.codeRoot)
    await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, `session:${row?.sessionId as string}`])

    // 各自任务全集一致、无交叉污染(单写者纪律)。
    expect(cliIndexTasks(cliB.indexPath).get(CLI_BASE_ID)?.status, 'CLI 在途提交 → completed').toBe('completed')
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
    expect(board.tasks.find(candidate => candidate.key === 'dual-form/1')?.status, '应用在途提交 → completed').toBe('completed')
    expect(cliIndexTasks(cliB.indexPath).has('dual-form/1'), '应用任务未渗入 CLI 权威文件').toBe(false)
  })

  // Outcome "channel-unavailable-asymmetric" — 已注册侧失败 + 未注册侧不受影响。
  // [M4 1.8 e2e 迁移·迁移清单 第②行 · M2 看板(workbench/tasks 主视图)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
  // P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
  // 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

  test.fixme('step3/channel-unavailable-asymmetric: the registered side shows failed + recovery while the unregistered CLI keeps working throughout', async ({ }, testInfo) => {
    testInfo.setTimeout(900_000)
    const kernelC = await buildRegisteredWorld(freshRoot('dual-s3c'))
    const cliC = buildUnregisteredCliCorpus(join(mkdtempSync(join(tmpdir(), 'dual-cli-s3c-')), 'cli-repo'))
    const world = await manager.acquire(kernelC, 'asymmetric')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // 已注册侧:通道异常(create 注错)→ failed + 原因。
    stub.writeControl({ create: 'fail', createError: 'dual-form asymmetric channel fault' })
    await dispatchFromBoard(page, ['dual-form/1']).catch(() => {})
    await waitForOrchBadge(page, 'dual-form/1', 'failed', 30_000)
    const failedRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === 'dual-form/1')
    expect(failedRow?.error, '失败原因留档(可辨非静默)').toContain('dual-form asymmetric channel fault')

    // 未注册侧:CLI 形态完全不受影响(同刻照常)。
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], cliC.codeRoot)
    expect(listOut.status, '通道异常期间 CLI 照常(与宿主无耦合)').toBe(0)
    runForgeCli(forgeExe, ['task', 'claim'], cliC.codeRoot)
    runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData(cliC.codeRoot, CLI_BASE_ID)], cliC.codeRoot)
    expect(cliIndexTasks(cliC.indexPath).get(CLI_BASE_ID)?.status, 'CLI 推进不受影响').toBe('completed')

    // 通道恢复:重派发继续;无残留半状态。
    stub.writeControl({})
    await page.locator(`[data-dsh-forge-node-card="dual-form/1"]`).click()
    const orch = page.locator(`[data-dsh-forge-task-detail="dual-form/1"] [data-dsh-forge-orchestration-section]`)
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await orch.locator(`[data-dsh-forge-orch-redispatch="${failedRow?.id}"]`).click()
    const confirm = page.locator('[data-dsh-forge-dialog="redispatch-confirm"]')
    await expect(confirm).toBeVisible({ timeout: 10_000 })
    await confirm.locator('[data-dsh-forge-redispatch-go]').click()
    await waitForOrchBadge(page, 'dual-form/1', 'running', 30_000)
  })
})
