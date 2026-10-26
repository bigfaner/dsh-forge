// expert-squad fix-1 旅程 e2e：专家卡片网格主视图（ui-design F1）真机取证——
// journey = .forge/docs/features/expert-squad/testing/panel-card-grid/journey.md
// contracts = 同目录 contracts/step-1..5（每 Outcome 一测试 + 一条 happy-path 冒烟）。
// 打开动线：launchHost 隔离 profile → 夹具工作区（.dsh/experts/ 两份合法档案）
// RPC 注册 → 左栏 panellist 行「专家团」→ main keyed 'expert-squad' 面板。
// data 锚（panel/expert-panel.tsx 事实表）：面板 [data-dswf-expert-panel]、卡 .dswf-xcard
// [data-expert-key][data-effective]、聚组容器 .dswf-xgroup[data-expert-key]（1.60 裁决：
// 同键聚组——组头 xg-head + 生效卡「生效」标 .eff-badge + 来源角标 .origin-badge.origin-* +
// 被遮蔽折叠行 .dswf-xshadow[data-origin] + 展开对比 .dswf-xcompare）、状态筛选
// select.dswf-status-select[data-status]（头部重排 2026-10-25：
// 搜索+筛选左置、召唤独右）、页脚 .dswf-panel-footer、
// 错误条 .dswf-errorbar[role=alert]、空态 .dswf-empty；panellist 行 = 官方 aria 锚
// button[aria-label="专家团"]（KNOWLEDGE_ENTRY 同径）。
// 故障/空态注入：dsh-forge:// 自定义 scheme 的页内 fetch 对 page.route 不生效（页面恒收
// 真实响应）——改为页面上下文内包装 window.fetch 的注入式拦截（scheme 无关），注入/还原
// 对称（用例 finally 还原，幂等）；禁用态经面板同款通道 POST /api/expert-squad/disable
// （workspace 参数取自面板真实 list 请求——页面上下文内 fetch 捕获缓冲 + expect.poll，
// D4 同参；dsh-forge:// scheme 下该 fetch 不进 performance resource entry）。
// Hard Rules：零产品源码改动（断言失败 → 归因上报）；夹具 = 仓外 tmp；断言对齐
// ui-design.md F1 与 tech-design §10.4 真机结算门，不编造断言。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

// ── 面板锚（expert-panel.tsx data 锚——本 spec 字面量单源） ──
const PANEL_ROOT = '[data-dswf-expert-panel]'
const PANEL_ROW = 'button[aria-label="专家团"]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`
const groupOf = (key: string): string => `.dswf-xgroup[data-expert-key="${key}"]`
const statusSelect = 'select.dswf-status-select[aria-label="状态筛选"]'
const FOOTER = '.dswf-panel-footer'
const ERRORBAR = '.dswf-errorbar[role="alert"]'
const EMPTY = '.dswf-empty'
const SEARCH = 'input.dswf-search[aria-label="搜索专家"]'

/** project 层夹具专家档案（tech-design §8 frontmatter——name/title/description/tools 必填） */
function expertMd(name: string, title: string, skills: string[]): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for panel-grid e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    `skills: [${skills.join(', ')}]`,
    '---',
    '',
    '## 职责',
    '',
    '夹具人设正文：用于卡片摘要与字段断言的固定文本。',
    '',
  ].join('\n')
}

/** 夹具工作区（两份 project 层档案：test-reviewer / data-miner） */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-panel-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, 'test-reviewer.md'), expertMd('test-reviewer', '夹具评审', ['review', 'tsc']))
  writeFileSync(join(expertsDir, 'data-miner.md'), expertMd('data-miner', '夹具挖掘', ['sql', 'mining']))
  return dir
}

/** 面板真实 list 请求捕获：dsh-forge:// scheme 下 fetch 不进 performance resource
 *  entry（run1 实证 entry 恒缺）——改为页面上下文内包装 fetch 记录请求 URL 到缓冲。
 *  面板激活前安装（openPanelWithFixture），与 scheme 无关。 */
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

/** 面板真实 list 请求的 workspace 参数（启停通道同参——D4 取值一致性）。
 *  expect.poll 轮询捕获缓冲，消除读取时机竞态。 */
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

/** list 注入拦截（页面上下文内包装 window.fetch——对 dsh-forge:// scheme 生效）：
 *  error = list 请求拒绝；empty = list 返回空数组；hang = list 永久挂起（loading-first
 *  骨架期装置——1.46 修正：page.route 对 dsh-forge:// scheme 不生效（fix-3 判例），
 *  挂起同走 fetch 包装，骨架断言不再依赖时序侥幸）。幂等，restoreListStub 对称还原。 */
async function injectListStub(page: Page, mode: 'error' | 'empty' | 'hang'): Promise<void> {
  await page.evaluate((stubMode) => {
    const w = window as typeof window & { __xsqOriginalFetch?: typeof window.fetch }
    if (w.__xsqOriginalFetch) return
    const original = window.fetch.bind(window)
    w.__xsqOriginalFetch = original
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/expert-squad/list')) {
        if (stubMode === 'error') throw new TypeError('xsq e2e stub: list request rejected')
        if (stubMode === 'hang') await new Promise(() => undefined)
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return original(input as RequestInfo, init)
    }
  }, mode)
}

/** 还原 window.fetch 包装（对称清理；未注入时为空操作） */
async function restoreListStub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as typeof window & { __xsqOriginalFetch?: typeof window.fetch }
    if (w.__xsqOriginalFetch) {
      window.fetch = w.__xsqOriginalFetch
      delete w.__xsqOriginalFetch
    }
  })
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly pageErrors: string[]
  readonly wsDir: string
  readonly userData: string
}

/** 启动 → 注册夹具工作区 → 激活面板（数据态收敛）。每例自持世界，cleanup finally 承担。 */
async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-panel-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-panel-fixture')
  await dismissOnboardingModals(page)
  await installListCapture(page) // 面板激活前安装 list 请求捕获（scheme 无关）
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（panellist 注册缝）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态（骨架收敛）').toBeVisible({ timeout: 30_000 })
  return { page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
}

/** 例终收口：closeApp + tmp 夹具清理（尽力而为） */
async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeApp(session.app)
  } catch {
    /* closeApp 尽力而为——进程残留由 Job Object 整树回收兜底 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

// ── step-1-activate-panel ──

test('@feature expert-squad step-1 success：激活面板 → 头部三段 + 数据网格 + 页脚计数', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 头部结构（F1，2026-10-25 重排）：标题 + 搜索 + 状态筛选 select 左置；召唤独右
    await expect(page.locator('.dswf-panel-title'), '面板标题「专家团」').toHaveText('专家团')
    await expect(page.locator(SEARCH), '搜索框在场').toBeVisible()
    const headerOrder = await page.locator('.dswf-panel-header > *').evaluateAll((nodes) =>
      nodes.map((node) => node.className),
    )
    expect(headerOrder.join(' '), '头部次序：标题 → 搜索 → select → 召唤独右').toBe(
      'dswf-panel-title dswf-search dswf-status-select dswf-btn dswf-btn-primary dswf-summon-btn',
    )
    const select = page.locator(statusSelect)
    await expect(select, '状态筛选 select 在场').toBeVisible()
    await expect(select, '默认态·全部').toHaveAttribute('data-status', 'all')
    const optionLabels = await select.locator('option').allInnerTexts()
    expect(optionLabels, '三态选项语义不变').toEqual(['全部', '启用', '禁用'])
    // 召唤钮（fix-9 返工：[召唤] = 经官方缝打开/切换 HR 预设官方会话，面板内零对话面）
    // 断言归 1.31 gen-scripts 重新生成、1.32 run-tests 真机取证
    // 数据态：夹具卡呈现 + 页脚计数形态
    await expect(page.locator(cardOf('test-reviewer')), '夹具卡·test-reviewer').toBeVisible()
    await expect(page.locator(cardOf('data-miner')), '夹具卡·data-miner').toBeVisible()
    await expect(page.locator(FOOTER), '页脚计数形态「N 位专家 · 显示 M」').toContainText('位专家 · 显示')
    // list 请求形态：includeDisabled=true（全量视图含禁用）——捕获缓冲读取
    //（dsh-forge:// scheme 下 fetch 不进 performance resource entry，run1 实证）
    const listUrl = await page.evaluate(() => {
      const w = window as typeof window & { __xsqListUrls?: string[] }
      return [...(w.__xsqListUrls ?? [])].reverse().find((url) => url.includes('workspace=')) ?? ''
    })
    expect(listUrl, 'list 请求带 includeDisabled=true').toContain('includeDisabled=true')
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad step-1 loading-first：取数未决 → 骨架卡（零空态零错误）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-panel-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const session: PanelSession = { page: launched.page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
  try {
    const { page } = session
    await registerProject(page, wsDir, 'xsq-panel-fixture')
    await dismissOnboardingModals(page)
    // 取数未决注入：list 永久挂起（页面上下文内 fetch 包装——page.route 对
    // dsh-forge:// scheme 不生效，fix-3 判例；1.46 装置修正同径）——激活后即骨架期
    await injectListStub(page, 'hang')
    await page.locator(PANEL_ROW).click()
    await expect(page.locator(PANEL_ROOT), '面板挂载').toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-skeleton-card').first(), '骨架卡呈现').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(EMPTY), '中间态禁落空态分支').toHaveCount(0)
    await expect(page.locator(ERRORBAR), '中间态禁落错误分支').toHaveCount(0)
    await expect(page.locator(FOOTER), '页脚扫描文案').toContainText('扫描专家目录')
  } finally {
    await closeSession(session)
  }
})

// ── step-2-grid-render-fields-footer ──

test('@feature expert-squad step-2 success：卡片字段集逐位（灯/名称/标识chip/岗位/摘要/双chips/页脚时间）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const card = page.locator(cardOf('test-reviewer'))
    // 字段集逐位（ui-design F1 数据绑定）
    await expect(card.locator('.dot.on'), '启用状态灯 on').toBeVisible()
    await expect(card.locator('.xc-name'), '名称 ← name').toHaveText('test-reviewer')
    await expect(card.locator('.chip.tool').first(), '英文标识 chip ← name').toHaveText('test-reviewer')
    await expect(card.locator('.xc-title'), '岗位 ← title').toHaveText('夹具评审')
    await expect(card.locator('.xc-creed'), '人设摘要（Markdown 剥离纯文本）').toContainText('夹具人设正文')
    expect((await card.locator('.xc-creed').innerText()).includes('##'), '摘要零 Markdown 记号外露').toBe(false)
    await expect(card.locator('.xc-seg').nth(0), '段标·技能标签').toHaveText('技能标签')
    await expect(card.locator('.xc-seg').nth(1), '段标·工具白名单').toHaveText('工具白名单（子会话强制）')
    await expect(card.locator('.xc-tags .chip', { hasText: 'review' }).first(), '技能 chip').toBeVisible()
    await expect(card.locator('.xc-tags .chip.tool', { hasText: 'grep' }).first(), '白名单 chip').toBeVisible()
    await expect(card.locator('.xc-foot'), '页脚更新时间（YYYY-MM-DD 形态）').toContainText(/更新于 \d{4}-\d{2}-\d{2}/)
    await expect(page.locator(FOOTER), '面板页脚计数形态').toContainText('位专家 · 显示')
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad step-2 error-state：list 故障 → ErrorBar+重试；恢复后网格回归', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-panel-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const session: PanelSession = { page: launched.page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
  try {
    const { page } = session
    await registerProject(page, wsDir, 'xsq-panel-fixture')
    await dismissOnboardingModals(page)
    // 取数故障注入：list 拒绝（页面上下文内 fetch 包装——scheme 兼容）
    await injectListStub(page, 'error')
    await page.locator(PANEL_ROW).click()
    const errorbar = page.locator(ERRORBAR)
    await expect(errorbar, '错误条呈现（role=alert）').toBeVisible({ timeout: 30_000 })
    await expect(errorbar, '错误信息在场').toContainText('专家目录扫描失败')
    await expect(page.locator(EMPTY), '错误态禁落空态分支').toHaveCount(0)
    const retry = errorbar.getByRole('button', { name: '重试' })
    await expect(retry, '重试钮在场').toBeVisible()
    // 解除注入（对称还原）→ 重试恢复
    await restoreListStub(page)
    await retry.click()
    await expect(page.locator(cardOf('test-reviewer')), '重试后网格恢复').toBeVisible({ timeout: 30_000 })
    await expect(errorbar, '错误条退场').toHaveCount(0)
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad step-2 empty-state：list 空 → 建档引导空态 + 页脚 0 位专家', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-panel-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const session: PanelSession = { page: launched.page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
  try {
    const { page } = session
    await registerProject(page, wsDir, 'xsq-panel-fixture')
    await dismissOnboardingModals(page)
    // 零专家注入：list 返回空数组（真机零目录形态的等价通道——页面上下文内 fetch 包装）
    await injectListStub(page, 'empty')
    await page.locator(PANEL_ROW).click()
    const empty = page.locator(EMPTY)
    await expect(empty, '建档引导空态呈现').toBeVisible({ timeout: 30_000 })
    await expect(empty, '零专家引导文案').toContainText('还没有专家')
    await expect(empty, 'HR 招募引导').toContainText('招募一个专家')
    await expect(page.locator(FOOTER), '页脚 0 位专家').toContainText('0 位专家')
    await restoreListStub(page)
  } finally {
    await closeSession(session)
  }
})

// ── step-3-search-filter ──

test('@feature expert-squad step-3 success：搜索即时过滤（技能命中恰一）+ 页脚同步 + 清词恢复', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const before = await page.locator(CARD_ANY).count()
    expect(before, '过滤前多卡在场（夹具 ≥2 + 内置）').toBeGreaterThanOrEqual(2)
    await page.locator(SEARCH).fill('tsc') // 恰命中 test-reviewer（skills 含 tsc）
    await expect(page.locator(cardOf('test-reviewer')), '命中卡保留').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(cardOf('data-miner')), '非命中卡移除').toHaveCount(0)
    expect(await page.locator(CARD_ANY).count(), '过滤后恰一卡').toBe(1)
    await expect(page.locator(FOOTER), '页脚「显示」数同步').toContainText('显示 1')
    // 投影语义：清词恢复全量
    await page.locator(SEARCH).fill('')
    await expect(page.locator(CARD_ANY), '清词恢复全量').toHaveCount(before, { timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad step-3 no-match：无命中 → 「无匹配专家」空态；清词恢复', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await page.locator(SEARCH).fill('zzz-no-such-expert')
    const empty = page.locator(EMPTY)
    await expect(empty, '无匹配空态呈现').toBeVisible({ timeout: 10_000 })
    await expect(empty, '无匹配文案（非零专家引导）').toContainText('无匹配专家')
    await expect(page.locator(FOOTER), '页脚显示 0').toContainText('显示 0')
    await page.locator(SEARCH).fill('')
    await expect(page.locator(cardOf('test-reviewer')), '清词恢复').toBeVisible({ timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

// ── step-4-status-filter ──

test('@feature expert-squad step-4：禁用专家 → 降透明形态；启用/禁用过滤各自恰其集', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 启停通道（面板同款 fetch 桥）：workspace 参数取自面板真实 list 请求（D4 同参）
    const wsParam = await captureWorkspaceParam(page)
    const disable = await page.evaluate(async ({ ep, payload }) => {
      const response = await fetch(`/api/expert-squad/${ep}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: response.ok, status: response.status }
    }, { ep: 'disable', payload: { workspace: wsParam, key: 'data-miner' } })
    expect(disable.ok, `disable 通道成功（HTTP ${disable.status}）`).toBe(true)
    // 轮询收敛（5s 轻轮询兜底）：全量视图禁用卡降透明形态三位一体
    const disabledCard = page.locator(cardOf('data-miner'))
    await expect
      .poll(async () => (await disabledCard.getAttribute('class'))?.includes('off') === true, {
        timeout: 30_000,
        message: '禁用卡降透明（.off）',
      })
      .toBe(true)
    await expect(disabledCard.locator('.dot.off'), '状态灯 off').toBeVisible()
    await expect(disabledCard.locator('.xc-title'), '岗位附「· 已禁用」').toContainText('· 已禁用')
    // 启用过滤：禁用卡移除
    await page.locator(statusSelect).selectOption('enabled')
    await expect(disabledCard, '启用过滤剔除禁用卡').toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator(cardOf('test-reviewer')), '启用卡保留').toBeVisible()
    await expect(page.locator(statusSelect), '选中值·enabled').toHaveAttribute('data-status', 'enabled')
    // 禁用过滤：恰禁用卡
    await page.locator(statusSelect).selectOption('disabled')
    await expect(disabledCard, '禁用过滤呈现禁用卡').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(cardOf('test-reviewer')), '启用卡剔除').toHaveCount(0)
    // 切回全部：禁用卡降透明在场（档案不消失）
    await page.locator(statusSelect).selectOption('all')
    await expect(disabledCard, '全量视图禁用卡在场').toBeVisible({ timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

// ── step-5-filter-compose-recover ──

test('@feature expert-squad step-5 success：搜索×状态 AND 叠加；清除恢复全量', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const total = await page.locator(CARD_ANY).count()
    // 叠加：关键词（恰命中 test-reviewer）× 启用 → 恰一
    await page.locator(SEARCH).fill('tsc')
    await page.locator(statusSelect).selectOption('enabled')
    await expect(page.locator(cardOf('test-reviewer')), 'AND 叠加命中卡').toBeVisible({ timeout: 10_000 })
    expect(await page.locator(CARD_ANY).count(), '叠加期恰一卡').toBe(1)
    // 清除：恢复全量与「全部」选中态
    await page.locator(SEARCH).fill('')
    await page.locator(statusSelect).selectOption('all')
    await expect(page.locator(CARD_ANY), '清除恢复全量（无残留过滤态）').toHaveCount(total, { timeout: 10_000 })
    await expect(page.locator(statusSelect), '「全部」选中态').toHaveAttribute('data-status', 'all')
  } finally {
    await closeSession(session)
  }
})

// ── step-6 同键聚组展示（1.60 用户裁决：组容器 + 生效标 + 来源角标） ──

test('@feature expert-squad step-6 grouped：聚组容器 + 生效卡「生效」标 + 来源角标（单来源组与普通卡同形）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 夹具为 project 层单来源：每键一组，组内生效卡带「生效」标与「项目」角标
    for (const key of ['test-reviewer', 'data-miner']) {
      const group = page.locator(groupOf(key))
      await expect(group, `组容器·${key}`).toBeVisible()
      const card = group.locator(cardOf(key))
      await expect(card, `生效位锚·${key}`).toHaveAttribute('data-effective', 'true')
      await expect(card.locator('.eff-badge'), `「生效」标·${key}`).toHaveText('生效')
      await expect(card.locator('.origin-badge.origin-project'), `来源角标·项目·${key}`).toHaveText('项目')
      await expect(group.locator('.dswf-xshadow'), `单来源组无被遮蔽行·${key}`).toHaveCount(0)
      await expect(group.locator('.xg-spread'), `单来源组无对比钮·${key}`).toHaveCount(0)
    }
    // 页脚计数按专家键数（夹具 2 键 + 内置键，均为单来源）
    await expect(page.locator(FOOTER), '计数按专家键数形态不变').toContainText('位专家 · 显示')
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——happy path 全程依序） ──

test('@feature expert-squad 冒烟：激活 → 网格字段页脚 → 搜索 → 状态过滤 → 清除恢复', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 步骤2：字段与页脚（步骤1 激活已在 openPanelWithFixture 依序完成）
    await expect(page.locator(cardOf('data-miner')).locator('.xc-name')).toHaveText('data-miner')
    await expect(page.locator(FOOTER)).toContainText('位专家 · 显示')
    // 步骤3：搜索
    await page.locator(SEARCH).fill('mining')
    await expect(page.locator(cardOf('data-miner'))).toBeVisible({ timeout: 10_000 })
    await expect(page.locator(cardOf('test-reviewer'))).toHaveCount(0)
    // 步骤4：状态筛选（搜索命中者仍启用 → AND 叠加保留）
    await page.locator(statusSelect).selectOption('enabled')
    await expect(page.locator(cardOf('data-miner')), 'AND 叠加（搜索×启用）保留').toBeVisible({ timeout: 10_000 })
    // 步骤5：清除恢复
    await page.locator(SEARCH).fill('')
    await page.locator(statusSelect).selectOption('all')
    await expect(page.locator(cardOf('test-reviewer')), '恢复全量').toBeVisible({ timeout: 10_000 })
    // 不变量：页脚显示数 = 网格行数；renderer 零未捕获异常
    const shown = (await page.locator(FOOTER).innerText()).match(/显示 (\d+)/)?.[1]
    expect(Number(shown), '页脚显示数 = 网格行数').toBe(await page.locator(CARD_ANY).count())
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
