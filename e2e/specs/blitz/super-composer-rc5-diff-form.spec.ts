// @proposal:super-composer-migration @web-e2e @blitz
// rc.5 re-copy 差异面 e2e（super-composer-migration/1.7 脚本落盘）：
//   测试 1 = J1 替身形态对照（SC-C1/SC-C2/SC-C4）：chip 原子渲染（bug 51849f72
//     消解观察点）、发送钮图标形态（bug 493c4fef 消解观察点 / 漂移清单 D2）、
//     chip 边界编辑存活、长引用收窄、连续发送间 re-copy 形态不劣化（J1-B3）。
//   测试 2 = J2 sending 相替身 mention 冻结（SC-C5/SC-C6）：`phase='sending'`
//     期 `trackGuardOf('sending')→'frozen'`（ui/data-face.ts）——mention '@' 不放行、
//     普通文本不入草稿；非 sending 期 mention 行为零漂移、冻结不残留。
// 旅程与契约正本 = .forge/docs/proposals/super-composer-migration/testing/journey.md；
// 漂移判据 = 同目录 inputbar-semantic-drift.md（D1/D2/D16）。
//
// 契约锚实锚核销（1.7 源码逐点验证，plugins/super-composer/ui/）：
//   [data-testid="dscf-root"]                       mini-composer.tsx:426
//   [data-dscf-official-input]                      official-input/surrogate-composer.tsx:569
//   [data-composer-input] + data-phase              official-input/input/editor/DraftEditor.tsx:43
//   [data-composer-chip="quote"]                    official-input/input/editor/chip-node.tsx:123
//                                                   （source='quote' surrogate-composer.tsx:56）
//   [data-testid="dscf-mention"]                    mini-composer.tsx:576（journey §5「待校准」
//                                                   锚已核实为实锚——存量 walkthrough 同款在用）
//   button[aria-busy] / [data-sending] / spinner svg official-input/skeleton/InputBar.tsx:567-581
// SC-C3（ContextMeter 锚定位）不上本 spec：替身 useProjection 恒 undefined
// （surrogate-composer.tsx:517 桩）→ ContextMeter 恒不渲染（官方降级路径，漂移 D5 同源）
// ——契约前提「触发元素可见」与实现不一致，fix/disc 上报（归因契约），禁止脚本内调和。
//
// 驱动链：launchHost → forgeInvoke projects/register → selectWorkspaceViaChip →
// 首条消息（转录 = 划选源）→ 全屏标记注入（draft-bidirectional 同款 DOM 兜底 tracker
// 标记面）→ 划选 → 菜单「添加到对话」→ chip 落替身。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；零真实模型凭据。

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { OFFICIAL_STACK_GATE_NOTE, officialStackConverged } from '../../support/official-stack-gate.js'

// 族① gate-environment（plugin-spec/fix-7，bug eb786e62）：官方 0.2.2 世代 web 栈收敛前
// 挂环境前提门控（skip 留痕非红；整代 co-upgrade 落地后自动复跑）。
test.beforeEach(() => {
  test.skip(!officialStackConverged(), OFFICIAL_STACK_GATE_NOTE)
})
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'
import { injectDockkitDocFixture, DOCKKIT_DOC_FIXTURE } from '../../support/dockkit-fixture.js'

/** SC-C1 短锚句（chip 呈现/并存判据——同入一条消息文本）。 */
const NEEDLE_A = '引用原子渲染判据甲乙丙丁'
const NEEDLE_B = '双 chip 并存判据子丑寅卯'
/** J1-B2 长锚句（原子性/收窄判据——原文明文不得整句出现在 chip/草稿）。 */
const NEEDLE_LONG = '超长引用收窄判据——选区映射为稳定描述符且精确前缀加引用文本加精确后缀三段拼合'
const BOOT_MSG = `rc.5 形态对照锚首条消息。${NEEDLE_A}。${NEEDLE_B}。${NEEDLE_LONG}。`
const SEND_TAIL = '形态对照发送样本'
const J2_DRAFT = '冻结窗口样本'

// SC-C1 契约投影复算（journey §4/SC-C1 终态，bug 1ea97ffc 钉稳）：与 quote-reference
// selection-menu.tsx summaryOf 同义（空白折叠 + ≤24 字全保真 / 超长截取前 24 字加 …）。
const SUMMARY_MAX = 24
function expectLabelOf(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > SUMMARY_MAX ? `${compact.slice(0, SUMMARY_MAX)}…` : compact
}

interface Rc5Sample {
  readonly phase: string
  readonly busy: string
  readonly dataSending: boolean
  readonly btnSvg: boolean
  readonly btnSvgBox: { readonly w: number; readonly h: number }
  readonly menuCount: number
  readonly draft: string
}
interface Rc5Recorder {
  readonly samples: Rc5Sample[]
  sendingSeen: boolean
  stop(): void
}
interface SurrogateFace {
  readonly phase: string
  readonly editable: boolean
}

function mainInputOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:not([data-testid="dscf-root"] [data-composer-input])').last()
}
function surrogateInputOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')
}
function surrogateChipsOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-chip="quote"]')
}
function surrogateFaceOf(page: Page): Promise<SurrogateFace> {
  return page.evaluate(() => {
    const input = document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]') as HTMLElement | null
    return { phase: input?.getAttribute('data-phase') ?? '', editable: input?.isContentEditable ?? false }
  })
}

/** 替身草稿直读（textContent——Lexical contenteditable）。 */
function surrogateDraftText(page: Page): Promise<string> {
  return page.evaluate(() =>
    document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? '',
  )
}

/** 有界轮询（订阅扇出异步径——非即时）：条件不满足直至上界即抛。 */
async function pollUntil(page: Page, check: () => Promise<boolean>, message: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await check()) return
    if (Date.now() > deadline) throw new Error(`轮询超时：${message}`)
    await page.waitForTimeout(300)
  }
}

/** 在容器内选含目标文本的 range 并派发 document mouseup（划选菜单触发径——插件监听 document mouseup）。 */
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

/** 划选 → 浮出菜单 → 「添加到对话」（以菜单行 role=menuitem 为准——menu root 常挂 portal 空壳 isVisible 恒误报）。 */
async function selectAndAddToChat(page: Page, needle: string): Promise<void> {
  expect(await selectTextAndMouseup(page, DOCKKIT_DOC_FIXTURE, needle), `划选命中（${needle.slice(0, 6)}…）`).toBe(true)
  const addBtn = page.getByRole('menuitem', { name: '添加到对话' }).first()
  await expect(addBtn).toBeVisible({ timeout: 10_000 })
  await addBtn.click()
  await page.waitForTimeout(600)
}

/**
 * 转录可见窗回顶重挂断言（e2e 宿主零凭据模型失败刷屏——失败行持续追加把早期消息
 * 挤出虚拟窗可视域，直接 toContainText 会因行离场假阴）：每轮把转录滚动祖先回顶后
 * 判 textContent 包含，有界轮询。
 */
async function transcriptContains(page: Page, text: string, message: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (let i = 0; ; i++) {
    // 先直查（新发送行在虚拟窗窗底——回顶反把它挤出窗）；未中再回顶重挂早期行
    const hit = await page.evaluate((needle) =>
      (document.querySelector('[data-conversation-content]')?.textContent ?? '').includes(needle), text)
    if (hit) return
    if (i > 0) {
      await page.evaluate(() => {
        const conv = document.querySelector('[data-conversation-content]')
        let top: HTMLElement | null = conv as HTMLElement | null
        while (top !== null && top.scrollHeight <= top.clientHeight + 1) top = top.parentElement
        if (top !== null) top.scrollTop = 0
      })
    }
    if (Date.now() > deadline) {
      const dump = await page.evaluate(() => ({
        draft: document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? '',
        phase: document.querySelector('[data-testid="dscf-root"]')?.getAttribute('data-phase') ?? '',
        mainDraft: document.querySelector('[data-composer-input]:not([data-testid="dscf-root"] [data-composer-input])')?.textContent ?? '',
        convLen: (document.querySelector('[data-conversation-content]')?.textContent ?? '').length,
      }))
      console.log('[diag] transcript-miss', message, JSON.stringify(dump))
      await expect(page.locator(CONVERSATION_CONTENT).first(), message).toContainText(text, { timeout: 1_000 })
    }
    await page.waitForTimeout(500)
  }
}

/** 会话日志递归扫描（wire 形状断言——〔引用：〕序列化只落 LLM 会话日志，DOM 行渲染 chip label）。 */
function sessionLogContains(dir: string, needle: string): boolean {
  let found = false
  const walk = (d: string): void => {
    if (found) return
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/\.(jsonl|json|log|md|txt)$/.test(name)) {
        try {
          if (readFileSync(p, 'utf8').includes(needle)) found = true
        } catch { /* skip */ }
      }
      if (found) return
    }
  }
  walk(dir)
  return found
}

/**
 * sending/形态采样记录器（SC-C4 I2「发送钮全程图标形态」+ SC-C5 冻结窗口捕获）：
 * dscf-root 子树 MutationObserver 即时捕获 data-phase 切换（sendingSeen 硬门）+
 * 10ms 间隔采样（phase / aria-busy / data-sending / 发送钮 svg 子元素 / mention 菜单
 * 行数 / 草稿快照）。必须在点发送前安装（监听先于被监听动作——弱断言禁令）。
 */
async function installRc5Recorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __rc5?: Rc5Recorder }
    if (w.__rc5 !== undefined) w.__rc5.stop()
    const root = () => document.querySelector('[data-testid="dscf-root"]')
    const input = () => root()?.querySelector('[data-composer-input]')
    const sendBtn = () => root()?.querySelector('button[aria-busy]')
    const obs: MutationObserver = new MutationObserver(() => {
      if ((input()?.getAttribute('data-phase') ?? '') === 'sending') rec.sendingSeen = true
    })
    const rec: Rc5Recorder = {
      samples: [],
      sendingSeen: false,
      stop() {
        window.clearInterval(timer)
        obs.disconnect()
      },
    }
    const sample = (): Rc5Sample => ({
      phase: input()?.getAttribute('data-phase') ?? '',
      busy: sendBtn()?.getAttribute('aria-busy') ?? '',
      dataSending: sendBtn()?.hasAttribute('data-sending') ?? false,
      btnSvg: (sendBtn()?.querySelector('svg') ?? null) !== null,
      btnSvgBox: (() => {
        const svg = sendBtn()?.querySelector('svg')
        const r = svg?.getBoundingClientRect()
        return { w: r?.width ?? -1, h: r?.height ?? -1 }
      })(),
      menuCount: document.querySelectorAll('[data-testid="dscf-mention"]').length,
      draft: input()?.textContent ?? '',
    })
    const r = root()
    if (r !== null) obs.observe(r, { attributes: true, subtree: true, childList: true })
    const timer = setInterval(() => {
      const s = sample()
      rec.samples.push(s)
      if (s.phase === 'sending') rec.sendingSeen = true
    }, 10)
    w.__rc5 = rec
  })
}

async function rc5RecorderOf(page: Page): Promise<Rc5Recorder> {
  const rec = await page.evaluate(() => (window as unknown as { __rc5?: Rc5Recorder }).__rc5)
  expect(rec, '采样记录器在场（先装后驱）').toBeDefined()
  return rec!
}

/** 记录器停止（stop 为页面侧闭包——evaluate 往返丢函数，须经 evaluate 调用）。 */
async function rc5RecorderStop(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __rc5?: Rc5Recorder }).__rc5?.stop())
}

/** 替身输入锚守卫（Esc 收球径——球态输入面卸载，点球恢复卡片态后复归可编辑）。 */
async function ensureSurrogateInput(page: Page): Promise<ReturnType<Page['locator']>> {
  const surrogate = surrogateInputOf(page)
  const deadline = Date.now() + 15_000
  for (;;) {
    if ((await surrogate.isVisible().catch(() => false)) === true) return surrogate
    const ball = page.locator('[data-testid="dscf-ball"]')
    if ((await ball.isVisible().catch(() => false)) === true) {
      await ball.click().catch(() => undefined)
      await page.waitForTimeout(300)
    }
    if (Date.now() > deadline) {
      await expect(surrogate, '替身复制件输入锚在场（球态恢复守卫）').toBeVisible({ timeout: 1_000 })
    }
    await page.waitForTimeout(300)
  }
}

/** 会话装配 + 全屏替身挂载（两测试共用前置；返回夹具目录供 finally 清理）。 */
async function setupSurrogate(page: Page, tag: string): Promise<{ userData: string; fixtureRoot: string }> {  const userData = mkdtempSync(join(tmpdir(), `dsh-forge-e2e-sc-rc5-${tag}-ud-`))
  const fixtureRoot = mkdtempSync(join(tmpdir(), `dsh-forge-e2e-sc-rc5-${tag}-ws-`))
  const wsDir = join(fixtureRoot, 'sc-ws')
  mkdirSync(wsDir, { recursive: true })
  await forgeInvoke(page, 'forge:projects/register', {
    workspaceDir: wsDir, name: `sc-rc5-${tag}-ws`, forgeDir: wsDir,
  })
  await selectWorkspaceViaChip(page, `sc-rc5-${tag}-ws`)
  await ensureNoBlockingDialog(page)
  const composer = mainInputOf(page)
  await composer.click()
  await page.keyboard.insertText(BOOT_MSG)
  await page.keyboard.press('Enter')
  await expect(page.locator(CONVERSATION_CONTENT).first(), '首条消息入转录（划选源在场）').toContainText(NEEDLE_A, { timeout: 60_000 })
  // dockkit 全屏文档夹具注入（真机取证同款标记面——全屏兜底 + 文档活动双门满足；
  // 文本 = 划选锚句集，挂 body 免疫 dockkit 复管，作稳定划选源——e2e 宿主转录被
  // 零凭据模型失败刷屏挤出虚拟窗，转录划选源不稳定，探针实证）
  // → 替身挂载；ball 态先点球恢复
  await injectDockkitDocFixture(page, { fullscreen: true, text: `${NEEDLE_A}。${NEEDLE_B}。${NEEDLE_LONG}` })
  await expect(page.locator('[data-testid="dscf-root"]'), '全屏标记注入后替身挂载').toHaveCount(1, { timeout: 15_000 })
  const ball = page.locator('[data-testid="dscf-ball"]')
  if (await ball.isVisible().catch(() => false)) {
    await ball.click()
  }
  await expect(surrogateInputOf(page), '替身复制件输入锚在场').toBeVisible({ timeout: 15_000 })
  return { userData, fixtureRoot }
}

test('@web-e2e @blitz super-composer rc.5 差异面 J1：替身形态对照——chip 原子渲染 / 发送钮图标形态 / 边界编辑存活 / 长引用收窄 / 二次发送形态不劣化', async () => {
  test.setTimeout(900_000)
  const launchUd = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-rc5-j1-launch-ud-'))
  const launched = await launchHost({ userData: launchUd, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' } })
  const { app, page, pageErrors } = launched
  let dirs: { userData: string; fixtureRoot: string } | null = null
  try {
    dirs = await setupSurrogate(page, 'j1')
    // ── SC-C1 / J1-S1：划选短锚句 A → chip 原子呈现 ──
    await selectAndAddToChat(page, NEEDLE_A)
    await expect(surrogateChipsOf(page), 'SC-C1：替身草稿出现引用 chip（[data-composer-chip="quote"]）').toHaveCount(1, { timeout: 15_000 })
    const atomicA = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')
      const chip = input?.querySelector('[data-composer-chip="quote"]')
      return { chipEditable: chip?.getAttribute('contenteditable'), chipText: chip?.textContent ?? '', editorText: input?.textContent ?? '' }
    })
    expect(atomicA.chipEditable, 'SC-C1：chip 为原子节点（contenteditable=false）').toBe('false')
    // SC-C1 断言-契约溯源（journey §4/SC-C1 终态，bug 1ea97ffc 钉稳）：chip label =
    // @ + summaryOf 选文摘要投影（quote-reference selection-menu.tsx SUMMARY_MAX=24，
    // ≤24 字全保真 / 超长截断加 …）——短锚句 ≤24 字即原文逐字投影；「长句截断」
    // 语义由 J1-B2 长锚句承载。
    expect(atomicA.editorText.includes(NEEDLE_A), 'SC-C1[I1]（契约=journey §4/SC-C1）：chip label 明文投影在场（短锚句 ≤24 字全保真）').toBe(true)
    expect(atomicA.chipText, 'SC-C1[I1]（契约=journey §4/SC-C1）：chip label = @ + summaryOf 投影（短锚句逐字全保真）').toBe(`@${expectLabelOf(NEEDLE_A)}`)
    // ── SC-C1 / J1-S2：第二锚句 → 两 chip 并存 ──
    await selectAndAddToChat(page, NEEDLE_B)
    await expect(surrogateChipsOf(page), 'J1-S2：两 chip 并存').toHaveCount(2, { timeout: 15_000 })
    // ── SC-C2 / J1-S3+B1：chip 边界编辑存活（尾插两字 → Backspace 两删），chip 计数不变 ──
    const surrogate = await ensureSurrogateInput(page)
    await surrogate.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('尾巴')
    await pollUntil(page, async () => (await surrogateDraftText(page)).includes('尾巴'), 'SC-C2：chip 后文本编辑生效')
    expect(await surrogateChipsOf(page).count(), 'SC-C2：文本编辑不摧毁 chip').toBe(2)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await pollUntil(page, async () => !(await surrogateDraftText(page)).includes('尾巴'), 'SC-C2：Backspace 只删文本字符')
    expect(await surrogateChipsOf(page).count(), 'SC-C2/B1：贴边界删字 chip 存活（chip 计数不因纯文本编辑变化）').toBe(2)
    // ── SC-C4 / J1-S5：发送——转录含引用序列化块 + 草稿清空 + I2 发送钮全程图标形态 ──
    const surSend = await ensureSurrogateInput(page)
    await surSend.click()
    await page.keyboard.insertText(SEND_TAIL)
    await installRc5Recorder(page)
    // 先等记录器首拍（采样 10ms 间隔——install→Enter 零间隙时非 sending 相样本恒空）
    await pollUntil(page, async () => ((await rc5RecorderOf(page)).samples.length) > 0, '记录器首拍采样在场', 5_000)
    const surSendInput = await ensureSurrogateInput(page)
    await surSendInput.press('Enter')
    await transcriptContains(page, SEND_TAIL, 'SC-C4：消息入转录')
    // wire 形状断言落会话日志（DOM 行渲染 chip label 明文；LLM 面序列化 = <quote> 结构块
    // ——quote-source.ts minimalQuoteBlock，walkthrough AC7 同径递归扫 userData）
    // wire 形状取证（信息性——LLM 面 <quote> 序列化在零凭据宿主发送链即时失败下不落
    // 盘（探针/两轮实证），该面由真机取证承载（walkthrough/1.8-r2 归档）；anchor-sync
    // 台账声明此降级，非静默弱化）
    console.log('[rc5][info] wire-serialization-in-log', sessionLogContains(launchUd, '<quote id='))
    await pollUntil(page, async () => (await surrogateDraftText(page)) === '' && (await surrogateChipsOf(page).count()) === 0, 'SC-C4：发送后替身草稿清空（chip 随稿清零）')
    const rec1 = await rc5RecorderOf(page)
    expect(rec1.sendingSeen, 'SC-C5 前置：sending 相窗口被捕获（data-phase=sending / [data-sending] 在场）').toBe(true)
    const duringSending = rec1.samples.filter((s) => s.phase === 'sending' || s.dataSending)
    expect(duringSending.length, 'sending 相采样非空').toBeGreaterThan(0)
    for (const s of duringSending) {
      expect(s.btnSvg, 'I2/D2：sending 相发送钮仍为 svg 图标形态（spinner 替换箭头——非黑方块/未样式化矩形，bug 493c4fef 消解观察点）').toBe(true)
      expect(s.btnSvgBox.w > 2 && s.btnSvgBox.h > 2, 'I2/D2（反例可红）：svg 实际渲染非退化尺寸（0×0 未样式化方块即红）').toBe(true)
      expect(s.busy, 'D2：sending 相发送钮 aria-busy=true').toBe('true')
    }
    const idleSamples = rec1.samples.filter((s) => s.phase !== 'sending' && !s.dataSending && s.draft.length > 0)
    expect(idleSamples.length, '非 sending 相采样非空').toBeGreaterThan(0)
    for (const s of idleSamples) {
      expect(s.btnSvg, 'I2：非 sending 相发送钮恒 svg 图标形态').toBe(true)
      expect(s.btnSvgBox.w > 2 && s.btnSvgBox.h > 2, 'I2（反例可红）：svg 实际渲染非退化尺寸').toBe(true)
    }
    await rc5RecorderStop(page)
    // ── J1-B3：二次发送间快速再划选——re-copy 形态与首轮一致 ──
    await ensureSurrogateInput(page)
    await selectAndAddToChat(page, NEEDLE_A)
    await expect(surrogateChipsOf(page), 'J1-B3：第二轮 chip 呈现（回 idle 后 re-copy 形态不劣化）').toHaveCount(1, { timeout: 15_000 })
    // ── J1-B2：长引用收窄——原文明文不溢出输入区 ──
    await selectAndAddToChat(page, NEEDLE_LONG)
    await ensureSurrogateInput(page)
    const longFace = await page.evaluate((needle) => {
      const input = document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]') as HTMLElement | null
      // 目标 = 最近添加的 chip（J1-B3 轮次残留 chip 在前——首轮实证取首 chip 会错位到旧锚句）
      const chip = [...(input?.querySelectorAll('[data-composer-chip="quote"]') ?? [])].pop() as HTMLElement | null
      const label = [...(chip?.querySelectorAll('span') ?? [])].filter((s) => s.textContent !== '@').pop() ?? null
      return {
        chipText: chip?.textContent ?? '',
        editorText: input?.textContent ?? '',
        chipWidth: chip?.getBoundingClientRect().width ?? -1,
        inputWidth: input?.getBoundingClientRect().width ?? -1,
        labelScrollWidth: label?.scrollWidth ?? -1,
        labelClientWidth: label?.clientWidth ?? -1,
        needleLen: needle.length,
      }
    }, NEEDLE_LONG)
    // SC-C1 契约（journey §4/SC-C1 终态）：超长选文 label = 精确截断投影（前 24 字 + …）
    // ——反例可红：截断契约回归（全文溢出）时精确形状断言即红。
    expect(longFace.chipText, 'J1-B2[I1]（契约=journey §4/SC-C1）：chip label = @ + summaryOf 截断投影（前 24 字 + …）').toBe(`@${expectLabelOf(NEEDLE_LONG)}`)
    expect(longFace.editorText.includes(NEEDLE_LONG), 'J1-B2/I1：长引用原文明文不溢出输入区').toBe(false)
    // 反例可红（收窄判据）：ellipsis 未生效（overflow 样式漂移/label 不裁剪）时
    // scrollWidth == clientWidth 即红；chip 实宽恒小于未裁剪内容宽（收窄真发生）。
    expect(longFace.labelScrollWidth, 'J1-B2：label 裁剪面在场（锚命中）').toBeGreaterThan(0)
    expect(longFace.labelScrollWidth, 'J1-B2：label 内容宽超可视宽（ellipsis 截断样式生效——样式漂移不裁剪即红）').toBeGreaterThan(longFace.labelClientWidth)
    expect(longFace.chipWidth, 'J1-B2：chip 收窄——chip 实宽小于未裁剪内容宽（收窄不横向溢出）').toBeLessThan(longFace.labelScrollWidth)
    // ── 全程干净面 ──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    if (dirs !== null) {
      rmDirBestEffort(dirs.userData)
      rmDirBestEffort(dirs.fixtureRoot)
    }
  }
})

test('@web-e2e @blitz super-composer rc.5 差异面 J2：sending 相替身 mention 冻结（trackGuardOf frozen）与非 sending 期零漂移', async () => {
  test.setTimeout(900_000)
  const launched = await launchHost({ userData: mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-rc5-j2-launch-ud-')), expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' } })
  const { app, page, pageErrors } = launched
  let dirs: { userData: string; fixtureRoot: string } | null = null
  try {
    dirs = await setupSurrogate(page, 'j2')
    const surrogate = surrogateInputOf(page)
    // ── SC-C6 / J2-S1+S2：空闲态 mention 正向基线（菜单弹出，I6 零漂移锚）──
    let mentionVisible = false
    for (let attempt = 0; attempt < 4 && !mentionVisible; attempt++) {
      await surrogate.click()
      await surrogate.fill('')
      await page.keyboard.insertText('@')
      mentionVisible = await page.locator('[data-testid="dscf-mention"]')
        .waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false)
    }
    expect(mentionVisible, 'SC-C6/J2-S1：空闲态 @ 触发 mention 菜单（I6 正向基线）').toBe(true)
    await page.keyboard.press('Escape')
    const sur2 = await ensureSurrogateInput(page)
    await sur2.fill(J2_DRAFT)
    // ── SC-C5 / J2-B1+B3：发送后 sending 相内键入 '@' 与普通文本——零放行 ──
    await installRc5Recorder(page)
    await surrogate.press('Enter')
    // 乐观窗转录断言（发送行随零凭据失败横幅落地即被挤出虚拟窗——断言须抢在横幅前）
    await transcriptContains(page, J2_DRAFT, 'J2 前置：消息入转录（发送链完成）')
    // 冻结窗口内快速驱动：有界循环（每轮 '@' + 普通文本各一发），phase 离开 sending 即停
    for (let attempt = 0; attempt < 40; attempt++) {
      const face = await surrogateFaceOf(page)
      if (face.phase !== 'sending') break
      await page.keyboard.insertText('@甲')
      await page.waitForTimeout(20)
    }
    const rec2 = await rc5RecorderOf(page)
    expect(rec2.sendingSeen, 'SC-C5：sending 相窗口被捕获（journey SC-C5 进入判据——未捕获即红，不硬凑）').toBe(true)
    const sendingSamples = rec2.samples.filter((s) => s.phase === 'sending')
    expect(sendingSamples.length, 'sending 相采样非空').toBeGreaterThan(0)
    for (const s of sendingSamples) {
      expect(s.menuCount, 'SC-C5/I5/J2-B1：sending 相 mention 菜单不弹出').toBe(0)
    }
    const draftAtSending = sendingSamples[0]!.draft
    for (const s of sendingSamples) {
      expect(s.draft, 'SC-C5/J2-B3：sending 相草稿零变更（普通文本不入草稿——官方全冻结口径）').toBe(draftAtSending)
    }
    await rc5RecorderStop(page)
    await pollUntil(page, async () => {
      const face = await surrogateFaceOf(page)
      return face.phase !== 'sending' && face.editable
    }, 'J2-B2 前置：sending 相结束、编辑器恢复可编辑')
    // ── SC-C6 / J2-B2：冻结不残留——恢复可编辑后菜单复弹 ──
    let restoredVisible = false
    for (let attempt = 0; attempt < 4 && !restoredVisible; attempt++) {
      await surrogate.click()
      await page.keyboard.insertText('@')
      restoredVisible = await page.locator('[data-testid="dscf-mention"]')
        .waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false)
      if (!restoredVisible) await page.keyboard.press('Escape')
    }
    expect(restoredVisible, 'SC-C6/J2-B2：sending 相结束菜单恢复弹出（冻结只作用于 sending 相）').toBe(true)
    // ── 全程干净面 ──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    if (dirs !== null) {
      rmDirBestEffort(dirs.userData)
      rmDirBestEffort(dirs.fixtureRoot)
    }
  }
})
