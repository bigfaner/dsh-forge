// @feature:mobile-remote-approval @web-e2e
// fix-22 复现腿：配对链 cookie-jar 走通——/pair 302 → 官方 BrowserAuth 303 → 落地页 200，
// dswf_forge_remote=1 与官方 dsh-auth 会话 cookie 全程在 jar 存活（curl -c cookie-jar 模拟链
// 的 Playwright 形态；bug cbb9131e 分诊面：本链本机绿 → 真机断点收敛到手机浏览器 cookie
// 面/落地端，决策链日志（child.ts /forge-remote-log 信箱 + web main.ts 决策行）落宿主日志回放）。
// 载体：预写 forge-settings.json（remoteApproval.enabled=true）直启——装配期读数即全卡绑定，
// 不经桌面 UI 开关（旅程 spec 的开关段承载开启→重启语义，本 spec 只承载 HTTP 链）。
import { mkdtempSync, writeFileSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { rmDirBestEffort } from '../support/cleanup.js'

/** 本机非回环 IPv4（外部设备形态替身；无 = undefined） */
function lanAddressOf(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) return net.address
    }
  }
  return undefined
}

test('配对链 cookie-jar：/pair 302（Set-Cookie dswf_forge_remote）→ BrowserAuth 303 → 落地 200 + 双 cookie 存活', async () => {
  test.setTimeout(240_000)
  expect(lanAddressOf(), '本机非回环 IPv4 在场（外部设备形态替身）').toBeTruthy()
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fix22-ud-'))
  // fix-3 重启生效形态的装配期读数源：预写配置 = 首启即全卡绑定 + /pair 缝注册
  writeFileSync(join(userData, 'forge-settings.json'), JSON.stringify({ remoteApproval: { enabled: true } }), 'utf8')
  let app: ElectronApplication | undefined
  try {
    ;({ app } = (await (async () => {
      const launched = await launchHost({ userData })
      return { app: launched.app }
    })()) as { app: ElectronApplication })
    const context = app.context()
    const pairUrl = await context.pages()[0]!.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { getBootManifest(): Promise<{ remotePairUrl?: string }> } }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      return (await forge.getBootManifest()).remotePairUrl
    })
    expect(pairUrl, 'boot manifest 携官方配对地址（全卡绑定 + LAN IPv4）').toBeTruthy()
    const jar = context.request
    const pairRes = await jar.get(pairUrl as string, { maxRedirects: 0 })
    expect(pairRes.status(), '/pair 校验通过 = 302').toBe(302)
    const pairSetCookie = pairRes.headersArray().find((h) => h.name.toLowerCase() === 'set-cookie')?.value ?? ''
    expect(pairSetCookie, '/pair 成功面 Set-Cookie dswf_forge_remote=1').toContain('dswf_forge_remote=1')
    const authTarget = pairRes.headers()['location']
    expect(authTarget, '302 目标携认证 token').toContain('token=')
    const authRes = await jar.get(authTarget, { maxRedirects: 0 })
    expect(authRes.status(), 'BrowserAuth 兑现 = 303 剥查询串').toBe(303)
    const landingUrl = new URL(authRes.headers()['location'], authTarget).href
    const landing = await jar.get(landingUrl)
    expect(landing.status(), '落地页 200').toBe(200)
    const landingCookies = await context.cookies(landingUrl)
    expect(
      landingCookies.some((c) => c.name === 'dswf_forge_remote' && c.value === '1'),
      'dswf_forge_remote=1 跨 303 在 cookie jar 存活（入口分流谓词读数前提）',
    ).toBe(true)
    expect(
      landingCookies.some((c) => c.name.startsWith('dsh-auth-')),
      '官方 BrowserAuth 会话 cookie 在 jar（认证成立证据）',
    ).toBe(true)
    const landingHtml = await landing.text()
    expect(
      landingHtml.includes('assets/index-') || landingHtml.includes('forge-client'),
      '落地页承载产品入口（vite 主入口/产品 client 脚本任一在场）',
    ).toBe(true)
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
  }
})
