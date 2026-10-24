// expert-squad 1.31 旅程 e2e：坏档案不扩散与并发一致性可机检面（profile-fault-isolation
// journey）真机取证。
// journey = .forge/docs/features/expert-squad/testing/profile-fault-isolation/journey.md
// contracts = 同目录 contracts/step-1..5。
// 观测面：面板列表（坏档零索引痕迹、其余 N 个照常）+ 取用 API（其余键 get 正常）+
// 坏档类目逐一（缺 frontmatter / 坏 YAML / 裸 {{——step-1 三类坏法无一逃逸）+ 修正恢复
// （step-3 热刷新收编）。并发窗口（step-4 竞态 Outcomes）为 host 半快照冻结语义——
// scan/registry 单测承载（浏览器无竞态注入缝），契约层保留不落脚本（run-tests 台账注记）。
// warnings 面板呈现 Outcome（panel-errorbar-surfaces）：list 路由零 warnings 投影字段
// （routes.ts list = ExpertEntry[]），面板 ErrorBar 仅取数失败分支——真机呈现面缺位，
// 契约层保留不落脚本并如实上报。
// 拦截纪律（fix-3 判例）：页面上下文 fetch，禁 page.route。
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

const GOOD_KEYS = ['test-reviewer', 'data-miner'] as const

function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for fault-isolation e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '正常专家人设正文。',
    '',
  ].join('\n')
}

/** 三类坏档（step-1 契约 a/b/c——缺 frontmatter / 坏 YAML / 裸 {{） */
const BAD_ARCHIVES: readonly { key: string; kind: string; content: string }[] = [
  {
    key: 'bad-nofm',
    kind: '缺 frontmatter',
    content: '没有 frontmatter 头的纯文本档案，必缺失 name 等必填字段。\n',
  },
  {
    key: 'bad-yaml',
    kind: '坏 YAML',
    content: '---\nname: bad-yaml\ntitle: [未闭合\n  description: 缩进破坏\n---\n\n正文。\n',
  },
  {
    key: 'bad-mustache',
    kind: '裸 {{',
    content: '---\nname: bad-mustache\ntitle: 裸插值\ndescription: 坏档夹具\n tools: [read]\n---\n\n正文含裸 {{ 拒绝\n',
  },
]

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-fault-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, 'test-reviewer.md'), expertMd('test-reviewer', '夹具评审'))
  writeFileSync(join(expertsDir, 'data-miner.md'), expertMd('data-miner', '夹具挖掘'))
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

async function fetchExpert(page: Page, workspace: string, key: string): Promise<{ ok: boolean; text: string }> {
  return page.evaluate(async ({ ep, payload }) => {
    const response = await fetch(`${ep}?key=${encodeURIComponent(payload.key)}&workspace=${encodeURIComponent(payload.workspace)}`)
    return { ok: response.ok, text: await response.text() }
  }, { ep: '/api/expert-squad/get', payload: { workspace, key } })
}

async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-fault-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-fault-fixture')
  await dismissOnboardingModals(page)
  await installListCapture(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(cardOf('test-reviewer')), '既有专家卡数据态').toBeVisible({ timeout: 30_000 })
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

// ── step-1 success + three-bad-variants：三类坏法逐一零逃逸 ──

test('@feature expert-squad fault step-1：三类坏档逐一写入——零逃逸进索引（列表零坏键）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const expertsDir = join(wsDir, '.dsh', 'experts')
    for (const bad of BAD_ARCHIVES) {
      writeFileSync(join(expertsDir, `${bad.key}.md`), bad.content)
    }
    // 三类坏键均零索引痕迹（扫描期单文件跳过）
    await expect
      .poll(
        async () => {
          let sum = 0
          for (const bad of BAD_ARCHIVES) sum += await page.locator(cardOf(bad.key)).count()
          return sum
        },
        { timeout: 30_000, message: '三类坏键零逃逸进面板列表' },
      )
      .toBe(0)
    // 正常专家不受影响（列表照常呈现）
    for (const key of GOOD_KEYS) {
      await expect(page.locator(cardOf(key)), `正常卡·${key} 照常`).toBeVisible()
    }
  } finally {
    await closeSession(session)
  }
})

// ── step-2 success + dispatch-others：坏档在目录时其余专家可取用 ──

test('@feature expert-squad fault step-2：坏档在目录——其余专家取用照常（单点故障隔离）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    writeFileSync(join(wsDir, '.dsh', 'experts', 'bad-nofm.md'), BAD_ARCHIVES[0].content)
    await expect(page.locator(cardOf('bad-nofm')), '坏档零索引痕迹').toHaveCount(0, { timeout: 30_000 })
    // 其余专家取用 API 照常（坏文件不进入任何取用结果）
    for (const key of GOOD_KEYS) {
      const got = await fetchExpert(page, wsParam, key)
      expect(got.ok, `取用照常·${key}（${got.text}）`).toBe(true)
    }
    // 坏键取用 = 标准 not-found 语义（不半途崩溃、不残缺档案）
    const bad = await fetchExpert(page, wsParam, 'bad-nofm')
    expect(bad.ok, '坏档键取用不可用').toBe(false)
    expect(bad.text, '标准 not-found 语义含键名').toContain('expert not found: bad-nofm')
  } finally {
    await closeSession(session)
  }
})

// ── step-3 success：修正坏档案 → 校验通过转正常（热刷新收编）──

test('@feature expert-squad fault step-3：坏档修正保存 → 转正常可取用（修正即恢复，无残留坏态）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    const expertsDir = join(wsDir, '.dsh', 'experts')
    // 前置：裸 {{ 坏档在目录
    writeFileSync(join(expertsDir, 'bad-mustache.md'), BAD_ARCHIVES[2].content)
    await expect(page.locator(cardOf('bad-mustache')), '坏档前置零索引').toHaveCount(0, { timeout: 30_000 })
    // 修正为合法内容 → 热刷新收编
    writeFileSync(join(expertsDir, 'bad-mustache.md'), expertMd('bad-mustache', '修正后夹具'))
    await expect(page.locator(cardOf('bad-mustache')), '修正后转正常（热刷新收编）').toBeVisible({ timeout: 30_000 })
    const got = await fetchExpert(page, wsParam, 'bad-mustache')
    expect(got.ok, `修正后立即可取用（${got.text}）`).toBe(true)
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——坏档隔离 → 修正恢复全依序） ──

test('@feature expert-squad fault 冒烟：写坏档 → 其余照常 → 修正恢复 → 零异常', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    const expertsDir = join(wsDir, '.dsh', 'experts')
    // 步骤1-2：坏档零逃逸、其余照常
    writeFileSync(join(expertsDir, 'bad-yaml.md'), BAD_ARCHIVES[1].content)
    await expect(page.locator(cardOf('bad-yaml')), '坏档零索引').toHaveCount(0, { timeout: 30_000 })
    await expect(page.locator(cardOf('test-reviewer')), '其余照常').toBeVisible()
    // 步骤3：修正恢复
    writeFileSync(join(expertsDir, 'bad-yaml.md'), expertMd('bad-yaml', '修正后挖掘'))
    await expect(page.locator(cardOf('bad-yaml')), '修正后收编').toBeVisible({ timeout: 30_000 })
    expect((await fetchExpert(page, wsParam, 'bad-yaml')).ok, '修正后可取用').toBe(true)
    // 不变量：renderer 零未捕获异常
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
