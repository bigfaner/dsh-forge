// 3.8 M1 集成 e2e —— 知识视图填入（UF-6 浏览面挂载）+ UF-4 召回 tab 数据接线。
// 断言源 = 任务 3.8 AC（AC-1 知识视图浏览面/UF-5 回归、AC-3 抽屉跳转、AC-5 无召回空态）；
// 三方一致（AC-2：事件 ↔ tab ↔ 热度）与即时累积实机走查（AC-4：发送消息触发召回）的
// 数据面 = dogfood 链路（4.2，SMOKE-LEDGER §3 L497–L536 归属）——本套件承载结构/接线/
// 空态面 + 条件留痕的数据面（§5 前置缺口：host forge:knowledge/*·forge:projects/* 通道
// 未装配期，组二留痕 skip；UI 侧三方投影一致性由 recall-model 单测 pin）。
// 隔离：独立 userData + 独立端口（e2e 单实例纪律，沿 smoke-skeleton.spec）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/** 壳 boot 就绪链（沿 smoke-skeleton.spec 同径） */
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

/**
 * 官方首启引导遮罩处置（host 集成转正 4.2/fix-1 后 fresh userData 必现，未收起即拦截
 * 一切指针交互——locator 可解析但 click 恒超时，4.2 实证）：
 * 1. 「预览版说明」= 叠层预确认（`ui-settings-general.welcomeNoticeVersion` 等值预确认，
 *    沿 flywheel.spec dogfood 同径）——隔离 userData 内点「继续」的确认写回不可依赖
 *    （设置写路径 quirk，4.2 探针实证：点击成功模态不退），运行期收不掉，只能预免。
 * 2. 「添加一个 API Key」onboarding（deepseek-official 凭据缺席触发）= 运行期点
 *    「稍后配置」本地收起（fallback 循环，窗口期轮询——模态挂载可晚于工作台可见数秒）。
 */
const WELCOME_NOTICE_ACK_VERSION = '2026-09-28.1' // 0.2.0-rc.2 实测值（flywheel.spec 同源）

/** 预确认叠层落地（返回路径——launchHost env DSH_FORGE_PATCH_FILES 消费；finally 删） */
function writeAckOverlay(): string {
  const target = join(
    tmpdir(),
    `dsh-forge-e2e-ack-${process.pid}-${Math.random().toString(36).slice(2, 8)}.yml`,
  )
  writeFileSync(
    target,
    [
      '# e2e 预确认叠层：官方首启「预览版说明」版本等值预确认（免遮罩拦截指针）',
      '- id: ui-settings-general',
      '  config:',
      `    welcomeNoticeVersion: ${WELCOME_NOTICE_ACK_VERSION}`,
      '',
    ].join('\n'),
    'utf8',
  )
  return target
}

/** 运行期模态收起（fallback：API Key onboarding「稍后配置」本地收起；预览版说明归叠层预免） */
async function dismissOnboardingModals(page: Page): Promise<void> {
  const deadline = Date.now() + 15_000
  for (let dismissed = 0; dismissed < 3; dismissed++) {
    const dismissButton = page
      .locator('[role="dialog"] button', { hasText: /^稍后配置$/ })
      .first()
    while (!(await dismissButton.isVisible().catch(() => false))) {
      if (Date.now() > deadline) return // 窗口期内无模态 = 无 API Key onboarding（凭据在场面）
      await page.waitForTimeout(500)
    }
    await dismissButton.click({ timeout: 10_000 })
    await page.waitForTimeout(1_000)
  }
}

/** 相位稳定门（settling 收敛） */
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

/** 工作台桥派发（左栏导航同径转移面——无产品会话行期的载体适配，台账 #12/#99） */
async function bridgeDispatch(page: Page, type: string): Promise<void> {
  await page.evaluate((eventType) => {
    const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } })
      .__DSH_FORGE_WORKBENCH__
    bridge?.dispatch({ type: eventType })
  }, type)
}

/** 组二知识夹具：{root}/demo-proj/.knowledge/{前端,后端}/…（frontmatter 最小契约：summary+keywords） */
function makeKnowledgeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kn-'))
  const kn = join(root, 'demo-proj', '.knowledge')
  mkdirSync(join(kn, '前端'), { recursive: true })
  mkdirSync(join(kn, '后端'), { recursive: true })
  writeFileSync(
    join(kn, '前端', 'deploy.md'),
    '---\ntitle: 部署规范\nsummary: 项目部署流程与上线检查单\nkeywords:\n  - 部署\n  - 上线\n---\n\n# 部署规范\n\n部署前核对回滚预案。\n',
    'utf8',
  )
  writeFileSync(
    join(kn, '后端', 'rollback.md'),
    '---\ntitle: 回滚手册\nsummary: 服务回滚步骤与注意事项\nkeywords:\n  - 回滚\n---\n\n# 回滚手册\n\n按版本逐级回滚。\n',
    'utf8',
  )
  return root
}

/** 浏览器行定位（名称精确匹配——沿 smoke-skeleton.dirRow 口径） */
function dirRow(page: Page, name: string): ReturnType<Page['locator']> {
  return page.locator('.dswf-fb-item', { hasText: new RegExp(`(?:^|\\s)${name}(?:\\s|$)`) }).first()
}

/** 双击进入目录并等待列举就绪 */
async function enterDir(page: Page, name: string): Promise<void> {
  await dirRow(page, name).dblclick()
  await expect(page.locator('.dswf-fb-crumb-current')).toHaveText(name, { timeout: 15_000 })
}

/**
 * host 数据通道探测（组二门）：forge:knowledge/listEntries + forge:projects/list 两面任一
 * 未注册（ipcRenderer invoke 拒绝 "No handler"）= 前置缺口在期 → 组二留痕 skip（§5 转正条件）。
 * 通道在场判定只认 "No handler" 拒绝面：域层 fail-loud 裸错（如 __probe__ 项目 id 未命中
 * projects 行——bare Error 不入信封、经 invoke 拒绝上抛）与 typed 信封 {ok:false} 都是通道
 * 在场的证明（4.2 转正实证：裸错曾被误读为缺口致组二恒 skip）。
 */
async function hostDataChannelsLive(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<unknown> } }).dshForge
    if (forge === undefined) return false
    const arrived = async (channel: string, payload?: unknown): Promise<boolean> => {
      try {
        await forge.invoke(channel, payload)
        return true
      } catch (error) {
        return !String(error).includes('No handler')
      }
    }
    return (
      (await arrived('forge:projects/list')) &&
      (await arrived('forge:knowledge/listEntries', { projectId: '__probe__' }))
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 组一：知识视图填入 + 召回 tab 接线（实机——无 host 数据通道亦可全绿：无项目锚 = 引导
// 空态、无会话锚 = 静态空态；UF-5 互换回归由 smoke-skeleton 组一承载，此处断 3.8 填入面）
// ─────────────────────────────────────────────────────────────────────────────
test('3.8·知识视图浏览面挂载 + 召回 tab 接线（无锚降级面）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kni-'))
  const ackOverlay = writeAckOverlay()
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_PATCH_FILES: ackOverlay,
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19670 + (process.pid % 200)),
  })
  const pageErrors: string[] = []
  try {
    const page: Page = await app.firstWindow()
    page.on('pageerror', (error) => pageErrors.push(String(error)))
    await waitShellReady(page)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    await dismissOnboardingModals(page)
    const phase = await stablePhase(page)

    // AC-1：知识视图 = UF-6 浏览面装配壳（M0 占位已替换）；无项目锚 = 引导空态（确定性：
    // 零注册 ⟺ 无锚——host 通道在期亦然），壳结构位在场
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    const knowledgeView = page.locator('[data-dswf-knowledge-view]').first()
    await expect(knowledgeView).toBeVisible()
    await expect(page.locator('.dswf-zones[data-dswf-view="knowledge"]').first()).toBeAttached()
    // 无项目锚 = 引导空态（锚属性 none——浏览面不出场不拉取不炸壳）
    await expect(knowledgeView).toHaveAttribute('data-dswf-kn-anchor', 'none')
    await expect(page.locator('[data-dswf-knowledge-view]')).toContainText('尚未锚定项目')
    // UF-5 回归（不褪色）：知识模式右栏强制隐藏（已展开也隐藏——此处收起态进入）
    await expect(page.locator('[data-dswf-dock="hidden"]').first()).toBeAttached()

    // UF-5 回归（不褪色）：切回会话视图 → 右栏恢复收起（知识视图让位结束）
    await bridgeDispatch(page, 'show-session')
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-knowledge-view]').first()).toBeHidden()
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()

    // 召回 tab 接线（session 相位分支——hero 相位会话面板不出场）：tab 激活 → pane 呈现
    // 3.8 数据面（无会话锚 = 静态空态；通道缺口期有锚 = fail-soft 错误条——两态均非占位破洞）
    if (phase === 'session') {
      await page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
      await expect(page.locator('[data-dswf-pane="recall"]')).toBeVisible()
      const recallFace = page.locator(
        '[data-dswf-pane="recall"] [data-dswf-recall-face], [data-dswf-pane="recall"] [data-dswf-recall-tab]',
      )
      await expect(recallFace.first()).toBeVisible()
      // AC-5 面：无会话锚 → 「本会话暂无召回」空态（通道缺口期有锚 = 错误条，两态择一在场）
      const faceKind = await recallFace.first().getAttribute('data-dswf-recall-face')
      if (faceKind === 'empty') {
        await expect(page.locator('[data-dswf-pane="recall"]')).toContainText('本会话暂无召回')
      }
    }

    expect(pageErrors, '无页面 JS 错误（pageerror 面）').toEqual([])
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
    rmSync(ackOverlay, { force: true })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 组二（条件留痕）：注册项目 + 真数据浏览面（卡片/抽屉）+ AC-5 无召回空态——host 数据通道
// 装配后转正（§5；跳过门 = 两面通道探测拒绝）。三方一致（AC-2）与即时累积（AC-4）的
// 事件数据面归 dogfood（4.2）——召回 tab 真数据行/热度/跳转断言随其转正入池。
// ─────────────────────────────────────────────────────────────────────────────
test('3.8·注册项目 → 知识浏览真数据 + 详情抽屉 + 无召回空态（前置 host 数据通道装配）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-knix-'))
  const fixture = makeKnowledgeFixture()
  const ackOverlay = writeAckOverlay()
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_PATCH_FILES: ackOverlay,
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19690 + (process.pid % 200)),
  })
  try {
    const page: Page = await app.firstWindow()
    await waitShellReady(page)
    await expect(page.locator('[data-dswf-workbench]').first()).toBeVisible({ timeout: 60_000 })
    await dismissOnboardingModals(page)
    await stablePhase(page)
    // 前置门：host forge:projects/* + forge:knowledge/* 通道装配（core 插件入 profile +
    // main.ts 接线——独立 host 集成任务，SMOKE-LEDGER §5）。留痕跳过，不弱化断言。
    test.skip(
      !(await hostDataChannelsLive(page)),
      '前置缺口：host 侧 forge:projects/* 与 forge:knowledge/* 通道未装配（SMOKE-LEDGER §5 转正条件——组二随 host 集成任务落位自动转正）',
    )

    // ── 注册知识夹具项目（向导两段：浏览器 → 表单默认值 → 确认——沿 smoke 组二/三走查径） ──
    await page.locator('[data-dswf-nav="add-project"]').first().click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
    for (const segment of ['AppData', 'Local', 'Temp']) {
      await enterDir(page, segment)
    }
    await enterDir(page, fixture.split('\\').at(-1) as string)
    await dirRow(page, 'demo-proj').click()
    await page.locator('.dswf-fb-confirm', { hasText: '下一步' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="form"]')).toBeVisible()
    await page.locator('.dswf-rf-confirm', { hasText: '确认' }).click()
    await expect(page.locator('.dswf-ap[data-dswf-ap="success"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.dswf-ap')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.locator('[data-dswf-workbench]')).toHaveAttribute('data-dswf-phase', 'session', { timeout: 30_000 })

    // ── AC-1：知识视图 = 浏览面真数据（项目锚 = 唯一项目兜底；索引直读 → 卡片网格） ──
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    const knowledgeView = page.locator('[data-dswf-knowledge-view]').first()
    await expect(knowledgeView).toBeVisible()
    // 锚非 none（唯一项目兜底——项目 id 运行期未知，断言取「非 none」语义）
    await expect
      .poll(async () => knowledgeView.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
      .not.toBe('none')
    await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2, { timeout: 30_000 })
    await expect(page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first()).toBeVisible()

    // ── AC-3（浏览路径）：点卡片 → 详情抽屉滑入（摘要块在场）；Esc 关闭回网格 ──
    await page.locator('[data-dswf-entry]', { hasText: '部署规范' }).first().click()
    await expect(page.locator('[data-dswf-kn-drawer]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-kn-summary]').first()).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-dswf-kn-drawer]')).toHaveCount(0)

    // ── AC-5：召回 tab 无召回会话 =「本会话暂无召回」（真通道 + 零事件 = 确定性空态） ──
    await bridgeDispatch(page, 'show-session')
    await page.locator('.dswf-session-panel [role="tab"]', { hasText: '知识召回' }).click()
    await expect(page.locator('[data-dswf-pane="recall"]')).toContainText('本会话暂无召回', { timeout: 30_000 })
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
    rmSync(fixture, { recursive: true, force: true })
    rmSync(ackOverlay, { force: true })
  }
})
