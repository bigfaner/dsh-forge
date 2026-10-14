// @feature:mobile-remote-approval @web-e2e
// mobile-remote-approval 1.8 负样例组 e2e（自 1.5 拆出，用户裁决 2026-10-14）：
//   ① 默认关闭不可达——产品初始形态远程关闭，外部访问宿主端口不可达任何产品页面；
//   ② 未配对被拒——远程开启（重启生效形态）后，未配对设备访问被拒、不可见任何内容；
//   ③ 关闭后再拒——远程关闭（重启生效，绑定收回）后，已配对设备后续请求被拒。
//
// 载体边界（与 1.5 journey spec 同一装配，分段 grep 复用）：
// - 外部设备以本机非回环 IPv4 + 宿主端口 HTTP 请求为替身（probeReachable 有界探针）。
// - 「已配对设备」替身：桌面配对会话的官方令牌 cookie（page.context().cookies() 读数），
//   关闭重启后携原凭据重放仍须被拒（不可达 = 连接层拒，覆盖一切凭据形态）。
// - fix-3 重启生效形态（用户裁决 2026-10-14）：开关写产品自有配置（forge-settings.json
//   remoteApproval.enabled），宿主装配期读之决定 webserver 绑定；开关段断言 = 配置写读 +
//   pending 提示态；真实监听/收回经同 userData 重启旅程段验证。
// - 断言真实 HTTP 不可达/被拒语义，禁弱化：可达即必须非 200 且不含产品内容，
//   不可达之外的任何放行产品页形态都是失败。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { rmDirBestEffort } from '../support/cleanup.js'

const REMOTE_ENTRY = '.dswf-remote-entry'
const REMOTE_PANEL = '.dswf-remote-panel'
const REMOTE_SWITCH = '.dswf-remote-switch'

/** 工作区夹具目录（{root}/<name>——注册链承接 canonical 化） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mra-neg-'))
  mkdirSync(join(root, name, '.knowledge'), { recursive: true })
  writeFileSync(join(root, name, 'fixture-file.txt'), 'sentinel', 'utf8')
  return root
}

/** 本机非回环 IPv4（外部设备访问形态替身；无 = undefined） */
function lanAddressOf(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) return net.address
    }
  }
  return undefined
}

/** 宿主 webserver 端口（boot manifest.url 读数——preload 桥单源） */
async function hostPortOf(page: Page): Promise<number> {
  const url = await page.evaluate(async () => {
    const forge = (globalThis as { dshForge?: { getBootManifest(): Promise<{ url: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    return (await forge.getBootManifest()).url
  })
  const port = new URL(url).port
  expect(port, `boot manifest url 携带端口（${url}）`).not.toBe('')
  return Number(port)
}

/** 产品配置读数（forge:settings/get——preload RPC 单门；remoteApproval.enabled 布尔断言源） */
async function remoteConfigEnabledOf(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke('forge:settings/get')
    if (envelope.ok !== true) throw new Error(`forge:settings/get !ok：${JSON.stringify(envelope)}`)
    const section = envelope.data as { remoteApproval?: { enabled?: unknown } } | undefined
    return section?.remoteApproval?.enabled === true
  })
}

/** 外部地址可达性探针（5s 有界——refused/timeout = 不可达；extraHeaders 供凭据重放） */
async function probeReachable(url: string, extraHeaders?: Record<string, string>): Promise<{
  reachable: boolean
  status?: number
  bodyIncludesProduct?: boolean
  detail: string
}> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000), headers: extraHeaders })
    const text = res.status === 200 ? await res.text() : ''
    return {
      reachable: true,
      status: res.status,
      bodyIncludesProduct: text.includes('forge-client') || text.includes('dswf-rview'),
      detail: `HTTP ${String(res.status)}`,
    }
  } catch (error) {
    return { reachable: false, detail: String((error as Error).cause ?? error) }
  }
}

/** 未配对/已配对凭据请求不得放行产品页的共享断言（负样例②③的「被拒」语义） */
function expectRejected(probe: Awaited<ReturnType<typeof probeReachable>>, label: string): void {
  if (probe.reachable) {
    expect(probe.status, `${label}：HTTP 请求非 200（官方令牌门拒）`).not.toBe(200)
    expect(probe.bodyIncludesProduct ?? false, `${label}：响应体不含产品受限内容`).toBe(false)
  } else {
    expect(probe.reachable, `${label}：外部地址不可达（${probe.detail}）`).toBe(false)
  }
}

/** 面板开关切换（写产品自有配置——重启生效形态；遮罩模态重挂先处置——launch 链同款） */
async function toggleRemote(page: Page, want: boolean, label: string): Promise<void> {
  await dismissOnboardingModals(page)
  await page.locator(REMOTE_ENTRY).click()
  const panel = page.locator(REMOTE_PANEL)
  await expect(panel, `${label}：远程面板开`).toBeVisible({ timeout: 10_000 })
  await panel.locator(REMOTE_SWITCH).click()
  await expect.poll(() => remoteConfigEnabledOf(page), `${label}：产品配置读数 = ${want}`)
    .toBe(want, { timeout: 15_000 })
  await expect(page.locator(REMOTE_ENTRY), `${label}：图标转待重启提示态（pending——重启生效形态）`)
    .toHaveAttribute('data-phase', 'pending', { timeout: 30_000 })
}

test('负样例①：默认关闭不可达——初始形态外部访问宿主端口不可达任何产品页面', async () => {
  test.setTimeout(180_000)
  const root = makeWorkspaceFixture('负默认')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mra-neg1-ud-'))
  let app: ElectronApplication | undefined
  let page: Page
  try {
    const lanIp = lanAddressOf()
    expect(lanIp, '本机非回环 IPv4 在场（外部设备形态替身）').toBeTruthy()
    ;({ app, page } = await launchHost({ userData }))
    await expect(page.locator(REMOTE_ENTRY), '默认态手机图标在 footer.action 槽（相位入口）').toBeAttached({ timeout: 15_000 })
    expect(await remoteConfigEnabledOf(page), '默认态产品配置 remoteApproval 未开启').toBe(false)
    await expect(page.locator(REMOTE_ENTRY), '默认态 = 灰（off）').toHaveAttribute('data-phase', 'off')
    const port = await hostPortOf(page)
    const lanUrl = `http://${lanIp as string}:${port}/`
    const probe = await probeReachable(lanUrl)
    expect(probe.reachable, `远程关闭：外部地址 ${lanUrl} 不可达任何产品页面（${probe.detail}）`).toBe(false)
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})

test('负样例②③：未配对被拒 → 关闭重启收回后，已配对设备凭据重放仍被拒', async () => {
  test.setTimeout(420_000)
  const root = makeWorkspaceFixture('负开关')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mra-neg23-ud-'))
  let app: ElectronApplication | undefined
  let page: Page
  try {
    const lanIp = lanAddressOf()
    expect(lanIp, '本机非回环 IPv4 在场（外部设备形态替身）').toBeTruthy()
    const lanIpChecked = lanIp as string

    // ── 前置：开启远程（重启生效形态）→ 重启进真监听 ──
    ;({ app, page } = await launchHost({ userData }))
    await toggleRemote(page, true, '负样例②前置')
    await closeApp(app)
    app = undefined
    ;({ app, page } = await launchHost({ userData }))
    await expect(page.locator(REMOTE_ENTRY), '重启后图标转监听（listening——装配期绑定生效）')
      .toHaveAttribute('data-phase', 'listening', { timeout: 30_000 })
    let port = await hostPortOf(page)
    let lanUrl = `http://${lanIpChecked}:${port}/`

    // ── 负样例②：未配对设备访问被拒、不可见任何内容 ──
    const unpaired = await probeReachable(lanUrl)
    if (!unpaired.reachable) {
      throw new Error(`重启后外部地址仍不可达（${unpaired.detail}）——装配期 remoteApproval.enabled 读数未生效全卡绑定，负样例②前置不成立`)
    }
    expectRejected(unpaired, '负样例②未配对')

    // ── 捕获已配对设备替身凭据：桌面配对会话的官方令牌 cookie ──
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    // ── 负样例③前置：关闭远程（重启生效，绑定收回）→ 重启 ──
    const origin = await page.evaluate(() => window.location.origin)
    await page.goto(origin + '/')
    await toggleRemote(page, false, '负样例③前置')
    await closeApp(app)
    app = undefined
    ;({ app, page } = await launchHost({ userData }))
    await expect(page.locator(REMOTE_ENTRY), '重启收回后图标回灰（off）').toHaveAttribute('data-phase', 'off', { timeout: 30_000 })
    expect(await remoteConfigEnabledOf(page), '关闭后产品配置读数 = false').toBe(false)
    port = await hostPortOf(page)
    lanUrl = `http://${lanIpChecked}:${port}/`

    // ── 负样例③：已配对设备后续请求被拒——裸请求 + 原凭据重放均不得放行产品页 ──
    const afterOff = await probeReachable(lanUrl)
    expect(afterOff.reachable, `关闭重启后外部地址不可达（${afterOff.detail}）`).toBe(false)
    const replay = await probeReachable(lanUrl, cookieHeader ? { cookie: cookieHeader } : undefined)
    expectRejected(replay, '负样例③已配对凭据重放')
    if (replay.reachable) {
      throw new Error(`关闭重启后携原配对凭据仍可达（${replay.detail}）——绑定收回未生效`)
    }
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})
