// 4.2 MVP 门第一步：飞轮 6 步链端到端走查（dogfood 真实模型）——
// 注册（两段式）→ 发起会话 → agent 召回（知识段指引）→ 事件落库 → 召回 tab 条目 → 卡片热度。
// 断言源：任务 4.2 AC × Story 4（AC1 系统提示词知识段内容 / AC2 search→read-abstract
// 多步链 SC10 / AC3 事件↔tab↔热度三方一致 = tech-design Key Test Scenarios ⑥）+
// PRD Goals「6 步链 100% 不间断」；e2e 事件数据面 = SMOKE-LEDGER §5 缺口 2 的 dogfood 转正面。
//
// dogfood 策略（tech-design Testing Strategy 会话链路行 + Open Question ② 裁决）：
// 低成本真实模型（缺省 zai-coding-cn / glm-5.3-flash，env DSH_FORGE_DOGFOOD_PROVIDER/
// DSH_FORGE_DOGFOOD_MODEL 可覆写）；模型凭据经 dsh profile 域——隔离 DSH_HOME 内播种
// .credentials.yaml（拷贝真实凭据）+ settings.yaml（dogfood 模型配置），产品不经手
// （Security 约定）。凭据缺席 = dogfood 前置缺口 → 留痕 skip（不伪造凭据；CI 无凭据面）。
// 录制回放不预建——flake 时按 Open Question ② 评估。
//
// 真实轨迹可查面（SC10 e2e 断言的载体）：dsh 会话持久化文件 session.v3.jsonl.zstd
// （{dshHome}/sessions/<sanitized-cwd>/session-<id>/）——多 zstd 帧逐帧解出 JSONL 事件：
// system/message（模型实收系统提示词——AC1 内容断言）+ tool/call（工具调用轨迹——
// knowledge.search / knowledge.read-abstract 多步链与次序断言）。
// 隔离：独立 userData + 独立端口（e2e 单实例纪律，沿 smoke-skeleton/knowledge-integration）。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')

const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

/** dogfood 模型面（缺省低成本；env 覆写供记录与调参） */
const DOGFOOD_PROVIDER = process.env.DSH_FORGE_DOGFOOD_PROVIDER ?? 'zai-coding-cn'
const DOGFOOD_MODEL = process.env.DSH_FORGE_DOGFOOD_MODEL ?? 'glm-5.3-flash'

// ─────────────────────────────────────────────────────────────────────────────
// 载体助手（沿 knowledge-integration.spec 同型）
// ─────────────────────────────────────────────────────────────────────────────

/** 启动薄宿主（dev profile + 独立 userData——单实例锁互不干扰） */
async function launchHost(overrides: Record<string, string>): Promise<ElectronApplication> {
  const { _electron } = await import('@playwright/test')
  return _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: { ...process.env, ...overrides } as Record<string, string>,
  })
}

/** 壳 boot 就绪链（沿 smoke-skeleton.spec 同径） */
async function waitShellReady(page: Page): Promise<void> {
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
}

/**
 * 官方首启引导模态收起（容错两态）：「预览版说明」（预播种缺席常态；版本漂移在场点「继续」）
 * 与「添加一个 API Key」onboarding（deepseek-official 凭据缺席触发——dogfood 用自配 provider，
 * 点「稍后配置」本地收起）。逐轮收起直至无模态（上限 3 轮——官方链最多两弹）。
 */
async function dismissOnboardingModals(page: Page): Promise<void> {
  for (let round = 0; round < 3; round++) {
    const dismissButton = page
      .locator('[role="dialog"] button', { hasText: /^继续$|^稍后配置$/ })
      .first()
    if (!(await dismissButton.isVisible().catch(() => false))) return
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

/** 浏览器行定位 + 双击进入（沿 knowledge-integration 同径） */
function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  return page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?:\\s|$)`) }).first()
}

async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

/** renderer forge RPC 面（preload dshForge.invoke——信封 {ok,data} 由调用侧解包） */
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

/** heat 通道专用（Map 经 Playwright 通道退化为普通对象——页内先转 entries，Node 侧重建） */
async function invokeHeat(page: Page, projectId: string): Promise<Map<number, number>> {
  const entries = await page.evaluate(async (id) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    const envelope = await forge!.invoke('forge:knowledge/heat', { projectId: id })
    if (!envelope.ok) throw new Error(`forge RPC heat 失败：${JSON.stringify(envelope)}`)
    const heat = envelope.data as Map<number, number>
    return heat instanceof Map ? [...heat.entries()] : Object.entries(heat as Record<string, number>).map(([k, v]) => [Number(k), v] as [number, number])
  }, projectId)
  return new Map(entries as readonly [number, number][])
}

// ─────────────────────────────────────────────────────────────────────────────
// dogfood 播种面：隔离 DSH_HOME（凭据 + dogfood 模型配置——dsh profile 域，产品不经手）
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// dogfood 叠层（DSH_FORGE_PATCH_FILES → boot run.ts 外部 patchFiles）：
// 0.2.0-rc.2 设置面 = profile 插件行 config（$DSH_HOME/settings.yaml 为 legacy 文档、
// 启动即改名 .imported 仅一次性搬迁）——模型按官方机制走行 config；首启告示预确认
// 已由产品 boot overlay 内置承载（fix-12），叠层只管模型面。
// 临时 profile 目录不可行（runtime resolution 以 realpath 侦测活动 profile 层，junction
// 链判层外——40 插件 import 失败，4.2 实证），故经 boot 外部叠层注入、仓内 profile 不动。
// ─────────────────────────────────────────────────────────────────────────────

/** dogfood 叠层落地（返回其路径——launchHost env DSH_FORGE_PATCH_FILES 消费） */
function writeDogfoodOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-dogfood-${process.pid}.yml`)
  writeFileSync(
    target,
    [
      '# 4.2 dogfood e2e 叠层：低成本模型（boot overlay 之后应用；首启告示预确认 = 产品 overlay 内置，fix-12）',
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

// ─────────────────────────────────────────────────────────────────────────────
// 知识夹具：{root}/demo-proj/.knowledge/{前端,后端}（frontmatter 最小契约——沿 3.8 夹具口径）
// ─────────────────────────────────────────────────────────────────────────────

function makeKnowledgeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-flywheel-'))
  const kn = join(root, 'demo-proj', '.knowledge')
  mkdirSync(join(kn, '前端'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\ntitle: 部署规范\nsummary: 项目部署流程与上线检查单\nkeywords:\n  - 部署\n  - 上线\n---\n\n# 部署规范\n\n部署前核对回滚预案与环境变量清单。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\ntitle: 回滚手册\nsummary: 服务回滚步骤与注意事项\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

// ─────────────────────────────────────────────────────────────────────────────
// dsh 会话文件解码（真实轨迹可查面）：多 zstd 帧 → JSONL 事件流
// ─────────────────────────────────────────────────────────────────────────────

interface SessionEvent {
  readonly type: string
  readonly seq?: number
  readonly data?: {
    readonly name?: string
    readonly arguments?: string
    readonly message?: { readonly content?: readonly { readonly type?: string; readonly text?: string }[] }
  }
}

/** 解码 session.v3.jsonl.zstd（逐帧 zstd——帧界 = zstd magic 28 B5 2F FD；实测 2427/2427 帧可解） */
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
          // 帧内非 JSON 行（header 行以外的注记）跳过
        }
      }
    } catch {
      // magic 误报帧（压缩载荷内偶现字节序）跳过——事件面以可解帧为准
    }
  }
  return events
}

/** 会话目录内的现行日志文件（canonical generation 名——版本无关：session.jsonl[.zstd] / session.vN.jsonl[.zstd]，多代并存取最高代；上游 SESSION_FORMAT_VERSION 现行 4，曾以 v3 硬编码漏检） */
function bestSessionLog(sessionDir: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined
  const files = readdirSync(sessionDir).filter((f) => /^session(?:\.v[1-9]\d*)?\.jsonl(?:\.zstd)?$/.test(f))
  if (files.length === 0) return undefined
  const versionOf = (f: string): number => Number(/^session(?:\.v([1-9]\d*))?\.jsonl/.exec(f)?.[1] ?? 0)
  return join(sessionDir, files.sort((a, b) => versionOf(b) - versionOf(a))[0] as string)
}

/** 按 sessionId 定位会话文件（隔离 DSH_HOME 内唯一；cwd 派生目录名免猜） */
function findSessionFile(dshHome: string, sessionId: string): string | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  const target = sessionId.startsWith('session-') ? sessionId : `session-${sessionId}`
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory()) continue
    const candidate = bestSessionLog(join(sessionsDir, wsDir.name, target))
    if (candidate !== undefined) return candidate
  }
  return undefined
}

/**
 * 定位夹具工作区名下会话（目录名 session-<uuid> 即账本 id；文件可滞后于目录——目录级即认）。
 * 工作区目录名 = 会话 cwd 的扁平化（夹具路径含 demo-proj 段）；boot 期默认工作区会话
 * （--D-…-default-workspace--）非本链对象，按段过滤排除。
 */
function findFixtureSession(dshHome: string, fixtureSegment: string): { readonly sessionId: string; readonly file: string } | undefined {
  const sessionsDir = join(dshHome, 'sessions')
  if (!existsSync(sessionsDir)) return undefined
  let newest: { sessionId: string; file: string; mtime: number } | undefined
  for (const wsDir of readdirSync(sessionsDir, { withFileTypes: true })) {
    if (!wsDir.isDirectory() || !wsDir.name.includes(fixtureSegment)) continue
    for (const sDir of readdirSync(join(sessionsDir, wsDir.name), { withFileTypes: true })) {
      if (!sDir.isDirectory()) continue
      const dir = join(sessionsDir, wsDir.name, sDir.name)
      const log = bestSessionLog(dir)
      const mtime = log !== undefined ? statSync(log).mtimeMs : 0
      if (newest === undefined || mtime >= newest.mtime) newest = { sessionId: sDir.name, file: log ?? join(dir, ''), mtime }
    }
  }
  return newest
}

/** 轮询等待会话文件出现并含至少 minEvents 个事件（agent 往返落盘时序） */
async function waitForSessionEvents(
  dshHome: string,
  sessionId: string,
  predicate: (events: readonly SessionEvent[]) => boolean,
  timeoutMs: number,
): Promise<readonly SessionEvent[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const file = findSessionFile(dshHome, sessionId)
    if (file !== undefined) {
      const events = decodeSessionFile(file)
      if (predicate(events)) return events
    }
    if (Date.now() > deadline) {
      throw new Error(`等待会话事件超时（${timeoutMs}ms）：session=${sessionId} file=${file ?? '未落盘'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}


/** 轮询等待夹具工作区会话目录出现（发送后会话落盘开户）——返回账本会话 id */
async function waitForFixtureSession(dshHome: string, fixtureSegment: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = findFixtureSession(dshHome, fixtureSegment)
    if (found !== undefined) return found.sessionId
    if (Date.now() > deadline) throw new Error(`等待夹具会话目录超时（${timeoutMs}ms）：${join(dshHome, 'sessions')}`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 召回数据面（contracts DTO 窄面——forge:knowledge/sessionRecall / heat）
// ─────────────────────────────────────────────────────────────────────────────

interface RecallGroupHit {
  readonly entryId: number | null
  readonly title: string | null
  readonly heat: number
}
interface RecallGroup {
  readonly callId: string
  readonly verb: 'search' | 'read-abstract'
  readonly hitCount: number
  readonly createdAt: string
  readonly hits: readonly RecallGroupHit[]
}
interface ProjectSummary {
  readonly id: string
  readonly wsPath: string
}

/** 轮询直至召回分组满足条件（agent 多步链完成时序——真实模型往返非瞬时） */
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
    if (Date.now() > deadline) {
      throw new Error(`等待召回事件超时（${timeoutMs}ms）：groups=${JSON.stringify(last)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
}

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

  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fly-ud-'))
  const dshHome = join(userData, 'dsh-home')
  seedDshHome(dshHome, credentials as string)
  const dogfoodOverlay = writeDogfoodOverlay()
  const fixture = makeKnowledgeFixture()
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_PATCH_FILES: dogfoodOverlay,
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19710 + (process.pid % 200)),
  })
  const pageErrors: string[] = []
  try {
    const page: Page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await waitShellReady(page)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    await dismissOnboardingModals(page)
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'hero', { timeout: 60_000 })

    // ── 步 1/6 注册（两段式：文件浏览器 → 注册表单默认值 → 确认——AC「注册（两段式）」 ──
    await page.locator('[data-dswf-nav="add-project"]').first().click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixture.split('\\').at(-1) as string)
    await dirRow(page, 'demo-proj').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
    expect(projects, '注册落库：projects 行在场（含 workspace 外键链）').toHaveLength(1)
    const projectId = projects[0]!.id

    // ── 步 2/6 发起会话（官方工作区菜单选夹具工作区——会话 cwd = 工作区根，绑定解析锚） ──
    // 官方 composer 工作区芯片（「默认工作区」/「选择工作区」两态文案）→ role=menu 列既有
    // workspace（含注册链 registry.create 的夹具工作区——dsh 幂等口径同实体）→ 选 demo-proj
    const composer = page
      .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
      .last()
    await expect(composer, '官方会话面 composer 在场（官方 hero 相位承载空会话引导）').toBeVisible({ timeout: 60_000 })
    const workspaceChip = page
      .locator('button', { hasText: /^默认工作区$|^选择工作区$/ })
      .first()
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
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()

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
    console.log('[flywheel] 发送后转录面：', await page.locator('[data-dswf-pane="chat"]').first().textContent({ timeout: 10_000 }))
    // 会话 id：隔离 DSH_HOME 内唯一会话文件（目录名 = 账本 id）——持久化为追加式落盘、
    // 首次落盘随回合推进（agent 工具链期间等待；左栏会话行 blank 期不显示、完成后入列，
    // 行断言移步召回完成后）
    const sessionId = await waitForFixtureSession(dshHome, 'demo-proj', 120_000)

    // ── 步 4/6 事件落库 + SC10 多步链（search → read-abstract，真实模型轨迹可查） ──
    const groups = await pollSessionRecall(
      page,
      { projectId, sessionId },
      (gs) =>
        gs.some((g) => g.verb === 'search' && g.hitCount > 0) &&
        gs.some((g) => g.verb === 'read-abstract'),
      300_000,
    )
    const searchGroups = groups.filter((g) => g.verb === 'search' && g.hitCount > 0)
    const readGroups = groups.filter((g) => g.verb === 'read-abstract')
    expect(searchGroups.length, 'search 事件组在场（agent 自主发起检索）').toBeGreaterThan(0)
    expect(readGroups.length, 'read-abstract 事件组在场（摘要先行多步链第二跳）').toBeGreaterThan(0)
    // 多步链次序：read-abstract 不早于首个 search（agentic search 流程指引可循）
    const firstSearchAt = Math.min(...searchGroups.map((g) => Date.parse(g.createdAt)))
    const readAt = Math.min(...readGroups.map((g) => Date.parse(g.createdAt)))
    expect(readAt, 'read-abstract 晚于 search（多步链次序）').toBeGreaterThanOrEqual(firstSearchAt)
    // 左栏会话行（官方口径：blank 期不显示，回合完成后入列——dsh 账本实时读）
    const sessionRow = page.locator(`[data-dswf-session="${sessionId}"]`).first()
    await expect(sessionRow, '会话行入列（非 blank——账本实时读）').toBeVisible({ timeout: 60_000 })

    // 真实轨迹可查（SC10 e2e 断言载体）：会话持久化文件的 tool/call 轨迹 + system/message 提示词
    const events = await waitForSessionEvents(
      dshHome,
      sessionId,
      (evs) =>
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge.search') &&
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge.read-abstract'),
      60_000,
    )
    const toolCalls = events.filter((e) => e.type === 'tool/call').map((e) => ({ name: e.data?.name ?? '', seq: e.seq ?? 0 }))
    const searchSeq = toolCalls.filter((c) => c.name === 'knowledge.search').map((c) => c.seq)
    const readSeq = toolCalls.filter((c) => c.name === 'knowledge.read-abstract').map((c) => c.seq)
    expect(searchSeq.length, '轨迹可查：knowledge.search tool 调用在场').toBeGreaterThan(0)
    expect(readSeq.length, '轨迹可查：knowledge.read-abstract tool 调用在场').toBeGreaterThan(0)
    expect(Math.min(...readSeq), '轨迹次序：read-abstract 在 search 之后（seq 升序）').toBeGreaterThan(Math.min(...searchSeq))

    // AC1 内容断言：模型实收系统提示词含 forge:knowledge 段（知识库存在声明 + 流程指引 + 工具说明）
    const promptText = (events.find((e) => e.type === 'system/message')?.data?.message?.content ?? [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n')
    expect(promptText, '系统提示词在场（system/message 事件）').not.toBe('')
    expect(promptText).toContain('## Project knowledge base')
    expect(promptText, '知识段：agentic search 流程指引在场').toContain('Retrieval flow (agentic search)')
    expect(promptText, '知识段：工具说明在场（search）').toContain('knowledge.search')
    expect(promptText, '知识段：工具说明在场（read-abstract）').toContain('knowledge.read-abstract')

    // ── 步 5/6 召回 tab 条目（即时累积：tab 激活重拉——AC3 tab 面） ──
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
    const recallTab = page.locator('[data-dswf-pane="recall"] [data-dswf-recall-tab]')
    await expect(recallTab.first()).toBeVisible({ timeout: 30_000 })
    const statsCalls = Number(await page.locator('[data-dswf-recall-stats]').getAttribute('data-calls'))
    expect(statsCalls, '统计头召回次数 = 事件组数（tab ↔ 事件表一致）').toBe(groups.length)
    const recallRow = page.locator('[data-dswf-recall-row]', { hasText: '部署规范' }).first()
    await expect(recallRow, '分组行：被召回知识条目在场（title 快照）').toBeVisible()
    const rowVerbs = await recallRow.locator('[data-dswf-recall-verb]').allTextContents()
    expect(rowVerbs.join(' '), '分组行动词明细含 search（verb 投影）').toContain('search')

    // ── 步 6/6 卡片热度 +1（浏览面 HeatBadge ↔ heatByEntry ↔ 事件计数三方一致） ──
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first()).toBeVisible({ timeout: 30_000 })
    const cardHeatText = await page
      .locator('[data-dswf-entry]', { hasText: '部署规范' })
      .first()
      .locator('.dswf-heat-badge')
      .textContent()

    // 三方一致断言（场景⑥端到端）：事件表（sessionRecall 行）↔ 热度（heatByEntry）↔ UI（tab 徽章 + 卡片徽章）
    const heatAfter = await invokeHeat(page, projectId)
    const deployEntryId = groups
      .flatMap((g) => g.hits)
      .find((h) => h.title === '部署规范')?.entryId ?? null
    expect(deployEntryId, '部署规范条目 id 在场（事件快照）').not.toBeNull()
    const expectedHeat = groups.reduce(
      (sum, g) => sum + g.hits.filter((h) => h.entryId === deployEntryId).length,
      0,
    )
    // 事件表行计数（search 命中 + read-abstract 各计一次；哨兵行不计）
    expect(heatAfter.get(deployEntryId as number), '热度 = 事件表按条目行计数（heat ↔ 事件一致）').toBe(expectedHeat)
    expect(expectedHeat, '热度增量 ≥ 1（基线 0 → 召回后正计）').toBeGreaterThanOrEqual(1)
    expect(cardHeatText, '卡片徽章 = 热度计数（UI ↔ heat 一致）').toContain(`${expectedHeat}`)
    // 召回 tab 分组行徽章同源（同一次激活拉取的分组行 heat 快照）
    const rowHeat = groups.flatMap((g) => g.hits).find((h) => h.title === '部署规范')?.heat
    expect(rowHeat, 'tab 行热度徽章 = 同源计数（tab ↔ heat 一致）').toBe(expectedHeat)

    expect(pageErrors, '无页面 JS 错误（pageerror 面——L824 元断言）').toEqual([])
  } finally {
    await app.close()
    rmSync(dogfoodOverlay, { force: true })
    rmSync(userData, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
})
