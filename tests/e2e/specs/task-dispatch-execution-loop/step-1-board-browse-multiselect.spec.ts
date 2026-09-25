// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-1-board-browse-multiselect.md — one test per Outcome:
//   success                       — browse + multi-select 3, entry available,
//                                   board = kernel parity (deep);
//   deps-unmet-selection-blocked  — the deps-unmet task's checkbox disabled
//                                   with the blocker tooltip; zero dispatch;
//   no-dispatchable-idle          — after every dispatchable task is claimed
//                                   the toolbar entry disables with guidance.
// fixture_spec: Project(sqlite)/Feature/Task×3 pending zero-dep (+ the
// deps-unmet and non-dispatchable occupants beyond min_count) — served by
// harness.buildMainWorld (real kernel chain).
// Isolation: this file owns its world (fresh root in beforeAll; the manager
// tears everything down in afterAll; serial order within the file).

import { expect, test } from '@playwright/test'
import { freshRoot, REFLOW_BUDGET_MS, measureReflow, WorldManager, bridgeInvoke, getDispatchRows } from '../_lib/journey-world.ts'
import { buildMainWorld, TASK_0, TASK_1, TASK_2, TASK_3, TASK_4, TASK_5, FEATURE } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

test.describe.serial('task-dispatch-execution-loop / step 1: 看板浏览并多选无依赖任务', () => {
  const manager = new WorldManager()
  let root = ''
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    root = freshRoot('disp-loop-s1')
    kernel = await buildMainWorld(root)
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 可派发集只含依赖满足+状态允许任务;选择会话期内存;板 = 内核。
  test('step1/success: browse the board, multi-select 3 zero-dep tasks; board rows match the kernel (count/status/deps parity)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 板呈现:任务卡齐(3 个可派发 + 占用 + 依赖未满足 + 备用)。
    for (const key of [TASK_0, TASK_1, TASK_2, TASK_3, TASK_4, TASK_5]) {
      await expect(page.locator(`[data-dsh-forge-node-card="${key}"]`)).toBeVisible({ timeout: 20_000 })
    }

    // 多选:进入选择模式 → 勾选 3 个无依赖任务 → 待派发态(派发入口可用)。
    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
    for (const key of [TASK_1, TASK_2, TASK_3]) {
      const checkbox = page.locator(`[data-dsh-forge-select-chk="${key}"] [data-dsh-forge-select-chk-input]`)
      await checkbox.check()
      await expect(checkbox).toBeChecked()
    }
    await expect(page.locator('[data-dsh-forge-dispatch-go]'), '已选 3 任务 → 派发入口可用').toBeEnabled()

    // State(选择 = 会话期内存态,零内核写):派发行零、任务状态零变。
    expect(await getDispatchRows(page, world.projectId), '选择不落任何派发行').toHaveLength(0)
    const board = await bridgeInvoke<{ tasks: Array<{ key: string; status: string; blockers: string[] }> }>(page, 'getTaskBoard', [world.projectId])
    const byKey = new Map(board.tasks.map(row => [row.key, row]))
    for (const task of (kernel as KernelWorld).set.features[0]?.tasks ?? []) {
      const key = `${FEATURE}/${task.localId}`
      const row = byKey.get(key)
      expect(row, `板行在场:${key}`).toBeDefined()
      expect(row?.status, `${key} 板状态 = 语料基线(派生快照零漂移)`).toBe(task.status)
      expect(JSON.stringify(row?.blockers ?? []), `${key} 依赖与内核一致`).toBe(JSON.stringify([...task.dependencies]))
    }

    // 退出选择模式(Esc)→ 零残留。
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toHaveCount(0, { timeout: 10_000 })
  })

  // Outcome "deps-unmet-selection-blocked" — 全批前置校验:依赖未满足不可选,零派发。
  test('step1/deps-unmet-selection-blocked: the deps-unmet task cannot enter the selection (disabled + blocker tooltip); zero subagents started', async ({ }, testInfo) => {
    testInfo.setTimeout(180_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    await page.locator('[data-dsh-forge-dispatch-entry]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })

    // 依赖未满足任务(TASK_4,blocker = TASK_0 未终态):勾选控件禁用 + 依赖提示。
    const disabledWrap = page.locator(`[data-dsh-forge-select-chk="${TASK_4}"]`)
    await expect(disabledWrap.locator('[data-dsh-forge-select-chk-input]'), '依赖未满足 → 勾选禁用(阻止入口)').toBeDisabled()
    // 禁用缘由 tooltip 落在 input 上(wrap 无 title;aria-label=任务标题)。
    const title = await disabledWrap.locator('[data-dsh-forge-select-chk-input]').getAttribute('title')
    expect(title ?? '', '依赖提示原词(存在未完成依赖)').toContain('依赖')

    // State:零派发行、零 journal 行(不启动任何 subagent)。
    expect(await getDispatchRows(page, world.projectId), '阻止 = 零派发行').toHaveLength(0)
    expect(world.stub?.readJournal() ?? [], '零 subagent 启动(journal 空)').toHaveLength(0)

    // 退出选择面(勾一条可派发唤出浮条后取消;后续 idle 腿断言选择层缺席)。
    await page.locator(`[data-dsh-forge-select-chk="${TASK_1}"] [data-dsh-forge-select-chk-input]`).check()
    await page.locator('[data-dsh-forge-dispatch-cancel]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toHaveCount(0, { timeout: 10_000 })
    await page.keyboard.press('Escape')
  })

  // Outcome "no-dispatchable-idle" — 无可派发任务 → 入口禁用 + 引导,无可点选路径。
  test('step1/no-dispatchable-idle: with every dispatchable task claimed the dispatch entry disables with guidance and no selection path exists', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page } = world

    // 消耗全部可派发任务:领取 2/3/5 直连,领取 1 经 measureReflow(顺带钉
    // ≤5s 回流预算;TASK_0 已 in_progress;TASK_4 依赖 0 未终态恒不可派发)。
    for (const key of [TASK_2, TASK_3, TASK_5]) {
      const claimed = await bridgeInvoke<{ status: string }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: key }, 'session:disp-loop-idle'])
      expect(claimed.status, `${key} 领取 → in_progress`).toBe('in_progress')
    }
    const claimMs = await measureReflow(page, TASK_1, 'in_progress', async () => {
      const claimed = await bridgeInvoke<{ status: string }>(page, 'taskClaim', [{ projectId: world.projectId, taskKey: TASK_1 }, 'session:disp-loop-idle-1'])
      expect(claimed.status).toBe('in_progress')
    })
    expect(claimMs, `claim 回流 ≤${String(REFLOW_BUDGET_MS)}ms(感知链健康口径)`).toBeLessThanOrEqual(REFLOW_BUDGET_MS)

    // idle 态:派发入口禁用 + 引导说明 tooltip。
    const entry = page.locator('[data-dsh-forge-dispatch-entry]')
    await expect(entry, '无可派发任务 → 入口禁用').toBeDisabled({ timeout: 20_000 })
    await expect(entry, '引导说明(title tooltip)').toHaveAttribute('title', /.+/)

    // 不存在可点选的派发路径:禁用入口点击后选择模式不进入。
    await entry.click({ force: true }).catch(() => {})
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'), '禁用入口无可点选路径').toHaveCount(0)
    expect(REFLOW_BUDGET_MS, 'REFLOW_BUDGET_MS 引用保持(预算常量不放宽)').toBeGreaterThan(0)
  })
})
