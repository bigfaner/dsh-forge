// @proposal:composer-input-history-plugin @web-e2e
// blitz e2e 锚——dsh-forge 壳缺省装载 @dsh-forge/input-history（验收 2/3 壳侧口径 + 验收 4）。
//
// 装载语义（本 spec 固定口径）：dsh-forge 壳 = **缺省固定装载**（apps/web/src/shell/boot.ts
// steerBootGraph 官方 __ModuleLoader__ 机制追加产品行，无开关门控、无硬接线 wiring）——
// 与 desktop 侧 plugin-manager 动态装/卸（「装/卸即开关」）语义不同，**本 spec 不做卸载
// 断言**（卸载侧口径 = desktop 真机 CLI 动线取证，证据归档提案 walkthrough/）。
//
// 断言链（对照提案验收 2/3/4）：
//   ① 装载在场：__DSH_BOOT__ 组合图含 @dsh-forge/input-history 产品行（壳掌舵第二行）+
//     全程 console 零 'did not activate' / 零插件接线失败告警（装载即激活）；
//   ② 翻阅状态机（readline 键位，零凭据径——发送的 user/message 事件落盘即历史源，
//     模型往返不参与判据）：空草稿 ArrowUp 依次翻出本会话已发送用户消息（最新→最旧）、
//     最旧停住；ArrowDown 回翻、翻过最新恢复翻阅前暂存草稿；
//   ③ 多行草稿原生光标：非空多行草稿 + 光标不在首行行首 → ArrowUp 保持原生光标移动
//     （草稿文本逐字不变——翻阅门不误触）；
//   ④ mention 菜单守卫：/ 唤醒候选菜单开（role=listbox + option）时方向键归菜单——
//     草稿不被历史改写、菜单保持开（键未消失）；
//   ⑤ 会话切换切源：新会话后历史源随活跃会话切换——新会话翻出的是新会话自己的消息，
//     前会话消息不越界；
//   ⑥ 全程 pageErrors 空（接线 fail-soft 不外溢的总证面）。
//
// Hard Rules：零产品源码改动（断言失败 → 判定归属：实现缺陷回本提案语义、锚面缺陷本任务
// 修锚）；夹具 = 仓外 tmp；实跑前无活跃 dsh-forge Electron 实例（单实例锁坑）；
// 零真实模型凭据（launch 层零播种纪律——历史源 = user/message 事件落盘，非模型回执）。

import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { CONVERSATION_CONTENT, PROJECT_ROW_ANY } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'

/** 三条历史消息（发送序——历史源按 user/message 事件 seq 排布） */
const MSG_A = '历史甲-ih-e2e-首条探针'
const MSG_B = '历史乙-ih-e2e-次条探针'
const MSG_C = '历史丙-ih-e2e-末条探针'
/** 第二会话独有消息（切源判定面） */
const MSG_D = '第二会话独有-ih-e2e-切源探针'

/** composer 定位（可见位——会话/hero 双相位并存时取可见者；bug-hero 先例同锚） */
function composerOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:visible').last()
}

/** composer 当前草稿全文（contenteditable textContent——整体置稿/翻阅断言读面） */
async function draftTextOf(page: Page): Promise<string> {
  return composerOf(page).evaluate((el) => (el as HTMLElement).textContent ?? '')
}

/** 会话输入面可编辑态收敛（installer-smoke 判例——contentEditable 即时在场竞态门） */
async function waitComposerEditable(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
        return els.length > 0 && [...els].every((el) => el.isContentEditable)
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined)
}

/** 真实键入 + Enter 发送（零凭据径——user/message 事件落盘即历史源）并等转录收留 */
async function sendUserMessage(page: Page, text: string): Promise<void> {
  const composer = composerOf(page)
  await composer.click()
  await page.keyboard.insertText(text)
  // 回显收敛（installer-smoke 判例：重挂载竞态吃首次 insert——重试重插，断言语义不变）
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await draftTextOf(page)).includes(text)) break
    await composer.click()
    await page.keyboard.insertText(text)
    await page.waitForTimeout(2_000)
  }
  expect(await draftTextOf(page), `键入回显（${text}）`).toContain(text)
  await page.keyboard.press('Enter')
  // 发送收留：转录出现该用户行（user/message 事件落盘——历史源事实面）
  await expect(
    page.locator(CONVERSATION_CONTENT).first(),
    `用户消息入转录（${text}）`,
  ).toContainText(text, { timeout: 60_000 })
  await waitComposerEditable(page)
}

test('@web-e2e @blitz input-history 壳缺省装载：boot 图行 + 翻阅/回翻/暂存恢复/多行原生光标/mention 守卫/会话切源', async () => {
  test.setTimeout(420_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-ih-ud-'))
  const consoleAll: string[] = []
  let fixtureRoot: string | undefined
  let fixtureRoot2: string | undefined
  const launched: Launched = await launchHost({ userData, expectPhase: 'hero', collectConsole: false })
  const { app, page, pageErrors } = launched
  page.on('console', (msg) => consoleAll.push(`[${msg.type()}] ${msg.text()}`))
  try {
    // ── ① 装载在场：__DSH_BOOT__ 组合图产品行（壳掌舵追加——boot.ts steerBootGraph）──
    const bootEntries = await page.evaluate(() => {
      const g = globalThis as { __DSH_BOOT__?: { entries?: readonly { id?: string; url?: string }[] } }
      return (g.__DSH_BOOT__?.entries ?? []).map((e) => ({ id: e.id ?? '', url: e.url ?? '' }))
    })
    const ihRow = bootEntries.find((e) => e.id === '@dsh-forge/input-history')
    expect(ihRow, '__DSH_BOOT__ 组合图含 input-history 产品行（缺省装载）').toBeDefined()
    expect(ihRow?.url, '产品行 = input-history-client.js classic script（自注册 CJS 装载契约）').toContain(
      'input-history-client.js',
    )

    // ── 准备：会话开户（md-mermaid 先例径——RPC 注册夹具工作区 + 芯片流开会话）
    //   + 三条历史消息（零凭据径——发送即 user/message 事件落盘，模型往返不参与判据）──
    await ensureNoBlockingDialog(page)
    fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-ih-ws-'))
    const wsDir = join(fixtureRoot, 'ih-demo')
    mkdirSync(wsDir, { recursive: true })
    await registerProject(page, wsDir, 'ih-demo')
    await selectWorkspaceViaChip(page, 'ih-demo')
    await waitComposerEditable(page)
    await sendUserMessage(page, MSG_A)
    await sendUserMessage(page, MSG_B)
    await sendUserMessage(page, MSG_C)

    const composer = composerOf(page)
    const draft = (): Promise<string> => draftTextOf(page)

    // ── ② 空草稿 ArrowUp：依次翻出 丙 → 乙 → 甲（最新→最旧），最旧停住 ──
    await composer.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await expect.poll(draft, '翻阅前清稿').toBe('')
    await page.keyboard.press('ArrowUp')
    await expect.poll(draft, 'ArrowUp#1 翻出最新一条（丙）').toBe(MSG_C)
    await page.keyboard.press('ArrowUp')
    await expect.poll(draft, 'ArrowUp#2 回翻（乙）').toBe(MSG_B)
    await page.keyboard.press('ArrowUp')
    await expect.poll(draft, 'ArrowUp#3 回翻（甲）').toBe(MSG_A)
    await page.keyboard.press('ArrowUp')
    await expect
      .poll(draft, 'ArrowUp#4 已在最旧一条停住（不越界、不丢稿）')
      .toBe(MSG_A)

    // ── ② ArrowDown 回翻：乙 → 丙 → 翻过最新恢复翻阅前暂存（空稿）──
    await page.keyboard.press('ArrowDown')
    await expect.poll(draft, 'ArrowDown#1 回翻（乙）').toBe(MSG_B)
    await page.keyboard.press('ArrowDown')
    await expect.poll(draft, 'ArrowDown#2 回翻（丙）').toBe(MSG_C)
    await page.keyboard.press('ArrowDown')
    await expect.poll(draft, 'ArrowDown#3 翻过最新恢复暂存（翻阅前 = 空稿）').toBe('')

    // ── ② 暂存恢复（非空暂存径）：行首 ArrowUp 进入翻阅（暂存非空稿）→ 回翻越界恢复 ──
    const STASH = '翻阅前暂存稿-ih-e2e'
    await composer.click() // 程序化置稿后焦点可能回落——重聚焦再键入
    await page.keyboard.insertText(STASH)
    await expect.poll(draft, '暂存稿键入回显').toBe(STASH)
    await page.keyboard.press('Home') // 光标回首行行首（caret=0——翻阅触发门）
    await page.keyboard.press('ArrowUp')
    await expect.poll(draft, '非空暂存 + 行首 ArrowUp 翻出最新（丙；暂存被收起）').toBe(MSG_C)
    await page.keyboard.press('ArrowDown')
    await expect.poll(draft, 'ArrowDown 翻过最新恢复翻阅前暂存稿（逐字）').toBe(STASH)

    // ── ③ 多行草稿原生光标：非空多行草稿 + 光标不在首行行首 → ArrowUp 原生移动不翻阅 ──
    await composer.click() // 重聚焦（同上——置稿后焦点回落防线）
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await expect.poll(draft, '清稿收敛（beforeinput 异步消费）').toBe('')
    await composer.click() // 清空后选区塌陷——重聚焦再 insertText（run6 实证：清空后 insertText 不落）
    await page.keyboard.insertText('多行首行-ih\n多行次行-ih') // 单次 insertText 内嵌换行（Shift+Enter 对该编辑面为破坏性按键——run4/run5 实证）
    const multiline = await draft()
    expect(multiline, '多行草稿就绪（两行文本在场）').toContain('多行首行-ih')
    await page.keyboard.press('ArrowUp')
    expect(await draft(), 'ArrowUp 保持原生（草稿逐字不变——翻阅门不误触）').toBe(multiline)
    await page.keyboard.press('ArrowDown')
    expect(await draft(), 'ArrowDown 保持原生（草稿逐字不变）').toBe(multiline)

    // ── ④ mention 菜单守卫：/ 唤醒菜单开，方向键归菜单（草稿不被历史改写、菜单保持开）──
    await composer.click() // 重聚焦
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await expect.poll(draft, '清稿收敛（mention 段）').toBe('')
    await composer.click() // 清空后选区塌陷——重聚焦再 insertText
    await page.keyboard.insertText('/')
    const menuPopup = page.locator('[role="listbox"]').first()
    await expect(menuPopup, '候选菜单弹层开出（/ 唤醒）').toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('ArrowUp')
    await expect(menuPopup, 'ArrowUp 后菜单保持开（键归菜单——守卫不吞菜单导航）').toBeVisible()
    expect(await draft(), 'ArrowUp 未被历史劫持（草稿仍为触发符）').toBe('/')
    await page.keyboard.press('ArrowDown')
    await expect(menuPopup, 'ArrowDown 后菜单保持开').toBeVisible()
    expect(await draft(), 'ArrowDown 未被历史劫持').toBe('/')
    await page.keyboard.press('Escape')

    // ── ⑤ 会话切换切源：第二夹具工作区芯片流开新会话 → 翻出的只是新会话自己的消息 ──
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    fixtureRoot2 = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-ih-ws2-'))
    const wsDir2 = join(fixtureRoot2, 'ih-demo-2')
    mkdirSync(wsDir2, { recursive: true })
    await registerProject(page, wsDir2, 'ih-demo-2')
    // 开会话径 = 侧栏项目行尾「在 ih-demo-2 新建会话」钮（fix-42 官方 startSession 面——hover 显现）
    // → blank 会话 hero 座位（bug-hero 先例：hero 相位 data-composer-input 在场可键入）
    const ws2Row = page.locator(PROJECT_ROW_ANY).filter({ hasText: 'ih-demo-2' }).first()
    for (let attempt = 0; ; attempt++) {
      try {
        await ws2Row.hover({ timeout: 15_000 })
        await ws2Row.getByRole('button', { name: /新建会话/ }).last().click({ timeout: 10_000 })
        break
      } catch (error) {
        if (attempt >= 2) throw error
        await page.waitForTimeout(3_000)
      }
    }
    await page.waitForTimeout(3_000)
    await page.screenshot({
      path: 'D:\\software\\dsh-forge\\data\\forge-workspaces\\Z-project-dsh-dsh-forge@dadf6b04\\logs\\composer-input-history-plugin\\1.5\\001-shell-e2e\\ws2-after-newsession.png',
      fullPage: true,
    }).catch(() => undefined)
    await ensureNoBlockingDialog(page) // 新会话开户可再挂 API Key 模态（mask 拦指针——sw 同径收起）
    await waitComposerEditable(page)
    await sendUserMessage(page, MSG_D)
    await composer.click()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('ArrowUp')
    await expect
      .poll(draft, '新会话 ArrowUp 翻出新会话自己的消息（切源）')
      .toBe(MSG_D)
    await page.keyboard.press('ArrowUp')
    expect(await draft(), '新会话历史只有一条（不越界翻出前会话消息）').toBe(MSG_D)

    // ── ⑥ 全程零 pageerror + 零激活/接线告警（装载激活干净面）──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
    const noisy = consoleAll.filter((line) =>
      /did not activate|\[dsh-forge\/input-history\].*failed|Invalid effect|invalid plugin/i.test(line),
    )
    expect(noisy, `零激活/接线告警：${noisy.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    if (fixtureRoot !== undefined) rmDirBestEffort(fixtureRoot)
    if (fixtureRoot2 !== undefined) rmDirBestEffort(fixtureRoot2)
  }
})
