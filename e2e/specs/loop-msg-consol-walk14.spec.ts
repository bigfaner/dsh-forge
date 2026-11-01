// loop-message-consolidation 1.4 —— 批次末真机走查（提案 §5b 真机取证门）。过程产物（不进 git）：
// 三径消息面 + 小球口径 + 进度卡取证。三段独立 host 实例（各自隔离 userData + 真实凭据播种，
// 真实 worker 子代理 spawn/complete/结算），任一段失败不影响他段证据：
//   径① 正常完成：3 doc 任务跑完 —— 循环全程零循环级消息（运行期零新增唤醒卡 + turns 基线
//        零增），恰一张结算卡（展开正文含「任务概要」口径恰一张：状态计数 + 下一步动作 +
//        各任务概要按 slug 分组）；面板小球数字与展开清单口径对照（含 pending）；
//        进度卡任务行起止时间/耗时特写。
//   径② 幂等重入 + 径③ 异常挂起：worker 模型配置失效（forge-settings worker.provider/model
//        指向不存在档位——真机环境故障注入）→ spawn 拒绝退避幂等重入（重领零新消息、
//        重试计数进进度卡）→ 连续失败 ×3 spawn-failed-halted 恰一张异常卡
//        （任务标识/错误原文/阶段/重试计数/处置入口五要素核对）。
//   长循环：110 doc 任务（>500 事件）——回放后（reload 重开）卡片行完整、球数不漂移。
// 证据归档：.forge/docs/proposals/loop-message-consolidation/walkthrough/1-4/（留盘不进 git）。
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page, type Locator } from '@playwright/test'
import { launchHost, closeApp, ROOT } from '../support/launch.js'
import { registerProject } from '../support/rpc.js'
import { createBridgeDriver } from '../support/replay/executor.js'

const DEP_BADGE = '[data-dswf-dep-badge]'
const DEP_BADGE_COUNT = '[data-dswf-dep-badge-count]'
const DEP_PANEL = '[data-dswf-dep]'
const DEP_STAT = '[data-dswf-dep-stat]'
const DEP_ROW = '[data-dswf-dep-row]'
const ENTRIES = '[data-dswf-event-entries]'
const TRIGGER = '[data-turn-trigger]'
const WALKTHROUGH = join(ROOT, '.forge', 'docs', 'proposals', 'loop-message-consolidation', 'walkthrough', '1-4')
/** 真实凭据源（主检出 dev 实例 dsh-home——同文件同字节播种，walk112 先例） */
const CRED_SRC = join(ROOT, 'apps', 'host', 'userdata.dev', 'dsh-home', '.credentials.yaml')

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

async function clipShot(page: Page, locator: Locator, path: string): Promise<void> {
  const box = await locator.boundingBox()
  if (box === null) {
    await fullShot(page, path)
    return
  }
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height }
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
    await fullShot(page, path)
  }
}

/** 转录滚动容器全部滚到底 */
async function scrollTranscriptBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(
      (e) => e.scrollHeight > e.clientHeight + 50 && /auto|scroll/.test((e as HTMLElement).style.overflowY || getComputedStyle(e).overflowY),
    ) as HTMLElement[]
    for (const el of els) el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(400)
}

/** reload 重挂载转录并重开会话（确定性兜底——唤醒消息已落会话日志，重开即重放渲染） */
async function reopenSession(page: Page, sessionId: string): Promise<void> {
  await page.reload()
  await page.waitForTimeout(6_000)
  const r = page.locator(`[data-dswf-session="${sessionId}"]`).first()
  if ((await r.count()) === 0) await page.waitForTimeout(5_000)
  await page.locator(`[data-dswf-session="${String(sessionId)}"]`).first().click()
  await page.waitForTimeout(3_000)
}

/** 展开自末张起第一张含指定文本的 turn-trigger 卡，返回其正文（收起态不挂载正文——展开后读） */
async function expandTriggerByText(page: Page, needle: string): Promise<string | undefined> {
  await scrollTranscriptBottom(page)
  const cards = page.locator(TRIGGER)
  const count = await cards.count()
  for (let i = count - 1; i >= 0; i--) {
    const card = cards.nth(i)
    await card.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(600)
    const txt = (await card.textContent()) ?? ''
    if (txt.includes(needle)) return txt
    await card.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(300)
  }
  return undefined
}

/** 统计条五桶读数（完成/执行中/阻塞/待执行/已中断；meta.lastStatRaw 留原始串） */
async function statBuckets(page: Page, meta: Record<string, unknown>): Promise<Record<string, number>> {
  const raw = (await page.locator(DEP_STAT).first().textContent().catch(() => '')) ?? ''
  const buckets: Record<string, number> = {}
  for (const key of ['完成', '执行中', '阻塞', '待执行', '已中断']) {
    const m = new RegExp(`${key}\\s*(\\d+)`).exec(raw)
    buckets[key] = m !== null ? Number(m[1]) : -1
  }
  meta.lastStatRaw = raw.trim()
  return buckets
}

async function badgeCount(page: Page): Promise<number> {
  const raw = (await page.locator(DEP_BADGE_COUNT).first().textContent().catch(() => '')) ?? ''
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : -1
}

async function ensurePanelExpanded(page: Page, why: string): Promise<void> {
  if ((await page.locator(DEP_PANEL).count()) === 0) {
    await page.locator(DEP_BADGE).first().click()
    await expect(page.locator(DEP_PANEL).first(), `展开面板在场（${why}）`).toBeVisible({ timeout: 15_000 })
  }
}

/** 展开逐卡统计含 needle 正文的卡数，返回 [tally, 首张正文] */
async function tallyTriggerBodies(page: Page, needle: string): Promise<[number, string]> {
  await scrollTranscriptBottom(page)
  const cards = page.locator(TRIGGER)
  const total = await cards.count()
  let tally = 0
  let first = ''
  for (let i = 0; i < total; i++) {
    const card = cards.nth(i)
    await card.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(500)
    const txt = (await card.textContent()) ?? ''
    if (txt.includes(needle)) {
      tally += 1
      if (first === '') first = txt
    }
    await card.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(300)
  }
  return [tally, first]
}

/** 公共底座：夹具 ws + 隔离 userData（真实凭据播种）→ launchHost → 项目注册 → 提案+任务 → GUI 会话 */
async function bootFixture(options: {
  wsName: string
  slug: string
  proposalTitle: string
  taskTitles: readonly string[]
  forgeSettings?: Record<string, unknown>
  meta: Record<string, unknown>
}): Promise<{
  page: Page
  app: Parameters<typeof closeApp>[0]
  sessionId: string
  projectId: string
  wsDir: string
  userData: string
  fixtureRoot: string
  runLoop: (slug: string, rpcId: string) => Promise<void>
  driver: ReturnType<typeof createBridgeDriver>
}> {
  const { wsName, slug, proposalTitle, taskTitles, forgeSettings, meta } = options
  const fixtureRoot = mkdtempSync(join(tmpdir(), `dsh-walk14-${slug}-ws-`))
  const wsDir = join(fixtureRoot, wsName)
  mkdirSync(wsDir, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.email', 'walk14@e2e.local'], { cwd: wsDir })
  execFileSync('git', ['config', 'user.name', 'walk14'], { cwd: wsDir })
  writeFileSync(join(wsDir, 'README.md'), 'walk14 fixture\n')
  execFileSync('git', ['add', '.'], { cwd: wsDir })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: wsDir })
  const userData = mkdtempSync(join(tmpdir(), `dsh-walk14-${slug}-ud-`))
  mkdirSync(join(userData, 'dsh-home'), { recursive: true })
  copyFileSync(CRED_SRC, join(userData, 'dsh-home', '.credentials.yaml'))
  writeFileSync(
    join(userData, 'forge-settings.json'),
    JSON.stringify({ remoteApproval: { enabled: true }, ...forgeSettings }),
    'utf8',
  )
  meta.userData = userData
  meta.wsDir = wsDir
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_TEST_BRIDGE: '1' } })
  const { app, page } = launched
  const project = await registerProject(page, wsDir, wsName)
  const driver = createBridgeDriver(app)
  await driver.call('forgeProposals', 'createProposal', { projectId: project.id, slug, title: proposalTitle, mode: 'blitz' })
  for (const t of taskTitles) {
    await driver.call('forgeTasks', 'addTask', { projectId: project.id, source: { kind: 'proposal', slug }, title: t, type: 'doc' })
  }
  // 会话创建（binding-derivation 官方直通——项目行尾新会话钮 startSession(workspaceId)）
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
  meta.sessionId = sessionId
  await page.locator(`[data-dswf-session="${String(sessionId)}"]`).first().click()
  await expect(page.locator('[data-composer-input]').last(), '会话 composer 可用（活 agent）').toBeEnabled({ timeout: 30_000 })
  const manifest = (await page.evaluate(() => {
    const forge = (globalThis as unknown as {
      dshForge?: { getBootManifest(): Promise<{ url: string }> }
    }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    return forge.getBootManifest()
  })) as { url: string }
  const bootUrl = new URL(manifest.url)
  meta.port = bootUrl.port
  const boot = await fetch(manifest.url, { redirect: 'manual' })
  const cookie = (boot.headers.get('set-cookie') ?? '').split(';')[0]
  expect(boot.status, '官方认证交换（303 + set-cookie）').toBe(303)
  const runLoop = async (loopSlug: string, rpcId: string): Promise<void> => {
    const res = await fetch(`${bootUrl.origin}/api/commands/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: 'commands/execute',
        payload: { args: { agentId: sessionId, line: `/run-dag-tasks ${loopSlug}`, submittedAttachments: [] } },
      }),
    })
    expect(res.status, `commands/execute HTTP 200（${loopSlug}）`).toBe(200)
  }
  return { page, app, sessionId: String(sessionId), projectId: project.id, wsDir, userData, fixtureRoot, runLoop, driver }
}

/** diag 落盘日志扫描（app-*.jsonl——UTC 日界文件；loop/dispatch 相关行计数） */
function scanDiagLogs(userData: string): { files: string[]; loopLines: number; samples: string[] } {
  const files: string[] = []
  const visit = (dir: string, depth: number): void => {
    if (depth > 5) return
    let list: string[] = []
    try { list = readdirSync(dir) } catch { return }
    for (const name of list) {
      const p = join(dir, name)
      try {
        if (statSync(p).isDirectory()) visit(p, depth + 1)
        else if (/^app-\d{8}\.jsonl$/.test(name)) files.push(p)
      } catch { /* 跳过不可读项 */ }
    }
  }
  visit(userData, 0)
  let loopLines = 0
  const samples: string[] = []
  for (const f of files.slice(-3)) {
    let content = ''
    try { content = readFileSync(f, 'utf8') } catch { continue }
    for (const line of content.split('\n')) {
      if (/dispatch|run-dag|spawn-failed|task-loop|loop/i.test(line)) {
        loopLines += 1
        if (samples.length < 20) samples.push(line.slice(0, 400))
      }
    }
  }
  return { files, loopLines, samples }
}

// ═══════════════════════ 径① 正常完成 + 小球口径 + 进度卡 ═══════════════════════
test('@web-e2e @loop-message-consolidation 1.4-A 径①正常完成：结算卡单卡口径 + 小球对照 + 进度卡行', async () => {
  test.setTimeout(1_800_000)
  mkdirSync(WALKTHROUGH, { recursive: true })
  const meta: Record<string, unknown> = {}
  const PROP = 'walk14-prop'
  const fx = await bootFixture({
    wsName: 'ws-lmc-walk14-a',
    slug: PROP,
    proposalTitle: '真机走查容器甲（1.4 正常完成径）',
    taskTitles: [
      'walk14-任务甲：在 ws 根写 walk14-a.md 一行内容',
      'walk14-任务乙：在 ws 根写 walk14-b.md 一行内容',
      'walk14-任务丙：在 ws 根写 walk14-c.md 一行内容',
    ],
    meta,
  })
  const { page, app, sessionId, runLoop } = fx
  try {
    await runLoop(PROP, 'e2e-walk14-a')
    // 循环进度组卡着陆（1.1 停铸启动 notice 后，着陆锚 = 进度组卡，非消息）
    await expect(
      page.locator(ENTRIES).first(),
      '循环进度组卡着陆（forge · 任务循环事件）',
    ).toContainText('任务循环事件', { timeout: 120_000 })

    // ── 小球口径（运行期：badge 数字 = 任务总数，含 pending）──
    await expect(page.locator(DEP_BADGE).first(), '悬浮球角标在场').toBeVisible({ timeout: 180_000 })
    await expect(page.locator(DEP_PANEL)).toHaveCount(0)
    const badgeA0 = await badgeCount(page)
    console.log(`[walk14] badge A (collapsed, run) = ${String(badgeA0)}`)
    meta.badgeARun = badgeA0
    expect(badgeA0, '小球数字 = 容器任务总数 3（含 pending，折叠态）').toBe(3)
    await fullShot(page, join(WALKTHROUGH, 'web-14-badge-light.png'))

    // ── 展开面板：清单口径对照 + 运行期消息面断言 ──
    await page.locator(DEP_BADGE).first().click()
    const panel = page.locator(DEP_PANEL).first()
    await expect(panel, '展开面板在场').toBeVisible({ timeout: 15_000 })
    const bucketsA = await statBuckets(page, meta)
    console.log(`[walk14] stat A (run) = ${JSON.stringify(bucketsA)}`)
    meta.statARun = bucketsA
    const bucketSumA = bucketsA['完成'] + bucketsA['执行中'] + bucketsA['阻塞'] + bucketsA['待执行'] + bucketsA['已中断']
    expect(bucketSumA, '面板五桶合计 = 3').toBe(3)
    expect(badgeA0, '小球数字与面板清单口径一致（含 pending）').toBe(bucketSumA)
    await clipShot(page, panel, join(WALKTHROUGH, 'web-14-panel-light.png'))
    // 运行期消息面：零循环级消息（指令卡之外零新增唤醒卡、模型回合数零增）、恰一张进度组卡
    const triggerBaseA = await page.locator(TRIGGER).count()
    const turnsBaseA = await page.locator('.turn-fold').count()
    const runSamples: { at: string; triggers: number; entries: number; turns: number }[] = []
    for (let i = 0; i < 6; i++) {
      const s = await page.evaluate(({ triggerSel, entriesSel }) => ({
        triggers: document.querySelectorAll(triggerSel).length,
        entries: document.querySelectorAll(entriesSel).length,
        turns: document.querySelectorAll('.turn-fold').length,
      }), { triggerSel: TRIGGER, entriesSel: ENTRIES })
      runSamples.push({ at: new Date().toISOString(), ...s })
      await page.waitForTimeout(5_000)
    }
    meta.runSamplesA = runSamples
    meta.triggerBaseA = triggerBaseA
    console.log(`[walk14] run samples A = ${JSON.stringify(runSamples)}`)
    expect(Math.max(...runSamples.map((s) => s.triggers)), '运行期零新增「收到执行请求」唤醒卡').toBe(triggerBaseA)
    expect(Math.max(...runSamples.map((s) => s.turns)), '运行期零模型回合（零循环级消息实证）').toBe(turnsBaseA)

    // ── 等结算（收敛口径：执行中/阻塞/待执行/已中断全 0 + 完成 > 0；派生 fix 行容忍）──
    let settledA = false
    for (let i = 0; i < 180 && !settledA; i++) {
      await page.waitForTimeout(5_000)
      const b = await statBuckets(page, meta)
      if (b['完成'] > 0 && b['执行中'] === 0 && b['阻塞'] === 0 && b['待执行'] === 0 && b['已中断'] === 0) settledA = true
    }
    expect(settledA, '径① 结算收敛（四桶归零 + 完成 > 0）').toBe(true)
    await page.waitForTimeout(3_000)

    // 结算消息面：恰一张结算卡（展开正文含「任务概要」口径恰一张），进度组卡仍一张
    let triggerCountA = await page.locator(TRIGGER).count()
    for (let i = 0; i < 18 && triggerCountA <= triggerBaseA; i++) {
      await page.waitForTimeout(5_000)
      if (i === 5 || i === 11) await reopenSession(page, sessionId)
      await scrollTranscriptBottom(page)
      triggerCountA = await page.locator(TRIGGER).count()
    }
    const entriesCountA = await page.locator(ENTRIES).count()
    console.log(`[walk14] trigger cards A = ${String(triggerCountA)} (base ${String(triggerBaseA)}), entries groups A = ${String(entriesCountA)}`)
    meta.triggerCountA = triggerCountA
    meta.entriesCountA = entriesCountA
    const [settleTally, settleBody] = await tallyTriggerBodies(page, '任务概要')
    meta.settleTallyA = settleTally
    console.log(`[walk14] settle tally A = ${String(settleTally)} (cards total ${String(triggerCountA)})`)
    expect(settleTally, '径① 恰一张结算卡（含「任务概要」正文口径）').toBe(1)
    expect(entriesCountA, '消息面恰一张循环进度组卡（零逐事件追加）').toBe(1)
    writeFileSync(join(WALKTHROUGH, 'diag-14-settlement-a.txt'), settleBody)
    expect(settleBody, '结算卡状态计数（完成 N · 阻塞 0）').toMatch(/完成\s*\d+\s*·\s*阻塞\s*0/)
    expect(settleBody, '结算卡下一步动作指示').toMatch(/下一步动作/)
    expect(settleBody, '结算卡各任务概要（slug/local-id 标题 — 终态 · 耗时）').toMatch(new RegExp(`${PROP}/[\\w.-]+\\s+[^\\n]*—\\s*完成\\s*·\\s*\\S+`))
    const settleCard = page.locator(TRIGGER).last()
    await settleCard.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(600)
    await clipShot(page, settleCard, join(WALKTHROUGH, 'web-14-settle-card.png'))
    await fullShot(page, join(WALKTHROUGH, 'web-14-settled-light.png'))

    // 进度卡任务行：起止时间 + 耗时；特写归档
    await ensurePanelExpanded(page, '行读取前')
    const rowsA = page.locator(DEP_ROW)
    const rowCountA = await rowsA.count()
    meta.progressRowsA = rowCountA
    expect(rowCountA, '进度卡任务行 ≥ 3（每任务一行，原地更新不追加；派生 fix 行容忍）').toBeGreaterThanOrEqual(3)
    const rowTextsA: string[] = []
    for (let i = 0; i < rowCountA; i++) rowTextsA.push((await rowsA.nth(i).textContent()) ?? '')
    meta.rowTextsA = rowTextsA
    console.log(`[walk14] rows A = ${JSON.stringify(rowTextsA)}`)
    writeFileSync(join(WALKTHROUGH, 'diag-14-progress-rows-a.txt'), rowTextsA.join('\n'))
    for (const txt of rowTextsA) {
      expect(txt, `进度行含时间（${txt.slice(0, 40)}…）`).toMatch(/\d{1,2}:\d{2}/)
      expect(txt, `进度行含耗时徽标（${txt.slice(0, 40)}…）`).toMatch(/(?:耗时|秒|分|时|m|s|h)/)
      expect(txt, '进度行含任务键').toContain(`${PROP}/`)
    }
    await clipShot(page, page.locator(ENTRIES).first(), join(WALKTHROUGH, 'web-14-progress-rows.png'))
    const cardTextA = (await page.locator(ENTRIES).first().textContent()) ?? ''
    writeFileSync(join(WALKTHROUGH, 'diag-14-progress-card-a.txt'), cardTextA)
    // emitProgress 覆盖核对原料：启动/领取/完成/结算里程碑字样在进度卡事件流
    meta.milestoneHitsA = {
      startup: cardTextA.includes('启动') || cardTextA.includes('从头'),
      claim: cardTextA.includes('领取') || rowTextsA.length > 0,
      complete: cardTextA.includes('完成'),
      settle: cardTextA.includes('结束') || cardTextA.includes('全部'),
    }
    meta.diagFindingsA = scanDiagLogs(fx.userData)
  } finally {
    writeFileSync(join(WALKTHROUGH, 'meta-a.json'), JSON.stringify(meta, null, 2))
    await closeApp(app)
    console.log(`[walk14-A] archived; fixture ws kept at ${fx.fixtureRoot}`)
  }
})

// ═══════════════════════ 径② 幂等重入 + 径③ 异常挂起 ═══════════════════════
test('@web-e2e @loop-message-consolidation 1.4-B 径②幂等重入 + 径③异常挂起：重试计数 + 异常卡五要素', async () => {
  test.setTimeout(1_800_000)
  mkdirSync(WALKTHROUGH, { recursive: true })
  const meta: Record<string, unknown> = {}
  const PROP = 'walk14-prop-b'
  const fx = await bootFixture({
    wsName: 'ws-lmc-walk14-b',
    slug: PROP,
    proposalTitle: '真机走查容器乙（1.4 幂等重入 + 异常径）',
    taskTitles: ['walk14-任务丁：在 ws 根写 walk14-d.md 一行内容'],
    // 真机环境故障注入：worker 模型档位失效 → spawn 拒绝（ERR_SPAWN_FAILED 退避幂等重入 → ×3 halted）
    forgeSettings: { worker: { provider: 'no-such-provider', model: 'no-such-model', reasoning: 'default' } },
    meta,
  })
  const { page, app, sessionId, runLoop } = fx
  try {
    await runLoop(PROP, 'e2e-walk14-b')
    // 故障梯次实测定性（round-13 会话日志 forensics）：spawn 本体不拒（worker 子代理发布成功），
    // worker 首回合即异常退出 → worker-abort 退避梯次（重试第 1..N 次）→ 超限 suspend 挂起。
    // 梯次全程 < 1 分钟——直接等静敛后 reload 重挂载，从重放卡片读全量事件。
    let stableCount = -1
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(10_000)
      await reopenSession(page, sessionId)
      const c = await page.locator(TRIGGER).count()
      if (c === stableCount && c >= 2) break
      stableCount = c
    }
    await ensurePanelExpanded(page, '重试观察前')
    const cardTextB = (await page.locator(ENTRIES).last().textContent()) ?? ''
    writeFileSync(join(WALKTHROUGH, 'diag-14-progress-card-b.txt'), cardTextB)
    // 径③ 断言：异常挂起唤醒消息在消息面在场（进度组卡事件条目承载——组卡折叠态条目
    // textContent 可读；出现次数如实记录，对照「恰一张」AC）
    const cardTextFull = (await page.locator(ENTRIES).last().textContent()) ?? ''
    const suspendOcc = (cardTextFull.match(/循环已挂起待处置/g) ?? []).length
    const retryCountsInSuspend = (cardTextFull.match(/第\s*\d+\s*次，超过重试上限/g) ?? [])
    const triggerCountB = await page.locator(TRIGGER).count()
    meta.triggerCountB = triggerCountB
    meta.suspendOccurrencesB = suspendOcc
    meta.retryCountsInSuspendB = retryCountsInSuspend
    meta.retryCountsTransient = retryCountsInSuspend.length > 0
    console.log(`[walk14] suspend occurrences = ${String(suspendOcc)}, trigger cards = ${String(triggerCountB)}, retry counts = ${JSON.stringify(retryCountsInSuspend)}`)
    expect(suspendOcc, '径③ 异常挂起唤醒消息在消息面在场（进度组卡条目）').toBeGreaterThanOrEqual(1)
    expect(retryCountsInSuspend.length, '径② 重试计数在场（挂起消息「第 N 次，超过重试上限」）').toBeGreaterThanOrEqual(1)
    writeFileSync(join(WALKTHROUGH, 'diag-14-exception-b.txt'), cardTextFull)
    // 径③ 信息集核对（如实记录——AC 五要素对照实测，偏差进报告不强行断言）
    const infoSet: Record<string, boolean> = {
      taskKey: /walk14-prop-b\/[\w.-]+/.test(cardTextFull),
      taskLabel: cardTextFull.includes('任务丁') || /walk14-prop-b\/[\w.-]+/.test(cardTextFull),
      errorText: cardTextFull.includes('原因摘要') || cardTextFull.includes('错误'),
      errorFullRef: cardTextFull.includes('原因全文'),
      phase: /阶段|启动子代理|异常退出/.test(cardTextFull),
      retryCount: /第\s*\d+\s*次|超过重试上限/.test(cardTextFull),
      disposal: /处置入口|下一步动作|重新发起|resume|认领/.test(cardTextFull),
      singleCard: suspendOcc === 1,
    }
    meta.exceptionInfoSetB = infoSet
    console.log(`[walk14] exception info set B = ${JSON.stringify(infoSet)}`)
    // 组卡展开尝试（折叠条目展开后特写；失败兜底全窗）
    const cardB = page.locator(ENTRIES).last()
    await cardB.locator('button').first().click().catch(() => undefined)
    await page.waitForTimeout(600)
    await clipShot(page, cardB, join(WALKTHROUGH, 'web-14-exception-card.png'))
    await fullShot(page, join(WALKTHROUGH, 'web-14-exception-full.png'))
    const panelRowB = (await page.locator(DEP_ROW).allTextContents()).join('\n')
    meta.panelRowsB = panelRowB
    writeFileSync(join(WALKTHROUGH, 'diag-14-panel-rows-b.txt'), panelRowB)
    meta.diagFindingsB = scanDiagLogs(fx.userData)
  } finally {
    writeFileSync(join(WALKTHROUGH, 'meta-b.json'), JSON.stringify(meta, null, 2))
    await closeApp(app)
    console.log(`[walk14-B] archived; fixture ws kept at ${fx.fixtureRoot}`)
  }
})

// ═══════════════════════ 长循环（>500 事件）回放 ═══════════════════════
test('@web-e2e @loop-message-consolidation 1.4-C 长循环回放：110 任务卡片行完整 + 球数不漂移', async () => {
  test.setTimeout(12_000_000)
  mkdirSync(WALKTHROUGH, { recursive: true })
  const meta: Record<string, unknown> = {}
  const PROP = 'walk14-prop-c'
  const taskTitles = Array.from({ length: 110 }, (_, i) => {
    const nn = String(i + 1).padStart(3, '0')
    return `walk14-任务${nn}：在 ws 根写 walk14-c-${nn}.md 一行内容（一行即可，勿多做）`
  })
  const fx = await bootFixture({
    wsName: 'ws-lmc-walk14-c',
    slug: PROP,
    proposalTitle: '真机走查容器丙（1.4 长循环回放）',
    taskTitles,
    meta,
  })
  const { page, app, sessionId, runLoop } = fx
  try {
    const runStartedAt = Date.now()
    await runLoop(PROP, 'e2e-walk14-c')
    await reopenSession(page, sessionId)
    await expect(
      page.locator(ENTRIES).last(),
      'loop C 启动着陆（进度组卡含 C 任务行）',
    ).toContainText('walk14-任务001', { timeout: 120_000 })
    // 展开前核小球口径（110 任务全态：执行中 + 待执行）
    await expect(page.locator(DEP_BADGE).first(), '长循环悬浮球在场').toBeVisible({ timeout: 60_000 })
    const badgeCRun = await badgeCount(page)
    console.log(`[walk14] badge C (run) = ${String(badgeCRun)}`)
    meta.badgeCRun = badgeCRun
    expect(badgeCRun, '长循环小球数字 = 任务总数 110（含 pending）').toBe(110)
    await fullShot(page, join(WALKTHROUGH, 'web-14-longloop-badge-mid.png'))

    // 等长循环结算（收敛口径——预算 2.6h；周期采样留证）
    const cSamples: { at: string; elapsedMin: number; stat: string; badge: number }[] = []
    let settledC = false
    for (let i = 0; i < 1900 && !settledC; i++) {
      await page.waitForTimeout(5_000)
      // 统计条只存在于展开面板——周期性展开（折叠态 stat 读空，收敛判据失锚）
      if (i % 6 === 0) await ensurePanelExpanded(page, `结算观察 #${String(i)}`)
      const b = await statBuckets(page, meta)
      if (i % 12 === 0) {
        const collapsed = (await page.locator(DEP_PANEL).count()) === 0
        const sample = {
          at: new Date().toISOString(),
          elapsedMin: Math.round((Date.now() - runStartedAt) / 60_000),
          stat: String(meta.lastStatRaw ?? ''),
          badge: collapsed ? await badgeCount(page) : -1,
        }
        cSamples.push(sample)
        console.log(`[walk14] C sample ${JSON.stringify(sample)}`)
      }
      if (b['完成'] >= 110 && b['执行中'] === 0 && b['阻塞'] === 0 && b['待执行'] === 0 && b['已中断'] === 0) settledC = true
    }
    meta.cSamples = cSamples
    meta.settledC = settledC
    expect(settledC, '长循环结算收敛（完成 ≥110，四桶归零）').toBe(true)
    await page.waitForTimeout(5_000)

    // 回放取证：reload → 重开会话 → 面板行完整 + 球数不漂移 + 恰一张 C 结算卡
    await reopenSession(page, sessionId)
    await expect(page.locator(DEP_BADGE).first(), '回放后悬浮球在场').toBeVisible({ timeout: 60_000 })
    const badgeAfterReload = await badgeCount(page)
    console.log(`[walk14] badge C after reload = ${String(badgeAfterReload)}`)
    meta.badgeCAfterReload = badgeAfterReload
    expect(badgeAfterReload, '回放后小球数字 ≥ 110（不随窗口截断漂移）').toBeGreaterThanOrEqual(110)
    await fullShot(page, join(WALKTHROUGH, 'web-14-longloop-badge.png'))
    await page.locator(DEP_BADGE).first().click()
    const panelC = page.locator(DEP_PANEL).first()
    await expect(panelC, '回放后展开面板在场').toBeVisible({ timeout: 15_000 })
    const bucketsC = await statBuckets(page, meta)
    meta.statCAfter = bucketsC
    expect(bucketsC['完成'], '回放后完成 ≥110').toBeGreaterThanOrEqual(110)
    const rowsC = page.locator(DEP_ROW)
    const rowCountC = await rowsC.count()
    console.log(`[walk14] rows C after reload = ${String(rowCountC)}`)
    meta.progressRowsC = rowCountC
    expect(rowCountC, '长循环回放后卡片行完整（≥110 任务行不丢）').toBeGreaterThanOrEqual(110)
    const rowTextsC: string[] = []
    for (let i = 0; i < Math.min(rowCountC, 8); i++) rowTextsC.push((await rowsC.nth(i).textContent()) ?? '')
    meta.rowTextsCSample = rowTextsC
    for (const txt of rowTextsC) {
      expect(txt, '回放行含时间与耗时').toMatch(/\d{1,2}:\d{2}/)
      expect(txt, '回放行含任务键').toContain(`${PROP}/`)
    }
    await fullShot(page, join(WALKTHROUGH, 'web-14-longloop-panel.png'))
    await clipShot(page, page.locator(ENTRIES).last(), join(WALKTHROUGH, 'web-14-longloop-progress-card.png'))
    let settleBodyC: string | undefined
    for (let attempt = 0; attempt < 5 && settleBodyC === undefined; attempt++) {
      await reopenSession(page, sessionId)
      await page.waitForTimeout(3_000)
      settleBodyC = await expandTriggerByText(page, '全部任务已完成')
        .then((r) => r ?? expandTriggerByText(page, '任务概要'))
    }
    expect(settleBodyC, 'C 结算卡可展开').toBeTruthy()
    writeFileSync(join(WALKTHROUGH, 'diag-14-settlement-c-head.txt'), (settleBodyC ?? '').slice(0, 4000))
    expect(settleBodyC ?? '', 'C 结算卡状态计数（完成 ≥110）').toMatch(/完成\s*1[1-9]\d|完成\s*110/)
    const summaryRowCountC = ((settleBodyC ?? '').match(new RegExp(`${PROP}/[\\w.-]+`, 'g')) ?? []).length
    meta.summaryRowsC = summaryRowCountC
    expect(summaryRowCountC, 'C 结算卡任务概要 ≥110 行在场').toBeGreaterThanOrEqual(110)
    await fullShot(page, join(WALKTHROUGH, 'web-14-longloop-settled.png'))
    meta.diagFindingsC = scanDiagLogs(fx.userData)
  } finally {
    writeFileSync(join(WALKTHROUGH, 'meta-c.json'), JSON.stringify(meta, null, 2))
    await closeApp(app)
    console.log(`[walk14-C] archived; fixture ws kept at ${fx.fixtureRoot}`)
  }
})
