// expert-squad 1.31 旅程 e2e：文件直编热刷新（profile-hot-reload journey）真机取证——
// journey = .forge/docs/features/expert-squad/testing/profile-hot-reload/journey.md
// contracts = 同目录 contracts/step-1..5（每 Outcome 一测试 + 一条 happy-path 冒烟）。
// 打开动线：launchHost 隔离 profile → 夹具工作区（.dsh/experts/ 两份合法档案）RPC 注册
// → 左栏 panellist 行「专家团」→ main keyed 'expert-squad' 面板。档案直编 = Node 测试
// 进程直写夹具 .md（外部编辑器同语义——chokidar 深度 1 watch 通路，tech-design §5）。
// 生效观测点：面板 5s 轻轮询 + 取用 API GET /api/expert-squad/get（watch 失效 ≤5s 预算
// + 轮询周期 → 断言窗口放宽至 30s expect.poll，预算本身由 watch.test 单测承载）。
// 拦截纪律（fix-3 判例）：取用 API 读取经页面上下文 fetch（dsh-forge:// scheme 页内桥），
// 不用 page.route；本 spec 零故障注入需求（直编即真通路）。
// 不落脚本 Outcome（契约层保留，run-tests 台账注记）：model-edit-channel-equivalent /
// rapid-saves-coalesced / dispatch-within-window-consistent（fs/observed 通道与竞速合并
// 为 host 半单测面——watch.test.ts / registry 既有覆盖，浏览器无观测缝）。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`

const KEY = 'test-reviewer'
const OTHER_KEY = 'data-miner'

/** project 层夹具专家档案 */
function expertMd(name: string, title: string, persona: string, tools: string[]): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for hot-reload e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    `tools: [${tools.join(', ')}]`,
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    persona,
    '',
  ].join('\n')
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-reload-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, '夹具评审', '旧人设基线：严格评审变更。', ['read', 'grep']))
  writeFileSync(join(expertsDir, `${OTHER_KEY}.md`), expertMd(OTHER_KEY, '夹具挖掘', '挖掘数据洞察。', ['read']))
  return dir
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly pageErrors: string[]
  readonly wsDir: string
  readonly userData: string
}

/** 面板 list 请求捕获（页面上下文包装 window.fetch——scheme 无关，激活前安装）。 */
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

/** 面板真实 list 请求的 workspace 参数（取用 API 同参——D4 一致性）。 */
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

/** 页面上下文取用 API（GET /api/expert-squad/get——通道二同缝；非 2xx → {error}）。 */
async function fetchExpert(page: Page, workspace: string, key: string): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  return page.evaluate(async ({ ep, payload }) => {
    const response = await fetch(`${ep}?key=${encodeURIComponent(payload.key)}&workspace=${encodeURIComponent(payload.workspace)}`)
    const text = await response.text()
    let body: unknown = null
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
    return { ok: response.ok, status: response.status, body, text }
  }, { ep: '/api/expert-squad/get', payload: { workspace, key } })
}

async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-reload-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-reload-fixture')
  await dismissOnboardingModals(page)
  await installListCapture(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(cardOf(KEY)), '夹具卡数据态').toBeVisible({ timeout: 30_000 })
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

// ── step-1/2/3 success：直编保存 → 热刷新生效 → 取用读回新内容 ──

test('@feature expert-squad reload step-1..3：直改人设保存 → 面板与取用读回新内容（≤5s 预算+轮询窗口）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    expect(await page.locator(cardOf(KEY)).locator('.xc-creed').innerText(), '旧人设基线在场').toContain('旧人设基线')
    // 直编保存（外部编辑器同语义：整文件重写）
    writeFileSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`), expertMd(KEY, '夹具评审', '新热刷人设：深度回归优先。', ['read', 'grep']))
    // 生效观测：面板卡片人设摘要换代（watch ≤5s + list 轮询 → 30s 轮询窗口）
    await expect(page.locator(cardOf(KEY)).locator('.xc-creed'), '面板卡片读回新人设').toContainText('新热刷人设', {
      timeout: 30_000,
    })
    // 取用 API 读回新内容（刷新后 get 逐字新版）
    await expect
      .poll(async () => {
        const got = await fetchExpert(page, wsParam, KEY)
        return got.ok ? JSON.stringify(got.body) : ''
      }, { timeout: 30_000, message: '取用 API 读回新人设' })
      .toContain('新热刷人设')
  } finally {
    await closeSession(session)
  }
})

// ── step-1 bad-archive-fail-loud：保存进坏档案 → 该键退场，其余照常 ──

test('@feature expert-squad reload step-1 bad-archive：裸 {{ 坏档 → 该键 fail-loud 退场，其余专家照常', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    writeFileSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`), '---\nname: test-reviewer\ntitle: 坏档\n---\n\n正文含裸 {{ 非法占位\n')
    await expect(page.locator(cardOf(KEY)), '坏档键 fail-loud 退场（不静默回落旧内容）').toHaveCount(0, { timeout: 30_000 })
    await expect(page.locator(cardOf(OTHER_KEY)), '其余专家照常（单点故障隔离）').toBeVisible()
    // 修正保存 → 恢复可用（同一通路收编）
    writeFileSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`), expertMd(KEY, '夹具评审', '修正后恢复人设。', ['read', 'grep']))
    await expect(page.locator(cardOf(KEY)), '修正后热刷新收编恢复').toBeVisible({ timeout: 30_000 })
  } finally {
    await closeSession(session)
  }
})

// ── step-1 new-file-collected-symmetric：新增对称收编 / 删除对称移除 ──

test('@feature expert-squad reload step-1 add-remove：新增 .md 收编为新卡；删除对称移除', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    writeFileSync(join(wsDir, '.dsh', 'experts', 'fresh-agent.md'), expertMd('fresh-agent', '新增夹具', '新增档案人设。', ['read']))
    await expect(page.locator(cardOf('fresh-agent')), '新增经热刷新通路收编').toBeVisible({ timeout: 30_000 })
    rmSync(join(wsDir, '.dsh', 'experts', 'fresh-agent.md'))
    await expect(page.locator(cardOf('fresh-agent')), '删除对称移除（无残留键）').toHaveCount(0, { timeout: 30_000 })
  } finally {
    await closeSession(session)
  }
})

// ── step-1 name-change-new-identity：改 name 即换身份 ──

test('@feature expert-squad reload step-1 rename：改 frontmatter name → 旧键消失、新键收编（改键即换身份）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    writeFileSync(join(wsDir, '.dsh', 'experts', 'renamed-agent.md'), expertMd('renamed-agent', '换名夹具', '换名后同一份人设。', ['read']))
    rmSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`))
    await expect(page.locator(cardOf(KEY)), '旧键随旧文件消失').toHaveCount(0, { timeout: 30_000 })
    await expect(page.locator(cardOf('renamed-agent')), '新键经刷新收编').toBeVisible({ timeout: 30_000 })
  } finally {
    await closeSession(session)
  }
})

// ── step-1 temp-file-ignored：临时文件/swap 不收编 ──

test('@feature expert-squad reload step-1 temp-file：非 .md 正本（swap/临时文件）不收编', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const expertsDir = join(wsDir, '.dsh', 'experts')
    writeFileSync(join(expertsDir, 'scratch.tmp'), expertMd('scratch', '临时态', '临时文件人设。', ['read']))
    writeFileSync(join(expertsDir, 'swapfile.md~'), expertMd('swapfile', '交换态', '交换文件人设。', ['read']))
    // 跨两个轮询周期后仍不收编：临时形态零逃逸进索引
    await expect
      .poll(async () => (await page.locator(cardOf('scratch')).count()) + (await page.locator(cardOf('swapfile')).count()), {
        timeout: 15_000,
        message: '临时文件两周期内零收编',
      })
      .toBe(0)
    await expect(page.locator(cardOf(KEY)), '合法正本不受影响').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

// ── step-5 success：白名单收窄 → 读回新值且面板 chips 同步 ──

test('@feature expert-squad reload step-5 whitelist：直编收窄 tools → 读回收窄值，面板 chips 同步', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    writeFileSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`), expertMd(KEY, '夹具评审', '收窄后仅读人设。', ['read']))
    await expect(page.locator(`${cardOf(KEY)} .xc-tags .chip.tool`, { hasText: 'grep' }), '面板 grep chip 移除').toHaveCount(0, {
      timeout: 30_000,
    })
    await expect(page.locator(`${cardOf(KEY)} .xc-tags .chip.tool`, { hasText: 'read' }).first(), 'read chip 保留').toBeVisible()
    await expect
      .poll(async () => {
        const got = await fetchExpert(page, wsParam, KEY)
        const tools = (got.body as { tools?: string[] } | null)?.tools
        return JSON.stringify(tools ?? [])
      }, { timeout: 30_000, message: '取用读回收窄白名单 [read]' })
      .toBe(JSON.stringify(['read']))
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——直编 → 生效 → 取用读回全依序） ──

test('@feature expert-squad reload 冒烟：直编改档 → 面板换代 → 取用 API 读回新内容 → 零异常', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    writeFileSync(join(wsDir, '.dsh', 'experts', `${KEY}.md`), expertMd(KEY, '夹具评审·热刷', '冒烟热刷人设正文。', ['read', 'bash']))
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '面板岗位换代').toContainText('夹具评审·热刷', { timeout: 30_000 })
    await expect
      .poll(async () => {
        const got = await fetchExpert(page, wsParam, KEY)
        return got.ok ? JSON.stringify(got.body) : ''
      }, { timeout: 30_000, message: '取用读回冒烟新内容' })
      .toContain('冒烟热刷人设正文')
    // 不变量：其余专家原样；renderer 零未捕获异常
    await expect(page.locator(cardOf(OTHER_KEY)), '其余专家原样').toBeVisible()
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
