// @feature:dsh-forge-m3-bootstrap-presets @web-e2e
// gen-test-scripts 产物 —— Journey: overview-entry-new-session（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-m3-bootstrap-presets/testing/overview-entry-new-session/contracts/
//   step-{1..5}-*.md（eval-contract 961/1100 通过）。
//
// 载体纪律（Hard Rule）：零真实模型——预填/诊断/派发的会话编排（openSession +
// agentPreset.select + setDraft/submit）为产品装配面，消息落地不依赖模型调用成功（M2 SC6③
// 零凭据同径——awaitNoLateModals 处置晚到 API Key 模态）。提案/任务/文档行经回放主径
// 建行；诊断违规子图（依赖环）经 db 直插受控初态（db-insert 通道——addTask 增量环校验
// 拒绝构造环，唯一环构造入口 = 直插）。
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
//     `状态：阻塞 — <reason>` + 任务键；发送 → 容器对应模式（blitz 提案 → 突击）+
//     autosend（`任务：` / `失败记录：` / `请求：`）；
//   - composer = [data-composer-input]（contenteditable）；转录 = [data-conversation-content]；
//     会话头预设投影标签 = [class*="headerActions"] 文本（非 blank 在场）。
//   - 会话语义（fix-3② 裁决，上游 0.2.0-rc.2 源码核实）：openWorkspace = reuse-or-create
//     blank（同工作区 blank 会话被复用 + setDraft 整体替换——连续两次未发送的开会折叠为
//     同一会话）；侧栏行可见判据 = 非 blank 常显 + 仅当前选中 blank 可见（官方浏览器口径
//     sidebar-model sessionVisible）——blank 期的「两会话」与侧栏行锚不可观测（官方语义，
//     非产品缺口；非 blank 行 = sc6「用户事件落地」同径常显）。
//
// Outcome → 测试映射：
//   Step1 success（blitz 行头入口：突击起步 + 预填格式化 + 不自动发送）……………………「T1」
//   Step1 multi-doc-prefill-boundary（多文档清单真实路径 + 无模式行 + 意图空位）…………「T1」
//   Step1 expedition-proposal-align（远征提案对齐 + 同构预填）………………………………………「T1」
//   Step1 no-mode-source-keeps-default（无溯源不切换 + chip 占位）………………………………「T1」
//   Step1 draft-independence（会话间输入面独立——新开不覆盖既有会话内容；fix-3② 诚实
//   观测 = 首会话发送落地[非 blank]后开第二渠道：新会话真新建+输入框预填该渠道上下文，
//   两会话行常驻可回访——blank 期 reuse-or-create 折叠为同会话，字面「未发送草稿保留」
//   不可观测）……………………………………………………………………………………………「T1」
//   Step2 success（补意图手动发送 = 预填全文入转录）/ empty-intent-send………………………「T1」
//   Step3 success + context-drift-proof（feature 渠道恒远征——不随语境漂移）………………「T1」
//   Step4 success（子图诊断失败 → 发送：远征 + 自动发送诊断体）………………………………「T2」
//   Step4 diag-success-toast（「子图健康 ✓」1s 自消 + 无发送钮）…………………………………「T2」
//   Step4 blitz-container-no-diag-button（突击容器无「诊断」+ 阳性对照）……………………「T2」
//   Step4 task-failure-diag-autosend（blocked 任务失败诊断 → 容器模式自动发送）…………「T3」
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

import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { FEATURES_CHANNELS } from '../../../packages/contracts/src/channels.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { createBridgeDriver } from '../../support/replay/executor.js'
import { openForgeDbAt, seedEdge, seedTask } from '../../support/replay/db-insert.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { bestSessionLog } from '../../support/session-files.js'
import { COMPOSER_INPUT, CONVERSATION_CONTENT, projectRowOf, sessionRowOf, ovSubtabOf, ttItemOf } from '../../support/anchors.js'
import { awaitNoLateModals, awaitPresetHeaderLabel, seatPresent } from '../../support/m3.js'

const WS_NAME = 'ws-joes'

/** 提案文档夹具（forge_dir/docs/proposals/<slug>/——listDocs fs 扫描源） */
function writeProposalDocs(wsDir: string, slug: string, docs: readonly string[]): void {
  const dir = join(wsDir, '.forge', 'docs', 'proposals', slug)
  mkdirSync(dir, { recursive: true })
  for (const name of docs) {
    writeFileSync(join(dir, name), `---\ntitle: "${name}"\nstatus: draft\n---\n\n# ${name}\n\n正文。\n`, 'utf8')
  }
}

/**
 * 夹具工作区全部会话 id（现行日志 mtime 升序 = 发送先后序——fix-3② Step1e 回访锚：
 * 目录名 = 账本 sessionId，findFixtureSession 同口径扩展多会话枚举）。
 */
function fixtureSessionIds(dshHome: string, fixtureSegment: string): string[] {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return []
  const found: { id: string; mtime: number }[] = []
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory() || !wsDir.name.includes(fixtureSegment)) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const log = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
      found.push({ id: sDir.name, mtime: log !== undefined ? statSync(log).mtimeMs : 0 })
    }
  }
  return found.sort((a, b) => a.mtime - b.mtime).map((entry) => entry.id)
}

test('@web-e2e @m3 概览入口·T1：行头「打开新会话」四渠道（突击/多文档/远征/无溯源）+ feature 恒远征 + 草稿独立 + 空意图发送', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes-ud-'))
  const dshHome = join(userData, 'dsh-home')
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    // 工作区开局选定（hero 期芯片流——会话面常驻 + 侧栏 ForgeWorkspacePanel 项目树物化，
    // Step1e 会话行断言依赖；sc1/mode-selection 同径）
    await selectWorkspaceViaChip(page, WS_NAME)
    const driver = createBridgeDriver(app)
    // 顺序纪律：提案行先于文档落盘——任务库惰性首开（首个 forge 域调用）触发发现面吸收
    // （docs/proposals/<slug>/proposal.md → INSERT OR IGNORE）；先写盘则吸收先行建档，
    // 显式 createProposal 撞 slug UNIQUE（discovery.ts 单向阀门）。
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: 'joe-blitz', title: 'Joe 多文档突击提案', mode: 'blitz' })
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: 'joe-exp', title: 'Joe 远征对齐提案', mode: 'expedition' })
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: 'joe-old', title: 'Joe 无溯源提案' })
    writeProposalDocs(wsDir, 'joe-blitz', ['proposal.md', 'research.md'])
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-feat', title: 'Joe 恒远征 feature' })
    await forgeInvoke(page, FEATURES_CHANNELS.upsertDoc, { projectId, featureSlug: 'joe-feat', docKind: 'prd-spec', relPath: 'docs/features/joe-feat/prd/prd-spec.md', summary: 'Joe feature PRD' })

    // ── Step1：blitz 提案行头 → 突击起步 + 预填（不自动发送）──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    await expect(page.locator(ovSubtabOf('proposals'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    // 展开行先行：预填文档清单取自 docsMap（useProposalDocs 按需装载——展开行才拉
    // listDocs；收起行打开会话 = 空清单）。真实用户审阅文档后开会的同径。
    const blitzRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Joe 多文档突击提案' }).first()
    await expect(blitzRow, '突击提案行在场').toBeVisible({ timeout: 30_000 })
    await blitzRow.locator('[data-dswf-ov-parent-toggle]').click()
    await expect(page.locator('[data-dswf-ov-doc="docs/proposals/joe-blitz/proposal.md"]').first(), '展开装载 proposal.md（docsMap 按需）').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dswf-ov-doc="docs/proposals/joe-blitz/research.md"]').first(), '展开装载 research.md').toBeVisible({ timeout: 15_000 })
    const blitzOpen = page.locator('[data-dswf-ov-opensession="joe-blitz"]').first()
    await expect(blitzOpen, '突击提案行头「打开新会话」在场').toBeVisible({ timeout: 30_000 })
    await blitzOpen.click()
    expect(await seatPresent(page), '新会话座位在场（blank 期）').toBe(true)
    const draftA = page.locator(COMPOSER_INPUT).last()
    await expect(draftA, 'composer 预填在场（draft 缝）').toBeVisible({ timeout: 30_000 })
    // 预填格式（multi-doc-prefill-boundary）——@ 锚数据驱动（forge_dir 投影）：
    await expect(draftA).toContainText('@.forge/docs/proposals/joe-blitz/')
    await expect(draftA).toContainText('名称：Joe 多文档突击提案')
    await expect(draftA).toContainText('状态：草稿')
    await expect(draftA).toContainText('已生成文档：')
    await expect(draftA, '文档清单 = 相对容器目录真实路径（proposal.md）').toContainText('· proposal.md')
    await expect(draftA, '多文档逐行（research.md）').toContainText('· research.md')
    await expect(draftA, '末尾「我的意图：」空位在场').toContainText('我的意图：')
    expect(await draftA.textContent(), '消息体不含模式行（模式由会话预设承载）').not.toContain('模式：')
    await page.waitForTimeout(2_000)
    await expect(draftA, '预填不自动发送（草稿留场）').toContainText('我的意图：')

    // ── 首会话预填发送落地（fix-3② 裁决的诚实观测前置——空意图合法消息，Step2b 同径）──
    // 官方 openWorkspace = reuse-or-create blank（上游 reuseOrCreateBlank：同工作区 blank
    // 会话被复用 + setDraft 整体替换）——首会话草稿未发送（仍 blank）时第二渠道「打开新
    // 会话」复用同一会话，合约 draft-independence 的「两会话 + 第一会话草稿原样保留」在
    // blank 期不可实现（官方语义，非产品缺口）。首会话经用户发送落地（非 blank）后，
    // 后续「打开新会话」方真新建——输入面独立 + 常驻可回访由此可诚实观测。
    await draftA.click()
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '首会话预填全文入转录（用户事件落地 = 非 blank）').toContainText('名称：Joe 多文档突击提案', { timeout: 60_000 })
    await awaitNoLateModals(page)

    // ── Step3 + 3b：feature 行头 → 固定远征（当前语境 = 突击——不漂移）──
    await openOverviewDock(page)
    await ensureNoBlockingDialog(page) // 晚到模态防拦截（首会话失败面漂移窗）
    await page.locator(ovSubtabOf('features')).click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const featOpen = page.locator('[data-dswf-ov-opensession="joe-feat"]').first()
    await expect(featOpen, 'feature 行头「打开新会话」在场').toBeVisible({ timeout: 30_000 })
    await featOpen.click()
    const deadline = Date.now() + 30_000
    let seatText = ''
    while (Date.now() < deadline) {
      seatText = (await page.locator('[data-slot="conversation.hero.agentPreset"]').first().textContent().catch(() => '')) ?? ''
      if (seatText.includes('远征') || seatText.includes('expedition')) break
      await page.waitForTimeout(1_000)
    }
    expect(seatText.includes('远征') || seatText.includes('expedition'), `feature 渠道恒远征（当前语境突击不漂移——label=${seatText}）`).toBe(true)
    const draftB = page.locator(COMPOSER_INPUT).last()
    await expect(draftB, 'feature 同构预填在场').toBeVisible({ timeout: 30_000 })
    await expect(draftB).toContainText('@.forge/docs/features/joe-feat/')
    await expect(draftB).toContainText('名称：Joe 恒远征 feature')
    await expect(draftB).toContainText('阶段：')
    // 第二会话预填发送落地（两会话均非 blank 常显——Step1e 回访断言面；空意图合法消息）
    // 晚到模态防拦截：首会话零凭据模型失败的 API Key onboarding 可晚于 awaitNoLateModals
    // 收敛窗挂载（数十秒漂移——M2 SC6③ 台账口径），发送点击前点掉
    await ensureNoBlockingDialog(page)
    await draftB.click()
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '第二会话预填入转录（独立输入面——该渠道上下文）').toContainText('名称：Joe 恒远征 feature', { timeout: 60_000 })
    await awaitNoLateModals(page)

    // ── Step1b：无溯源提案 → 不切换（保持远征）+ chip 缺省占位 ──
    // （执行序注：Step1e 回访块移测试末段——会话行回访触发右栏布局晚沉降回休眠，
    // 其后再开 dock 需 reveal 重拍（fix-3 实证）；先完成 dock 交互面再回访。）
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('proposals')).click()
    const oldRow = page.locator('[data-dswf-ov-parent]', { hasText: 'Joe 无溯源提案' }).first()
    await expect(oldRow).toBeVisible({ timeout: 30_000 })
    await expect(oldRow.locator('[data-dswf-mode-chip]'), 'mode chip 缺省占位').toHaveAttribute('data-dswf-mode-chip', 'unmarked')
    const oldOpen = page.locator('[data-dswf-ov-opensession="joe-old"]').first()
    await expect(oldOpen, '无溯源行头入口在场').toBeVisible({ timeout: 15_000 })
    await oldOpen.click()
    const deadline2 = Date.now() + 30_000
    let seat2 = ''
    while (Date.now() < deadline2) {
      seat2 = (await page.locator('[data-slot="conversation.hero.agentPreset"]').first().textContent().catch(() => '')) ?? ''
      if (seat2.includes('远征') || seat2.includes('expedition')) break
      await page.waitForTimeout(1_000)
    }
    expect(seat2.includes('远征') || seat2.includes('expedition'), `无溯源不切换（保持默认远征——label=${seat2}）`).toBe(true)

    // ── Step2b：空意图直接发送（自由文本输入——无字段校验拦截，消息照常发出）──
    const composer = page.locator(COMPOSER_INPUT).last()
    await expect(composer, '无溯源渠道预填在场').toContainText('名称：Joe 无溯源提案', { timeout: 30_000 })
    await ensureNoBlockingDialog(page) // 晚到模态防拦截（前两会话失败面漂移窗）
    await composer.click()
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '首条消息 = 预填上下文全文（草稿未被丢弃）').toContainText('名称：Joe 无溯源提案', { timeout: 60_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '消息体含「我的意图：」空位（空意图合法消息）').toContainText('我的意图：')
    await awaitNoLateModals(page)
    expect(await seatPresent(page, 1_000), '首回合后非 blank（座位退场）').toBe(false)
    await awaitPresetHeaderLabel(page, '远征模式')

    // ── Step1e：两会话常驻可回访（fix-3② 裁决后诚实观测面——末段执行）──
    // 侧栏行可见判据（官方浏览器口径，sidebar-model sessionVisible）：非 blank 常显、
    // blank 仅当前选中者可见——回访断言取非 blank 行（sc6「用户事件落地」同径）。
    // 行点回 → 转录恢复 = 中区会话面常驻（Page Composition）+ 既有会话内容不受新开影响。
    const projBlock = page.locator(projectRowOf(projectId))
    const [firstId, secondId] = fixtureSessionIds(dshHome, WS_NAME)
    expect(firstId, '首会话目录在盘（发送落地开户）').toBeDefined()
    expect(secondId, '第二会话目录在盘（两会话各自开户）').toBeDefined()
    const rowFirst = projBlock.locator(sessionRowOf(firstId as string)).first()
    const rowSecond = projBlock.locator(sessionRowOf(secondId as string)).first()
    await expect(rowFirst, '首会话行常驻可回访（用户事件落地 = 非 blank 常显）').toBeVisible({ timeout: 60_000 })
    await expect(rowSecond, '第二会话行常驻可回访（两会话均常驻）').toBeVisible({ timeout: 60_000 })
    // 晚到模态防拦截（末会话发送的失败面同窗漂移——回访点击前点掉）
    await ensureNoBlockingDialog(page)
    await rowFirst.click()
    await expect(page.locator(CONVERSATION_CONTENT).first(), '回访首会话：转录恢复（中区会话面常驻——Page Composition）').toContainText('名称：Joe 多文档突击提案', { timeout: 30_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '首会话内容不受新开影响（会话间独立）').toContainText('我的意图：')
    await ensureNoBlockingDialog(page) // 晚到模态防拦截（回访点击间隔窗）
    await rowSecond.click()
    await expect(page.locator(CONVERSATION_CONTENT).first(), '回访第二会话：转录恢复（会话间独立——新开不覆盖既有会话内容）').toContainText('名称：Joe 恒远征 feature', { timeout: 30_000 })

    if (pageErrors.length > 0) console.log(`[joes-t1-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 概览入口·T2：子图诊断失败 → 发送给 agent（远征 + 自动发送诊断体）+ 成功 toast 1s 自消 + 突击容器无诊断钮', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes2-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes2-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
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
    // 健康容器 + 突击容器（对照面）
    await forgeInvoke(page, FEATURES_CHANNELS.register, { projectId, slug: 'joe-ok', title: 'Joe 健康子图 feature' })
    const okTask = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'feature', slug: 'joe-ok' }, title: '健康容器任务', type: 'doc',
    })) as { taskId: string }
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: 'joe-blitzdiag', title: 'Joe 突击容器（无诊断钮）', mode: 'blitz' })
    const blitzTask = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: 'joe-blitzdiag' }, title: '突击容器任务', type: 'doc',
    })) as { taskId: string }

    // ── Step4 success：违规容器诊断 → 失败 toast（五类检查行）→ 发送 ──
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
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
    await page.locator(ovSubtabOf('tasks')).click()
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

    // ── Step4e：突击容器无「诊断」按钮（validateFeatureTasks 为 feature 域）+ 阳性对照 ──
    await page.locator('[data-dswf-tt-contpill]').first().click()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="proposal:joe-blitzdiag"]`).first().click()
    await expect(page.locator('[data-dswf-tt-contpill="proposal:joe-blitzdiag"]'), '突击容器选中').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(ttItemOf(blitzTask.taskId)).first(), '突击容器任务行在场（任务级入口仍可用）').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-tt-diag]'), '突击容器无工具栏「诊断」按钮').toHaveCount(0)
    await expect(page.locator('[data-dswf-tt-dispatch]').first(), '「派发」按钮在场（阳性对照）').toBeVisible()

    if (pageErrors.length > 0) console.log(`[joes-t2-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})

test('@web-e2e @m3 概览入口·T3：blocked 任务「诊断失败」→ 发送（突击容器模式 + 失败记录体）+ 非失败任务无入口', async () => {
  test.setTimeout(480_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes3-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-m3-joes3-ud-'))
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page, pageErrors } = launched
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const projectId = project.id
    const driver = createBridgeDriver(app)
    const PROP = 'joef-blitz'
    await driver.call('forgeProposals', 'createProposal', { projectId, slug: PROP, title: 'Joe 失败诊断突击提案', mode: 'blitz' })
    const blocked = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '受阻任务', type: 'doc',
    })) as { taskId: string; slug: string; localId: string }
    const pending = (await driver.call('forgeTasks', 'addTask', {
      projectId, source: { kind: 'proposal', slug: PROP }, title: '待办任务', type: 'doc',
    })) as { taskId: string }
    await driver.call('forgeTasks', 'claimTask', { projectId, taskRef: { slug: blocked.slug, localId: blocked.localId }, sessionId: 'e2e-joes3-dispatch' })
    await driver.call('forgeTasks', 'submitTask', {
      projectId, taskRef: { slug: blocked.slug, localId: blocked.localId }, result: 'blocked',
      reason: 'Joe 失败诊断演示（AC 证据缺口）', sessionId: 'e2e-joes3-executor',
    })

    // 任务子 tab → 突击容器 → blocked 行抽屉
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('tasks')).click()
    await expect(page.locator(ovSubtabOf('tasks'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    await page.locator('[data-dswf-tt-contpill]').first().click()
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 15_000 })
    await menu.locator(`[data-dswf-tt-mcont="proposal:${PROP}"]`).first().click()
    await expect(page.locator(`[data-dswf-tt-contpill="proposal:${PROP}"]`), '突击容器选中').toBeVisible({ timeout: 15_000 })
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
    // 新会话：容器对应模式（突击提案 → 突击）+ 自动发送格式化失败诊断。
    // 转录渲染面：@.forge/docs/proposals/<slug>/ 首行（docsRootOf 数据驱动锚）解析为目录
    // 提及芯片（textContent = 裸 slug）——容器锚以「所属：」归属行断言（pathLine 同源，
    // 断言不取锚字面故前缀变化不受影响）
    await expect(page.locator(CONVERSATION_CONTENT).first(), '@path 容器归属行（提及芯片渲染面）').toContainText('所属：Joe 失败诊断突击提案（突击提案）', { timeout: 60_000 })
    await expect(page.locator(CONVERSATION_CONTENT).first(), '任务键 + 失败记录逐行').toContainText('任务：')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '状态行（阻塞 + 原因）').toContainText('状态：')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '修复请求行').toContainText('请求：')
    await awaitNoLateModals(page)
    await awaitPresetHeaderLabel(page, '突击模式')

    if (pageErrors.length > 0) console.log(`[joes-t3-diagnostic] pageerror（零凭据模型失败面）：${pageErrors.slice(-3).join(' | ')}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
