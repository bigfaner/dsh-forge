// @feature dsh-forge-m3 | @web-e2e | @journey dual-form-transition
// Journey smoke test — the app-channel daily pipeline END TO END with the
// unregistered CLI world beside it (happy-path Outcomes only):
//   Step 2 face — dispatch → execute (stub) → dsh-tool claim/submit, ≤5s
//   reflow, session-actor audit, ZERO frozen-CC-plugin/CLI spawns (process +
//   log level);
//   Step 1/3 face — the unregistered project's CLI runs unaffected beside the
//   live app (app-invisibility + non-interference).
// Traceability: docs/features/dsh-forge-m3/testing/dual-form-transition/
// journey.md (Happy Path Steps 1-3) + contracts success faces.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  REFLOW_BUDGET_MS,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  listProcessTree,
  measureReflow,
  normPath,
  openKernelDb,
  resolveForgeCli,
  runForgeCli,
  snapshotTree,
  spawnViolationsUnderApp,
  waitForOrchBadge,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { buildRegisteredWorld, buildUnregisteredCliCorpus, CLI_BASE_ID, CLI_BASE_TITLE, cliIndexTasks, writeCliRecordData } from './harness.ts'
// [M4 1.8 e2e 迁移·迁移清单 第②⑥行 · 看板派发链(发起链断言不变,随看板新宿主恢复)] 本测试功能面锚定 1.7 已退役的旧视图宿主,
// P2 右栏 pane / 概览子 tab(2.1–2.4)落座后按新宿主恢复,2.10 全量复跑收口。
// 断言本体零删改(零功能删除断言 Hard Rule)—— test.fixme 仅为过渡期挂起。

test.fixme('smoke/dual-form-transition: 应用通道日常管线(零 spawn 双面 + 审计 + ≤5s 回流)与未注册 CLI 世界并存互不破坏', async ({ }, testInfo) => {
  testInfo.setTimeout(900_000)
  const manager = new WorldManager()
  const kernel = await buildRegisteredWorld(freshRoot('dual-smoke'))
  const forgeExe = resolveForgeCli()
  const cli = buildUnregisteredCliCorpus(join(mkdtempSync(join(tmpdir(), 'dual-cli-smoke-')), 'cli-repo')
  )
  const cliTreeBefore = snapshotTree(cli.codeRoot)
  try {
    const world = await manager.acquire(kernel, 'main')
    const { page } = world
    // boot 期挂接的捕获(活性窗口完整;晚期挂接 = 死流,零标记断言空转)。
    const mainLog = world.mainLog
    const appPid = world.shell.electronApp.process().pid ?? -1

    // ---- 应用通道日常管线(Step 2 face)-------------------------------
    await dispatchFromBoard(page, ['dual-form/1'])
    await waitForOrchBadge(page, 'dual-form/1', 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === 'dual-form/1')
    const actor = `session:${row?.sessionId as string}`
    const claimMs = await measureReflow(page, 'dual-form/1', 'in_progress', async () => {
      await bridgeInvoke(page, 'taskClaim', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, actor])
    })
    expect(claimMs, `claim 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)
    const submitMs = await measureReflow(page, 'dual-form/1', 'completed', async () => {
      await bridgeInvoke(page, 'taskSubmit', [{ projectId: world.projectId, taskKey: 'dual-form/1' }, actor])
    })
    expect(submitMs, `submit 回流 ≤${String(REFLOW_BUDGET_MS)}ms`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    const db = await openKernelDb(kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } }
      const taskRow = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, 'dual-form/1')
      expect(taskRow.status, '终态 completed').toBe('completed')
      expect(taskRow.updated_by, '审计主体 = session:<id>').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }

    // 零 spawn 双面(进程 + 日志)。
    expect(spawnViolationsUnderApp(appPid, 'post-submit', listProcessTree()), '应用树零 CLI/CC 插件 spawn(进程级)').toEqual([])
    await page.waitForTimeout(1_000)
    expect(mainLog.filter(line => /forge-bridge|forge CLI|cli-resolve|claude-code|cc-plugin/i.test(line)), '日志级零 spawn 标记').toEqual([])

    // ---- 未注册 CLI 世界并存(Step 1/3 face)-------------------------
    const listOut = runForgeCli(forgeExe, ['task', 'list', '--local'], cli.codeRoot)
    expect(listOut.status, 'CLI 照常(并存互不破坏)').toBe(0)
    expect(listOut.stdout, 'CLI 任务视图 = 仓内 forge 文件').toContain(CLI_BASE_TITLE)
    // 真 CLI 口径:claim = 领取下一个可领任务(无位置参数;语料仅任务 1 可领,
    // 确定性命中);submit = <id> + --data 记录文件(summary 硬必填)。
    runForgeCli(forgeExe, ['task', 'claim'], cli.codeRoot)
    runForgeCli(forgeExe, ['task', 'submit', CLI_BASE_ID, '--data', writeCliRecordData(cli.codeRoot, CLI_BASE_ID)], cli.codeRoot)
    expect(cliIndexTasks(cli.indexPath).get(CLI_BASE_ID)?.status, 'CLI 推进至终态').toBe('completed')
    expect(snapshotTree(cli.codeRoot).get('docs/features/dual-cli-unregistered/tasks/index.json'),
      'CLI 权威文件按其自身语义演进(add/claim/submit 写入)').not.toBe(cliTreeBefore.get('docs/features/dual-cli-unregistered/tasks/index.json'))

    // 应用不可见未注册项目(Invariant)。
    const state = await bridgeInvoke<{ projects: Array<{ codeRoot: string }> }>(page, 'getState', [])
    expect(state.projects.some(candidate => normPath(candidate.codeRoot) === normPath(cli.codeRoot)), '未注册项目不经注册').toBe(false)
    expect(world.shell.pageErrors, `renderer pageerrors: ${world.shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await manager.closeAll()
  }
})
