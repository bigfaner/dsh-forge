// @feature dsh-forge-m3 | @web-e2e | @journey task-dispatch-execution-loop
// Traceability: docs/features/dsh-forge-m3/testing/task-dispatch-execution-loop/
// contracts/step-4-presynth-context-assert.md — one test per Outcome:
//   success                    — 任务详情侧板预合成要素标识(orch-presynth 行
//                               + prompt_hash)+ 注入 oracle 四件套 + 三要素
//                               锚点(类型协议 / PhaseSummary 资产路径 / 生效
//                               偏好非默认值);journal 面零 forge prompt 自跑
//                               合成调用标记。
//   summary-updated-new-dispatch — 同阶段资产覆盖更新(新目标/摘要)后新派发:
//                               PhaseSummary 锚(资产路径)仍指向该文件且文件
//                               内容 = 最新;既有派发行 prompt_hash 不变(不追溯
//                               改写);新行 hash = 重算口径。
// fixture_spec: Project/Task(typed)/Dispatch(running)/StageAsset — served by
// harness.buildMainWorld + the in-test dispatch.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  dispatchFromBoard,
  freshRoot,
  getDispatchRows,
  openKernelDb,
  recomputePresynth,
  waitForOrchBadge,
  waitForPromptRow,
  WorldManager,
  bridgeInvoke,
} from '../_lib/journey-world.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import { buildMainWorld, FEATURE, PROTOCOL_SENTENCES, TASK_1, TASK_5 } from './harness.ts'
import type { KernelWorld } from '../_lib/journey-world.ts'

const DESIGN_ASSET_REL = `${FEATURE}/stages/design.md`

test.describe.serial('task-dispatch-execution-loop / step 4: 确认预合成专业化上下文在场', () => {
  const manager = new WorldManager()
  let kernel: KernelWorld | null = null

  test.beforeAll(async () => {
    kernel = await buildMainWorld(freshRoot('disp-loop-s4'))
  })

  test.afterAll(async () => {
    await manager.closeAll()
  })

  // Outcome "success" — 三要素在场(标识 + oracle + 锚点),无自跑合成调用。
  test('step4/success: detail panel presynth markers + oracle four-piece + three-element anchors (protocol / stage asset / effective pref 62%)', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // 要素③ 前置:feature 级覆盖偏好(62% —— 非默认 80 的非平凡锚点)。
    await bridgeInvoke(page, 'setPrefs', [
      { feature: `${world.projectId}/${FEATURE}` },
      [{ key: 'coverage.coding.feature', value: { type: 'percentage', percentage: 62 } }],
    ])

    await dispatchFromBoard(page, [TASK_1])
    await waitForOrchBadge(page, TASK_1, 'running', 20_000)
    const row = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    if (row === undefined) throw new Error('dispatch row missing')

    // Output(浏览器面):详情侧板编排分区呈现预合成要素标识 + hash。
    await page.locator(`[data-dsh-forge-node-card="${TASK_1}"]`).click()
    const detail = page.locator(`[data-dsh-forge-task-detail="${TASK_1}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    const orch = detail.locator('[data-dsh-forge-orchestration-section]')
    await expect(orch).toBeVisible({ timeout: 10_000 })
    await expect(orch.locator('[data-dsh-forge-orch-presynth-line]'), '预合成要素标识行在场(✓✓✓ 形态)').toBeVisible()
    await expect(orch.locator('[data-dsh-forge-orch-presynth]'), '预合成要素标识在场').toBeVisible()
    await expect(orch.locator('[data-dsh-forge-orch-prompt-hash]'), 'prompt_hash 呈现(title = 行内完整 hash,对拍锚)')
      .toHaveAttribute('title', row.promptHash)

    // 测试通道直读:注入 oracle 四件套 + 三要素锚点。
    const prompt = await waitForPromptRow(page, stub, row.sessionId as string)
    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const oracle = verifyPromptInjection({
        journalText: prompt.text,
        presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, TASK_1),
        promptHash: row.promptHash,
        sessionId: row.sessionId as string,
        requestId: prompt.requestId,
      })
      expect(oracle, '注入 oracle 四件套(hash/逐字节前缀/单追加行/requestId)').toEqual({ ok: true })
      // ① 任务类型协议(路由头 + 类型专属执行句)。
      expect(prompt.text, '要素① TASK_ID 寻址').toContain(`TASK_ID: ${TASK_1}`)
      expect(prompt.text, '要素① 类型专属协议句').toContain(PROTOCOL_SENTENCES[TASK_1])
      // ② feature 目标摘要(PhaseSummary 块 = 最近先行阶段资产绝对路径)。
      expect(prompt.text, '要素② PhaseSummary 块在场').toContain('## PhaseSummary')
      expect(prompt.text, '要素② 阶段资产绝对路径(design)').toContain(join(world.kernel.featuresRoot, DESIGN_ASSET_REL))
      // ③ 生效偏好(feature 级覆盖,非默认值)。
      expect(prompt.text, '要素③ 生效覆盖偏好(62%)').toContain('Target: Achieve 62% test coverage')
      // Invariant:禁自跑合成 —— stub 通道只有 create + prompt 两类行。
      const kinds = new Set(stub.readJournal().map(entry => entry.kind))
      expect([...kinds].every(kind => kind === 'create' || kind === 'prompt'), '无 forge prompt 类自跑合成调用标记(journal 仅 create/prompt)').toBe(true)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })

  // Outcome "summary-updated-new-dispatch" — 资产覆盖更新 → 新派发反映最新;既有行不追溯。
  test('step4/summary-updated-new-dispatch: overwritten stage asset → new dispatch anchors the same file with the LATEST content; the old row prompt_hash is untouched', async ({ }, testInfo) => {
    testInfo.setTimeout(600_000)
    const world = await manager.acquire(kernel as KernelWorld, 'main')
    const { page, stub } = world
    if (stub === null) throw new Error('the dispatch stub must ride this world')

    // 前置:上一 outcome 的派发行(已派发 subagent)在场 —— 其 hash 为「不追溯」锚。
    const oldRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_1)
    if (oldRow === undefined) throw new Error('the pre-update dispatch row is missing (serial predecessor)')

    // 同阶段覆盖更新:stageSummarize = forge.stage.summarize 的同路由内核写面。
    const updatedGoal = 'disp-loop 更新后目标锚点 — 摘要更新后的新派发腿(要素②内容最新性)'
    const updatedMark = 'disp-loop 更新后摘要锚点 — 覆盖更新(同阶段恒单份)。'
    const summarized = await bridgeInvoke<{ path: string; featureStage: string; gateOpen: boolean }>(page, 'stageSummarize', [{
      projectId: world.projectId,
      featureSlug: FEATURE,
      stage: 'design',
      goal: updatedGoal,
      summary: `${updatedMark}\n`,
    }])
    expect(summarized.path, '同阶段重写 = 覆盖(恒单份,相对路径不变)').toBe(DESIGN_ASSET_REL)
    const assetAbs = join(world.kernel.featuresRoot, DESIGN_ASSET_REL)
    expect(existsSync(assetAbs), '资产文件在场').toBe(true)
    expect(readFileSync(assetAbs, 'utf8'), '文件内容 = 最新目标(逐字)').toContain(updatedGoal)

    // 新派发(TASK_5):注入锚(资产路径)仍指向该文件,重算口径 hash 落行。
    await dispatchFromBoard(page, [TASK_5])
    await waitForOrchBadge(page, TASK_5, 'running', 20_000)
    const newRow = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.taskKey === TASK_5)
    if (newRow === undefined) throw new Error('new dispatch row missing')
    const newPrompt = await waitForPromptRow(page, stub, newRow.sessionId as string)
    expect(newPrompt.text, '新派发 PhaseSummary 块在场').toContain('## PhaseSummary')
    expect(newPrompt.text, '锚 = 资产绝对路径(载体翻转:注入携路径,内容留文件)').toContain(assetAbs)

    const db = await openKernelDb(world.kernel.userDataDir)
    try {
      const oracle = verifyPromptInjection({
        journalText: newPrompt.text,
        presynthContent: recomputePresynth(db, world.kernel.featuresRoot, world.projectId, TASK_5),
        promptHash: newRow.promptHash,
        sessionId: newRow.sessionId as string,
        requestId: newPrompt.requestId,
      })
      expect(oracle, '新派发注入 oracle 四件套(最新摘要口径)').toEqual({ ok: true })

      // State:既有派发行 prompt_hash 不变(已派发会话不追溯改写)。
      const oldRowAfter = (await getDispatchRows(page, world.projectId)).find(candidate => candidate.id === oldRow.id)
      expect(oldRowAfter?.promptHash, '既有派发行 prompt_hash 不变(不追溯改写)').toBe(oldRow.promptHash)
      expect(oldRowAfter?.state, '既有行态不变').toBe(oldRow.state)
    } finally {
      ;(db as unknown as { close(): void }).close()
    }
  })
})
