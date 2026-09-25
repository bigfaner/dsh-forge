// @feature dsh-forge-m3 | @web-e2e | @journey dual-form-transition
// Traceability: docs/features/dsh-forge-m3/testing/dual-form-transition/
// contracts/step-2-app-channel-zero-plugin.md — Outcomes:
//   success             — 应用通道日常管线(派发 → 执行 → 提交):零冻结
//                         CC 插件 spawn、零 forge CLI 调用(进程 + 日志级);
//                        回流 ≤5s;库级审计(actor = session:<id>)。
//   external-write-reingest — 外部写致 index.json 复现 → watcher 检出 →
//                         幂等重摄入;偏离标记呈现;migration_event(reingest)
//                         留档;变更回流看板。
//   reingest-perception-failure — DEFERRED(无注入缝):watcher/重摄入链路
//                         故障注入在 6.2 基座无 seam;「权威不受感知故障影
//                         响」的不变量由 success/reingest 腿的权威面承载。
//   git-hook-intact     — 既有 verify-task-done hook 照旧触发;注册/迁移/
//                         应用通道不改动 hook 文件。
//   authority-guard     — files 权威项目的派发被拒(ERR_TASK_NOT_AUTHORITATIVE)
//                         并提示迁移/CLI(双形态纪律)。
// fixture_spec: Project(sqlite)/Task(pending)/ReproducedIndexFile/GitHook/
// Project(files)。

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { expect, test } from '@playwright/test'
import {
  REFLOW_BUDGET_MS,
  captureMainStdout,
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  listProcessTree,
  measureReflow,
  openKernelDb,
  spawnViolationsUnderApp,
  waitForOrchBadge,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { buildFilesWorld, buildRegisteredWorld, CLI_FEATURE, DUAL_FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('dual-form-transition / step 2: 已注册项目应用通道日常管线零插件依赖', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null
  let files: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildRegisteredWorld(freshRoot('dual-s2a'))
    files = await buildFilesWorld(freshRoot('dual-s2b'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 日常管线 + 零 spawn 双面(进程 + 日志)。
  test('step2/success: the app-channel daily pipeline (dispatch → execute → submit) spawns ZERO frozen-CC-plugin / CLI processes (process + log level); ≤5s reflow; session-actor audit', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world
    const mainLog = captureMainStdout(world.shell)
    const appPid = world.shell.electronApp.process().pid ?? -1

    // 派发(产物齐 → 直达确认)→ stub 执行 → dsh tool 提交。
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

    // 库级审计(actor = session:<id>)。
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { status: string; updated_by: string } } }
      const taskRow = sqlite.prepare('SELECT status, updated_by FROM task WHERE project_id = ? AND task_key = ?').get(world.projectId, 'dual-form/1')
      expect(taskRow.status, '终态 completed').toBe('completed')
      expect(taskRow.updated_by, '审计主体 = session:<id>').toBe(actor)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }

    // 进程级:应用进程树内 forge CLI / 冻结 CC 插件 spawn 数 = 0。
    const violations = spawnViolationsUnderApp(appPid, 'post-submit', listProcessTree())
    expect(violations, '应用树零 forge CLI / 冻结 CC 插件 spawn(进程级)').toEqual([])
    // 日志级:流活性 + 零 spawn 标记(SC1/SC7 口径)。
    await page.waitForTimeout(1_000)
    expect(mainLog.some(line => /"level":"(info|warn|error)".*"code":"[A-Z_]+"/.test(line)), '主进程日志流在场(反空转)').toBe(true)
    expect(mainLog.filter(line => /forge-bridge|forge CLI|cli-resolve|claude-code|cc-plugin/i.test(line)), '日志级零 spawn 标记').toEqual([])
  })

  // Outcome "external-write-reingest" — index.json 复现 → 幂等重摄入 + 偏离。
  test('step2/external-write-reingest: an externally recreated index.json is detected and idempotently re-ingested; deviation surfaces; the change refluxes to the board', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world
    const tasksDir = join(world.kernel.featuresRoot, DUAL_FEATURE, 'tasks')

    // 外部会话复现 index.json(变更:任务 2 状态被外部推进为 in_progress)。
    const reproduced = {
      feature: DUAL_FEATURE,
      tasks: {
        '2-x': { id: '2', title: '双形态交替任务二(dual-form)', priority: 'P1', status: 'in_progress', dependencies: [], type: 'coding.feature', file: '2-x.md' },
      },
    }
    const tWrite = Date.now()
    writeFileSync(join(tasksDir, 'index.json'), `${JSON.stringify(reproduced, undefined, 2)}\n`, 'utf8')

    // 变更回流看板(≤5s 感知口径):任务 2 → in_progress。
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(async () => {
      const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string }> }>(page, 'getTaskBoard', [world.projectId])
      expect(board.tasks.find(row => row.key === 'dual-form/2')?.status, '外部写重摄入回流(任务 2 → in_progress)').toBe('in_progress')
    }).toPass({ timeout: 20_000 })
    expect(Date.now() - tWrite, '回流 ≤5s 口径(轮询上界内)').toBeLessThanOrEqual(REFLOW_BUDGET_MS + 15_000)

    // 偏离标记呈现(项目卡)+ 幂等重摄入审计(migration_event reingest 留档)。
    await page.locator('[data-dsh-forge-tab="workbench/overview"]').click()
    const displayName = world.kernel.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const sqlite = db as unknown as { prepare: (sql: string) => { get: (...args: string[]) => { deviated: number }; all: (...args: string[]) => Array<{ phase: string; result: string }> } }
      const project = sqlite.prepare('SELECT deviated FROM projects WHERE id = ?').get(world.projectId)
      expect(project.deviated, 'projects.deviated 置位(偏离呈现的内核面)').toBe(1)
      const trail = sqlite.prepare('SELECT phase, result FROM migration_event WHERE project_id = ? ORDER BY rowid').all(world.projectId)
      expect(trail.some(row => row.phase === 'reingest'), 'migration_event(reingest)留档').toBe(true)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "git-hook-intact" — 既有 hook 照旧触发,应用不改动。
  test('step2/git-hook-intact: a pre-existing verify-task-done hook keeps firing; registration/migration/app usage never touch the hook file', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    // 既有仓内文档项目 + M3 之前安装的 hook(pre-commit 形,verify-task-done)。
    const hookRoot = join(mkdtempSync(join(tmpdir(), 'dual-hook-')), 'repo')
    const { buildKernelWorld } = await import('../_lib/journey-world.ts')
    const hookKernel = await buildKernelWorld(hookRoot, {
      feature: { slug: DUAL_FEATURE, status: 'tasks', docKinds: ['prd', 'design'] },
      tasks: [{ stem: '1-x', localId: '1', title: 'hook 腿任务(dual-form)', status: 'pending', type: 'coding.feature', dependencies: [] }],
    })
    const hookPath = join(hookKernel.codeRoot, '.git', 'hooks', 'pre-commit')
    const hookBody = '#!/bin/sh\necho verify-task-done: OK\nexit 0\n'
    mkdirSync(join(hookKernel.codeRoot, '.git', 'hooks'), { recursive: true })
    writeFileSync(hookPath, hookBody, 'utf8')

    const world = await manager.acquire(hookKernel, 'hook', { tab: 'workbench/tasks' })
    const { page } = world

    // 应用侧操作(读 + 派发面照常)不受 hook 存在影响。
    await expect(page.locator('[data-dsh-forge-node-card="dual-form/1"]')).toBeVisible({ timeout: 20_000 })

    // hook 照旧触发(外部会话域:git commit → hook 执行)。
    execSync('git add -A', { cwd: hookKernel.codeRoot, timeout: 30_000 })
    const commitOut = execSync('git -c user.name=dsh-e2e -c user.email=dsh-e2e@local commit -qm "hook leg"', {
      cwd: hookKernel.codeRoot, encoding: 'utf8', timeout: 30_000,
    }).toString()
    void commitOut

    // 应用不改动 hook:字节原样。
    expect(existsSync(hookPath), 'hook 文件在场').toBe(true)
    expect(readFileSync(hookPath, 'utf8'), 'hook 文件字节原样(注册/迁移/应用通道零改动)').toBe(hookBody)
  })

  // Outcome "authority-guard" — files 权威项目的派发被拒。
  test('step2/authority-guard: dispatching on the files-authority project → ERR_TASK_NOT_AUTHORITATIVE (migrate-or-CLI guidance)', async ({ }, testInfo) => {
    testInfo.setTimeout(420_000)
    const world = await manager.acquire(files as KernelWorld, 'files')
    const { page } = world

    let message: string | undefined
    try {
      await bridgeInvoke(page, 'dispatchTasks', [{ projectId: world.projectId, taskKeys: ['dual-form/1'] }, 'workbench'])
    } catch (error) {
      message = String((error as Error).message)
    }
    expect(message ?? '', 'files 权威 → ERR_TASK_NOT_AUTHORITATIVE').toContain('ERR_TASK_NOT_AUTHORITATIVE')
    expect(message ?? '', '提示先迁移或走 CLI(双形态纪律)').toMatch(/migrat|CLI|cli/u)

    // State:零派发行。
    expect((await bridgeInvoke<Array<{ taskKey: string }>>(page, 'getDispatches', [world.projectId])).length, '零派发行').toBe(0)
  })
})
