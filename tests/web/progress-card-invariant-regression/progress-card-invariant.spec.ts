// forge-progress-card-invariant-hardening 1.6 · 组卡不变量 Playwright spec（journey =
// progress-card-invariant-regression，module = web——tests/<moduleName>/<journey>/ 约定树，
// Playwright project desktop-journeys 发现）。
//
// 驱动策略（零真实模型）：官方开户（真实 startSession）→ 本地播种器（progress-seed.ts）
// 把确定性事件序列（含 'forge/progress'——载荷形状 = 案发样本实录）以新 zstd 帧追加进
// durable 会话日志 → 重开/reload → 官方 dsh-client-store 依 seq 重灌 → 官方 chat 视图
// fold → forge 组节点物化 → DOM 渲染。播种只代位「事件生产者」，完整装配链（J2/J3 的
// 案发面）真实照跑。
//
// 断言-契约溯源：每条断言注 CT-GROUP-xx / INV-x（契约 =
// .forge/docs/proposals/forge-progress-card-invariant-hardening/testing/
// progress-card-invariant-regression/contracts/contracts.md，锚已回填实锚）。
// 断言锚（实锚）：组卡 = [data-dswf-event-entries]（组卡根元素——ForgeEventEntries.tsx）；
// 行键 = [data-chat-node-key]（官方 chat 行节点键；组卡行键 = `forge-event-progress-<组末
// progress seq>`——anchorSeq 物化的 DOM 投影）；人类消息行键 = 播种消息 id；
// 滚动容器 = [data-conversation-scroll]。不锁文案、不锁 DOM 层级。
//
// 已上报分歧（fix/disc 裁决前保持契约口径断言——不为变绿弱化）：
//  - PCI-DIVERGE-1（CT-GROUP-05 O-C / J4 B4.1）：契约要求插话后同主题续流仍归原卡
//    （第二张同主题卡 = FAIL）；实现 fold 按人类插话分组（插话收口前组、续流开新组→新卡）。
//  - PCI-DIVERGE-2（CT-GROUP-04 O-C / J5）：契约要求双主题交错各一张卡；实现 fold 无主题
//    维度（仅插话分组），无插话交错 → 单卡。
//  - PCI-DIVERGE-3：意向锚 data-dswf-progress-group 与主题标识字段未由 coding 提供
//    （实现持既有锚 data-dswf-event-entries，无主题标识属性）——契约锚表已回填并标注。
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../../e2e/support/launch.js'
import { registerProject } from '../../../e2e/support/rpc.js'
import { sessionLogById } from '../../../e2e/support/session-files.js'
import { refreshSessionProjcache } from '../../../e2e/support/replay/transcript-seed.js'
import { appendSeedEvents, maxEventSeq, SeedLogBuilder, type TurnSeed } from './progress-seed.js'

const CARD = '[data-dswf-event-entries]'
const SCROLL = '[data-conversation-scroll]'
/** 组卡行键（组末成员 Context id——CT-GROUP-04 锚定真值的 DOM 投影） */
const cardKeyOf = (lastProgressSeq: number): string => `forge-event-progress-${String(lastProgressSeq)}`

/** 全部 chat 行键（DOM 序——位置断言承载面） */
async function rowKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-chat-anchor-key]')).map(
      (el) => el.getAttribute('data-chat-node-key') ?? '',
    ),
  )
}

/** 组卡行键集（每张卡 → 其官方行节点键；DOM 序） */
async function cardKeys(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-dswf-event-entries]')).map(
      (el) => el.closest('[data-chat-anchor-key]')?.getAttribute('data-chat-node-key') ?? '',
    ),
  )
}

/** 组卡在场等待（readiness = 卡在场，非固定 sleep——J2 断言锚纪律） */
async function waitForCard(page: Page, timeout = 30_000): Promise<void> {
  await page.locator(CARD).first().waitFor({ state: 'attached', timeout })
}

interface Fixture {
  readonly app: ElectronApplication
  readonly page: Page
  readonly sessionId: string
  readonly userData: string
  readonly dshHome: string
  readonly wsRoot: string
}

/** 夹具工作区 + 隔离 userData + 官方开户会话（walk14 同径——sidebar 新会话钮） */
async function bootWithSession(tag: string): Promise<Fixture> {
  const wsRoot = mkdtempSync(join(tmpdir(), `dsw-pci-${tag}-ws-`))
  const ws = join(wsRoot, `ws-${tag}`)
  mkdirSync(ws, { recursive: true })
  writeFileSync(join(ws, 'README.md'), 'progress-card-invariant fixture\n')
  execFileSync('git', ['init', '-q'], { cwd: ws })
  execFileSync('git', ['config', 'user.email', 'pci@e2e.local'], { cwd: ws })
  execFileSync('git', ['config', 'user.name', 'pci-e2e'], { cwd: ws })
  execFileSync('git', ['add', '.'], { cwd: ws })
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: ws })
  const userData = mkdtempSync(join(tmpdir(), `dsh-pci-${tag}-ud-`))
  const dshHome = join(userData, 'dsh-home')
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero' })
  const { app, page } = launched
  const project = await registerProject(page, ws, `ws-${tag}`)
  await page
    .locator('[data-dswf-sidebar="wide"]', { has: page.locator(`[data-dswf-project="${project.id}"]`) })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(async () => {
      await page.locator('button[aria-label="打开侧边栏"], button[title="打开侧边栏"]').first().click()
      await expect(page.locator(`[data-dswf-project="${project.id}"]`).first()).toBeVisible({ timeout: 15_000 })
    })
  await page.locator('.dswf-sidebar-project-row').first().hover()
  await page.locator('[data-dswf-project-action="new-session"]').first().click({ force: true })
  const sessionRow = page.locator(`[data-dswf-project="${project.id}"] [data-dswf-session]`).first()
  await sessionRow.waitFor({ state: 'visible', timeout: 30_000 })
  const sessionId = await sessionRow.getAttribute('data-dswf-session')
  expect(sessionId, '会话开户（sessionId 在场）').toBeTruthy()
  await closeApp(app)
  return { app, page, sessionId: String(sessionId), userData, dshHome, wsRoot }
}

/** 播种 + 投影缓存推进（projcache 缺席 = 冷读日志本体，零补丁——transcript-seed 同口径） */
function seed(fixture: Fixture, build: (builder: SeedLogBuilder) => void, title: string): void {
  const log = sessionLogById(fixture.dshHome, fixture.sessionId)
  expect(log, '会话日志在场（官方开户产物）').toBeDefined()
  const logPath = log!
  const builder = new SeedLogBuilder(maxEventSeq(logPath) + 1)
  build(builder)
  appendSeedEvents(logPath, builder.build())
  refreshSessionProjcache(fixture.dshHome, fixture.sessionId, {
    title,
    asOfSeq: maxEventSeq(logPath),
    lastPromptAt: Date.now(),
  })
}

/** 复启 + 重开会话（J2 重放驱动面：重启宿主后重开同一会话） */
async function relaunchAndOpen(fixture: Fixture): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchHost({ userData: fixture.userData })
  const page = launched.page
  await openSession(page, fixture.sessionId)
  return { app: launched.app, page }
}

async function openSession(page: Page, sessionId: string): Promise<void> {
  const row = page.locator(`[data-dswf-session="${sessionId}"]`).first()
  await row.waitFor({ state: 'visible', timeout: 60_000 })
  await row.click()
  await page.locator(SCROLL).first().waitFor({ state: 'attached', timeout: 30_000 })
}

/** 滚动窗口驱动（J3 裁剪触发面——官方转录滚动容器 scrollTop） */
async function scrollChat(page: Page, toTop: boolean): Promise<void> {
  await page.evaluate((top) => {
    const el = document.querySelector('[data-conversation-scroll]') as HTMLElement | null
    if (el !== null) el.scrollTop = top ? 0 : el.scrollHeight
  }, toTop)
  await page.waitForTimeout(600)
}

test('@web-e2e @progress-card J1 主链：进度流物化单卡 → 锚定组末 → settle 不顶掉 + B1.1 无 answer turn', async () => {
  test.setTimeout(300_000)
  const fixture = await bootWithSession('j1')
  let turns!: { t1: TurnSeed; t2: TurnSeed; t3: TurnSeed }
  seed(fixture, (b) => {
    const t1 = b.turn({
      userText: '执行 seed-prop-a 的任务',
      progress: [
        { sourceSlug: 'seed-prop-a', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-prop-a', verb: 'claim', taskKey: 'seed-prop-a/1.1', taskTitle: 'T1', scenario: 'claim/new' },
        { sourceSlug: 'seed-prop-a', verb: 'loop', scenario: 'pool/pending' },
        { sourceSlug: 'seed-prop-a', verb: 'claim', taskKey: 'seed-prop-a/1.1', taskTitle: 'T1', scenario: 'claim/spawned' },
      ],
      assistantText: '派发循环已启动',
    })
    const t2 = b.turn({
      userText: '继续执行下一项（工具收尾形态）',
      progress: [
        { sourceSlug: 'seed-prop-a', verb: 'claim', taskKey: 'seed-prop-a/1.2', taskTitle: 'T2', scenario: 'claim/new' },
        { sourceSlug: 'seed-prop-a', verb: 'loop', scenario: 'pool/pending' },
      ],
      assistantText: null,
      tool: { name: 'seed_noop', arguments: '{}', resultText: 'done' },
    })
    const t3 = b.turn({ userText: '收尾后的后续人类消息' })
    turns = { t1, t2, t3 }
  }, 'J1 主链')
  const opened = await relaunchAndOpen(fixture)
  try {
    await waitForCard(opened.page)
    // CT-GROUP-01 O-A/O-D + INV-4：每 turn 恰一张组卡、无重复卡（单帧多事件收敛）
    const keys = await cardKeys(opened.page)
    expect(keys, 'J1 两 turn 各恰一张组卡（O-D 无重复卡）').toHaveLength(2)
    // CT-GROUP-04 O-A + INV-2：锚定 = 组末成员真实 seq（非组首、非插话/台账派生位）
    expect(keys[0], '组卡一锚于组末成员（t1 第 4 枚 progress seq）').toBe(cardKeyOf(turns.t1.progressSeqs[3]!))
    expect(keys[1], '组卡二锚于组末成员（t2 第 2 枚 progress seq）').toBe(cardKeyOf(turns.t2.progressSeqs[1]!))
    // CT-GROUP-01 O-A + INV-2：位置 = 组末成员之后、下一非成员消息之前（DOM 行序承载）
    const rows = await rowKeys(opened.page)
    const idx1 = rows.indexOf(keys[0]!)
    const idx2 = rows.indexOf(keys[1]!)
    const idxFollowUp = rows.indexOf(turns.t3.userMsgId)
    expect(idx1, '组卡一行在场于 chat 行序').toBeGreaterThanOrEqual(0)
    expect(idxFollowUp, '后续人类消息行在场（消息 id 行键）').toBeGreaterThanOrEqual(0)
    expect(idx1, '组卡一先于后续非成员消息（O-A 位置断言）').toBeLessThan(idxFollowUp)
    expect(idx2, '组卡二在组卡一之后（turn 序承载）').toBeGreaterThan(idx1)
    // CT-GROUP-05 O-B + B1.1：无 answer turn 收尾后组卡在场且锚定不变（settle 不顶掉）
    expect(await cardKeys(opened.page), 'settle 后组卡集稳定（INV-1 终态在场）').toEqual(keys)
  } finally {
    await closeApp(opened.app)
  }
})

test('@web-e2e @progress-card J2 reload 重放自愈：重放后卡在场且锚组末（B2.1 终态判读 + B2.2 案发样本形态）', async () => {
  test.setTimeout(300_000)
  const fixture = await bootWithSession('j2')
  let t1!: TurnSeed
  seed(fixture, (b) => {
    // B2.2：案发样本 session-637fab65 形态（turn/start → progress×4（startup/claim/loop/claim）
    // → answer → turn/end）——事件形状逐同构 forge-event-node.fixture.ts
    t1 = b.turn({
      userText: '执行 forge-incident-replay 的任务',
      progress: [
        { sourceSlug: 'forge-incident-replay', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'forge-incident-replay', verb: 'claim', taskKey: 'forge-incident-replay/1.1', taskTitle: 'T1', scenario: 'claim/new' },
        { sourceSlug: 'forge-incident-replay', verb: 'loop', scenario: 'pool/pending' },
        { sourceSlug: 'forge-incident-replay', verb: 'claim', taskKey: 'forge-incident-replay/1.1', taskTitle: 'T1', scenario: 'claim/spawned', workerSessionId: '00000000-0000-4000-8000-000000000001' },
      ],
      assistantText: '派发循环已启动（回放形态）',
    })
  }, 'J2 重放')
  const opened = await relaunchAndOpen(fixture)
  try {
    const expectedKey = cardKeyOf(t1.progressSeqs[3]!)
    await waitForCard(opened.page)
    // CT-GROUP-01 O-C + CT-GROUP-04 O-B：首次打开即锚组末（非组首 seq[0]）
    expect(await cardKeys(opened.page), '案发样本形态组卡在场且锚组末成员').toEqual([expectedKey])
    // B2.1：renderer reload（视图就绪前允许未到——终态判读，readiness = 卡在场）
    await opened.page.reload()
    await openSession(opened.page, fixture.sessionId)
    await waitForCard(opened.page)
    expect(await cardKeys(opened.page), 'reload 重放后组卡重新在场且锚不变（INV-1/INV-2）').toEqual([expectedKey])
  } finally {
    await closeApp(opened.app)
  }
  // 重启宿主后重开同一会话（J2 happy path 步骤 1 的强形态——持久化→重放→渲染全链）
  const reopened = await relaunchAndOpen(fixture)
  try {
    await waitForCard(reopened.page)
    expect(await cardKeys(reopened.page), '宿主重启重放后组卡在场且锚组末（O-C）').toEqual([cardKeyOf(t1.progressSeqs[3]!)])
  } finally {
    await closeApp(reopened.app)
  }
})

test('@web-e2e @progress-card J3 窗口裁剪自愈：长转录滚出/滚回反复循环后卡在场锚不变（B3.3 + B3.2 叠加）', async () => {
  test.setTimeout(420_000)
  const fixture = await bootWithSession('j3')
  let t1!: TurnSeed
  seed(fixture, (b) => {
    for (let i = 1; i <= 30; i++) b.turn({ userText: `填充消息 ${String(i)}（长转录驱动窗口裁剪）` })
    t1 = b.turn({
      userText: '执行 seed-clip-prop 的任务',
      progress: [
        { sourceSlug: 'seed-clip-prop', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-clip-prop', verb: 'claim', taskKey: 'seed-clip-prop/1.1', taskTitle: 'T1', scenario: 'claim/new' },
        { sourceSlug: 'seed-clip-prop', verb: 'loop', scenario: 'pool/pending' },
      ],
      assistantText: '裁剪形态任务已启动',
    })
    for (let i = 31; i <= 60; i++) b.turn({ userText: `填充消息 ${String(i)}（组卡区段滚出视口驱动面）` })
  }, 'J3 裁剪')
  const opened = await relaunchAndOpen(fixture)
  try {
    const expectedKey = cardKeyOf(t1.progressSeqs[2]!)
    await waitForCard(opened.page)
    expect(await cardKeys(opened.page), '裁剪前基线：组卡在场锚组末').toEqual([expectedKey])
    // CT-GROUP-02 O-A/O-C + INV-1/INV-3：滚出（区段滚出视口 → state void）→ 滚回，×3 循环
    for (let cycle = 1; cycle <= 3; cycle++) {
      await scrollChat(opened.page, true)
      await scrollChat(opened.page, false)
      const keysAfterCycle = await cardKeys(opened.page)
      expect(keysAfterCycle, `第 ${String(cycle)} 轮滚回后组卡在场且锚不变（O-C 反复裁剪循环）`).toEqual([expectedKey])
    }
    // B3.2：裁剪后 reload 叠加——重放按持久化数据重建，裁剪残留不污染重放结果
    await opened.page.reload()
    await openSession(opened.page, fixture.sessionId)
    await waitForCard(opened.page)
    expect(await cardKeys(opened.page), '裁剪后 reload 重放组卡在场锚不变（INV-1）').toEqual([expectedKey])
  } finally {
    await closeApp(opened.app)
  }
})

test('@web-e2e @progress-card J4 插话独立：插话消息不折入组内、组卡锚不跳插话（CT-GROUP-05 O-A）+ B4.2 插话即新任务', async () => {
  test.setTimeout(300_000)
  const fixture = await bootWithSession('j4')
  let t1!: TurnSeed
  let interject!: TurnSeed
  let tNew!: TurnSeed
  seed(fixture, (b) => {
    t1 = b.turn({
      userText: '执行 seed-int-prop 的任务',
      progress: [
        { sourceSlug: 'seed-int-prop', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-int-prop', verb: 'claim', taskKey: 'seed-int-prop/1.1', taskTitle: 'T1', scenario: 'claim/new' },
      ],
      assistantText: '首轮作答',
    })
    interject = b.turn({ userText: '插话：确认进度', userId: 'seed-interject-row-1' })
    tNew = b.turn({
      userText: '插话即新任务：执行 seed-int-prop-b',
      progress: [{ sourceSlug: 'seed-int-prop-b', verb: 'startup', scenario: 'startup/from-scratch' }],
      assistantText: '新任务已启动',
    })
  }, 'J4 插话')
  const opened = await relaunchAndOpen(fixture)
  try {
    await waitForCard(opened.page)
    const keys = await cardKeys(opened.page)
    const firstCard = keys[0] ?? ''
    expect(firstCard, '原组卡在场且锚组末成员（插话前组末 progress seq）').toBe(cardKeyOf(t1.progressSeqs[1]!))
    // CT-GROUP-05 O-A + INV-2/INV-4：插话消息 = 独立顶层行，不折入组卡
    const rows = await rowKeys(opened.page)
    const idxCard = rows.indexOf(firstCard)
    const idxInterject = rows.indexOf(interject.userMsgId)
    expect(idxCard, '组卡行在场').toBeGreaterThanOrEqual(0)
    expect(idxInterject, '插话行在场（独立顶层消息——消息 id 行键）').toBeGreaterThanOrEqual(0)
    expect(idxCard, '插话消息在组卡之后独立呈现（不折入组内）').toBeLessThan(idxInterject)
    const nested = await opened.page
      .locator(`[data-chat-node-key="${firstCard}"] [data-chat-node-key="${interject.userMsgId}"]`)
      .count()
    expect(nested, '插话行不嵌套于组卡行内（O-A 锚不跳插话）').toBe(0)
    // B4.2：插话即新任务 → 独立新组卡（锚于新组末成员、在插话行之后）
    const newCard = cardKeyOf(tNew.progressSeqs[0]!)
    expect(keys, '新任务产出独立新组卡（INV-4 独立归属）').toContain(newCard)
    expect(rows.indexOf(newCard), '新组卡在插话行之后').toBeGreaterThan(idxInterject)
  } finally {
    await closeApp(opened.app)
  }
})

test('@web-e2e @progress-card J4 B4.1 插话后同主题续流仍归原卡（契约口径——分歧 PCI-DIVERGE-1）', async () => {
  test.setTimeout(300_000)
  const fixture = await bootWithSession('j4b1')
  let t1!: TurnSeed
  let interject!: TurnSeed
  seed(fixture, (b) => {
    t1 = b.turn({
      userText: '执行 seed-cont-prop 的任务',
      progress: [
        { sourceSlug: 'seed-cont-prop', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-cont-prop', verb: 'claim', taskKey: 'seed-cont-prop/1.1', taskTitle: 'T1', scenario: 'claim/new' },
      ],
      assistantText: '首轮作答',
    })
    interject = b.turn({ userText: '插话：请继续', userId: 'seed-interject-row-2' })
    b.turn({
      userText: '插话后原任务恢复执行（同主题续流）',
      progress: [{ sourceSlug: 'seed-cont-prop', verb: 'loop', scenario: 'pool/pending' }],
      assistantText: '续流作答',
    })
  }, 'J4 B4.1')
  const opened = await relaunchAndOpen(fixture)
  try {
    await waitForCard(opened.page)
    const rows = await rowKeys(opened.page)
    expect(rows.indexOf(interject.userMsgId), '插话行在场').toBeGreaterThanOrEqual(0)
    // CT-GROUP-05 O-C：插话后原任务继续产出进度事件 → 仍归属原卡，不产出第二张同主题卡。
    // 分歧 PCI-DIVERGE-1：实现 fold 按插话分组（续流开新组→新卡）——本断言保持契约口径，
    // 预期红直至 fix/disc 裁决（归因契约改契约 / 归因实现改 coding），禁止脚本内就地调和。
    expect(await cardKeys(opened.page), '同主题续流仍归原卡（O-C——分歧 PCI-DIVERGE-1）').toEqual([
      cardKeyOf(t1.progressSeqs[1]!),
    ])
  } finally {
    await closeApp(opened.app)
  }
})

test('@web-e2e @progress-card J5 双主题并行：两主题各一张卡、锚各自组末（契约口径——分歧 PCI-DIVERGE-2）', async () => {
  test.setTimeout(300_000)
  const fixture = await bootWithSession('j5')
  let t1!: TurnSeed
  seed(fixture, (b) => {
    t1 = b.turn({
      userText: '并行执行 seed-topic-a 与 seed-topic-b',
      progress: [
        { sourceSlug: 'seed-topic-a', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-topic-b', verb: 'startup', scenario: 'startup/from-scratch' },
        { sourceSlug: 'seed-topic-a', verb: 'claim', taskKey: 'seed-topic-a/1.1', taskTitle: 'TA', scenario: 'claim/new' },
        { sourceSlug: 'seed-topic-b', verb: 'claim', taskKey: 'seed-topic-b/1.1', taskTitle: 'TB', scenario: 'claim/new' },
      ],
      assistantText: '双主题并行作答',
    })
  }, 'J5 双主题')
  const opened = await relaunchAndOpen(fixture)
  try {
    await waitForCard(opened.page)
    const keys = await cardKeys(opened.page)
    // CT-GROUP-04 O-C + INV-2/INV-4：两主题交错 → 各一张卡、各锚自己组末成员（互不串）。
    // 分歧 PCI-DIVERGE-2：实现 fold 无主题维度（仅人类插话分组）——无插话交错产出单卡。
    // 本断言保持契约口径，预期红直至 fix/disc 裁决，禁止脚本内就地调和。
    expect(keys, '双主题各一张组卡（O-C——分歧 PCI-DIVERGE-2）').toEqual([
      cardKeyOf(t1.progressSeqs[1]!),
      cardKeyOf(t1.progressSeqs[3]!),
    ])
  } finally {
    await closeApp(opened.app)
  }
})
