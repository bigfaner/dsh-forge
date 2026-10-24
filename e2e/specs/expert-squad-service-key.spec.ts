// expert-squad 1.31 旅程 e2e：服务键取用与通道二可机检面（service-key-access journey）真机取证。
// journey = .forge/docs/features/expert-squad/testing/service-key-access/journey.md
// contracts = 同目录 contracts/step-1..5。
// 观测面：浏览器 fetch 桥即取用 API 的 HTTP 投影（GET /api/expert-squad/get｜list——
// routes.ts 精确路由族，服务键 experts 的 deps 直连）——fail-loud 错误语义（registry
// ExpertNotFoundError/ExpertDisabledError 文本）与字段表同屏取证。
// 不落脚本 Outcome（契约层保留，run-tests 台账注记）：step-2 组装映射逐字段（compose.ts
// 纯函数面——compose.test.ts 单测承载）、step-3 通道二派发（startContinuable 需模型通道）、
// step-4 独立环境装载/插件启停（plugin-manager 通道在 e2e 载体不可驱动）。
// step-5 源码/schema 纯净审计以词汇检索脚本承载（契约注明：审计型步骤——脚本检索样例
// 档案与 schema 面；源码侧 console 日志命名空间前缀 [dsh-forge/expert-squad] 为 log 标签
// 非领域词汇，显式排除并留痕）。
// 拦截纪律（fix-3 判例）：页面上下文 fetch，禁 page.route。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp。
// @feature expert-squad @web-e2e
import { readdirSync, readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`

const KEY = 'test-reviewer'
const OTHER_KEY = 'data-miner'
// 包目录以本 spec 文件位置锚定（e2e/specs/ → 仓根两级上），不随 Playwright cwd 漂移
const PLUGIN_PKG_DIR = fileURLToPath(new URL('../../packages/plugins/expert-squad', import.meta.url))

/** 上层业务词汇表（service-key-access step-5 契约——基础能力而非某应用专属） */
const FORBIDDEN_VOCAB = /\b(forge|expedition|proposal|worktree|dispatch-loop|task-delegation)\b/i
/** console 日志命名空间前缀（log 标签——显式排除项，非领域词汇） */
const LOG_NAMESPACE = /\[dsh-forge\/expert-squad\]/g

function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for service-key e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '**严格**评审每一处变更，优先跑 `tsc` 与单测。',
    '',
  ].join('\n')
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-svckey-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, '夹具评审'))
  writeFileSync(join(expertsDir, `${OTHER_KEY}.md`), expertMd(OTHER_KEY, '夹具挖掘'))
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

async function postToggle(page: Page, workspace: string, endpoint: 'enable' | 'disable', key: string): Promise<boolean> {
  return page.evaluate(async ({ ep, body }) => {
    const response = await fetch(ep, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return response.ok
  }, { ep: `/api/expert-squad/${endpoint}`, body: { workspace, key } })
}

async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-svckey-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-svckey-fixture')
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

// ── step-1 success：字符串键取用——完整档案字段可编程消费 ──

test('@feature expert-squad svc-key step-1：get 返回完整档案字段（api-contract §3 字段表）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    const got = await fetchExpert(page, wsParam, KEY)
    expect(got.ok, `取用成功（${got.text}）`).toBe(true)
    const entry = got.body as Record<string, unknown>
    // §3 字段表逐字段（齐全可编程消费）
    expect(entry['name'], 'name').toBe(KEY)
    expect(entry['title'], 'title').toBe('夹具评审')
    expect(String(entry['description']), 'description').toContain('Fixture expert')
    expect(String(entry['personaMd']), 'personaMd 人设原文').toContain('严格')
    expect(entry['tools'], 'tools 白名单').toEqual(['read', 'grep'])
    expect(entry['skills'], 'skills 标签').toEqual(['review'])
    expect(entry['origin'], 'origin 来源层').toBe('project')
    expect(entry['enabled'], 'enabled 启用态').toBe(true)
    expect(/^\d{4}-\d{2}-\d{2}T/.test(String(entry['updatedAt'])), 'updatedAt ISO 形态').toBe(true)
  } finally {
    await closeSession(session)
  }
})

// ── step-1 disabled-expert-fail-loud / not-found-key：fail-loud 错误语义 ──

test('@feature expert-squad svc-key step-1 fail-loud：禁用取用报 disabled、未知键报 not found（均含键名）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    // 禁用 OTHER_KEY → 取用 fail-loud
    expect(await postToggle(page, wsParam, 'disable', OTHER_KEY), 'disable 通道成功').toBe(true)
    const disabled = await fetchExpert(page, wsParam, OTHER_KEY)
    expect(disabled.ok, '禁用取用 fail-loud（非残缺档案/空对象）').toBe(false)
    expect(disabled.text, '报文含键名与状态').toContain(`expert disabled: ${OTHER_KEY}`)
    // 未知键 → not found 含键名（可定位拼写错误）
    const missing = await fetchExpert(page, wsParam, 'zzz-no-such-expert')
    expect(missing.ok, '未知键取用失败').toBe(false)
    expect(missing.text, '报文含被查键名').toContain('expert not found: zzz-no-such-expert')
    // 重新启用 → 取用恢复（启停通道对称）
    expect(await postToggle(page, wsParam, 'enable', OTHER_KEY), 'enable 通道成功').toBe(true)
    const restored = await fetchExpert(page, wsParam, OTHER_KEY)
    expect(restored.ok, '重启用后取用恢复').toBe(true)
  } finally {
    await closeSession(session)
  }
})

// ── step-5 success：源码/schema 纯净词汇审计（检索脚本形态） ──

test('@feature expert-squad svc-key step-5 audit：随包样例档案与 schema 面零上层业务词汇', async () => {
  test.setTimeout(60_000)
  // 样例档案层：随包 experts/*.md 全量检索
  const expertsDir = join(PLUGIN_PKG_DIR, 'experts')
  const offenders: string[] = []
  for (const name of readdirSync(expertsDir)) {
    if (!name.endsWith('.md')) continue
    const content = readFileSync(join(expertsDir, name), 'utf8')
    if (FORBIDDEN_VOCAB.test(content)) offenders.push(`experts/${name}`)
  }
  expect(offenders, `样例档案零业务词汇（违例：${offenders.join(', ')}）`).toEqual([])
  // schema 面：routes.ts 载荷门（注释剥离后检索——zod 描述与错误消息无业务词汇）
  const routesSrc = readFileSync(join(PLUGIN_PKG_DIR, 'src', 'routes.ts'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
  const schemaHit = FORBIDDEN_VOCAB.exec(routesSrc.replace(LOG_NAMESPACE, ''))
  expect(schemaHit, `schema 面零业务词汇${schemaHit ? `（命中：${schemaHit[0]}）` : ''}`).toBeNull()
  // 源码面：src/src-client 全量（注释与 log 命名空间标签显式排除——留痕于文件头注记）
  const srcDirs = [join(PLUGIN_PKG_DIR, 'src'), join(PLUGIN_PKG_DIR, 'src-client')]
  const srcOffenders: string[] = []
  const walk = (dir: string): void => {
    for (const dirent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, dirent.name)
      if (dirent.isDirectory()) {
        walk(full)
        continue
      }
      if (!dirent.name.endsWith('.ts') && !dirent.name.endsWith('.tsx')) continue
      const stripped = readFileSync(full, 'utf8')
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(LOG_NAMESPACE, '')
      if (FORBIDDEN_VOCAB.test(stripped)) srcOffenders.push(full)
    }
  }
  for (const dir of srcDirs) walk(dir)
  expect(srcOffenders, `源码零业务词汇（违例：${srcOffenders.join(', ')}）`).toEqual([])
})

// ── Journey 冒烟（恰一条——键取用 → 启停 fail-loud → 恢复全依序） ──

test('@feature expert-squad svc-key 冒烟：键取用完整档案 → 禁用 fail-loud → 面板降透明在场 → 重启用恢复', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    // 步骤1：键取用
    const got = await fetchExpert(page, wsParam, KEY)
    expect(got.ok, '键取用成功').toBe(true)
    // 启停 fail-loud 与面板呈现一致（全量视图禁用卡降透明在场，档案不消失）
    expect(await postToggle(page, wsParam, 'disable', KEY), 'disable 成功').toBe(true)
    await expect(page.locator(cardOf(KEY)), '全量视图禁用卡在场').toBeVisible({ timeout: 30_000 })
    await expect(page.locator(cardOf(KEY)), '禁用卡降透明').toHaveClass(/off/, { timeout: 30_000 })
    const disabled = await fetchExpert(page, wsParam, KEY)
    expect(disabled.text, '禁用取用报 disabled').toContain(`expert disabled: ${KEY}`)
    // 重启用恢复
    expect(await postToggle(page, wsParam, 'enable', KEY), 'enable 成功').toBe(true)
    await expect(page.locator(cardOf(KEY)), '启用卡恢复常态').not.toHaveClass(/off/, { timeout: 30_000 })
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
