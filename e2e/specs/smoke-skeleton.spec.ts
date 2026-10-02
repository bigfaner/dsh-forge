// 2.14 冒烟断言骨架组迁移底稿（Playwright _electron）——台账：e2e/SMOKE-LEDGER.md。
// 来源 = docs/proposals/dsh-forge-redesign/prototype/smoke-ui.cjs（196 条 UI 断言 + 1 条
// 运行时元断言）；本套件承载骨架组（三区 / 视图互换 / 页签跟随 / 向导两段走查 / hero），
// 断言文本/意图零删改（expect 描述附原行号），仅载体与选择器适配（适配理由逐条入台账）。
// 吸收 2.12 workbench-sc1.spec（SC1 起步组行号映射保持——见台账「吸收记录」节）。
// 隔离：独立 userData + 独立端口（e2e 单实例纪律，沿 host-boot/web-shell.spec）。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')

const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

/** 启动薄宿主（dev profile + 独立 userData——单实例锁互不干扰） */
async function launchHost(overrides: Record<string, string>): Promise<ElectronApplication> {
  const { _electron } = await import('@playwright/test')
  return _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: { ...process.env, ...overrides } as Record<string, string>,
  })
}

/** 壳 boot 就绪链（沿 2.12/1.5 前置）：就绪门 → 模块系统 live → 产品插件激活 */
async function waitShellReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
    undefined,
    { timeout: 60_000 },
  )
  await page.waitForFunction(
    () => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    },
    undefined,
    { timeout: 90_000 },
  )
}

/** 相位稳定门（settling 收敛——hero/session 二态后才走组内分支） */
async function stablePhase(page: Page): Promise<'hero' | 'session'> {
  await page.waitForFunction(
    () => {
      const p = document.querySelector('[data-dswf-workbench]')?.getAttribute('data-dswf-phase')
      return p === 'hero' || p === 'session'
    },
    undefined,
    { timeout: 30_000 },
  )
  return page.locator('[data-dswf-workbench]').first().getAttribute('data-dswf-phase') as Promise<'hero' | 'session'>
}

/** 工作台桥派发（左栏导航同径转移面——原型 UI 点击在 M0 无产品会话行期的载体适配，台账记录） */
async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } })
      .__DSH_FORGE_WORKBENCH__
    bridge?.dispatch({ type: eventType })
  }, type)
}

/** 向导固定目录夹具：{root}/dsh-demo/.knowledge + {root}/legacy-app（名称对齐原型走查目录语义） */
function makeWizardFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-wiz-'))
  mkdirSync(join(root, 'dsh-demo', '.knowledge'), { recursive: true })
  mkdirSync(join(root, 'legacy-app'), { recursive: true })
  return root
}

/** canonical path 扁平化（form-model.flattenWorkspacePath 同口径：分隔符 → `-`、盘符冒号去除） */
function flattenPath(dir: string): string {
  const normalized = dir.replaceAll('/', '\\').replace(/\\+$/, '')
  return normalized.replace(/^([A-Za-z]):/, '$1').replaceAll('\\', '-')
}

/** 浏览器行定位（名称精确匹配——防「Local」误中「LocalLow」） */
function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  return page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?:\\s|$)`) }).first()
}

/** 双击进入目录并等待列举就绪（面包屑出现目标段） */
async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

// ─────────────────────────────────────────────────────────────────────────────
// 组一：三区 + 视图互换 + 页签跟随（+ L3 布局对照起步池 + 运行时元断言）
// 原型行：L41–L46（三区）、L50–L66/L474（互换）、L689（收起回归）、L824（元断言）
// ─────────────────────────────────────────────────────────────────────────────
test('骨架组·三区/视图互换/页签跟随（smoke L41–L66、L474、L689 + L3 起步池 + 元断言 L824）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-skel-'))
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19610 + (process.pid % 200)),
  })
  const pageErrors: string[] = []
  try {
    const page: Page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await waitShellReady(page)
    const workbench = page.locator('[data-dswf-workbench]').first()
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    // 工作台桥发布（左栏导航视图切换缝——2.12 起步组行，吸收保留）
    expect(
      await page.evaluate(() => typeof (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__),
    ).toBe('object')
    const phase = await stablePhase(page)

    // ── 三区装配（smoke「三区布局(SC1)」组）──
    // L41 左栏渲染：官方 sidebar 壳在场（nav = 折叠/导航/快捷键白拿）+ 产品工作区面板
    await expect(page.locator('#root nav[aria-label]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-sidebar]').first()).toBeVisible()
    // L42 左栏构成（载体适配，台账 #2）：品牌/新会话 = 官方壳承继；知识库入口/项目树 = 产品面板
    await expect(page.locator('[data-dswf-nav="knowledge"]').first()).toBeVisible()
    await expect(page.locator('.dswf-sidebar-sectionlabel', { hasText: '项目' }).first()).toBeVisible()
    // L44 默认中区 = 会话视图（M0 相位语义：hero = 首用替换呈现，否则会话视图；知识视图恒隐藏）
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('.dswf-zone-knowledge')).toBeHidden()
    if (phase === 'session') {
      // L45 tabs = 对话/轨迹/知识召回（session 相位分支——hero 相位期会话面板不出场）
      await expect(page.locator('.dswf-session-panel').first()).toBeVisible()
      await expect(page.locator('.dswf-session-panel [role="tab"]')).toHaveCount(3)
      for (const label of ['对话', '轨迹', '知识召回']) {
        await expect(page.locator('.dswf-session-panel [role="tab"]', { hasText: label })).toBeVisible()
      }
      // 官方会话面嵌入配方在场（conversation.content 工厂产物锚——2.12 起步组行，吸收保留）
      await expect(page.locator('[data-conversation-content]').first()).toBeAttached()
    } else {
      // UF-2 hero 相位（实机走查归组三——本组只断言替换呈现语义）
      await expect(page.locator('[data-dswf-hero]').first()).toBeVisible()
      await expect(page.locator('.dswf-session-panel')).toHaveCount(0)
    }
    // L46 右栏默认收起（轨道归零）
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()

    // ── L3 布局对照断言起步池（样式纪律第 6 条；台账「L3 起步池」节）──
    const l3 = await page.evaluate(() => {
      const dock = document.querySelector('.dswf-zones-dock')
      const zones = document.querySelector('.dswf-zones')
      const rail = document.querySelector('.dswf-zones-rail')
      const main = document.querySelector('.dswf-zones-main')
      const officialRow = document.querySelector('#root nav[aria-label] button')
      const entry = document.querySelector('.dswf-sidebar-entry')
      const cs = (el: Element | null) => (el ? getComputedStyle(el) : null)
      return {
        dockWidth: cs(dock)?.width,
        dockVisibility: cs(dock)?.visibility,
        zonesDisplay: cs(zones)?.display,
        structure: [rail?.tagName, main?.tagName, dock?.tagName],
        officialRowRadius: cs(officialRow)?.borderRadius,
        entryRadius: cs(entry)?.borderRadius,
        entryHeight: entry?.getBoundingClientRect().height,
        entryFontSize: cs(entry)?.fontSize,
      }
    })
    // 三区结构：flex 骨架 + rail(aside)/main(main)/dock(aside) 三结构位
    expect(l3.zonesDisplay, 'L3·三区结构 flex 骨架').toBe('flex')
    expect(l3.structure, 'L3·三区结构位 rail/main/dock').toEqual(['ASIDE', 'MAIN', 'ASIDE'])
    // 轨道归零 computed 载体（L46 的 computed-style 样本）
    expect(l3.dockWidth, 'L3·收起轨道宽度归零').toBe('0px')
    expect(l3.dockVisibility, 'L3·零宽轨道不可见（不可聚焦）').toBe('hidden')
    // 左栏行对照：产品行与官方行同 token 圆角（--dsw-radius-md 实解析比对）+ 官方 workspace 行刻度
    expect(l3.entryRadius, 'L3·左栏行圆角 = 官方行同 token').toBe(l3.officialRowRadius)
    expect(l3.entryHeight, 'L3·左栏行高 = 官方 projectRow 刻度 h34').toBe(34)
    expect(l3.entryFontSize, 'L3·左栏行字号 = 官方 14px 刻度').toBe('14px')

    // ── 视图互换组（smoke SC5 骨架行；M1 语义：知识视图 = UF-6 浏览面装配壳，3.8）──
    // L50 点「知识库」→ 中区切换为知识视图（载体适配，台账 #L50：M0 占位锚 data-dswf-knowledge-m0
    // → M1 浏览面装配壳锚 data-dswf-knowledge-view——「知识视图在场」断言语义不变；
    // 无项目锚（host 通道前置缺口期）= 壳内引导空态，结构位不变）
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(page.locator('[data-dswf-knowledge-view]').first()).toBeVisible()
    await expect(page.locator('.dswf-zones[data-dswf-view="knowledge"]').first()).toBeAttached()
    if (phase === 'session') {
      await expect(page.locator('.dswf-session-panel').first()).toBeHidden()
    }
    // L8 打开不占用右栏（dock 仍收起；载体适配，台账 #8：M0 将原型 is-collapsed 单类位
    // 细分为 collapsed(会话视图收起)/hidden(知识模式强制)——「不占用右栏」= 轨道不可见）
    await expect(page.locator('[data-dswf-dock="hidden"]').first()).toBeAttached()
    // L9 知识模式无右栏入口（负向断言；载体适配，台账 #9：原型钉两个具体图标钮，M0 钉可达面全集）
    const expandables = await page.evaluate(() =>
      [...document.querySelectorAll('.dswf-zones-main button')].filter((b) => {
        if (!/展开/.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) return false
        const cs = getComputedStyle(b)
        return cs.visibility !== 'hidden' && b.getClientRects().length > 0 && b.offsetWidth > 0
      }).length,
    )
    expect(expandables, 'L52 知识模式无右栏展开入口').toBe(0)
    // L66/L474 切回会话视图（载体适配，台账 #12/#99：M0 无产品会话行期 = 桥派发同径转移）
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-knowledge-view]').first()).toBeHidden()
    // （L8 后半：收起态往返知识模式 → 恢复收起——「不占用」的回归面）
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()

    // L59 会话视图可展开右栏（session 相位 = 角位开关实钮；hero 相位无角位钮 = 桥派发，台账 #10）
    if (phase === 'session') {
      await page.locator('.dswf-workbench-docktoggle').click()
    } else {
      await bridgeDispatch(page, 'toggle-right-dock')
    }
    await expect(page.locator('[data-dswf-dock="expanded"]').first()).toBeAttached()
    // 页签跟随底稿：展开轨道 = 页签条（M0 全局「开始」单页签）+ 内容常挂载（keep-alive）
    await expect(page.locator('.dswf-zones-dock-strip [role="tab"]', { hasText: '开始' })).toBeVisible()
    await expect(page.locator('[data-dswf-dock] [role="tabpanel"]').first()).toBeAttached()

    // L11 整体切换：进入知识模式 → 已开右栏也隐藏（内容让位）
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(page.locator('[data-dswf-dock="hidden"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-dock] [role="tabpanel"]').first()).toBeAttached()
    // L12 切回会话视图 → 右栏恢复展开（状态保留）
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-dock="expanded"]').first()).toBeAttached()

    // L689 收起（轨道归零——含 computed 回归样本）
    if (phase === 'session') {
      await page.locator('.dswf-workbench-docktoggle').click()
    } else {
      await bridgeDispatch(page, 'toggle-right-dock')
    }
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()
    const collapsedWidth = await page.evaluate(() => getComputedStyle(document.querySelector('.dswf-zones-dock')!).width)
    expect(collapsedWidth, 'L3·收起回归轨道宽度归零').toBe('0px')

    // L824 无页面 JS 错误（载体适配，台账 #181：console 噪音含官方 remote.mux ws 重连——
    // 官方层行为，断言面 = 未捕获异常 pageerror；console 全口径随 host ws 面治理后回归）
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 组二：向导两段走查 ①–④（实机全绿；⑤ 与已注册标记按 host 前置条件归组三）
// 原型行：L753–L811（段一 ① / 段二 ② / 浏览改选 ③ / 重选联动 ④）
// ─────────────────────────────────────────────────────────────────────────────
test('骨架组·向导两段走查 ①–④（smoke L753–L811 实机；L766/L814/L820 记账转正）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-wiz-'))
  const fixture = makeWizardFixture()
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19630 + (process.pid % 200)),
  })
  const pageErrors: string[] = []
  try {
    const page: Page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await waitShellReady(page)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    await stablePhase(page)

    // 打开入口 = 左栏「＋」（原型 data-act=add-project 的 M0 载体；hero CTA 路径归组三）
    await page.locator('[data-dswf-nav="add-project"]').first().click()
    // L753 ① 先弹文件浏览器（选择工作区目录；载体适配，台账 #157：M0 = 单模态「添加项目」
    // 内嵌浏览器面，原型 = 独立「选择工作区目录」对话框标题）
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
    await expect(page.locator('.dswf-fb-list[role="listbox"]')).toBeVisible()
    // L754 ① 未选中时「选择此文件夹」禁用（M0 段一按钮文案 =「下一步」，台账 #158）
    const confirmBtn = page.locator('.dswf-fb-confirm')
    await expect(confirmBtn).toBeDisabled()
    await expect(confirmBtn).toHaveText('下一步')

    // 导航至夹具根（home → AppData → Local → Temp → 夹具；名称精确匹配防误中）
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixture.split('\\').at(-1) as string)
    // L760 ① 单击选中 → 按钮解禁
    await dirRow(page, 'dsh-demo').click()
    await expect(confirmBtn).toBeEnabled()
    await confirmBtn.click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()

    // ── 段二表单（smoke ② 组）──
    const ws = page.locator('[data-dswf-rf-ws]')
    const name = page.locator('[data-dswf-rf-name]')
    const forge = page.locator('[data-dswf-rf-forge]')
    const kn = page.locator('[data-dswf-rf-kn]')
    const tasks = page.locator('[data-dswf-rf-tasks]')
    const demoDir = join(fixture, 'dsh-demo')
    // L769 ② 工作区目录自动回填表单（只读）
    await expect(ws).toHaveValue(demoDir)
    expect(await ws.getAttribute('readonly'), 'L769 工作区目录只读').not.toBeNull()
    // L770 ② 项目名自动取文件夹名
    await expect(name).toHaveValue('dsh-demo')
    // L771 ② 任务清单与记录自动派生且只读（分隔符扁平化为 -；载体适配，台账 #163：
    // M0 前缀 = 展示口径 ~/.dsh-forge，真实 home 注入归配置面——扁平化算法同口径断言）
    await expect(tasks).toHaveValue(`~/.dsh-forge/${flattenPath(demoDir)}`)
    expect(await tasks.getAttribute('readonly'), 'L771 任务清单只读').not.toBeNull()
    // L773 ② 任务清单与记录位于表单最下方（目录字段之后）
    const tasksLast = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dswf-rf-row')]
      return rows.at(-1)?.querySelector('[data-dswf-rf-tasks]') !== null
    })
    expect(tasksLast, 'L773 任务清单行位于表单最下方').toBe(true)
    // L777 ② forge 目录（文档位置）按工作区构建预填
    await expect(forge).toHaveValue(`${demoDir}\\.forge`)
    // L778 ② 知识库目录按工作区构建预填且可改
    await expect(kn).toHaveValue(`${demoDir}\\.knowledge`)
    expect(await kn.getAttribute('readonly'), 'L778 知识库目录可改').toBeNull()
    // L779 ② forge 目录字段位于知识库目录之上
    const forgeAboveKn = await page.evaluate(() => {
      const f = document.querySelector('[data-dswf-rf-forge]')
      const k = document.querySelector('[data-dswf-rf-kn]')
      return !!(f && k && (f.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING))
    })
    expect(forgeAboveKn, 'L779 forge 目录字段在知识库目录之上').toBe(true)
    // L783 ② 目录字段均带「浏览…」（文件浏览器改选）
    await expect(page.getByRole('button', { name: '浏览…' })).toHaveCount(2)
    // L784 ② 文档位置 = forge 目录输入（仓内/仓外 radio 已并入——chip 呈现）
    await expect(page.locator('.dswf-rf input[type="radio"]')).toHaveCount(0)
    await expect(page.locator('.dswf-rf-relation', { hasText: '仓内' }).first()).toBeVisible()
    // L785 ② 默认召回域字段已移除（载体适配，台账 #170：以字段全集盘点承载「无此字段」）
    await expect(page.locator('.dswf-rf input')).toHaveCount(5)
    // L786 ② 底部按钮 =「确认」
    await expect(page.locator('.dswf-rf-confirm')).toHaveText('确认')

    // ── ③ 浏览改选（smoke ③ 组；载体适配，台账 #173/174：M0 = 模态内同位浏览面板
    // （返回表单保留已填），原型 = 叠层两对话框——「表单保持」语义以状态保留承载）──
    await page
      .locator('.dswf-rf-row')
      .filter({ has: page.locator('[data-dswf-rf-kn]') })
      .getByRole('button', { name: '浏览…' })
      .click()
    await expect(page.locator('[data-dswf-rf="browsing"][data-dswf-rf-target="knowledgeDir"]')).toBeVisible()
    await expect(page.getByText('选择知识库目录').first()).toBeVisible()
    // 浏览起点 = 当前知识库目录（demo/.knowledge，无子目录）→ 上一级到 dsh-demo → 选 .knowledge
    await page.locator('.dswf-fb-up').click()
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText('dsh-demo', { timeout: 15_000 })
    await dirRow(page, '.knowledge').click()
    await page.locator('.dswf-fb-confirm', { hasText: '选择此文件夹' }).click()
    // L798 ③ 浏览确认 → 回填知识库目录（浏览面板让位，表单仍在）
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    await expect(kn).toHaveValue(`${demoDir}\\.knowledge`)

    // ── ④ 重新选择与联动（smoke ④ 组）──
    // L803 ④ 重新选择 → 回到文件浏览器（载体适配，台账 #175：M0 = 表单内「重新选择」→
    // 同位浏览面板 target=workspace（标题「选择工作区目录」与原型对话框同文）；
    // 流程级「返回上一步」repick 相位同径 relink——联动语义不变）
    await page.getByRole('button', { name: '重新选择' }).click()
    await expect(page.locator('[data-dswf-rf="browsing"][data-dswf-rf-target="workspace"]')).toBeVisible()
    await expect(page.getByText('选择工作区目录').first()).toBeVisible()
    // 重选起点 = 当前工作区（dsh-demo）→ 上一级到夹具根 → 选 legacy-app
    await page.locator('.dswf-fb-up').click()
    await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(fixture.split('\\').at(-1) as string, {
      timeout: 15_000,
    })
    await dirRow(page, 'legacy-app').click()
    await page.locator('.dswf-fb-confirm', { hasText: '选择此文件夹' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    const legacyDir = join(fixture, 'legacy-app')
    // L807 ④ 换选工作区：回填 + 未手改字段重构（forge/项目名）
    await expect(ws).toHaveValue(legacyDir)
    await expect(forge).toHaveValue(`${legacyDir}\\.forge`)
    await expect(name).toHaveValue('legacy-app')
    // L810 ④ 任务清单随工作区重新派生（扁平化）
    await expect(tasks).toHaveValue(`~/.dsh-forge/${flattenPath(legacyDir)}`)
    // L811 ④ 浏览选定的知识库目录保留（不随工作区重构）
    await expect(kn).toHaveValue(`${demoDir}\\.knowledge`)

    // 取消干净退出（AC 取消点语义 + L824 元断言）
    await page.keyboard.press('Escape')
    await expect(page.locator('.dswf-ap')).toHaveCount(0)
    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 组三：hero 相位 + ⑤ 确认入库 + 已注册标记（条件组——host forge:projects 通道装配前置）
// 原型行：L766（已注册标记）/L814/L820（⑤ 确认入库 + 反馈）；hero 底稿 = UF-2 AC
// （原型无零项目走查行——台账「hero 组」节记缺席理由）。通道落位后本组自动转正执行。
// ─────────────────────────────────────────────────────────────────────────────
test('骨架组·hero 相位 + ⑤ 确认入库 + 已注册标记（前置 host forge:projects 通道装配）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-hero-'))
  const fixture = makeWizardFixture()
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19650 + (process.pid % 200)),
  })
  try {
    const page: Page = await app.firstWindow()
    await waitShellReady(page)
    const workbench = page.locator('[data-dswf-workbench]').first()
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    const phase = await stablePhase(page)
    // 前置门：hero 相位 ⟺ host forge:projects 通道可用（零项目 + 通道活 = hero；
    // 通道缺席 = fail-soft session——2.12 实证，台账「前置缺口」节）。留痕跳过，不弱化断言。
    test.skip(
      phase !== 'hero',
      '前置缺口：host 侧 forge:projects/* 通道未装配（main.ts 接线 + core 插件入 profile）——live 相位 fail-soft session，hero/⑤/已注册标记三组记账转正（SMOKE-LEDGER.md）',
    )

    // ── UF-2 AC1/AC2：首次启动（无项目）→ 中区 hero；CTA → 打开添加项目流程 ──
    await expect(page.locator('[data-dswf-hero]').first()).toBeVisible()
    await expect(page.locator('.dswf-session-panel')).toHaveCount(0)
    await page.locator('[data-dswf-cta="add-project"]').click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()

    // 走查至 legacy-app（home → … → 夹具根 → 选中）
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixture.split('\\').at(-1) as string)
    await dirRow(page, 'legacy-app').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    const legacyDir = join(fixture, 'legacy-app')
    await expect(page.locator('[data-dswf-rf-ws]')).toHaveValue(legacyDir)

    // ── L814 ⑤ 确认入库（M0 载体，台账 #179：原型 db 直查 → RPC 注册结果 + 左栏项目行）──
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="executing"]')).toBeVisible()
    // L820 ⑤ 反馈（载体适配，台账 #180：原型 toast → M0 成功反馈面板 + 自动关闭）
    await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    // UF-2 AC3：注册成功即 hero 消退不残留（项目数驱动相位翻转）
    await expect(workbench).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })
    await expect(page.locator('[data-dswf-hero]')).toHaveCount(0)
    // 落位证据 = 左栏项目树出现注册项目（M0 载体——原型 window.FORGE.db 直查的适配）
    await expect(page.locator('.dswf-sidebar-project', { hasText: 'legacy-app' }).first()).toBeVisible({
      timeout: 30_000,
    })

    // ── L766 ① 已注册目录带标记（注册后实机：重开向导 → 目录行「已注册」标记）──
    await page.locator('[data-dswf-nav="add-project"]').first().click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixture.split('\\').at(-1) as string)
    const legacyRow = page.locator('.dswf-fb-item', { hasText: 'legacy-app' }).first()
    await expect(legacyRow).toHaveAttribute('data-registered')
    await expect(legacyRow.locator('.dswf-fb-reg', { hasText: '已注册' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.dswf-ap')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
  }
})
