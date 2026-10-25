// expert-squad 1.50 召唤 e2e 收紧（用户裁决 2026-10-25）：主路径必须官方切换分支，
// 三路设计内降级改显式前置独立用例。
//
// 判据说明（头注正本——替代 1.31 双分支判据）：
// - 旧判据（双分支：官方视图切换 OR 降级条任一 = 触发成立）已废弃。实证：bug 9d9d1bd3
//   （召唤 this 脱绑召唤必败，commit aedd69cb 修）在 e2e 3/3 全绿下漏检——任何召唤失败
//   弹出的降级条都被双分支判据当 fail-soft 通过形态吞掉，主路径用例对「召唤必败」零判别力。
//   （附：前轮 5 红假象另含环境根因——插件 client bundle 陈旧未含 aedd69cb，重建后官方
//   分支真通；bundle 重建已入 pnpm -C packages/plugins/expert-squad build 既有配方。）
// - 主路径（成功前置：dev profile 已装配 HR 预设 preset-hr + 夹具工作区 + 面板数据态）
//   必须断言官方分支。官方切换证据 = HR 预设座位标签（官方 conversation.hero.agentPreset
//   槽座位按钮显预设显示名「HR · 专家管理」——m3 座位形制：healthy 显显示名/缺席回退 id；
//   probe7b 容器链实证 BUTTON[*=seat] > SPAN[*=seatLabel] < heroWorkspaceRow）+ 官方会话
//   视图取代面板（主视图切换卸载）；降级条在场即 fail。注意：会话头 headerActions 投影
//   标签是「非 blank 会话转录面」锚（m3 SC1④），blank 召唤会话（零消息）不出该面——
//   本 spec 锚 = hero 座位标签（probe5 实证 headerActions 空 + agentPresets/select 返回
//   ok:true value:"hr"）。
// - 三路设计内降级各自独立用例、显式构造前置：
//   ① workspace 锚缺席 = test.fixme（前置在 e2e 环境不可构造——官方 dsh home bootstrap
//      恒物化默认工作区行（probe7a：全新空 DSH_FORGE_DSH_HOME 召唤仍过 workspace 守卫），
//      且官方 workspaces store 经 WS 水化非页面 fetch（probe5 boot 期零 workspace list
//      fetch），fix-3 fetch 包装触不到 store——该守卫的覆盖由单元测试 summon-session.test.ts
//      「未找到当前打开的工作区」用例持有，e2e 用例留待环境缝出现（如产品测试钩子裁决）。
//   ② preset 被拒 = test.fixme（注入构造可达且确证命中，但拒绝发生于 openWorkspace 官方
//      视图切换之后——面板已卸载，阶段化引导条现流程不可达（probe8 实证 notice 恒缺席 +
//      零 pageErrors）；引导面归属待产品裁决，编排面返回值由 summon-session.test.ts 持有。
//   ③ open 失败 = openWorkspace 路径注入拒绝（session/create RPC 信封拒绝）——独立用例，
//      阶段化引导条 + 零原始 TypeError + 面板不炸全断言（openWorkspace 失败不触发视图
//      切换，面板保持挂载，引导条可达）。
//   断言：各自阶段化引导条文案 + 零原始 TypeError 文本直出 + 面板不炸 + renderer
//   零未捕获异常（pageErrors 空）。
// 拦截纪律（fix-3 判例）：一律 addInitScript / 页面上下文内包装 window.fetch（禁
// page.route——dsh-forge:// scheme）。官方 dsh 面 RPC = POST /api/<ns/method> 页内 fetch
//（client-request 信封 {type,rpcId,method,payload}——probe5 实证 agentPresets/list、
// agentPresets/select、session/create 全走该径且页内包装可截），包装器按 method 前缀对
// agentPresets/*、session/create 注入 server-response result.ok=false 拒绝信封；注入是否
// 命中经 __xsqRpcLog 显式断言（不静默空转）。
// 原始错误 console.error 留痕 = fix-14 设计内（降级条不直出原文——本 spec 断言条内文本）。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；data 锚单源 = expert-panel.tsx（事实表）。
// @feature expert-squad @web-e2e
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeApp, launchHost } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { SEAT_ROOT } from '../support/m3.js'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'

// ── 面板/召唤锚（expert-panel.tsx data 锚——本 spec 字面量单源） ──
const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const CARD_ANY = '.dswf-card-grid .dswf-xcard'
const SUMMON_BTN = 'button[aria-label="召唤 HR 预设会话"]'
const SUMMON_NOTICE = '[data-dswf-summon-notice]'
/** HR 预设显示名（apps/host/src/profile/presets/hr.patch.yml config.name——座位标签文本） */
const HR_PRESET_LABEL = 'HR · 专家管理'
/** HR 预设座位标签（官方 conversation.hero.agentPreset 槽座位——healthy 显显示名） */
const HR_SEAT_LABEL = `${SEAT_ROOT} button:has-text("${HR_PRESET_LABEL}")`

/** project 层夹具专家档案（面板数据态收敛用——召唤前置 = 面板已激活在数据态）。 */
function expertMd(name: string, title: string): string {
  return [
    '---',
    `name: ${name}`,
    'description: >-',
    '  Fixture expert for summon e2e; delegates when fixture flows are needed.',
    `title: ${title}`,
    'tools: [read, grep]',
    'skills: [review]',
    '---',
    '',
    '## 职责',
    '',
    '夹具人设正文：用于召唤前置数据态的固定文本。',
    '',
  ].join('\n')
}

/** 夹具工作区（两份启用 project 层档案） */
function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-summon-ws-'))
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

/** 启动 → 注册夹具工作区 → 激活面板（数据态收敛）。 */
async function openPanelWithFixture(): Promise<PanelSession> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-xsq-summon-ud-'))
  const wsDir = makeWorkspace()
  const launched = await launchHost({ userData })
  const page = launched.page
  await registerProject(page, wsDir, 'xsq-summon-fixture')
  await dismissOnboardingModals(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场（panellist 注册缝——召唤入口归属面）').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(CARD_ANY).first(), '卡片网格数据态（骨架收敛）').toBeVisible({ timeout: 30_000 })
  return { page, app: launched.app, pageErrors: launched.pageErrors, wsDir, userData }
}

/** 例终收口：closeApp + tmp 夹具清理（尽力而为）。 */
async function closeSession(session: PanelSession): Promise<void> {
  try {
    await closeApp(session.app)
  } catch {
    /* closeApp 尽力而为——进程残留由 Job Object 整树回收兜底 */
  }
  rmSync(session.userData, { recursive: true, force: true })
  rmSync(session.wsDir, { recursive: true, force: true })
}

// ── 官方 RPC 注入包装器（addInitScript 注入——页面加载前后幂等；fix-3 判例形制） ──

type RpcStubMode = 'preset-refuse' | 'open-refuse'

const RPC_HARNESS_SOURCE = `(() => {
  const w = window
  if (w.__xsqRpcHarnessInstalled) return
  w.__xsqRpcHarnessInstalled = true
  w.__xsqRpcLog = []
  w.__xsqRpcStub = null
  const original = w.fetch.bind(w)
  w.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url)
    const raw = typeof init?.body === 'string' ? init.body : ''
    let method = ''
    let rpcId = ''
    try {
      const parsed = JSON.parse(raw)
      method = String(parsed.method ?? '')
      rpcId = String(parsed.rpcId ?? '')
    } catch { /* 非 client-request 信封——原样放行 */ }
    if (method !== '') w.__xsqRpcLog.push(method)
    const stub = w.__xsqRpcStub
    const refuse = (message) => new Response(
      JSON.stringify({ type: 'server-response', rpcId, result: { ok: false, error: { message } } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
    if (stub === 'preset-refuse' && method.startsWith('agentPresets/')) {
      return refuse('xsq e2e stub: HR preset select refused')
    }
    if (stub === 'open-refuse' && method.startsWith('session/create')) {
      return refuse('xsq e2e stub: session open refused')
    }
    return original(input, init)
  }
})()`

interface XsqRpcWin {
  readonly __xsqRpcLog?: string[]
  __xsqRpcStub?: RpcStubMode | null
  readonly __xsqRpcHarnessInstalled?: boolean
}

/** fetch 包装器安装：addInitScript + 已加载页面幂等 evaluate 兜底（panel-detail 同法）。 */
async function installRpcHarness(page: Page): Promise<void> {
  await page.addInitScript(RPC_HARNESS_SOURCE)
  await page.evaluate(RPC_HARNESS_SOURCE)
}

/** 注入开关：null = 全部放行。 */
async function setRpcStub(page: Page, mode: RpcStubMode | null): Promise<void> {
  await page.evaluate((m) => {
    ;(window as unknown as XsqRpcWin).__xsqRpcStub = m
  }, mode)
}

/** 注入命中证据：包装器日志中出现匹配 method（零命中 = 注入空转，断言失败显式暴露）。 */
async function expectRpcIntercepted(page: Page, match: RegExp): Promise<void> {
  await expect
    .poll(
      async () => {
        const log = await page.evaluate(() => [...((window as unknown as XsqRpcWin).__xsqRpcLog ?? [])])
        return log.some((method) => match.test(method))
      },
      { timeout: 30_000, message: `RPC 包装器日志命中 ${String(match)}（注入空转 = 前置构造失败）` },
    )
    .toBe(true)
}

/** 降级引导条收敛：notice 在场 + 阶段化文案命中 + 零原始 TypeError 文本直出（fix-14）。 */
async function expectSummonNotice(page: Page, stagePattern: RegExp): Promise<string> {
  let text = ''
  await expect
    .poll(
      async () => {
        const notice = page.locator(SUMMON_NOTICE)
        if ((await notice.count()) === 0) return false
        text = await notice.innerText()
        return stagePattern.test(text)
      },
      { timeout: 30_000, message: `降级引导条呈现且文案命中 ${String(stagePattern)}` },
    )
    .toBe(true)
  expect(text, '零原始 TypeError 文本直出（fix-14——阶段化人话文案）').not.toContain('Cannot read properties')
  return text
}

// ── step-1（panel-card-grid 迁出断言）：召唤钮可见可触发 ──

test('@feature expert-squad summon step-1：召唤钮在面板头部可见可触发（1.21 装配 onSummon）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await expect(page.locator(PANEL_ROW), 'panellist「专家团」行在场').toBeVisible()
    const summon = page.locator(SUMMON_BTN)
    await expect(summon, '召唤钮在面板头部呈现（onSummon 已装配）').toBeVisible()
    await expect(summon, '召唤钮启用态（非 busy）').toBeEnabled()
    await expect(summon, '召唤钮文案').toHaveText('召唤')
  } finally {
    await closeSession(session)
  }
})

// ── 主路径（收紧判据：必须官方切换分支——降级条在场即 fail） ──

test('@feature expert-squad summon 主路径：HR 预设官方会话切换（座位标签实证；降级条在场即 fail）', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await page.locator(SUMMON_BTN).click()
    // 官方分支证据（9d9d1bd3 收紧——本断言对任何召唤失败必红）：
    // ① HR 预设座位标签在场（conversation.hero.agentPreset 槽座位显显示名——官方
    //    agentPresets/select('hr') 成功投影；回退形态显 id 'hr' 即失败）
    await expect(
      page.locator(HR_SEAT_LABEL).first(),
      `HR 预设座位标签显显示名（${HR_PRESET_LABEL}——官方 select('hr') 成功投影）`,
    ).toBeVisible({ timeout: 60_000 })
    // ② 降级条恒缺席（官方分支成功形态——旧双分支判据在此废弃）
    await expect(page.locator(SUMMON_NOTICE), '官方分支零降级引导条').toHaveCount(0)
    // ③ 官方会话视图取代面板（openWorkspace reuse-or-create 主视图切换——面板卸载）
    await expect(page.locator(PANEL_ROOT), '专家面板被官方会话视图取代（主视图切换）').toHaveCount(0)
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})

// ── 三路设计内降级（独立用例·显式前置——不再作为主路径通过形态） ──

// 降级① workspace 锚缺席：test.fixme（前置 e2e 不可构造——头注判据说明①：官方 dsh home
// bootstrap 恒物化默认工作区行（probe7a 实证），store WS 水化非页面 fetch（probe5 实证）
// 触不到 fix-3 包装缝；守卫覆盖由 summon-session.test.ts 单元用例持有）。
test.fixme('@feature expert-squad summon 降级① workspace 锚缺席：无工作区快照注入 → 阶段化引导条（e2e 前置不可构造——见头注）', async () => {
  test.setTimeout(180_000)
})

// 降级② preset 被拒：test.fixme（前置构造可达、注入确证命中——probe8 实证：拒绝发生于
// openWorkspace 官方视图切换之后，面板已卸载（summonAlive 守卫丢弃 outcome），阶段化引导
// 条在该流程不可达（notice 恒缺席、视图已切换、零 pageErrors/TypeError）。AC 期望的
// 「阶段化文案断言」与现产品语义冲突——preset 阶段拒绝引导面归属（面板外 toast 等）待
// 产品裁决；编排面返回值由 summon-session.test.ts 单元用例持有）。
test.fixme('@feature expert-squad summon 降级② preset 被拒：selectPreset 注入拒绝响应 → 阶段化引导条（引导面现流程不可达——见头注）', async () => {
  test.setTimeout(180_000)
})

test('@feature expert-squad summon 降级③ open 失败：session/create 注入拒绝 → 阶段化引导条', async () => {
  test.setTimeout(180_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    await installRpcHarness(page)
    await setRpcStub(page, 'open-refuse')
    await page.locator(SUMMON_BTN).click()
    // 注入命中证据（session/create 开路 RPC 拒绝信封确已发出）
    await expectRpcIntercepted(page, /^session\/create/)
    await expectSummonNotice(page, /召唤会话打开失败/)
    await expect(page.locator(PANEL_ROOT), '面板根仍挂载').toBeVisible()
    await expect(page.locator(CARD_ANY).first(), '卡片网格仍在场').toBeVisible()
    await expect(page.locator(SUMMON_BTN), '召唤钮退出 busy 回可用').toBeEnabled({ timeout: 10_000 })
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})

// ── Journey 冒烟（恰一条——激活 → 网格 → 官方召唤全依序） ──

test('@feature expert-squad summon 冒烟：激活面板 → 网格数据态 → 官方召唤切换 → 零降级零异常', async () => {
  test.setTimeout(240_000)
  const session = await openPanelWithFixture()
  try {
    const { page } = session
    // 步骤1：激活已在 openPanelWithFixture 依序完成；数据态在场
    await expect(page.locator('.dswf-panel-title'), '面板标题').toHaveText('专家团')
    await expect(page.locator(SUMMON_BTN), '召唤钮在场（头部三段 + 召唤入口）').toBeVisible()
    // 召唤触发（官方分支——冒烟即主路径判据）
    await page.locator(SUMMON_BTN).click()
    await expect(
      page.locator(HR_SEAT_LABEL).first(),
      `HR 预设座位标签显显示名（${HR_PRESET_LABEL}）`,
    ).toBeVisible({ timeout: 60_000 })
    await expect(page.locator(SUMMON_NOTICE), '零降级引导条').toHaveCount(0)
    // 不变量：renderer 零未捕获异常
    expect(session.pageErrors, 'renderer 零未捕获异常').toEqual([])
  } finally {
    await closeSession(session)
  }
})
