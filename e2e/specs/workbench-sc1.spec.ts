// 2.12 SC1 骨架断言组起步（Playwright _electron；逐条对应 smoke-ui.cjs 骨架组最简集）：
//   三区布局组（smoke「三区布局(SC1)」）：左 rail（官方 sidebar 壳 + 产品工作区面板）/
//     中区（SessionPanel 三 tab ⇄ 知识 M0 占位互换）/ 右 dock 默认收起（轨道归零）。
//   视图互换组（smoke SC5 骨架行）：知识入口整体切换 + 右栏联动隐藏（已展开也隐藏）+
//     切回按记忆恢复（UF-5 Validation 三条的实机面）。
//   页签跟随组（dock 轨道相位最简集）：收起 ↔ 展开 toggle + 知识模式强制隐藏 + 恢复
//     （按项目页签集切换的实机驱动随域页签登记后续里程碑；机制面 zones 单测 pin）。
//   hero 组（UF-2）：相位在场时追加 hero + CTA → UF-3 流程 + 取消干净退出断言
//     （受 host 侧 forge:projects/* 通道实装前置——dev profile core 行未转正期相位为
//     fail-soft session，hero 组按相位条件跳过并留痕；通道落地后自动转正）。
// 隔离：独立 userData（e2e 单实例纪律，沿 web-shell.spec）。
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const HOST_DIR = join(ROOT, 'apps', 'host')

const electronBinary = createRequire(join(HOST_DIR, 'package.json'))('electron') as unknown as string

async function launchHost(overrides: Record<string, string>): Promise<ElectronApplication> {
  const { _electron } = await import('@playwright/test')
  return _electron.launch({
    executablePath: electronBinary,
    args: ['.'],
    cwd: HOST_DIR,
    env: { ...process.env, ...overrides } as Record<string, string>,
  })
}

test('SC1 骨架组：三区装配 + 视图互换 + dock 跟随（hero 组按相位条件执行）', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-wb-'))
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19910 + (process.pid % 200)),
  })
  try {
    const page: Page = await app.firstWindow()
    // 壳 boot 链（沿 web-shell.spec 前置）：就绪门 → 模块系统 live → 产品插件激活
    await page.waitForFunction(
      () => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined,
      undefined,
      { timeout: 60_000 },
    )
    await page.waitForFunction(() => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    }, undefined, { timeout: 90_000 })

    // ── 三区装配在场（对应 smoke「三区布局(SC1)」组）──
    // 中区：工作台装配面板占用 main.conversation（影子上场）
    const workbench = page.locator('[data-dswf-workbench]').first()
    await expect(workbench).toBeVisible({ timeout: 60_000 })
    // 工作台桥发布（左栏导航视图切换缝——sidebar-actions 读取面同键）
    expect(
      await page.evaluate(() => typeof (globalThis as { __DSH_FORGE_WORKBENCH__?: unknown }).__DSH_FORGE_WORKBENCH__),
    ).toBe('object')
    // 左 rail：官方 sidebar 壳在场（nav 可见 = 折叠/导航/快捷键继承）+ 产品工作区面板占位
    await expect(page.locator('#root nav[aria-label]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-dswf-sidebar]').first()).toBeVisible()
    // 右 dock：默认收起（轨道归零——UF-7 默认态；元素常挂载，以相位属性断言）
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()

    // 中区相位（hero = 项目数正零；session = fail-soft 计数未知 ≠ 0——host forge:projects
    // 通道未实装期）——两组各自断言其相位语义
    const phase = await workbench.getAttribute('data-dswf-phase')
    expect(['hero', 'session']).toContain(phase)

    if (phase === 'hero') {
      // ── hero 组（UF-2 AC2：呈现 + CTA 打开 UF-3 + 取消干净退出）──
      await expect(page.locator('[data-dswf-hero]').first()).toBeVisible()
      await expect(page.locator('[data-dswf-hero] [data-dswf-cta="add-project"]')).toBeVisible()
      await page.locator('[data-dswf-cta="add-project"]').click()
      await expect(page.locator('.dswf-ap[data-dswf-ap="browser"]')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.dswf-ap')).toHaveCount(0)
      await expect(page.locator('[data-dswf-hero]').first()).toBeVisible()
      // hero 相位下会话面板不出场（呈现判据单一条件——替换呈现）
      await expect(page.locator('.dswf-session-panel')).toHaveCount(0)
    } else {
      // ── 中区会话视图组（smoke「默认中区 = 会话视图」+「tabs = 对话/轨迹/知识召回」）──
      await expect(page.locator('.dswf-session-panel').first()).toBeVisible()
      await expect(page.locator('.dswf-session-panel [role="tab"]')).toHaveCount(3)
      for (const label of ['对话', '轨迹', '知识召回']) {
        await expect(page.locator('.dswf-session-panel [role="tab"]', { hasText: label })).toBeVisible()
      }
      // 官方会话面嵌入配方在场（conversation.content 工厂产物锚——S2 嵌入配方实跑证据）
      await expect(page.locator('[data-conversation-content]').first()).toBeAttached()
    }

    // ── 页签跟随最简集：dock 轨道相位（收起 ↔ 展开 toggle；桥 = 左栏导航同径派发面）──
    await page.evaluate(() => {
      const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } }).__DSH_FORGE_WORKBENCH__
      bridge?.dispatch({ type: 'toggle-right-dock' })
    })
    await expect(page.locator('[data-dswf-dock="expanded"]').first()).toBeAttached()

    // ── 视图互换组（UF-5 三条 Validation 实机面）──
    // ① 知识库入口（左栏产品面板）→ 中区整体切换知识视图（M0 空态占位在场）
    await page.locator('[data-dswf-nav="knowledge"]').first().click()
    await expect(page.locator('[data-dswf-knowledge-m0]').first()).toBeVisible()
    await expect(page.locator('.dswf-zones[data-dswf-view="knowledge"]').first()).toBeAttached()
    if (phase === 'session') {
      await expect(page.locator('.dswf-session-panel').first()).toBeHidden()
    }
    // ② 知识模式右栏不可见（已展开也隐藏）+ 内容常挂载（keep-alive 不卸载）
    await expect(page.locator('[data-dswf-dock="hidden"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-dock] [role="tabpanel"]').first()).toBeAttached()
    // ③ 切回会话视图 → 知识占位让位（keep-alive 隐藏不卸载）+ 右栏按记忆恢复展开
    await page.evaluate(() => {
      const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } }).__DSH_FORGE_WORKBENCH__
      bridge?.dispatch({ type: 'show-session' })
    })
    await expect(page.locator('.dswf-zones[data-dswf-view="session"]').first()).toBeAttached()
    await expect(page.locator('[data-dswf-knowledge-m0]').first()).toBeHidden()
    await expect(page.locator('[data-dswf-dock="expanded"]').first()).toBeAttached()
    // 收回落位（toggle 回收起—— UF-7 默认态回归）
    await page.evaluate(() => {
      const bridge = (globalThis as { __DSH_FORGE_WORKBENCH__?: { dispatch(e: { type: string }): void } }).__DSH_FORGE_WORKBENCH__
      bridge?.dispatch({ type: 'toggle-right-dock' })
    })
    await expect(page.locator('[data-dswf-dock="collapsed"]').first()).toBeAttached()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
