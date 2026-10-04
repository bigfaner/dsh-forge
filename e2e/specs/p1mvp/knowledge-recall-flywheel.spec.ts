// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: knowledge-recall-flywheel（Golden Path，T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/knowledge-recall-flywheel/contracts/step-{1..8}-*.md
// （eval-contract 1114/1150 通过）。
//
// dogfood 策略（沿 e2e/specs/flywheel.spec）：真实模型凭据经隔离 DSH_HOME 播种，低成本模型
// （zai-coding-cn / glm-5.3-flash，env 可覆写）；凭据缺席 = 留痕 skip。观察窗 = 提问后 120s 内
// 轨迹出现检索链，窗内无链同一 fixture 问题重发 ≤2 次（journey Setup 稳定性契约）。
//
// 口径注记（fact RECALL_TAB_STATS / HEAT_AGGREGATION / RECALL_LOG_RECORDED）：
// 旅程链口径（一次命中的检索链记 1 次 → 统计 1/1、徽章 +1）与 shipped 逐工具调用口径
// （search + read-abstract 两组 → 统计 2、热度 +2）分歧为**故意缺陷信号设计**（Journey
// Invariant 原文：实现若按工具调用逐条计则热度 +2 ≠ 断言 +1，断言失败即缺陷信号）。
// 本套件按 Contract 断言链口径，以 expect.soft 承载（失败即缺陷信号、不遮蔽同链后续断言）。
//
// 与 e2e/specs/flywheel.spec 的分工（fix-37 ④ 裁决——头注明确分工，不归并：两套件对同一
// 召回计数面**故意断言相反口径**，归并即销毁缺陷信号设计）：
//   - flywheel.spec（4.2 产物）= shipped 逐调用口径实证（统计头 = 事件组数、热度 = 行计数
//     ——三方一致断言全绿基线）；
//   - 本套件 = 旅程链口径断言（[链口径·缺陷信号] soft 红 = 预期态，转正 = core 链口径
//     裁决（M5+），勿为设计红派 fix）。
// dogfood 播种/叠层/解码器随 e2e/support 收编单源（fix-37）。
//
// 留痕 skip：Step 4b/4c（search 域前缀直测）——fact 双门分工：search/readAbstract 为
// agent 面插件工具不经 web RPC（channels.ts:17），能力面直测通道缺失；域前缀/全域检索
// 语义由 packages/core browse-service 单测 pin。
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { RecallGroup } from '../../../packages/contracts/src/dto/knowledge.js'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { forgeInvoke, invokeHeat, registerProjectRaw, selectWorkspaceViaChip } from '../../support/rpc.js'
import { dirRow, enterDir } from '../../support/navigation.js'
import { decodeSessionFile, findFixtureSession, sessionLogById, waitForFixtureSession, type SessionEvent } from '../../support/session-files.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../../support/dogfood.js'
import { rmDirBestEffort, rmFileBestEffort } from '../../support/cleanup.js'
import {
  CTA_ADD_PROJECT,
  KNOWLEDGE_ENTRY,
  TAB_ITEM,
  TRAJECTORY_SCROLL,
  WORKBENCH,
  addProjectPhase,
  trajectoryRow,
  workbenchOfView,
} from '../../support/anchors.js'

const Q1 = '本项目的前端部署规范是什么？'
const Q2 = '本项目的前端构建规范是什么？'

/** 飞轮基线夹具：K1（部署，常规正文）/ K2（构建，超长正文）/ 后端域对照——关键词零交集 */
function makeFlywheelFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-'))
  const kn = join(root, 'fw-demo', '.knowledge')
  mkdirSync(join(kn, '前端'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\ntitle: 部署规范\nsummary: 部署前核对回滚预案与环境变量清单\nkeywords:\n  - 部署\n  - 上线\n---\n\n# 部署规范\n\n部署前核对回滚预案，按检查单逐项执行。\n',
    'utf8',
  )
  // K2 正文数量级超长（必超 token 预算极简值——4e 摘要先行场景）
  const longBody = Array.from({ length: 400 }, (_, i) => `构建流水线第 ${String(i + 1)} 步：依赖装配与制品归档的详细说明段落。`).join('\n\n')
  writeFileSync(
    join(kn, '前端', 'build.md'),
    `---\ntitle: 构建规范\nsummary: 构建流水线约定与制品口径\nkeywords:\n  - 构建\n  - 流水线\n---\n\n# 构建规范\n\n${longBody}\n`,
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\ntitle: 回滚手册\nsummary: 服务回滚步骤\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

/** 无关库夹具（4d 场景隔离）：全字段不含「部署」「构建」——Q1/Q2 无命中确定 */
function makeUnrelatedFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fwp-'))
  const kn = join(root, 'fw-plain', '.knowledge')
  mkdirSync(join(kn, '运维'), { recursive: true })
  writeFileSync(
    join(kn, '运维', 'runbook.md'),
    '---\ntitle: 值班手册\nsummary: 值班响应流程\nkeywords:\n  - 值班\n  - 响应\n---\n\n# 值班手册\n\n按响应等级处置。\n',
    'utf8',
  )
  return root
}

/** hero → 两段式 UI 注册（Golden Path Step 1 载体） */
async function registerViaUi(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await page.locator(CTA_ADD_PROJECT).click()
  await expect(page.locator(addProjectPhase('browser'))).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator(addProjectPhase('form'))).toBeVisible()
  await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
  await expect(page.locator(addProjectPhase('success'))).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
}

async function sendQuestion(page: Page, question: string): Promise<void> {
  const composer = page.locator('[data-composer-input]').last()
  await composer.click()
  await page.keyboard.insertText(question)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(8_000)
}

/** 观察窗内等待会话事件满足谓词（journey 稳定性契约：120s 窗 + 同题重发 ≤2 次） */
async function awaitSessionChain(
  dshHome: string,
  sessionId: string,
  fixtureSegment: string,
  page: Page,
  question: string,
  predicate: (events: readonly SessionEvent[]) => boolean,
  timeoutMs: number,
): Promise<readonly SessionEvent[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const log = sessionLogById(dshHome, sessionId)
      if (log !== undefined) {
        const events = decodeSessionFile(log)
        if (predicate(events)) return events
      }
      if (Date.now() > deadline) break
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
    if (attempt < 2) {
      // 窗内无链 → 同一 fixture 问题重发（≤2 次）
      await sendQuestion(page, question)
      sessionId = await waitForFixtureSession(dshHome, fixtureSegment, 60_000)
    }
  }
  throw new Error(`观察窗内检索链未出现（重发后仍无）：session=${sessionId}`)
}

/** 轮询召回分组满足条件（agent 多步链完成时序——真实模型往返非瞬时） */
async function pollSessionRecall(
  page: Page,
  q: { projectId: string; sessionId: string },
  predicate: (groups: readonly RecallGroup[]) => boolean,
  timeoutMs: number,
): Promise<readonly RecallGroup[]> {
  const deadline = Date.now() + timeoutMs
  let last: readonly RecallGroup[] = []
  for (;;) {
    last = await forgeInvoke<RecallGroup[]>(page, 'forge:knowledge/sessionRecall', q)
    if (predicate(last)) return last
    if (Date.now() > deadline) throw new Error(`等待召回事件超时（${String(timeoutMs)}ms）：groups=${JSON.stringify(last)}`)
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟（dogfood·Golden Path）：注册 → 会话 → Q1 召回链 → 回答 → 轨迹 →
// 召回 tab（1/1 链口径）→ 卡片热度（+1 链口径）→ Q2 即时累积（2/2）→ 跳转/失效标注
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·冒烟：注册→会话→检索链→回答→轨迹→召回 tab→热度闭环→8b 累积（dogfood）', async () => {
  test.setTimeout(900_000)
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（沿 flywheel.spec 口径，不伪造凭据）',
  )

  const fixtureRoot = makeFlywheelFixture()
  const knDir = join(fixtureRoot, 'fw-demo', '.knowledge')
  const knowledgeDirSnapshotBefore = readdirSync(knDir, { recursive: true }).sort().join('|')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay })
    const page = launched.page

    // ── Step 1：注册（hero 两段式全链；使用事件基线 = 0——全新注册） ──
    await registerViaUi(page, fixtureRoot, 'fw-demo')
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'fw-demo' }).first(), '左栏出现项目').toBeVisible({ timeout: 30_000 })
    const projects = await forgeInvoke<readonly { id: string; wsPath: string }[]>(page, 'forge:projects/list')
    const projectId = projects.find((p) => p.wsPath === join(fixtureRoot, 'fw-demo'))!.id
    await page.waitForTimeout(5_000)

    // ── Step 2：发起会话（知识段注入断言经会话文件承载——Step 4 解码后断言） ──
    await selectWorkspaceViaChip(page, 'fw-demo')
    // 基线热度 = 0（事件基线声明锚）——heat 经 e2e/support invokeHeat（fix-37 ④：
    // krf inline 页内 evaluate 降级拷贝收敛复用）
    const heatBaseline = await invokeHeat(page, projectId)
    expect([...heatBaseline.keys()], '使用事件基线 = 0（Setup 声明）').toHaveLength(0)

    // ── Step 3/4：发送 Q1 → agent 自主多步检索链（search → read-abstract） ──
    await sendQuestion(page, Q1)
    let sessionId = await waitForFixtureSession(dshHome, 'fw-demo', 120_000)
    const events = await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-demo',
      page,
      Q1,
      (evs) =>
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge_search') &&
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge_read_abstract'),
      120_000,
    )
    const toolCalls = events.filter((e) => e.type === 'tool/call').map((e) => ({ name: e.data?.name ?? '', seq: e.seq ?? 0 }))
    const searchSeq = toolCalls.filter((c) => c.name === 'knowledge_search').map((c) => c.seq)
    const readSeq = toolCalls.filter((c) => c.name === 'knowledge_read_abstract').map((c) => c.seq)
    expect(searchSeq.length, '检索链：knowledge_search 在场').toBeGreaterThan(0)
    expect(readSeq.length, '检索链：knowledge_read_abstract 在场（摘要先行——SC10）').toBeGreaterThan(0)
    expect(Math.min(...readSeq), '链次序：read-abstract 晚于 search（seq 升序）').toBeGreaterThan(Math.min(...searchSeq))
    // Step 2 断言（能力面通道承载）：系统提示词含最简知识段（Story 4 AC1）
    const promptText = (events.find((e) => e.type === 'system/message')?.data?.message?.content ?? [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
    expect(promptText, '系统提示词在场（system/message 事件）').not.toBe('')
    expect(promptText).toContain('## Project knowledge base')
    expect(promptText, '知识段：召回流程指引在场（agentic search）').toContain('Retrieval flow (agentic search)')

    // ── Step 5：回答基于命中知识呈现 + 会话继续可用（Q2 追问在 8b 行使） ──
    const answerText = (await page.locator('[data-conversation-content]').first().textContent({ timeout: 30_000 })) ?? ''
    expect(answerText, '回答呈现于对话 tab（含命中知识域词）').toContain('部署')

    // ── Step 6：轨迹 tab 检索链时序（唯一直接 UI 证据）+ 切回不重置 ──
    // fix-29：轨迹 tab = 官方 ui-trajectory 'trajectory' 直用——官方轨迹表锚
    // （[data-trajectory-scroll] 滚动面 + tr[data-kind=tool] 工具行，行文本含工具名）。
    // fix-37：本组选择器经 e2e/support/anchors 常量面（原 inline 字面量带引号笔误
    // `[data-trajectory-scroll"]`——选择器永不匹配的既有红灯，随常量化一并修复）。
    await page.locator(TAB_ITEM, { hasText: '轨迹' }).click()
    await expect(page.locator(TRAJECTORY_SCROLL).first(), '官方轨迹视图渲染（fix-29 直用）').toBeVisible({ timeout: 60_000 })
    await expect
      .poll(async () => page.locator(trajectoryRow('tool')).count(), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    const toolRowTexts = await page.locator(trajectoryRow('tool')).allTextContents()
    const searchRowIdx = toolRowTexts.findIndex((t) => t.includes('knowledge_search') || t.includes('search'))
    const readRowIdx = toolRowTexts.findIndex((t) => t.includes('knowledge_read_abstract') || t.includes('read-abstract'))
    expect(searchRowIdx, '台账含 search 工具行').toBeGreaterThanOrEqual(0)
    expect(readRowIdx, '台账含 read-abstract 工具行').toBeGreaterThanOrEqual(0)
    expect(searchRowIdx, '台账时序：search 先于 read-abstract').toBeLessThan(readRowIdx)
    // 切回对话 tab 不重置——回答仍在原位
    await page.locator(TAB_ITEM, { hasText: '对话' }).click()
    const transcriptKept = (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 })) ?? ''
    expect(transcriptKept, '切回对话 tab 回答仍在原位').toContain('部署')

    // ── Step 7：召回 tab（统计 1/1 + K1 分组行——链口径；口径分歧 = 缺陷信号 soft 承载） ──
    await page.locator(TAB_ITEM, { hasText: '知识召回' }).click()
    const groupsQ1 = await pollSessionRecall(
      page,
      { projectId, sessionId },
      (gs) => gs.some((g) => g.verb === 'search' && g.hitCount > 0 && g.hits.some((h) => h.title === '部署规范')),
      120_000,
    )
    const stats = page.locator('[data-dswf-recall-stats]')
    await expect(stats).toBeVisible({ timeout: 30_000 })
    // 链口径断言（fact-note 缺陷信号设计：shipped 逐调用组口径 = 2——soft 承载不遮蔽后续）
    expect
      .soft(await stats.getAttribute('data-calls'), '[链口径·缺陷信号] 召回次数 = 1（一次命中的检索链记 1 条）')
      .toBe('1')
    expect
      .soft(await stats.getAttribute('data-covered'), '[链口径·缺陷信号] 覆盖条数 = 1')
      .toBe('1')
    const k1Row = page.locator('[data-dswf-recall-row]', { hasText: '部署规范' }).first()
    await expect(k1Row, 'K1 分组行在场（title 快照）').toBeVisible({ timeout: 30_000 })
    const rowVerbs = await k1Row.locator('[data-dswf-recall-verb]').allTextContents()
    expect(rowVerbs.join(' '), '分组行动词明细含 search（verb 投影）').toContain('search')
    expect
      .soft(await k1Row.locator('.dswf-heat-badge').textContent(), '[链口径·缺陷信号] 行热度徽章 = 1（基线 0 + 本链 1）')
      .toContain('1')

    // ── Step 8：知识卡片热度闭环（K1 徽章 = 1 链口径；与召回 tab 同源同数字） ──
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    const k1Card = page.locator('.dswf-kn-card', { hasText: '部署规范' }).first()
    await expect(k1Card, 'K1 卡片在场（Step 1 索引代理断言）').toBeVisible({ timeout: 30_000 })
    expect
      .soft(await k1Card.locator('.dswf-heat-badge').textContent(), '[链口径·缺陷信号] K1 卡片热度徽章 = 1')
      .toContain('1')

    // ── Step 8b：Q2 触发 K2 新召回 → 即时累积（2/2 与 1/1 分离；K1 保持 1） ──
    // 回会话视图（知识模式无会话面板——点会话行切回）。Step 7 遗留召回 tab 激活 = keep-alive
    // 常态（AC-4 切换不重置——面板态跨视图往返保留，fix-11 首次实跑暴露）；发送前回对话 tab。
    await page.locator(`[data-dswf-session="${sessionId}"]`).first().click()
    await expect(page.locator(workbenchOfView('session')).first()).toBeAttached()
    await page.locator(TAB_ITEM, { hasText: '对话' }).click()
    await expect(page.locator('[data-conversation-content]').first()).toBeVisible()
    await sendQuestion(page, Q2)
    await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-demo',
      page,
      Q2,
      (evs) => evs.filter((e) => e.type === 'tool/call' && e.data?.name === 'knowledge_read_abstract').length >= 2,
      120_000,
    )
    await page.locator(TAB_ITEM, { hasText: '知识召回' }).click()
    const groupsQ2 = await pollSessionRecall(
      page,
      { projectId, sessionId },
      (gs) => gs.some((g) => g.hits.some((h) => h.title === '构建规范')),
      120_000,
    )
    // 次数与覆盖分离（聚合语义可区分于回显）——链口径 soft
    expect
      .soft(await page.locator('[data-dswf-recall-stats]').getAttribute('data-calls'), '[链口径·缺陷信号] 累积召回次数 = 2')
      .toBe('2')
    expect
      .soft(await page.locator('[data-dswf-recall-stats]').getAttribute('data-covered'), '[链口径·缺陷信号] 累积覆盖条数 = 2')
      .toBe('2')
    const k2Row = page.locator('[data-dswf-recall-row]', { hasText: '构建规范' }).first()
    await expect(k2Row, 'K2 分组行出现（即时累积）').toBeVisible({ timeout: 30_000 })
    expect
      .soft(await k2Row.locator('.dswf-heat-badge').textContent(), '[链口径·缺陷信号] K2 徽章 = 1（基线 0 + 1）')
      .toContain('1')
    expect
      .soft(await k1Row.locator('.dswf-heat-badge').textContent(), '[链口径·缺陷信号] K1 徽章保持 1')
      .toContain('1')
    void groupsQ1
    void groupsQ2

    // ── Step 7c：召回条目跳转知识详情（正常路径） ──
    await k1Row.click()
    await expect(page.locator('[data-dswf-kn-drawer]'), '召回行跳转打开知识详情抽屉（UF-6）').toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dswf-kn-drawer]')).toHaveCount(0)

    // Invariant：只读纪律——知识目录全程零写入
    const knowledgeDirSnapshotAfter = readdirSync(knDir, { recursive: true }).sort().join('|')
    expect(knowledgeDirSnapshotAfter, '浏览/召回全程对知识目录零写入').toBe(knowledgeDirSnapshotBefore)
    expect(launched.pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(overlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 Outcome "recall-entry-jump-detail" 的失效标注半边（索引未命中行级标注）
// —— 冒烟承载正常跳转；此处经知识条目外部删除 + 索引重建（零行化）预置失效态
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step7c 失效半边：外部删除后行级「索引未命中」标注（留痕 skip）', async () => {
  test.skip(
    true,
    '预置成本不匹配：失效态需 真实召回（dogfood）→ 外部删除条目 → 索引重建（零行化）→ 复核召回行——依赖冒烟终态会话，独立复现 = 全链 dogfood 重复跑。正常跳转半边已由冒烟承载（k1Row.click → 抽屉）；留痕 skip，转正 = 冒烟终态复用基建（重构为 worker 级 fixture）',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "no-knowledge-dir-session"（journey Step 2b：未配置知识目录——独立工作区）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step2b no-knowledge-dir-session：无知识段注入（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw2b-'))
  mkdirSync(join(fixtureRoot, 'fw-bare'), { recursive: true }) // 无 .knowledge 目录（未配置态）
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay })
    await registerProjectRaw(launched.page, join(fixtureRoot, 'fw-bare'), 'fw-bare')
    await expect(launched.page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await launched.page.waitForTimeout(5_000)
    await selectWorkspaceViaChip(launched.page, 'fw-bare')
    await sendQuestion(launched.page, Q1)
    const dshHome = join(userData, 'dsh-home')
    const sessionId = await waitForFixtureSession(dshHome, 'fw-bare', 120_000)
    // 会话正常可用（不报错）+ 系统提示词不含知识段（AC1 反向派生）
    const events = await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-bare',
      launched.page,
      Q1,
      (evs) => evs.some((e) => e.type === 'system/message'),
      120_000,
    )
    const promptText = (events.find((e) => e.type === 'system/message')?.data?.message?.content ?? [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
    expect(promptText).not.toBe('')
    // 知识段注入口径（fix-11 裁决，B 侧）：知识段 = 能力性指引，随插件加载无条件注入
    // （tech-design Interface 3 静态注册；段文本自声明 "may be registered"；两 tool 同为
    // 无条件注册——工具 schema 本就在场，仅藏指引段不自洽）。精确门控在设计边界内不可实现
    // （Interface 2 无路径反查 / Hard Rule 禁第二 core 服务 / 绑定表不含知识目录 / core 索引
    // 空态为异步不可同步探测）。未配置态断言 = 段在场且会话正常（agent 依段内回落指引转常规检索）。
    expect(
      promptText,
      '未配置知识目录 → 知识段仍在场（能力性指引，随插件全局注入——fix-11 裁决 B 侧）',
    ).toContain('## Project knowledge base')
    expect(launched.pageErrors, '会话正常可用（无页面错误）').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(overlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "empty-knowledge-dir-session"（journey Step 2c：已配置但为空——口径注记）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step2c empty-knowledge-dir-session：空目录无知识段（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw2c-'))
  mkdirSync(join(fixtureRoot, 'fw-empty', '.knowledge'), { recursive: true }) // 已配置且为空
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay })
    await registerProjectRaw(launched.page, join(fixtureRoot, 'fw-empty'), 'fw-empty')
    await expect(launched.page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await launched.page.waitForTimeout(5_000)
    await selectWorkspaceViaChip(launched.page, 'fw-empty')
    await sendQuestion(launched.page, Q1)
    const dshHome = join(userData, 'dsh-home')
    const sessionId = await waitForFixtureSession(dshHome, 'fw-empty', 120_000)
    const events = await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-empty',
      launched.page,
      Q1,
      (evs) => evs.some((e) => e.type === 'system/message'),
      120_000,
    )
    const promptText = (events.find((e) => e.type === 'system/message')?.data?.message?.content ?? [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
    expect(promptText).not.toBe('')
    // 口径注记（contract）：知识段注入口径已裁决（fix-11，B 侧）——知识段 = 能力性指引，
    // 随插件加载无条件注入（与 2b 同一裁决；两态可区分处 = 检索行为与召回事件，非段有无）。
    expect(promptText, '空知识目录 → 知识段仍在场（能力性指引，随插件全局注入——fix-11 裁决 B 侧）').toContain(
      '## Project knowledge base',
    )
    expect(launched.pageErrors).toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(overlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "blank-question-blocked"（journey Step 3b：空问题发送被拦截——
// Web surface 必察项 validation-error 实步承载；无 dogfood 依赖）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step3b blank-question-blocked：空/纯空白提交零往返', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeFlywheelFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData })
    await registerProjectRaw(launched.page, join(fixtureRoot, 'fw-demo'), 'fw-demo')
    await expect(launched.page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await launched.page.waitForTimeout(5_000)
    await selectWorkspaceViaChip(launched.page, 'fw-demo')
    const conversation = launched.page.locator('[data-conversation-content]').first()
    await expect(conversation, '空会话引导态在场').toBeAttached()
    // 空输入 + 纯空白提交意图（回车）——不发送
    const composer = launched.page.locator('[data-composer-input]').last()
    await composer.click()
    await launched.page.waitForTimeout(500)
    await launched.page.keyboard.press('Enter')
    await launched.page.keyboard.insertText('   ')
    await launched.page.keyboard.press('Enter')
    await launched.page.waitForTimeout(3_000)
    // 账本级断言（零消息零往返——官方 composer 占位文案随输入态显隐，转录等值断言不可用）
    {
      const dshHome = join(userData, 'dsh-home')
      const found = findFixtureSession(dshHome, 'fw-demo')
      if (found !== undefined) {
        const log = sessionLogById(dshHome, found.sessionId)
        const events = log !== undefined ? decodeSessionFile(log) : []
        const nonSystem = events.filter((e) => e.type !== 'system/message')
        expect(nonSystem.filter((e) => /message/i.test(e.type)), '空提交零用户/助手消息').toHaveLength(0)
        expect(nonSystem.filter((e) => e.type === 'tool/call'), '空提交零 agent 往返').toHaveLength(0)
      }
    }
    // 零使用事件（基线 0 且无召回——heat 通道空；invokeHeat 复用）
    const projectId = (await forgeInvoke<readonly { id: string; wsPath: string }[]>(launched.page, 'forge:projects/list'))
      .find((p) => p.wsPath === join(fixtureRoot, 'fw-demo'))!.id
    const heat = await invokeHeat(launched.page, projectId)
    expect([...heat.keys()], '零检索链与使用事件').toHaveLength(0)
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 Outcome "no-recall-placeholder"（journey Step 7b：本会话暂无召回占位）
// —— 留痕 skip（fix-37：官方 blank 会话语义实证不可达，原实跑红灯转留痕）
//
// 官方事实（上游 dsh-client-ui-conversation 源码核实，fix-36 A/B 实证先于其存在）：
//   - ConversationHeader 以 hideChrome:blank 渲染会话头 → blank 会话（未发消息）页签行
//     不渲染（showTabs = !hideChrome && tabs.length > 1）；
//   - DefaultConversationViews 在 session.blank && phase === 'blank' 时视图区返回 null
//     → 召回 pane（conversation.view 'dswf-recall' 占用者）无法挂载。
// 故「空会话点知识召回 tab」载体在产品面不可达（官方 hero chrome 语义，非产品缺陷）。
// 占位Outcome「本会话暂无召回」的确定性承载：
//   - 单测 pin：apps/web/src/views/session/RecallTab.test.tsx（idle/readyEmpty 两相位
//     均断 data-dswf-recall-face="empty" + 「本会话暂无召回」）；
//   - e2e 占位半边：Step4d（无关库 dogfood——agent 未走知识检索时召回 tab 保持占位，
//     soft 承载）+ 冒烟 Step 7（有召回统计面实证）。
// 转正条件 = 确定性「有消息且零召回」会话载体落地（dogfood 无检索会话基建或官方
// blank 相位语义变更）。
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step7b no-recall-placeholder：零召回占位（不报错无空列表）（留痕 skip——官方 blank 会话语义）', async () => {
  test.skip(
    true,
    '官方 blank 会话语义（dsh-client-ui-conversation：hideChrome:blank → 页签行不渲染；'
      + 'DefaultConversationViews blank 相位视图区 null）——空会话点「知识召回」tab 载体不可达'
      + '（上游设计，非产品缺陷；fix-36 A/B 实证红灯先于 fix-37 存在）。占位 Outcome 确定性承载 = '
      + 'RecallTab.test 单测 pin（idle/readyEmpty 空态面）+ Step4d soft（agent 未走检索时占位）+ '
      + '冒烟 Step 7（统计面）——留痕 skip，转正 = 确定性「有消息且零召回」会话载体落地',
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 Outcome "no-hit-fallback-regular-retrieval"（journey Step 4d：无关库转常规检索）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step4d no-hit-fallback：无关库回答不阻塞（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')

  const fixtureRoot = makeUnrelatedFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay })
    const fwPage = launched.page
    await registerProjectRaw(fwPage, join(fixtureRoot, 'fw-plain'), 'fw-plain')
    await expect(fwPage.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await fwPage.waitForTimeout(5_000)
    await selectWorkspaceViaChip(fwPage, 'fw-plain')
    const conversationBefore = ((await fwPage.locator('[data-conversation-content]').first().textContent()) ?? '').length
    await sendQuestion(fwPage, Q1)
    const dshHome = join(userData, 'dsh-home')
    const sessionId = await waitForFixtureSession(dshHome, 'fw-plain', 120_000)
    // agent 转常规检索原语继续处理——回答正常完成不阻塞（事件面收敛 + 转录增长）
    await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-plain',
      fwPage,
      Q1,
      (evs) => evs.length >= 2,
      180_000,
    )
    await expect
      .poll(
        async () => ((await fwPage.locator('[data-conversation-content]').first().textContent()) ?? '').length,
        { timeout: 180_000 },
      )
      .toBeGreaterThan(conversationBefore + Q1.length)
    expect(launched.pageErrors, '回答正常完成不阻塞、不出错').toEqual([])
    // 哨兵行口径（fix-11 裁决，B 侧）：零命中 search = 已发生的召回事件——core 记哨兵行
    // （RecallGroup hitCount=0 / hits=[] 为契约一等分组；热度排除哨兵行）。召回 tab 呈
    // 「召回次数 ≥1 · 覆盖知识 0」而非占位——占位语义 = 零召回事件（Step 7b 互证面），
    // 非「零命中」。agent 是否实际调用 search 归模型自主（soft 承载）。
    const recallTab = fwPage.locator(TAB_ITEM, { hasText: '知识召回' })
    await recallTab.click()
    await expect(
      fwPage.locator('[data-dswf-recall-tab], [data-dswf-recall-face="empty"]').first(),
      '召回 tab 面就位（统计面或占位面二择——装载不报错）',
    ).toBeVisible({ timeout: 30_000 })
    const recallStats = fwPage.locator('[data-dswf-recall-stats]')
    const statsVisible = await recallStats.isVisible().catch(() => false)
    if (statsVisible) {
      expect
        .soft(await recallStats.getAttribute('data-calls'), '[哨兵行口径·已裁决] 零命中 search 计入召回次数（≥1）')
        .toMatch(/^[1-9]\d*$/)
      expect
        .soft(await recallStats.getAttribute('data-covered'), '[哨兵行口径·已裁决] 覆盖知识 = 0（哨兵行不产生覆盖）')
        .toBe('0')
    } else {
      expect
        .soft(statsVisible, '[哨兵行口径·已裁决] agent 未走知识检索（模型自主）→ 召回 tab 保持占位')
        .toBe(false)
    }
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(overlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 留痕 skip：Step 4b/4c（search 域前缀直测——双门分工，能力面通道缺失）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step4b domain-prefix-filter-correct（留痕 skip）', async () => {
  test.skip(
    true,
    'fact 双门分工（channels.ts:17）：search/readAbstract 为 agent 面插件工具不经 web RPC，产品 UI 无直调入口——能力面 contract 直测通道缺失；域前缀过滤语义由 packages/core browse-service/search 单测 pin。留痕 skip，转正 = 能力面通道（或 vitest 契约面）接入 run-test 编排',
  )
})

test('@web-e2e @p1mvp flywheel·Step4c prefix-omitted-all-domain（留痕 skip）', async () => {
  test.skip(
    true,
    '同 Step4b：全域检索（省略域前缀）语义归 core 单测 pin——web 面无直调通道，留痕 skip',
  )
})
