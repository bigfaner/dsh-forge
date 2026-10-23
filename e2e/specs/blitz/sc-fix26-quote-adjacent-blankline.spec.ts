// @proposal:super-composer @web-e2e
// fix-26（7f893763）取证债断言面（super-composer/1.63 fix-29）：真机发送「前置用户文本 +
// 三条相邻引用」消息，断言落会话日志的 sinkSerialized 用户消息原文中——
//   ① 任意相邻内容块之间恰好 `\n\n`（全文无 `\n{3,}`）；
//   ② 消息首尾无空行（trim 后等于原文）；
//   ③ 三条 `<quote id=` 块齐全。
// 断言锚 = 会话日志文本（user/message 事件 content[].text），不断视觉坐标。
// quote 注入编排 = sc-124 探针注入径（文档选区投影 DOM → 划选 → 添加到对话 → chip）。
// 证据归档 {forge.project_logs_dir}/super-composer/1.63/004-*
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { forgeInvoke, selectWorkspaceViaChip } from '../../support/rpc.js'
import { decodeSessionFile, sessionLogById } from '../../support/session-files.js'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/super-composer/1.63/004-fix26-adjacent-blankline'

const MARKER = 'fix26三引用相邻前置文本'
const NEEDLES = ['文档选段甲-引用相邻一', '文档选段乙-引用相邻二', '文档选段丙-引用相邻三'] as const

/** 会话日志事件（本 spec 消费面——user/message content 文本） */
interface UserMsgEvent {
  readonly type: string
  readonly data?: { readonly content?: readonly { readonly type?: string; readonly text?: string }[] }
}

function composerOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:visible').last()
}

async function waitComposerEditable(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
    return els.length > 0 && [...els].every((el) => el.isContentEditable)
  }, undefined, { timeout: 30_000 }).catch(() => undefined)
}

/** 落会话日志的 user/message 事件全量读回（按 id 定位现行日志——多帧 zstd 逐帧解码） */
function userMessages(dshHome: string, sessionId: string): readonly string[] {
  const file = sessionLogById(dshHome, sessionId)
  if (file === undefined) return []
  return decodeSessionFile(file)
    .filter((e): e is UserMsgEvent & { type: 'user/message' } => e.type === 'user/message')
    .flatMap((e) => (e.data?.content ?? []).map((c) => c.text ?? ''))
}

/** 轮询等待含目标标记 ∧ 三 quote 块的用户消息落盘（发送成功唯一证据面） */
async function waitForQuoteMessage(dshHome: string, sessionId: string): Promise<string> {
  const deadline = Date.now() + 120_000
  for (;;) {
    const hit = userMessages(dshHome, sessionId).find(
      (text) => text.includes(MARKER) && (text.match(/<quote id=/g) ?? []).length === 3,
    )
    if (hit !== undefined) return hit
    if (Date.now() > deadline) {
      throw new Error(`三引用用户消息未落盘（session=${sessionId}）：${JSON.stringify(userMessages(dshHome, sessionId).slice(-4))}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

test('@web-e2e fix-26 三引用相邻单空行：sinkSerialized 落日志断言', async () => {
  test.setTimeout(900_000)
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fix26-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fix26-ws-'))
  const wsDir = join(fixtureRoot, 'fix26-ws')
  const dshHome = join(userData, 'dsh-home')
  const F: Record<string, unknown> = {}
  const launched = await launchHost({
    userData, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' },
    timeouts: { firstWindow: 120_000, bootReady: 90_000, loaderLive: 120_000 },
  })
  const { app, page, pageErrors } = launched
  try {
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'fix26-ws', forgeDir: join(wsDir, '.forge'), knowledgeDir: join(wsDir, '.knowledge'),
    })
    await selectWorkspaceViaChip(page, 'fix26-ws')
    await ensureNoBlockingDialog(page)
    await waitComposerEditable(page)

    // ── 前置用户文本（先于三条引用 chip 落入草稿）──
    const composer = composerOf(page)
    await composer.click()
    await page.keyboard.insertText(MARKER)
    await expect
      .poll(async () => composer.evaluate((el) => (el as HTMLElement).textContent ?? ''), { timeout: 15_000 })
      .toContain(MARKER)

    // ── 三条相邻引用：文档选区投影 DOM → 逐段划选 → 添加到对话（sc-124 注入径）──
    await page.evaluate((needles: readonly string[]) => {
      const pane = document.createElement('div')
      pane.setAttribute('data-dockkit-pane', '')
      pane.innerHTML = `<div data-document-preview="probe"><div data-textpreview-path="true">docs/fix26-quote.md</div>${needles
        .map((n) => `<p>${n}</p>`)
        .join('')}</div>`
      document.body.appendChild(pane)
    }, NEEDLES)

    const selectText = (needle: string): Promise<boolean> =>
      page.evaluate((n: string) => {
        const root = document.querySelector('[data-document-preview]') ?? document.body
        const host = [...root.querySelectorAll('*')].find((el) => el.children.length === 0 && (el.textContent ?? '').includes(n))
        if (host === undefined || host.firstChild === null) return false
        const text = host.firstChild.textContent ?? ''
        const idx = text.indexOf(n)
        if (idx < 0) return false
        const range = document.createRange()
        range.setStart(host.firstChild, idx)
        range.setEnd(host.firstChild, idx + n.length)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 300 }))
        return true
      }, needle)

    const chipCount = (): Promise<number> => page.locator('[data-composer-chip="quote"]').count()
    const chipsAtStart = await chipCount()
    for (const needle of NEEDLES) {
      let picked = false
      for (let attempt = 0; attempt < 3 && !picked; attempt++) {
        picked = await selectText(needle)
        await page.waitForTimeout(800)
        if (!(await page.getByRole('menuitem', { name: '添加到对话' }).first().isVisible().catch(() => false))) {
          picked = false
          await page.evaluate(() => window.getSelection()?.removeAllRanges())
        }
      }
      expect(picked, `划选菜单可达（${needle}）`).toBe(true)
      await page.getByRole('menuitem', { name: '添加到对话' }).first().click()
      await page.waitForTimeout(600)
    }
    const chipsAfter = await chipCount()
    const draftFace = await composer.evaluate((el) => ({
      text: (el as HTMLElement).textContent ?? '',
      chipTitles: [...el.querySelectorAll('[data-composer-chip="quote"]')].map((c) => c.getAttribute('title') ?? ''),
    }))
    F.chips = { atStart: chipsAtStart, after: chipsAfter, draftFace }
    console.log('[fix26] draftFace', JSON.stringify(F.chips))
    expect(chipsAfter - chipsAtStart, '三条引用 chip 入草稿').toBe(3)
    expect(draftFace.text.includes(MARKER), '草稿含前置用户文本').toBe(true)

    // ── 发送（chip 相邻无文本间隔）──
    await composer.click()
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '用户消息入转录').toContainText(MARKER, { timeout: 60_000 })
    await waitComposerEditable(page)
    await page.screenshot({ path: join(EVIDENCE_DIR, '01-sent-conversation.png'), fullPage: false }).catch(() => undefined)

    // ── 会话日志定位 + 落盘轮询（user/message sinkSerialized 原文）──
    const sessionsDir = join(dshHome, 'sessions')
    let sessionId: string | undefined
    const idDeadline = Date.now() + 60_000
    for (;;) {
      // Node 侧扫描：夹具段工作区目录下最新 session-<id>（会话目录 = cwd 扁平化含夹具段）
      if (existsSync(sessionsDir)) {
        let newest: { id: string; mtime: number } | undefined
        for (const wsEntry of readdirSync(sessionsDir, { withFileTypes: true })) {
          if (!wsEntry.isDirectory() || !wsEntry.name.includes('fix26-ws')) continue
          for (const sEntry of readdirSync(join(sessionsDir, wsEntry.name), { withFileTypes: true })) {
            if (!sEntry.isDirectory() || !sEntry.name.startsWith('session-')) continue
            const mtime = statSync(join(sessionsDir, wsEntry.name, sEntry.name)).mtimeMs
            if (newest === undefined || mtime > newest.mtime) newest = { id: sEntry.name, mtime }
          }
        }
        sessionId = newest?.id
      }
      if (sessionId !== undefined) break
      if (Date.now() > idDeadline) throw new Error(`夹具会话目录未开户：${sessionsDir}`)
      await page.waitForTimeout(2_000)
    }
    F.sessionId = sessionId
    const landed = await waitForQuoteMessage(dshHome, sessionId as string)
    F.landedText = landed

    // ── fix-26 断言（sinkSerialized 原文）──
    expect((landed.match(/<quote id=/g) ?? []).length, '③ 三条 <quote> 块齐全').toBe(3)
    expect(landed, '① 全文无 \\n{3,}（相邻块间恰一空行）').not.toMatch(/\n{3,}/)
    expect(landed.trim(), '② 首尾零空行（trim 恒等）').toBe(landed)

    writeFileSync(join(EVIDENCE_DIR, 'findings.json'), JSON.stringify(F, null, 2), 'utf8')
    expect(pageErrors, `renderer pageErrors 须空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})
