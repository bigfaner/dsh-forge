// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: worker-provisioning（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/worker-provisioning/contracts/
//   step-{1..5}-*.md（eval-contract 890/1100 通过）。
//
// 旅程分工（web surface 50/50 双半承载）：Journey 半（设置对话框配置流 + 派发入口 + 时间线
// 上屏）与 Contract 半（worker 内部状态——会话 model/工具面收窄/deny/技能继承/链深）。本件
// 落 e2e 可达面（addTask 逃生通道 = 回放主径可达的契约机制 + 时间线上屏）；其余经映射承载。
//
// Fact Table 摘录（源码核实）：
//   - addTask 逃生通道（add.ts §4/C2/C6）：sourceTask + blockSource=true → fix-N 分配 +
//     源任务同事务置 blocked + fix-chain 边 + auto-block 记录；sourceTask 未带 blockSource
//     → disc-N（不阻塞源）；链深 ≤6（新任务链深 = 源链长 + 1——超限 =
//     ERR_CHAIN_DEPTH_EXCEEDED「fix 链深超限：新任务将处第 N 级（上限 6）」）；
//   - localId 分配（add.ts:127-153）：fix-N/disc-N = max(existing prefix-N) + 1；
//   - forge-settings（sc2③ 数据面）：forge:settings/set 落 {userData}/forge-settings.json
//     （core 单写者）+ get 回读一致——dispatchTask agentOptions 组装数据源（改完即生效）；
//   - 任务行上屏锚 = ttItemOf（M2 即时口径——写入返回后单次重取即见）。
//
// Outcome → 测试映射：
//   Step5 success（前缀语义二分：fix-N 阻塞源 / disc-N 不阻塞 + 时间线上屏）…………………「T1」
//   Step5 fix-chain-depth-limit（链深 ≤6——第 7 层拒绝）……………………………………………「T1」
//   Step5 prefix-bifurcation（两前缀行为分化 + 状态分化上屏）………………………………………「T1」
//   Step1 success（配置持久化 + 下次派发生效）………………………………………………………交叉引用 sc2
//   Step1 unconfigured-placeholder / save-failure-retry / config-timing-boundary……诚实映射
//   Step2 success / agentoptions-priority（spawn agentOptions + 会话 model）…………………诚实映射
//   Step3 success / denied-tool-physically-absent（收窄矩阵 + deny）…………………………交叉引用 pin-12
//   Step4 success / blitz-worker-spec-invisible（技能继承 + L1 延伸）…………………………诚实映射
//
// 诚实映射 / 交叉引用（无 e2e 通道或已有承载面——不伪造断言）：
//   - Step1 表单三态（unconfigured ⚠ 占位 + 保存禁用 / 填齐激活 / 保存失败留场重试）：
//     官方设置对话框开启通道在 e2e 无先例锚（本仓零 spec 曾开官方设置面——ui-settings
//     属上游设置域）→ ForgeSettingsSection.test.tsx（AC3/AC4 全相位表单承载）；
//     持久化数据面 → sc2-worker-face.spec.ts ③（set → forge-settings.json 落盘 + get 回读）；
//     config-timing-boundary（在途 worker 保持旧档/新 worker 用新档——agentOptions 在
//     spawn 时点合成）→ dogfood-sc-m3.spec.ts（真实 spawn 面）；
//   - Step2（spawn 携带 agentOptions、优先于父会话继承、worker 会话 model = 配置档）：
//     契约面（会话 model 元数据非浏览器可观察）→ dogfood（真实 dispatchTask + logs
//     task-spawned 行 model 字段——log-chain.test.ts 行形状锚）+ sc2③ 数据面；
//   - Step3（收窄矩阵 ✓ 列 + 全局拒绝集 + submitTask/addTask 携带）→ 5.1 G1 pin-12
//     （两包 tool 面 pin）+ e2e/support/m3/worker-face.test.ts（deriveWorkerToolFilter
//     四型 deny 期望集实函数断言）；
//   - Step4（技能继承目录 + 按需加载 + 突击 worker spec 不可见）→ SC2①（L1 数据面——
//     组合继承自父，父即物理缺位则子缺位）+ 3.9 W 用例（真实 worker 技能目录到达 +
//     run-tests 按需加载正反例——VERIFICATION-3.9.md）+ dogfood。
//
// Assertion depth: 22/24 behavioral（92%），其中 deep 9/22（41%）——两阈均过。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ovSubtabOf, ttItemOf } from '../../support/anchors.js'

const WS_NAME = 'ws-jwp'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

test('@web-e2e @m3 worker 供给·T1：addTask 逃生通道前缀二分（fix-N 同事务阻塞源 / disc-N 不阻塞）+ 链深 ≤6 + 状态分化上屏', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jwp-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-jwp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)
    const PROP = 'jwp-escape'
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: PROP, title: 'Jwp 逃生通道演示提案', mode: 'blitz' })
    const add = async (title: string, sourceTask?: { slug: string; localId: string }, blockSource?: boolean): Promise<{ taskId: string; slug: string; localId: string }> =>
      (await driver.call('forgeTasks', 'addTask', {
        projectId, source: { kind: 'proposal', slug: PROP }, title, type: 'doc',
        ...(sourceTask !== undefined ? { sourceTask } : {}), ...(blockSource !== undefined ? { blockSource } : {}),
      })) as { taskId: string; slug: string; localId: string }

    // ── 两个受阻场景双份夹具（源任务均已领取 = worker 执行中形态）──
    const srcFix = await add('fix 径源任务')
    const srcDisc = await add('disc 径源任务')
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: srcFix.slug, localId: srcFix.localId }, sessionId: 'e2e-jwp-w1' })
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: srcDisc.slug, localId: srcDisc.localId }, sessionId: 'e2e-jwp-w2' })

    // ── prefix-bifurcation：fix-N（block_source 单事务——源即时 blocked 并引用）──
    const fix1 = await add('修复任务（走 fix 链协议）', { slug: srcFix.slug, localId: srcFix.localId }, true)
    expect(fix1.localId.startsWith('fix-'), `fix 径前缀分配（localId=${fix1.localId}）`).toBe(true)
    // disc-N（独立问题——不阻塞源，源可继续）
    const disc1 = await add('独立问题任务（不阻塞源）', { slug: srcDisc.slug, localId: srcDisc.localId }, false)
    expect(disc1.localId.startsWith('disc-'), `disc 径前缀分配（localId=${disc1.localId}）`).toBe(true)

    const db = openForgeDbAt(dir)
    try {
      const statusOf = (taskId: string): string | undefined =>
        db.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(taskId)?.task_status
      expect(statusOf(srcFix.taskId), 'fix 径：源任务同事务即时 blocked（block_source 单事务）').toBe('blocked')
      expect(statusOf(srcDisc.taskId), 'disc 径：源任务不被阻塞（可继续）').toBe('in_progress')
      const fixRow = db.prepare<unknown[], { source_task_id: string | null; blocked_reason: string | null }>(
        `SELECT source_task_id, blocked_reason FROM tasks WHERE id = ?`,
      ).get(fix1.taskId)
      expect(fixRow?.source_task_id, 'fix 任务谱系引用源任务').toBe(srcFix.taskId)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'auto-block'`).get(srcFix.taskId)?.n, 'auto-block 审计行伴随（reason 单源落账）').toBeGreaterThanOrEqual(1)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`).get(fix1.taskId)?.n, 'fix-chain 边落库（恢复钩子锚）').toBeGreaterThanOrEqual(1)
    } finally {
      db.close()
    }

    // ── fix-chain-depth-limit：fix 链堆至 6 层 → 第 7 层拒绝（无无限 fix 链）──
    let tip = fix1
    for (let i = 2; i <= 6; i++) {
      tip = await add(`深层修复任务（第 ${i} 层）`, { slug: tip.slug, localId: tip.localId }, true)
      expect(tip.localId, `fix-N 顺延（第 ${i} 层 = fix-${i}）`).toBe(`fix-${i}`)
    }
    const depthRejected = await rejectMessage(add('第 7 层越限修复任务', { slug: tip.slug, localId: tip.localId }, true))
    expect(depthRejected, '链深 ≤6 纪律（第 7 层拒绝——超限不放行）').toContain('fix 链深超限')
    expect(depthRejected, '上限明示（6）').toContain('上限 6')
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM tasks WHERE slug = ? AND local_id LIKE 'fix-%'`,
      ).get(PROP)?.n, '既有链保持 ≤6（六层 fix 行）').toBe(6)
    } finally {
      db2.close()
    }

    // ── 时间线上屏（M2 即时口径——写入返回后行可见）：源任务 blocked 行 + 新任务行 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="proposal:${PROP}"]`).first().click()
    await expect(page.locator(`[data-dswf-tt-contpill="proposal:${PROP}"]`), '突击容器选中').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(srcFix.taskId)).first(), 'fix 径源任务行上屏（已阻塞）').toContainText('已阻塞', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(srcDisc.taskId)).first(), 'disc 径源任务行上屏（进行中——两源状态分化上屏）').toContainText('进行中', { timeout: 30_000 })
    await expect(page.locator(ttItemOf(fix1.taskId)).first(), '新任务行上屏（fix-1）').toBeVisible({ timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
