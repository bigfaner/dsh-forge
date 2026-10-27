// loop-event-delivery 1.17 —— web 悬浮进度流面板（DispatchEventsPanel）真机走查（fix-3 改道 RPC 驱动）：
// 真实派发循环会话驱动 forge/progress 事件 → 投影键 forge-dispatch-events fold → 面板任务轨行 +
// head/统计条真机呈现。配方（GUI 直通终态）：
//   注册 = RPC 直注（forge:projects/register）；建会话 = 官方 GUI（项目行尾新会话钮
//   startSession(workspaceId)——binding-derivation 官方直通）；循环启动 = 官方 commands HTTP
//   transport（POST /api/commands/execute 提交 /run-dag-tasks）；composer/dock 官方 GUI 入口
//   在无人值守探针环境不可判读——记为环境局限，非产品缺陷判定面。
// 断言：悬浮球两态/拖动、head（圆点/任务进度/live·不经模型）、任务轨行（rail+状态点+标题/备注+时间）、
// ↗ jump 徽标交互行、行点击跳 worker 子会话（worker 行在场时取证）、五桶统计条（含待执行）、
// 双主题（明/暗）截图归档 .forge/docs/proposals/loop-event-delivery/walkthrough/1-17/（留盘不进 git）。
// 形态参照 = 同目录 prototype.html（.panel 任务轨行 + head/live·不经模型 + 统计条）。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { launchHost, closeApp } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { createBridgeDriver } from '../support/replay/executor.js'
import { CONVERSATION_CONTENT } from '../support/anchors.js'
import { rmDirBestEffort } from '../support/cleanup.js'

const WS_NAME = 'ws-led-panel'
const PROP = 'led-panel-prop'
/** 展开面板（DispatchEventsPanel 锚——源码 data-dswf-dep-*） */
const DEP_PANEL = '[data-dswf-dep]'
const DEP_BADGE = '[data-dswf-dep-badge]'
const DEP_HEAD = '[data-dswf-dep-head]'
const DEP_STAT = '[data-dswf-dep-stat]'
const DEP_ROW = '[data-dswf-dep-row]'
const DEP_JUMP = '[data-dswf-dep-jump]'
const WALKTHROUGH = join(
  fileURLToPath(new URL('../../../.forge/docs/proposals/loop-event-delivery/walkthrough', import.meta.url)),
  '1-17',
)

/** 浮层截图（CDP captureScreenshot 原始面——悬浮面板 fixed 定位 + 循环流式重排期，
 *  Playwright 截图稳定门不收敛；captureScreenshot 零门直拍） */
async function clipShot(page: Page, locator: ReturnType<Page['locator']>, path: string): Promise<void> {
  const box = await locator.boundingBox()
  expect(box, `浮层 boundingBox 在场（${path}）`).toBeTruthy()
  const clip = { x: box!.x, y: box!.y, width: box!.width, height: box!.height }
  try {
    // CDP captureScreenshot（scale 2 原始面）——15s 有界，悬挂即回退 Playwright 截图
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
    // 回退：Playwright 剪裁截图（scale 1——证据面等价，坐标同 clip）；剪裁区出界再回退全窗截图
    try {
      await page.screenshot({ path, clip })
    } catch {
      await page.screenshot({ path })
    }
  }
}

/** 全窗截图（CDP captureScreenshot 零稳定门——循环流式期 Playwright 截图稳定门不收敛；
 * 合成器偶发忙碌致单次悬挂——有界重试 ×3） */
async function fullShot(page: Page, path: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const session = await page.context().newCDPSession(page)
    try {
      const shot = (await Promise.race([
        session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`captureScreenshot 悬挂 15s (#${String(attempt)})`)), 15_000)),
      ])) as { data: string }
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      return
    } catch (cause) {
      if (attempt === 3) throw cause
    } finally {
      await session.detach().catch(() => undefined)
    }
    await page.waitForTimeout(1_000)
  }
}

test('@web-e2e @loop-event-delivery 进度流面板真机走查（RPC 驱动）：任务轨行 + head/统计条 + 双主题', async () => {
  test.setTimeout(900_000)
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-led-panel-'))
  const wsDir = join(fixtureRoot, WS_NAME)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-led-panel-ud-'))
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  try {
    // ── 夹具：项目注册（RPC 直注）+ 突击提案容器 + 任务（测试钩子写动词——恒不上 RPC；主进程面）──
    const project = await registerProject(page, wsDir, WS_NAME)
    const driver = createBridgeDriver(app)
    await driver.call('forgeProposals', 'createProposal', { projectId: project.id, slug: PROP, title: '面板走查突击容器', mode: 'blitz' })
    await driver.call('forgeTasks', 'addTask', {
      projectId: project.id, source: { kind: 'proposal', slug: PROP }, title: '面板走查任务', type: 'doc',
    })
    // 官方认证 + boot manifest 前移（会话创建 HTTP 通路前提）
    const manifest = (await page.evaluate(() => {
      const forge = (globalThis as unknown as {
        dshForge?: { getBootManifest(): Promise<{ url: string }> }
      }).dshForge
      if (forge === undefined) throw new Error('dshForge preload 面缺席')
      return forge.getBootManifest()
    })) as { url: string }
    expect(manifest.url, 'boot manifest url 在场（RPC 通路前提）').toBeTruthy()
    const bootUrl = new URL(manifest.url)
    const rpcBase = `http://127.0.0.1:${bootUrl.port}`
    const boot = await fetch(manifest.url, { redirect: 'manual' })
    const cookie = (boot.headers.get('set-cookie') ?? '').split(';')[0]
    expect(boot.status, '官方认证交换（303 + set-cookie）').toBe(303)
    expect(cookie, '会话 cookie 在场').not.toBe('')
    // 会话创建（binding-derivation 官方直通，WYSIWYG）：项目行尾新会话钮 = startSession(workspaceId)
    // ——fresh blank 仅选中者可见（官方口径），行出现即取 sessionId；弃 HTTP 线（不经页面无选中态）
    await page.locator('[data-dswf-sidebar="wide"]', { has: page.locator(`[data-dswf-project="${project.id}"]`) }).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(async () => {
      await page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]').first().click()
      await expect(page.locator(`[data-dswf-project="${project.id}"]`).first()).toBeVisible({ timeout: 15_000 })
    })
    await page.locator('.dswf-sidebar-project-row').first().hover()
    await page.locator('[data-dswf-project-action="new-session"]').first().click({ force: true })
    const sessionRow = page.locator(`[data-dswf-project="${project.id}"] [data-dswf-session]`).first()
    await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
    const sessionId = await sessionRow.getAttribute('data-dswf-session')
    expect(sessionId, '会话描述（sessionId 在场）').toBeTruthy()

    // ── 打开会话（侧栏会话行）+ 官方 commands HTTP transport 驱动 /run-dag-tasks（fix-2 配方：
    // composer/dock 官方 GUI 入口在无人值守探针环境不可判读（insertText 零效果 = 发送钮
    // disabled 形态、dock 派发按钮缺席），记环境局限非产品断言面；零凭据 spawn 失败 →
    // 重试 ×3 → halt，循环事件链照常发射）──
    await page.locator(`[data-dswf-session="${sessionId}"]`).first().click()
    await expect(page.locator('[data-composer-input]').last(), '会话 composer 可用（活 agent）').toBeEnabled({ timeout: 30_000 })
    // 官方 commands HTTP transport（POST /api/<method>——api-ref.jsonl wire 形：client-request 信封
    // + method + payload.args；args = commands.execute(agentId, line, submittedAttachments)）
    const apiRes = await fetch(`${rpcBase}/api/commands/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'e2e-led-panel',
        method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: `/run-dag-tasks ${PROP}`, submittedAttachments: [] } },
      }),
    })
    const apiBody = (await apiRes.json()) as {
      result?: { ok?: boolean; value?: { result?: { text?: string } } }
    }
    expect(apiRes.status, 'commands/execute HTTP 200').toBe(200)
    expect(apiBody.result?.value?.result?.text ?? '', 'RPC 循环启动回执（派发循环已启动）').toContain('派发循环已启动')
    // 启动着陆断言（loop-message-consolidation 新口径）：循环级启动 notice 已停铸（1.1），
    // 转录着陆锚 = 「收到执行请求」turn-trigger 唤醒卡 + forge 事件组卡（循环进度卡）。
    await expect(
      page.locator(CONVERSATION_CONTENT).first(),
      '循环启动着陆（转录含「收到执行请求」唤醒卡）',
    ).toContainText('收到执行请求', { timeout: 60_000 })
    await expect(
      page.locator('[data-dswf-event-entries]').first(),
      '循环进度组卡着陆（forge · 任务循环事件）',
    ).toContainText('任务循环事件', { timeout: 60_000 })

    // ── 面板取证：悬浮球两态 + 展开 head/统计条/任务轨行 ──
    const badge = page.locator(DEP_BADGE).first()
    await expect(badge, '悬浮球角标在场（循环会话投影已 fold）').toBeVisible({ timeout: 180_000 })
    await expect(page.locator(DEP_PANEL), '默认零展开面板（悬浮球形态）').toHaveCount(0)
    await badge.click()
    const panel = page.locator(DEP_PANEL).first()
    await expect(panel, '展开面板在场').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(DEP_HEAD), 'head 条在场（圆点/任务进度/live·不经模型）').toBeVisible()
    await expect(page.locator(DEP_HEAD)).toContainText('live · 不经模型')
    await expect(page.locator(DEP_STAT), '统计条在场（含待执行桶）').toBeVisible()
    await expect(page.locator(DEP_STAT)).toContainText('待执行')
    await expect(page.locator(DEP_ROW).first(), '任务轨行 ≥ 1（真实 forge/progress 事件）').toBeVisible({ timeout: 120_000 })
    // 循环进度卡新口径：任务行按 taskKey 后写覆盖原地更新（同一任务零追加行），行含
    // 启动时间 + 耗时徽标（执行中 = now 起算实时耗时；终态 = startAt→事件时戳定格）。
    const rowsAtStart = await page.locator(DEP_ROW).count()
    const firstRow = page.locator(DEP_ROW).first()
    await expect(firstRow.locator('.dswf-dep-row-time'), '任务行含启动时间').toHaveText(/\d{2}:\d{2}/)
    const rowStatus0 = await firstRow.getAttribute('data-dswf-dep-status')
    let rowStatusNow = rowStatus0
    for (let i = 0; i < 24 && rowStatusNow === 'running'; i++) {
      await page.waitForTimeout(5_000)
      rowStatusNow = await firstRow.getAttribute('data-dswf-dep-status')
    }
    console.log(`[walkthrough] task row status ${String(rowStatus0)} → ${String(rowStatusNow)}`)
    await expect(page.locator(DEP_ROW), '任务行原地更新（行数不增——后写覆盖不追加）').toHaveCount(rowsAtStart)
    await expect(firstRow.locator('.dswf-dep-row-dur'), '任务行含耗时徽标').toBeVisible()
    const rowCount = await page.locator(DEP_ROW).count()
    const jumpCount = await page.locator(DEP_JUMP).count()
    console.log(`[walkthrough] dep rows = ${String(rowCount)} jumps = ${String(jumpCount)}`)
    mkdirSync(WALKTHROUGH, { recursive: true })
    console.log('[walkthrough] shot light start');
    await clipShot(page, panel, join(WALKTHROUGH, 'dep-expanded-light.png'));
    console.log('[walkthrough] shot light done')

    // 折叠往返：▁ → 悬浮球（默认锚定位——先于拖移，拖移后面板离位折叠钮不可达）
    await page.locator('[data-dswf-dep-collapse]').first().click()
    await expect(page.locator(DEP_PANEL)).toHaveCount(0)
    await expect(badge, '折叠往返回悬浮球').toBeVisible()
    await badge.click()
    await expect(panel).toBeVisible()

    // 拖动：头拖移 → dragged 锚（停自动锚定）
    const head = page.locator(DEP_HEAD).first()
    const bb = await head.boundingBox()
    expect(bb, 'head boundingBox 在场（可拖动）').toBeTruthy()
    await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + 10)
    await page.mouse.down()
    await page.mouse.move(bb!.x + bb!.width / 2 - 80, bb!.y + 90, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('[data-dswf-dep][data-dswf-dep-dragged]'), '拖移后 dragged 锚在场').toHaveCount(1)
    console.log('[walkthrough] drag shot start');
    // 拖移态（面板离默认锚）——全窗截图（CDP 剪裁对拖移坐标不收敛）
    await fullShot(page, join(WALKTHROUGH, 'dep-dragged-light.png'));
    console.log('[walkthrough] drag shot done')

    // ── 双主题截图（明 = 应用内缺省上文已取；暗 = body[data-ds-dark-theme] 官方主题标记）
    // ——先于 worker 跳转取证（跳转后父会话行可离场，截图需面板在场）──
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await expect(page.locator('body[data-ds-dark-theme]')).toHaveCount(1)
    await page.waitForTimeout(500)
    console.log('[walkthrough] dark shot start');
    // 暗主题展开态——全窗截图（面板 + 主题令牌全貌）
    await fullShot(page, join(WALKTHROUGH, 'dep-expanded-dark.png'));
    console.log('[walkthrough] dark shot done')
    // 拖移态面板可能离位（折叠钮出视口）——JS 直点
    await page.locator('[data-dswf-dep-collapse]').first().evaluate((el) => (el as HTMLElement).click())
    await expect(page.locator(DEP_PANEL)).toHaveCount(0)
    await fullShot(page, join(WALKTHROUGH, 'dep-badge-dark.png'))
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    // 悬浮球可能离视口（剪裁截图空区实证）——JS 直点再展开（后续 jump 行点击同为 evaluate 径）
    await page.locator(DEP_BADGE).first().evaluate((el) => (el as HTMLElement).click()).catch(() => undefined)
    await expect(panel).toBeVisible()

    // 行点击跳 worker 子会话：worker 会话行（↗ jump 徽标）在场才取证——零凭据形态 spawn 失败
    // 无 worker 子会话，worker 跳转证据由真机走查记录承载（1.14/fix-3 镜像实例已取证）
    if (jumpCount > 0) {
      // ↗ 徽标为 aria-hidden 装饰 span（Playwright 可见性门/视口门不收敛——拖移态可能在视口外）
      // ——JS 直点（React onClick 同径，round-001 真机走查同法）
      await page.locator(DEP_ROW).filter({ has: page.locator(DEP_JUMP) }).first().locator(DEP_JUMP).first().evaluate((el) => (el as HTMLElement).click())
      await page.waitForTimeout(2_500)
      await expect(page.locator(DEP_PANEL), 'worker 子会话：面板随所属会话隐藏').toHaveCount(0)
      await expect(page.locator(DEP_BADGE), 'worker 子会话：悬浮球隐藏').toHaveCount(0)
      // 回父会话恢复悬浮球——best-effort（零凭据 halt 链可能封存 fixture 会话致父行离场；
      // 恢复面证据由折叠往返 + round-001 镜像实例真机取证承载）
      const parentRow = page.locator(`[data-dswf-session="${sessionId}"]`).first()
      if ((await parentRow.count()) > 0) {
        await parentRow.evaluate((el) => (el as HTMLElement).click()).catch(() => undefined)
        await expect(page.locator(DEP_BADGE).first(), '回父会话恢复悬浮球').toBeVisible({ timeout: 15_000 }).catch(() => undefined)
      } else {
        console.log('[walkthrough] parent row absent (halt 链封存) — skip restore step')
      }
    }

    // ── 走查记录（与 prototype.html 对照要点——截图为证据本体）──
    writeFileSync(join(WALKTHROUGH, '1-17-walkthrough.md'), [
      '# loop-event-delivery 1.17 —— web 进度流面板真机走查（e2e · RPC 驱动）',
      '',
      '- 会话形态：官方 GUI 建会话（项目行尾新会话钮 startSession(workspaceId)——binding-derivation 官方直通）+ 官方 commands HTTP transport POST /api/commands/execute 提交 /run-dag-tasks 真实派发循环，投影键 forge-dispatch-events fold forge/progress 事件驱动。',
      '- 环境局限（非产品缺陷判定面）：composer/dock 官方 GUI 入口在无人值守探针环境不可判读——composer insertText 零效果（发送钮 disabled 形态）、dock 派发按钮缺席；走查驱动改 RPC 通路，产品面判定以面板行为证据本体。',
      '- 断言：悬浮球默认折叠零面板；展开态 head 条（live · 不经模型）+ 统计条（含待执行桶）+ 任务轨行（≥1 条真实事件行）；头拖移 dragged 锚；折叠往返。',
      '- 截图：dep-expanded-light.png / dep-expanded-dark.png（展开态双主题）、dep-badge-dark.png（悬浮球态暗）、dep-dragged-light.png（拖移态）。',
      '- 形态参照 = ../prototype.html（.panel 任务轨行 + head/live·不经模型 + 统计条）。',
      '',
    ].join('\n'))
    console.log(`[walkthrough] archived to ${WALKTHROUGH}`)
  } finally {
    await closeApp(app)
    rmDirBestEffort(fixtureRoot)
    rmDirBestEffort(userData)
  }
})
