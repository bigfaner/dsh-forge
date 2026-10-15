// @feature:mobile-remote-approval @web-e2e
// fix-22 真机修复链：/pair 302 → /remote/（携 token）→ 官方根交换 303 → 官方 index 弹射 →
// /remote/ 移动面（产品 dist 静态服务）200。dswf_forge_remote=1 与官方 dsh-auth 会话 cookie
// 全程在 jar 存活；/remote/ 入口 no-store + 产品入口脚本在场（bug cbb9131e 架构级根因：
// webserver 面从未服务产品 bundle——本链曾假阴性于官方前端落地页）。
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

test('配对链 cookie-jar：/pair 302 → /remote/ 换官方根 → 303 → 弹射 /remote/ 移动面 200 + 双 cookie 存活', async () => {
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
    const remoteEntry = pairRes.headers()['location']
    expect(remoteEntry, '302 目标 = /remote/ 移动面（authenticatedUrl 包住）').toContain('/remote/')
    expect(remoteEntry, '302 目标携认证 token').toContain('token=')
    // /remote/ 携 token 到达 → 302 官方根交换（authorizeIndex 只认 GET /）
    const exchangeRes = await jar.get(remoteEntry as string, { maxRedirects: 0 })
    expect(exchangeRes.status(), '/remote/ 携 token → 302 官方根交换').toBe(302)
    const authTarget = exchangeRes.headers()['location']
    expect(authTarget, '根交换目标不落 /remote（官方 authorizeIndex 挂点）').not.toContain('/remote')
    const authRes = await jar.get(authTarget, { maxRedirects: 0 })
    expect(authRes.status(), 'BrowserAuth 兑现 = 303 剥查询串').toBe(303)
    const landingUrl = new URL(authRes.headers()['location'], authTarget).href
    const landing = await jar.get(landingUrl)
    expect(landing.status(), '官方落地页 200（弹射脚本承载二次跳转）').toBe(200)
    const landingCookies = await context.cookies(landingUrl)
    expect(
      landingCookies.some((c) => c.name === 'dswf_forge_remote' && c.value === '1'),
      'dswf_forge_remote=1 跨 303 在 cookie jar 存活（入口分流谓词读数前提）',
    ).toBe(true)
    expect(
      landingCookies.some((c) => c.name.startsWith('dsh-auth-')),
      '官方 BrowserAuth 会话 cookie 在 jar（认证成立证据）',
    ).toBe(true)
    expect(
      (await landing.text()).includes('dswf_forge_remote'),
      '官方 index 携弹射脚本（tapIndex 注入——dswf cookie 在场跳 /remote/）',
    ).toBe(true)
    // 二次跳转面：会话 cookie 在 jar 的 /remote/ = 产品 dist 移动面（no-store + 产品入口）
    const remoteRes = await jar.get(new URL('/remote/', landingUrl).href)
    expect(remoteRes.status(), '/remote/ 移动面 200（产品 bundle 经 webserver 面在场）').toBe(200)
    expect(
      remoteRes.headers()['cache-control'],
      '入口 HTML no-store（防手机端缓存旧态）',
    ).toContain('no-store')
    const remoteHtml = await remoteRes.text()
    expect(
      remoteHtml.includes('assets/index-') || remoteHtml.includes('forge-client'),
      '移动面承载产品入口（vite 主入口/产品 client 脚本任一在场）',
    ).toBe(true)
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
  }
})
