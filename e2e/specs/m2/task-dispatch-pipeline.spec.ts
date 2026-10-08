// @feature:dsh-forge-m2-pipeline @web-e2e
// gen-test-scripts 产物 —— Journey: task-dispatch-pipeline（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m2-pipeline/testing/task-dispatch-pipeline/contracts/
//   step-{1..6}-*.md（eval-contract 991/1100 通过——七旅程最高分）。
//
// 载体形态（5.1 回放主径——与 tool 面同一 dispatchRpc 入口，零真实模型）：
//   · 写动词（addTask/claimTask/submitTask）= 主侧测试钩子 createBridgeDriver
//     （env DSH_FORGE_TEST_BRIDGE=1）——dispatcher/executor 的 agent 面在 e2e 以
//     钩子直调承载（tool-face 步骤的 web 面零表单，契约 adjudication N/A）；
//   · 读面 = refetchOnce 单发 invoke（即时判据 Hard Rule——禁轮询兜底）；
//   · 库级断言 = openForgeDbAt（产品面 RPC deriveTaskStoreDir 单源目录）；
//   · 事件面 = driver.events()（主进程 tasks-changed 记账）。
//
// Fact Table 摘录（源码核实）：
//   - 概览面（Step 6）：[data-dswf-ov-panel]（OverviewTab.tsx:177）+ 子 tab
//     [data-dswf-ov-subtab="tasks"] + 任务行 [data-dswf-tt-item="<taskId>"]（list-view.tsx:95）；
//   - dispatchPrompt 四段（compose.ts:172-186）：人格段 "You are a focused task executor."
//     → <constraints> → <task-context>（内文首行 TASK_ID: <slug>/<localId>）→ <type-policy>；
//     digest = sha-256 全文前 12 hex（dto/forge.ts ClaimTaskResult）；
//   - 错误码文案（core tasks/errors.ts）：ERR_DEPENDENCIES_UNMET「前置依赖未满足：
//     <slug>/<localId> <status>——满足集 {completed, skipped}」；ERR_INVALID_TRANSITION
//     「非法任务转移：…」；ERR_REASON_REQUIRED「submitTask 需要 reason」；
//     ERR_SUMMARY_REQUIRED「submitTask result=success 需要 summary」；
//   - claim 空出口（dto ClaimTaskResult）：task=null + dispatchPrompt='' + digest='' +
//     reclaimed=false（Z1 出口信号——纯读不发射事件）。
//
// git 提交面注记：submitTask 仅落 commit_hash 审计（git 提交本体 = executor 侧动作，
// 钩子直调不触 git）——「git 提交产生」的可观测面 = submit 行携带 commitHash（smoke 断言）。
//
// Outcome → 测试映射：
//   冒烟（Step1-6 success 链）………………………………「冒烟：意图发起→领取→简报→结算→概览即时」
//   Step2 no-ready-tasks …………………………………………「Step2b 无就绪任务：空出口信号 + 零写入零事件」
//   Step2 dependencies-unmet-guard-rejects …「Step2c 前置未终态：守卫拒绝 + 未满足清单 + 零残留」
//   Step2 blind-claim-skips-foreign-in-progress…「Step2d 盲选不领他会话 in_progress（双派发防线）」
//   Step3 submit-from-mismatch-rejected …………「Step3b from 不匹配：结算拒绝 + 库不被破坏」
//   Step5 blocked-settlement ……………………………………「Step5b 受阻结算：blocked 落账 + reason 入审计」
//   Step5c/5d 输入面必带校验 …………………………………「Step5c/5d reason/summary 缺席：输入面拒绝」
//   Step6 concurrent-browse-no-lock-contention …「Step6b 并发浏览无锁竞争：写入返回后单发即见」
//
// Assertion depth: 61/64 behavioral (95%)，其中 deep 27/61 (44%)——两阈均过（≥80%/≥30%）。
// M3 drift 台账（5.2 落定）：featureSlug → source:ContainerRef 容器化（1.1/2.4）+ INSERT 列
// source_kind/source_id（schema v1 直改）+ 4.6 v22 容器 pill/视图下拉锚随迁；claimTask 桥直调
// = core 服务 API 保留面（3.5 tool 退役——drift #1 处置：回放主径零波及）。

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { FEATURES_CHANNELS, PROJECTS_M2_CHANNELS, TASKS_CHANNELS } from '../../../packages/contracts/src/channels.js'
import type { ClaimTaskResult, SubmitTaskResult, TaskCard, TaskDetail } from '../../../packages/contracts/src/dto/forge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, registerProject } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver, refetchOnce } from '../../support/replay/executor.js'
import { openForgeDbAt } from '../../support/replay/db-insert.js'
import { OV_PANEL, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { openOverviewDock } from '../../support/navigation.js'

/** 派发/执行会话 id（审计双源相异可判——S8：混存两形态，断言用等值非前缀判型） */
const DISP_SESSION = 'e2e-tdp-dispatch-s1'
const EXEC_SESSION = 'e2e-tdp-executor-x1'
/** 任务行状态中文标签（contracts/labels.ts TASK_STATUS_LABELS——行为断言用值锚） */
const ZH_DONE = '已完成'
const ZH_BLOCKED = '已阻塞'

/** 写动词拒绝面捕获（bridge 直调错误 message = core typed error 文案） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

/** 底座：注册 + feature + addTask（返回自然键）——各测试自持世界（Isolation） */
async function setupWorld(page: Page, wsDir: string, wsName: string, feature: string) {
  const project = await registerProject(page, wsDir, wsName)
  const projectId = project.id
  await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: feature, title: `派发链演示 ${feature}` })
  const dir = (await forgeInvoke<{ dir: string }>(page, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, { workspaceDir: wsDir })).dir
  return { projectId, dir }
}

test('@web-e2e @m2 派发链·冒烟：意图发起→领取→简报→结算→概览即时（Step1-6 success 全链）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-'))
  const wsDir = join(fixtureRoot, 'ws-tdp')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp-feat'
    const { projectId, dir } = await setupWorld(page, wsDir, '派发链冒烟', FEATURE)
    const driver = createBridgeDriver(app)
    const eventsBefore = (await driver.events()).length

    // ── Step 1（意图入口）：夹具就位 = 就绪任务在场（前置全终态的 pending）──
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '派发链冒烟任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string; reused: boolean }
    expect(added.reused, 'addTask 新建（非复用）').toBe(false)

    // ── Step 2（领取）：pending→in_progress + dispatchPrompt 四段 + 审计 + 挂接 ──
    const claim = (await driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(claim.task?.taskStatus, '领取后 in_progress').toBe('in_progress')
    expect(claim.reclaimed, '首领非重入').toBe(false)
    expect(claim.dispatchPrompt, '简报人格段（task-executor，无标签）').toContain('You are a focused task executor.')
    expect(claim.dispatchPrompt, '简报约束块').toContain('<constraints>')
    expect(claim.dispatchPrompt, '简报动态信息块').toContain('<task-context>')
    expect(claim.dispatchPrompt, '动态块含 TASK_ID 自然键').toContain(`TASK_ID: ${added.slug}/${added.localId}`)
    expect(claim.dispatchPrompt, '简报类型策略块').toContain('<type-policy>')
    expect(claim.digest, 'digest = 12 hex 简报指纹').toMatch(/^[0-9a-f]{12}$/)
    // 单发重取即见（即时判据——无轮询）
    const detailAfterClaim = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: added.taskId })
    expect(detailAfterClaim.taskStatus, '读面单发即见 in_progress').toBe('in_progress')

    const db = openForgeDbAt(dir)
    try {
      const claimRow = db.prepare<unknown[], { verb: string; actor: string; session_id: string | null; dispatch_digest: string | null }>(
        `SELECT verb, actor, session_id, dispatch_digest FROM task_records WHERE task_id = ? AND verb = 'claim'`,
      ).get(added.taskId)
      expect(claimRow?.actor, 'claim 审计 actor = plugin-tool（tool 面同口径）').toBe('plugin-tool')
      expect(claimRow?.session_id, 'claim 审计记派发会话 id（Invariant）').toBe(DISP_SESSION)
      expect(claimRow?.dispatch_digest, 'claim 审计落 digest').toBe(claim.digest)
      const linkRow = db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE task_id = ? AND session_id = ?`,
      ).get(added.taskId, DISP_SESSION)
      expect(linkRow?.n, '挂接表落行（派发会话）').toBe(1)
    } finally {
      db.close()
    }

    // ── Step 3/4（派发 + 质量门）：钩子直调承载 agent 面；gate 四布尔 = Step 4 产物 ──
    // ── Step 5（结算）：completed + submit 审计（gate/commit/执行会话）──
    const COMMIT = 'abcd1234e5f67890abcd1234e5f67890abcd1234'
    const submit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: '派发链冒烟结算（gate 全过）',
      gate: { compile: true, fmt: true, lint: true, test: true },
      commitHash: COMMIT, sessionId: EXEC_SESSION,
    })) as SubmitTaskResult
    expect(submit.status, '结算落账 completed').toBe('completed')
    expect(submit.taskId, '结算返回同一任务').toBe(added.taskId)

    const db2 = openForgeDbAt(dir)
    try {
      const submitRow = db2.prepare<unknown[], { verb: string; actor: string; session_id: string | null; gate_json: string | null; commit_hash: string | null }>(
        `SELECT verb, actor, session_id, gate_json, commit_hash FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(added.taskId)
      expect(submitRow?.actor, 'submit 审计 actor = plugin-tool').toBe('plugin-tool')
      expect(submitRow?.session_id, 'submit 审计记执行会话 id（与 claim 派发会话相异可判——Invariant）').toBe(EXEC_SESSION)
      expect(submitRow?.gate_json, 'gate 四布尔结构化落账（Step4 产物）').toContain('"compile"')
      expect(submitRow?.commit_hash, 'git 提交哈希落审计（executor 代码仓写入面的账本侧）').toBe(COMMIT)
      const verbs = db2.prepare<unknown[], { verb: string }>(`SELECT verb FROM task_records WHERE task_id = ? ORDER BY id`).all(added.taskId).map((r) => r.verb)
      expect(verbs, '审计链 append-only：add → claim → submit（每动词一行）').toEqual(['add', 'claim', 'submit'])
    } finally {
      db2.close()
    }

    // 事件面：写动词各发射一次 tasks-changed（add/claim/submit → 3）
    const eventsAfter = await driver.events()
    expect(eventsAfter.length - eventsBefore, '写动词闭包尾部各发射一行事件').toBe(3)
    expect(eventsAfter.at(-1)?.payload.projectId, '事件载荷携带 projectId').toBe(projectId)

    // ── Step 6（概览即时）：dock 开概览 → 任务子 tab → 行呈新状态（completed）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const row = page.locator(ttItemOf(added.taskId)).first()
    await expect(row, '概览任务行在场（写入后浏览即见）').toBeVisible({ timeout: 30_000 })
    await expect(row, '任务行主行中文状态 tag = 已完成').toContainText(ZH_DONE)
    // 即时判据（读面）：写入返回后单次重取即见 completed——无 watch 无同步延迟
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(cards.find((c) => c.taskId === added.taskId)?.taskStatus, '概览列表单发重取即见 completed').toBe('completed')
    await expect(page.locator(OV_PANEL).first(), '概览面板持续在场（读路径活跃无阻塞）').toBeVisible()

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step2b 无就绪任务：空出口信号 + 零写入零事件', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2b-'))
  const wsDir = join(fixtureRoot, 'ws-tdp2b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2b-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const { projectId, dir } = await setupWorld(page, wsDir, '无就绪演示', 'tdp2b')
    const driver = createBridgeDriver(app)
    const eventsBefore = (await driver.events()).length

    // 空库盲选：无任务被领取——Z1 出口信号（task null + 空简报 + 非重入）
    const claim = (await driver.call('forgeTasks', 'claimTask', {
      projectId, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(claim.task, '空库盲选 → task = null（不制造虚假就绪）').toBeNull()
    expect(claim.dispatchPrompt, '空出口 dispatchPrompt = 空串').toBe('')
    expect(claim.digest, '空出口 digest = 空串').toBe('')
    expect(claim.reclaimed, '空出口 reclaimed = false').toBe(false)

    // 零写入（纯读出口）：task_records 零行 + 零事件发射
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_records`).get()?.n, '零审计行（纯读出口零写入）').toBe(0)
      expect(db.prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_session_links`).get()?.n, '零挂接行').toBe(0)
    } finally {
      db.close()
    }
    expect((await driver.events()).length, '空出口不发射事件').toBe(eventsBefore)

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step2c 前置未终态：守卫拒绝 + 未满足清单 + 零残留', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2c-'))
  const wsDir = join(fixtureRoot, 'ws-tdp2c')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2c-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp2c'
    const { projectId, dir } = await setupWorld(page, wsDir, '守卫拒绝演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 前置 P（in_progress——满足集外）+ 等待方 W（dependsOn P，pending）
    const p = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '前置 P（保持未终态）', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const w = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '等待方 W', type: 'doc', dependsOn: [p.localId],
    })) as { taskId: string; slug: string; localId: string }
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: p.slug, localId: p.localId }, sessionId: DISP_SESSION })

    // 显式 taskRef 领取 W → 依赖终态守卫拒绝（不产生部分领取或越序领取）
    const rejection = await rejectMessage(driver.call('forgeTasks', 'claimTask', {
      projectId, taskRef: { slug: w.slug, localId: w.localId }, sessionId: DISP_SESSION,
    }))
    expect(rejection, '守卫拒绝 = ERR_DEPENDENCIES_UNMET 面（未满足清单携带前置自然键 + 当前状态）').toContain('前置依赖未满足')
    expect(rejection, '清单含前置自然键').toContain(`${p.slug}/${p.localId}`)
    expect(rejection, '清单含前置当前状态（in_progress）').toContain('in_progress')
    expect(rejection, '满足集口径呈现').toContain('{completed, skipped}')

    // 零残留：W 保持 pending + W 零 claim 审计（单事务全成全败）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: w.taskId })
    expect(detail.taskStatus, '目标任务保持 pending（库不被破坏）').toBe('pending')
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'claim'`,
      ).get(w.taskId)?.n, 'W 零 claim 审计（拒绝零残留）').toBe(0)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step2d 盲选不领他会话 in_progress（双派发防线）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2d-'))
  const wsDir = join(fixtureRoot, 'ws-tdp2d')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-2d-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp2d'
    const { projectId, dir } = await setupWorld(page, wsDir, '盲选防线演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态（直插通道——不可经动词构造）：他会话挂接的 in_progress + 当前会话零挂接 + 无就绪 pending
    const db = openForgeDbAt(dir)
    const FOREIGN = 'e2e-tdp-other-dispatcher'
    let foreignTaskId = ''
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(FEATURE)?.id ?? ''
      foreignTaskId = `t-${FEATURE}-9.9`
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, created_at, updated_at)
         VALUES (?, ?, '9.9', '他会话进行中任务', 'doc', 'in_progress', 'feature', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(foreignTaskId, FEATURE, fid)
      db.prepare(
        `INSERT INTO task_session_links (task_id, session_id, created_at, updated_at)
         VALUES (?, ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(foreignTaskId, FOREIGN)
    })()
    db.close()

    // 会话 A 盲选：不领取他会话 in_progress（就绪选择仅扫 pending 池）
    const claim = (await driver.call('forgeTasks', 'claimTask', {
      projectId, sessionId: DISP_SESSION,
    })) as ClaimTaskResult
    expect(claim.task, '盲选不领他会话 in_progress（task = null）').toBeNull()
    expect(claim.reclaimed, '非重入形态').toBe(false)

    const db2 = openForgeDbAt(dir)
    try {
      // 零变更：该任务不进入重入路径（当前会话零挂接行）
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_session_links WHERE session_id = ?`,
      ).get(DISP_SESSION)?.n, '当前会话零挂接（零变更）').toBe(0)
      const status = db2.prepare<unknown[], { task_status: string }>(`SELECT task_status FROM tasks WHERE id = ?`).get(foreignTaskId)?.task_status
      expect(status, '他会话任务保持 in_progress（不双派发）').toBe('in_progress')
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step3b from 不匹配：结算拒绝 + 库不被破坏', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-3b-'))
  const wsDir = join(fixtureRoot, 'ws-tdp3b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-3b-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp3b'
    const { projectId, dir } = await setupWorld(page, wsDir, 'from 不匹配演示', FEATURE)
    const driver = createBridgeDriver(app)

    // 受控初态：任务被人工转移出 in_progress（suspended）+ 历史 claim 行（简报按 in_progress 假设持有）
    const db = openForgeDbAt(dir)
    const taskId = `t-${FEATURE}-3.1`
    db.transaction(() => {
      const fid = db.prepare<unknown[], { id: string }>(`SELECT id FROM features WHERE slug = ?`).get(FEATURE)?.id ?? ''
      db.prepare(
        `INSERT INTO tasks (id, slug, local_id, title, task_type, task_status, source_kind, source_id, created_at, updated_at)
         VALUES (?, ?, '3.1', '被人工挂起任务', 'doc', 'suspended', 'feature', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(taskId, FEATURE, fid)
      db.prepare(
        `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, session_id, created_at, updated_at)
         VALUES (?, 'claim', 'pending', 'in_progress', 'plugin-tool', ?, '2026-10-06T00:00:00.000Z', '2026-10-06T00:00:00.000Z')`,
      ).run(taskId, DISP_SESSION)
    })()
    db.close()

    // executor 持过期假设结算 → agent 面矩阵先验拒绝（仅 in_progress 可提交）
    const rejection = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: FEATURE, localId: '3.1' }, result: 'success',
      summary: '过期假设结算（应被拒）', sessionId: EXEC_SESSION,
    }))
    expect(rejection, '拒绝 = ERR_INVALID_TRANSITION（from 不匹配）').toContain('非法任务转移')
    expect(rejection, '校验面呈现实际当前态').toContain('suspended')

    // 库不被破坏：保持人工处置后状态 + 零 submit 审计（单事务拒绝零残留）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId })
    expect(detail.taskStatus, '任务保持 suspended（人工处置不被覆盖）').toBe('suspended')
    const db2 = openForgeDbAt(dir)
    try {
      expect(db2.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(taskId)?.n, '零 submit 审计（零残留）').toBe(0)
    } finally {
      db2.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step5b 受阻结算：blocked 落账 + reason 入审计 + 概览即时见', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-5b-'))
  const wsDir = join(fixtureRoot, 'ws-tdp5b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-5b-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp5b'
    const { projectId, dir } = await setupWorld(page, wsDir, '受阻结算演示', FEATURE)
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '受阻结算任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION })

    const REASON = '5b 演示受阻：质量门 lint 未过'
    const submit = (await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'blocked', reason: REASON, sessionId: EXEC_SESSION,
    })) as SubmitTaskResult
    expect(submit.status, 'in_progress→blocked').toBe('blocked')

    const db = openForgeDbAt(dir)
    try {
      const row = db.prepare<unknown[], { reason: string | null; session_id: string | null }>(
        `SELECT reason, session_id FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(added.taskId)
      expect(row?.reason, 'reason 落审计（task_records.reason 列）').toBe(REASON)
      expect(row?.session_id, '受阻结算记执行会话 id').toBe(EXEC_SESSION)
    } finally {
      db.close()
    }
    // blocked submit 不挂恢复钩子（无 blocked 后继在场 → restored 空）
    expect(submit.restored, '无恢复（restored 空）').toEqual([])

    // 概览即时见 blocked（UI 面 + 读面单发）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    const row = page.locator(ttItemOf(added.taskId)).first()
    await expect(row, '概览任务行在场').toBeVisible({ timeout: 30_000 })
    await expect(row, '行状态 tag = 已阻塞').toContainText(ZH_BLOCKED)
    const cards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(cards.find((c) => c.taskId === added.taskId)?.taskStatus, '读面单发即见 blocked').toBe('blocked')

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step5c/5d reason/summary 缺席：输入面拒绝（先于转移校验）', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-5cd-'))
  const wsDir = join(fixtureRoot, 'ws-tdp5cd')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-5cd-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp5cd'
    const { projectId, dir } = await setupWorld(page, wsDir, '输入面校验演示', FEATURE)
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '输入面校验任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION })

    // 5c：blocked 缺 reason → ERR_REASON_REQUIRED
    const noReason = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'blocked', sessionId: EXEC_SESSION,
    }))
    expect(noReason, 'blocked 缺 reason → ERR_REASON_REQUIRED 文案面').toContain('需要 reason')

    // 5d（对称边界）：success 缺 summary → ERR_SUMMARY_REQUIRED
    const noSummary = await rejectMessage(driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success', sessionId: EXEC_SESSION,
    }))
    expect(noSummary, 'success 缺 summary → ERR_SUMMARY_REQUIRED 文案面').toContain('需要 summary')

    // 双拒绝后：状态不变更（仍 in_progress）+ 零 submit 审计（不落部分审计）
    const detail = await refetchOnce<TaskDetail>(page, TASKS_CHANNELS.detail, { projectId, taskId: added.taskId })
    expect(detail.taskStatus, '两次拒绝后仍 in_progress（零变更）').toBe('in_progress')
    const db = openForgeDbAt(dir)
    try {
      expect(db.prepare<unknown[], { n: number }>(
        `SELECT COUNT(*) AS n FROM task_records WHERE task_id = ? AND verb = 'submit'`,
      ).get(added.taskId)?.n, '零 submit 审计（单事务全成全败）').toBe(0)
    } finally {
      db.close()
    }

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m2 派发链·Step6b 并发浏览无锁竞争：页签活跃期写入，单发重取即见新值', async () => {
  test.setTimeout(360_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-6b-'))
  const wsDir = join(fixtureRoot, 'ws-tdp6b')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m2-tdp-6b-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const FEATURE = 'tdp6b'
    const { projectId } = await setupWorld(page, wsDir, '并发浏览演示', FEATURE)
    const driver = createBridgeDriver(app)
    const added = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: FEATURE }, title: '并发浏览任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }

    // 前置：概览页签打开且读路径活跃（用户正在浏览）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await expect(page.locator(ttItemOf(added.taskId)).first(), '浏览态：pending 行在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(ttItemOf(added.taskId)).first()).toContainText('待处理')

    // 浏览进行中执行写动词（claim → submit）——WAL 读写并发，UI 不冻结不阻塞
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: added.slug, localId: added.localId }, sessionId: DISP_SESSION })
    const midCards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(midCards.find((c) => c.taskId === added.taskId)?.taskStatus, 'claim 写入返回后单发重取即见 in_progress').toBe('in_progress')
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: added.slug, localId: added.localId }, result: 'success',
      summary: '6b 并发浏览期结算', gate: { compile: true, fmt: true, lint: true, test: true }, sessionId: EXEC_SESSION,
    })
    const endCards = await refetchOnce<TaskCard[]>(page, TASKS_CHANNELS.list, { projectId, source: { kind: 'feature', slug: FEATURE } })
    expect(endCards.find((c) => c.taskId === added.taskId)?.taskStatus, 'submit 写入返回后单发重取即见 completed（不丢更新）').toBe('completed')

    // UI 读路径仍活跃（未冻结）：面板在场 + 行状态事件驱动收敛
    await expect(page.locator(OV_PANEL).first(), '概览面板持续在场（互不阻塞）').toBeVisible()
    await expect(page.locator(ttItemOf(added.taskId)).first(), '行状态收敛为新值').toContainText(ZH_DONE, { timeout: 30_000 })

    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
