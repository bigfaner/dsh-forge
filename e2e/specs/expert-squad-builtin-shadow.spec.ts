// expert-squad 1.31 旅程 e2e：内置专家与同名遮蔽定制（builtin-expert-lifecycle journey）真机取证——
// journey = .forge/docs/features/expert-squad/testing/builtin-expert-lifecycle/journey.md
// contracts = 同目录 contracts/step-1..5（每 Outcome 一测试 + 一条 happy-path 冒烟）。
// 内置层真机来源 = 随包 experts/（resolvePluginExpertsRoot——scan.ts 三层 root 正门；
// 随包内置 code-reviewer 在 panel-grid run1 实测在场）。project 层 = 夹具工作区
// .dsh/experts/（遮蔽裁决 project > user > plugin——scan.ts PRIORITY 定序）。
// 观测面：面板卡片（呈现裁决）+ 取用 API get（origin 字段——取用裁决）——两处遮蔽
// 裁决一致性同屏取证；包零触碰 = Node 侧包目录文件清单+内容快照比对（step-4）。
// 不落脚本 Outcome（契约层保留，run-tests 台账注记）：builtin-delegatable / step-5
// upgrade 系列（registerRoot 换包与包升级动作在 e2e 载体无通道——插件装载形态由宿主
// 组合承担；升级语义由 registry/scan 单测与结构 pin 承载）、root-declaration-missing
// （registerRoot 缺席装配形态非浏览器可达）、delete-then-dispatch-consistent（派发面
// 需模型通道）。
// 拦截纪律（fix-3 判例）：取用 API 经页面上下文 fetch，不用 page.route。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；插件包目录只读。
// @feature expert-squad @web-e2e
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** 随包内置专家键（packages/plugins/expert-squad/experts/code-reviewer.md——正本事实） */
const BUILTIN_KEY = 'code-reviewer'
// 包目录以本 spec 文件位置锚定（e2e/specs/ → 仓根两级上），不随 Playwright cwd 漂移
const PLUGIN_PKG_DIR = fileURLToPath(new URL('../../packages/plugins/expert-squad', import.meta.url))
const BUILTIN_SRC = join(PLUGIN_PKG_DIR, 'experts', `${BUILTIN_KEY}.md`)

/** 随包内置档案的 title（遮蔽/回落断言的期望值——以包内正本为期望单源） */
function builtinTitle(): string {
  return /^title: (.+)$/m.exec(readFileSync(BUILTIN_SRC, 'utf8'))?.[1] ?? ''
}

/** project 层遮蔽档案（同键 BUILTIN_KEY，内容可区分） */
function shadowMd(): string {
  return [
    '---',
    `name: ${BUILTIN_KEY}`,
    'description: >-',
    '  Project-layer shadow fixture for builtin shadow e2e.',
    'title: 夹具遮蔽评审·定制版',
    'tools: [read]',
    'skills: [shadow]',
    '---',
    '',
    '## 职责',
    '',
    '遮蔽定制人设正文：与包内内置版内容可区分。',
    '',
  ].join('\n')
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-shadow-ws-'))
  mkdirSync(join(dir, '.dsh', 'experts'), { recursive: true })
  return dir
}

/** 包目录文件清单+内容快照（step-4 包零触碰比对基准） */
function packageFingerprint(): string {
  const hash = createHash('sha256')
  const expertsDir = join(PLUGIN_PKG_DIR, 'experts')
  for (const name of readdirSync(expertsDir).sort()) {
    hash.update(name)
    hash.update(readFileSync(join(expertsDir, name)))
  }
  return hash.digest('hex')
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

/** 页面上下文取用 API（GET /api/expert-squad/get；非 2xx → ok=false + 文本原因）。 */
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
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-shadow-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-shadow-fixture')
  await dismissOnboardingModals(page)
  await installListCapture(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(cardOf(BUILTIN_KEY)), '内置专家卡在场（开箱即用）').toBeVisible({ timeout: 30_000 })
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

// ── step-1 success：内置专家同呈可用 ──

test('@feature expert-squad shadow step-1：内置专家开箱即用——面板在场，取用 origin=plugin', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const wsParam = await captureWorkspaceParam(page)
    await expect(page.locator(cardOf(BUILTIN_KEY)).locator('.xc-name'), '内置卡名称').toHaveText(BUILTIN_KEY)
    const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
    expect(got.ok, `内置专家可取用（${got.text}）`).toBe(true)
    const entry = got.body as { origin?: string; enabled?: boolean; name?: string }
    expect(entry.origin, 'origin=plugin（plugin 层 root 扫描产物）').toBe('plugin')
    expect(entry.enabled, '启用态（开箱即用）').toBe(true)
    expect(entry.name, 'name = 键正本').toBe(BUILTIN_KEY)
  } finally {
    await closeSession(session)
  }
})

// ── step-2/3 success：project 层同名遮蔽——面板与取用双裁决一致 ──

test('@feature expert-squad shadow step-2/3：同名遮蔽命中定制版——聚组展示（生效标在 project 卡 + 被遮蔽内置卡组内可见）+ origin=project', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
    // 聚组呈现裁决（1.60 用户裁决）：同键全层可见——生效卡（project 定制）+ 被遮蔽内置折叠行
    const group = page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"]`)
    await expect(group, '聚组容器在场').toBeVisible({ timeout: 30_000 })
    await expect(group.locator('.xg-cnt'), '组内来源数标注').toHaveText('2 个来源')
    const effectiveCard = group.locator(`${cardOf(BUILTIN_KEY)}[data-effective="true"]`)
    await expect(effectiveCard.locator('.xc-title'), '生效卡呈 project 层定制岗位').toContainText('夹具遮蔽评审·定制版')
    await expect(effectiveCard.locator('.eff-badge'), '「生效」标在 project 卡').toHaveText('生效')
    await expect(effectiveCard.locator('.origin-badge.origin-project'), '生效卡来源角标·项目').toHaveText('项目')
    await expect(effectiveCard.locator('.xc-creed'), '呈定制人设摘要').toContainText('遮蔽定制人设正文')
    // 被遮蔽内置卡：折叠摘要行（来源角标 + 只读），点击展开对比视图
    const shadowRow = group.locator(`.dswf-xshadow[data-origin="plugin"]`)
    await expect(shadowRow, '被遮蔽内置卡组内可见').toBeVisible()
    await expect(shadowRow.locator('.origin-badge.origin-plugin'), '被遮蔽行来源角标·内置').toHaveText('内置')
    await expect(shadowRow, '被遮蔽行只读标记').toContainText('被遮蔽 · 只读')
    await shadowRow.click()
    const compare = group.locator('.dswf-xcompare')
    await expect(compare, '展开对比视图（字段对齐表）').toBeVisible()
    await expect(compare.locator('td.diff').first(), '差异格 warn 高亮在场').toBeVisible()
    // 取用裁决：origin=project（与面板生效标一致——遮蔽裁决两处一致）
    await expect
      .poll(async () => {
        const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
        return (got.body as { origin?: string } | null)?.origin ?? ''
      }, { timeout: 30_000, message: '取用 origin 换代为 project' })
      .toBe('project')
  } finally {
    await closeSession(session)
  }
})

// ── step-4 success + plugin-package-untouched：删除回落内置版，包零触碰 ──

test('@feature expert-squad shadow step-4：删定制回落内置版；插件包目录逐字零触碰', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    const wsParam = await captureWorkspaceParam(page)
    const expectedTitle = builtinTitle()
    // 前置：遮蔽生效（聚组：生效标在 project 卡 + 被遮蔽内置行在场）
    writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
    await expect(page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"] ${cardOf(BUILTIN_KEY)}[data-effective="true"] .xc-title`), '遮蔽生效前置').toContainText('夹具遮蔽评审·定制版', {
      timeout: 30_000,
    })
    // 删除定制档案（只动 project 层）→ 回落内置（组退化为单来源，被遮蔽行退场）
    const fingerprintBefore = packageFingerprint()
    rmSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`))
    await expect(page.locator(`${cardOf(BUILTIN_KEY)} .xc-title`), '面板回落内置岗位').toContainText(expectedTitle, {
      timeout: 30_000,
    })
    await expect(page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"] .dswf-xshadow`), '被遮蔽行退场（单来源组）').toHaveCount(0)
    await expect
      .poll(async () => {
        const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
        return (got.body as { origin?: string } | null)?.origin ?? ''
      }, { timeout: 30_000, message: '取用回落 origin=plugin' })
      .toBe('plugin')
    // 包零触碰：包 experts/ 清单+内容逐字不变
    expect(packageFingerprint(), '插件包 experts/ 目录指纹不变（定制不回写包）').toBe(fingerprintBefore)
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——内置在场 → 遮蔽 → 回落全依序） ──

test('@feature expert-squad shadow 冒烟：内置在场 → project 遮蔽单卡 → 删除回落内置', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page, wsDir } = session
    // 步骤1：内置在场（openPanelWithFixture 已收敛）；另备一枚对照卡
    await expect(page.locator(cardOf(BUILTIN_KEY))).toBeVisible()
    // 步骤2-3：遮蔽定制（聚组：生效标在 project 卡，被遮蔽内置卡组内可见）
    writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
    const group = page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"]`)
    await expect(group.locator(`${cardOf(BUILTIN_KEY)}[data-effective="true"] .xc-title`), '遮蔽定制卡（生效位）').toContainText('夹具遮蔽评审·定制版', {
      timeout: 30_000,
    })
    await expect(group.locator('.dswf-xshadow[data-origin="plugin"]'), '被遮蔽内置卡组内可见').toBeVisible()
    // 步骤4：删除回落（单来源组，被遮蔽行退场）
    rmSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`))
    await expect(page.locator(`${cardOf(BUILTIN_KEY)} .xc-title`), '回落内置岗位').toContainText(builtinTitle(), {
      timeout: 30_000,
    })
    await expect(group.locator('.dswf-xshadow'), '被遮蔽行退场').toHaveCount(0)
    // 不变量：renderer 零未捕获异常
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
