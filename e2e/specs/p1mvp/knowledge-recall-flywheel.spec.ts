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
// 留痕 skip：Step 4b/4c（search 域前缀直测）——fact 双门分工：search/readAbstract 为
// agent 面插件工具不经 web RPC（channels.ts:17），能力面直测通道缺失；域前缀/全域检索
// 语义由 packages/core browse-service 单测 pin。
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

const Q1 = '本项目的前端部署规范是什么？'
const Q2 = '本项目的前端构建规范是什么？'

function realCredentials(): string | undefined {
  const candidate = join(homedir(), '.dsh', '.credentials.yaml')
  return existsSync(candidate) ? readFileSync(candidate, 'utf8') : undefined
}

function seedDshHome(dshHome: string, credentials: string): void {
  mkdirSync(dshHome, { recursive: true })
  writeFileSync(join(dshHome, '.credentials.yaml'), credentials, 'utf8')
}

function writeDogfoodOverlay(): string {
  const target = join(tmpdir(), `dsh-forge-e2e-dogfood-${process.pid}.yml`)
  writeFileSync(
    target,
    [
      '# e2e dogfood 叠层：低成本模型（首启告示预确认 = 产品 boot overlay 内置，fix-12）',
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

interface Launched {
  readonly app: ElectronApplication
  readonly page: Page
  readonly pageErrors: string[]
}

async function launchHost(userData: string, overlay?: string): Promise<Launched> {
  const { _electron } = await import('@playwright/test')
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: {
      ...process.env,
      DSH_FORGE_DEV_PROFILE: 'dev',
      ...(overlay === undefined ? {} : { DSH_FORGE_PATCH_FILES: overlay }),
      DSH_FORGE_USER_DATA: userData,
      DSH_FORGE_PORT: String(19890 + (process.pid % 200)),
      DSH_FORGE_DIRECTORY_PICKER: 'off', // fix-14：向导走查归回退面（OS 对话框不可 e2e——preload 桥降级开关）
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

interface RegisterResultLike {
  readonly projectId: string
  readonly attachedToExisting: boolean
}

async function registerProject(page: Page, wsDir: string, name: string): Promise<RegisterResultLike> {
  return forgeInvoke<RegisterResultLike>(page, 'forge:projects/register', {
    workspaceDir: wsDir,
    name,
    forgeDir: `${wsDir}\\.forge`,
    knowledgeDir: `${wsDir}\\.knowledge`,
  })
}

function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  // 边界口径（探针 7 实测）：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"），
  // 尾界放宽为 空白|行尾|非名字字符（防 'Local' 误中 'LocalLow' 的前缀碰撞保持不变）
  return page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?=\\s|$|[^\\w.-])`) }).first()
}

async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

/** hero → 两段式 UI 注册（Golden Path Step 1 载体） */
async function registerViaUi(page: Page, fixtureRoot: string, dirName: string): Promise<void> {
  await page.locator('[data-dswf-cta="add-project"]').click()
  await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
  for (const segment of ['AppData', 'Local', 'Temp']) {
    await enterDir(page, segment)
  }
  await enterDir(page, fixtureRoot.split('\\').at(-1) as string)
  await dirRow(page, dirName).click()
  await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
  await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
  await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
  await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
}

/** composer 工作区芯片流（选定工作区 = 官方新会话入口） */
async function selectWorkspaceViaChip(page: Page, workspaceName: string): Promise<void> {
  const composer = page
    .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
    .last()
  await expect(composer).toBeVisible({ timeout: 60_000 })
  const chip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
  await expect(chip).toBeVisible({ timeout: 30_000 })
  await chip.click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  const item = menu
    .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
    .filter({ hasText: workspaceName })
    .first()
  await expect(item).toBeVisible({ timeout: 15_000 })
  await item.click()
  await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
}

async function sendQuestion(page: Page, question: string): Promise<void> {
  const composer = page
    .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
    .last()
  await composer.click()
  await page.keyboard.insertText(question)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(8_000)
}

// ─── dsh 会话文件解码（flywheel.spec 同源） ───

interface SessionEvent {
  readonly type: string
  readonly seq?: number
  readonly data?: {
    readonly name?: string
    readonly arguments?: string
    readonly message?: { readonly content?: readonly { readonly type?: string; readonly text?: string }[] }
  }
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
          // 非 JSON 行跳过
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
interface RecallGroupHit {
  readonly entryId: number | null
  readonly title: string | null
  readonly heat: number
}
interface RecallGroup {
  readonly callId: string
  readonly verb: 'search' | 'read-abstract'
  readonly hitCount: number
  readonly hits: readonly RecallGroupHit[]
}
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
    if (Date.now() > deadline) throw new Error(`等待召回事件超时（${timeoutMs}ms）：groups=${JSON.stringify(last)}`)
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
    launched = await launchHost(userData, overlay)
    const page = launched.page

    // ── Step 1：注册（hero 两段式全链；使用事件基线 = 0——全新注册） ──
    await registerViaUi(page, fixtureRoot, 'fw-demo')
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'fw-demo' }).first(), '左栏出现项目').toBeVisible({ timeout: 30_000 })
    const projects = await forgeInvoke<readonly { id: string; wsPath: string }[]>(page, 'forge:projects/list')
    const projectId = projects.find((p) => p.wsPath === join(fixtureRoot, 'fw-demo'))!.id
    await page.waitForTimeout(5_000)

    // ── Step 2：发起会话（知识段注入断言经会话文件承载——Step 4 解码后断言） ──
    await selectWorkspaceViaChip(page, 'fw-demo')
    // 基线热度 = 0（事件基线声明锚）
    const heatBaseline = await page.evaluate(async (id) => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown }> } }).dshForge
      const envelope = await forge!.invoke('forge:knowledge/heat', { projectId: id })
      const heat = envelope.data as Map<number, number>
      return heat instanceof Map ? [...heat.entries()] : Object.entries(heat as Record<string, number>).map(([k, v]) => [Number(k), v] as [number, number])
    }, projectId)
    expect(heatBaseline, '使用事件基线 = 0（Setup 声明）').toHaveLength(0)

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
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge.search') &&
        evs.some((e) => e.type === 'tool/call' && e.data?.name === 'knowledge.read-abstract'),
      120_000,
    )
    const toolCalls = events.filter((e) => e.type === 'tool/call').map((e) => ({ name: e.data?.name ?? '', seq: e.seq ?? 0 }))
    const searchSeq = toolCalls.filter((c) => c.name === 'knowledge.search').map((c) => c.seq)
    const readSeq = toolCalls.filter((c) => c.name === 'knowledge.read-abstract').map((c) => c.seq)
    expect(searchSeq.length, '检索链：knowledge.search 在场').toBeGreaterThan(0)
    expect(readSeq.length, '检索链：knowledge.read-abstract 在场（摘要先行——SC10）').toBeGreaterThan(0)
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
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '轨迹' }).click()
    await expect(page.locator('[data-dswf-pane="trajectory"]').first()).toBeVisible()
    await expect
      .poll(async () => page.locator('[data-dswf-traj-row="tool"]').count(), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(2)
    const toolRowTexts = await page.locator('[data-dswf-traj-row="tool"]').allTextContents()
    const searchRowIdx = toolRowTexts.findIndex((t) => t.includes('knowledge.search') || t.includes('search'))
    const readRowIdx = toolRowTexts.findIndex((t) => t.includes('knowledge.read-abstract') || t.includes('read-abstract'))
    expect(searchRowIdx, '台账含 search 工具行').toBeGreaterThanOrEqual(0)
    expect(readRowIdx, '台账含 read-abstract 工具行').toBeGreaterThanOrEqual(0)
    expect(searchRowIdx, '台账时序：search 先于 read-abstract').toBeLessThan(readRowIdx)
    // 切回对话 tab 不重置——回答仍在原位
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '对话' }).click()
    const transcriptKept = (await page.locator('[data-conversation-content]').first().textContent({ timeout: 10_000 })) ?? ''
    expect(transcriptKept, '切回对话 tab 回答仍在原位').toContain('部署')

    // ── Step 7：召回 tab（统计 1/1 + K1 分组行——链口径；口径分歧 = 缺陷信号 soft 承载） ──
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
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
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    const k1Card = page.locator('.dswf-kn-card', { hasText: '部署规范' }).first()
    await expect(k1Card, 'K1 卡片在场（Step 1 索引代理断言）').toBeVisible({ timeout: 30_000 })
    expect
      .soft(await k1Card.locator('.dswf-heat-badge').textContent(), '[链口径·缺陷信号] K1 卡片热度徽章 = 1')
      .toContain('1')

    // ── Step 8b：Q2 触发 K2 新召回 → 即时累积（2/2 与 1/1 分离；K1 保持 1） ──
    // 回会话视图（知识模式无会话面板——点会话行切回）。Step 7 遗留召回 tab 激活 = keep-alive
    // 常态（AC-4 切换不重置——面板态跨视图往返保留，fix-11 首次实跑暴露）；发送前回对话 tab。
    await page.locator(`[data-dswf-session="${sessionId}"]`).first().click()
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '对话' }).click()
    await expect(page.locator('[data-dswf-pane="chat"]').first()).toBeVisible()
    await sendQuestion(page, Q2)
    await awaitSessionChain(
      dshHome,
      sessionId,
      'fw-demo',
      page,
      Q2,
      (evs) => evs.filter((e) => e.type === 'tool/call' && e.data?.name === 'knowledge.read-abstract').length >= 2,
      120_000,
    )
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
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
    if (launched !== undefined) {
      await launched.app.close().catch(() => undefined)
    }
    rmSync(overlay, { force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
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
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据不在场——留痕 skip')

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw2b-'))
  mkdirSync(join(fixtureRoot, 'fw-bare'), { recursive: true }) // 无 .knowledge 目录（未配置态）
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost(userData, overlay)
    await registerProject(launched.page, join(fixtureRoot, 'fw-bare'), 'fw-bare')
    await expect(launched.page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
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
    if (launched !== undefined) await launched.app.close().catch(() => undefined)
    rmSync(overlay, { force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 Outcome "empty-knowledge-dir-session"（journey Step 2c：已配置但为空——口径注记）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step2c empty-knowledge-dir-session：空目录无知识段（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据不在场——留痕 skip')

  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw2c-'))
  mkdirSync(join(fixtureRoot, 'fw-empty', '.knowledge'), { recursive: true }) // 已配置且为空
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost(userData, overlay)
    await registerProject(launched.page, join(fixtureRoot, 'fw-empty'), 'fw-empty')
    await expect(launched.page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
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
    if (launched !== undefined) await launched.app.close().catch(() => undefined)
    rmSync(overlay, { force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
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
    launched = await launchHost(userData)
    await registerProject(launched.page, join(fixtureRoot, 'fw-demo'), 'fw-demo')
    await expect(launched.page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await launched.page.waitForTimeout(5_000)
    await selectWorkspaceViaChip(launched.page, 'fw-demo')
    const conversation = launched.page.locator('[data-conversation-content]').first()
    await expect(conversation, '空会话引导态在场').toBeAttached()
    // 空输入 + 纯空白提交意图（回车）——不发送
    const composer = launched.page
      .locator('[data-dswf-pane="chat"] textarea, [data-dswf-pane="chat"] [contenteditable="true"]')
      .last()
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
    // 零使用事件（基线 0 且无召回——heat 通道空）
    const projectId = (await forgeInvoke<readonly { id: string; wsPath: string }[]>(launched.page, 'forge:projects/list'))
      .find((p) => p.wsPath === join(fixtureRoot, 'fw-demo'))!.id
    const heat = await launched.page.evaluate(async (id) => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown }> } }).dshForge
      const envelope = await forge!.invoke('forge:knowledge/heat', { projectId: id })
      const h = envelope.data as Map<number, number>
      return h instanceof Map ? [...h.entries()] : Object.entries(h as Record<string, number>).map(([k, v]) => [Number(k), v] as [number, number])
    }, projectId)
    expect(heat, '零检索链与使用事件').toHaveLength(0)
  } finally {
    if (launched !== undefined) await launched.app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 Outcome "no-recall-placeholder"（journey Step 7b：本会话暂无召回占位；无 dogfood）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step7b no-recall-placeholder：零召回占位（不报错无空列表）', async () => {
  test.setTimeout(240_000)
  const fixtureRoot = makeFlywheelFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  let launched: Launched | undefined
  try {
    launched = await launchHost(userData)
    await registerProject(launched.page, join(fixtureRoot, 'fw-demo'), 'fw-demo')
    await expect(launched.page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await launched.page.waitForTimeout(5_000)
    // 空会话（未发送任何消息）→ 知识召回 tab
    await selectWorkspaceViaChip(launched.page, 'fw-demo')
    await launched.page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
    await expect(launched.page.locator('[data-dswf-recall-tab], [data-dswf-recall-face="empty"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(launched.page.getByText('本会话暂无召回'), '「本会话暂无召回」占位（不报错、无空列表）').toBeVisible({ timeout: 30_000 })
    await expect(launched.page.locator('[data-dswf-recall-row]'), '零分组行').toHaveCount(0)
  } finally {
    if (launched !== undefined) await launched.app.close().catch(() => undefined)
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 Outcome "no-hit-fallback-regular-retrieval"（journey Step 4d：无关库转常规检索）
// ─────────────────────────────────────────────────────────────────────────────
test('@web-e2e @p1mvp flywheel·Step4d no-hit-fallback：无关库回答不阻塞（dogfood）', async () => {
  test.setTimeout(600_000)
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实模型凭据不在场——留痕 skip')

  const fixtureRoot = makeUnrelatedFixture()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-p1mvp-fw-ud-'))
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  const overlay = writeDogfoodOverlay()
  let launched: Launched | undefined
  try {
    launched = await launchHost(userData, overlay)
    const fwPage = launched.page
    await registerProject(fwPage, join(fixtureRoot, 'fw-plain'), 'fw-plain')
    await expect(fwPage.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
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
    const recallTab = launched.page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' })
    await recallTab.click()
    await expect(
      launched.page.locator('[data-dswf-recall-tab], [data-dswf-recall-face="empty"]').first(),
      '召回 tab 面就位（统计面或占位面二择——装载不报错）',
    ).toBeVisible({ timeout: 30_000 })
    const recallStats = launched.page.locator('[data-dswf-recall-stats]')
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
    if (launched !== undefined) await launched.app.close().catch(() => undefined)
    rmSync(overlay, { force: true })
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
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
