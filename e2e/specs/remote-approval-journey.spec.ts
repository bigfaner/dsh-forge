// @feature:mobile-remote-approval @web-e2e
// mobile-remote-approval 1.5 表层验证 e2e（fix-3 重启生效语义改版）：远程配对→监控→审批
// 旅程一条（提案验收 3/5/7）+ 默认关闭负样例（验收 2）+ 暴露面边界断言（验收 6）。
//
// 载体边界（本 spec 的物理承载，如实口径）：
// - 官方手机端配对认证（token/配对流）无法在 Electron e2e 内以第二浏览器驱动——配对腿以
//   HTTP 层断言承载：远程关 = 宿主仅回环绑定（外部地址连接拒绝，验收 2）；远程开 = 全卡
//   绑定后无凭据 HTTP 请求不被放行产品页（未配对被拒，验收 3 负样例）。
// - fix-3 重启生效形态（用户裁决 2026-10-14）：开关写产品自有配置（forge-settings.json
//   remoteApproval.enabled），宿主装配期读之决定 webserver 全卡绑定——开关段断言 = 配置
//   写入成功 + pending 提示态（data-phase="pending"）；真实监听态经同 userData 重启旅程段
//   验证（关闭后收回同径——验收 7 的自然承载）。
// - 受限移动单页在 Electron 载体（preload 传输面在场）经 `?forgeRemote=1` 直挂进入
//   （main.ts 受限分支），进度/审批断言在该页上执行。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../support/launch.js'
import { dismissOnboardingModals } from '../support/modals.js'
import { registerProject } from '../support/rpc.js'
import { rmDirBestEffort } from '../support/cleanup.js'
import { COMPOSER_INPUT } from '../support/anchors.js'

/** 手机远程入口/面板锚（views/remote/ForgeRemoteEntry.tsx 渲染面字面量） */
const REMOTE_ENTRY = '.dswf-remote-entry'
const REMOTE_PANEL = '.dswf-remote-panel'
const REMOTE_SWITCH = '.dswf-remote-switch'

/** 工作区夹具目录（{root}/<name>——注册链承接 canonical 化） */
function makeWorkspaceFixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mra-'))
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

/** 外部地址可达性探针（5s 有界——refused/timeout = 不可达） */
async function probeReachable(url: string): Promise<{
  reachable: boolean
  status?: number
  bodyIncludesProduct?: boolean
  detail: string
}> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
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

test('远程配对→监控→审批旅程：默认关→开启(待重启)→重启真监听+未配对被拒→受限视图进度+暴露面边界→审批决策→关闭(待重启)→重启收回后被拒', async () => {
  test.setTimeout(420_000)
  const root = makeWorkspaceFixture('远程旅')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-mra-journey-ud-'))
  let app: ElectronApplication | undefined
  let page: Page
  try {
    const lanIp = lanAddressOf()
    expect(lanIp, '本机非回环 IPv4 在场（外部设备形态替身）').toBeTruthy()
    const lanIpChecked = lanIp as string

    // ── 首启：默认关闭负样例（验收 2）──
    ;({ app, page } = await launchHost({ userData }))
    expect(await remoteConfigEnabledOf(page), '默认态产品配置 remoteApproval 未开启').toBe(false)
    await expect(page.locator(REMOTE_ENTRY), '默认态手机图标在 footer.action 槽（相位入口）').toBeAttached({ timeout: 15_000 })
    await expect(page.locator(REMOTE_ENTRY), '默认态 = 灰（off）').toHaveAttribute('data-phase', 'off')
    let hostPort = await hostPortOf(page)
    let lanUrl = `http://${lanIpChecked}:${hostPort}/`
    const offReach = await probeReachable(lanUrl)
    expect(offReach.reachable, `远程关闭：外部地址 ${lanUrl} 不可达（${offReach.detail}）`).toBe(false)

    const project = await registerProject(page, join(root, '远'), '远程旅项目')
    await expect(page.locator('[data-dswf-project]').first(), '注册项目行收敛').toBeVisible({ timeout: 30_000 })

    // ── 旅程①桌面开启远程（fix-3：写产品自有配置——重启生效形态）──
    await page.locator(REMOTE_ENTRY).click()
    let panel = page.locator(REMOTE_PANEL)
    await expect(panel, '远程面板开').toBeVisible({ timeout: 10_000 })
    await panel.locator(REMOTE_SWITCH).click()
    // 断言一：配置写入成功（forge:settings/get 回读 remoteApproval.enabled = true）
    await expect.poll(() => remoteConfigEnabledOf(page), '产品配置写入成功（remoteApproval.enabled = true）')
      .toBe(true, { timeout: 15_000 })
    // 断言二：待重启提示态（data-phase pending——配置↔实际绑定不一致；不伪装 listening）
    await expect(page.locator(REMOTE_ENTRY), '开关后图标转待重启提示态（pending——重启生效形态）')
      .toHaveAttribute('data-phase', 'pending', { timeout: 30_000 })
    await expect(panel.locator('[data-testid="dswf-remote-pending-hint"]'), '面板「重启宿主后生效」提示行在场')
      .toBeVisible({ timeout: 10_000 })
    // 关闭前实况边界：本 boot 未暴露——外部地址仍不可达（pending 不伪装监听）
    const preRestart = await probeReachable(lanUrl)
    expect(preRestart.reachable, `待重启期外部地址仍不可达（${preRestart.detail}——本 boot 未暴露）`).toBe(false)

    // ── 旅程②重启宿主：装配期读配置 → 全卡绑定真监听态 ──
    await closeApp(app)
    app = undefined
    ;({ app, page } = await launchHost({ userData }))
    await expect(page.locator(REMOTE_ENTRY), '重启后图标转监听（listening——装配期绑定生效）')
      .toHaveAttribute('data-phase', 'listening', { timeout: 30_000 })
    hostPort = await hostPortOf(page)
    lanUrl = `http://${lanIpChecked}:${hostPort}/`

    // ── 验收 3 负样例：全卡绑定后未配对设备不被放行产品页 ──
    const unpaired = await probeReachable(lanUrl)
    if (unpaired.reachable) {
      // 全卡绑定后端口可达——未配对（无 token/cookie）请求不得呈现产品页
      expect(unpaired.status, '未配对 HTTP 请求非 200（官方令牌门拒）').not.toBe(200)
      expect(unpaired.bodyIncludesProduct ?? false, '未配对响应体不含产品受限内容').toBe(false)
    } else {
      throw new Error(
        `重启后外部地址仍不可达（${unpaired.detail}）——装配期 remoteApproval.enabled 读数未生效全卡绑定（提案验收 3 前置不成立）`,
      )
    }

    // ── 旅程③手机受限视图：进度（同一状态层）+ 暴露面边界（验收 6）──
    const origin = await page.evaluate(() => window.location.origin)
    await page.goto(`${origin}/?forgeRemote=1`)
    await expect(page.locator('.dswf-rview-title'), '受限单页标题').toHaveText('任务进度', { timeout: 30_000 })
    // 进度列表 = forge:remote/progress 直读（空项目态 = 空态呈现 + 计数行——通道正样例）
    await expect(page.locator('.dswf-rview-list, .dswf-rview-empty').first(), '进度列表/空态在场').toBeAttached({ timeout: 15_000 })
    // 暴露面边界：无完整工作台能力（无会话对话/知识库/文档入口）
    await expect(page.locator('[data-dswf-workbench]'), '无工作台').toHaveCount(0)
    await expect(page.locator('[data-dswf-sidebar], .dswf-sidebar-wide, .dswf-sidebar-rail'), '无侧栏导航').toHaveCount(0)
    await expect(page.locator('[data-dswf-session]'), '无会话行/入口').toHaveCount(0)
    await expect(page.locator(COMPOSER_INPUT), '无对话 composer').toHaveCount(0)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, '受限页无知识库入口文案').not.toContain('知识库')
    expect(bodyText, '受限页无文档入口文案').not.toContain('文档')

    // ── 旅程④审批决策上行（验收 5：走官方审批流——host 转发缝）──
    const approval = await page.evaluate(async () => {
      const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown }> } }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      const envelope = await forge.invoke('forge:remote/approval', { requestId: 'e2e-approval-journey', decision: 'allow' })
      return envelope
    })
    expect(approval.ok, '审批通道信封 ok').toBe(true)
    expect(approval.data, '审批决策经官方转发缝生效（forwarded=true）').toMatchObject({ forwarded: true })

    // ── 旅程⑤桌面关闭远程：待重启提示态 + 配置回 false ──
    await page.goto(origin + '/')
    // 整页重载后官方遮罩模态可能重挂（_mask 拦截指针——launch 链同款处置）
    await dismissOnboardingModals(page)
    await page.locator(REMOTE_ENTRY).click()
    panel = page.locator(REMOTE_PANEL)
    await expect(panel, '远程面板复开').toBeVisible({ timeout: 10_000 })
    await panel.locator(REMOTE_SWITCH).click()
    await expect.poll(() => remoteConfigEnabledOf(page), '产品配置回写 false（remoteApproval.enabled = false）')
      .toBe(false, { timeout: 15_000 })
    await expect(page.locator(REMOTE_ENTRY), '关闭后图标待重启收回提示态（pending）')
      .toHaveAttribute('data-phase', 'pending', { timeout: 30_000 })

    // ── 旅程⑥重启宿主：绑定收回 → 外部地址不可达（验收 7 自然承载）──
    await closeApp(app)
    app = undefined
    ;({ app, page } = await launchHost({ userData }))
    await expect(page.locator(REMOTE_ENTRY), '重启收回后图标回灰（off）').toHaveAttribute('data-phase', 'off', { timeout: 30_000 })
    hostPort = await hostPortOf(page)
    lanUrl = `http://${lanIpChecked}:${hostPort}/`
    const afterOff = await probeReachable(lanUrl)
    expect(afterOff.reachable, `关闭重启后外部地址不可达（${afterOff.detail}）`).toBe(false)

    expect(project.id).toBeTruthy()
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
    await rmDirBestEffort(root)
  }
})
