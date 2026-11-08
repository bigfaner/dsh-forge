// 4.2 MVP 门第一步：飞轮 6 步链端到端走查（dogfood 真实模型）——
// 注册（两段式）→ 发起会话 → agent 召回（知识段指引）→ 事件落库 → 召回 tab 条目 → 卡片热度。
// 断言源：任务 4.2 AC × Story 4（AC1 系统提示词知识段内容 / AC2 search→read
// 多步链 SC10 / AC3 事件↔tab↔热度三方一致 = tech-design Key Test Scenarios ⑥）+
// PRD Goals「6 步链 100% 不间断」；e2e 事件数据面 = SMOKE-LEDGER §5 缺口 2 的 dogfood 转正面。
//
// dogfood 策略（tech-design Testing Strategy 会话链路行 + Open Question ② 裁决）：
// 低成本真实模型（缺省 zai-coding-cn / glm-5.3-flash，env DSH_FORGE_DOGFOOD_PROVIDER/
// DSH_FORGE_DOGFOOD_MODEL 可覆写）；模型凭据经 dsh profile 域——隔离 DSH_HOME 内播种
// .credentials.yaml（拷贝真实凭据），产品不经手（Security 约定）。凭据缺席 = dogfood
// 前置缺口 → 留痕 skip（不伪造凭据；CI 无凭据面）。录制回放不预建——flake 时按
// Open Question ② 评估。
//
// 与 e2e/specs/p1mvp/knowledge-recall-flywheel.spec 的分工（fix-37 ④ 裁决——头注明确
// 分工，不归并：两套件对同一召回计数面**故意断言相反口径**，归并即销毁缺陷信号设计）：
//   - 本套件 = shipped 逐工具调用口径实证（统计头 = 事件组数、热度 = 事件表行计数
//     ——三方一致断言全绿基线）；
//   - krf = 旅程链口径断言（[链口径·缺陷信号] soft 红 = 预期态，转正 = core 链口径
//     裁决（M5+），勿为设计红派 fix）。
//
// 真实轨迹可查面（SC10 e2e 断言的载体）：dsh 会话持久化文件 session[.vN].jsonl.zstd
// （{dshHome}/sessions/<sanitized-cwd>/session-<id>/）——多 zstd 帧逐帧解出 JSONL 事件：
// system/message（模型实收系统提示词——AC1 内容断言）+ tool/call（工具调用轨迹——
// knowledge_search / knowledge_read_abstract 多步链与次序断言）。
// 解码族/凭据播种/叠层/launch/close 面 = e2e/support 单源（fix-37 ①④收编）；
// 隔离：独立 userData + 端口分配器（e2e 单实例纪律，沿 smoke-skeleton/knowledge-integration）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import type { ProjectSummary } from '../../packages/contracts/src/dto/project.js'
import type { RecallGroup } from '../../packages/contracts/src/dto/knowledge.js'
import { closeApp, launchHost, type Launched } from '../support/launch.js'
import { forgeInvoke, invokeHeat } from '../support/rpc.js'
import { dirRow, enterDir, fixtureDirSegments, pickerStartRoot } from '../support/navigation.js'
import { waitForFixtureSession, waitForSessionEvents } from '../support/session-files.js'
import { realCredentials, seedDshHome, writeDogfoodOverlay } from '../support/dogfood.js'
import { rmDirBestEffort, rmFileBestEffort } from '../support/cleanup.js'
import { COMPOSER_INPUT, HERO_WORKSPACE_CHIP_NAME, KNOWLEDGE_ENTRY, WORKBENCH } from '../support/anchors.js'

// ─────────────────────────────────────────────────────────────────────────────
// 知识夹具：{root}/demo-proj/.knowledge/{前端,后端}（frontmatter 最小契约——沿 3.8 夹具口径；
// id 必带——rebuild 拒收无 id 文件不入实体表，id 缺席 = 索引空 = 检索恒零命中）
// ─────────────────────────────────────────────────────────────────────────────

function makeKnowledgeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-flywheel-'))
  const kn = join(root, 'demo-proj', '.knowledge')
  mkdirSync(join(kn, '前端'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\ntitle: 部署规范\nid: deploy\nstatus: confirmed\nsummary: 项目部署流程与上线检查单\nkeywords:\n  - 部署\n  - 上线\n---\n\n# 部署规范\n\n部署前核对回滚预案和环境变量清单。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\ntitle: 回滚手册\nid: rollback\nstatus: confirmed\nsummary: 服务回滚步骤与注意事项\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

/** 召回数据面（contracts DTO 窄面——forge:knowledge/sessionRecall；fix-37 ⑤ 手抄面收编） */
type RecallGroups = readonly RecallGroup[]

// ─────────────────────────────────────────────────────────────────────────────
// 6 步链走查（单流不间断：注册 → 会话 → 召回 → 事件 → tab → 热度）
// ─────────────────────────────────────────────────────────────────────────────

test('4.2·飞轮 6 步链：注册 → 会话 → agent 召回 → 事件落库 → 召回 tab → 卡片热度（dogfood）', async () => {
  test.setTimeout(480_000)
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    `dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（Open Question ②：dogfood 为主，录制回放仅 flake 时评估、不预建）`,
  )
  // 去模型化门（worker-exec-evidence-replay SC4/SC5 边界裁决）：知识召回语义类 = 真实 LLM
  // 按需人工清单，不进自动门——仅显式 DSH_FORGE_DOGFOOD_RECORD=1 时运行。
  test.skip(
    process.env.DSH_FORGE_DOGFOOD_RECORD !== '1',
    '去模型化门：知识召回语义类退人工按需清单（不进自动门）——须显式 DSH_FORGE_DOGFOOD_RECORD=1',
  )

  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fly-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const dogfoodOverlay = writeDogfoodOverlay()
  const fixture = makeKnowledgeFixture()
  let launched: Launched | undefined
  try {
    launched = await launchHost({ userData, overlay: dogfoodOverlay })
    const page = launched.page
    const pageErrors = launched.pageErrors

    // ── 步 1/6 注册（两段式：文件浏览器 → 注册表单默认值 → 确认——AC「注册（两段式）」 ──
    await page.locator('[data-dswf-cta="add-project"]').click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
    // 导航段从夹具绝对路径推导（fix-11——去 %TEMP% 位置假设，含夹具目录名）
    for (const segment of fixtureDirSegments(fixture, pickerStartRoot())) {
      await enterDir(page, segment)
    }
    await dirRow(page, 'demo-proj').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator(WORKBENCH)).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '注册落库：projects 行在场（含 workspace 外键链）').toHaveLength(1)
    const projectId = projects[0]!.id

    // ── 步 2/6 发起会话（官方工作区菜单选夹具工作区——会话 cwd = 工作区根，绑定解析锚） ──
    // 官方 composer 工作区芯片（「默认工作区」/「选择工作区」两态可访问名）→ role=menu
    // 列既有 workspace（含注册链 registry.create 的夹具工作区——dsh 幂等口径同实体）→ 选 demo-proj
    const composer = page.locator(COMPOSER_INPUT).last()
    await expect(composer, '官方会话面 composer 在场（官方 hero 相位承载空会话引导）').toBeVisible({ timeout: 60_000 })
    // chip 锚 = anchors.ts HERO_WORKSPACE_CHIP_NAME 单源（可访问名形态，getByRole name；
    // 项目绑定后 innerText 换项目名，hasText 形态恒 miss——root cause 见 rpc.ts:78）
    const workspaceChip = page.getByRole('button', { name: HERO_WORKSPACE_CHIP_NAME }).first()
    await expect(workspaceChip, '工作区芯片在场（composer 绑定面）').toBeVisible({ timeout: 30_000 })
    await workspaceChip.click()
    const workspaceMenu = page.locator('[role="menu"]').first()
    await expect(workspaceMenu).toBeVisible({ timeout: 15_000 })
    const fixtureWorkspaceItem = workspaceMenu
      .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
      .filter({ hasText: 'demo-proj' })
      .first()
    await expect(fixtureWorkspaceItem, '夹具工作区在列（注册链 dsh create 实体——账本实时读）').toBeVisible({ timeout: 15_000 })
    await fixtureWorkspaceItem.click()
    // 工作台锚跟随：会话视图（UF-5 装配面）
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="session"]').first()).toBeAttached()

    // 基线热度（步 6 增量断言锚——RPC 直读，不开浏览面保持事件源纯净：agent 召回为唯一事件源）
    const heatBefore = await invokeHeat(page, projectId)
    expect([...heatBefore.keys()], '基线热度 = 0（尚无召回事件）').toHaveLength(0)

    // ── 步 3/6 agent 召回（知识段指引——问题指向夹具知识域，真实模型往返） ──
    // 官方会话面 composer（对话 tab 内编辑器）：键入项目问题 → Enter 发送（会话在夹具工作区开）
    await composer.click()
    await page.keyboard.insertText('这个项目部署前需要确认哪些事项？请查阅项目知识库后回答。')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(8_000)
    // 发送诊断面（dogfood 记录辅助）：转录前 200 字符——消息上墙 = 发送链通
    console.log('[flywheel] 发送后转录面：', await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 }))
    // 会话 id：隔离 DSH_HOME 内唯一会话文件（目录名 = 账本 id）——持久化为追加式落盘、
    // 首次落盘随回合推进（agent 工具链期间等待；左栏会话行 blank 期不显示、完成后入列，
    // 行断言移步召回完成后）
    const sessionId = await waitForFixtureSession(dshHome, 'demo-proj', 120_000)

    // ── 步 4/6 事件落库 + SC10 多步链（search → read，真实模型轨迹可查） ──
    const groups = await pollSessionRecall(page, projectId, sessionId, (gs) =>
      gs.some((g) => g.verb === 'search' && g.hitCount > 0) && gs.some((g) => g.verb === 'read'),
    )
    const searchGroups = groups.filter((g) => g.verb === 'search' && g.hitCount > 0)
    const readGroups = groups.filter((g) => g.verb === 'read')
    expect(searchGroups.length, 'search 事件组在场（agent 自主发起检索）').toBeGreaterThan(0)
    expect(readGroups.length, 'read 事件组在场（多步链第二跳——提示词第 3 步 knowledge_read 口径）').toBeGreaterThan(0)
    // 多步链次序：read 不早于首个 search（agentic search 流程指引可循）
    const firstSearchAt = Math.min(...searchGroups.map((g) => Date.parse(g.createdAt)))
    const readAt = Math.min(...readGroups.map((g) => Date.parse(g.createdAt)))
    expect(readAt, 'read 晚于 search（多步链次序）').toBeGreaterThanOrEqual(firstSearchAt)
    // 左栏会话行（官方口径：blank 期不显示，回合完成后入列——dsh 账本实时读）
    const sessionRow = page.locator(`[data-dswf-session="${sessionId}"]`).first()
    await expect(sessionRow, '会话行入列（非 blank——账本实时读）').toBeVisible({ timeout: 60_000 })

    // 真实轨迹可查（SC10 e2e 断言载体）：会话持久化文件的 tool/call 轨迹 + system/message 提示词
    const events = await waitForSessionEvents(
      dshHome,
      sessionId,
      (evs) =>
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge_search') &&
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge_read'),
      60_000,
    )
    const toolCalls = events.filter((e) => e.type === 'tool/call').map((e) => ({ name: e.data?.name ?? '', seq: e.seq ?? 0 }))
    const searchSeq = toolCalls.filter((c) => c.name === 'knowledge_search').map((c) => c.seq)
    const readSeq = toolCalls.filter((c) => c.name === 'knowledge_read').map((c) => c.seq)
    expect(searchSeq.length, '轨迹可查：knowledge_search tool 调用在场').toBeGreaterThan(0)
    expect(readSeq.length, '轨迹可查：knowledge_read tool 调用在场').toBeGreaterThan(0)
    expect(Math.min(...readSeq), '轨迹次序：read 在 search 之后（seq 升序）').toBeGreaterThan(Math.min(...searchSeq))

    // AC1 内容断言：模型实收系统提示词含 forge:knowledge 段（知识库存在声明 + 流程指引 + 工具说明）
    const promptText = (events.find((e) => e.type === 'system/message')?.data?.message?.content ?? [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
    expect(promptText, '系统提示词在场（system/message 事件）').not.toBe('')
    expect(promptText).toContain('<knowledge-base>')
    expect(promptText, '知识段：agentic search 流程指引在场').toContain('检索方法（agentic search 三步')
    expect(promptText, '知识段：工具说明在场（search）').toContain('knowledge_search')
    expect(promptText, '知识段：工具说明在场（read）').toContain('knowledge_read')

    // ── 步 5/6 召回 tab 条目（即时累积：tab 激活重拉——AC3 tab 面） ──
    // poll 谓词早返回与 agent 收尾竞态（命中 + read 即返，回合收尾调用仍可能在途）——
    // 等持久化轨迹出现 turn/end（回合终结）再取终态分组，统计/热度口径一律以终态为准。
    await waitForSessionEvents(dshHome, sessionId, (evs) => evs.some((e) => e.type === 'turn/end'), 180_000)
    const finalGroups: RecallGroups = await forgeInvoke<RecallGroup[]>(page, 'forge:knowledge/sessionRecall', {
      projectId,
      sessionId,
    })
    await page.locator('[data-conversation-tabs] [role="tab"]', { hasText: '知识召回' }).click()
    const recallTab = page.locator('[data-dswf-pane="recall"] [data-dswf-recall-tab]')
    await expect(recallTab.first()).toBeVisible({ timeout: 30_000 })
    const statsCalls = Number(await page.locator('[data-dswf-recall-stats]').getAttribute('data-calls'))
    expect(statsCalls, '统计头召回次数 = 事件组数（tab ↔ 事件表一致）').toBe(finalGroups.length)
    // 卡片改型选择器（1.8 轮卡重写——判例 7d310eb0 漂移防护）：命中行 data-dswf-recall-hit
    // 在轮卡分节内——先展开轮卡（cardhead toggle，aria-expanded 断言），再取命中行
    const cardHead = page.locator('[data-dswf-recall-card] .dswf-recall-cardhead').first()
    await cardHead.click()
    await expect(cardHead, '轮卡展开（命中行渲染前置）').toHaveAttribute('aria-expanded', 'true')
    const recallHit = page.locator('[data-dswf-recall-hit]', { hasText: '部署规范' }).first()
    await expect(recallHit, '命中行：被召回知识条目在场（title 快照）').toBeVisible()
    const searchSection = page.locator('[data-dswf-recall-call][data-verb="search"]', { hasText: '部署规范' }).first()
    await expect(searchSection, 'search 分节在场（verb 投影）').toBeVisible()
    // 双主题取证补齐（fix-2）：召回 tab 终态截图——路径/标记经 env 注入，缺省零副作用
    const shotDir = process.env.DSH_FORGE_E2E_SHOT_DIR
    if (shotDir !== undefined) {
      mkdirSync(shotDir, { recursive: true })
      // 证据补充路径（非致命）：本 Electron 装配下 page.screenshot 会挂起（trace/失败帧
      // 承担双主题帧取证兜底）——截不到即留痕跳过，不阻断 6 步链判收
      try {
        await page.screenshot({ path: join(shotDir, `flywheel-recall-tab-${process.env.DSH_FORGE_E2E_SHOT_TAG ?? 'default'}.png`), animations: 'disabled', timeout: 20_000 })
      } catch (cause) {
        console.log(`[flywheel] 双主题截图挂起留痕（trace 帧兜底）：${String(cause).slice(0, 120)}`)
      }
    }

    // ── 步 6/6 卡片热度 +1（浏览面 HeatBadge ↔ heatByEntry ↔ 事件计数三方一致） ──
    await page.locator(KNOWLEDGE_ENTRY).first().click()
    await expect(page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first()).toBeVisible({ timeout: 30_000 })
    const cardHeatText = await page
      .locator('[data-dswf-entry]', { hasText: '部署规范' })
      .first()
      .locator('[data-dswf-kn-card-heat]')
      .textContent()

    // 三方一致断言（场景⑥端到端）：事件表（sessionRecall 行）↔ 热度（heatByEntry）↔ UI（tab 徽章 + 卡片徽章）
    const heatAfter = await invokeHeat(page, projectId)
    const deployEntryId = finalGroups
      .flatMap((g) => g.hits)
      .find((h) => h.title === '部署规范')?.entryId ?? null
    expect(deployEntryId, '部署规范条目 id 在场（事件快照）').not.toBeNull()
    // 热度终式（SC-5 pin，用户裁决 2026-11-20）：仅 verb='read' 行计 1.0（search/browse/
    // read-abstract 过程动词 = 0；feedback -1 行剔除）——期望值按 read 行计数
    const expectedHeat = finalGroups
      .filter((g) => g.verb === 'read')
      .reduce((sum, g) => sum + g.hits.filter((h) => h.entryId === deployEntryId).length, 0)
    // 事件表行计数（read 行计 1——SC-5 热度终式口径；哨兵行不计）
    expect(heatAfter.get(deployEntryId as number), '热度 = 事件表按条目行计数（heat ↔ 事件一致）').toBe(expectedHeat)
    expect(expectedHeat, '热度增量 ≥ 1（基线 0 → 召回后正计）').toBeGreaterThanOrEqual(1)
    expect(cardHeatText, '卡片徽章 = 热度计数（UI ↔ heat 一致）').toContain(`${String(expectedHeat)}`)
    // 召回 tab 分组行徽章同源（同一次激活拉取的分组行 heat 快照）
    const rowHeat = finalGroups.flatMap((g) => g.hits).find((h) => h.title === '部署规范')?.heat
    expect(rowHeat, 'tab 行热度徽章 = 同源计数（tab ↔ heat 一致）').toBe(expectedHeat)

    expect(pageErrors, '无页面 JS 错误（pageerror 面——L824 元断言）').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    rmFileBestEffort(dogfoodOverlay)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixture)
  }
})

/** 轮询直至召回分组满足条件（agent 多步链完成时序——真实模型往返非瞬时） */
async function pollSessionRecall(
  page: Page,
  projectId: string,
  sessionId: string,
  predicate: (groups: RecallGroups) => boolean,
  timeoutMs = 300_000,
): Promise<RecallGroups> {
  const deadline = Date.now() + timeoutMs
  let last: RecallGroups = []
  for (;;) {
    last = await forgeInvoke<RecallGroup[]>(page, 'forge:knowledge/sessionRecall', { projectId, sessionId })
    if (predicate(last)) return last
    if (Date.now() > deadline) {
      throw new Error(`等待召回事件超时（${String(timeoutMs)}ms）：groups=${JSON.stringify(last)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
}
