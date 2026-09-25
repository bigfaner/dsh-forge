// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-2-dispatch-artifacts-check.md — one test per Outcome:
//   artifacts-complete     — world `main` (in-progress, matrix satisfied):
//                            派发 → 无警告直达确认(三要素说明);检查为纯读
//                            + 确定性(双调逐字段相等);journal 零行(零模型)。
//   artifacts-missing-warning — world `missing` (design/ absent): 警告对话框 +
//                            缺失清单恰一项(design/file-missing)+ 不阻断说明;
//                            零派发行零 journal。
//   acknowledged-continue  — world `missing` continued: 确认继续 → 确认门 →
//                            派发成功(running 行 + journal prompt 行)。
// fixture_spec: Project(sqlite)/Feature(status per outcome)/Task(pending)/
// StageAsset — served by harness.buildMainWorld / buildMissingWorld.

import { expect, test } from '@playwright/test'
import { freshRoot, startBoardDispatch, waitForOrchBadge, WorldManager, bridgeInvoke, getDispatchRows } from '../_lib/journey-world.ts'
import { buildMainWorld, buildMissingWorld, TASK_1, MISSING_TASK } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'
import type { StageArtifactsReport } from '../../../../apps/desktop/src/main/workbench/ipc/types.ts'

test.describe.serial('task-dispatch-execution-loop / step 2: 发起派发并过阶段产物齐全性检查', () => {
  const manager = new WorldManager()
  let mainRoot = ''
  let main: KernelWorld | null = null
  let missing: KernelWorld | null = null

  test.beforeAll(async () => {
    mainRoot = freshRoot('disp-loop-s2a')
    main = await buildMainWorld(mainRoot)
  })

  test.afterAll(async () => {
    // closeAll tears down every acquired world AND removes its journey root.
    await manager.closeAll()
  })

  // Outcome "artifacts-complete" — 产物齐全 → 无警告直达确认;确定性纯读。
  test('step2/artifacts-complete: artifacts matrix satisfied → no warning, direct confirm dialog; check is deterministic and read-only (zero journal)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(main as KernelWorld, 'main')
    const { page } = world

    await startBoardDispatch(page, TASK_1)

    // 产物齐全 → 无警告,直接进入派发确认(三要素说明呈现)。
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '产物齐全 → 直达确认门').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"]'), '警告门不出现').toHaveCount(0)
    await expect(confirm.locator('[data-dsh-forge-dispatch-confirm-go]'), '确认动作在场(显式确认语义)').toBeVisible()

    // Hard Rule:检查路径零模型调用 —— 裁决已产出而 stub journal 零流量。
    expect(world.stub?.readJournal() ?? [], '检查在场时刻 journal 零行(确定性代码,无模型通道)').toHaveLength(0)

    // 确定性证据:同输入双调逐字段相等 + satisfied=true(missing 空)。
    const reportA = await bridgeInvoke<StageArtifactsReport>(page, 'checkStageArtifacts', [{ projectId: world.projectId, featureSlug: 'disp-loop' }])
    const reportB = await bridgeInvoke<StageArtifactsReport>(page, 'checkStageArtifacts', [{ projectId: world.projectId, featureSlug: 'disp-loop' }])
    expect(reportA, 'checkStageArtifacts 双调逐字段相等(确定性)').toEqual(reportB)
    expect(reportA.satisfied, '累计期望矩阵全满足(in-progress 行含被派发集)').toBe(true)
    expect(reportA.missing, '缺失清单为空').toEqual([])

    // State:检查纯读零写 —— 派发行仍零。
    expect(await getDispatchRows(page, world.projectId), '未确认 → 零派发行').toHaveLength(0)
    // 退出链:先取消确认对话框(其 Esc 只消费对话框层),再点浮条取消退出
    // 选择(已勾 TASK_1 → 浮条在场;零派发)。
    await page.locator('[data-dsh-forge-dispatch-confirm-cancel]').click()
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toHaveCount(0, { timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-cancel]').click()
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toHaveCount(0, { timeout: 10_000 })
  })

  // Outcome "artifacts-missing-warning" — 缺失 → 警告清单(warn 不阻断),零派发。
  test('step2/artifacts-missing-warning: design/ absent → warning dialog with the one-item missing list; zero dispatch rows', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    // The missing-artifacts kernel is built here (its app world replaces the
    // main world's — the manager closes the previous app before booting).
    missing = await buildMissingWorld(freshRoot('disp-loop-s2b'))
    const world = await manager.acquire(missing, 'missing')
    const { page } = world

    await startBoardDispatch(page, MISSING_TASK)

    // 警告对话框在场(而非直达确认)= 缺失清单已呈现,派发未发生。
    const warning = page.locator('[data-dsh-forge-dialog="dispatch-warning"]')
    await expect(warning, '产物缺失 → 警告对话框').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]'), '警告门先于确认门').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-dispatch-warning-note]'), '不阻断说明行在场').toBeVisible()

    // 缺失清单:恰一项 —— design/ 存在性(stage=design 已越过,rule=file-missing)。
    const missingItems = page.locator('[data-dsh-forge-dispatch-missing-item]')
    await expect(missingItems, '缺失清单恰一项(design/ 产物缺席)').toHaveCount(1)
    await expect(missingItems.first()).toHaveAttribute('data-dsh-forge-dispatch-missing-rule', 'file-missing')
    await expect(missingItems.first()).toContainText('design')

    // State:派发 blocked 于 artifacts-missing 联合返回 —— 零落行零 journal。
    expect(await getDispatchRows(page, world.projectId), '警告态零派发行').toHaveLength(0)
    expect(world.stub?.readJournal() ?? [], '零模型流量(journal 空)').toHaveLength(0)
  })

  // Outcome "acknowledged-continue" — 确认面是唯一继续通道;确认后派发成功。
  test('step2/acknowledged-continue: explicit continue past the warning → confirm → dispatch succeeds (running row + prompt injected)', async ({ }, testInfo) => {
    testInfo.setTimeout(300_000)
    const world = await manager.acquire(missing as KernelWorld, 'missing')
    const { page } = world

    // 自上一 outcome 的警告对话框继续(对话框仍呈现中)。
    await page.locator('[data-dsh-forge-dispatch-warning-continue]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '确认继续 → 确认门').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })

    // State:派发行落库 running + prompt 注入(与产物齐全路径一致)。
    await waitForOrchBadge(page, MISSING_TASK, 'running', 20_000)
    const rows = (await getDispatchRows(page, world.projectId)).filter(row => row.taskKey === MISSING_TASK)
    expect(rows, '确认后恰一行').toHaveLength(1)
    expect(rows[0]?.state, '行态 running(与产物齐全路径同结局)').toBe('running')
    expect(rows[0]?.sessionId, '行携带预铸 session id').not.toBeNull()
    const prompt = world.stub?.readJournal().find(entry => entry.kind === 'prompt' && entry.sessionId === rows[0]?.sessionId)
    expect(prompt, 'journal prompt 行在场(注入发生)').toBeDefined()
  })
})
