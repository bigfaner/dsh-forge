// 「默认 Agent 选项」单面板 e2e 旅程（expert-squad-default-routing AC2 可机检半；单入口
// 迁移后承载面 = 官方插件详情页 list slot plugins.detail.section——「包含的组件」区下方）：
//   ① 左栏「插件」面板（官方 plugin-manager main keyed）→ expert-squad 卡片 → 详情页
//      「包含的组件」RowsSection 之后 detail.section 消费点渲染面板（subject 门控 =
//      本包 bundle 详情页）
//   ② 写 Provider/Model/Reasoning → 活动 profile cordis.patch.yml id 定向条目（- id: expert-squad）
//   ③ volatile 无重启生效：同一实例内面板快照回填 + experts 服务 get 应答折叠 defaultAgentOptions
// journey = .forge/docs/proposals/expert-squad-default-routing/testing/default-agent-options-panel/journey.md
// contracts = 同目录 contracts/step-1..3。
// dev 形态注记：e2e 宿主 = dev profile（apps/host/profile.dev 直链装载）——官方 settings 写径
// 落 dev profile 的 cordis.patch.yml（tracked 文件，spec 备份/还原零残留；fix-20 探针同口径）。
// 真实用户形态落 ~/.dsh/profiles/<profile>/cordis.patch.yml，写径机械同源（configEditor
// .documentPath = 活动 profile patch），形态差异只在路径。
// 导航口径（单入口迁移后）：左栏「插件」面板（官方 plugin-manager，行 aria-label =
// locale zh.panel「插件」，expert-squad 左栏行同径）→ 已安装组 expert-squad 卡片
// （data-plugin-package = 包名）→ 详情页（data-plugin-detail）面板区（data-cfg-* 锚 =
// detail.section 登记 id expert-squad-default-agent-options 渲染面；旧 data-plugin-config
// section 随 bundle.config 注册退役——configured ledger 键集随之清空）。
// 消费面取用读口 = GET /api/expert-squad/get（registry get 折叠 defaultAgentOptions——
// 优先级链③基座；①②组合由 registry-overlay 单测穷举）。
// 控件形态（对齐 detail-dialog 编辑模式）：Provider/Model/Reasoning 均为 FilterSelect
// select 组件（候选 = model-catalog 目录，Provider→Model 联动候选同径；无自由文本输入），
// 选项值取自运行时菜单——断言用实际选中项回读，不预设目录内容。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；patch 文件测试后逐字还原。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, ROOT } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
import { expect, test, type Page } from '@playwright/test'

/** dev profile patch（官方 settings 写径落点——dev 形态 tracked 文件） */
const DEV_PATCH = join(ROOT, 'apps', 'host', 'profile.dev', 'cordis.patch.yml')

const PROVIDER_BOX = '#dswf-cfg-provider'
const PROVIDER_ROOT = '[data-select="dswf-cfg-provider"]'
const MODEL_BOX = '#dswf-cfg-model'
const MODEL_ROOT = '[data-select="dswf-cfg-model"]'
const REASONING_BOX = '#dswf-cfg-reasoning'
const REASONING_ROOT = '[data-select="dswf-cfg-reasoning"]'
const PANEL_CARD = '[data-cfg-state="ready"]'

/** 夹具专家（无路由——provider/model/reasoning 全缺省 = 继承父Agent） */
const FIXTURE_KEY = 'route-probe'

function expertMd(name: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for default-agent-options e2e; no explicit route.',
    'title: 默认路由夹具',
    'tools: [read, grep]',
    '---',
    '',
    '## 职责',
    '',
    '无显式路由的夹具专家（defaultAgentOptions ③基座折叠观测面）。',
    '',
  ].join('\n')
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-dao-ws-'))
  const expertsDir = join(dir, '.dsh', 'experts')
  mkdirSync(expertsDir, { recursive: true })
  writeFileSync(join(expertsDir, `${FIXTURE_KEY}.md`), expertMd(FIXTURE_KEY), 'utf8')
  return dir
}

/** get 应答路由位（折叠 defaultAgentOptions 后的消费面形态——只取三路由位断言） */
interface RouteView {
  readonly provider?: string
  readonly model?: string
  readonly reasoning?: string
}

function routeBits(view: RouteView): RouteView {
  return {
    ...(view.provider === undefined ? {} : { provider: view.provider }),
    ...(view.model === undefined ? {} : { model: view.model }),
    ...(view.reasoning === undefined ? {} : { reasoning: view.reasoning }),
  }
}

/** 面板同源 fetch 读口：experts 服务 get（折叠 defaultAgentOptions 后的档案应答） */
async function fetchGet(page: Page, workspace: string): Promise<RouteView> {
  return page.evaluate(async ({ ws, key }) => {
    const url = `/api/expert-squad/get?key=${encodeURIComponent(key)}&workspace=${encodeURIComponent(ws)}`
    const response = await fetch(url)
    if (!response.ok) throw new Error(`get !ok：${String(response.status)}`)
    return (await response.json()) as RouteView
  }, { ws: workspace, key: FIXTURE_KEY })
}

/** patch 文件文本（Node 侧直读——落盘实况断言源） */
function patchText(): string {
  return readFileSync(DEV_PATCH, 'utf8')
}

/**
 * defaultAgentOptions 子块文本（patch 断言作用域）：目录候选值（provider/model）与同块
 * experts 条目 agentOptions、他行 agent-default-model 同值——includes 断言必须收窄到
 * expert-squad 行内 `defaultAgentOptions:` 子块（子缩进行集；unset 后子块整体消失 = 空串）。
 */
function daoText(): string {
  const text = patchText()
  const rowStart = text.indexOf('- id: expert-squad')
  if (rowStart === -1) return ''
  const rest = text.slice(rowStart)
  const nextRow = rest.slice(1).search(/\n- id: /)
  const entry = nextRow === -1 ? rest : rest.slice(0, nextRow + 1)
  const lines = entry.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*defaultAgentOptions:/.test(line))
  if (start === -1) return ''
  const indent = (lines[start]!.match(/^\s*/) ?? [''])[0]!.length
  const block: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && (line.match(/^\s*/) ?? [''])[0]!.length <= indent) break
    block.push(line)
  }
  return block.join('\n')
}

/**
 * 导航到「默认 Agent 选项」面板（插件详情页单入口）：左栏「插件」面板 → expert-squad
 * 卡片「查看」钮 → 详情页 detail.section 消费点（「包含的组件」RowsSection 下方；
 * data-cfg-* 锚）。
 */async function openDefaultAgentOptionsPanel(page: Page): Promise<void> {
  await page.locator('button[aria-label="插件"]').first().click()
  const card = page.locator('[data-plugin-package="@dsh-forge/expert-squad"]')
  await expect(card, '插件页 expert-squad 卡片在场').toBeVisible()
  await card.getByRole('button', { name: /查看/ }).click()
  await expect(page.locator('[data-plugin-detail="@dsh-forge/expert-squad"]'), '详情页挂载').toBeVisible()
  await expect(
    page.locator('[data-plugin-config]'),
    '旧 bundle.config keyed section 已随注册迁移退役（configured ledger 键集清空）',
  ).toHaveCount(0)
  await expect(page.locator(PROVIDER_BOX), '「默认 Agent 选项」面板挂载（detail.section 消费点，Provider select 形态）').toBeVisible()
  await expect(page.locator(PANEL_CARD), '面板 ready（configForms 写径就绪）').toBeVisible()
}

/** 下拉选值（box 开菜单 → 按 value 点 option，选值即提交） */
async function pickOption(page: Page, root: string, box: string, value: string): Promise<void> {
  await page.locator(box).click()
  await page.locator(`${root} [data-select-option="${value}"]`).click()
}

/** 首个非继承目录选项值（provider/model 候选源 = 运行时 model-catalog，不预设内容） */
async function firstCatalogOption(page: Page, root: string, box: string): Promise<string> {
  await page.locator(box).click()
  const options = page.locator(`${root} [data-select-option]`)
  const count = await options.count()
  for (let i = 0; i < count; i += 1) {
    const value = await options.nth(i).getAttribute('data-select-option')
    if (value !== null && value !== '') {
      await options.nth(i).click()
      return value
    }
  }
  throw new Error(`目录无候选选项（${root}）——dev 宿主 model-catalog 缺席`)
}

/** select box 当前显值（data-select-value 属性 = 受控 value） */
function boxValue(page: Page, root: string): Promise<string> {
  return page.locator(`${root} [data-select-value]`).getAttribute('data-select-value') as Promise<string>
}

test('AC2·golden path：打开插件详情页配置面板 → 写配置落 id 定向 patch → volatile 同实例生效', async () => {
  test.setTimeout(120_000)
  const backup = existsSync(DEV_PATCH) ? readFileSync(DEV_PATCH, 'utf8') : null
  const wsDir = makeWorkspace()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-dao-ud-'))
  const { launchHost } = await import('../../../e2e/support/launch.js')
  const launched = await launchHost({ userData })
  const { app, page } = launched
  try {
    await registerProject(page, wsDir, `dao-fixture-${Date.now() % 1_000_000}`)
    // 前置基线：夹具专家无路由（get 应答三路由位缺省——应答含档案全文，只比路由位）
    expect(routeBits(await fetchGet(page, wsDir)), '写前夹具专家无路由').toEqual({})

    await openDefaultAgentOptionsPanel(page)
    // select 形态空态（D5 微文案——box 显「（继承父Agent）」继承空选项，无自由文本 input）
    await expect(page.locator(`${PROVIDER_ROOT} [data-select-value=""]`)).toHaveText('（继承父Agent）')
    await expect(page.locator(`${MODEL_ROOT} [data-select-value=""]`)).toHaveText('（继承父Agent）')
    await expect(page.locator(`${REASONING_ROOT} [data-select-value=""]`)).toHaveText('默认')

    // 同实例 volatile 标记（boot 后写——断言期不变 = 零 reload）
    const marker = await page.evaluate(() => {
      const w = window as typeof window & { __DAO_MARK__?: number }
      w.__DAO_MARK__ = Math.random()
      return w.__DAO_MARK__
    })

    // ── Step 2：写 Provider/Model（目录候选择值，选值即提交）+ Reasoning「高」──
    const provider = await firstCatalogOption(page, PROVIDER_ROOT, PROVIDER_BOX)
    const model = await firstCatalogOption(page, MODEL_ROOT, MODEL_BOX)
    await pickOption(page, REASONING_ROOT, REASONING_BOX, 'high')

    // patch 落盘实况：id 定向条目 + 逐字值（写径 = 官方 configForms revisioned 异步写——
    // 三连写逐写过 Host configEditor reconcile/热重载窗口，落盘时刻非即时；逐字段 poll 收敛）
    await expect
      .poll(patchText, { timeout: 30_000, message: 'cordis.patch.yml 落 id 定向 defaultAgentOptions 条目' })
      .toContain(`provider: ${provider}`)
    await expect
      .poll(patchText, { timeout: 30_000, message: 'model 落盘（同条目整组重述）' })
      .toContain(`model: ${model}`)
    await expect
      .poll(patchText, { timeout: 30_000, message: 'reasoning: high 落盘' })
      .toContain('reasoning: high')
    expect(patchText()).toMatch(/- id: expert-squad/)

    // ── Step 3：volatile 无重启生效（同一实例内）──
    expect(await page.evaluate(() => (window as typeof window & { __DAO_MARK__?: number }).__DAO_MARK__),
      '同实例（零 reload）').toBe(marker)
    await expect.poll(() => boxValue(page, PROVIDER_ROOT), { timeout: 15_000, message: '面板快照换代回填（volatile 热刷新）' }).toBe(provider)
    await expect.poll(() => boxValue(page, MODEL_ROOT), { timeout: 15_000 }).toBe(model)
    await expect
      .poll(async () => routeBits(await fetchGet(page, wsDir)), { timeout: 15_000, message: 'experts 服务 get 折叠 defaultAgentOptions' })
      .toEqual({ provider, model, reasoning: 'high' })

    // ── 边界 2b：逐项清空（选回继承空选项）= unset，patch 不残留空壳 ──
    // 三连选值即三连写——逐项落盘收敛后再做下一项（写径 = 官方 configForms revisioned
    // 异步写，连写过 Host reconcile/热重载窗口会被拒并背压重试；逐项 pacing 避免三链
    // 并发重试互相顶撞，且每步断言本身就是 unset 落盘的逐字段对账）。
    await pickOption(page, PROVIDER_ROOT, PROVIDER_BOX, '')
    await expect
      .poll(() => !daoText().includes(`provider: ${provider}`), { timeout: 30_000, message: 'provider 清除落盘' })
      .toBe(true)
    await pickOption(page, MODEL_ROOT, MODEL_BOX, '')
    await expect
      .poll(() => !daoText().includes(`model: ${model}`), { timeout: 30_000, message: 'model 清除落盘（无空壳残留）' })
      .toBe(true)
    await pickOption(page, REASONING_ROOT, REASONING_BOX, '')
    await expect
      .poll(() => !daoText().includes('reasoning: high'), { timeout: 30_000, message: 'reasoning 清除落盘' })
      .toBe(true)
    await expect.poll(() => boxValue(page, PROVIDER_ROOT), { timeout: 15_000, message: '面板回占位态' }).toBe('')
    await expect
      .poll(async () => routeBits(await fetchGet(page, wsDir)), { timeout: 15_000, message: '清空后消费面即时回落缺省' })
      .toEqual({})
    expect(await page.evaluate(() => (window as typeof window & { __DAO_MARK__?: number }).__DAO_MARK__),
      '清空段仍同实例').toBe(marker)
  } finally {
    await closeApp(app)
    rmSync(wsDir, { recursive: true, force: true })
    rmSync(userData, { recursive: true, force: true })
    // tracked patch 文件逐字还原（零残留——backup 在写前捕获）
    if (backup === null) {
      if (existsSync(DEV_PATCH)) writeFileSync(DEV_PATCH, '', 'utf8')
    } else if (patchText() !== backup) {
      writeFileSync(DEV_PATCH, backup, 'utf8')
    }
  }
})

test('AC2·面板形态锚：标题/分区/三字段 select 形态微文案（详情页单入口的最小回归半）', async () => {
  // 插件详情页单入口直呈形态的最小回归：面板打开即 ready、三字段 select 形态 + D5 微文案锚
  // 逐字（降级不注册形态 configForms 缺席 = 宿主装配差异，settings-default-options.test
  // 单测承载——e2e 不注错）。
  test.setTimeout(120_000)
  const backup = existsSync(DEV_PATCH) ? readFileSync(DEV_PATCH, 'utf8') : null
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-dao-min-ud-'))
  const { launchHost } = await import('../../../e2e/support/launch.js')
  const launched = await launchHost({ userData })
  const { app, page } = launched
  try {
    await openDefaultAgentOptionsPanel(page)
    await expect(page.locator('.dswf-cfg-panel-title')).toHaveText('默认 Agent 选项')
    await expect(page.locator('.dswf-cfg-seg')).toHaveText('默认路由')
    await expect(page.locator('.dswf-cfg-row [data-select]').first()).toBeVisible()
    expect(await page.locator('.dswf-cfg-row [data-select]').count()).toBe(3)
    expect(await page.locator('.dswf-cfg-row input').count()).toBe(0)
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    if (backup !== null && patchText() !== backup) writeFileSync(DEV_PATCH, backup, 'utf8')
  }
})

