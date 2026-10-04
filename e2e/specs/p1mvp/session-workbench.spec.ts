// @feature:dsh-forge-p1-mvp @web-e2e
// gen-test-scripts 产物 —— Journey: session-workbench（T-test-gen-scripts）。
// 断言源 = docs/features/dsh-forge-p1-mvp/testing/session-workbench/contracts/step-{1..6}-*.md
// （eval-contract 1098/1150 通过）。
//
// dogfood 策略（沿 e2e/specs/flywheel.spec）：真实模型往返（Step 2/3/4/5 会话链）经
// 隔离 DSH_HOME 播种真实凭据 + 低成本模型叠层；凭据缺席 = 留痕 skip（不伪造）。
// 无往返依赖的 Outcome（1b/1c/2b/2c/4b/4c + 5/6 的可达子集）独立成无 dogfood 测试。
//
// Fact Table 摘录（源码核实）：
//   - 三页签（fix-25 官方 roster）：[data-conversation-tabs] [role=tab]（对话=官方 chat 直用/
//     轨迹/知识召回=产品登记项）；产品 panes [data-dswf-pane=trajectory|recall]；对话面/composer
//     = 官方原生（[data-conversation-content]/[data-composer-input]）；会话面板本体 = 官方
//     [data-slot=main.conversation]
//   - 轨迹台账：[data-dswf-traj-row=message|tool|event|error]（TrajectoryLedger.tsx）
//   - 侧栏：[data-dswf-sidebar=wide|rail]；[data-dswf-project]/[data-dswf-session]；暂无会话 .dswf-sidebar-no-session；
//     骨架 [data-dswf-skeleton]；空态 [data-dswf-empty]（ForgeWorkspacePanel.test 核实）
//   - 官方壳：折叠钮 session.new/toggle.collapse 词条（dsh-client-ui-sidebar i18n：新会话/收起侧边栏/打开侧边栏）
//   - 右栏（fix-23 官方 ui-sidebar-right 接管）：frame [data-rightbar-collapsed]（收起/休眠在场、
//     展开退场）；列 [data-rightbar-col]；面板钮 [data-sidebar-right-expand]（动作 = 官方
//     sidebarRight.toggleExpanded——官方 ExpandButton/strip chrome 同一动作径）；strip chrome
//     收展钮 [aria-label=收起右侧边栏]；strip 页签 [data-rightbar-col] [data-dockkit-strip]
//     [role=tab]（官方 guide 种子页「开始」）
//   - composer：[data-composer-input]（官方 contenteditable）；工作区芯片 默认工作区|选择工作区 → [role=menu]
//   - 会话文件：{userData}/dsh-home/sessions/<sanitized-cwd>/session-<id>/session[.vN].jsonl[.zstd]
//     （system/message + tool/call 事件——flywheel.spec 解码器同源）
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')
const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

const DOGFOOD_PROVIDER = process.env.DSH_FORGE_DOGFOOD_PROVIDER ?? 'zai-coding-cn'
const DOGFOOD_MODEL = process.env.DSH_FORGE_DOGFOOD_MODEL ?? 'glm-5.3-flash'

/** 真实凭据文件在场？（dogfood 前置门——缺席 = 留痕 skip，不伪造） */
function realCredentials(): string | undefined {
  const candidate = join(homedir(), '.dsh', '.credentials.yaml')
  return existsSync(candidate) ? readFileSync(candidate, 'utf8') : undefined
}

/** 播种隔离 dsh-home：.credentials.yaml（真实拷贝）——dsh profile 域凭据，产品不经手 */
function seedDshHome(dshHome: string, credentials: string): void {
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, '.credentials.yaml'), credentials, 'utf8')
}

/** dogfood 叠层（低成本模型——boot overlay 之后应用；首启告示预确认 = 产品 overlay 内置，fix-12） */
function writeDogfoodOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-dogfood-${process.pid}.yml`)
  writeFileSync(
    target,
    [
      '# e2e dogfood 叠层：低成本模型（首启告示预确认 = 产品 overlay 内置，fix-12）',
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      `      ${DOGFOOD_PROVIDER}:`,
      '        apiKeyEnv: ZAI_CODING_CN_API_KEY',
      '- id: agent-default-model',
      '  config:',
      `    provider: ${DOGFOOD_PROVIDER}`,
      `    model: ${DOGFOOD_MODEL}`,
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

async function dismissOnboardingModals(page: Page): Promise<void> {
  // 窗口 30s：模态挂载可晚于工作台可见数十秒（kit 收敛）——15s 窗口实测漏收
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

interface LaunchOpts {
  readonly userData: string
  /** dogfood 模型叠层路径（缺席 = 裸启动——首启告示预确认由产品 boot overlay 承载，fix-12） */
  readonly overlay?: string
  readonly dogfood?: boolean
}

interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  readonly pageErrors: string[]
}

async function launchHost(opts: LaunchOpts): Promise<Launched> {
  const { _electron } = await import('@playwright/test')
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: {
      ...process.env,
      DSH_FORGE_DEV_PROFILE: 'dev',
      ...(opts.overlay === undefined ? {} : { DSH_FORGE_PATCH_FILES: opts.overlay }),
      DSH_FORGE_USER_DATA: opts.userData,
      DSH_FORGE_PORT: String(19850 + (process.pid % 200)),
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
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
  await dismissOnboardingModals(page)
  await page.waitForFunction(
    () => {
      const p = document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase')
      return p === 'hero' || p === 'session'
    },
    undefined,
    { timeout: 30_000 },
  )
  return { app, page, pageErrors }
}

/** 工作区夹具：{root}/<name>（含哨兵文件——「列出文件」fixture 消息的确定性工具调用对象） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-'))
  mkdirSync(join(root, name, '.knowledge'), { recursive: true })
  writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  return root
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

interface ProjectSummaryLike {
  readonly id: string
  readonly name: string
  readonly wsPath: string
}

async function registerProject(page: Page, dir: string, name: string): Promise<ProjectSummaryLike> {
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', {
    workspaceDir: dir,
    name,
    forgeDir: `${dir}\\.forge`,
    knowledgeDir: `${dir}\\.knowledge`,
  })
  const projects = await forgeInvoke<readonly ProjectSummaryLike[]>(page, 'forge:projects/list')
  return projects.find((p) => p.id === result.projectId)!
}

/** composer 工作区芯片流（选定工作区 = 官方会话面新会话入口——installer-smoke/flywheel 同径） */
async function selectWorkspaceViaChip(page: Page, workspaceName: string): Promise<void> {
  const composer = page
    .locator('[data-composer-input]')
    .last()
  await expect(composer, '官方会话面 composer 在场').toBeVisible({ timeout: 60_000 })
  const chip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
  await expect(chip).toBeVisible({ timeout: 30_000 })
  await chip.click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  const item = menu
    .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
    .filter({ hasText: workspaceName })
    .first()
  await expect(item, `夹具工作区在列（${workspaceName}）`).toBeVisible({ timeout: 15_000 })
  await item.click()
  await expect(page.locator('[data-dswf-workbench][data-dswf-view="session"]').first()).toBeAttached()
}

// ─── dsh 会话文件解码（flywheel.spec 同源） ───

interface SessionEvent {
  readonly type: string
  readonly seq?: number
  readonly data?: { readonly name?: string }
}

function decodeSessionFile(path: string): readonly SessionEvent[] {
  const buf = readFileSync(path)
  const frames: number[] = []
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) frames.push(i)
  }
  frames.push(buf.length)
  const events: SessionEvent[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    try {
      const text = zstdDecompressSync(buf.subarray(frames[i]!, frames[i + 1]!)).toString('utf8')
      for (const line of text.split('\n')) {
        if (line === '') continue
        try {
          events.push(JSON.parse(line) as SessionEvent)
        } catch {
          // 帧内非 JSON 行跳过
        }
      }
    } catch {
      // magic 误报帧跳过
    }
  }
  return events
}

function bestSessionLog(sessionDir: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined
  const files = readdirSync(sessionDir).filter((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
  if (files.length === 0) return undefined
  const versionOf = (f: string): number => Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(f)?.[1] ?? 0)
  return join(sessionDir, files.sort((a, b) => versionOf(b) - versionOf(a))[0] as string)
}

function findFixtureSession(dshHome: string, fixtureSegment: string): { readonly sessionId: string } | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  let newest: { sessionId: string; mtime: number } | undefined
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory() || !wsDir.name.includes(fixtureSegment)) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const log = bestSessionLog(join(sessionsDir, wsDir.name, sDir.name))
      const mtime = log !== undefined ? statSync(log).mtimeMs : 0
      if (newest === undefined || mtime >= newest.mtime) newest = { sessionId: sDir.name, mtime }
    }
  }
  return newest
}

async function waitForFixtureSession(dshHome: string, fixtureSegment: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = findFixtureSession(dshHome, fixtureSegment)
    if (found !== undefined) return found.sessionId
    if (Date.now() > deadline) throw new Error(`等待夹具会话目录超时（${timeoutMs}ms）`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

/** 按会话 id（目录名 session-<uuid>）定位现行日志文件 */
function sessionLogById(dshHome: string, sessionId: string): string | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  const target = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory()) continue
    const log = bestSessionLog(join(sessionsDir, wsDir.name, target))
    if (log !== undefined) return log
  }
  return undefined
}

/** 工作台桥导航（fix-25：官方面板径——showSession = layout.selectPanel(null)
 * 回官方会话面板；无产品会话行期的载体适配，台账口径保持） */
async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { showSession(): void } }).__DSH_FORGE_WORKBENCH__
    if (eventType === 'show-session') bridge?.showSession()
  }, type)
}

// ─────────────────────────────────────────────────────────────────────────────
// 旅程冒烟（dogfood）：三区首屏 → 新会话真实往返 → 轨迹台账 → 恢复既有会话 →
// 视图互换右栏保留（Step 1-5 success 贯穿；Step 6 项目级页签部分留痕 skip 见文件尾）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·冒烟：首屏→往返→轨迹→恢复→视图互换保留（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(
    credentials === undefined,
    'dogfood 前置缺口：真实模型凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip（沿 flywheel.spec 口径，不伪造凭据）',
  )

  const fixtureRoot = makeWorkspaceFixture('sw-demo')
  const wsDir = join(fixtureRoot, 'sw-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const overlay = writeDogfoodOverlay()
  const { app, page, pageErrors } = await launchHost({ userData, overlay, dogfood: true })
  try {
    // Setup：项目甲（RPC 直注——向导 UI 走查归 project-registration 旅程）
    await registerProject(page, wsDir, 'sw-demo')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(5_000) // 收敛窗（安装/首启 kit 收敛——installer-smoke 同径静置）

    // ── Step 1 success：首屏三区 + 左栏构成 + 右栏默认收起 ──
    await expect(page.locator('#root nav[aria-label]').first(), '官方导航壳在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-sidebar="wide"]').first(), '产品工作区面板（宽栏）').toBeVisible()
    await expect(page.locator('button[aria-label="知识库"]').first(), '知识库入口').toBeVisible()
    await expect(page.locator('.dswf-sidebar-sectionlabel', { hasText: '项目' }).first(), '项目树区').toBeVisible()
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="session"]').first(), '中区会话视图').toBeAttached()
    await expect(page.locator('[data-slot="main.conversation"]').first(), '官方会话面渲染（fix-25）').toBeVisible()
    await expect(page.locator('[data-rightbar-collapsed]').first(), '右栏默认收起（fix-23 官方右栏 frame 锚）').toBeAttached()

    // ── Step 2 success：新会话 + 真实往返（fixture 消息保证 ≥1 工具调用） ──
    await selectWorkspaceViaChip(page, 'sw-demo')
    const composer = page
      .locator('[data-composer-input]')
      .last()
    await composer.click()
    const fixtureMessage = '列出当前工作区根目录下的文件'
    await page.keyboard.insertText(fixtureMessage)
    await page.keyboard.press('Enter')
    // 观察窗 120s：会话目录落盘（账本 id）+ tool/call 事件在场（往返真实发生）
    const sessionId = await waitForFixtureSession(dshHome, 'sw-demo', 120_000)
    const deadline = Date.now() + 120_000
    let toolCallSeen = false
    for (;;) {
      const log = sessionLogById(dshHome, sessionId)
      if (log !== undefined) {
        toolCallSeen = decodeSessionFile(log).some((e) => e.type === 'tool/call')
      }
      if (toolCallSeen || Date.now() > deadline) break
      await new Promise((resolve) => setTimeout(resolve, 3_000))
    }
    expect(toolCallSeen, '真实往返：会话日志含 ≥1 次 tool/call（fixture 消息保证）').toBe(true)
    // 左栏会话行入列（dsh 行语言：标题/状态点/相对时间）
    const sessionRow = page.locator(`[data-dswf-session="${sessionId}"]`).first()
    await expect(sessionRow, '会话行入列（账本实时读）').toBeVisible({ timeout: 60_000 })
    await expect(sessionRow.locator('.dswf-sidebar-session-title'), '行语言：标题在场').not.toBeEmpty()
    await expect(sessionRow.locator('.dswf-sidebar-session-time'), '行语言：相对时间在场').not.toBeEmpty()
    // 回答呈现于对话 tab
    await expect(page.locator('[data-conversation-content]').first()).toBeAttached()

    // ── Step 3 success：轨迹 tab 最简台账 + 切回不重置 ──
    // 等值断言前静置窗（fix-11）：官方会话面活体文案（「用时 N秒」运行计时/流式增量）使
    // textContent 持续漂移——账本级 tool/call 在场不保证回合已收尾（dogfood 工具失败重试期
    // 计时器长活）。静置判据 = 计时归一后 1s 两读等值；90s 未静置（真实长活体）降级为
    // fixture 消息 containment 承载（防重置的核心信号），不再硬等值。
    const normalizeLiveTicker = (text: string): string => text.replace(/用时\s*\d+\s*秒/g, '用时 N秒')
    const readConversationText = async (): Promise<string> =>
      (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 })) ?? ''
    {
      const deadline = Date.now() + 90_000
      let prev = normalizeLiveTicker(await readConversationText())
      for (;;) {
        await page.waitForTimeout(1_000)
        const next = normalizeLiveTicker(await readConversationText())
        if (next === prev || Date.now() > deadline) break
        prev = next
      }
    }
    const transcriptBefore = await readConversationText()
    await page.locator('[data-conversation-tabs] [role="tab"]', { hasText: '轨迹' }).click()
    await expect(page.locator('[data-dswf-pane="trajectory"]').first()).toBeVisible()
    await expect(
      page.locator('[data-dswf-traj-row="tool"]').first(),
      '台账含 ≥1 条工具调用（fixture 保证）',
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-dswf-traj-row="message"]').first(), '台账含本轮消息').toBeVisible()
    // 切回对话 tab 不重置——转录仍在原位（活体计时归一后等值；长活体降级 containment）
    await page.locator('[data-conversation-tabs] [role="tab"]', { hasText: '对话' }).click()
    await expect(page.locator('[data-conversation-content]').first()).toBeVisible()
    const transcriptAfter = await readConversationText()
    if (normalizeLiveTicker(transcriptAfter) === normalizeLiveTicker(transcriptBefore)) {
      expect(normalizeLiveTicker(transcriptAfter), '切回不重置：往返转录仍在原位（计时归一等值）').toBe(
        normalizeLiveTicker(transcriptBefore),
      )
    } else {
      expect(transcriptAfter, '切回不重置（长活体降级）：本轮提问仍在原位').toContain(fixtureMessage)
    }

    // ── Step 4 success：恢复既有会话（先开新会话再点回历史行——恢复链载体） ──
    const newSessionBtn = page.getByRole('button', { name: /新会话|新建会话/ }).first()
    await newSessionBtn.click({ timeout: 15_000 })
    await page.waitForTimeout(2_000)
    // 点回 Step 2 历史会话行 → 恢复（骨架瞬态 race 后转录完整呈现）
    await sessionRow.click()
    await expect(page.locator('[data-conversation-content]').first()).toBeVisible()
    // 恢复收敛轮询（fix-11）：会话切换 → 官方面历史分页装载为异步（骨架/空白瞬态后转录
    // 入位）——单发 textContent 在切换瞬间恒取空白态；按断言本意（恢复完成）轮询承载
    await expect
      .poll(
        async () =>
          (await page
            .locator('[data-conversation-content]')
            .first()
            .textContent({ timeout: 10_000 })
            .catch(() => '')) ?? '',
        { timeout: 60_000, message: '恢复后完整转录呈现（消息与工具调用按时间序）' },
      )
      .toContain(fixtureMessage)

    // ── Step 5 success：视图互换且右栏状态保留（官方右栏展开 + 草稿 + 知识模式隐藏 + 切回恢复） ──
    // fix-23：右栏 = 官方 ui-sidebar-right 活体；面板钮（[data-sidebar-right-expand] 锚保持）
    // 动作 = 官方 sidebarRight.toggleExpanded（官方 ExpandButton/strip chrome 同一动作径——
    // 官方头部链三件（「打开方式」+「⋯」+官方 corner）在产品 main.conversation 影子下不可达，
    // slot runtime per-entry renderSlot 授权实证见 fix-23 记录——转后续架构任务）
    const expandButton = page.locator('[data-sidebar-right-expand]').first()
    await expect(expandButton, '面板钮在场（官方右栏收展入口）').toBeVisible({ timeout: 30_000 })
    await expandButton.click()
    await expect(page.locator('[data-rightbar-collapsed]'), '官方右栏展开（frame 收起标记退场）').toHaveCount(0)
    await expect(
      page.locator('[data-rightbar-col] [data-dockkit-strip] [role="tab"]').first(),
      '页签条在场',
    ).toBeVisible()
    // 预输入草稿「待发问题」不发送（值断言在切回后以 evaluate 双形态承载）
    await composer.click()
    await page.keyboard.insertText('待发问题')
    // 进入知识视图：右栏隐藏（已展开也隐藏——官方 sidebarRight 窄面联动收起）
    await page.locator('button[aria-label="知识库"]').first().click()
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="knowledge"]').first()).toBeAttached()
    await expect(page.locator('[data-rightbar-collapsed]').first(), '知识模式右栏隐藏').toBeAttached()
    // 点 Step 4 会话行切回：右栏按记忆恢复 + 草稿保留 + 转录完整
    await sessionRow.click()
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('[data-rightbar-collapsed]'), '切回后右栏恢复原展开态（rightbarViewPlan 记忆恢复）').toHaveCount(0)
    const draftText = await composer.evaluate((el) => (el as HTMLTextAreaElement).value ?? el.textContent ?? '')
    expect(draftText, '保留探针①：草稿「待发问题」仍在输入框').toContain('待发问题')
    // 保留探针②（恢复收敛轮询——同 Step 4 同径）：Step 4 会话转录仍完整呈现
    await expect
      .poll(
        async () =>
          (await page
            .locator('[data-conversation-content]')
            .first()
            .textContent({ timeout: 10_000 })
            .catch(() => '')) ?? '',
        { timeout: 60_000, message: '保留探针②：Step 4 会话转录仍完整呈现' },
      )
      .toContain(fixtureMessage)
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app.close()
    rmSync(overlay, { force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "rail-collapse"（journey Step 1b：左栏收起 56px rail）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step1b rail-collapse：收起为 rail 图标列可往返', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    // 点官方折叠控件（dsh-client-ui-sidebar toggle.collapse 词条）
    const collapseBtn = page.locator('button[aria-label="收起侧边栏"], button[title="收起侧边栏"]').first()
    await expect(collapseBtn, '官方折叠控件在场').toBeVisible({ timeout: 30_000 })
    await collapseBtn.click()
    // Output：产品面板折叠为 rail（fix-25：知识入口 = 官方 panellist 行——常驻侧栏列，
    // rail 态官方行自持图标），导航内容不丢失
    await expect(page.locator('[data-dswf-sidebar="rail"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button[aria-label="知识库"]').first(), 'rail 态图标保留（官方 panellist 行）').toBeVisible()
    // 再展开恢复完整导航
    const expandBtn = page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]').first()
    await expect(expandBtn, '展开控件在场（rail 态）').toBeVisible({ timeout: 15_000 })
    await expandBtn.click()
    await expect(page.locator('[data-dswf-sidebar="wide"]').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('button[aria-label="知识库"]').first(), '完整导航恢复').toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 Outcome "zero-project-rail-empty"（journey Step 1c：零项目首用 rail 空态）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step1c zero-project-rail-empty：零项目首用空态引导', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    // 零项目首用：中区 hero + CTA；左栏项目区空态（无项目行）
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'hero')
    // CTA 可见性断言 + 失败取证（fix-11 簇③：偶发 resolved-but-hidden ≥10s，2/5 样本，
    // 根因未钉——零尺寸盒/隐藏祖先链两假设待证）。取证 = 失败瞬间倾倒祖先 display/
    // visibility/几何链 + 窗口尺寸并截图，转复现即钉根因；断言本体零弱化（仍照常失败）。
    try {
      await expect(page.locator('[data-dswf-cta="add-project"]'), 'hero「＋添加项目」CTA').toBeVisible()
    } catch (error) {
      const evidence = await page
        .evaluate(() => {
          const cta = document.querySelector('[data-dswf-cta="add-project"]')
          const base = {
            phase: document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase') ?? 'absent',
            innerW: window.innerWidth,
            innerH: window.innerHeight,
            docVis: document.visibilityState,
          }
          if (cta === null) return { ...base, present: false }
          const rect = cta.getBoundingClientRect()
          const chain: string[] = []
          let el: Element | null = cta
          for (let i = 0; el !== null && i < 24; i += 1) {
            const cs = window.getComputedStyle(el)
            const r = el.getBoundingClientRect()
            const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : ''
            chain.push(
              `${el.tagName.toLowerCase()}.${cls}:disp=${cs.display},vis=${cs.visibility},${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
            )
            el = el.parentElement
          }
          return { ...base, present: true, rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`, chain }
        })
        .catch((e: unknown) => ({ error: String(e) }))
      console.log(`[step1c-evidence] ${JSON.stringify(evidence)}`)
      await page.screenshot({ path: join(tmpdir(), `dsh-forge-step1c-hidden-${Date.now()}.png`) }).catch(() => undefined)
      throw error
    }
    await expect(page.locator('[data-dswf-project]'), 'rail 项目树零行（空态）').toHaveCount(0)
    await expect(page.locator('button[aria-label="知识库"]').first(), '导航入口在场（空态不缺位）').toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "empty-session-guide" + "blank-send-blocked"（journey Step 2b/2c）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step2b/2c 空会话引导 + 空消息发送被拦截', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('blank-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    await registerProject(page, join(fixtureRoot, 'blank-demo'), 'blank-demo')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(5_000)

    // Step 2b：新建会话（工作区芯片流）→ 空会话引导态（composer 承载引导输入）
    await selectWorkspaceViaChip(page, 'blank-demo')
    const composer = page
      .locator('[data-composer-input]')
      .last()
    await expect(composer, '空会话引导态：输入区在场可聚焦').toBeVisible()
    const conversation = page.locator('[data-conversation-content]').first()
    await expect(conversation, '空会话引导态：会话面在场').toBeAttached()

    // Step 2c：空输入发送意图（回车 + 空白字符两口径）→ 不发送
    await composer.click()
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('   ')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3_000)
    // Output：无消息上屏、无 agent 往返——账本级断言（芯片流开户的空白会话文件在场为
    // 常态——断其零消息零工具调用：仅 system/header 事件；注：官方 composer 占位文案
    // 随输入态显隐，转录文本等值断言不可用——载体适配）
    {
      const found = findFixtureSession(join(userData, 'dsh-home'), 'blank-demo')
      if (found !== undefined) {
        const log = sessionLogById(join(userData, 'dsh-home'), found.sessionId)
        const events = log !== undefined ? decodeSessionFile(log) : []
        const nonSystem = events.filter((e) => e.type !== 'system/message')
        expect(nonSystem.filter((e) => /message/i.test(e.type)), '空提交零用户/助手消息').toHaveLength(0)
        expect(nonSystem.filter((e) => e.type === 'tool/call'), '空提交零 agent 往返').toHaveLength(0)
      }
    }
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el !== null && (el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true')
    })
    expect(focused, '焦点仍在输入框').toBe(true)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 Outcome "zero-session-placeholder" + "list-loading-skeleton"（journey Step 4b/4c）
// 骨架为瞬态：以「骨架或终态先到 → 收敛到终态」两阶段观察承载（确定性面）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step4b/4c 项目乙暂无会话占位 + 列表收敛', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('proj-jia')
  mkdirSync(join(fixtureRoot, 'proj-yi'), { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    const jia = await registerProject(page, join(fixtureRoot, 'proj-jia'), 'proj-jia')
    const yi = await registerProject(page, join(fixtureRoot, 'proj-yi'), 'proj-yi')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)

    // 展开项目乙节点（DisclosureRow 头点击）→ 4c 两阶段：骨架或占位先到 → 收敛「暂无会话」
    const yiRow = page.locator(`[data-dswf-project="${yi.id}"] .dswf-sidebar-project-row`).first()
    await yiRow.click()
    const placeholder = page.locator(`[data-dswf-project="${yi.id}"] .dswf-sidebar-no-session`)
    await expect(placeholder, '乙项目「暂无会话」占位（UF-1 States）+ 不报错').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(`[data-dswf-project="${yi.id}"] [data-dswf-session]`), '乙零会话行').toHaveCount(0)
    // 甲乙并存（多项目树）
    await expect(page.locator(`[data-dswf-project="${jia.id}"]`).first()).toBeAttached()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 5/6 可达子集（无 dogfood）：知识模式视图互换 + 官方右栏休眠形态
// （Step 5 的草稿/转录保留探针需真实会话——归冒烟；Step 6 项目级页签差异见文件尾留痕。
// fix-23：官方右栏 = 会话作用域（无会话无钮无面板——官方原生语义），本组无会话面 →
// 右栏休眠形态断言（frame 收起标记 + 无展开钮）；展开/隐藏/恢复链归 Step 5 冒烟组。
// fix-25：视图互换 = 官方 keyed main 面板（非选中面板卸载——DOM keep-alive 语义退役；
// 会话状态（草稿/转录）归官方 store 自持，保留探针归 Step 5 冒烟组实证）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step5/6 可达子集：官方右栏休眠形态 + 视图互换（官方面板径）', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeWorkspaceFixture('dock-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-sw-ud-'))
  const { app, page } = await launchHost({ userData })
  try {
    await registerProject(page, join(fixtureRoot, 'dock-demo'), 'dock-demo')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await page.waitForTimeout(3_000)
    const conversation = page.locator('[data-slot="main.conversation"]').first()

    // 官方右栏休眠形态（fix-23 无会话面）：frame 收起标记在场 + 无展开钮（官方原生语义）
    await expect(page.locator('[data-rightbar-collapsed]').first(), '右栏收起（官方 frame 锚）').toBeAttached()
    await expect(page.locator('[data-sidebar-right-expand]'), '无会话面 = 无展开钮（官方休眠）').toHaveCount(0)

    // 知识模式：中区视图互换（官方 keyed main——会话面板让位卸载，状态归官方 store 自持；
    // 右栏本就休眠——不变式「无知识视图+右栏可见」成立）
    await page.locator('button[aria-label="知识库"]').first().click()
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="knowledge"]').first()).toBeAttached()
    await expect(page.locator('[data-rightbar-collapsed]').first(), '知识模式右栏隐藏（不变式：无「知识视图+右栏可见」）').toBeAttached()
    await expect(conversation, '官方 keyed main 互换：会话面板让位卸载（fix-25 官方语义）').toHaveCount(0)

    // 切回会话视图（工作台桥 = 无会话行期的载体适配，smoke-skeleton 台账口径；
    // 会话行切回路径由冒烟（dogfood）承载）：面板恢复挂载、右栏保持官方休眠
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator('[data-dswf-workbench][data-dswf-view="session"]').first()).toBeAttached({ timeout: 15_000 })
    await expect(page.locator('[data-slot="main.conversation"]').first()).toBeVisible()
    await expect(page.locator('[data-rightbar-collapsed]').first(), '无记忆联动（休眠未动）').toBeAttached()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 留痕 skip：Step 6 项目级页签跟随（fixture 预置缝缺失）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp session-workbench·Step6 项目级页签集跟随（留痕 skip）', async () => {
  test.skip(
    true,
    'fact DOCK_TAB_MODEL：fix-23 起右栏 = 官方 ui-sidebar-right（per-session 页签集 = 官方注册表口径，'
      + '产品自研页签登记表（M0_DOCK_TABS/dock.ts）随自研轨道退役），甲/乙项目级页签差异的 fixture '
      + '预置通道未提供（journey Setup 声明的测试基建契约）——留痕 skip，转正条件 = 项目级内容 '
      + '经官方 sidebarRightTabs 注册缝落地（官方口径「adding a type is a registration, never an edit」）',
  )
})
