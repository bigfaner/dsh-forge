// expert-squad fix-5 旅程 e2e：专家详情 Dialog 查看/编辑双模式（ui-design F2）真机取证——
// journey = .forge/docs/features/expert-squad/testing/panel-detail-dialog/journey.md
// contracts = 同目录 contracts/step-1..6（每 Outcome 一测试 + 一条 happy-path 冒烟）。
// 打开动线：launchHost 隔离 profile → 夹具工作区（.dsh/experts/ 档案，人设含 Markdown 记号）
// → 左栏 panellist 行「专家团」→ main keyed 'expert-squad' 面板 → 点击卡片开 Dialog。
// data 锚（detail-dialog.tsx / expert-panel.tsx 事实表）：Dialog 覆盖层
// .dswf-dlg-overlay[data-dswf-detail-dialog] > .dswf-dlg[role=dialog]；查看态分段
// .dswf-dlg-meta/.dswf-dlg-seg/.dswf-dlg-md/.dswf-dlg-chips；编辑态字段
// input[aria-label=岗位] / textarea[aria-label=简介|人设] / .dswf-msel[data-msel=tools|skills]；
// 错误 .dswf-dlg-err；Toast .dswf-toast[role=status]；卡 .dswf-xcard[data-expert-key]。
// 拦截纪律（fix-3 判例）：一律 addInitScript / 页面上下文内包装 window.fetch（禁 page.route
// ——dsh-forge:// scheme 下 route 不生效）；update/enable/disable 失败注入经包装器
// __xsqStubMode 运行期开关；请求捕获（update 载荷）走同包装器缓冲 + expect.poll。
// Hard Rules：零产品源码改动（断言失败 → 归因上报）；夹具 = 仓外 tmp；断言对齐
// ui-design.md F2 与 tech-design §10.4 真机结算门，不编造断言。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

// ── Dialog/面板锚（detail-dialog.tsx data 锚——本 spec 字面量单源） ──
const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`
const OVERLAY = '.dswf-dlg-overlay[data-dswf-detail-dialog]'
const DIALOG = '.dswf-dlg[role="dialog"]'
const dlgBtn = (name: string): string => `${DIALOG} button:has-text("${name}")`
const FIELD_TITLE = `${DIALOG} input[aria-label="岗位"]`
const FIELD_DESC = `${DIALOG} textarea[aria-label="简介"]`
const FIELD_PERSONA = `${DIALOG} textarea[aria-label="人设"]`
const FIELD_ADD_SKILL = `${DIALOG} input[aria-label="新增技能"]`
const ERR = `${DIALOG} .dswf-dlg-err`
const TOAST = '.dswf-toast[role="status"]'
const mselChip = (field: string, value: string): string =>
  `${DIALOG} .dswf-msel[data-msel="${field}"] .chip[data-msel-chip="${value}"]`

const KEY = 'test-reviewer'
const OTHER_KEY = 'data-miner'

// ── fetch 包装器（addInitScript 注入——页面加载前后幂等；scheme 无关拦截单源） ──
const HARNESS_SOURCE = `(() => {
  const w = window
  if (w.__xsqHarnessInstalled) return
  w.__xsqHarnessInstalled = true
  w.__xsqCalls = []
  w.__xsqStubMode = null
  const original = w.fetch.bind(w)
  w.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
    if (String(url).includes('/api/expert-squad/')) {
      w.__xsqCalls.push({ url: String(url), method: String(init?.method ?? 'GET').toUpperCase(), body: typeof init?.body === 'string' ? init.body : '' })
      const mode = w.__xsqStubMode
      if (mode === 'update-fail' && url.includes('/update')) {
        return new Response('xsq e2e stub: update rejected', { status: 500 })
      }
      if (mode === 'toggle-fail' && (url.includes('/enable') || url.includes('/disable'))) {
        return new Response('xsq e2e stub: toggle rejected', { status: 500 })
      }
    }
    return original(input, init)
  }
})()`

interface XsqCall {
  readonly url: string
  readonly method: string
  readonly body: string
}

interface XsqWin {
  readonly __xsqCalls?: XsqCall[]
  __xsqStubMode?: string | null
  readonly __xsqHarnessInstalled?: boolean
}

/** fetch 包装器安装：addInitScript（AC 硬规则）+ 已加载页面的幂等 evaluate 兜底。 */
async function installFetchHarness(page: Page): Promise<void> {
  await page.addInitScript(HARNESS_SOURCE)
  await page.evaluate(HARNESS_SOURCE)
}

/** 注入开关：'update-fail' | 'toggle-fail' | null（null = 全部放行）。 */
async function setStubMode(page: Page, mode: 'update-fail' | 'toggle-fail' | null): Promise<void> {
  await page.evaluate((m) => {
    ;(window as unknown as XsqWin).__xsqStubMode = m
  }, mode)
}

/** 捕获缓冲轮询：取最近一条命中子串的请求（expect.poll 消除读取时机竞态——fix-3 判例）。 */
async function capturedCall(page: Page, substr: string): Promise<XsqCall> {
  let hit: XsqCall | undefined
  await expect
    .poll(
      async () => {
        const calls = await page.evaluate(() => [...((window as unknown as XsqWin).__xsqCalls ?? [])])
        hit = calls.reverse().find((call) => call.url.includes(substr))
        return hit
      },
      { timeout: 30_000, message: `捕获缓冲出现 ${substr} 请求` },
    )
    .toBeTruthy()
  if (hit === undefined) throw new Error(`捕获缓冲无 ${substr} 请求`)
  return hit
}

/** 面板真实 list 请求的 workspace 参数（启停通道同参——D4 取值一致性）。 */
async function captureWorkspaceParam(page: Page): Promise<string> {
  const list = await capturedCall(page, '/api/expert-squad/list')
  const match = /workspace=([^&]+)/.exec(list.url)
  if (match === null) throw new Error(`list 请求缺 workspace 参数：${list.url}`)
  return decodeURIComponent(match[1])
}

/** project 层夹具专家档案（人设含 Markdown 记号四件套：标题/加粗/行内代码/列表） */
function expertMd(name: string, title: string, skills: string[]): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for panel-detail e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    `skills: [${skills.join(', ')}]`,
    '---',
    '',
    '## 职责',
    '',
    '**严格**评审每一处变更，优先跑 `tsc` 与单测。',
    '',
    '- 逐条核对 AC',
    '- 拒绝空岗位档案',
    '',
  ].join('\n')
}

/** 夹具工作区（两份启用 project 层档案） */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-detail-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, '夹具评审', ['review', 'tsc']))
  writeFileSync(join(expertsDir, `${OTHER_KEY}.md`), expertMd(OTHER_KEY, '夹具挖掘', ['sql', 'mining']))
  return dir
}

interface PanelSession {
  readonly page: Page
  readonly app: ElectronApplication
  readonly pageErrors: string[]
  readonly wsDir: string
  readonly userData: string
}

/** 启动 → 注册夹具工作区 → 激活面板（数据态收敛，fetch 包装器已装）。 */
async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-detail-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-detail-fixture')
  await dismissOnboardingModals(page)
  await installFetchHarness(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（panellist 注册缝）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态（骨架收敛）').toBeVisible({ timeout: 30_000 })
  return { page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
}

/** 点击卡片打开详情 Dialog（查看态收敛）。 */
async function openDetail(page: Page, key: string): Promise<void> {
  await page.locator(cardOf(key)).click()
  await expect(page.locator(OVERLAY), 'Dialog 覆盖层呈现').toBeVisible({ timeout: 10_000 })
  await expect(page.locator(DIALOG), 'Dialog 打开（查看态头部）').toContainText(key)
}

/** 例终收口：closeApp + tmp 夹具清理（尽力而为）。 */
async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeSessionApp(session.app)
  } catch {
    /* closeApp 尽力而为——进程残留由 Job Object 整树回收兜底 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

async function closeSessionApp(app: ElectronApplication): Promise<void> {
  await closeApp(app)
}

// ── step-1-open-dialog ──

test('@feature expert-squad dlg step-1 success：点卡开 Dialog——查看态头部（灯on/名称/标识chip/编辑/✕）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    const head = page.locator('.dswf-dlg-head')
    await expect(head.locator('.dot.on'), '启用状态灯 on').toBeVisible()
    await expect(head.locator('.dswf-dlg-name'), '名称 ← name').toHaveText(KEY)
    await expect(head.locator('.chip.tool'), '英文标识 chip ← name（等宽正本）').toHaveText(KEY)
    await expect(page.locator(dlgBtn('编辑')), '编辑钮（查看态）').toBeVisible()
    await expect(page.locator(`${DIALOG} button[aria-label="关闭"]`), '✕ 关闭钮').toBeVisible()
    await expect(page.locator(cardOf(KEY)), '背后卡片网格仍在场').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-1 disabled-expert：禁用专家开详情——灯off/已禁用meta/启用钮', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 前置：经面板同款启停通道禁用 data-miner（workspace 参数取自真实 list 请求——D4 同参）
    const wsParam = await captureWorkspaceParam(page)
    const disable = await page.evaluate(async ({ ep, payload }) => {
      const response = await fetch(`/api/expert-squad/${ep}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return { ok: response.ok, status: response.status }
    }, { ep: 'disable', payload: { workspace: wsParam, key: OTHER_KEY } })
    expect(disable.ok, `disable 通道成功（HTTP ${disable.status}）`).toBe(true)
    await expect
      .poll(async () => (await page.locator(cardOf(OTHER_KEY)).getAttribute('class'))?.includes('off') === true, {
        timeout: 30_000,
        message: '禁用卡降透明（.off）',
      })
      .toBe(true)
    // 打开禁用专家详情
    await openDetail(page, OTHER_KEY)
    await expect(page.locator('.dswf-dlg-head .dot.off'), '状态灯 off').toBeVisible()
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta「已禁用」').toContainText('已禁用')
    await expect(page.locator(dlgBtn('启用')), '底部钮呈 [启用]').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

// Outcomes: no-dialog-for-missed-key（step-1 推断项）——键缺席防护为 onCardActivate
// 回调内部契约（键查列表不命中则 open 不触发），真机 UI 无触发通道（卡片恒出自列表），
// 真机取证不可达——契约层保留，不落脚本（run-tests 台账注记）。

// ── step-2-view-render ──

test('@feature expert-squad dlg step-2 success：查看态五段渲染（meta→简介→人设→工具chips→技能chips）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    const segs = page.locator('.dswf-dlg-seg')
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 岗位·启用中').toContainText('夹具评审 · 启用中')
    await expect(segs.nth(0), '段标·简介').toHaveText('简介（何时委派我）')
    await expect(page.locator('.dswf-dlg-meta').nth(1), '简介文本 ← description').toContainText('Fixture expert for panel-detail')
    await expect(segs.nth(1), '段标·人设').toHaveText('人设（Persona · 派发时注入子会话）')
    await expect(segs.nth(2), '段标·工具白名单').toHaveText('工具白名单（子会话强制生效）')
    await expect(page.locator(`${DIALOG} .dswf-dlg-chips .chip.tool`), '工具 chips').toContainText(['read', 'grep'])
    await expect(segs.nth(3), '段标·技能标签').toHaveText('技能标签')
    // frontmatter 技术细节不外露
    const bodyText = await page.locator(`${DIALOG} .dswf-dlg-body`).innerText()
    expect(bodyText.includes('frontmatter'), '零 frontmatter 字样外露').toBe(false)
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-2 markdown-render：人设分块渲染——标题/加粗/行内代码/列表且记号不外露', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    const md = page.locator('.dswf-dlg-md')
    await expect(md.locator('.dswf-dlg-md-h'), '标题块（## 剥离）').toHaveText('职责')
    await expect(md.locator('strong'), '加粗（** 剥离）').toContainText('严格')
    await expect(md.locator('code'), '行内代码（反引号剥离）').toHaveText('tsc')
    await expect(md.locator('ul li'), '列表项（- 剥离）').toContainText(['逐条核对 AC', '拒绝空岗位档案'])
    const raw = await md.innerText()
    expect(raw.includes('##'), '零 # 记号外露').toBe(false)
    expect(raw.includes('**'), '零 ** 记号外露').toBe(false)
  } finally {
    await closeSession(session)
  }
})

// Outcomes: disabled-meta（step-2）已并入 step-1 disabled-expert 取证（同一呈现面：
// 灯 off + meta「已禁用」+ 启用钮——避免同屏重复真机跑批）。

// ── step-3-start-edit ──

test('@feature expert-squad dlg step-3 success：编辑态字段集预填（工具上技能下；name 不可改）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    // 字段预填
    await expect(page.locator(FIELD_TITLE), '岗位 Input ← title').toHaveValue('夹具评审')
    await expect(page.locator(FIELD_DESC), '简介 textarea 预填（rows=1）').toHaveValue(/Fixture expert/)
    expect(await page.locator(FIELD_DESC).getAttribute('maxlength'), '简介 maxLength=120').toBe('120')
    await expect(page.locator(FIELD_PERSONA), '人设 textarea 预填（rows=6）').toHaveValue(/职责/)
    // 工具白名单 multi-select：已选 chips + 固定候选清单
    await expect(page.locator(mselChip('tools', 'read')), '已选工具 chip·read').toBeVisible()
    await expect(page.locator(mselChip('tools', 'grep')), '已选工具 chip·grep').toBeVisible()
    const toolRows = page.locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`)
    expect(await toolRows.count(), '工具候选=固定清单 6 项').toBe(6)
    // 技能 multi-select：已选 chips + 新增输入框
    await expect(page.locator(mselChip('skills', 'review')), '已选技能 chip·review').toBeVisible()
    await expect(page.locator(FIELD_ADD_SKILL), '技能新增输入框在场').toBeVisible()
    // 统一排序：工具在上、技能在下
    const toolY = (await page.locator(`${DIALOG} .dswf-msel[data-msel="tools"]`).boundingBox())?.y ?? 0
    const skillY = (await page.locator(`${DIALOG} .dswf-msel[data-msel="skills"]`).boundingBox())?.y ?? 0
    expect(toolY, '工具段在技能段上方').toBeLessThan(skillY)
    // name 不可改：编辑态无英文标识输入位
    await expect(page.locator(`${DIALOG} [aria-label="英文标识"]`), '零 name 输入位').toHaveCount(0)
    await expect(page.locator(dlgBtn('保存')), '头部钮变 [保存]').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-3 skill-add-local：技能新增入草稿（未保存零请求零档案变更）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_ADD_SKILL).fill('rust-lint')
    await page.locator(FIELD_ADD_SKILL).press('Enter')
    await expect(page.locator(mselChip('skills', 'rust-lint')), '新值即入已选 chips').toBeVisible()
    await expect(page.locator(FIELD_ADD_SKILL), '输入框清空').toHaveValue('')
    // 草稿态：未保存前零 update 请求、背后卡片不变
    const calls = await page.evaluate(() => [...((window as unknown as XsqWin).__xsqCalls ?? [])])
    expect(calls.filter((call) => call.url.includes('/update')), '未保存零 update 请求').toHaveLength(0)
    await expect(page.locator(cardOf(KEY)), '背后卡片不变').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-3 cancel-discard：编辑修改后关闭重开——档案现值（草稿零持久化）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('草稿未保存岗位')
    await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
    await expect(page.locator(OVERLAY), 'Dialog 退场').toHaveCount(0)
    await openDetail(page, KEY)
    await expect(page.locator('.dswf-dlg-meta').first(), '重开呈档案原值').toContainText('夹具评审 · 启用中')
    await expect(page.locator(dlgBtn('编辑')), '重开为查看态').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

// ── step-4-save-update ──

test('@feature expert-squad dlg step-4 success：保存落盘——update载荷/换新回查看态/Toast/卡片即时同步', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    // 修改：岗位 + 勾选新工具 bash
    await page.locator(FIELD_TITLE).fill('夹具评审·复核')
    await page.locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`, { hasText: 'bash' }).locator('input').check()
    await page.locator(dlgBtn('保存')).click()
    // update 载荷捕获（name 键定址 + 新值在 body）
    const update = await capturedCall(page, '/api/expert-squad/update')
    expect(update.method, 'update 为 POST').toBe('POST')
    const body = JSON.parse(update.body) as { name?: string; title?: string; tools?: string[] }
    expect(body.name, '请求体 name = 键正本').toBe(KEY)
    expect(body.title, '请求体携带新岗位').toBe('夹具评审·复核')
    expect(body.tools, '请求体携带勾选后的工具集').toContain('bash')
    // 回查看态：新值呈现 + Toast 热刷新
    await expect(page.locator(dlgBtn('编辑')), '头部钮回 [编辑]（查看态）').toBeVisible()
    await expect(page.locator('.dswf-dlg-meta').first(), '查看态换新呈现新岗位').toContainText('夹具评审·复核')
    await expect(page.locator(TOAST), 'Toast 热刷新生效').toContainText('热刷新生效')
    // 背后列表卡片即时同步（patchEntry，不待轮询）
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '卡片岗位同步新值').toHaveText('夹具评审·复核', { timeout: 10_000 })
    await expect(page.locator(`${cardOf(KEY)} .xc-tags .chip.tool`, { hasText: 'bash' }).first(), '卡片工具 chip 同步').toBeVisible()
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-4 validation-empty-title：空岗位字段级报错——零请求零落盘', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('   ')
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(ERR), '字段级错误呈现').toHaveText('岗位不能为空')
    await expect(page.locator(dlgBtn('保存')), '停留编辑态').toBeVisible()
    const calls = await page.evaluate(() => [...((window as unknown as XsqWin).__xsqCalls ?? [])])
    expect(calls.filter((call) => call.url.includes('/update')), 'update 请求零发出').toHaveLength(0)
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '背后卡片不变').toHaveText('夹具评审')
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-4 validation-bare-mustache：人设裸 {{ 拒绝——零请求零落盘', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_PERSONA).fill('合法开头 {{ 非法占位')
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(ERR), '字段级错误呈现').toContainText('人设含裸')
    await expect(page.locator(dlgBtn('保存')), '停留编辑态').toBeVisible()
    const calls = await page.evaluate(() => [...((window as unknown as XsqWin).__xsqCalls ?? [])])
    expect(calls.filter((call) => call.url.includes('/update')), 'update 请求零发出').toHaveLength(0)
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-4 update-failure：通道拒绝——停留编辑态/Toast保存失败/两侧不变', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('将失败的新岗位')
    await setStubMode(page, 'update-fail')
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(TOAST), 'Toast 保存失败透出').toContainText('保存失败')
    await expect(page.locator(dlgBtn('保存')), '停留编辑态').toBeVisible()
    await expect(page.locator(FIELD_TITLE), '草稿保留').toHaveValue('将失败的新岗位')
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '背后卡片不变').toHaveText('夹具评审')
    // 修正通道：解除注入再保存 → success 语义
    await setStubMode(page, null)
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(dlgBtn('编辑')), '修正后保存成功回查看态').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '卡片同步新值').toHaveText('将失败的新岗位', { timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-4 description-limit：简介 120 字硬限截断', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_DESC).fill('长'.repeat(130))
    expect((await page.locator(FIELD_DESC).inputValue()).length, '输入截断至 120 字').toBe(120)
  } finally {
    await closeSession(session)
  }
})

// ── step-5-toggle-enabled ──

test('@feature expert-squad dlg step-5 disable-success：底部禁用即时生效——灯/meta/按钮/卡片四位同步', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('禁用')).click()
    const disable = await capturedCall(page, '/api/expert-squad/disable')
    expect(JSON.parse(disable.body) as { key?: string }, 'disable 以 key=name 键定址').toEqual({ key: KEY })
    await expect(page.locator('.dswf-dlg-head .dot.off'), '头部灯变 off').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 变已禁用').toContainText('已禁用')
    await expect(page.locator(dlgBtn('启用')), '底部钮变 [启用]').toBeVisible()
    await expect(page.locator(TOAST), 'Toast 已禁用').toContainText(`${KEY} 已禁用`)
    await expect(page.locator(cardOf(KEY)), '背后卡片即时降透明').toHaveClass(/off/, { timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-5 enable-success：再启用对称恢复——四位归位', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 前置：先经 Dialog 禁用
    await openDetail(page, KEY)
    await page.locator(dlgBtn('禁用')).click()
    await expect(page.locator(dlgBtn('启用')), '禁用生效').toBeVisible({ timeout: 10_000 })
    // 再启用
    await page.locator(dlgBtn('启用')).click()
    await capturedCall(page, '/api/expert-squad/enable')
    await expect(page.locator('.dswf-dlg-head .dot.on'), '头部灯回 on').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 回启用中').toContainText('启用中')
    await expect(page.locator(dlgBtn('禁用')), '底部钮回 [禁用]').toBeVisible()
    await expect(page.locator(TOAST), 'Toast 已启用').toContainText(`${KEY} 已启用`)
    await expect(page.locator(cardOf(KEY)), '背后卡片恢复常态').not.toHaveClass(/off/, { timeout: 10_000 })
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-5 toggle-failure：通道拒绝——四位均不变 + Toast 启停失败', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await setStubMode(page, 'toggle-fail')
    await page.locator(dlgBtn('禁用')).click()
    await expect(page.locator(TOAST), 'Toast 启停失败透出').toContainText('启停失败')
    await expect(page.locator('.dswf-dlg-head .dot.on'), '灯不变（on）').toBeVisible()
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 不变（启用中）').toContainText('启用中')
    await expect(page.locator(dlgBtn('禁用')), '按钮不变（busy 退出）').toBeEnabled()
    await expect(page.locator(cardOf(KEY)), '背后卡片不变').not.toHaveClass(/off/)
    await setStubMode(page, null)
  } finally {
    await closeSession(session)
  }
})

// ── step-6-close-restore ──

test('@feature expert-squad dlg step-6 close-x：✕ 关闭——退场且列表原状恢复', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    const total = await page.locator(CARD_ANY).count()
    await openDetail(page, KEY)
    await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
    await expect(page.locator(OVERLAY), '覆盖层退场').toHaveCount(0)
    await expect(page.locator(CARD_ANY), '列表原状恢复').toHaveCount(total)
    const calls = await page.evaluate(() => [...((window as unknown as XsqWin).__xsqCalls ?? [])])
    expect(
      calls.filter((call) => call.url.includes('/update') || call.url.includes('/enable') || call.url.includes('/disable')),
      '关闭零变更请求',
    ).toHaveLength(0)
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-6 close-esc：Esc 关闭（编辑态草稿丢弃——重开呈档案现值）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('Esc 丢弃草稿')
    await page.keyboard.press('Escape')
    await expect(page.locator(OVERLAY), 'Esc 关闭退场').toHaveCount(0)
    await openDetail(page, KEY)
    await expect(page.locator('.dswf-dlg-meta').first(), '重开呈档案原值（草稿丢弃）').toContainText('夹具评审 · 启用中')
  } finally {
    await closeSession(session)
  }
})

test('@feature expert-squad dlg step-6 close-overlay：遮罩点击关闭；Dialog 内部点击零误关', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await openDetail(page, KEY)
    // 内部点击：不误关
    await page.locator('.dswf-dlg-name').click()
    await expect(page.locator(OVERLAY), '内部点击不关闭').toBeVisible()
    // 遮罩点击：关闭
    await page.locator(OVERLAY).click({ position: { x: 8, y: 8 } })
    await expect(page.locator(OVERLAY), '遮罩点击关闭').toHaveCount(0)
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——happy path 全程依序） ──

test('@feature expert-squad dlg 冒烟：开Dialog→查看分段→编辑保存→Toast+卡片同步→禁用→关闭恢复', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 步骤1-2：开 Dialog + 查看态分段
    await openDetail(page, KEY)
    await expect(page.locator('.dswf-dlg-md .dswf-dlg-md-h')).toHaveText('职责')
    // 步骤3-4：编辑 → 修改岗位与简介 → 保存
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('冒烟复核岗')
    await page.locator(FIELD_DESC).fill('冒烟旅程简介：何时委派我。')
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(dlgBtn('编辑')), '保存后回查看态').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(TOAST), 'Toast 热刷新生效').toContainText('热刷新生效')
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '卡片同步新岗位').toHaveText('冒烟复核岗', { timeout: 10_000 })
    // 步骤5：禁用（四位同步）
    await page.locator(dlgBtn('禁用')).click()
    await expect(page.locator('.dswf-dlg-head .dot.off'), '灯变 off').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(cardOf(KEY)), '卡片降透明').toHaveClass(/off/, { timeout: 10_000 })
    // 步骤6：✕ 关闭恢复列表
    await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
    await expect(page.locator(OVERLAY), 'Dialog 退场').toHaveCount(0)
    await expect(page.locator(cardOf(KEY)), '禁用卡降透明在场（档案不消失）').toBeVisible()
    await expect(page.locator(cardOf(OTHER_KEY)), '其余卡片原状').toBeVisible()
    // 不变量：renderer 零未捕获异常
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
