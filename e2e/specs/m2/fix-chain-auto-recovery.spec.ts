// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: fix-chain-auto-recovery（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/fix-chain-auto-recovery/contracts/
//   step-{1..5}-*.md（eval-contract 957/1100 通过）。
//
// 载体形态：同 task-dispatch-pipeline.spec（回放主径钩子 + refetchOnce 单发 + 直插受控初态）。
//
// Fact Table 摘录（源码核实）：
//   - fix 三件套原子性（add.ts M2_ADD_ATOMIC_TRIPLE）：addTask(sourceTask, blockSource) 单事务
//     = fix 行（localId = fix-N）+ 边（origin='fix-chain'，等待方=源）+ 源置 blocked
//     （verb='auto-block'，actor='core'）；
//   - 恢复钩子（transition.ts M2_RESTORE_HOOK + submit）：fix 终态（completed/skipped）且源
//     前置全满足 → 源 blocked→pending（verb='auto-restore'，actor='core'），边保留不删；
//   - 两级去重（add.ts:238-252）：任务级 = 同源同型未终态复用（reused=true 纯读零变更）；
//   - 环守卫：ERR_CYCLE_DETECTED「检测到依赖环：<环路径>」（B.5-1 同构）；链深守卫：
//     ERR_CHAIN_DEPTH_EXCEEDED「fix 链深超限：新任务将处第 N 级（上限 6）」（C6 裁决）；
//   - 概览三视图（Step 5）：列表行 [data-dswf-tt-item] / DAG [data-dswf-tt-dagsvg] /
//     泳道列 [data-dswf-tt-col="<status>"] + 卡片 [data-dswf-tt-card]。
//
// Outcome → 测试映射：
//   Step1-5 success 链（受阻→建链→修复→恢复→三视图）……「冒烟：fix 链全链 + 三视图即时反映」
//   Step1 blocked-reason-required ……………………………………………………「受阻结算缺 reason：输入面拒绝」
//   Step1 from-mismatch-rejected ……………………………………………………「源已被人工处置：blocked 结算被矩阵拒绝」
//   Step2 cycle-dependency-rejected ………………………………………………「环构造双 flag：拒绝 + 完整环路径 + 零残留」
//   Step2 chain-depth-exceeded ……………………………………………………………「链深 6 上限：第 7 层拒绝 + 提示人工介入」
//   Step2 duplicate-fix-reuse ………………………………………………………………「重复受阻重试：任务级去重复用（零新建零事件）」
//   Step3 fix-itself-blocked-deepens-chain ……………………………………「fix 自身受阻：fix-of-fix 链深 +1（单点失败不断链）」
//   Step4 skipped-source-also-restores …………………………………………「人工跳过 fix：skipped ∈ 满足集 → 源恢复」
//   Step4 partial-prerequisites-no-restore ……………………………………「部分前置未终态：不恢复；补齐后恢复（全满足判定）」
//
// Assertion depth: 58/61 behavioral (95%)，其中 deep 30/58 (52%)——两阈均过。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { AddTaskResult, ClaimTaskResult, SubmitTaskResult, TaskCard, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { OV_PANEL, ovSubtabOf, ttCardOf, ttColOf, ttItemOf, ttViewOf } from '../../support/anchors.js'
import { openOverviewDock } from '../../support/navigation.js'

const DISP = 'e2e-fxr-dispatch'
const EXEC = 'e2e-fxr-executor'

type AddResult = AddTaskResult
type SubmitResult = SubmitTaskResult
type ClaimResult = ClaimTaskResult

async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

async function setupWorld(page: Page, wsDir: string, wsName: string, feature: string) {
  const project = await registerProject(page, wsDir, wsName)
  const projectId = project.id
  await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: feature, title: `fix 链演示 ${feature}` })
  const dir = (await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })).dir
  return { projectId, dir }
}

/** 挂 fix（blockSource 形态——type 缺省 coding-fix 由调用侧显式传） */
function fixArgs(projectId: string, feature: string, source: AddResult, title: string): Record<string, unknown> {
  return {
    projectId, featureSlug: feature, title, type: 'coding-fix',
    sourceTask: { slug: feature, localId: source.localId }, blockSource: true,
  }
}

test('@web-e2e @m2 fix链·冒烟：受阻→建链→修复→恢复→三视图即时反映（Step1-5 全链）', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-'))
  const wsDir = join(fixtureRoot, 'ws-fxr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-feat'
    const { projectId, dir } = await setupWorld(page, wsDir, 'fix 链冒烟', FEATURE)
    const driver = createBridgeDriver(app)

    // ── Step 1：源任务受阻结算（in_progress→blocked，reason 落审计）──
    const src = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '源任务 X（将受阻）', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: src.localId }, sessionId: DISP })
    const REASON = 'fxr 冒烟：测试面红灯受阻'
    const blocked = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: src.localId }, result: 'blocked', reason: REASON, sessionId: EXEC,
    })) as SubmitResult
    expect(blocked.status, '源任务落账 blocked').toBe('blocked')

    // ── Step 2：创建 fix 任务（三件套单事务原子）──
    const fix = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, src, '修复任务 F'))) as AddResult
    expect(fix.reused, 'fix 新建（非复用）').toBe(false)
    expect(fix.localId, 'fix localId = fix-N 前缀分配').toMatch(/^fix-\d+$/)

    const db = openForgeDbAt(dir)
    try {
      // 三件套原子性：fix 行 + fix-chain 边 + 源 auto-block 审计（同事务全部在场，无半成品）
      expect(db.prepare<unknown[], { source_task_id: string | null; task_status: string }>(
        `SELECT source_task_id, task_status FROM tasks WHERE id = ?`,
      ).get(fix.taskId), 'fix 行携带源谱系（source_task_id = X）').toMatchObject({ source_task_id: src.taskId, task_status: 'pending' })
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(src.taskId, fix.taskId)?.n, '依赖边：X（等待方）依赖 F（前置方），origin = fix-chain').toBe(1)
      const autoBlock = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM task_records WHERE task_id = ? AND verb = 'auto-block'`,
      ).get(src.taskId)
      expect(autoBlock?.actor, '源置 blocked 的 auto-block 审计（actor = core）').toBe('core')
    } finally {
      db.close()
    }

    // ── Step 3：fix 执行至完成（领取 + 质量门 + 结算；恢复钩子触发）──
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: fix.localId }, sessionId: DISP })
    const fixSubmit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: fix.localId }, result: 'success',
      summary: 'fxr 冒烟：修复完成', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC,
    })) as SubmitResult
    expect(fixSubmit.status, 'fix 任务落账 completed').toBe('completed')
    expect(fixSubmit.restored.map((r) => r.localId), '恢复钩子反查：源 X auto-restore（返回体 restored 面）').toContain(src.localId)

    const db2 = openForgeDbAt(dir)
    try {
      const restore = db2.prepare<unknown[], { verb: string; actor: string; from_status: string | null; to_status: string | null }>(
        `SELECT verb, actor, from_status, to_status FROM task_records WHERE task_id = ? AND verb = 'auto-restore'`,
      ).get(src.taskId)
      expect(restore, '恢复行在场（e2e 断言锚——Step 4 Output）').toBeDefined()
      expect(restore?.actor, '恢复审计 actor = core').toBe('core')
      expect(restore?.from_status, '恢复转移 from = blocked').toBe('blocked')
      expect(restore?.to_status, '恢复转移 to = pending').toBe('pending')
      // 边持久：恢复后 fix-chain 边仍在场（满足 = 读时派生，边不删——Invariant）
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(src.taskId, fix.taskId)?.n, '恢复后边保留（零删除）').toBe(1)
    } finally {
      db2.close()
    }

    // ── Step 5：概览三视图即时反映（fix 链关系：列表/DAG/泳道）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    const srcRow = page.locator(ttItemOf(src.taskId)).first()
    await expect(srcRow, '列表：源任务行在场').toBeVisible({ timeout: 30_000 })
    await expect(srcRow, '列表：源任务恢复后待处理').toContainText('待处理')
    const fixRow = page.locator(ttItemOf(fix.taskId)).first()
    await expect(fixRow, '列表：fix 任务行在场').toContainText('已完成')
    // DAG：源→fix 依赖边（SVG 贝塞尔连线承载面）
    await page.locator(ttViewOf('dag')).click()
    await expect(page.locator(ttItemOf(src.taskId)).or(page.locator(`[data-dswf-tt-dag]`)).first(), 'DAG 视图挂载').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-tt-dagsvg]').first(), 'DAG SVG 连线在场（依赖边呈现）').toBeVisible({ timeout: 30_000 })
    // 泳道：七态横向列（源在 pending 列、fix 在 completed 列）
    await page.locator(ttViewOf('swim')).click()
    await expect(page.locator(ttColOf('pending')).first(), '泳道 pending 列在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ttColOf('pending')).locator(ttCardOf(src.taskId)).first(), '泳道：源卡片在 pending 列（恢复后状态）').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ttColOf('completed')).locator(ttCardOf(fix.taskId)).first(), '泳道：fix 卡片在 completed 列').toBeVisible({ timeout: 30_000 })
    // 读面即时（写入返回后单次重取即见——Step 5 Output）
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, featureSlug: FEATURE })
    const srcCard = cards.find((c) => c.taskId === src.taskId)
    const fixCard = cards.find((c) => c.taskId === fix.taskId)
    expect(srcCard?.taskStatus, '读面单发即见源 pending').toBe('pending')
    expect(fixCard?.taskStatus, '读面单发即见 fix completed').toBe('completed')
    expect(fixCard?.sourceTask, '列表卡副行谱系：fix 源标指向 X 自然键').toEqual({ slug: FEATURE, localId: src.localId })
    await expect(page.locator(OV_PANEL).first()).toBeVisible()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 fix链·Step1 受阻结算缺 reason：输入面拒绝（不进 fix 链）', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-rr-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-rr')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-rr-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-rr'
    const { projectId, dir } = await setupWorld(page, wsDir, '缺因拒绝演示', FEATURE)
    const driver = createBridgeDriver(app)
    const src = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '缺因结算任务', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: src.localId }, sessionId: DISP })

    const rejection = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: src.localId }, result: 'blocked', sessionId: EXEC,
    }))
    expect(rejection, '缺 reason → ERR_REASON_REQUIRED').toContain('需要 reason')

    // 不进入 fix 链：任务保持 in_progress + 零 submit 审计
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: src.taskId })
    expect(detail.taskStatus, '仍 in_progress（状态不变更）').toBe('in_progress')
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(src.taskId)?.n, '零 submit 审计（不落部分审计）').toBe(0)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step1 源已被人工处置：blocked 结算被矩阵拒绝（处置不被覆盖）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-fm-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-fm')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-fm-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-fm'
    const { projectId, dir } = await setupWorld(page, wsDir, '人工处置拒绝演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：源已被人工置 suspended（中断窗口内处置）+ 历史 claim 行
    const db = openForgeDbAt(dir)
    const taskId = `t-${FEATURE}-2.1`
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(FEATURE)?.id ?? ''
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
         VALUES (?, ?, '2.1', '人工挂起的源任务', 'doc', 'suspended', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(taskId, FEATURE, fid)
      db.prepare(
        `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, session_id, created_at, updated_at)
         VALUES (?, 'claim', 'pending', 'in_progress', 'plugin-tool', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(taskId, DISP)
    })()
    db.close()

    const rejection = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: '2.1' }, result: 'blocked', reason: '迟到的受阻结算', sessionId: EXEC,
    }))
    expect(rejection, 'from 不匹配 → ERR_INVALID_TRANSITION（submit 唯一合法 from = in_progress）').toContain('非法任务转移')
    expect(rejection, '矩阵呈现实际当前态 suspended').toContain('suspended')

    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '人工处置结果不被覆盖（仍 suspended）').toBe('suspended')
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(taskId)?.n, '零残留（无 submit 行）').toBe(0)
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step2 环构造双 flag：拒绝 + 完整环路径 + 零残留', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-cy-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-cy')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-cy-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-cy'
    const { projectId, dir } = await setupWorld(page, wsDir, '环守卫演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 既有等待链：S(1.1) ← D(1.2)（D dependsOn S）；T = dependsOn D × blockSource S → 环 S→T→D→S
    const s = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '源 S（环构造）', type: 'doc',
    })) as AddResult
    const d = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '等待方 D', type: 'doc', dependsOn: [s.localId],
    })) as AddResult
    const db = openForgeDbAt(dir)
    const countBefore = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE slug = ?`).get(FEATURE)?.n ?? 0
    db.close()

    const rejection = await rejectMessage(driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '环构造 T', type: 'coding-fix',
      dependsOn: [d.localId], sourceTask: { slug: FEATURE, localId: s.localId }, blockSource: true,
    }))
    expect(rejection, '双 flag 组合 → ERR_CYCLE_DETECTED').toContain('检测到依赖环')
    expect(rejection, '环路径回报（自然键复合呈现——首尾相接）').toContain(`${FEATURE}/${s.localId}`)
    expect(rejection, '环路径含等待方 D').toContain(`${FEATURE}/${d.localId}`)

    // 零残留：T 未建、边表无环不变量保持（仅 D←S 一条既有边）
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE slug = ?`).get(FEATURE)?.n, '环拒绝零残留（任务数不变）').toBe(countBefore)
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_edges`).get()?.n, '边表仅既有一条（无半成品边）').toBe(1)
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step2 链深 6 上限：第 7 层拒绝 + 提示人工介入', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-cd-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-cd')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-cd-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-cd'
    const { projectId, dir } = await setupWorld(page, wsDir, '链深上限演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 建链：T1（受阻）→ fix(T1)=T2（受阻）→ … 直至 6 层嵌套（沿 source_task_id 计数 = 6）
    let current = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '链深任务 T1（根）', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: current.localId }, sessionId: DISP })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: current.localId }, result: 'blocked', reason: '链深演示：层 1 受阻', sessionId: EXEC,
    })
    for (let level = 2; level <= 6; level++) {
      current = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, current, `fix 层 ${level}`))) as AddResult
      await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: current.localId }, sessionId: DISP })
      await driver.call('forgeTasks', 'submitTask', {
        projectId, taskRef: { slug: FEATURE, localId: current.localId }, result: 'blocked', reason: `链深演示：层 ${level} 受阻`, sessionId: EXEC,
      })
    }

    // 对链深 6 的任务再挂 fix → 第 7 层超限拒绝
    const rejection = await rejectMessage(driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, current, '越界的第 7 层')))
    expect(rejection, '链深超限 → ERR_CHAIN_DEPTH_EXCEEDED').toContain('fix 链深超限')
    expect(rejection, '新任务将处第 7 级（上限 6 呈现）').toContain('7')
    expect(rejection, '提示人工介入').toContain('人工介入')

    // 零变更：链上任务数 = 6（根 + 5 层 fix），拒绝不建第 7 行
    const db = openForgeDbAt(dir)
    try {
      const chainRows = db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM tasks WHERE source_task_id IS NOT NULL`,
      ).get()?.n ?? 0
      expect(chainRows, 'fix 谱系行 = 5（≤6 守卫保持，第 7 层未建）').toBe(5)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step2 重复受阻重试：任务级去重复用（零新建零事件）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-dup-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-dup')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-dup-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-dup'
    const { projectId, dir } = await setupWorld(page, wsDir, '去重复用演示', FEATURE)
    const driver = createBridgeDriver(app)

    const src = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '去重演示源任务', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: src.localId }, sessionId: DISP })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: src.localId }, result: 'blocked', reason: '去重演示受阻', sessionId: EXEC,
    })
    const fix = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, src, '既有修复任务'))) as AddResult
    expect(fix.reused, '首建非复用').toBe(false)

    const db = openForgeDbAt(dir)
    const countWithFix = db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks`).get()?.n ?? 0
    db.close()
    const eventsBefore = (await driver.events()).length

    // 同源同型未终态重复声明 → 复用既有 fix 行（纯读零变更，不重复建链不重复置 blocked）
    const again = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, src, '重复声明——应复用'))) as AddResult
    expect(again.reused, '任务级去重：reused = true').toBe(true)
    expect(again.taskId, '复用既有 fix 行（同 taskId）').toBe(fix.taskId)

    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM tasks`).get()?.n, '复用零新建（行数不变）').toBe(countWithFix)
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(src.taskId, fix.taskId)?.n, '边级幂等：fix-chain 边恰一条（持久边已承载等待事实）').toBe(1)
      const autoBlocks = db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'auto-block'`,
      ).get(src.taskId)?.n
      expect(autoBlocks, '不重复置源 blocked（auto-block 行不增）').toBe(1)
    } finally {
      db2.close()
    }
    expect((await driver.events()).length, '纯读命中零事件发射').toBe(eventsBefore)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step3 fix 自身受阻：fix-of-fix 链深 +1（单点失败不断链）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-ff-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-ff')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-ff-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-ff'
    const { projectId, dir } = await setupWorld(page, wsDir, '嵌套 fix 演示', FEATURE)
    const driver = createBridgeDriver(app)

    // X 受阻 → fix F；F 自身执行受阻 → fix-of-fix FF（同三件套原子语义，localId 顺延）
    const x = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '源 X（fix-of-fix 演示）', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: x.localId }, sessionId: DISP })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: x.localId }, result: 'blocked', reason: 'ff 演示：X 受阻', sessionId: EXEC,
    })
    const f = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, x, 'fix F'))) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: f.localId }, sessionId: DISP })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: f.localId }, result: 'blocked', reason: 'ff 演示：F 亦受阻（质量门未过）', sessionId: EXEC,
    })
    expect((await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: f.taskId })).taskStatus, 'F 落账 blocked').toBe('blocked')

    const ff = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, f, 'fix-of-fix FF'))) as AddResult
    expect(ff.reused, 'FF 新建（同源同型首建）').toBe(false)
    expect(ff.localId, 'FF localId = fix-N 顺延（≠ F）').not.toBe(f.localId)
    expect(ff.localId, 'fix-N 前缀保持').toMatch(/^fix-\d+$/)

    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { source_task_id: string | null }>(
        `SELECT source_task_id FROM tasks WHERE id = ?`,
      ).get(ff.taskId)?.source_task_id, 'FF 谱系指向 F（链深 +1）').toBe(f.taskId)
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(f.taskId, ff.taskId)?.n, 'F←FF 依赖边在场（嵌套链承载）').toBe(1)
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'auto-block'`,
      ).get(f.taskId)?.n, 'F 的 auto-block 审计同事务落账').toBe(1)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step4 人工跳过 fix：skipped ∈ 满足集 → 源恢复（边保留）', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-sk-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-sk')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-sk-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-sk'
    const { projectId, dir } = await setupWorld(page, wsDir, '跳过恢复演示', FEATURE)
    const driver = createBridgeDriver(app)

    const src = (await driver.call('forgeTasks', 'addTask', {
      projectId, featureSlug: FEATURE, title: '跳过恢复源任务', type: 'doc',
    })) as AddResult
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: src.localId }, sessionId: DISP })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: src.localId }, result: 'blocked', reason: 'sk 演示：源受阻', sessionId: EXEC,
    })
    const fix = (await driver.call('forgeTasks', 'addTask', fixArgs(projectId, FEATURE, src, '将被人工跳过的 fix'))) as AddResult

    // 人工径（RPC 人类面）：fix → skipped（属终态满足集）
    const skipped = await forgeInvoke<{ taskStatus: string }>(page, TASKS_CHANNELS.transition, {
      projectId, taskId: fix.taskId, toStatus: 'skipped', reason: 'fxr Step4：人工跳过该修复（不修了）',
    })
    expect(skipped.taskStatus, 'fix 人工跳过落账').toBe('skipped')

    // 恢复钩子（人工转移同挂——与 submitTask 同族 C3）：源 blocked→pending + auto-restore 行
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: src.taskId })
    expect(detail.taskStatus, 'skipped ∈ {completed, skipped} → 源恢复 pending').toBe('pending')
    const db = openForgeDbAt(dir)
    try {
      const restore = db.prepare<unknown[], { verb: string; actor: string }>(
        `SELECT verb, actor FROM task_records WHERE task_id = ? AND verb = 'auto-restore'`,
      ).get(src.taskId)
      expect(restore, 'auto-restore 行在场（恢复判定与领取判定同源）').toBeDefined()
      expect(restore?.actor, '恢复审计 actor = core').toBe('core')
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ? AND prerequisite_id = ? AND origin = 'fix-chain'`,
      ).get(src.taskId, fix.taskId)?.n, '恢复后边保留（满足 = 读时派生，边不删）').toBe(1)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});

test('@web-e2e @m2 fix链·Step4 部分前置未终态：不恢复；补齐后恢复（全满足判定）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-pt-'))
  const wsDir = join(fixtureRoot, 'ws-fxr-pt')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-fxr-pt-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'fxr-pt'
    const { projectId, dir } = await setupWorld(page, wsDir, '部分前置演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：源 X blocked + 双前置边（依赖 F 与依赖 P）；F pending（可经动词终态化）、P in_progress
    const db = openForgeDbAt(dir)
    const xId = `t-${FEATURE}-3.1`
    const fId = `t-${FEATURE}-3.2`
    const pId = `t-${FEATURE}-3.3`
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(FEATURE)?.id ?? ''
      const insert = (id: string, localId: string, title: string, status: string): void => {
        db.prepare(
          `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, feature_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'doc', ?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
        ).run(id, FEATURE, localId, title, status, fid)
      }
      insert(xId, '3.1', '源 X（双前置等待方）', 'blocked')
      insert(fId, '3.2', '前置 F（fix 角色）', 'pending')
      insert(pId, '3.3', '前置 P（另一未终态依赖）', 'in_progress')
      const edge = (waiter: string, prereq: string, origin: string): void => {
        db.prepare(
          `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
           VALUES (?, ?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
        ).run(waiter, prereq, origin)
      }
      edge(xId, fId, 'fix-chain')
      edge(xId, pId, 'manual')
    })()
    db.close()

    // F 完成（claim + submit success）→ 恢复钩子反查：P 未终态 → X 不恢复
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: FEATURE, localId: '3.2' }, sessionId: DISP })
    const fSubmit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: '3.2' }, result: 'success',
      summary: 'pt 演示：F 完成（部分满足）', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC,
    })) as SubmitResult
    expect(fSubmit.status, 'F 落账 completed').toBe('completed')
    expect(fSubmit.restored.map((r) => r.localId), 'X 不在恢复清单（任一前置未满足即不恢复）').not.toContain('3.1')
    const xAfterF = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: xId })
    expect(xAfterF.taskStatus, 'X 保持 blocked（全满足才恢复，非任一满足）').toBe('blocked')

    // P 补齐（in_progress 显式重入 + submit success）→ 全前置终态 → X 恢复
    const pReentry = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: FEATURE, localId: '3.3' }, sessionId: DISP,
    })) as ClaimResult
    expect(pReentry.reclaimed, 'P in_progress 幂等重入（跨会话显式重入径）').toBe(true)
    const pSubmit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: '3.3' }, result: 'success',
      summary: 'pt 演示：P 补齐（全满足）', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC,
    })) as SubmitResult
    expect(pSubmit.restored.map((r) => r.localId), 'P 补齐后 X 恢复（restored 清单含 3.1）').toContain('3.1')
    const xAfterP = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: xId })
    expect(xAfterP.taskStatus, 'X 终于恢复 pending').toBe('pending')

    const db2 = openForgeDbAt(dir)
    try {
      // auto-restore 行恰在补齐后出现（此前零行——分阶段观测）
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'auto-restore'`,
      ).get(xId)?.n, 'auto-restore 恰一行（补齐事务内聚）').toBe(1)
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_edges WHERE task_id = ?`,
      ).get(xId)?.n, '双前置边均保留（恢复不删边）').toBe(2)
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
});
