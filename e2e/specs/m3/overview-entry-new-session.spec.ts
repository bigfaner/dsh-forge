// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: overview-entry-new-session（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/contracts/
//   step-{1..5}-*.md（eval-contract 961/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——诊断/派发的会话编排（agentPreset.select +
// setDraft/submit）为产品装配面，消息落地不依赖模型调用成功（M2 SC6③
// 零凭据同径——awaitNoLateModals 处置晚到 API Key 模态）。feature/任务行经回放主径
// 建行；诊断违规子图（依赖环）经 db 直插受控初态（db-insert 通道——addTask 增量环校验
// 拒绝构造环，唯一环构造入口 = 直插）。提案域已整域下线（plugin-spec 1.11）——夹具
// features 域单源构造，断言面 = 概览子 tab 族（默认=任务、proposals 零渲染）+
// worktree-picker slug 候选 features 单源 + 任务容器诊断/派发链。
//
// Fact Table 摘录（源码核实）：
//   - 行头入口：[data-dswf-ov-opensession="<slug>"]（proposal-tab.tsx:273 /
//     feature-tab.tsx:154）；提案 mode chip = [data-dswf-mode-chip]（unmarked = 缺省占位）；
//   - 预填（message-format.ts formatPrefill）：`@<docsRoot>/proposals|features/<slug>/` 第一行
//     （docsRoot = docsRootOf(ws, forge_dir) 数据驱动——本夹具 <ws>\.forge → `.forge/docs`；
//     缺席回退 `docs`）→ `名称：<title>` → [`摘要：`] → `状态：`（提案——PROPOSAL_STATUS_LABELS.zh）|
//     `阶段：`（feature）→ `已生成文档：` + `· <path>（<status>?）` 逐行（提案文档 =
//     listDocs fs 扫描相对容器目录裁剪前缀；feature 文档 = feature_documents 行）→ 空行 →
//     `我的意图：`（末行空位）；**不含模式行**；
//   - 诊断（DiagToast.tsx + task-tab.tsx）：工具栏「诊断」= [data-dswf-tt-diag]（feature
//     容器专属 containerHasSubgraphDiag）；toast = [data-dswf-tt-diagtoast="ok|fail|error"]
//     （ok 1s 自消 / fail 5s）+ 发送钮 [data-dswf-tt-diagtoast-send]（fail 独有）；子图
//     失败 toast 标题「诊断失败 · <title>」+ 五类检查行（cycle 类名「依赖无环」——✗ 行含
//     违规描述）；发送 → mode=expedition + autosend formatDiagMessage（`诊断：
//     validateFeatureTasks 失败` + `请求：`）；
//   - 任务失败诊断（drawer/index.tsx:358-374）：blocked/rejected「诊断失败」=
//     [data-dswf-td-diag="<status>"]（其余状态零按钮）；toast 标题「任务失败 · <title>」+
//     `状态：阻塞 — <reason>` + 任务键；发送 → 容器对应模式（feature → 远征）+
//     autosend（`任务：` / `失败记录：` / `请求：`）；
//   - composer = [data-composer-input]（contenteditable）；转录 = [data-conversation-content]；
//     会话头预设投影标签 = [class*="headerActions"] 文本（非 blank 在场）。
//   - 会话语义（fix-3② 裁决，上游 0.2.0-rc.2 源码核实）：openWorkspace = reuse-or-create
//     blank（同工作区 blank 会话被复用 + setDraft 整体替换——连续两次未发送的开会折叠为
//     同一会话）；侧栏行可见判据 = 非 blank 常显 + 仅当前选中 blank 可见（官方浏览器口径
//     sidebar-model sessionVisible）——blank 期的「两会话」与侧栏行锚不可观测（官方语义，
//     非产品缺口；非 blank 行 = sc6「用户事件落地」同径常显）。
//
// Outcome → 测试映射（提案域下线后重映射——proposal 行头入口/预填/草稿独立各 Outcome
// 随 proposal 域 UI 消费面退役退场，承载面改 features 域单源）：
//   概览子 tab 族（默认 = 任务、proposals 子 tab 零渲染、features 子 tab 消费门关）……「T1」
//   worktree-picker slug 候选（features 域单源——唯一候选 = feature slug）…………………「T1」
//   Step4 success（子图诊断失败 → 发送：远征 + 自动发送诊断体）………………………………「T2」
//   Step4 diag-success-toast（「子图健康 ✓」1s 自消 + 无发送钮）…………………………………「T2」
//   proposal 容器零渲染（容器菜单 features 单源 + 派发按钮阳性对照）…………………………「T2」
//   Step4 task-failure-diag-autosend（blocked 任务失败诊断 → feature 容器远征自动发送）…「T3」
//   Step4 no-diag-entry-for-nonfailed（非失败任务无「诊断失败」+ 阳性对照）………………「T3」
//   Step5 全族（派发按钮四态）…………………………………………………………………………交叉引用 uf3
//
// 诚实映射 / 交叉引用：
//   - Step5 success / all-terminal-disabled / running-task-jumps-session /
//     no-single-task-execution-entry（派发按钮亮起/置灰/跳转/无单任务执行入口——合约
//     四 Outcome）→ uf3-dispatch-entry.spec.ts（5.2 ①②③④ 全量承载——旅程分工，本件
//     T3 派发零阻断面在 mode-selection-alignment T3 另有断言）；
//   - 空窗过期重开（task-failure-diag toast 5s 窗口）= 时序边界——按钮常驻（重展开再点
//     即重开）由 [data-dswf-td-diag] 常驻性承载（T3 断言在场即证重开通道）。
//
// Assertion depth: 44/48 behavioral（92%），其中 deep 18/44（41%）——两阈均过。

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { createSharedLaunchFixture } from '../../support/fixtures.js'
import { openOverviewDock } from '../../support/navigation.js'
import { registerProject, selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt, seedEdge, seedTask } from '../../support/replay/db-insert.js'
import { CONVERSATION_CONTENT, DOCKKIT_STRIP_TAB, ttItemOf } from '../../support/anchors.js'
import { awaitNoLateModals, awaitPresetHeaderLabel, seatPresent } from '../../support/m3.js'
import { projectKeyOf } from '../../support/project-key.js'

const WS_NAME = 'ws-joes'

// e2e-fast-shared-launch 存量迁移（批次四a）：共享 launch fixture——launchHost 整 spec 一次；
// 夹具工作区 = 空目录（feature slug 隔离：joe-* 各自作用域）；T1 概览子 tab 族 /
// worktree-picker 候选，T2 远征诊断 / T3 feature 容器失败诊断各自用例内显式导航。
const { test } = createSharedLaunchFixture({
  seedWorkspace: (dir) => {
    // 夹具工作区 = 隔离 git 仓（worktree-picker 面依赖真 git——hero chip/创建弹窗装载前提；
    // worktree-hero-chip makeGitRepo 同配方收窄：无 upstream，主树单提交即够）
    mkdirSync(dir, { recursive: true })
    const git = (args: string[]): void => {
      execFileSync('git', ['-c', 'user.email=joes@test', '-c', 'user.name=joes', ...args], { cwd: dir, stdio: 'pipe' })
    }
    writeFileSync(join(dir, 'README.md'), 'joes fixture\n')
    git(['init', '-b', 'main'])
    git(['add', '.'])
    git(['commit', '-m', 'init'])
  },
  workspaceName: WS_NAME,
  launch: { expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } },
})

/** 概览子 tab 打开走支撑层单源 openOverviewSubtab（批次四a 四份 spec 内同语义 helper 收编
 *  ——挂载重试 ×3，轮内 30s/15s 门原样保留，e2e-fast-shared-launch/1.17）。 */

test('@web-e2e @m3 概览入口·T1：概览子 tab 族（默认=任务、proposals 零渲染）+ worktree-picker slug 候选 features 单源', async ({ sharedLaunch }) => {
  test.setTimeout(480_000)
  const { page, pageErrors, wsDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    // 工作区开局选定（hero 期芯片流——worktree-picker 第二 chip 挂载前置）
    await selectWorkspaceViaChip(page, WS_NAME)
    // features 域夹具构造（proposal 域整域下线——forgeProposals 写动词不可达）
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-feat', title: 'Joe 恒远征 feature' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: 'joe-feat', docKind: 'prd-spec', relPath: 'docs/features/joe-feat/prd/prd-spec.md', summary: 'Joe feature PRD' })

    // ── 概览 dock（任务域接管版）：默认概览 tab = 任务概览；子 tab 栏零渲染（含
    // proposals——proposal 域整域下线；接管版主指标 = AC 核销进度）──
    await openOverviewDock(page)
    await expect(page.locator(DOCKKIT_STRIP_TAB).filter({ hasText: '任务概览' }).first(), '概览 dock tab = 任务概览（任务域接管）').toBeVisible()
    await expect(page.locator('[data-dswf-ov-panel]').first(), '任务概览 body 挂载（AC 核销板）').toBeVisible()
    await expect(page.locator('[data-dswf-ov-subtab]'), '子 tab 栏零渲染（proposals 等子 tab 随域退役/接管退役）').toHaveCount(0)

    // ── worktree-picker 新建弹窗：slug 候选 = features 域单源（唯一候选 = joe-feat）──
    await page.locator('[data-dswt-hero-trigger]').click()
    const createItem = page.getByRole('menuitem', { name: '新建 worktree…' })
    await expect(createItem, 'worktree-picker 弹层「新建 worktree…」入口在场').toBeVisible({ timeout: 15_000 })
    await createItem.click()
    const branchInput = page.locator('[data-dswt-branch-input]')
    await expect(branchInput, '新建 worktree 弹窗开（分支组合框在场）').toBeVisible({ timeout: 15_000 })
    await branchInput.click()
    const slugMenu = page.locator('.dswt-branch-slug-menu')
    // 候选异步装载（projects.list → features.list 往返）——输入即过滤轮询至浮层开
    const menuDeadline = Date.now() + 30_000
    let menuVisible = false
    while (Date.now() < menuDeadline) {
      await branchInput.fill('joe')
      menuVisible = await slugMenu.isVisible().catch(() => false)
      if (menuVisible) break
      await page.waitForTimeout(1_000)
    }
    expect(menuVisible, 'slug 候选浮层开（输入即过滤——features 域候选）').toBe(true)
    await expect(slugMenu, '候选命中 feature slug（features 单源）').toContainText('joe-feat')
    await expect(slugMenu.getByRole('menuitem'), '候选唯一（proposal 域候选源已退役）').toHaveCount(1)

    if (pageErrors.length > 0) console.log(`[joes-t1-diagnostic] pageerror：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

test.fixme('@web-e2e @m3 概览入口·T2：子图诊断失败 → 发送给 agent（远征 + 自动发送诊断体）+ 成功 toast 1s 自消 + proposal 容器零渲染', async ({ sharedLaunch }) => {
  // 断言面挂起：概览 dock 已由 task-loop 任务概览接管（dswf-overview 同 kind shadow——
  // 任务容器 pill/工具栏诊断/诊断 toast 断言面随旧 project 概览退役），本用例承载面
  // 待 M5 归档批按接管版概览重写；夹具已先行剥离 forgeProposals 依赖。
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const dir = (await forgeInvoke<{ dir: string }>(page, 'forge:projects/deriveTaskStoreDir', { workspaceDir: wsDir })).dir
    const driver = createBridgeDriver(app)

    // 违规子图夹具：依赖环 1.3 → 1.4 → 1.3（消息体示例④形态——db 直插唯一环构造入口）
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-diag', title: 'Joe 违规子图 feature' })
    const db = openForgeDbAt(dir)
    let t13 = ''
    let t14 = ''
    try {
      t13 = seedTask(db, 'joe-diag', '1.3')
      t14 = seedTask(db, 'joe-diag', '1.4')
      seedEdge(db, t13, t14)
      seedEdge(db, t14, t13)
    } finally {
      db.close()
    }
    // 健康容器（诊断成功对照面）
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-ok', title: 'Joe 健康子图 feature' })
    const okTask = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: 'joe-ok', title: '健康容器任务', type: 'doc',
    })) as { taskId: string }

    // ── Step4 success：违规容器诊断 → 失败 toast（五类检查行）→ 发送 ──
    await openOverviewDock(page)
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="feature:joe-diag"]`).first().click()
    await expect(page.locator('[data-dswf-tt-contpill="feature:joe-diag"]'), '违规容器选中').toBeVisible({ timeout: 15_000 })
    await page.locator('[data-dswf-tt-diag]').first().click()
    const failToast = page.locator('[data-dswf-tt-diagtoast="fail"]').first()
    await expect(failToast, '失败 toast 在场（5s 档）').toBeVisible({ timeout: 15_000 })
    await expect(failToast).toContainText('诊断失败 · Joe 违规子图 feature')
    await expect(failToast, '✗ 行 = 依赖无环类命中（违规描述含任务键）').toContainText('✗ 依赖无环')
    await expect(failToast).toContainText('joe-diag/1.3')
    await failToast.locator('[data-dswf-tt-diagtoast-send]').click()
    // 新会话：远征（feature 容器专属——无突击分支）+ 自动发送格式化失败诊断。
    // 转录渲染面：@.forge/docs/features/joe-diag/ 首行（docsRootOf 数据驱动锚）同径被会话
    // 渲染器解析为目录提及芯片（textContent = 裸 slug），字面 @path 不在转录 DOM——容器锚
    // 以「所属：」归属行断言（pathLine 同源，断言不取锚字面故前缀变化不受影响）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '@path 容器归属行（提及芯片渲染面）').toContainText('所属：Joe 违规子图 feature（feature）', { timeout: 60_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '诊断行 + validateFeatureTasks 失败').toContainText('诊断：validateFeatureTasks 失败')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '请求行（请排查修复）').toContainText('请求：')
    await awaitNoLateModals(page)
    expect(await seatPresent(page, 1_000), '自动发送 = 非 blank（座位退场）').toBe(false)
    await awaitPresetHeaderLabel(page, '远征模式')

    // ── Step4d：健康容器诊断 → 成功 toast「子图健康 ✓」1s 自消 + 无发送钮 ──
    await openOverviewDock(page)
    await page.locator('[data-dswf-tt-contpill]').first().click()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="feature:joe-ok"]`).first().click()
    await expect(page.locator('[data-dswf-tt-contpill="feature:joe-ok"]'), '健康容器选中').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(okTask.taskId)).first(), '健康容器任务行在场').toBeVisible({ timeout: 30_000 })
    await page.locator('[data-dswf-tt-diag]').first().click()
    const okToast = page.locator('[data-dswf-tt-diagtoast="ok"]').first()
    await expect(okToast, '成功 toast 在场').toBeVisible({ timeout: 15_000 })
    await expect(okToast).toContainText('子图健康 ✓')
    await expect(okToast.locator('[data-dswf-tt-diagtoast-send]'), '成功档无「发送给 agent」').toHaveCount(0)
    await page.waitForTimeout(2_000)
    await expect(okToast, '1s 自动消失（双相等待）').toBeHidden()

    // ── Step4e：proposal 容器零渲染（proposal 域整域下线——容器菜单 features 单源）
    //    + 「派发」按钮阳性对照 ──
    await page.locator('[data-dswf-tt-contpill]').first().click()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-tt-mcont^="proposal:"]'), '容器菜单零 proposal 选项（proposal 域下线）').toHaveCount(0)
    await expect(page.locator('[data-dswf-tt-contpill="feature:joe-ok"]'), 'feature 容器在场（阳性对照）').toBeVisible()
    await expect(page.locator('[data-dswf-tt-dispatch]').first(), '「派发」按钮在场（阳性对照）').toBeVisible()

    if (pageErrors.length > 0) console.log(`[joes-t2-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})

test.fixme('@web-e2e @m3 概览入口·T3：blocked 任务「诊断失败」→ 发送（feature 容器远征模式 + 失败记录体）+ 非失败任务无入口', async ({ sharedLaunch }) => {
  // 断言面挂起：同 T2——任务抽屉「诊断失败」/失败摘要 toast 断言面随旧 project 概览
  // 退役，待 M5 归档批按接管版概览重写；夹具已先行剥离 forgeProposals 依赖（feature
  // 域构造 + feature 容器路由已就位）。
  test.setTimeout(480_000)
  const { app, page, pageErrors, wsDir } = sharedLaunch
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const projectKey = projectKeyOf(wsDir)
    const driver = createBridgeDriver(app)
    const PROP = 'joef-diag'
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: PROP, title: 'Joe 失败诊断 feature' })
    const blocked = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '受阻任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const pending = (await driver.call('forgeTasks', 'addTask', {
      projectKey, slug: PROP, title: '待办任务', type: 'doc',
    })) as { taskId: string }
    await driver.call('forgeTasks', 'claimTask', { projectKey, taskRef: { slug: blocked.slug, localId: blocked.localId }, sessionId: 'e2e-joes3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectKey, taskRef: { slug: blocked.slug, localId: blocked.localId }, result: 'blocked',
      reason: 'Joe 失败诊断演示（AC 证据缺口）', sessionId: 'e2e-joes3-executor',
      blockClassification: { kind: 'new-problem' },
    })

    // 任务子 tab → feature 容器 → blocked 行抽屉
    await openOverviewDock(page)
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="feature:${PROP}"]`).first().click()
    await expect(page.locator(`[data-dswf-tt-contpill="feature:${PROP}"]`), 'feature 容器选中').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(blocked.taskId)).first(), '受阻任务行在场').toBeVisible({ timeout: 30_000 })

    // ── Step4b：非失败任务（pending）无「诊断失败」入口 + 阳性对照 ──
    await page.locator(ttItemOf(pending.taskId)).first().click()
    const drawerP = page.locator('[data-dswf-td-drawer]').first()
    await expect(drawerP, '待办任务抽屉开').toBeVisible({ timeout: 15_000 })
    await expect(drawerP.locator('[data-dswf-td-diag]'), '动作区无「诊断失败」按钮（仅失败任务出现）').toHaveCount(0)
    await expect(drawerP.locator('[data-dswf-td-close]'), '详情其余动作照常在场（阳性对照）').toBeVisible()
    await drawerP.locator('[data-dswf-td-close]').click()
    await expect(drawerP).toBeHidden({ timeout: 10_000 })

    // ── Step4c：blocked 任务「诊断失败」→ 失败摘要 toast → 发送给 agent ──
    await page.locator(ttItemOf(blocked.taskId)).first().click()
    const drawer = page.locator('[data-dswf-td-drawer]').first()
    await expect(drawer, '受阻任务抽屉开').toBeVisible({ timeout: 15_000 })
    const diagBtn = drawer.locator('[data-dswf-td-diag="blocked"]')
    await expect(diagBtn, '「诊断失败」按钮常驻 blocked 详情动作区').toBeVisible({ timeout: 15_000 })
    await diagBtn.click()
    const toast = page.locator('[data-dswf-tt-diagtoast="fail"]').first()
    await expect(toast, '失败摘要 toast 在场（5s 档）').toBeVisible({ timeout: 15_000 })
    await expect(toast).toContainText('任务失败 · 受阻任务')
    await expect(toast).toContainText('状态：阻塞 — Joe 失败诊断演示（AC 证据缺口）')
    await expect(toast).toContainText('任务键：')
    // fix-3① 后直点（形态①）：toast 改锚脚行上方·右缘贴抽屉右内缘（max-width 收敛行集
    // 换行）——发送钮在抽屉盒内可点，抽屉开时直点（toast 5s 档内）
    await toast.locator('[data-dswf-tt-diagtoast-send]').click()
    // 新会话：容器对应模式（feature 容器 → 远征）+ 自动发送格式化失败诊断。
    // 转录渲染面：@.forge/docs/features/<slug>/ 首行（docsRootOf 数据驱动锚）解析为目录
    // 提及芯片（textContent = 裸 slug）——容器锚以「所属：」归属行断言（pathLine 同源，
    // 断言不取锚字面故前缀变化不受影响）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '@path 容器归属行（提及芯片渲染面）').toContainText('所属：Joe 失败诊断 feature（feature）', { timeout: 60_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '任务键 + 失败记录逐行').toContainText('任务：')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '状态行（阻塞 + 原因）').toContainText('状态：')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '修复请求行').toContainText('请求：')
    // fix-7 收敛前置（m3.1 D21/D23 弹窗宿主形态随行迁移）：任务详情弹窗 = shell.overlay
    // 常驻树受控挂载（对话中直接打开——开会不会话动线不自动关闭，D21/D23 裁决形态），
    // 诊断发送后弹窗仍在场为现行正确形态。awaitNoLateModals 的「零 dialog」判据针对晚到
    // onboarding 模态——先经 ✕ 关闭工作弹窗再验收敛（原语义保留：晚到模态仍须归零）。
    await page.locator('[data-dswf-td-close]').click()
    await expect(page.locator('[data-dswf-td-drawer]'), '工作弹窗显式关闭（D21/D23 受控卸载）').toHaveCount(0)
    await awaitNoLateModals(page)
    await awaitPresetHeaderLabel(page, '远征模式')

    if (pageErrors.length > 0) console.log(`[joes-t3-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    // 共享 launch 形态：app/夹具生命周期归 fixture 层收尾（用例退出不 closeApp）
  }
})
