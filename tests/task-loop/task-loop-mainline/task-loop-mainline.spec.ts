// plugin-task-loop 1.17 · task-loop-mainline 旅程 Playwright spec（journey =
// task-loop-mainline，module = task-loop——tests/<moduleName>/<journey>/ 约定树，
// Playwright project desktop-journeys 发现；e2e/playwright.config.ts desktop-journeys
// testDir '../tests' 已注册，零配置改动）。
//
// 契约溯源正本 = proposals/plugin-task-loop/testing/task-loop-mainline/contracts/contracts.md
// （R3——fix-4 裁决落形）。每条断言以注释标注来源契约条目 id（断言-契约溯源）。
//
// 触发面（R3 契约注记）：写动词经 e2e 测试桥 createBridgeDriver（env
// DSH_FORGE_TEST_BRIDGE=1，与 tool 面同一 dispatchRpc 入口）——恰三枚
// addTask/claimTask/submitTask（TEST_BRIDGE_VERBS.forgeTasks 白名单）；读面经服务面
// forge:tasks/* 八通道单发 invoke（refetchOnce——即时判据 Hard Rule，禁轮询兜底）。
// 零真实模型（Hard Rule）：拆解环节/dispatch 循环宿主/批量工具面不进本套件。
//
// 覆盖半径（R3 收缩后）：
//   - CT-MAINLINE-02.O1/O2（建卡落库 + 依赖边解析 + 计数一致——桥 addTask 重锚）
//   - CT-MAINLINE-03.O1（claim 序——桥 claimTask 重锚；偏序/循环轨迹归 1.18）
//   - CT-MAINLINE-04.O1/O2/O3（结算核销 success/blocked + 双 warn 契约 O3：判据漂移
//     warn 不拒写 + met=false 仍拒——桥 claim+submit）
//   - CT-MAINLINE-05.O1/O2/O3（看板 AC 核销计数呈现——AN-2 实锚计数口径）
//   - CT-MAINLINE-B4.O1/O2（只读结算门——零迁移 affordance 否定断言 + 正道可达）
//   - CT-MAINLINE-B5.O1/O2（spec 缺席独立收口——本套件全程零 spec 即 M2 必然态）
//   - CT-MAINLINE-B6.O1/O2（「无任务数据」降级呈现 + 恢复正向）
//   - CT-MAINLINE-B1/B2/B3、CT-MAINLINE-01：R3 移出 e2e（1.10 单测 13 例 + 1.18 真机走查
//     承载）——零残留断言，本 spec 不覆盖（契约 §溯源表同口径）。
//   - CT-MAINLINE-B6.O3（降级诊断留痕 warn）：实现降级径已补 warn 留痕（1.29 收尾批——
//     tasks-hub 降级轮询失败去重 warn + overview-tab projectId 缺席分支 warn）；本 spec
//     断言仍留痕 skip——真机 console 捕获断言随后续真机批回填。
//
// projectKey 口径（任务域归属键单源）：lib-path deriveDirName(ws)——与 task-loop.db
// project_key 写点同源（db/repositories/project-key.ts 单源函数）；seed/写/读三方同锚。
//
// 断言锚（实锚，overview-tab.tsx R2 回填）：`data-dswl-ov-wrap/-panel/-head`、
// `data-dswl-ov-ac`（文本 = `AC 核销 done/total（N%）`）、`data-dswl-ov-row={taskStatus}`
// （行内文本含 slug/localId 与 done/total，未结算 = 「—」）、`data-dswl-ov-empty`、
// `data-dswl-ov-error/-retry`。不断视觉坐标、不锁 DOM 层级。
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchHost } from '../../../e2e/support/launch.js'
import { forgeInvoke } from '../../../e2e/support/rpc.js'
import { refetchOnce, createBridgeDriver, type ReplayWriteDriver } from '../../../e2e/support/replay/executor.js'
import { openOverviewDock, revealRightbar } from '../../../e2e/support/navigation.js'
import { DOCKKIT_STRIP_TAB, RIGHTBAR_COL } from '../../../e2e/support/anchors.js'
import { openTaskLoopDb } from '../../../e2e/support/sqlite.js'
import { TASKS_CHANNELS } from '@dsh-forge/lib-api/channels'

// 归属键派生单源复用（lib-path deriveDirName——tests 树无 workspace dep 解析径，经插件侧
// node_modules 显式文件路径 ESM 动态 import；与 task-loop db project-key 同函数同值）
const { deriveDirName } = (await import(
  join(ROOT, 'plugins', 'project', 'node_modules', '@dsh-forge', 'lib-path', 'dist', 'index.js')
)) as { deriveDirName(workspaceDir: string): string }

// ── 契约夹具常量（判据原文——AC 逐字一致不变式的镜像源） ──
const SLUG = 'task-loop-mainline'
const AC_A = '判据甲：主线结算链端到端可达'
const AC_B = '判据乙：依赖边落库一致'
const SESSION = 'e2e-tlm-dispatch-s1'

interface TaskStatsView {
  readonly total: number
  readonly byStatus: Record<string, number>
}

interface TaskCardView {
  readonly taskId: string
  readonly slug: string
  readonly localId: string
  readonly taskStatus: string
  readonly containerSlug: string
  readonly prerequisites: readonly { readonly slug: string; readonly localId: string; readonly taskStatus: string }[]
}

/** 写动词拒绝面捕获（bridge 直调错误 message = 域 typed error 文案携错误码） */
async function rejectMessage(promise: Promise<unknown>): Promise<string> {
  return promise.then(() => 'unexpectedly-resolved', (cause: unknown) => String((cause as Error)?.message ?? cause))
}

// ── 启动夹具（每测试独立宿主——userData/dshHome 隔离；桥 env 开门） ──
interface Boot {
  readonly app: Awaited<ReturnType<typeof launchHost>>['app']
  readonly page: Page
  readonly driver: ReplayWriteDriver
  readonly projectKey: string
  readonly userData: string
  /** renderer 未捕获异常（launchHost 收集——B5/B6 零崩断言面） */
  readonly pageErrors: readonly string[]
}

async function bootHost(tag: string): Promise<Boot> {
  const ws = realpathSync(mkdtempSync(join(tmpdir(), `dsh-tlm-${tag}-ws-`)))
  const userData = mkdtempSync(join(tmpdir(), `dsh-tlm-${tag}-ud-`))
  const launched = await launchHost({ userData, env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { page } = launched
  await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: ws,
    name: `tlm-${tag}`,
    forgeDir: join(ws, '.forge'),
  })
  const projectKey = deriveDirName(ws)
  return { app: launched.app, page, driver: createBridgeDriver(launched.app), projectKey, userData, pageErrors: launched.pageErrors }
}

interface Card {
  readonly taskId: string
  readonly localId: string
}

/** CT-MAINLINE-02 触发面：桥 addTask 建卡（判据原文随卡） */
async function addCard(boot: Boot, title: string, ac: readonly string[], dependsOn?: readonly string[]): Promise<Card> {
  const added = (await boot.driver.call('forgeTasks', 'addTask', {
    projectKey: boot.projectKey,
    slug: SLUG,
    title,
    type: 'doc',
    acceptanceCriteria: ac,
    ...(dependsOn !== undefined ? { dependsOn } : {}),
  })) as { taskId: string; slug: string; localId: string; reused: boolean }
  return { taskId: added.taskId, localId: added.localId }
}

/** CT-MAINLINE-03 触发面：桥 claimTask 盲选领取（容器限定单键 slug） */
async function claimCard(boot: Boot, sessionId = SESSION): Promise<{ taskStatus: string; digest: string; reclaimed: boolean }> {
  const claim = (await boot.driver.call('forgeTasks', 'claimTask', {
    projectKey: boot.projectKey,
    sessionId,
    source: { slug: SLUG },
  })) as {
    task: { taskStatus: string } | null
    digest: string
    reclaimed: boolean
  }
  expect(claim.task, 'claim 信封携任务简报（task 非空）').not.toBeNull()
  return { taskStatus: claim.task!.taskStatus, digest: claim.digest, reclaimed: claim.reclaimed }
}

/** CT-MAINLINE-04 触发面：桥 submitTask 结算 */
async function submitCard(
  boot: Boot,
  card: Card,
  payload: Record<string, unknown>,
): Promise<{ status: string }> {
  return (await boot.driver.call('forgeTasks', 'submitTask', {
    projectKey: boot.projectKey,
    taskRef: { slug: SLUG, localId: card.localId },
    ...payload,
  })) as { status: string }
}

/** 读面单发 invoke（AN-5——forge:tasks/* 八通道，禁轮询兜底） */
async function listCards(page: Page, projectKey: string): Promise<TaskCardView[]> {
  return refetchOnce<TaskCardView[]>(page, TASKS_CHANNELS.list, { projectKey, slug: SLUG })
}

async function taskStats(page: Page, projectKey: string): Promise<TaskStatsView> {
  return refetchOnce<TaskStatsView>(page, TASKS_CHANNELS.stats, { projectKey, slug: SLUG })
}

// ── task-loop 概览 dock tab 导航（kind = dswf-overview，title locale『任务概览』——
//    既有 openOverviewDock 面向 plugin-project『项目概览』tab，两 tab 并存不混用） ──
const OV_BODY = '[data-dswl-ov-wrap]'

async function openTaskOverview(page: Page): Promise<void> {
  if ((await page.locator(OV_BODY).first().isVisible().catch(() => false)) === true) return
  await revealRightbar(page)
  const stripTab = page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '任务概览' }).first()
  const entry = page.locator(RIGHTBAR_COL).locator('button', { hasText: '任务概览' }).first()
  for (let attempt = 0; attempt < 3; attempt++) {
    const appeared = await stripTab
      .or(entry)
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    if (appeared) break
    await revealRightbar(page)
  }
  await expect(stripTab.or(entry), 'task-loop 概览 dock 入口在场（strip 页签 | guide 入口卡）').toBeVisible({ timeout: 10_000 })
  if ((await stripTab.isVisible().catch(() => false)) === true) {
    await stripTab.click()
  } else {
    await entry.click()
  }
  await expect(page.locator(OV_BODY).first(), 'task-loop 概览 tab body 挂载（dswl-ov-wrap）').toBeVisible({ timeout: 30_000 })
}

// ─────────────────────────────────────────────────────────────────────────────

test('@task-loop-e2e @task-loop-mainline 主线全链：建卡→依赖边→领取→结算→看板核销计数（CT-02/03/04/05 + B4 + B5）', async () => {
  test.setTimeout(420_000)
  const env = await bootHost('golden')
  const { page, projectKey, pageErrors } = env
  try {
    // ── CT-MAINLINE-02.O1：桥 addTask 建卡信封 + 依赖边逐条一致（AN-1 + AN-5） ──
    const a = await addCard(env, '主线任务甲', [AC_A])
    const b = await addCard(env, '主线任务乙', [AC_B], [a.localId])
    expect(a.localId, '甲卡 localId 分配（容器键空间顺延）').toBeTruthy()
    const cards = await listCards(page, projectKey)
    expect(cards, 'list-tasks 两卡在列（slug 容器）').toHaveLength(2)
    const cardB = cards.find((c) => c.localId === b.localId)
    expect(cardB, '乙卡在列').toBeDefined()
    expect(
      cardB!.prerequisites.map((p) => `${p.slug}/${p.localId}`),
      'CT-MAINLINE-02.O1：depends_on 解析为依赖边且与提交一致',
    ).toEqual([`${SLUG}/${a.localId}`])
    expect(cardB!.containerSlug, '容器键 = slug 本身').toBe(SLUG)

    // ── CT-MAINLINE-02.O2：task-stats 计数与建卡数一致（AN-5） ──
    const stats = await taskStats(page, projectKey)
    expect(stats.total, 'CT-MAINLINE-02.O2：容器任务计数 = 建卡数').toBe(2)
    expect(stats.byStatus.pending, '建卡初态 = 待派发').toBe(2)

    // ── CT-MAINLINE-B4.O1（前置态）：看板只读呈现——未结算行「—」+ 零迁移 affordance ──
    await openTaskOverview(page)
    const rowA0 = page.locator('[data-dswl-ov-row="pending"]').filter({ hasText: `${SLUG}/${a.localId}` })
    await expect(rowA0, 'B4.O1/CT-05.O3 前置：未结算任务行呈现（pending）').toBeVisible({ timeout: 30_000 })
    await expect(rowA0, '未结算行 AC 列「—」占位（CT-05.O3 计数口径）').toContainText('—')
    // B4.O1 零迁移 affordance 否定断言（Hard Rule：概览零拖拽/零 completed 直迁控件）
    await expect(page.locator('[data-dswl-ov-rows] button'), 'B4.O1：行列表零按钮（零迁移 affordance）').toHaveCount(0)
    await expect(page.locator('[data-dswl-ov-rows] [draggable]'), 'B4.O1：行列表零拖拽载体').toHaveCount(0)
    const statsBefore = await taskStats(page, projectKey)
    // 纯读投影（bug 9543f496 修型——比对锚 = CT-02.O2 打开看板前快照，非跨 claim/submit）
    expect(statsBefore, 'B4.O1 纯读投影：打开看板前后任务域计数零变化').toEqual(stats)

    // ── CT-MAINLINE-03.O1：桥 claimTask 领取——信封 + 状态迁移执行中（AN-1 + AN-5） ──
    const claimed = await claimCard(env)
    expect(claimed.taskStatus, 'CT-MAINLINE-03.O1：领取后任务状态迁移执行中').toBe('in_progress')
    expect(claimed.reclaimed, '首领非重入').toBe(false)
    expect(claimed.digest, 'claim 信封携简报指纹（digest 12 hex）').toMatch(/^[0-9a-f]{12}$/)
    const afterClaim = await listCards(page, projectKey)
    expect(
      afterClaim.find((c) => c.localId === a.localId)?.taskStatus,
      'CT-MAINLINE-03.O1：list-tasks 状态可见迁移（单发即见）',
    ).toBe('in_progress')

    // ── CT-MAINLINE-04.O1：桥 submitTask success 结算——终态迁移 + 结算 append（AN-1） ──
    const settled = await submitCard(env, a, {
      result: 'success',
      summary: '主线结算链 e2e 交付',
      acceptanceCriteria: [{ criterion: AC_A, met: true, evidence: 'spec 定向执行绿（反例留痕见任务日志）' }],
      gate: { compile: true, fmt: true, lint: true, test: true },
    })
    expect(settled.status, 'CT-MAINLINE-04.O1：结算信封终态 completed').toBe('completed')
    const afterSettle = await listCards(page, projectKey)
    expect(afterSettle.find((c) => c.localId === a.localId)?.taskStatus, 'list-tasks 呈现 completed 终态').toBe('completed')

    // ── CT-MAINLINE-05.O1：看板主指标计数 = 结算水化聚合（AN-2 计数口径） ──
    const acLabel = page.locator('[data-dswl-ov-ac]')
    await expect(
      acLabel,
      'CT-MAINLINE-05.O1：主指标 = AC 核销 1/1（100%）——sum(done)/sum(total) 单结算行',
    ).toHaveText('AC 核销 1/1（100%）', { timeout: 15_000 })
    const rowA = page.locator('[data-dswl-ov-row="completed"]').filter({ hasText: `${SLUG}/${a.localId}` })
    await expect(rowA, '已结算行行内 done/total = 最新结算行 acProgress').toContainText('1/1')
    const rowB = page.locator('[data-dswl-ov-row="pending"]').filter({ hasText: `${SLUG}/${b.localId}` })
    await expect(rowB, 'CT-MAINLINE-05.O3：未结算行「—」与已结算行并存可辨').toContainText('—')

    // ── CT-MAINLINE-B4.O1 后效 + O2：结算门只封绕道不封正道——正道结算后看板反映终态 ──
    expect(await taskStats(page, projectKey), 'B4.O1 状态后效：正道结算后计数 = completed 1 + pending 1（unmetPending 随前置终态收敛）').toEqual({
      total: 2,
      byStatus: { pending: 1, in_progress: 0, completed: 1, blocked: 0, suspended: 0, interrupted: 0, skipped: 0, rejected: 0 },
      unmetPending: 0,
      gatedPending: 0,
    })
    await expect(rowA, 'B4.O2：completed 呈现经 submitTask 结算门产生（同任务）').toBeVisible()

    // ── CT-MAINLINE-B5.O1/O2：spec 缺席独立收口（全程零 spec = M2 必然态） ──
    expect(await listCards(page, projectKey), 'B5.O1：任务域零 spec 相关错误信封（全链各步信封均成）').toHaveLength(2)
    await expect(page.locator('[data-dswl-ov-empty]'), 'B5.O2：有结算数据时零「无任务数据」误降级').toHaveCount(0)
    await expect(
      page.locator('[data-dswl-ov-error]'),
      '零错误相位（B5 任务域零报错照常收口）',
    ).toHaveCount(0)
    expect(pageErrors, 'B5：全程零 renderer 未捕获异常').toEqual([])
  } finally {
    await closeApp(env.app)
  }
})

test('@task-loop-e2e @task-loop-mainline CT-04.O2：blocked 结算——reason 必填入账 + 看板零核销计数呈现', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('blocked')
  const { page, projectKey } = env
  try {
    const a = await addCard(env, '受阻任务', [AC_A])
    await claimCard(env)
    const settled = await submitCard(env, a, {
      result: 'blocked',
      reason: 'e2e 受阻结算：上游锚缺席待裁决',
      blockClassification: { kind: 'new-problem' },
    })
    expect(settled.status, 'CT-MAINLINE-04.O2：结算信封终态 blocked').toBe('blocked')
    const cards = await listCards(page, projectKey)
    expect(cards.find((c) => c.localId === a.localId)?.taskStatus, 'list-tasks 呈现 blocked 终态').toBe('blocked')
    // O2 判定面：结算证据含非空 reason——可观察呈现 = 最新结算行零核销计数（blocked 行
    // acResults 空 → acProgress 缺席 → 行内「—」），终态 blocked（AN-2 计数口径）
    await openTaskOverview(page)
    const row = page.locator('[data-dswl-ov-row="blocked"]').filter({ hasText: `${SLUG}/${a.localId}` })
    await expect(row, 'blocked 行呈现终态').toBeVisible({ timeout: 30_000 })
    await expect(row, 'blocked 结算零核销计数（历史不入 done 分母）').toContainText('—')
    await expect(page.locator('[data-dswl-ov-ac]'), '零 met 判据 = 无核销数据呈现').toHaveText('无核销数据', { timeout: 15_000 })
  } finally {
    await closeApp(env.app)
  }
})

test('@task-loop-e2e @task-loop-mainline CT-04.O3：双 warn 契约——判据漂移 warn 不拒写（结算落账）+ met=false 仍拒（保持执行中）', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('acmismatch')
  const { page, projectKey, userData } = env
  try {
    const a = await addCard(env, '交叉校验任务', [AC_A])
    await claimCard(env)
    // O3 形态①（契约溯源：1.6 双 warn 机械门① plugins/task-loop/host/domain/tasks/submit.ts:381
    //   ac-criteria-drift 仅 emitDiag warn 不拒写——已裁决契约，不改产品代码；真机断言形态
    //   对齐 task-loop-double-warn-gates spec 先例）：criterion 与任务 AC 非逐字一致 → 结算
    //   照常落账 completed（原「拒结算零行落库」断言随契约退役）
    const DRIFTED = `${AC_A}（被改写）`
    const drifted = await submitCard(env, a, {
      result: 'success',
      summary: '判据被改写的越权结算（warn 不拒写）',
      acceptanceCriteria: [{ criterion: DRIFTED, met: true, evidence: 'x' }],
      gate: { test: true },
    })
    expect(drifted.status, 'CT-04.O3 形态①：判据漂移 warn 不拒写（结算信封终态 completed）').toBe('completed')
    const cardsAfterDrift = await listCards(page, projectKey)
    expect(cardsAfterDrift.find((c) => c.localId === a.localId)?.taskStatus, '漂移结算落账：list-tasks 呈现 completed').toBe('completed')
    // 漂移判据原文在账（warn 不拒写的状态后果——结算域账 ac_results 携原文；ac-criteria-drift
    // 事件捕获缝缺席 → 留痕 skip 同文件尾 B6.O3 口径，发射由 domain-tasks/verbs.test.ts 注入桩 pin）
    const db = openTaskLoopDb(userData)
    try {
      const row = db.prepare(
        `SELECT ac_results_json FROM task_settlements WHERE task_id = ? ORDER BY id DESC LIMIT 1`,
      ).get(a.taskId) as { ac_results_json?: string } | undefined
      const acResults = JSON.parse(row?.ac_results_json ?? '[]') as readonly { criterion: string }[]
      expect(acResults.map((r) => r.criterion), 'ac_results 携漂移判据原文（warn 不拒写——原文在账）').toEqual([DRIFTED])
    } finally {
      db.close()
    }

    // O3 形态②：任一 met=false → 拒（ERR_AC_NOT_MET——逐项闭环硬门仍在）
    const b = await addCard(env, '未闭环任务', [AC_B])
    await claimCard(env)
    const unmet = await rejectMessage(
      submitCard(env, b, {
        result: 'success',
        summary: '未闭环结算（应拒）',
        acceptanceCriteria: [{ criterion: AC_B, met: false, evidence: '未完成' }],
        gate: { test: true },
      }),
    )
    expect(unmet, 'CT-04.O3 形态②：met=false 拒结算（域拒绝文案——errors.ts AcNotMetError message）').toContain('AC 逐项核验未通过')
    // 拒结算后任务保持 claim 态（State 断言）
    const cards = await listCards(page, projectKey)
    expect(cards.find((c) => c.localId === b.localId)?.taskStatus, '拒结算后任务保持执行中').toBe('in_progress')
    const stats = await taskStats(page, projectKey)
    expect(stats.byStatus.completed ?? 0, '漂移结算 1 completed（形态①落账）').toBe(1)
    expect(stats.byStatus.in_progress, '执行中计数保持（拒结算零迁移）').toBe(1)
  } finally {
    await closeApp(env.app)
  }
})

test('@task-loop-e2e @task-loop-mainline CT-05.O2：多次结算取最新行——blocked 历史不残留', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('latestwins')
  const { page } = env
  try {
    const a = await addCard(env, '反复结算任务', [AC_A])
    await claimCard(env)
    await submitCard(env, a, {
      result: 'blocked',
      reason: '第一轮受阻',
      blockClassification: { kind: 'new-problem' },
    })
    await openTaskOverview(page)
    await expect(page.locator('[data-dswl-ov-ac]'), 'blocked 后：历史零核销计数（行「—」/无核销数据）').toHaveText(
      '无核销数据',
      { timeout: 15_000 },
    )
    // 最新行覆写：blocked → completed 直达（结算矩阵先验）
    const settled = await submitCard(env, a, {
      result: 'success',
      summary: '第二轮成功结算',
      acceptanceCriteria: [{ criterion: AC_A, met: true, evidence: '复验绿' }],
      gate: { test: true },
    })
    expect(settled.status, 'blocked→completed 直达终态').toBe('completed')
    await expect(
      page.locator('[data-dswl-ov-ac]'),
      'CT-05.O2：呈现只反映最新行（done/total = 最新 acProgress）',
    ).toHaveText('AC 核销 1/1（100%）', { timeout: 15_000 })
    const row = page.locator('[data-dswl-ov-row="completed"]').filter({ hasText: `${SLUG}/${a.localId}` })
    await expect(row, '最新行计数呈现、blocked 态历史计数不残留').toContainText('1/1')
  } finally {
    await closeApp(env.app)
  }
})

test('@task-loop-e2e @task-loop-mainline B6：零数据降级呈现「无任务数据」+ 结算到达恢复正向', async () => {
  test.setTimeout(300_000)
  const env = await bootHost('degrade')
  const { page, pageErrors } = env
  try {
    // B6.O1：投影消费面零任务数据 → 降级容器锚在场、计数占位、零错误弹层
    await openTaskOverview(page)
    await expect(page.locator('[data-dswl-ov-empty]'), 'B6.O1：降级容器锚「无任务数据」在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswl-ov-ac]'), 'B6.O1：计数占位呈现').toHaveText('无核销数据')
    await expect(page.locator('[data-dswl-ov-error]'), 'B6.O1：零错误相位（不报错）').toHaveCount(0)
    expect(pageErrors, 'B6.O1：零未处理异常（不崩）').toEqual([])
    // B6.O2：结算到达（复用桥三枚链）→ 降级态消失、AC 进度计数正常
    const a = await addCard(env, '降级恢复任务', [AC_A])
    await claimCard(env)
    const settled = await submitCard(env, a, {
      result: 'success',
      summary: '降级恢复结算',
      acceptanceCriteria: [{ criterion: AC_A, met: true, evidence: '恢复正向' }],
      gate: { test: true },
    })
    expect(settled.status).toBe('completed')
    // 重开 tab（keyed body 非激活即卸载——切离再切回 = 真实重挂载）
    await openOverviewDock(page)
    await openTaskOverview(page)
    await expect(page.locator('[data-dswl-ov-empty]'), 'B6.O2：降级锚离场（不锁存）').toHaveCount(0, { timeout: 15_000 })
    await expect(
      page.locator('[data-dswl-ov-ac]'),
      'B6.O2：AC 进度计数正常呈现（CT-05.O1 口径）',
    ).toHaveText('AC 核销 1/1（100%）', { timeout: 15_000 })
  } finally {
    await closeApp(env.app)
  }
})

// ── CT-MAINLINE-B6.O3 留痕 skip（契约/实现不一致已 fix/disc 上报——见文件头注记） ──
test('B6.O3 留痕 skip（占位）', () => {
  test.skip(true, '降级诊断留痕（emitDiag warn）在实现降级径缺席（tasks-hub 降级轮询静默 + projectKey 缺席分支零发射）——契约/实现不一致经 recordBug 上报 fix/disc，禁脚本内就地调和')
})
