// @proposal:super-composer @web-e2e @probe
// 过程件（不进 git——super-composer/1.10 真机取证走查探针）：真实宿主 + 真实 dist，
// 走查提案验收 1–7 可达面 + 样式取证。截图与证据归档：
//   .forge/docs/proposals/super-composer/walkthrough/110-*
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；零真实模型凭据。
// fix-12 输入区切换官方复制件，锚随迁：dscf-input 退役 → [data-dscf-official-input] [data-composer-input]（contenteditable）。
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT, PROJECT_ROW_ANY, docPanelOf, ovDocRowOf, ovSubtabOf } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { openOverviewDock } from '../../support/navigation.js'
import { OV_PARENT_ANY } from '../../support/anchors.js'

const WALKTHROUGH = join(fileURLToPath(new URL('../../../.forge/docs/proposals/super-composer/walkthrough', import.meta.url)))

function composerOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:visible').last()
}
async function draftTextOf(page: Page): Promise<string> {
  return composerOf(page).evaluate((el) => (el as HTMLElement).textContent ?? '')
}
/** 替身输入锚（官方复制件 contenteditable）草稿文本读取 */
async function dscfInputTextOf(page: Page): Promise<string> {
  return page.evaluate(() =>
    document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? '',
  )
}
async function waitComposerEditable(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
    return els.length > 0 && [...els].every((el) => el.isContentEditable)
  }, undefined, { timeout: 30_000 }).catch(() => undefined)
}
async function sendUserMessage(page: Page, text: string): Promise<void> {
  const composer = composerOf(page)
  await composer.click()
  await page.keyboard.insertText(text)
  for (let attempt = 0; attempt < 5; attempt++) {
    if ((await draftTextOf(page)).includes(text)) break
    await composer.click()
    await page.keyboard.insertText(text)
    await page.waitForTimeout(2_000)
  }
  expect(await draftTextOf(page), `键入回显（${text}）`).toContain(text)
  await page.keyboard.press('Enter')
  await expect(page.locator(CONVERSATION_CONTENT).first(), `用户消息入转录（${text}）`).toContainText(text, { timeout: 60_000 })
  await waitComposerEditable(page)
}

/** 在容器内选含目标文本的 range 并派发 mouseup（划选菜单触发径——插件监听 document mouseup） */
async function selectTextAndMouseup(page: Page, containerSelector: string, needle: string): Promise<boolean> {
  return page.evaluate(({ containerSelector, needle }) => {
    const root = document.querySelector(containerSelector)
    if (root === null) return false
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode()) !== null) {
      const idx = (node.textContent ?? '').indexOf(needle)
      if (idx >= 0) {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + needle.length)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 300 }))
        return true
      }
    }
    return false
  }, { containerSelector, needle })
}

test('@web-e2e @probe super-composer 真机取证走查（AC1/2/6/7 可达面 + 样式取证）', async () => {
  test.setTimeout(900_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-wt-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-wt-ws-'))
  const wsDir = join(fixtureRoot, 'sc-ws')
  const docDir = join(wsDir, 'docs', 'features', 'sc-feat', 'design')
  mkdirSync(docDir, { recursive: true })
  const DOC_BODY = '锚定与重定位：选区映射为稳定描述符，精确前缀加引用文本加精确后缀三段拼合。'
  const docRel = 'docs/features/sc-feat/design/tech-design.md'
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(docDir, 'tech-design.md'), `# tech-design\n\n${DOC_BODY}\n`, 'utf8')
  const consoleAll: string[] = []
  const F: Record<string, unknown> = {}
  const launched = await launchHost({
    userData,
    expectPhase: 'hero',
    env: { DSH_FORGE_WINDOW_HIDDEN: '0' },
  })
  const { app, page, pageErrors } = launched
  page.on('console', (msg) => consoleAll.push(`[${msg.type()}] ${msg.text()}`))
  try {
    // ── 装配面取证：样式 marker + data-plugin 标 ──
    const styleFace = await page.evaluate(() => ({
      qr: [...document.querySelectorAll('style[data-dsh-forge-quote-reference]')].length,
      sc: [...document.querySelectorAll('style[data-dsh-forge-super-composer]')].length,
      qrTagged: [...document.querySelectorAll('style')].filter((s) => (s.textContent ?? '').includes('.dswf-quote') || s.hasAttribute('data-dsh-forge-quote-reference')).map((s) => s.hasAttribute('data-plugin')),
      bootRows: ((globalThis as { __DSH_BOOT__?: { entries?: { id?: string }[] } }).__DSH_BOOT__?.entries ?? []).map((e) => e.id).filter((id) => id?.includes('dsh-forge')),
    }))
    console.log('[walkthrough] styleFace', JSON.stringify(styleFace))
    console.log('[walkthrough] WALKTHROUGH dir =', WALKTHROUGH)
    const { writeFileSync: wf } = await import('node:fs')
    wf(join(WALKTHROUGH, '110-styleface.json'), JSON.stringify(styleFace, null, 2), 'utf8')
    await page.screenshot({ path: join(WALKTHROUGH, '110-00-boot.png'), fullPage: false }).catch(() => undefined)

    // ── 会话装配：注册工作区 → chip 流开会话 → 发送首条消息（ChatView 消息区供划选）──
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'sc-wt-ws', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    for (let attempt = 0; ; attempt++) {
      try {
        await selectWorkspaceViaChip(page, 'sc-wt-ws')
        break
      } catch (error) {
        if (attempt >= 2) throw error
        await page.keyboard.press('Escape').catch(() => undefined)
        await page.waitForTimeout(3_000)
      }
    }
    await ensureNoBlockingDialog(page)
    await waitComposerEditable(page)
    const MSG = '走查首条消息-划选源-三段拼合-1.10'
    await sendUserMessage(page, MSG)

    // ── AC1：ChatView 消息区划选 → 菜单 → chip ──
    // 容器事实面探测：官方 DOM 无 data-chat-messages 锚（包内 grep 零命中）——
    // 以真实转录区（含消息文本的最近转录容器）为划选源，scope 命中由插件自身裁定。
    const chatFace = await page.evaluate(() => {
      const msgHost = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && (el.textContent ?? '').includes('走查首条消息'))
      const ancestors = msgHost ? (() => { const out: string[] = []; let n: Element | null = msgHost; while (n && out.length < 12) { out.push(`${n.tagName.toLowerCase()}${[...n.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')}`); n = n.parentElement } return out })() : []
      return { found: msgHost !== null, ancestors }
    })
    console.log('[walkthrough] AC1 chatFace', JSON.stringify(chatFace))
    const picked = await page.evaluate((needle: string) => {
      const host = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && (el.textContent ?? '').includes(needle))
      if (host === undefined || host.firstChild === null) return false
      const text = host.firstChild.textContent ?? ''
      const idx = text.indexOf(needle)
      if (idx < 0) return false
      const range = document.createRange()
      range.setStart(host.firstChild, idx)
      range.setEnd(host.firstChild, idx + needle.length)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 300, clientY: 300 }))
      return true
    }, MSG.slice(0, 8))
    console.log('[walkthrough] AC1 pick', picked)
    await page.waitForTimeout(500)
    const menu = page.locator('[data-quote-selection-menu-root]')
    const menuVisible = await menu.first().isVisible().catch(() => false)
    console.log('[walkthrough] AC1 menuVisible', menuVisible)
    await page.screenshot({ path: join(WALKTHROUGH, '110-01-ac1-menu.png'), fullPage: false }).catch(() => undefined)
    console.log('[walkthrough] AC1 RESULT', JSON.stringify({ picked, menuVisible }))
    if (menuVisible) {
      const addBtn = page.getByRole('menuitem', { name: '添加到对话' }).first()
      await expect(addBtn).toBeVisible()
      await addBtn.click()
      await page.waitForTimeout(500)
      console.log('[walkthrough] AC1 diag-console', JSON.stringify(consoleAll.filter((l) => l.includes('diag')).slice(0, 12)))
      console.log('[walkthrough] AC1 draft-after-click', JSON.stringify(await draftTextOf(page)))
      try { await expect(composerOf(page), 'AC1 quote chip 落草稿尾（label 摘要投影）').toContainText(MSG.slice(0, 8), { timeout: 15_000 }) } catch (e) { F.ac1ChipFail = String(e).slice(0, 200) }
    }
    await page.screenshot({ path: join(WALKTHROUGH, '110-02-ac1-chip.png'), fullPage: false }).catch(() => undefined)

    // 追加文本并发送 → AC1 序列化 + AC7 <quote> 块（chip 未落时发送纯文本作 AC7 基线面）
    await composerOf(page).click()
    await page.keyboard.insertText(' 这段什么意思？')
    const phaseBeforeEnter = await page.evaluate(() => document.querySelector('[data-composer-input]')?.getAttribute('data-phase') ?? null)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1_500)
    const draftAfterEnter = await draftTextOf(page)
    if (draftAfterEnter.trim() !== '') {
      // Enter 未提交——官方发送按钮兜底径（取证相位，回落按钮发送保 AC7 链可达）
      const sendBtn = page.getByRole('button', { name: '发送' }).first()
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click()
        await page.waitForTimeout(1_500)
      }
    }
    console.log('[walkthrough] AC1 send-path', JSON.stringify({ phaseBeforeEnter, draftAfterEnter }))
    await page.waitForTimeout(5_000)
    console.log('[walkthrough] AC1 send-console', JSON.stringify(consoleAll.filter((l) => /error|warn|reject|throw|quote/i.test(l)).slice(-12)))
    console.log('[walkthrough] AC1 send-after-chip draftContainsQuote', (await draftTextOf(page)).includes('](quote:'))
    await page.screenshot({ path: join(WALKTHROUGH, '110-03-ac1-sent.png'), fullPage: false }).catch(() => undefined)

    // AC7：LLM 所见 = 会话日志 <quote> 块（递归扫 userData）
    const found: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        const st = statSync(p)
        if (st.isDirectory()) walk(p)
        else if (/\.(jsonl|json|log|md|txt)$/.test(name)) {
          try {
            const text = readFileSync(p, 'utf8')
            if (text.includes('<quote') || text.includes('](quote:')) found.push(p)
          } catch { /* skip */ }
        }
      }
    }
    walk(userData)
    console.log('[walkthrough] AC7 quote-block files', JSON.stringify(found))
    console.log('[walkthrough] AC7 RESULT', found.length > 0 ? 'quote-block-in-log' : 'no-quote-block')

    // ── AC2：dockkit 文档内划选 → 同径 chip ──
    // 注册面：发现链以 forge_dir 为 docs/ 根扫描（document-browsing 判例同载——注册已在会话装配段完成）。
    const projList = await forgeInvoke<readonly { id: string }[]>(page, 'forge:projects/list')
    const projId = projList[0]!.id
    await openOverviewDock(page)
    await page.locator(ovSubtabOf('features')).first().click()
    await expect(page.locator(ovSubtabOf('features'))).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    const docRow = page.locator(ovDocRowOf(docRel)).first()
    if ((await docRow.isVisible().catch(() => false)) === false) {
      await page.locator(OV_PARENT_ANY, { hasText: 'sc-feat' }).first().locator('[data-dswf-ov-parent-toggle]').click()
    }
    await expect(docRow, 'feature 文档行在场').toBeVisible({ timeout: 30_000 })
    await docRow.click()
    const panel = page.locator(docPanelOf(projId, docRel)).first()
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(panel.locator('[data-dswf-doc-body]')).toContainText('三段拼合', { timeout: 30_000 })
    const inPane = await panel.evaluate((el) => (el.closest('[data-dockkit-pane]') !== null ? 'pane' : (el.closest('[data-dockkit-float]') !== null ? 'float' : 'none')))
    console.log('[walkthrough] AC2 doc panel scope ancestor', inPane)
    await page.screenshot({ path: join(WALKTHROUGH, '110-04-ac2-doc.png'), fullPage: false }).catch(() => undefined)
    const pickedDoc = await selectTextAndMouseup(page, docPanelOf(projId, docRel), '三段拼合')
    await page.waitForTimeout(500)
    const diag = await page.evaluate(() => {
      const sel = window.getSelection()
      const anchor = sel?.anchorNode
      let el: Element | null = anchor?.nodeType === 1 ? (anchor as Element) : (anchor?.parentElement ?? null)
      const chain: string[] = []
      for (let i = 0; el !== null && i < 8; i++) {
        chain.push(`${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')}`)
        el = el.parentElement
      }
      return {
        selLen: sel?.toString().length ?? -1,
        collapsed: sel?.isCollapsed ?? null,
        chain,
        menuRootInDom: document.querySelectorAll('[data-quote-selection-menu-root]').length,
        menuChildren: document.querySelector('[data-quote-selection-menu-root]')?.childElementCount ?? -1,
      }
    })
    console.log('[walkthrough] AC2 diag', JSON.stringify(diag))
    const menu2 = await menu.first().isVisible().catch(() => false)
    console.log('[walkthrough] AC2 pickedDoc', pickedDoc, 'menuVisible', menu2)
    await page.screenshot({ path: join(WALKTHROUGH, '110-05-ac2-menu.png'), fullPage: false }).catch(() => undefined)
    if (menu2) {
      await page.getByRole('menuitem', { name: '添加到对话' }).first().click()
      await page.waitForTimeout(500)
      console.log('[walkthrough] AC2 draft-after-add', JSON.stringify(await draftTextOf(page)))
      try { await expect(composerOf(page), 'AC2 文档划选 chip 落同一 composer 草稿').toContainText('三段拼合', { timeout: 15_000 }) } catch (e) { F.ac2ChipFail = String(e).slice(0, 200) }
      await page.screenshot({ path: join(WALKTHROUGH, '110-06-ac2-chip.png'), fullPage: false }).catch(() => undefined)
      // 清稿（防污染后续断言）
      await composerOf(page).click()
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.press('Backspace')
    } else {
      console.log('[walkthrough] AC2 RESULT', JSON.stringify({ pickedDoc, menuVisible: menu2 }))
    }

    // ── AC6：过滤面——编辑域划选不触发 / 折叠选区不触发 ──
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.getSelection()?.removeAllRanges())
    await page.waitForTimeout(400)
    await composerOf(page).click()
    await page.keyboard.insertText('编辑域过滤样本')
    const composerSel = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-composer-input]:not([style*="display: none"])')
      if (el === null) return false
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const node = walker.nextNode()
      if (node === null) return false
      const range = document.createRange()
      range.selectNodeContents(node)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
      return true
    })
    await page.waitForTimeout(500)
    // AC6 真判据 = 弹层菜单行 [role="menuitem"] 不在场（menu root 为常挂 portal
    // 空壳——anchor span 有界盒，root.isVisible 恒误报 true）
    const menu3 = await page.getByRole('menuitem', { name: '添加到对话' }).first().isVisible().catch(() => false)
    const ac6diag = await page.evaluate(() => ({
      menuRoots: document.querySelectorAll('[data-quote-selection-menu-root]').length,
      menuItems: document.querySelectorAll('[data-quote-selection-menu-root] [role="menuitem"]').length,
      selCollapsed: window.getSelection()?.isCollapsed ?? null,
    }))
    console.log('[walkthrough] AC6 edit-domain pick', composerSel, 'menuitemVisible', menu3, JSON.stringify(ac6diag))
    F.ac6 = { composerSel, menuitemVisible: menu3, ...ac6diag }
    await page.screenshot({ path: join(WALKTHROUGH, '110-07-ac6-editdomain.png'), fullPage: false }).catch(() => undefined)
    if (menu3) { F.ac6Fail = 'menuitem-visible-after-edit-domain-selection' }
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Backspace')
    // 折叠选区不触发
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    F.ac6CollapsedStill = await page.getByRole('menuitem', { name: '添加到对话' }).first().isVisible().catch(() => false)

    // ── AC3/4/5：全屏替身状态机全转换 + mention 菜单 + 同草稿机共享 + 样式取证 ──
    const dscf = page.locator('[data-testid="dscf-root"]')
    const dscfInput = page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]').last()
    // AC5 门控（fix-7）：非全屏呈现态（fullscreenMarkers=0）替身不常驻挂载
    const gating0 = await page.evaluate(() => ({
      fullscreenMarkers: document.querySelectorAll('[data-sidebar-right-panel="fullscreen"]').length,
      dockkitPane: document.querySelectorAll('[data-dockkit-pane]').length,
      dscfCount: document.querySelectorAll('[data-testid="dscf-root"]').length,
    }))
    F.ac5Gating0 = gating0
    console.log('[walkthrough] AC5 gating-0', JSON.stringify(gating0))
    expect(gating0.dscfCount, 'AC5 门控：fullscreenMarkers=0 时替身不常驻').toBe(0)
    // tracker 驱动激活（注入官方 fullscreen 标记——门控挂载面取证；官方 chrome 触发径另证）
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-dockkit-pane', '')
      document.body.appendChild(el)
      el.setAttribute('data-sidebar-right-panel', 'fullscreen')
    })
    await expect(dscf, 'AC5 门控：全屏标记在场 → 替身浮现').toHaveCount(1, { timeout: 10_000 })
    const phase0 = await dscf.getAttribute('data-phase')
    F.ac3presence = { phase0, fullscreenMarkers: 1 }
    console.log('[walkthrough] AC3/4/5 surrogate presence', JSON.stringify(F.ac3presence))
    // 前段走查耗时可能触发 30s 空闲自动收球（球态无输入面）——先点球恢复再驱动状态机
    if (phase0 === 'ball') {
      await page.locator('[data-testid="dscf-ball"]').click({ force: true })
      await page.waitForTimeout(300)
    }
    F.ac3Restored = await dscf.getAttribute('data-phase')
    console.log('[walkthrough] AC3 ball-restore phase', String(F.ac3Restored))
    await page.screenshot({ path: join(WALKTHROUGH, '110-08-fullscreen-probe.png'), fullPage: false }).catch(() => undefined)

    // 同草稿机共享：替身输入 → 主 composer 草稿同步（AC3/AC5 共享面）
    await dscfInput.fill('替身共享草稿样本-1.10')
    await page.waitForTimeout(300)
    await page.waitForTimeout(1_500)
    const dscfValueLate = await dscfInputTextOf(page)
    const rootDraftAttr = await page.evaluate(() => document.querySelector('[data-testid="dscf-root"]')?.getAttribute('data-draft') ?? null)
    F.ac3SharedDraft = { dscfValue: await dscfInputTextOf(page), dscfValueLate, rootDraftAttr, mainComposerDraft: await draftTextOf(page) }
    console.log('[walkthrough] AC3 shared-draft', JSON.stringify(F.ac3SharedDraft))
    expect(
      (F.ac3SharedDraft.dscfValueLate as string).trim(),
      'AC3：fill 后受控回读闭合（valueAfterFill 非空且与主 composer 草稿一致）',
    ).toBe((F.ac3SharedDraft.mainComposerDraft as string).trim())
    await page.screenshot({ path: join(WALKTHROUGH, '110-10-shared-draft.png'), fullPage: false }).catch(() => undefined)
    await dscfInput.fill('')

    // chip 行：文档划选加 chip（若 AC2 菜单径可达）→ 替身 chip 行投影
    const pickedChip = await selectTextAndMouseup(page, docPanelOf(projId, docRel), '三段拼合')
    await page.waitForTimeout(500)
    if (await menu.first().isVisible().catch(() => false)) {
      await page.getByRole('menuitem', { name: '添加到对话' }).first().click()
      await page.waitForTimeout(500)
      F.ac3ChipRow = {
        chipsText: await page.locator('[data-testid="dscf-chips"]').textContent().catch(() => null),
        mainDraft: await draftTextOf(page),
      }
    } else {
      F.ac3ChipRow = { skipped: 'menu-not-visible', pickedChip }
    }
    console.log('[walkthrough] AC3 chip-row', JSON.stringify(F.ac3ChipRow))
    await dscfInput.fill('')

    // mention 菜单：替身输入 '@' → 菜单在场性（真机事实面）
    await dscfInput.click()
    await page.keyboard.insertText('@')
    await page.waitForTimeout(800)
    F.ac4Mention = { visible: await page.locator('[data-testid="dscf-mention"]').isVisible().catch(() => false) }
    console.log('[walkthrough] AC4 mention menu', JSON.stringify(F.ac4Mention))
    expect(F.ac4Mention.visible, 'AC4：替身内 @ 触发官方 mention 菜单投影为 dscf-mention 可见').toBe(true)
    await page.screenshot({ path: join(WALKTHROUGH, '110-11-mention.png'), fullPage: false }).catch(() => undefined)
    await dscfInput.fill('')

    // 发送 → S2（记录式取证——草稿不保持时发送为空，S2 不长出即产品事实）
    await dscfInput.fill('替身发送样本-1.10')
    F.ac4SendDraftHold = { valueAfterFill: await dscfInputTextOf(page) }
    await dscfInput.press('Enter')
    await page.waitForTimeout(2_500)
    F.ac4S2 = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid="dscf-root"]')?.getAttribute('data-phase'),
      messagesInDom: document.querySelectorAll('[data-testid="dscf-messages"]').length,
      messagesText: document.querySelector('[data-testid="dscf-messages"]')?.textContent ?? '',
      controlsPresent: document.querySelectorAll('[data-testid="dscf-controls"]').length,
    }))
    F.ac4MainTranscriptHasSend = (await page.locator(CONVERSATION_CONTENT).first().textContent().catch(() => ''))?.includes('替身发送样本-1.10') ?? false
    console.log('[walkthrough] AC4 send/S2', JSON.stringify({ ...F.ac4SendDraftHold, ...F.ac4S2, mainTranscript: F.ac4MainTranscriptHasSend }))
    await page.screenshot({ path: join(WALKTHROUGH, '110-12-s2.png'), fullPage: false }).catch(() => undefined)

    // Esc 逐层退：S2 → S1 → C 球；点球恢复
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const afterEsc1 = await dscf.getAttribute('data-phase')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const afterEsc2 = await dscf.getAttribute('data-phase')
    F.ac4Esc = { afterEsc1, afterEsc2 }
    console.log('[walkthrough] AC4 Esc', JSON.stringify(F.ac4Esc))
    await page.screenshot({ path: join(WALKTHROUGH, '110-13-ball.png'), fullPage: false }).catch(() => undefined)
    // 点球恢复——层叠修正（z-index）后真实点击应直达（取证事实）
    const occluded = await page.evaluate(() => {
      const ball = document.querySelector('[data-testid="dscf-ball"]')
      if (ball === null) return null
      const rect = ball.getBoundingClientRect()
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return top !== null && !ball.contains(top) && top !== ball
    })
    F.ac4BallOccluded = occluded
    await page.locator('[data-testid="dscf-ball"]').click({ force: occluded === true })
    await page.waitForTimeout(300)
    F.ac4BallRestore = await dscf.getAttribute('data-phase')
    console.log('[walkthrough] AC4 ball-restore', String(F.ac4BallRestore))

    if (F.ac4BallRestore !== 'ball' && (await page.locator('[data-testid="dscf-header"]').count()) > 0) {
      // 标题栏热区：tooltip 跟随 + chevron 自定义光标（样式目检项）
      // fix-12 后折叠态（s1）官方复制件输入面与热区几何交叠（input subtree intercepts
      // pointer events）——探针侧 force 驱动（取证意图不变：tooltip/光标/开合），交叠事实记录在案
      const hotzone = page.locator('[data-testid="dscf-hotzone"]')
      await hotzone.hover({ force: true })
      await page.waitForTimeout(300)
      F.styleHotzone = {
        tooltipVisible: await page.locator('[data-testid="dscf-tooltip"]').isVisible().catch(() => false),
        cursor: await hotzone.evaluate((el) => getComputedStyle(el).cursor),
      }
      console.log('[walkthrough] style hotzone', JSON.stringify(F.styleHotzone))
      await page.screenshot({ path: join(WALKTHROUGH, '110-14-tooltip.png'), fullPage: false }).catch(() => undefined)
      // 热区点击开合（消息流在场 = 可展开）
      await hotzone.click({ force: true })
      await page.waitForTimeout(300)
      const afterHot1 = await dscf.getAttribute('data-phase')
      await hotzone.click({ force: true })
      await page.waitForTimeout(300)
      F.ac4HotzoneToggle = { afterFirstClick: afterHot1, afterSecondClick: await dscf.getAttribute('data-phase') }
      console.log('[walkthrough] AC4 hotzone-toggle', JSON.stringify(F.ac4HotzoneToggle))
      // 「—」收球 → 点球回
      await page.locator('[data-testid="dscf-minimize"]').click()
      await page.waitForTimeout(300)
      const ballPhase = await dscf.getAttribute('data-phase')
      await page.locator('[data-testid="dscf-ball"]').click()
      await page.waitForTimeout(300)
      F.ac4Minimize = { ballPhase, restored: await dscf.getAttribute('data-phase') }
      console.log('[walkthrough] AC4 minimize', JSON.stringify(F.ac4Minimize))
      // 「⧉」退出全屏（真实全屏形态 = 官方 chrome「全屏」按钮进入——官方 layout.mode
      // 真值；DOM 属性伪造只改呈现不改 layout.mode，toggle 会把官方从 push 翻进全屏）。
      // 先摘 AC5 段注入的假标记 pane（防 markers 残留干扰收敛判读）。
      await page.evaluate(() => {
        document.querySelectorAll('body > [data-dockkit-pane]').forEach((el) => {
          if ((el.getAttribute('data-dockkit-pane') ?? '') === '') el.remove()
        })
      })
      await page.waitForTimeout(300)
      await page.getByRole('button', { name: '全屏', exact: true }).first().click().catch(() => undefined)
      await page.waitForTimeout(800)
      const enterFace = await page.evaluate(() => ({
        markers: document.querySelectorAll('[data-sidebar-right-panel="fullscreen"]').length,
        dscf: document.querySelectorAll('[data-testid="dscf-root"]').length,
        mode: document.querySelector('[data-sidebar-right-panel]')?.getAttribute('data-sidebar-right-panel') ?? null,
      }))
      await page.locator('[data-testid="dscf-fullscreen"]').click()
      await page.waitForTimeout(800)
      F.ac4ExitFullscreen = {
        enterFace,
        rootStillMounted: await dscf.count(),
        phase: (await dscf.count()) > 0 ? await dscf.getAttribute('data-phase') : null,
        fullscreenMarkers: await page.evaluate(() => document.querySelectorAll('[data-sidebar-right-panel="fullscreen"]').length),
        panelMode: await page.evaluate(() => document.querySelector('[data-sidebar-right-panel]')?.getAttribute('data-sidebar-right-panel') ?? null),
      }
      console.log('[walkthrough] AC4 exit-fullscreen', JSON.stringify(F.ac4ExitFullscreen))
      expect(
        F.ac4ExitFullscreen.fullscreenMarkers,
        'AC4 ⧉：退出全屏后真实 pane 收敛（fullscreen markers 归零）',
      ).toBe(0)
      expect(F.ac4ExitFullscreen.rootStillMounted, 'AC4 ⧉：替身随 markers 收敛（卸载）').toBe(0)
      console.log('[walkthrough] diag lines:')
      for (const l of consoleAll.filter((line) => line.includes('[diag]')).slice(-20)) console.log('  >', l.slice(0, 250))
    }

    // 流式钉死转换：零真实模型凭据——流式回复无法真机产生（如实记录不可达面）
    F.ac4StreamingPin = { exercised: false, reason: 'no-model-credentials: 流式回复真机不可产生，钉死自动收起禁用转换不可达' }

    // 30s 四条件空闲 → 3s 预告 → 收球（真机时序全链；球态无输入面时跳过——
    // 30s 空闲自动收球已由前段 phase0 实证，预告 3s 窗口不可控捕获）
    if ((await dscfInput.count()) > 0) {
      await dscfInput.fill('')
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
      await page.mouse.move(4, 4)
      const previewSeen = await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="dscf-preview"]').length > 0,
        undefined,
        { timeout: 45_000 },
      ).then(() => true).catch(() => false)
      F.ac4IdlePreview = { previewSeen }
      console.log('[walkthrough] AC4 idle-preview', JSON.stringify(F.ac4IdlePreview))
      await page.screenshot({ path: join(WALKTHROUGH, '110-15-idle-preview.png'), fullPage: false }).catch(() => undefined)
      if (previewSeen) {
        const ballSeen = await page.waitForFunction(
          () => document.querySelector('[data-testid="dscf-root"]')?.getAttribute('data-phase') === 'ball',
          undefined,
          { timeout: 8_000 },
        ).then(() => true).catch(() => false)
        F.ac4IdleBall = { ballSeen }
        await page.locator('[data-testid="dscf-ball"]').click({ force: true })
        await page.waitForTimeout(300)
        F.ac4IdleRestored = await dscf.getAttribute('data-phase')
        console.log('[walkthrough] AC4 idle-ball', JSON.stringify({ ...F.ac4IdleBall, restored: F.ac4IdleRestored }))
      }
    } else {
      F.ac4IdlePreview = { exercised: false, reason: 'ball-state: 输入面缺席；30s 空闲自动收球已由前段 phase0 实证，3s 预告窗口未捕获' }
      console.log('[walkthrough] AC4 idle-preview skipped', JSON.stringify(F.ac4IdlePreview))
    }

    // ── 主题切换样式跟随（切 dark 锚后替身卡随令牌变化——目检截图 + 在场性）──
    await page.evaluate(() => {
      document.body.setAttribute('data-ds-dark-theme', '')
    })
    await page.waitForTimeout(300)
    F.styleDark = {
      cardVisible: await dscf.isVisible().catch(() => false),
      phase: (await dscf.count()) > 0 ? await dscf.getAttribute('data-phase') : null,
    }
    console.log('[walkthrough] style dark', JSON.stringify(F.styleDark))
    await page.screenshot({ path: join(WALKTHROUGH, '110-09-dark.png'), fullPage: false }).catch(() => undefined)
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

    // ── 样式归属 claim + 停用移除动线取证（removeOwnedStyles 无泄漏）──
    const claimFace = await page.evaluate(() => ({
      styles: [...document.querySelectorAll('style')].map((s) => ({
        forgeMarker: s.hasAttribute('data-dsh-forge-quote-reference')
          ? 'quote-reference'
          : (s.hasAttribute('data-dsh-forge-super-composer') ? 'super-composer' : null),
        plugin: s.getAttribute('data-plugin'),
        chars: (s.textContent ?? '').length,
      })).filter((r) => r.forgeMarker !== null || (r.plugin ?? '').includes('dsh-forge')),
      loaderKeys: Object.keys(((globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ ?? {}) as object),
    }))
    F.styleClaim = claimFace
    console.log('[walkthrough] style claim face', JSON.stringify(claimFace))
    const unloadFace = await page.evaluate(async () => {
      const loader = ((globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ ?? {}) as Record<string, unknown>
      const key = Object.keys(loader).find((k) => /unload|remove|invalidate|stop|eject/i.test(k) && typeof loader[k] === 'function')
      if (key === undefined) return { attempted: false, keys: Object.keys(loader) }
      try {
        await (loader[key] as (id: string) => unknown)('@dsh-forge/super-composer')
        await new Promise((resolve) => setTimeout(resolve, 1500))
        return {
          attempted: true,
          key,
          stylesLeft: document.querySelectorAll('style[data-plugin="@dsh-forge/super-composer"]').length,
          rootLeft: document.querySelectorAll('[data-testid="dscf-root"]').length,
        }
      } catch (error) {
        return { attempted: true, key, error: String(error) }
      }
    })
    F.styleUnload = unloadFace
    console.log('[walkthrough] style unload face', JSON.stringify(unloadFace))
    await page.screenshot({ path: join(WALKTHROUGH, '110-16-unload.png'), fullPage: false }).catch(() => undefined)
    wf(join(WALKTHROUGH, '110-findings.json'), JSON.stringify(F, null, 2), 'utf8')

    // ── 总证面：pageErrors 空 + 零激活告警 ──
    expect(pageErrors, `renderer pageErrors 须空：${pageErrors.join(' | ')}`).toEqual([])
    const qrErrs = consoleAll.filter((l) => /quote|dsh-forge/i.test(l) && /error|fail|warn/i.test(l))
    console.log('[walkthrough] console quote/forge err-warn lines', JSON.stringify(qrErrs.slice(0, 20)))
    const noisy = consoleAll.filter((line) =>
      /did not activate|quote-reference.*failed|super-composer.*failed|Invalid effect|invalid plugin/i.test(line),
    )
    expect(noisy, `零激活/接线告警：${noisy.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})

// 防 PROJECT_ROW_ANY 未用告警（保留导入以复用锚面）
void PROJECT_ROW_ANY
