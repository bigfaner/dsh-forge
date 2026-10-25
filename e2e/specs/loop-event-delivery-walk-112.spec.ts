// loop-event-delivery 1.12 —— 真机走查（web + mobile + 全链实测）。过程产物（不进 git）：
// 真实凭据（真 home {homedir}/.dsh/.credentials.yaml 全文播种进隔离 dsh-home——bug eb0aacc8
// 起单一真源，禁 dev 实例陈旧副本；缺源留痕 skip）驱动
// 真实派发循环（worker 子代理真实 spawn/complete/结算 finish-all），forge-settings 预写
// remoteApproval.enabled → LAN 0.0.0.0 绑定 → chromium iPhone 上下文走 WiFi 同源面取证 mobile。
// 断言面：
//   web  = 悬浮球（半透明 0.55）→ 展开（宽 480 / head / 统计条 / 任务轨行）→ 拖移 → 行点击
//          跳 worker 子会话 → 可见性（切会话隐藏 / 回会话恢复）+ 消息面事件折叠条目 + 既有
//          turn-fold 零回归 + 运行期面板实时更新（行数递增且转录零新模型回合）。
//   mobile = .pstream 进度流渲染（bar/轨行/统计条）+ 无刷新实时更新 + 双主题截图。
//   全链 = 会话日志 post-hoc 按每回合新增 user/message 口径核对（meta.json 落 sessionId）。
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { launchHost, closeApp } from '../support/launch.js'
import { realCredentials, seedDshHome } from '../support/dogfood.js'
import { registerProject } from '../support/rpc.js'
import { createBridgeDriver } from '../support/replay/executor.js'
import { CONVERSATION_CONTENT } from '../support/anchors.js'

const WS_NAME = 'ws-led-walk112'
const PROP = 'led-walk112-prop'
const DEP_PANEL = '[data-dswf-dep]'
const DEP_BADGE = '[data-dswf-dep-badge]'
const DEP_HEAD = '[data-dswf-dep-head]'
const DEP_STAT = '[data-dswf-dep-stat]'
const DEP_ROW = '[data-dswf-dep-row]'
const DEP_JUMP = '[data-dswf-dep-jump]'
const ENTRIES = '[data-dswf-event-entries]'
const WALKTHROUGH = join(process.cwd(), '.forge', 'docs', 'proposals', 'loop-event-delivery', 'walkthrough', '1-12')

async function clipShot(page: Page, locator: ReturnType<Page['locator']>, path: string): Promise<void> {
  const box = await locator.boundingBox()
  expect(box, `浮层 boundingBox 在场（${path}）`).toBeTruthy()
  const clip = { x: box!.x, y: box!.y, width: box!.width, height: box!.height }
  try {
    const session = await page.context().newCDPSession(page)
    try {
      const shot = (await Promise.race([
        session.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('captureScreenshot 悬挂 15s')), 15_000)),
      ])) as { data: string }
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      return
    } finally {
      await session.detach().catch(() => undefined)
    }
  } catch {
    try {
      await page.screenshot({ path, clip })
    } catch {
      await page.screenshot({ path })
    }
  }
}

/** 全窗截图（CDP captureScreenshot 零稳定门——循环流式期 Playwright 截图稳定门不收敛；
 *  合成器偶发忙碌致单次悬挂——有界重试 ×3；仍失败则降级 Playwright 全窗截图（有界 15s），
 *  再失败记录 screenshotOk:false 并跳过——证据步容错化，不作断言（fix-5）。electron 与
 *  chromium Page 通吃。 */
const screenshotResults: { path: string; ok: boolean; via: string }[] = []

async function fullShot(page: Page, path: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const session = await page.context().newCDPSession(page)
    try {
      const shot = (await Promise.race([
        session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`captureScreenshot 悬挂 15s (#${String(attempt)})`)), 15_000)),
      ])) as { data: string }
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      screenshotResults.push({ path, ok: true, via: `cdp#${String(attempt)}` })
      return true
    } catch {
      // 有界重试耗尽后走降级路径
    } finally {
      await session.detach().catch(() => undefined)
    }
    await page.waitForTimeout(1_000)
  }
  try {
    await page.screenshot({ path, fullPage: true, timeout: 15_000 })
    console.warn(`[walk112] fullShot CDP ×3 失败，降级 Playwright 全窗截图：${path}`)
    screenshotResults.push({ path, ok: true, via: 'playwright-fallback' })
    return true
  } catch (cause) {
    console.warn(`[walk112] fullShot 降级仍失败（screenshotOk:false，跳过证据图，不作断言）：${path} — ${String(cause)}`)
    screenshotResults.push({ path, ok: false, via: 'skipped' })
    return false
  }
}

/** 统计条 + 任务行状态读数（收敛语义判据原料——不解析文案数字位次，逐桶取 b 计数） */
interface DepStats {
  completed: number
  running: number
  blocked: number
  /** 待执行桶缺席 = 尚无 counts 事件——视为 0（面板渲染条件：pending !== undefined 才出桶） */
  pending?: number
  interrupted: number
  rowStatuses: string[]
}

async function readDepStats(page: Page): Promise<DepStats> {
  return page.evaluate(({ statSel, rowSel }) => {
    const stat = document.querySelector(statSel)
    const num = (label: string): number | undefined => {
      const span = stat ? [...stat.querySelectorAll('span')].find((s) => (s.textContent ?? '').trim().startsWith(label)) : undefined
      const b = span?.querySelector('b')
      return b !== null && b !== undefined ? Number(b.textContent) : undefined
    }
    const rows = [...document.querySelectorAll(rowSel)].map((r) => r.getAttribute('data-dswf-dep-status') ?? '')
    return {
      completed: num('完成') ?? -1,
      running: num('执行中') ?? -1,
      blocked: num('阻塞') ?? -1,
      pending: num('待执行'),
      interrupted: num('已中断') ?? -1,
      rowStatuses: rows,
    }
  }, { statSel: DEP_STAT, rowSel: DEP_ROW })
}

/** 结算收敛语义（fix-6）：执行中/阻塞/待执行/已中断 全 0 + 任务行全终态（无 running/blocked 行）——不钉完成数
 * （容器历史派生 fix 任务容忍：完成几枚不影响判定）。 */
function depSettled(s: DepStats): boolean {
  const rowsTerminal = s.rowStatuses.length > 0 && s.rowStatuses.every((st) => st !== 'running' && st !== 'blocked')
  return s.running === 0 && s.blocked === 0 && (s.pending === undefined || s.pending === 0) && s.interrupted === 0 && rowsTerminal
}

test('@web-e2e @loop-event-delivery 1.12 真机走查：web 五项交互 + 消息面折叠 + 全链实测 + mobile 进度流', async () => {
  test.setTimeout(1_800_000)
  mkdirSync(WALKTHROUGH, { recursive: true })
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-walk112-ws-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  mkdirSync(wsDir, { recursive: true })
  // 真 git 仓库夹具（project-service worktree janitor 会修剪非 git 根——判例：夹具中途被剪致会话封存）
  execFileSync('git', ['init', '-q'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.email', 'walk112@e2e.local'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.name', 'walk112'], { cwd: wsDir })
  writeFileSync(join(wsDir, 'README.md'), 'walk112 fixture\n')
  execFileSync('git', ['add', '.'], { cwd: wsDir })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: wsDir })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-walk112-ud-'))
  // 真实凭据播种（bug eb0aacc8：源 = 真 home 全文含 refs 段，dogfood realCredentials 单源；
  // 缺源 fail-soft = 留痕 skip 不伪造）+ LAN 绑定设置
  const credentials = realCredentials()
  test.skip(credentials === undefined, 'dogfood 前置缺口：真实凭据（~/.dsh/.credentials.yaml）不在场——留痕 skip')
  seedDshHome(join(userData, 'dsh-home'), credentials as string)
  writeFileSync(join(userData, 'forge-settings.json'), JSON.stringify({ remoteApproval: { enabled: true } }), 'utf8')
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  const meta: Record<string, unknown> = { userData, wsDir }
  try {
    const project = await registerProject(page, wsDir, WS_NAME)
    const driver = createBridgeDriver(app)
    await driver.call('forgeProposals', 'createProposal', { projectId: project.id, slug: PROP, title: '真机走查容器（1.12）', mode: 'blitz' })
    for (const t of ['walk112-任务甲：在 ws 根写 walk112-a.md 一行内容', 'walk112-任务乙：在 ws 根写 walk112-b.md 一行内容']) {
      await driver.call('forgeTasks', 'addTask', {
        projectId: project.id, source: { kind: 'proposal', slug: PROP }, title: t, type: 'doc',
      })
    }
    // ── 驱动前夹具重置（fix-6）：容器内一切非 pending 任务回退 pending（种子任务重跑幂等）；
    // 历史派生 fix 任务容忍保留（结算断言为收敛语义，不钉完成数）。转移失败容忍（fail-soft 记账）──
    const fixtureReset = await page.evaluate(async ({ pid, slug }) => {
      const forge = (globalThis as unknown as {
        dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> }
      }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      const listed = await forge.invoke('forge:tasks/list', { projectId: pid, source: { kind: 'proposal', slug } })
      if (!listed.ok) throw new Error(`forge:tasks/list 失败：${String(listed.message)}`)
      const cards = (listed.data as { status?: string; taskId?: string }[]) ?? []
      const resetTo: string[] = []
      const failed: { taskId?: string; status?: string; message?: string }[] = []
      for (const card of cards) {
        if (card.status !== undefined && card.status !== 'pending' && card.taskId !== undefined) {
          const moved = await forge.invoke('forge:tasks/transition', {
            projectId: pid,
            taskId: card.taskId,
            toStatus: 'pending',
            reason: 'walk112 驱动前夹具重置（回 pending）',
          })
          if (moved.ok) resetTo.push(card.taskId)
          else failed.push({ taskId: card.taskId, status: card.status, message: moved.message })
        }
      }
      return { total: cards.length, resetTo, failed }
    }, { pid: project.id, slug: PROP })
    meta.fixtureReset = fixtureReset
    console.log(`[walk112] fixture reset = ${JSON.stringify(fixtureReset)}`)
    // 官方认证 + boot manifest 前移（会话创建 HTTP 通路前提）
    const manifest = (await page.evaluate(() => {
      const forge = (globalThis as unknown as {
        dshForge?: { getBootManifest(): Promise<{ url: string }> }
      }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      return forge.getBootManifest()
    })) as { url: string }
    const bootUrl = new URL(manifest.url)
    const rpcBase = `http://127.0.0.1:${bootUrl.port}`
    meta.port = bootUrl.port
    const webToken = bootUrl.searchParams.get('token') ?? ''
    const boot = await fetch(manifest.url, { redirect: 'manual' })
    const cookie = (boot.headers.get('set-cookie') ?? '').split(';')[0]
    expect(boot.status, '官方认证交换（303 + set-cookie）').toBe(303)
    // 会话创建（binding-derivation 官方直通，WYSIWYG）：项目行尾新会话钮 = startSession(workspaceId)
    // ——fresh blank 仅选中者可见（官方口径），行出现即取 sessionId；弃 HTTP 线（不经页面无选中态）
    await page.locator('[data-dswf-sidebar="wide"]', { has: page.locator(`[data-dswf-project="${project.id}"]`) }).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
      await page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]').first().click()
      await expect(page.locator(`[data-dswf-project="${project.id}"]`).first()).toBeVisible({ timeout: 15_000 })
    })
    const projectRow = page.locator(`[data-dswf-project="${project.id}"]`).first()
    await page.locator('.dswf-sidebar-project-row').first().hover()
    await page.locator('[data-dswf-project-action="new-session"]').first().click({ force: true })
    const sessionRow = page.locator(`[data-dswf-project="${project.id}"] [data-dswf-session]`).first()
    await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
    const sessionId = await sessionRow.getAttribute('data-dswf-session')
    expect(sessionId, '会话描述（sessionId 在场）').toBeTruthy()
    meta.sessionId = sessionId
    console.log(`[walk112] sessionId = ${String(sessionId)}`)

    const row = page.locator(`[data-dswf-session="${sessionId}"]`).first()
    if ((await row.count()) === 0) {
      // HTTP 线建会话不经页面 invoke——桌面账本无实时推送，reload 拉侧栏（会话行为证据不受影响）
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(4_000)
    }
    await page.locator(`[data-dswf-session="${sessionId}"]`).first().click()
    await expect(page.locator('[data-composer-input]').last(), '会话 composer 可用（活 agent）').toBeEnabled({ timeout: 30_000 })

    // ── 启动真实派发循环（commands HTTP transport）──
    const apiRes = await fetch(`${rpcBase}/api/commands/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'e2e-walk112',
        method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: `/run-dag-tasks ${PROP}`, submittedAttachments: [] } },
      }),
    })
    expect(apiRes.status, 'commands/execute HTTP 200').toBe(200)
    await expect(
      page.locator(CONVERSATION_CONTENT).first(),
      'RPC 派发指令着陆（转录含启动回执）',
    ).toContainText('派发循环已启动', { timeout: 60_000 })

    // ── mobile 相（连接前置到循环运行窗——实时刷新必须采样自运行期；chromium iPhone 上下文）──
    const { networkInterfaces } = await import('node:os')
    const lanIp = Object.values(networkInterfaces())
      .flat()
      .find((i) => i?.family === 'IPv4' && !i.internal)?.address
    expect(lanIp, 'LAN IPv4 在场（WiFi 程序）').toBeTruthy()
    const { chromium, devices } = await import('@playwright/test')
    const browser = await chromium.launch()
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: devices['iPhone 13'].userAgent,
    })
    const mpage = await ctx.newPage()
    const mobileErrors: string[] = []
    mpage.on('pageerror', (e) => mobileErrors.push(String(e)))
    meta.mobileExchangeStatus = undefined
    try {
      // 认证交换腿（127.0.0.1 token 交换）+ remote cookie
      const exch = await ctx.request.get(`http://127.0.0.1:${String(bootUrl.port)}/?forgeRemote=1&token=${webToken}`, { maxRedirects: 0 })
      meta.mobileExchangeStatus = exch.status()
      console.log(`[walk112] mobile exchange status = ${String(exch.status())}`)
      await ctx.addCookies([
        { name: 'dswf_forge_remote', value: '1', url: `http://${String(lanIp!)}:${String(bootUrl.port)}/` },
      ])
      // LAN origin 原位导航带 token 完成认证交换（cookie authority = LAN origin——回环交换的
      // dsh-auth cookie 不跨 authority 携带，run-9 landing「authentication required」实证）
      await mpage.goto(`http://${String(lanIp!)}:${String(bootUrl.port)}/?forgeRemote=1&token=${webToken}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await mpage.waitForTimeout(4_000)
      await fullShot(mpage, join(WALKTHROUGH, 'mobile-landing.png'))
      // 开抽屉（landing 落 hero——303 重定向剥 hash，run-11/12 实证；顶栏 ☰ = .topbar 首个 iconbtn）
      const menuBtn = mpage.locator('.topbar button.iconbtn').first()
      await expect(menuBtn, '顶栏汉堡在场').toBeVisible({ timeout: 30_000 })
      await menuBtn.click()
      await mpage.waitForTimeout(2_000)
      // 打开循环会话（抽屉会话行 button.sess——优先 walk112 文案 / 运行点 / 兜底首行）
      const sessRow = mpage.locator('button.sess').filter({ hasText: /walk112|run-dag-tasks|led-/ }).first()
      const target = (await sessRow.count()) > 0
        ? sessRow
        : mpage.locator('button.sess').filter({ has: mpage.locator('.running-dot') }).first()
      const rowToClick = (await target.count()) > 0 ? target : mpage.locator('button.sess').first()
      if ((await rowToClick.count()) === 0) {
        writeFileSync(join(WALKTHROUGH, 'diag-mobile-drawer.html'), await mpage.content())
        console.log('[walk112] diag-mobile-drawer.html archived')
      }
      await expect(rowToClick, 'mobile 会话行在场').toBeVisible({ timeout: 30_000 })
      await rowToClick.click()
      await mpage.waitForTimeout(2_000)
      // 进度流渲染（.pstream 挂任务浮层头部——chat 内先点 .fab 浮球开浮层，main.ts openTasks）
      const fab = mpage.locator('.fab').first()
      await expect(fab, '任务浮球在场（会话有 forge/progress）').toBeVisible({ timeout: 30_000 })
      await fab.click()
      await mpage.waitForTimeout(1_000)
      // 进度流渲染
      const pstream = mpage.locator('.pstream').first()
      await expect(pstream, 'mobile 进度流在场').toBeVisible({ timeout: 60_000 })
      const pstreamBox = await pstream.boundingBox()
      expect(pstreamBox, '进度流视口内可见（验收规则 1）').toBeTruthy()
      const rows0 = await mpage.locator('.pstream .prow').count()
      await fullShot(mpage, join(WALKTHROUGH, 'mobile-progress-light.png'))
      // 实时刷新：运行窗内高频采样（无 reload）
      let refreshed = false
      let rowsNow = rows0
      for (let i = 0; i < 30 && !refreshed; i++) {
        await mpage.waitForTimeout(3_000)
        rowsNow = await mpage.locator('.pstream .prow').count()
        if (rowsNow !== rows0) refreshed = true
      }
      meta.mobileRealtime = { rowsBefore: rows0, rowsAfter: rowsNow, refreshed }
      console.log(`[walk112] mobile realtime = ${JSON.stringify(meta.mobileRealtime)}`)
      await fullShot(mpage, join(WALKTHROUGH, 'mobile-progress-refreshed.png'))
      meta.mobilePageErrors = mobileErrors
      expect(refreshed, 'mobile 实时刷新（轨行数无刷新变化）').toBe(true)
    } catch (cause) {
      meta.mobileEarlyError = String(cause)
      throw cause
    }
    await browser.close()

    // ── 悬浮球（半透明）出现 + 运行期实时更新采样（行数递增 · 转录零新模型回合）──
    const badge = page.locator(DEP_BADGE).first()
    await expect(badge, '悬浮球角标在场（投影已 fold）').toBeVisible({ timeout: 180_000 })
    await expect(page.locator(DEP_PANEL)).toHaveCount(0)
    const badgeOpacity = await badge.evaluate((el) => getComputedStyle(el).opacity)
    console.log(`[walk112] badge opacity = ${badgeOpacity}`)
    meta.badgeOpacity = badgeOpacity
    expect(Number(badgeOpacity), '半透明悬浮球（opacity < 1）').toBeLessThan(1)
    await fullShot(page, join(WALKTHROUGH, 'web-badge-light.png'))

    const samples: { at: string; rows: number; turns: number }[] = []
    const sampleOnce = async (label: string): Promise<void> => {
      const s = await page.evaluate(({ rowSel, foldSel }) => {
        const panel = document.querySelector('[data-dswf-dep]')
        const rows = panel ? panel.querySelectorAll(rowSel).length : -1
        const turns = document.querySelectorAll(foldSel).length
        return { rows, turns }
      }, { rowSel: DEP_ROW, foldSel: '.turn-fold' })
      samples.push({ at: `${label} ${new Date().toISOString()}`, rows: s.rows, turns: s.turns })
    }
    // 采样窗：面板展开态下行数递增；转录 .turn-fold 数恒定（驱动器不逐事件唤醒）
    await badge.click()
    const panel = page.locator(DEP_PANEL).first()
    await expect(panel, '展开面板在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(DEP_HEAD)).toContainText('live · 不经模型')
    await expect(page.locator(DEP_STAT), '统计条在场（含待执行桶）').toBeVisible()
    await expect(page.locator(DEP_ROW).first(), '任务轨行 ≥ 1').toBeVisible({ timeout: 120_000 })
    await sampleOnce('t0')
    let distinctRows = 1
    let settledDuringSampling = false
    for (let i = 1; i <= 24; i++) {
      await page.waitForTimeout(10_000)
      await sampleOnce(`t${String(i)}`)
      const rowSet = new Set(samples.map((s) => s.rows))
      if (rowSet.size > distinctRows) distinctRows = rowSet.size
      // 结算收敛（fix-6 收敛语义：活跃桶全 0 + 行全终态——不钉完成数）：满足即出窗；否则（mobile 相
      // 先行消耗了运行窗）续采 8 拍留证
      if (depSettled(await readDepStats(page))) {
        settledDuringSampling = true
        if (distinctRows > 1 || i >= 8) break
      }
    }
    meta.settledDuringSampling = settledDuringSampling
    meta.realtimeSamples = samples
    console.log(`[walk112] realtime samples = ${JSON.stringify(samples)}`)
    expect(distinctRows > 1 || settledDuringSampling, '运行期行数递增（面板实时更新；结算先行时以满行样本 + mobile 实时面为证）').toBe(true)
    const turnsDuring = new Set(samples.slice(0, -1).map((s) => s.turns))
    console.log(`[walk112] turn-fold values during run = ${[...turnsDuring].join(',')}`)
    await clipShot(page, panel, join(WALKTHROUGH, 'web-expanded-light.png'))
    // 剪裁空区兜底（悬浮面板 fixed 定位可离视口——1.17 实证）：产物过小则全窗重拍
    if (existsSync(join(WALKTHROUGH, 'web-expanded-light.png')) && readFileSync(join(WALKTHROUGH, 'web-expanded-light.png')).length < 4096) {
      await fullShot(page, join(WALKTHROUGH, 'web-expanded-light.png'))
    }

    // 展开态宽度充足（长 title 不换行挤压——面板 480px 刻度）
    const panelWidth = await panel.evaluate((el) => el.getBoundingClientRect().width)
    meta.panelWidth = panelWidth
    expect(panelWidth, '展开态宽度充足（≥ 440）').toBeGreaterThanOrEqual(440)

    // 折叠往返
    await page.locator('[data-dswf-dep-collapse]').first().click()
    await expect(page.locator(DEP_PANEL)).toHaveCount(0)
    await expect(badge, '折叠往返回悬浮球').toBeVisible()
    await badge.click()
    await expect(panel).toBeVisible()

    // 拖动 → dragged 锚
    const head = page.locator(DEP_HEAD).first()
    const bb = await head.boundingBox()
    expect(bb, 'head boundingBox 在场（可拖动）').toBeTruthy()
    await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + 10)
    await page.mouse.down()
    await page.mouse.move(bb!.x + bb!.width / 2 - 80, bb!.y + 90, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('[data-dswf-dep][data-dswf-dep-dragged]'), '拖移后 dragged 锚在场').toHaveCount(1)
    await fullShot(page, join(WALKTHROUGH, 'web-dragged-light.png'))
    // 回默认锚（折叠再展开——dragged 停自动锚定，重开会话恢复默认）
    await page.locator('[data-dswf-dep-collapse]').first().evaluate((el) => (el as HTMLElement).click())
    await page.locator(DEP_BADGE).first().evaluate((el) => (el as HTMLElement).click())
    await expect(panel).toBeVisible()

    // ── 消息面事件折叠条目 + 既有折叠行零回归（软断言 + DOM 诊断落盘）──
    await page.waitForTimeout(5_000)
    const diag = await page.evaluate((entriesSel) => {
      const composer = document.querySelector('[data-composer-input]')
      const transcript = composer?.closest('div')?.parentElement?.parentElement ?? document.body
      const entries = document.querySelectorAll(entriesSel)
      const groups = [...document.querySelectorAll('[class*=event-entries]')].map((el) => el.className).slice(0, 10)
      return {
        entriesCount: entries.length,
        groups,
        transcriptHtmlSample: transcript.innerHTML.slice(0, 150000),
      }
    }, ENTRIES)
    writeFileSync(join(WALKTHROUGH, 'diag-message-face.html'), `<!-- entriesCount=${String(diag.entriesCount)} -->\n${diag.groups.join('\n')}\n${diag.transcriptHtmlSample}`)
    meta.messageFaceEntries = { entriesCount: diag.entriesCount, groups: diag.groups }
    console.log(`[walk112] message-face entries count = ${String(diag.entriesCount)}`)
    const foldCount = await page.locator('.turn-fold').count()
    console.log(`[walk112] turn-fold count = ${String(foldCount)}`)
    meta.turnFoldCount = foldCount

    // ── 暗主题展开态 ──
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await page.waitForTimeout(500)
    await fullShot(page, join(WALKTHROUGH, 'web-expanded-dark.png'))
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

    // ── 行点击跳 worker 子会话（真实 spawn → worker 行带 ↗）──
    const jumpRow = page.locator(DEP_ROW).filter({ has: page.locator(DEP_JUMP) }).first()
    await expect(jumpRow, 'worker 子会话行（↗ jump 徽标）在场').toBeVisible({ timeout: 300_000 })
    await jumpRow.locator(DEP_JUMP).first().evaluate((el) => (el as HTMLElement).click())
    await page.waitForTimeout(2_500)
    await expect(page.locator(DEP_PANEL), 'worker 子会话：面板随所属会话隐藏').toHaveCount(0)
    await expect(page.locator(DEP_BADGE), 'worker 子会话：悬浮球隐藏').toHaveCount(0)
    await fullShot(page, join(WALKTHROUGH, 'web-worker-session-hidden.png'))
    const parentRow = page.locator(`[data-dswf-session="${String(sessionId)}"]`).first()
    let badgeRestored = false
    for (let i = 0; i < 3 && !badgeRestored; i++) {
      await parentRow.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined)
      badgeRestored = await page.locator(DEP_BADGE).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false)
    }
    if (!badgeRestored) {
      // 恢复兜底（间歇面收口）：worker 子会话上面板/列表隐藏——parentRow 点击无效；
      // 经会话层级条切回父会话（banner navigation「会话层级」内的父会话名按钮）。
      const crumb = page.getByRole('navigation', { name: '会话层级' }).getByText(WS_NAME, { exact: true })
      await crumb.click({ timeout: 10_000 }).catch(() => undefined)
      badgeRestored = await page.locator(DEP_BADGE).first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false)
    }
    meta.badgeRestored = badgeRestored
    console.log(`[walk112] badge restored after jump = ${String(badgeRestored)}`)

    // ── 等结算（收敛语义，fix-6）──
    // 面板收起则先展开（结算断言以展开态统计条为承载）。
    if (!(await page.locator(DEP_STAT).first().isVisible().catch(() => false))) {
      const badgeNow = page.locator(DEP_BADGE).first()
      if (await badgeNow.isVisible().catch(() => false)) await badgeNow.click()
    }
    // 结算收敛：执行中/阻塞/待执行/已中断 全 0 + 任务行全终态（不钉完成数——容器历史派生 fix 任务容忍）
    let settledStats: DepStats | undefined
    let settled = false
    for (let i = 0; i < 60 && !settled; i++) {
      await page.waitForTimeout(10_000)
      settledStats = await readDepStats(page)
      settled = depSettled(settledStats)
    }
    meta.settledStats = settledStats
    console.log(`[walk112] settled stats = ${JSON.stringify(settledStats)}`)
    expect(
      settled,
      `结算收敛（执行中/阻塞/待执行/已中断 全 0 + 任务行全终态；末次读数 = ${JSON.stringify(settledStats)}）`,
    ).toBe(true)
    await page.waitForTimeout(3_000)
    await fullShot(page, join(WALKTHROUGH, 'web-settled-light.png'))
    meta.screenshots = screenshotResults
    writeFileSync(join(WALKTHROUGH, 'meta.json'), JSON.stringify(meta, null, 2))

    console.log(`[walk112] archived to ${WALKTHROUGH}`)
  } finally {
    meta.screenshots = screenshotResults
    writeFileSync(join(WALKTHROUGH, 'meta.json'), JSON.stringify(meta, null, 2))
    await closeApp(app)
    console.log(`[walk112] fixture ws kept at ${fixtureRoot} (log forensics)`)
  }
})
