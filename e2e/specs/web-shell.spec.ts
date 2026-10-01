// 任务 1.5 e2e 自证（Playwright _electron，S2 spike 实跑判定）：
//  AC1+AC2 自有壳 dist 于 dsh-forge://app/ 载入；宿关注入的官方 ui-* bundle 于壳内渲染
//    （官方 ui-theme 令牌样式入页 + 官方 sidebar 组件可见）
//  AC3 carrier 承载 dsh 面 RPC 往返（__DSH_TRANSPORT__ 就位 + 连接层 /api 通道一往返）
//  掌舵链自证：产品 client 插件入图激活（__DSH_FORGE_CLIENT__ 标记 = Loader 激活证据）
// 2.7 增面：槽位路线 A 实跑判定——产品面板占用官方 sidebar 壳 sidebar.workspaces 洞位
//  （壳仍在 = 折叠/导航/快捷键继承；洞内 = 产品面板 data-dswf-sidebar）。
// 隔离：独立 userData（e2e 单实例纪律，沿 host-boot.spec）。
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

test('AC1–AC3 dev 形态：自有壳载入 + 官方 ui-* 渲染 + carrier RPC 往返 + 产品插件掌舵激活', async () => {
  test.setTimeout(180_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-shell-'))
  const app = await launchHost({
    DSH_FORGE_DEV_PROFILE: 'dev',
    DSH_FORGE_USER_DATA: userData,
    DSH_FORGE_PORT: String(19810 + (process.pid % 200)),
  })
  try {
    const page: Page = await app.firstWindow()
    // 自有壳（非官方 webserver 前端）：自定义 scheme 载入 + 就绪门预建
    await page.waitForFunction(() => (globalThis as { __DSH_BOOT_READY__?: unknown }).__DSH_BOOT_READY__ !== undefined, undefined, { timeout: 60_000 })
    // AC2 前置链：注入表生效（门放行）→ 模块系统 live → 官方组合 + 产品插件激活（掌舵链）
    await page.waitForFunction(() => {
      const g = globalThis as { __ModuleLoader__?: { mode: string }; __DSH_FORGE_CLIENT__?: unknown }
      return g.__ModuleLoader__?.mode === 'live' && g.__DSH_FORGE_CLIENT__ !== undefined
    }, undefined, { timeout: 90_000 })

    // AC2a 官方 ui-theme 激活（令牌样式入页 = 官方 client bundle 于壳内生效的 DOM 证据）
    const themeSheets = await page.evaluate(() =>
      document.querySelectorAll('style[data-plugin="@deepseek-ai/dsh-client-ui-theme"]').length)
    expect(themeSheets).toBeGreaterThan(0)

    // AC2b 官方组件可见：ui-sidebar 面板导航（官方布局渲染进 #root）
    await expect(page.locator('#root nav[aria-label]').first()).toBeVisible({ timeout: 30_000 })

    // AC3 carrier 就位（G1 第 2 项：ownsHost + streamBaseUrl = 已认证 web 面 origin）
    const carrier = await page.evaluate(() =>
      (globalThis as { __DSH_TRANSPORT__?: { ownsHost: boolean; streamBaseUrl: string } }).__DSH_TRANSPORT__)
    expect(carrier?.ownsHost).toBe(true)
    expect(carrier?.streamBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    // AC3 一条 dsh 自有面调用往返：连接层 /api 通道（文档相对路由 → 壳 scheme → Host 转发 + cookie）
    const rpc = await page.evaluate(async () => {
      const response = await fetch('api/session/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session/list', payload: { args: { _request: {} } } }),
      })
      const body = (await response.json()) as { type?: string; rpcId?: string; result?: { ok?: boolean; value?: { items?: unknown[] } } }
      return { status: response.status, type: body.type, ok: body.result?.ok, items: body.result?.value?.items }
    })
    expect(rpc.status).toBe(200)
    expect(rpc.type).toBe('server-response')
    expect(rpc.ok).toBe(true)
    expect(Array.isArray(rpc.items)).toBe(true)

    // 2.7 槽位路线 A 实跑判定：官方 sidebar 壳在场（上方 nav 可见 = 壳与折叠/导航/快捷键继承）
    // 且 workspaces 洞位被产品面板占用（data-dswf-sidebar 宽态/rail 态 + 知识库入口在场；
    // 官方 ui-workspace 浏览器被 priority -100 影子——单测面 pin，此处在场断言取 DOM 证据）
    await expect(page.locator('#root [data-dswf-sidebar]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('#root [data-dswf-sidebar] [data-dswf-nav="knowledge"]').first()).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
