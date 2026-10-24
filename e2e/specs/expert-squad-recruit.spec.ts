// expert-squad 1.31 旅程 e2e：对话式招募建档的建档↔面板↔取用原子面（expert-recruitment journey
// step-2/3/4 可机检半）真机取证。
// journey = .forge/docs/features/expert-squad/testing/expert-recruitment/journey.md
// contracts = 同目录 contracts/step-1..5。
// 建档通道：recruit_expert 为模型驱动 tool 面（e2e 载体无模型通道）——建档动作走其同一
// 写路径缝 POST /api/expert-squad/update（serializeExpertMd → parseExpertFile 全量门 →
// 落盘 <workspace>/.dsh/experts/<key>.md → refresh 换新——src/index.ts update 装配，
// 契约 anchor 即「[召唤] 对话建档同一 update 通道」）。观测面：面板卡片 + 取用 API。
// 不落脚本 Outcome（契约层保留，run-tests 台账注记）：step-1 指令转译与参数门（模型
// 驱动 tool 面——tools.test.ts 单测承载）、step-2 already-exists / same-layer-duplicate
// （recruit_expert 工具语义与扫描 warnings 面）、step-5 HR 代招双 Outcome（HR 预设会话
// 需模型通道）、step-4 recruit-over-disabled（工具面 recruit 语义）。
// 拦截纪律（fix-3 判例）：页面上下文 fetch，禁 page.route。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp。
// @feature expert-squad @web-e2e
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`
const FOOTER = '.dswf-panel-footer'

const EXISTING_KEY = 'test-reviewer'
const RECRUIT_KEY = 'recruit-fixture'

/** project 层夹具既有档案 */
function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for recruit e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '既有专家人设正文。',
    '',
  ].join('\n')
}

/** 招募载荷（update 通道 = 建档通道；契约 §8 字段） */
const recruitPayload = {
  name: RECRUIT_KEY,
  title: '招募夹具·代码评审',
  description: '招募建档夹具：何时委派我——评审变更与测试。',
  tools: ['read', 'grep'],
  skills: ['tsc'],
  personaMd: '## 职责\n\n招募建档人设正文：严格评审每一处变更。\n',
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-recruit-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${EXISTING_KEY}.md`), expertMd(EXISTING_KEY, '夹具评审'))
  return dir
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly pageErrors: string[]
  readonly wsDir: string
  readonly userData: string
}

async function installListCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as typeof window & { __xsqListUrls?: string[]; __xsqCaptureInstalled?: boolean }
    if (w.__xsqCaptureInstalled) return
    w.__xsqCaptureInstalled = true
    w.__xsqListUrls = []
    const original = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/expert-squad/list')) w.__xsqListUrls?.push(url)
      return original(input as RequestInfo, init)
    }
  })
}

async function captureWorkspaceParam(page: Page): Promise<string> {
  let hit: string | null = null
  await expect
    .poll(
      async () => {
        const urls = await page.evaluate(() => {
          const w = window as typeof window & { __xsqListUrls?: string[] }
          return w.__xsqListUrls ?? []
        })
        hit = urls.reverse().find((url) => url.includes('workspace=')) ?? null
        return hit
      },
      { timeout: 30_000, message: 'list 请求捕获缓冲出现 workspace 参数' },
    )
    .toBeTruthy()
  const match = /workspace=([^&]+)/.exec(hit ?? '')
  if (match === null) throw new Error(`list 请求缺 workspace 参数：${String(hit)}`)
  return decodeURIComponent(match[1])
}

/** 建档通道（POST /api/expert-squad/update——recruit 同一写路径缝）。 */
async function postUpdate(page: Page, workspace: string, payload: object): Promise<{ ok: boolean; status: number; text: string }> {
  return page.evaluate(async ({ ep, body }) => {
    const response = await fetch(ep, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: response.ok, status: response.status, text: await response.text() }
  }, { ep: '/api/expert-squad/update', body: { workspace, ...payload } })
}

/** 取用 API（GET /api/expert-squad/get）。 */
async function fetchExpert(page: Page, workspace: string, key: string): Promise<{ ok: boolean; body: unknown; text: string }> {
  return page.evaluate(async ({ ep, payload }) => {
    const response = await fetch(`${ep}?key=${encodeURIComponent(payload.key)}&workspace=${encodeURIComponent(payload.workspace)}`)
    const text = await response.text()
    let body: unknown = null
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
    return { ok: response.ok, body, text }
  }, { ep: '/api/expert-squad/get', payload: { workspace, key } })
}

async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-recruit-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-recruit-fixture')
  await dismissOnboardingModals(page)
  await installListCapture(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(cardOf(EXISTING_KEY)), '既有专家卡数据态').toBeVisible({ timeout: 30_000 })
  return { page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
}

async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeApp(session.app)
  } catch {
    /* closeApp 尽力而为 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

// ── step-3 success：建档 → 面板即时可见，字段与指令一致 ──

test('@feature expert-squad recruit step-3：建档通道落盘 → 面板卡片即时呈现，字段与载荷一致', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    const wrote = await postUpdate(page, wsParam, recruitPayload)
    expect(wrote.ok, `建档通道成功（HTTP ${wrote.status} ${wrote.text}）`).toBe(true)
    // 面板联动刷新（即时拉 + 5s 轮询）→ 新卡呈现，字段与载荷一致
    const card = page.locator(cardOf(RECRUIT_KEY))
    await expect(card, '新专家卡呈现').toBeVisible({ timeout: 30_000 })
    await expect(card.locator('.xc-name'), '名称 ← name').toHaveText(RECRUIT_KEY)
    await expect(card.locator('.xc-title'), '岗位 ← title').toHaveText('招募夹具·代码评审')
    await expect(card.locator('.xc-creed'), '人设摘要 ← personaMd').toContainText('招募建档人设正文')
    await expect(card.locator('.xc-tags .chip', { hasText: 'tsc' }).first(), '技能 chip ← skills').toBeVisible()
    await expect(card.locator('.xc-tags .chip.tool', { hasText: 'grep' }).first(), '白名单 chip ← tools').toBeVisible()
    expect(await page.locator(cardOf(RECRUIT_KEY)).count(), '零重复卡').toBe(1)
    // 落盘正本存在（档案正本是唯一事实源）
    expect(existsSync(join(wsDir, '.dsh', 'experts', `${RECRUIT_KEY}.md`)), '档案正本落盘').toBe(true)
  } finally {
    await closeSession(session)
  }
})

// ── step-3 panel-closed-no-loss-window：建档时面板未开——打开即见，无丢失窗口 ──

test('@feature expert-squad recruit step-3 closed-panel：建档在面板打开前 → 打开即见（无丢失窗口）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-recruit-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const session: PanelSession = { page: launched.page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
  try {
    const { page } = session
    await registerProject(page, wsDir, 'xsq-recruit-fixture')
    await dismissOnboardingModals(page)
    await installListCapture(page)
    // 面板未开时建档（页面级 /api 桥在位即可走建档通道）
    const wsParam = await captureWorkspaceParam(page)
    const wrote = await postUpdate(page, wsParam, recruitPayload)
    expect(wrote.ok, `建档通道成功（HTTP ${wrote.status}）`).toBe(true)
    // 随后打开面板 → 列表即时含新专家（数据来自即时全量拉取）
    await page.locator(PANEL_ROW).click()
    await expect(page.locator(PANEL_ROOT), '面板挂载').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(cardOf(RECRUIT_KEY)), '打开即见新专家（无丢失窗口）').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(FOOTER), '页脚计数含新专家').toContainText('位专家 · 显示')
  } finally {
    await closeSession(session)
  }
})

// ── step-2 invalid-archive-rejected / invalid-key-format：坏载荷零落盘（fail-loud） ──

test('@feature expert-squad recruit step-2 invalid：裸 {{ 与非法键形状 → 通道拒绝零落盘，其余专家不受影响', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    const expertsDir = join(wsDir, '.dsh', 'experts')
    // 裸 {{ 拒绝（写路径 parseExpertFile 全量门）
    const mustache = await postUpdate(page, wsParam, { ...recruitPayload, name: 'bad-mustache', personaMd: '正文含裸 {{ 拒绝\n' })
    expect(mustache.ok, `裸 {{ 建档被拒（HTTP ${mustache.status}）`).toBe(false)
    expect(mustache.text, '报因可归因（裸 {{）').toContain('{{')
    // 非法键形状拒绝（zod 参数门）
    const badKey = await postUpdate(page, wsParam, { ...recruitPayload, name: 'Bad_Key' })
    expect(badKey.ok, `非法键被拒（HTTP ${badKey.status}）`).toBe(false)
    // 零半成品残留 + 其余专家不受影响
    expect(existsSync(join(expertsDir, 'bad-mustache.md')), '裸 {{ 零落盘').toBe(false)
    expect(existsSync(join(expertsDir, 'Bad_Key.md')), '非法键零落盘').toBe(false)
    await expect(page.locator(cardOf(EXISTING_KEY)), '既有专家照常').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

// ── step-4 success（可机检半）：建档 ⇔ 立即可取用（原子成立） ──

test('@feature expert-squad recruit step-4：建档完成立即可取用——get 返回完整档案（origin=project）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    const wrote = await postUpdate(page, wsParam, recruitPayload)
    expect(wrote.ok, `建档通道成功（HTTP ${wrote.status}）`).toBe(true)
    // 立即（同请求序后）取用：无「已招募但不可用」中间窗口
    const got = await fetchExpert(page, wsParam, RECRUIT_KEY)
    expect(got.ok, `立即可取用（${got.text}）`).toBe(true)
    const entry = got.body as {
      name?: string; title?: string; description?: string; personaMd?: string
      tools?: string[]; skills?: string[]; origin?: string; enabled?: boolean
    }
    expect(entry.name, 'name 字段').toBe(RECRUIT_KEY)
    expect(entry.title, 'title 字段').toBe('招募夹具·代码评审')
    expect(entry.description, 'description 字段').toContain('何时委派我')
    expect(entry.personaMd, 'personaMd 字段（人设原文）').toContain('招募建档人设正文')
    expect(entry.tools, 'tools 字段').toEqual(['read', 'grep'])
    expect(entry.skills, 'skills 字段').toEqual(['tsc'])
    expect(entry.origin, 'origin=project（建档层）').toBe('project')
    expect(entry.enabled, 'enabled 启用态').toBe(true)
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——建档 → 面板可见 → 立即可取用全依序） ──

test('@feature expert-squad recruit 冒烟：建档 → 面板卡呈现 → 立即取用 → 零异常', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    // 建档
    const wrote = await postUpdate(page, wsParam, recruitPayload)
    expect(wrote.ok, `建档成功（HTTP ${wrote.status}）`).toBe(true)
    // 面板可见
    await expect(page.locator(cardOf(RECRUIT_KEY)), '面板卡呈现').toBeVisible({ timeout: 30_000 })
    expect(await page.locator(CARD_ANY).count(), '网格含既有 + 新招（≥2）').toBeGreaterThanOrEqual(2)
    // 立即取用
    const got = await fetchExpert(page, wsParam, RECRUIT_KEY)
    expect(got.ok, '立即取用成功').toBe(true)
    // 不变量：renderer 零未捕获异常
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
