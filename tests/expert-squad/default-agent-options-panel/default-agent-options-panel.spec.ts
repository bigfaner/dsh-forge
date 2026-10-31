// 「默认 Agent 选项」单面板 e2e 旅程（expert-squad-default-routing AC2 可机检半）：
//   ① 设置页打开 tab（官方设置壳 → 「内置插件」section → settings.plugins.tab feature-owned tab）
//   ② 写 Provider/Model/Reasoning → 活动 profile cordis.patch.yml id 定向条目（- id: expert-squad）
//   ③ volatile 无重启生效：同一实例内面板快照回填 + experts 服务 get 应答折叠 defaultAgentOptions
// journey = .forge/docs/proposals/expert-squad-default-routing/testing/default-agent-options-panel/journey.md
// contracts = 同目录 contracts/step-1..3。
// dev 形态注记：e2e 宿主 = dev profile（apps/host/profile.dev 直链装载）——官方 settings 写径
// 落 dev profile 的 cordis.patch.yml（tracked 文件，spec 备份/还原零残留；fix-20 探针同口径）。
// 真实用户形态落 ~/.dsh/profiles/<profile>/cordis.patch.yml，写径机械同源（configEditor
// .documentPath = 活动 profile patch），形态差异只在路径。
// 导航口径（探针实测）：官方设置壳 = 居中 overlay 面板（VOzbGW_panel），section 导航行在
// 面板内（locale 字面量「内置插件」）；产品侧栏同名行（aria-label 插件）在 mask 之下非点击面。
// 消费面取用读口 = GET /api/expert-squad/get（registry get 折叠 defaultAgentOptions——
// 优先级链③基座；①②组合由 registry-overlay 单测穷举）。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；patch 文件测试后逐字还原。
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, ROOT } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
import { expect, test, type Page } from '@playwright/test'

/** dev profile patch（官方 settings 写径落点——dev 形态 tracked 文件） */
const DEV_PATCH = join(ROOT, 'apps', 'host', 'profile.dev', 'cordis.patch.yml')

const PROVIDER_INPUT = '#dswf-cfg-provider'
const MODEL_INPUT = '#dswf-cfg-model'
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
 * 设置壳导航到「默认 Agent 选项」tab：官方设置入口 → 面板内 section 导航「内置插件」→
 * tab（两态兼容：多贡献 = role=tab 点选；单贡献 = 面板直呈，tab 缺席即跳过）。
 */
async function openDefaultAgentOptionsTab(page: Page): Promise<void> {
  await page.locator('[aria-label="设置"]').first().click()
  const pluginsNav = page.getByRole('button', { name: '内置插件', exact: true })
  await expect(pluginsNav, '设置壳「内置插件」section 导航行在场').toBeVisible()
  await pluginsNav.click()
  const tab = page.getByRole('tab', { name: '默认 Agent 选项' })
  if ((await tab.isVisible().catch(() => false)) === true) await tab.click()
  await expect(page.locator(PROVIDER_INPUT), '「默认 Agent 选项」面板挂载').toBeVisible()
  await expect(page.locator(PANEL_CARD), '面板 ready（configForms 写径就绪）').toBeVisible()
}

/** Reasoning 四选拨档（box 开菜单 → option 点选即提交） */
async function pickReasoning(page: Page, value: string): Promise<void> {
  await page.locator(REASONING_BOX).click()
  await page.locator(`${REASONING_ROOT} [data-select-option="${value}"]`).click()
}

test('AC2·golden path：打开 tab → 写配置落 id 定向 patch → volatile 同实例生效', async () => {
  test.setTimeout(120_000)
  const suffix = String(Date.now() % 1_000_000)
  const provider = `dao-prov-${suffix}`
  const model = `dao-model-${suffix}`
  const backup = existsSync(DEV_PATCH) ? readFileSync(DEV_PATCH, 'utf8') : null
  const wsDir = makeWorkspace()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-dao-ud-'))
  const { launchHost } = await import('../../../e2e/support/launch.js')
  const launched = await launchHost({ userData })
  const { app, page } = launched
  try {
    await registerProject(page, wsDir, `dao-fixture-${suffix}`)
    // 前置基线：夹具专家无路由（get 应答三路由位缺省——应答含档案全文，只比路由位）
    expect(routeBits(await fetchGet(page, wsDir)), '写前夹具专家无路由').toEqual({})

    await openDefaultAgentOptionsTab(page)
    // 占位空态（D5 微文案）
    await expect(page.locator(PROVIDER_INPUT)).toHaveAttribute('placeholder', '继承父Agent')
    await expect(page.locator(MODEL_INPUT)).toHaveAttribute('placeholder', '继承父Agent')
    await expect(page.locator(`${REASONING_ROOT} [data-select-value=""]`)).toHaveText('默认')

    // 同实例 volatile 标记（boot 后写——断言期不变 = 零 reload）
    const marker = await page.evaluate(() => {
      const w = window as typeof window & { __DAO_MARK__?: number }
      w.__DAO_MARK__ = Math.random()
      return w.__DAO_MARK__
    })

    // ── Step 2：写 Provider/Model（blur 提交）+ Reasoning「高」──
    await page.locator(PROVIDER_INPUT).fill(provider)
    await page.locator(MODEL_INPUT).click() // provider blur 提交
    await page.locator(MODEL_INPUT).fill(model)
    await page.locator(PROVIDER_INPUT).click() // model blur 提交
    await pickReasoning(page, 'high')

    // patch 落盘实况：id 定向条目 + 逐字值
    await expect
      .poll(patchText, { timeout: 30_000, message: 'cordis.patch.yml 落 id 定向 defaultAgentOptions 条目' })
      .toContain(`provider: ${provider}`)
    expect(patchText()).toContain(`model: ${model}`)
    expect(patchText()).toContain('reasoning: high')
    expect(patchText()).toMatch(/- id: expert-squad/)

    // ── Step 3：volatile 无重启生效（同一实例内）──
    expect(await page.evaluate(() => (window as typeof window & { __DAO_MARK__?: number }).__DAO_MARK__),
      '同实例（零 reload）').toBe(marker)
    await expect(page.locator(PROVIDER_INPUT), '面板快照换代回填（volatile 热刷新）').toHaveValue(provider)
    await expect(page.locator(MODEL_INPUT)).toHaveValue(model)
    await expect
      .poll(async () => routeBits(await fetchGet(page, wsDir)), { timeout: 15_000, message: 'experts 服务 get 折叠 defaultAgentOptions' })
      .toEqual({ provider, model, reasoning: 'high' })

    // ── 边界 2b：逐项清空 = unset，patch 不残留空壳 ──
    await page.locator(PROVIDER_INPUT).fill('')
    await page.locator(MODEL_INPUT).click()
    await page.locator(MODEL_INPUT).fill('')
    await page.locator(PROVIDER_INPUT).click()
    await pickReasoning(page, '')
    await expect
      .poll(() => !patchText().includes(`provider: ${provider}`), { timeout: 30_000, message: '全空 = unset 整字段' })
      .toBe(true)
    expect(patchText(), '无空壳条目残留').not.toContain(`model: ${model}`)
    expect(patchText()).not.toContain('reasoning: high')
    await expect(page.locator(PROVIDER_INPUT), '面板回占位态').toHaveValue('')
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

test('AC2·面板形态锚：标题/分区/占位微文案（settings 域在场的最小回归半）', async () => {
  // 单贡献 tab 直呈形态的最小回归：面板打开即 ready、D5 微文案锚逐字（降级不注册形态
  // configForms 缺席 = 宿主装配差异，settings-default-options.test 单测承载——e2e 不注错）。
  test.setTimeout(120_000)
  const backup = existsSync(DEV_PATCH) ? readFileSync(DEV_PATCH, 'utf8') : null
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-dao-min-ud-'))
  const { launchHost } = await import('../../../e2e/support/launch.js')
  const launched = await launchHost({ userData })
  const { app, page } = launched
  try {
    await openDefaultAgentOptionsTab(page)
    await expect(page.locator('.dswf-cfg-panel-title')).toHaveText('默认 Agent 选项')
    await expect(page.locator('.dswf-cfg-seg')).toHaveText('默认路由')
  } finally {
    await closeApp(app)
    rmSync(userData, { recursive: true, force: true })
    if (backup !== null && patchText() !== backup) writeFileSync(DEV_PATCH, backup, 'utf8')
  }
})
