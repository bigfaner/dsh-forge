// expert-squad fix-5 旅程 e2e：专家详情 Dialog 查看/编辑双模式（ui-design F2）真机取证——
// journey = .forge/docs/features/expert-squad/testing/panel-detail-dialog/journey.md
// contracts = 同目录 contracts/step-1..6。
// e2e-fast-shared-launch 试点迁移（1.3）：共享 launch fixture（e2e/support/fixtures.js B2 形态
// ——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑）+ 用例价值
// 审计（审计对账表 = .forge/docs/proposals/e2e-fast-shared-launch/audit-panel-detail.md）：
//  - 退役 4 例（纯文案/label/静态渲染断言，unit 覆盖无真空）：step-2 success（查看态五段
//    渲染）、step-2 markdown-render（Markdown 分块渲染）、step-3 success（编辑态预填/排序/
//    目录候选静态面）、step-4 description-limit（maxlength=120 属性）。
//  - 保留 16 例（行为/语义/写径断言——保存落盘、来源分流、启停写径、失败路径、关闭交互、
//    真机宿主目录透出）。
// 打开动线：共享 launch 隔离 profile → 夹具工作区（.dsh/experts/ 档案，重播种复位）→ 左栏
// panellist 行「专家团」→ main keyed 'expert-squad' 面板 → 点击卡片开 Dialog。
// data 锚（detail-dialog.tsx / expert-panel.tsx 事实表）：Dialog 覆盖层
// .dswf-dlg-overlay[data-dswf-detail-dialog] > .dswf-dlg[role=dialog]；编辑态字段
// input[aria-label=岗位] / textarea[aria-label=简介|人设] / .dswf-msel[data-msel=tools|skills]；
// 错误 .dswf-dlg-err；Toast .dswf-toast[role=status]；卡 .dswf-xcard[data-expert-key]。
// 拦截纪律（fix-3 判例）：一律 addInitScript / 页面上下文内包装 window.fetch（禁 page.route
// ——dsh-forge:// scheme 下 route 不生效）；update 失败注入经包装器 __xsqStubMode 运行期
// 开关；请求捕获（update 载荷）走同包装器缓冲 + expect.poll（缓冲每用例重置——共享会话
// 跨用例残留防串味）。
// Hard Rules：零产品源码改动（断言失败 → 归因上报）；夹具 = 仓外 tmp；断言对齐
// ui-design.md F2 与 tech-design §10.4 真机结算门，不编造断言。
// @feature expert-squad @web-e2e
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../support/launch.js'
import { backupTrackedFile, createSharedLaunchFixture, restoreTrackedFile } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

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
        w.__xsqStubMode = null // 一次性注入：仅首个 update 失败，随后移除——修正后保存走真实通道
        return new Response('xsq e2e stub: update rejected', { status: 500 })
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
async function installXsqHarness(page: Page): Promise<void> {
  await page.addInitScript(HARNESS_SOURCE)
  await page.evaluate(HARNESS_SOURCE)
}

/** 捕获缓冲重置（共享会话跨用例残留防串味——「零请求」断言只看本用例发出面）。 */
async function resetXsqHarness(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __xsqCalls?: unknown[]; __xsqStubMode?: string | null }
    if (Array.isArray(w.__xsqCalls)) w.__xsqCalls.length = 0
    w.__xsqStubMode = null
  })
}

/** 注入开关：'update-fail' | null（null = 全部放行；启停新写径无 fetch 注错通道——见 step-5 注记）。 */
async function setStubMode(page: Page, mode: 'update-fail' | null): Promise<void> {
  await page.evaluate((m) => {
    ;(window as unknown as XsqWin).__xsqStubMode = m
  }, mode)
}

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
const mselBox = (field: string): string =>
  `${DIALOG} .dswf-msel[data-msel="${field}"] .dswf-msel-box`

const KEY = 'test-reviewer'
const OTHER_KEY = 'data-miner'

// dev profile patch（experts 配置位写径落盘面——官方 settings 写径落 dev 形态 tracked 文件；
// default-agent-options-panel.spec 同口径：写前备份、finally 逐字还原零残留）
const DEV_PATCH = join(ROOT, 'apps', 'host', 'profile.dev', 'cordis.patch.yml')

/** patch 文件文本（Node 侧直读——experts 配置位落盘实况断言源）。 */
function patchText(): string {
  return readFileSync(DEV_PATCH, 'utf8')
}

// 写径复位（写前备份 + finally 逐字还原零残留）走支撑层单源
// backupTrackedFile / restoreTrackedFile（e2e-fast-shared-launch/1.17 收编）。

// ── 共享 launch fixture（spec 级单次 launchHost；夹具重播种 + crash 自动重启） ──

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

/** 夹具工作区播种（首启/重播种/crash 重启三径统一——夹具档案回基准态） */
function seedWorkspace(dir: string): void {
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${KEY}.md`), expertMd(KEY, '夹具评审', ['review', 'tsc']))
  writeFileSync(join(expertsDir, `${OTHER_KEY}.md`), expertMd(OTHER_KEY, '夹具挖掘', ['sql', 'mining']))
}

const { test } = createSharedLaunchFixture({
  seedWorkspace,
  workspaceName: 'xsq-detail-fixture',
})

// ── 用例内导航辅助 ──

/** fetch 包装器安装 + 捕获缓冲重置（共享会话跨用例残留防串味）+ 面板导航收敛。 */
async function openPanel(page: import('@playwright/test').Page): Promise<void> {
  await installXsqHarness(page)
  await resetXsqHarness(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（panellist 注册缝）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态（骨架收敛）').toBeVisible({ timeout: 30_000 })
}

/** 点击卡片打开详情 Dialog（查看态收敛）。 */
async function openDetail(page: import('@playwright/test').Page, key: string): Promise<void> {
  await page.locator(cardOf(key)).click()
  await expect(page.locator(OVERLAY), 'Dialog 覆盖层呈现').toBeVisible({ timeout: 10_000 })
  await expect(page.locator(DIALOG), 'Dialog 打开（查看态头部）').toContainText(key)
}

/** msel 菜单收起（外点收起——原型语义；head 名称点击 = Dialog 内部安全外区）。 */
async function collapseMsel(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.dswf-dlg-name').click()
  await expect(page.locator(`${DIALOG} .dswf-msel[data-msel-open]`), '菜单已收起').toHaveCount(0)
}

/** 捕获缓冲轮询：取最近一条命中子串的请求（expect.poll 消除读取时机竞态——fix-3 判例）。 */
async function capturedCall(page: import('@playwright/test').Page, substr: string): Promise<XsqCall> {
  let hit: XsqCall | undefined
  await expect
    .poll(
      async () => {
        const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
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
async function captureWorkspaceParam(page: import('@playwright/test').Page): Promise<string> {
  const list = await capturedCall(page, '/api/expert-squad/list')
  const match = /workspace=([^&]+)/.exec(list.url)
  if (match === null) throw new Error(`list 请求缺 workspace 参数：${list.url}`)
  return decodeURIComponent(match[1])
}

// ── step-1-open-dialog ──

test('@feature expert-squad dlg step-1 success：点卡开 Dialog——查看态头部（灯on/名称/编辑/✕）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  const head = page.locator('.dswf-dlg-head')
  await expect(head.locator('.dot.on'), '启用状态灯 on').toBeVisible()
  await expect(head.locator('.dswf-dlg-name'), '名称 ← name').toHaveText(KEY)
  // head 形态收敛（default-routing Dialog 改造）：head-row = icon + 灯 + 名称（英文标识
  // chip 已退役出 head——路由 chips 归 body 首行 data-dswf-dlg-route）
  await expect(page.locator(dlgBtn('编辑')), '编辑钮（查看态）').toBeVisible()
  await expect(page.locator(`${DIALOG} button[aria-label="关闭"]`), '✕ 关闭钮').toBeVisible()
  await expect(page.locator(cardOf(KEY)), '背后卡片网格仍在场').toBeVisible()
})

test('@feature expert-squad dlg step-1 disabled-expert：禁用专家开详情——灯off/已禁用meta/启用钮', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
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
})

// Outcomes: no-dialog-for-missed-key（step-1 推断项）——键缺席防护为 onCardActivate
// 回调内部契约（键查列表不命中则 open 不触发），真机 UI 无触发通道（卡片恒出自列表），
// 真机取证不可达——契约层保留，不落脚本（run-tests 台账注记）。
// 退役（1.3 用例价值审计）：step-2 success（五段渲染）/step-2 markdown-render（Markdown
// 分块）/step-3 success（编辑态预填·排序·目录候选静态面）/step-4 description-limit
// （maxlength=120）——纯文案/label/静态渲染断言，unit 覆盖无真空；逐例对账与 unit 映射见
// .forge/docs/proposals/e2e-fast-shared-launch/audit-panel-detail.md。

// ── 1.78 候选目录读口（candidates）──

test('@feature expert-squad catalog candidates：读口 200——tools 含内置+插件追加、skills 非空（官方目录透出）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  // 打开详情 Dialog → 触发 candidates 探针（懒取时机 = Dialog 打开——目录为注册期
  // 渐增视图，Dialog 期快照即面板下拉消费面）
  await openDetail(page, KEY)
  await capturedCall(page, '/api/expert-squad/candidates')
  const payload = await page.evaluate(async () => {
    const response = await fetch('/api/expert-squad/candidates')
    return { status: response.status, body: (await response.json()) as { tools?: string[]; skills?: string[] } }
  })
  expect(payload.status, 'candidates 读口 200').toBe(200)
  // 目录语义断言（1.78：候选 = 宿主 ToolRuntime schemas() 全局视图，非硬编码六件）。
  // 注记：核心模型工具（read 等）注册于会话 scope 层，不保证出现在全局视图——
  // 真机断言锚 = 目录非空 + 插件追加工具（expert-squad 工具族，apply 期全局注册）
  // + 技能候选非空（官方 skill 目录）。
  let tools: unknown
  await expect
    .poll(
      async () => {
        const response = await page.evaluate(async () => {
          const res = await fetch('/api/expert-squad/candidates')
          return (await res.json()) as { tools?: string[]; skills?: string[] }
        })
        tools = response.tools
        return Array.isArray(tools) && tools.length > 0
      },
      { timeout: 30_000, message: 'candidates 读口目录非空' },
    )
    .toBeTruthy()
  expect(tools, 'tools 含插件追加工具 delegate_expert').toContain('delegate_expert')
  expect(Array.isArray(payload.body.skills), 'skills 字段在场（官方 skill 目录）').toBe(true)
  expect(payload.body.skills?.length ?? 0, 'skills 候选非空').toBeGreaterThanOrEqual(1)
})

// ── step-3-start-edit（草稿语义——保留行为面；预填/排序静态面退役入 unit） ──

test('@feature expert-squad dlg step-3 skill-add-local：技能新增入草稿（未保存零请求零档案变更）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  await page.locator(dlgBtn('编辑')).click()
  await collapseMsel(page)
  await page.locator(mselBox('skills')).click()
  await page.locator(FIELD_ADD_SKILL).fill('rust-lint')
  await page.locator(FIELD_ADD_SKILL).press('Enter')
  await expect(page.locator(mselChip('skills', 'rust-lint')), '新值即入已选 chips').toBeVisible()
  await expect(page.locator(FIELD_ADD_SKILL), '输入框清空').toHaveValue('')
  // 草稿态：未保存前零 update 请求、背后卡片不变
  const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
  expect(calls.filter((call) => call.url.includes('/update')), '未保存零 update 请求').toHaveLength(0)
  await expect(page.locator(cardOf(KEY)), '背后卡片不变').toBeVisible()
})

test('@feature expert-squad dlg step-3 cancel-discard：编辑修改后关闭重开——档案现值（草稿零持久化）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  await page.locator(dlgBtn('编辑')).click()
  await page.locator(FIELD_TITLE).fill('草稿未保存岗位')
  await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
  await expect(page.locator(OVERLAY), 'Dialog 退场').toHaveCount(0)
  await openDetail(page, KEY)
  await expect(page.locator('.dswf-dlg-meta').first(), '重开呈档案原值').toContainText('夹具评审 · 启用中')
  await expect(page.locator(dlgBtn('编辑')), '重开为查看态').toBeVisible()
})

// ── step-4-save-update ──

test('@feature expert-squad dlg step-4 success：保存落盘——update载荷/换新回查看态/Toast/卡片即时同步', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page } = sharedLaunch
  try {
    await openPanel(page)
    await openDetail(page, KEY)
    await page.locator(dlgBtn('编辑')).click()
    // 修改：岗位 + 勾选一个未选工具（目录驱动——从当前候选清单取未勾选项，不再硬编码 bash）
    await page.locator(FIELD_TITLE).fill('夹具评审·复核')
    await page.locator(mselBox('tools')).click()
    const toolRows = page.locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`)
    const selectedTools = ['read', 'grep']
    const toggleTarget = (await toolRows.allInnerTexts())
      .map((name) => name.trim())
      .find((name) => !selectedTools.includes(name))
    expect(toggleTarget, '候选清单存在未勾选工具可勾').toBeTruthy()
    await page
      .locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`, { hasText: toggleTarget! })
      .locator('input')
      .check()
    await collapseMsel(page) // 勾选完成后收起菜单——外点收起解除对底部钮的遮挡（fix-6 交互语义）
    await page.locator(dlgBtn('保存')).click()
    // update 载荷捕获（内容半——name 键定址 + 新岗位在 body；写径分流后工具不混写，
    // update 只透传档案现值工具集，勾选增量走 experts 条目配置半）
    const update = await capturedCall(page, '/api/expert-squad/update')
    expect(update.method, 'update 为 POST').toBe('POST')
    const body = JSON.parse(update.body) as { name?: string; title?: string; tools?: string[] }
    expect(body.name, '请求体 name = 键正本').toBe(KEY)
    expect(body.title, '请求体携带新岗位').toBe('夹具评审·复核')
    expect(body.tools, '请求体 tools 透传档案现值（工具增量归 experts 条目）').toEqual(selectedTools)
    // 配置半落盘实况：勾选工具写 experts.<实例ID>.tools（dev profile patch poll 收敛）
    await expect
      .poll(() => patchText(), { timeout: 30_000, message: 'cordis.patch.yml 落 experts.tools 勾选增量' })
      .toMatch(new RegExp(`#test-reviewer[\\s\\S]{0,240}tools:[\\s\\S]{0,120}- ${toggleTarget}`))
    // 回查看态：新值呈现 + Toast 热刷新
    await expect(page.locator(dlgBtn('编辑')), '头部钮回 [编辑]（查看态）').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dswf-dlg-meta').first(), '查看态换新呈现新岗位').toContainText('夹具评审·复核')
    await expect(page.locator(TOAST), 'Toast 热刷新生效').toContainText('热刷新生效')
    // 背后列表卡片即时同步（patchEntry，不待轮询）
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '卡片岗位同步新值').toHaveText('夹具评审·复核', { timeout: 10_000 })
    await expect(page.locator(`${cardOf(KEY)} .xc-tags .chip.tool`, { hasText: toggleTarget! }).first(), '卡片工具 chip 同步').toBeVisible()
    // 共享会话归零（跨用例状态不外溢）：经 UI 反向复位——岗位回档案值 + 勾选增量摘除
    //（配置半二次写 = experts 条目回档案等值集；restorePatch 还原文件后内存态与文件语义一致，
    // 下游用例视图不受本用例配置写残留影响）
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('夹具评审')
    await page.locator(mselBox('tools')).click()
    await page
      .locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`, { hasText: toggleTarget! })
      .locator('input')
      .uncheck()
    await collapseMsel(page)
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(dlgBtn('编辑')), '复位保存回查看态').toBeVisible({ timeout: 10_000 })
  } finally {
    restoreTrackedFile(DEV_PATCH, backup)
  }
})

test('@feature expert-squad dlg step-4 validation-empty-title：空岗位字段级报错——零请求零落盘', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  await page.locator(dlgBtn('编辑')).click()
  await page.locator(FIELD_TITLE).fill('   ')
  await page.locator(dlgBtn('保存')).click()
  await expect(page.locator(ERR), '字段级错误呈现').toHaveText('岗位不能为空')
  await expect(page.locator(dlgBtn('保存')), '停留编辑态').toBeVisible()
  const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
  expect(calls.filter((call) => call.url.includes('/update')), 'update 请求零发出').toHaveLength(0)
  await expect(page.locator(`${cardOf(KEY)} .xc-title`), '背后卡片不变').toHaveText('夹具评审')
})

test('@feature expert-squad dlg step-4 validation-bare-mustache：人设裸 {{ 拒绝——零请求零落盘', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  await page.locator(dlgBtn('编辑')).click()
  await page.locator(FIELD_PERSONA).fill('合法开头 {{ 非法占位')
  await page.locator(dlgBtn('保存')).click()
  await expect(page.locator(ERR), '字段级错误呈现').toContainText('人设含裸')
  await expect(page.locator(dlgBtn('保存')), '停留编辑态').toBeVisible()
  const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
  expect(calls.filter((call) => call.url.includes('/update')), 'update 请求零发出').toHaveLength(0)
})

test('@feature expert-squad dlg step-4 update-failure：通道拒绝——停留编辑态/Toast保存失败/两侧不变', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page } = sharedLaunch
  try {
    await openPanel(page)
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
    restoreTrackedFile(DEV_PATCH, backup)
  }
})

// ── fix-8 纯路由保存（bug dea323c9/7ca12bc8 e2e 取证）──

test('@feature expert-squad dlg step-4 route-only-save：内置专家纯路由保存——来源chip保持「内置」+ 零 update 请求', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page } = sharedLaunch
  try {
    await openPanel(page)
    // 内置专家卡（origin=plugin——originBadgeLabel「内置 · <插件名>」角标）
    const builtinCard = page.locator('.dswf-xcard[data-xc-origin="plugin"]').first()
    await expect(builtinCard, '面板网格含内置专家卡（插件注册层档案）').toBeVisible({ timeout: 30_000 })
    const key = await builtinCard.getAttribute('data-expert-key')
    expect(key, '内置卡 data-expert-key 在场').toBeTruthy()
    await expect(builtinCard.locator('.origin-badge'), '保存前卡来源 chip「内置」').toContainText('内置')
    await openDetail(page, key!)
    await expect(page.locator(`${DIALOG} .dswf-dlg-origin-bar .origin-badge`), 'Dialog 来源条「内置」').toContainText('内置')
    // 纯路由编辑：只动工具勾选（配置半）——内容半字段（岗位/简介/人设）零触碰
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(mselBox('tools')).click()
    const toolRows = page.locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`)
    const checked = await toolRows
      .locator('input:checked')
      .evaluateAll((nodes) => nodes.map((n) => ((n.closest('.dswf-msel-row') as HTMLElement) ?? (n.parentElement as HTMLElement)).innerText.trim()))
    const toggleTarget = (await toolRows.allInnerTexts())
      .map((name) => name.trim())
      .find((name) => !checked.includes(name))
    expect(toggleTarget, '候选清单存在未勾选工具可勾（纯路由增量）').toBeTruthy()
    await page
      .locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`, { hasText: toggleTarget! })
      .locator('input')
      .check()
    await collapseMsel(page)
    await page.locator(dlgBtn('保存')).click()
    // 保存成功收敛（回查看态 + Toast）——零 update 断言的前提（非空转）
    await expect(page.locator(dlgBtn('编辑')), '保存成功回查看态').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(TOAST), 'Toast 热刷新生效').toContainText('热刷新生效')
    // 断言②：纯路由保存零 update 请求（isContentDirty 全等分流跳过档案半——无内容半 update）
    const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
    expect(calls.filter((call) => call.url.includes('/update')), '纯路由保存零 update 请求').toHaveLength(0)
    // 断言①：来源 chip 保持「内置」（档案零改动——未升级 user 层副本、来源不翻「用户」）
    await expect(page.locator(`${DIALOG} .dswf-dlg-origin-bar .origin-badge`), '保存后 Dialog 来源 chip 保持「内置」').toContainText('内置')
    await expect(page.locator(cardOf(key!)).locator('.origin-badge'), '背后卡来源 chip 保持「内置」').toContainText('内置')
    await expect(page.locator(cardOf(key!)), '背后卡在场（档案未迁移 user 层）').toBeVisible()
    // 共享会话归零：经 UI 摘除勾选增量再保存（配置半回档案等值集——restorePatch 还原
    // 文件后内存态与文件语义一致，下游用例视图不受本用例配置写残留影响）
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(mselBox('tools')).click()
    await page
      .locator(`${DIALOG} .dswf-msel[data-msel="tools"] .dswf-msel-row`, { hasText: toggleTarget! })
      .locator('input')
      .uncheck()
    await collapseMsel(page)
    await page.locator(dlgBtn('保存')).click()
    await expect(page.locator(dlgBtn('编辑')), '复位保存回查看态').toBeVisible({ timeout: 10_000 })
  } finally {
    restoreTrackedFile(DEV_PATCH, backup)
  }
})

// ── step-5-toggle-enabled（bug 950b845c 新写径：experts.<实例ID>.disabled 配置位——
//    settings revisioned 缝；POST /enable|/disable 已不被 Dialog 消费）──

test('@feature expert-squad dlg step-5 disable-success：禁用写 experts 配置位——灯/meta/按钮/卡片四位同步 + patch 落盘', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page } = sharedLaunch
  try {
    await openPanel(page)
    await openDetail(page, KEY)
    await page.locator(dlgBtn('禁用')).click()
    // 新写径落盘实况：experts.<实例ID> 条目 disabled: true 写入 dev profile patch
    //（configForms revisioned 异步写——落盘时刻非即时，poll 收敛；实例键含 ':' 必被
    // YAML 引述，邻接锚取键尾段 + 位值）
    await expect
      .poll(() => patchText(), { timeout: 30_000, message: 'cordis.patch.yml 落 experts.disabled: true 条目' })
      .toMatch(/#test-reviewer['"]?[\s\S]{0,120}disabled: true/)
    // 退役通道零消费：捕获缓冲零 POST /enable|/disable（Dialog 启停不走启停路由）
    const toggleCalls = await page.evaluate(() =>
      [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])].filter(
        (call) => call.method === 'POST' && (call.url.includes('/enable') || call.url.includes('/disable')),
      ),
    )
    expect(toggleCalls, '零启停路由请求（新写径 = settings 缝）').toHaveLength(0)
    await expect(page.locator('.dswf-dlg-head .dot.off'), '头部灯变 off').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 变已禁用').toContainText('已禁用')
    await expect(page.locator(dlgBtn('启用')), '底部钮变 [启用]').toBeVisible()
    await expect(page.locator(TOAST), 'Toast 已禁用').toContainText(`${KEY} 已禁用`)
    await expect(page.locator(cardOf(KEY)), '背后卡片即时降透明').toHaveClass(/off/, { timeout: 10_000 })
    // 共享会话归零：经 UI 再启用（disabled 位摘除写——内存回基准态；restorePatch 还原
    // 文件兜底；残留 disabled 位会污染下游用例——get()/视图按来源级禁用判定）
    await page.locator(dlgBtn('启用')).click()
    await expect(page.locator(dlgBtn('禁用')), '复位再启用').toBeVisible({ timeout: 10_000 })
  } finally {
    restoreTrackedFile(DEV_PATCH, backup)
  }
})

test('@feature expert-squad dlg step-5 enable-success：再启用位摘除——四位归位 + patch 位摘除', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page } = sharedLaunch
  try {
    await openPanel(page)
    await openDetail(page, KEY)
    // 前置禁用（若共享会话上用例已把禁用位写进运行态内存——patch 文件经 finally 还原而
    // configForms 内存未失忆——Dialog 直接呈禁用态，禁用点击为 no-op 不再落盘，故按实际
    // 状态分流：禁用步仅在呈启用态时执行，隔离 run 下恒走完整禁用→启用全程）
    const alreadyDisabled = await page.locator(dlgBtn('启用')).isVisible().catch(() => false)
    if (!alreadyDisabled) {
      await page.locator(dlgBtn('禁用')).click()
      await expect(page.locator(dlgBtn('启用')), '禁用生效').toBeVisible({ timeout: 10_000 })
      await expect
        .poll(() => patchText(), { timeout: 30_000, message: '禁用位落盘收敛（启用前置）' })
        .toMatch(/#test-reviewer['"]?[\s\S]{0,120}disabled: true/)
    }
    await collapseMsel(page) // 收起菜单（外点收起）——解除遮挡后再点 [启用]
    // 再启用：disabled: false = 位摘除（键归缺）——absence 断言邻接锚定本条目
    //（patch 基线他段可能携带 disabled: true，全局 absence 恒假——run3 判例）
    await page.locator(dlgBtn('启用')).click()
    await expect
      .poll(() => !/#test-reviewer['"]?:[\s\S]{0,40}disabled: true/.test(patchText()), { timeout: 30_000, message: '启用 = disabled 位摘除落盘' })
      .toBe(true)
    await expect(page.locator('.dswf-dlg-head .dot.on'), '头部灯回 on').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.dswf-dlg-meta').first(), 'meta 回启用中').toContainText('启用中')
    await expect(page.locator(dlgBtn('禁用')), '底部钮回 [禁用]').toBeVisible()
    await expect(page.locator(TOAST), 'Toast 已启用').toContainText(`${KEY} 已启用`)
    await expect(page.locator(cardOf(KEY)), '背后卡片恢复常态').not.toHaveClass(/off/, { timeout: 10_000 })
  } finally {
    restoreTrackedFile(DEV_PATCH, backup)
  }
})

// Outcomes: toggle-failure（step-5 推断项）——真机取证不可达，契约层保留不落脚本：
//   · 新写径失败注错通道 = 官方 settings mutate RPC——Electron 形态走 IPC 桥（非页面
//     fetch），fetch 包装器拦截纪律（fix-3 判例）对此面结构性不可达；实测注错不命中、
//     写径照常收写（run2/run3 双轮实证）。
//   · 「启停写径不可用（experts 配置缝缺席）」缺席分支由宿主装配保证在场（client inject
//     声明 configForms），真机无法使缝缺席。
//   → 文案/分支承载 = panel-detail.test.ts（配置缝缺席 Toast + 实例 ID 缺席 fail-loud +
//     write 拒抛「启停失败」分支）与 settings-default-options.test.ts（拒写背压重试）——
//     run-tests 台账注记同「no-dialog-for-missed-key」先例。

// ── step-6-close-restore ──

test('@feature expert-squad dlg step-6 close-x：✕ 关闭——退场且列表原状恢复', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  const total = await page.locator(CARD_ANY).count()
  await openDetail(page, KEY)
  await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
  await expect(page.locator(OVERLAY), '覆盖层退场').toHaveCount(0)
  await expect(page.locator(CARD_ANY), '列表原状恢复').toHaveCount(total)
  const calls = await page.evaluate(() => [...((window as unknown as { __xsqCalls?: XsqCall[] }).__xsqCalls ?? [])])
  expect(
    calls.filter((call) => call.url.includes('/update')),
    '关闭零变更请求（启停已归 settings 缝——零路由写面）',
  ).toHaveLength(0)
})

test('@feature expert-squad dlg step-6 close-esc：Esc 关闭（编辑态草稿丢弃——重开呈档案现值）', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  // 基线参照 = 本用例打开时的档案现值（共享会话下前序用例可能已改档案、重播种后面板
  // 缓存重扫存在时序窗——语义锚「草稿丢弃 = 重开与编辑前一致」与缓存时序解耦）
  const baselineMeta = await page.locator('.dswf-dlg-meta').first().innerText()
  await page.locator(dlgBtn('编辑')).click()
  await page.locator(FIELD_TITLE).fill('Esc 丢弃草稿')
  await page.keyboard.press('Escape')
  await expect(page.locator(OVERLAY), 'Esc 关闭退场').toHaveCount(0)
  await openDetail(page, KEY)
  await expect(page.locator('.dswf-dlg-meta').first(), '重开呈档案原值（草稿丢弃）').toHaveText(baselineMeta)
})

test('@feature expert-squad dlg step-6 close-overlay：遮罩点击关闭；Dialog 内部点击零误关', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  await openDetail(page, KEY)
  // 内部点击：不误关
  await page.locator('.dswf-dlg-name').click()
  await expect(page.locator(OVERLAY), '内部点击不关闭').toBeVisible()
  // 遮罩点击：关闭
  await page.locator(OVERLAY).click({ position: { x: 8, y: 8 } })
  await expect(page.locator(OVERLAY), '遮罩点击关闭').toHaveCount(0)
})

// ── Journey 冒烟（恰一条——happy path 全程依序） ──

test('@feature expert-squad dlg 冒烟：开Dialog→查看分段→编辑保存→Toast+卡片同步→禁用→关闭恢复', async ({ sharedLaunch }) => {
  test.setTimeout(240_000)
  const backup = backupTrackedFile(DEV_PATCH)
  const { page, pageErrors } = sharedLaunch
  try {
    await openPanel(page)
    // 步骤1-2：开 Dialog + 查看态分段
    await openDetail(page, KEY)
    await expect(page.locator('.dswf-dlg-md .dswf-dlg-md-h')).toHaveText('职责')
    // 步骤3-4：编辑 → 修改岗位与简介 → 保存
    await page.locator(dlgBtn('编辑')).click()
    await page.locator(FIELD_TITLE).fill('冒烟复核岗')
    await page.locator(FIELD_DESC).fill('冒烟旅程简介：何时委派我。')
    await page.locator(dlgBtn('保存')).click()
    try {
      await expect(page.locator(dlgBtn('编辑')), '保存后回查看态').toBeVisible({ timeout: 10_000 })
    } catch (err) {
      // 诊断（仅失败路径）：保存未收敛时的捕获缓冲 + Toast/错误文本快照
      console.log(
        '[smoke-diag]',
        JSON.stringify(
          await page.evaluate(() => ({
            calls: [...((window as unknown as { __xsqCalls?: { url: string; method: string; body: string }[] }).__xsqCalls ?? [])],
            toastText: document.querySelector('.dswf-toast')?.textContent ?? null,
            errText: document.querySelector('.dswf-dlg-err')?.textContent ?? null,
            overlayCount: document.querySelectorAll('.dswf-dlg-overlay[data-dswf-detail-dialog]').length,
          })),
        ),
      )
      throw err
    }
    await expect(page.locator(TOAST), 'Toast 热刷新生效').toContainText('热刷新生效')
    await expect(page.locator(`${cardOf(KEY)} .xc-title`), '卡片同步新岗位').toHaveText('冒烟复核岗', { timeout: 10_000 })
    // 步骤5：收起菜单（外点收起）→ 禁用（四位同步）
    await collapseMsel(page)
    await page.locator(dlgBtn('禁用')).click()
    await expect(page.locator('.dswf-dlg-head .dot.off'), '灯变 off').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(cardOf(KEY)), '卡片降透明').toHaveClass(/off/, { timeout: 10_000 })
    // 步骤6：✕ 关闭恢复列表
    await page.locator(`${DIALOG} button[aria-label="关闭"]`).click()
    await expect(page.locator(OVERLAY), 'Dialog 退场').toHaveCount(0)
    await expect(page.locator(cardOf(KEY)), '禁用卡降透明在场（档案不消失）').toBeVisible()
    await expect(page.locator(cardOf(OTHER_KEY)), '其余卡片原状').toBeVisible()
    // 不变量：renderer 零未捕获异常（共享会话累计面——整 spec 期任何 pageerror 均记红）
    expect(pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    restoreTrackedFile(DEV_PATCH, backup)
  }
})
