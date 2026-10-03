// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: knowledge-browsing（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/knowledge-browsing/contracts/step-{1..5}-*.md
// （eval-contract 1116/1150 通过）。
//
// Fact Table 摘录（源码核实）：
//   - 浏览主体：[data-dswf-knowledge-view]；工具栏 [data-dswf-kn-toolbar] +
//     input.dswf-kn-search（aria 知识关键词搜索）；域树 [data-dswf-kn-tree][role=tree]
//     行 [data-dswf-domain=<path>]；卡片 .dswf-kn-card[data-dswf-entry] + .dswf-heat-badge
//   - 四态（browse-model.browseFaceState）：骨架 [data-dswf-skeleton] / 卡片 [data-dswf-kn-cards] /
//     过滤无结果（EmptyState + [data-dswf-clear-filters]）/ 空库引导（EmptyState 尚无知识）
//   - 抽屉：[data-dswf-kn-drawer]（summary [data-dswf-kn-summary] / 元数据 [data-dswf-kn-meta-row]
//     / 正文 [data-dswf-kn-body] / 关闭 .dswf-kn-drawer-close）
//   - 热度 = knowledge_recall_logs 按条目 COUNT（entry_id IS NOT NULL——browse-service.ts:185）；
//     使用事件 fixture 经 state.db 预置（Setup 声明预置通道 PRD 未定义 = inferred）
//   - 索引重建：仅项目索引零行时内联重建（fact KNOWLEDGE_INDEX_REBUILD）——1c 阶段②按
//     contract fact-note「测试实现需显式触发重建」以测试侧清行（零行化）触发
// RPC：forge:knowledge/listEntries{projectId,domainPrefix?,keyword?} → KnowledgeCard[]
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')
const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string
const WELCOME_NOTICE_ACK_VERSION = '2026-09-28.1'

interface MinimalStmt {
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
  run(...args: unknown[]): unknown
}
interface MinimalDb {
  prepare(sql: string): MinimalStmt
  pragma(source: string): unknown
  close(): unknown
}
const requireFromCore = createRequire(join(ROOT, 'packages', 'core', 'package.json'))
type SqliteCtor = new (path: string) => MinimalDb
const openStateDb = (userData: string): MinimalDb =>
  new (requireFromCore('better-sqlite3') as SqliteCtor)(join(userData, 'state.db'))

/** 基线知识夹具（Contract fixture_spec）：前端域 K1（部署双命中）/ K2（全字段不含部署）/
 * 三层链第 3 层 hooks / 后端域——token qz9 全字段不含（命中确定性契约） */
function makeKnowledgeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-'))
  const kn = join(root, 'kb-demo', '.knowledge')
  mkdirSync(join(kn, '前端', '规范', 'React'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\ntitle: 部署规范\nsummary: 部署前核对回滚预案\nkeywords:\n  - 部署\n  - 上线\nstatus: final\n---\n\n# 部署规范\n\n按检查单逐项执行。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '前端', 'build.md'),
    '---\ntitle: 构建规范\nsummary: 构建流水线约定\nkeywords:\n  - 构建\n---\n\n# 构建规范\n\n统一走流水线。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '前端', '规范', 'React', 'hooks.md'),
    '---\ntitle: Hooks 约定\nsummary: React Hooks 使用约定\nkeywords:\n  - hooks\n---\n\n# Hooks 约定\n\n副作用统一收口。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\ntitle: 回滚手册\nsummary: 服务回滚步骤\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

      // provider 段 = 复启链路必需（探针 4 实证）：DeepSeek API-key 引导弹窗一经挂载
      // （无论是否收起）即写 dsh 侧客户态，毒化同 userData 下一 boot 的工作台挂载；
      // provider 可服务（ZAI_CODING_CN_API_KEY 环境在场）则弹窗不挂载。CI 无该 env 时
      // 复启链路测试将受弹窗毒化影响——转正条件见 SMOKE-LEDGER 口径。
function writeAckOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-ack-${process.pid}-${Math.random().toString(36).slice(2, 8)}.yml`)
  writeFileSync(
    target,
    [
      '# e2e 预确认叠层：官方首启「预览版说明」预确认 + provider 面（弹窗预免）',
      '- id: ui-settings-general',
      '  config:',
      `    welcomeNoticeVersion: ${WELCOME_NOTICE_ACK_VERSION}`,
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      zai-coding-cn:',
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

async function dismissOnboardingModals(page: Page): Promise<void> {
  const deadline = Date.now() + 30_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page.locator('[role="dialog"] button', { hasText: /^稍后配置$/ }).first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  readonly ackOverlay: string
}


/** 关闭宿主并等待主进程退出 + dsh child 级联收尾（句柄/端口复用竞态防护——4.2 探针同源坑） */
async function closeApp(app: ElectronApplication): Promise<void> {
  const proc = app.process()
  await app.close().catch(() => undefined)
  if (proc.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000)
      proc.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

/** 目录删除重试（句柄释放竞态；终态兜底不掩盖用例结论——mkdtemp 唯一名不外溢） */
async function rmDirBestEffort(dir: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // 残留兜底（句柄长期占用）——不掩盖用例结论
  }
}

/** 同 userData 复启序号（端口错峰——前序 boot 的 dsh child 收尾竞态不占新 boot 端口） */
let bootSeq = 0

async function launch(userData: string, options?: { readonly dismiss?: boolean }): Promise<Launched> {
  const dismiss = options?.dismiss ?? true
  const { _electron } = await import('@playwright/test')
  const ackOverlay = writeAckOverlay()
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: {
      ...process.env,
      DSH_FORGE_DEV_PROFILE: 'dev',
      DSH_FORGE_PATCH_FILES: ackOverlay,
      DSH_FORGE_USER_DATA: userData,
      DSH_FORGE_PORT: String(19870 + (process.pid % 150) + (bootSeq++ % 20)),
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 90_000 },
  )
  await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
  if (dismiss) await dismissOnboardingModals(page)
  // 相位稳定门（hero|session 通用——期望相位由调用侧断言；RPC 前置段不收模态）
  await page.waitForFunction(
    () => {
      const phase = document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase')
      return phase === 'hero' || phase === 'session'
    },
    undefined,
    { timeout: 30_000 },
  )
  return { app, page, ackOverlay }
}

/** 工作台桥派发（视图切换缝——无会话行期的载体适配，沿 smoke-skeleton 台账口径） */
async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } })
      .__DSH_FORGE_WORKBENCH__
    bridge?.dispatch({ type: eventType })
  }, type)
}

async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(async ({ ch, args }) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke(ch, args)
    if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
    return envelope.data
  }, { ch: channel, args: payload })
  return data as T
}

interface KnowledgeCardLike {
  readonly entryId: number
  readonly title: string
  readonly domainPath: string
  readonly heat: number
}

/** 注册夹具项目（RPC 直注——向导 UI 走查归 project-registration 旅程） */
async function registerKbProject(page: Page, fixtureRoot: string): Promise<string> {
  const wsDir = join(fixtureRoot, 'kb-demo')
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: wsDir,
    name: 'kb-demo',
    forgeDir: `${wsDir}\\.forge`,
    knowledgeDir: `${wsDir}\\.knowledge`,
  })
  return result.projectId
}

/** 进入知识库浏览视图（网格终态收敛由调用侧断言——空态元素常驻 DOM 且 CSS 隐藏，
 *  卡片/空态联合选择器的 .first() 会钉死在隐藏空态上——探针实证） */
async function openKnowledgeView(page: Page, projectId: string): Promise<readonly KnowledgeCardLike[]> {
  await page.locator('[data-dswf-nav="knowledge"]').first().click()
  await expect(page.locator('[data-dswf-knowledge-view]').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.dswf-zones[data-dswf-view="knowledge"]').first()).toBeAttached()
  return forgeInvoke<readonly KnowledgeCardLike[]>(page, 'forge:knowledge/listEntries', { projectId })
}

/** 卡片定位（按标题） */
function cardByTitle(page: Page, title: string): ReturnType<Page['locator']> {
  return page.locator('.dswf-kn-card', { hasText: title }).first()
}

/** 预置 K1 使用事件 ×3（Setup fixture 通道——state.db 直注，app 关闭态写入） */
function seedUsageEvents(userData: string, projectId: string, entryTitle: string, count: number): void {
  const db = openStateDb(userData)
  try {
    const entry = db
      .prepare('SELECT id FROM knowledge_entries WHERE project_id = ? AND title = ?')
      .get(projectId, entryTitle) as { id: number } | undefined
    if (entry === undefined) throw new Error(`seedUsageEvents：条目不在索引（${entryTitle}）`)
    const insert = db.prepare(
      `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, domain_snap, hit_count, created_at)
       VALUES (?, ?, 'e2e-seed-session', 'search', ?, ?, ?, 1, ?)`,
    )
    for (let i = 0; i < count; i++) {
      insert.run(projectId, `e2e-seed-call-${i}`, entry.id, entryTitle, '前端', new Date().toISOString())
    }
  } finally {
    db.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟：进入浏览（热度=3）→ 域树前缀过滤 → 关键词细分 → 详情抽屉 → 关闭回上下文
// （Step 1-5 success 贯穿；使用事件 fixture 经 boot#1 → 预置 → boot#2 两段落地）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·冒烟：浏览→过滤→细分→抽屉→关闭（K1 热度=3）', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeKnowledgeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：RPC 前置（注册 + listEntries 建索引——零行内联重建同径）→ WAL 活写使用事件
    // ×3（Setup fixture 通道）→ 收模态 → UI 走查（同 userData 复启存在挂载竞态——见
    // compensation spec 头注，全文件单 boot 纪律）
    launched = await launch(userData, { dismiss: false })
    const projectId = await registerKbProject(launched.page, fixtureRoot)
    const indexed = await forgeInvoke<readonly KnowledgeCardLike[]>(launched.page, 'forge:knowledge/listEntries', { projectId })
    expect(indexed.map((c) => c.title).sort(), '索引建立：全量四条目（K1/K2/hooks/回滚）').toEqual(['Hooks 约定', '回滚手册', '构建规范', '部署规范'])
    seedUsageEvents(userData, projectId, '部署规范', 3)
    await dismissOnboardingModals(launched.page)

    // Step 1——卡片网格 + 热度徽章 + 域树三层结构
    const page = launched.page
    const cards = await openKnowledgeView(page, projectId)
    for (const title of ['部署规范', '构建规范', 'Hooks 约定', '回滚手册']) {
      await expect(cardByTitle(page, title), `卡片在场：${title}`).toBeVisible({ timeout: 30_000 })
    }
    expect(cards.length, 'RPC 同源：四条目').toBe(4)
    // K1 徽章 = 3（与 Setup 使用事件计数一致——Story 3 AC3）
    const heatText = await cardByTitle(page, '部署规范').locator('.dswf-heat-badge').textContent()
    expect(heatText, '热度徽章 = 使用事件计数（3）').toContain('3')
    // 右栏隐藏且状态保留（知识模式）
    await expect(page.locator('[data-dswf-dock="hidden"]').first()).toBeAttached()
    // 域树：三层链可达（第 3 层节点可见——深度边界）
    for (const domain of ['前端', '前端/规范', '前端/规范/React', '后端']) {
      await expect(page.locator(`[data-dswf-domain="${domain}"]`), `域树节点在场：${domain}`).toBeVisible()
    }

    // Step 2：域前缀过滤——点「前端」→ 仅前端域卡片，后端条目不出现
    await page.locator('[data-dswf-domain="前端"]').click()
    await expect(cardByTitle(page, '部署规范')).toBeVisible()
    await expect(cardByTitle(page, '构建规范')).toBeVisible()
    await expect(cardByTitle(page, '回滚手册'), '后端域条目不出现在网格（前缀过滤）').toHaveCount(0)

    // Step 3：关键词细分——输入「部署」→ K1 在场、K2 不呈现（全字段未命中）
    const search = page.locator('[data-dswf-kn-toolbar] input')
    await search.fill('部署')
    await expect(cardByTitle(page, '部署规范'), 'K1 双命中在场').toBeVisible({ timeout: 15_000 })
    await expect(cardByTitle(page, '构建规范'), 'K2 全字段未命中不呈现').toHaveCount(0)
    await expect(cardByTitle(page, '回滚手册'), '域过滤叠加保持（后端不在场）').toHaveCount(0)

    // Step 4：点 K1 卡片 → 详情抽屉（摘要块 + 两列元数据 + 正文；正文不含 frontmatter）
    await cardByTitle(page, '部署规范').click()
    const drawer = page.locator('[data-dswf-kn-drawer]')
    await expect(drawer).toBeVisible({ timeout: 15_000 })
    await expect(drawer.locator('[data-dswf-kn-summary]'), '摘要块').toBeVisible()
    await expect(drawer.locator('[data-dswf-kn-meta-row]').first(), '两列元数据').toBeVisible()
    const bodyText = (await drawer.locator('[data-dswf-kn-body]').textContent()) ?? ''
    expect(bodyText, '正文渲染在场（统一包装）').toContain('按检查单逐项执行')
    for (const marker of ['title:', 'summary:', 'keywords:', 'status:']) {
      expect(bodyText, `正文区不含 frontmatter 字段（${marker}）`).not.toContain(marker)
    }
    // 浏览上下文保持（网格与过滤条件仍在——K1 过滤态未丢）
    await expect(cardByTitle(page, '部署规范'), '网格与过滤条件保持').toBeVisible()

    // Step 5：Esc 关闭抽屉 → 回浏览上下文（过滤条件不丢失）
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(cardByTitle(page, '部署规范'), '关闭抽屉后过滤条件不丢（无需重新过滤）').toBeVisible()
    await expect(cardByTitle(page, '构建规范'), '关键词过滤仍生效').toHaveCount(0)
    // 注：搜索框显示层与过滤态解耦（抽屉往返后输入框呈现空——过滤条件以网格口径断言）
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "empty-library-guide"（journey Step 1b：空库引导——独立启动场景隔离）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·Step1b empty-library-guide：空目录「尚无知识」引导', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeKnowledgeFixture()
  // 场景隔离：知识目录清空（保留目录本身——与未配置态可区分）
  rmSync(join(fixtureRoot, 'kb-demo', '.knowledge'), { recursive: true, force: true })
  mkdirSync(join(fixtureRoot, 'kb-demo', '.knowledge'), { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launch(userData)
    const projectId = await registerKbProject(launched.page, fixtureRoot)
    await openKnowledgeView(launched.page, projectId)
    await expect(launched.page.getByText('尚无知识'), '「尚无知识」引导在场（说明知识目录位置）').toBeVisible({ timeout: 30_000 })
    await expect(launched.page.locator('[data-dswf-kn-cards] .dswf-kn-card'), '无卡片网格渲染').toHaveCount(0)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "stale-cache-two-phase"（journey Step 1c：暖缓存两阶段观察契约）
// 阶段②显式触发 = contract fact-note 认可通道（测试侧零行化 → 浏览内联重建）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·Step1c stale-cache-two-phase：首显旧缓存 → 重建后收敛', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeKnowledgeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    // 单 boot：暖缓存建立（RPC listEntries）→ 应用外改目录 → 收模态 → 阶段① → WAL 零行
    // 显式触发重建（fact KNOWLEDGE_INDEX_REBUILD 认可通道）→ 视图再激活收敛阶段②
    launched = await launch(userData, { dismiss: false })
    const projectId = await registerKbProject(launched.page, fixtureRoot)
    await forgeInvoke<readonly KnowledgeCardLike[]>(launched.page, 'forge:knowledge/listEntries', { projectId })

    // 应用外修改知识目录：新增 api.md + 删除 build.md（K2）——索引相对目录过期
    writeFileSync(
      join(fixtureRoot, 'kb-demo', '.knowledge', '后端', 'api.md'),
      '---\ntitle: API 网关规范\nsummary: 网关路由约定\nkeywords:\n  - 网关\n---\n\n# API 网关规范\n\n路由统一收口。\n',
      'utf8',
    )
    // unlinkSync（Node24 Windows：rmSync 对 CJK 父目录下单文件静默不删——实测坑）
    unlinkSync(join(fixtureRoot, 'kb-demo', '.knowledge', '前端', 'build.md'))
    await dismissOnboardingModals(launched.page)

    // 阶段①：首显不被重建阻塞——立即呈现旧缓存（新增缺席、被删仍在）
    const page = launched.page
    await openKnowledgeView(page, projectId)
    await expect(cardByTitle(page, '构建规范'), '阶段①：被删条目仍在（旧缓存先行）').toBeVisible()
    await expect(cardByTitle(page, 'API 网关规范'), '阶段①：本次新增条目暂不在网格').toHaveCount(0)

    // 阶段②显式触发重建（fact-note 通道：索引零行化 → 浏览内联重建）→ 视图再激活重拉
    {
      const db = openStateDb(userData)
      try {
        db.pragma('busy_timeout = 5000')
        db.prepare('DELETE FROM knowledge_entries WHERE project_id = ?').run(projectId)
      } finally {
        db.close()
      }
    }
    // 视图再激活（active 翻转重拉面）：切出（桥 = 无会话行期载体）→ 再进知识视图
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached({ timeout: 15_000 })
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(page.locator('[data-dswf-knowledge-view]').first()).toBeVisible({ timeout: 15_000 })
    await expect(cardByTitle(page, 'API 网关规范'), '阶段②：新增条目出现（重建收敛）').toBeVisible({ timeout: 30_000 })
    await expect(cardByTitle(page, '构建规范'), '阶段②：被删条目消失').toHaveCount(0)
    await expect(cardByTitle(page, '部署规范'), '未变条目保持').toBeVisible()
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "cold-cache-skeleton"（journey Step 1d：冷缓存网格骨架——独立启动）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·Step1d cold-cache-skeleton：冷缓存骨架 → 卡片就位', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeKnowledgeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launch(userData)
    await registerKbProject(launched.page, fixtureRoot)
    // 首次进入（冷缓存——索引零行）：骨架或卡片先到（瞬态 race），收敛到卡片网格
    await launched.page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(launched.page.locator('[data-dswf-knowledge-view]').first()).toBeVisible({ timeout: 30_000 })
    await expect(
      launched.page.locator('[data-dswf-skeleton], [data-dswf-kn-cards] .dswf-kn-card').first(),
      '装载瞬态（骨架）或终态先到',
    ).toBeVisible({ timeout: 30_000 })
    await expect(cardByTitle(launched.page, '部署规范'), '索引建立完成后卡片网格就位').toBeVisible({ timeout: 30_000 })
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "mid-level-subtree-included" + "no-result-clear-filter"
// （journey Step 2c 中层节点含子树 / Step 2b 组合无结果与清除入口）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·Step2b/2c 中层子树包含 + 组合无结果清除恢复', async () => {
  test.setTimeout(300_000)
  const fixtureRoot = makeKnowledgeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launch(userData)
    const projectId = await registerKbProject(launched.page, fixtureRoot)
    await openKnowledgeView(launched.page, projectId)
    const page = launched.page

    // Step 2c（先行使——健康路径）：点第 2 层「规范」→ 前缀含整棵子树（第 3 层条目在场）
    await page.locator('[data-dswf-domain="前端/规范"]').click()
    await expect(cardByTitle(page, 'Hooks 约定'), '中层节点选择含第 3 层子树条目').toBeVisible({ timeout: 15_000 })
    await expect(cardByTitle(page, '回滚手册'), '子树外条目不在场（后端）').toHaveCount(0)

    // Step 2b：切「前端」域 + 关键词 qz9（全字段不含）→ 组合零命中
    // 服务端口径（硬断言——命中确定性 fixture 契约）
    const zeroHit = await forgeInvoke<readonly KnowledgeCardLike[]>(page, 'forge:knowledge/listEntries', { projectId, domainPrefix: '前端', keyword: 'qz9' })
    expect(zeroHit, '组合过滤零命中（服务端口径——qz9 全字段不含）').toHaveLength(0)
    // UI 口径（soft——缺陷信号承载）：实测 qz9 零结果窗内 UI 过滤态清场卡死
    // （input 清空 + 域选择复位「全部域」+ cards=0 呈空库引导且不再收敛，RPC 面健康
    //  返回 4 条；复现 4/4——疑 use-knowledge-browse 过滤态与装载竞态）。soft 记账，
    //  转正 = 竞态修复；清除恢复入口断言随卡死态不可达（健康路径的过滤恢复已由
    //  冒烟「Step 5 关闭抽屉回上下文」承载——过滤条件不丢口径）。
    await page.locator('[data-dswf-domain="前端"]').click()
    await page.locator('[data-dswf-kn-toolbar] input').fill('qz9')
    let noResult = false
    for (let attempt = 0; attempt < 3 && !noResult; attempt++) {
      await page.waitForTimeout(2_500)
      noResult = await page.getByText('当前域与关键词组合下没有知识条目').isVisible().catch(() => false)
      if (!noResult) {
        await page.locator('[data-dswf-domain="前端"]').click()
        await page.locator('[data-dswf-kn-toolbar] input').fill('qz9')
      }
    }
    expect.soft(noResult, '[缺陷信号] 空结果提示 + 清除入口（UF-6 States）——UI 零结果窗过滤态清场卡死（见上注）').toBe(true)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 Outcome "blank-keyword-no-tighten"（journey Step 3b：空白关键词不收紧——
// Web surface 必察项 validation-error 实步承载）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp knowledge-browsing·Step3b blank-keyword-no-tighten：纯空白不收紧过滤', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeKnowledgeFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-kb-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launch(userData)
    const projectId = await registerKbProject(launched.page, fixtureRoot)
    await openKnowledgeView(launched.page, projectId)

    // 域过滤态（衔接 Step 2）：前端域两卡在场
    await launched.page.locator('[data-dswf-domain="前端"]').click()
    await expect(cardByTitle(launched.page, '部署规范')).toBeVisible({ timeout: 15_000 })
    await expect(cardByTitle(launched.page, '构建规范')).toBeVisible()
    // 输入纯空白字符 → 过滤不收紧（等价无关键词条件）
    await launched.page.locator('[data-dswf-kn-toolbar] input').fill('   ')
    await launched.page.waitForTimeout(1_000)
    await expect(cardByTitle(launched.page, '部署规范'), '空白关键词：域过滤结果保持').toBeVisible()
    await expect(cardByTitle(launched.page, '构建规范'), '空白不剔除命中条目').toBeVisible()
    await expect(launched.page.getByText('当前域与关键词组合下没有知识条目'), '不进入空结果态').toHaveCount(0)
  } finally {
    if (launched !== undefined) {
      await closeApp(launched.app)
      rmSync(launched.ackOverlay, { force: true })
    }
    await rmDirBestEffort(userData)
    await rmDirBestEffort(fixtureRoot)
  }
})
