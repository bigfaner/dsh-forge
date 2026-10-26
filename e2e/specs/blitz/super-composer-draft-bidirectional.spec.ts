// @proposal:super-composer @web-e2e @blitz
// 主↔替身草稿双向互通 e2e（三方向断言）：主 composer 与全屏替身共享同一份草稿流
// （数据单源 = 官方 InputState——两侧均只做官方 InputState 订阅/回写，无独立草稿副本）。
// 溯源：main agent CDP 真机探针判例（三方向全绿：A/B/C + renderer 零 pageerror；
// 探针过程件不入 git——本 spec 按其驱动逻辑重建正式断言面，规范化命名/断言消息）。
// 方向 A：主键入 → 替身读同步；方向 B：替身键入 → 主读同步（双向内容在同一草稿流
// 按序共存）；方向 C：替身 Enter 发送 → 主转录出现消息 + 两草稿清空。
// 驱动链：launchHost → forgeInvoke projects/register → selectWorkspaceViaChip →
// 会话首条消息（composer 在场）→ 全屏标记注入（DOM 兜底 tracker 同款标记面：
// [data-dockkit-pane] + [data-sidebar-right-panel=fullscreen]；ball 态先点球恢复卡片）
// → 方向 A/B 键盘 insertText 到对应锚（主 = 非 dscf-root 内 [data-composer-input]；
// 替身 = [data-testid=dscf-root] [data-dscf-official-input] [data-composer-input]）
// → 方向 C 替身 Enter（inputTriggers 官方发送径）。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；零真实模型凭据；不夹带 diag 过程件。

import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'

const MSG_A = '主侧键入-A方向锚文本'
const MSG_B = '替身键入-B方向锚文本'

/** 主 composer 输入锚（非替身面：不在 dscf-root 子树内的官方输入）。 */
function mainInputOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:not([data-testid="dscf-root"] [data-composer-input])').last()
}

/** 替身（复制件）输入锚：dscf-root 内官方复制件作用域下的 contenteditable。 */
function surrogateInputOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')
}

/** 两输入面草稿直读（textContent——Lexical contenteditable）。 */
async function readDrafts(page: Page): Promise<{ main: string; surrogate: string }> {
  return page.evaluate(() => ({
    main: document.querySelector('[data-composer-input]:not([data-testid="dscf-root"] [data-composer-input])')?.textContent ?? '',
    surrogate: document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? '',
  }))
}

/** 有界轮询（草稿同步为订阅扇出异步径——非即时）：条件不满足直至上界即抛。 */
async function pollUntil(page: Page, check: () => Promise<boolean>, message: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error(`轮询超时：${message}`)
    await page.waitForTimeout(300)
  }
}

test('@web-e2e @blitz 主↔替身草稿双向互通：A 主键入替身读 / B 替身键入主读共存 / C 替身发送两草稿清空', async () => {
  test.setTimeout(900_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-bidirect-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-bidirect-ws-'))
  const wsDir = join(fixtureRoot, 'sc-ws')
  mkdirSync(wsDir, { recursive: true })
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 会话装配：注册工作区 → chip 流开会话 → 首条消息（composer 在场、草稿清零基线）──
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'sc-bidirect-ws', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    await selectWorkspaceViaChip(page, 'sc-bidirect-ws')
    await ensureNoBlockingDialog(page)
    const BOOT_MSG = '双向互通基线首条消息'
    const composer = mainInputOf(page)
    await composer.click()
    await page.keyboard.insertText(BOOT_MSG)
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first()).toContainText(BOOT_MSG, { timeout: 60_000 })

    // ── 全屏标记注入（DOM 兜底 tracker 标记面）→ 替身挂载；ball 态先点球恢复 ──
    await page.evaluate(() => {
      const pane = document.createElement('div')
      pane.setAttribute('data-dockkit-pane', '')
      const fullscreen = document.createElement('div')
      fullscreen.setAttribute('data-sidebar-right-panel', 'fullscreen')
      fullscreen.appendChild(pane)
      document.body.appendChild(fullscreen)
    })
    await expect(page.locator('[data-testid="dscf-root"]'), '全屏标记注入后替身挂载').toHaveCount(1, { timeout: 15_000 })
    const ball = page.locator('[data-testid="dscf-ball"]')
    if (await ball.isVisible().catch(() => false)) {
      await ball.click()
    }
    await expect(surrogateInputOf(page), '替身复制件输入锚在场').toBeVisible({ timeout: 15_000 })

    // ── 方向 A：主键入 → 替身读同步（同一官方 InputState 单源）──
    // 替身卡浮于主输入上方拦截 pointer——聚焦走 JS focus（CDP 探针同径）
    await page.evaluate(() => {
      const el = document.querySelector('[data-composer-input]:not([data-testid="dscf-root"] [data-composer-input])') as HTMLElement | null
      if (el === null) throw new Error('主输入锚缺席')
      el.focus()
    })
    await page.keyboard.insertText(MSG_A)
    await pollUntil(
      page,
      async () => (await readDrafts(page)).surrogate.includes(MSG_A),
      '方向 A：主键入同步到替身草稿',
    )

    // ── 方向 B：替身键入 → 主读同步；双向内容在同一草稿流按序共存（A 先 B 后）──
    const surrogate = surrogateInputOf(page)
    await surrogate.click()
    await page.keyboard.insertText(MSG_B)
    await pollUntil(page, async () => {
      const { main, surrogate: sur } = await readDrafts(page)
      for (const text of [main, sur]) {
        const idxA = text.indexOf(MSG_A)
        const idxB = text.indexOf(MSG_B)
        if (idxA < 0 || idxB < 0 || idxB < idxA + MSG_A.length) return false
      }
      return true
    }, '方向 B：替身键入同步到主草稿且按序共存')

    // ── 方向 C：替身 Enter 发送 → 主转录出现消息 + 两草稿清空 ──
    await surrogate.press('Enter')
    const transcript = page.locator(CONVERSATION_CONTENT).first()
    await expect(transcript, '方向 C：草稿内容进入主转录').toContainText(MSG_A, { timeout: 60_000 })
    await expect(transcript).toContainText(MSG_B, { timeout: 60_000 })
    await pollUntil(page, async () => {
      const { main, surrogate: sur } = await readDrafts(page)
      return main === '' && sur === ''
    }, '方向 C：发送后两草稿清空')

    // ── 全程干净面 ──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})
