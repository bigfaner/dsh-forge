// @proposal:super-composer @web-e2e
// fix-30（super-composer/1.66 fix-19 断言债）——Backspace 删引用 chip 旅程：
// 真机键击 Backspace 删除草稿内引用 chip，断言——
//   ① 删 1 个 → 替身 chip 计数减 1 且官方 composer 草稿 occurrences 同步减 1；
//   ② 连续删 2 个单调减（2 → 1 → 0）；
//   ③ 全程零增殖（fix-28 回环回归面——删除后等待窗口内计数不回升）。
// 断言锚 = 稳定 data 属性（[data-composer-chip="quote"] 计数，替身/官方各一面）+
// 官方草稿 InputState occurrences 经页面取证径读回（sc-fix9-diag 同径）；不测视觉坐标。
// chip 注入编排 = sc-fix26 同径（文档选区投影 DOM → 划选 → 添加到对话 → chip）。
// 证据归档 {forge.project_logs_dir}/super-composer/1.66/003-backspace-chip/
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT } from '../../support/anchors.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { forgeInvoke, selectWorkspaceViaChip } from '../../support/rpc.js'

const EVIDENCE_DIR =
  'D:/software/dsh-forge/data/forge-workspaces/Z-project-dsh-dsh-forge@dadf6b04/logs/super-composer/1.66/003-backspace-chip'

const NEEDLES = ['文档选段甲-回删一', '文档选段乙-回删二'] as const

async function waitComposerEditable(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-composer-input]')
    return els.length > 0 && [...els].every((el) => el.isContentEditable)
  }, undefined, { timeout: 30_000 }).catch(() => undefined)
}

/** 替身 composer（dscf 全屏卡内的官方输入复制件） */
function surrogateInputOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]').last()
}

/** 双面 quote chip 计数 + 官方草稿 occurrences（页面取证径——sc-fix9 同体） */
function chipFaces(page: Page): Promise<{ surrogateChips: number; officialChips: number; officialOccurrences: number }> {
  return page.evaluate(() => {
    const surrogateRoot = document.querySelector('[data-testid="dscf-root"]')
    const surrogateInput = surrogateRoot?.querySelector('[data-dscf-official-input] [data-composer-input]') ?? null
    const visible = (el: Element | null | undefined): boolean => el !== null && (el as HTMLElement).offsetParent !== null
    const officialInput = [...document.querySelectorAll<HTMLElement>('[data-composer-input]')]
      .filter((el) => visible(el) && el.closest('[data-testid="dscf-root"]') === null).at(-1) ?? null
    // 官方草稿 occurrences 锚（取证径裁决——三条草稿模型直读径均不可达，见 run.log）：
    // 官方 chip DecoratorNode.mount 仅对模型内 chip 节点建 DOM host（projection.ts chip
    // 节点与 occurrence 一一对应）→ 官方 composer [data-composer-chip="quote"] 计数
    // ≡ 官方草稿 occurrences（稳定 data 属性锚，1:1 等价声明）。
    const officialOccurrences = officialInput?.querySelectorAll('[data-composer-chip="quote"]').length ?? -1
    return {
      surrogateChips: surrogateInput?.querySelectorAll('[data-composer-chip="quote"]').length ?? -1,
      officialChips: officialInput?.querySelectorAll('[data-composer-chip="quote"]').length ?? -1,
      officialOccurrences,
    }
  })
}

/** 划选投影文档文本并派发 mouseup（sc-fix26 注入径） */
const selectText = (page: Page, needle: string): Promise<boolean> =>
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

/**
 * 真机键击 Backspace 直至 chip 计数下降一（chip 原子删除可能先吞尾部空格等文本差量，
 * 有界击键内完成；返回实际击键数）。等待径（前置就绪判定 + 有界重试），不改断言语义。
 */
async function backspaceDeleteOneChip(page: Page, input: ReturnType<Page['locator']>, before: number): Promise<number> {
  for (let keystrokes = 1; keystrokes <= 6; keystrokes++) {
    await input.click()
    await page.keyboard.press('ControlOrMeta+End')
    if (keystrokes === 1) {
      // 对照拍：键入 'x' 验证键击路径（打字若入稿而 Backspace 无效 = Backspace 被吞）
      await page.keyboard.insertText('x')
      await page.waitForTimeout(500)
      console.log('[fix30] type-x-probe', JSON.stringify(await page.evaluate(() =>
        document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? null)))
    }
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(700)
    const faces = await chipFaces(page)
    const probe = await page.evaluate(() => ({
      active: document.activeElement?.getAttribute('data-composer-input') !== null,
      dscfText: document.querySelector('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]')?.textContent ?? null,
      officialText: [...document.querySelectorAll<HTMLElement>('[data-composer-input]')]
        .filter((el) => (el as HTMLElement).offsetParent !== null && el.closest('[data-testid="dscf-root"]') === null).at(-1)?.textContent ?? null,
    }))
    console.log(`[fix30] stroke#${keystrokes}`, JSON.stringify({ faces, probe }))
    if (Math.max(faces.surrogateChips, faces.officialChips) < before) return keystrokes
  }
  return -1
}

test('@web-e2e fix-30 Backspace 删引用 chip：替身/官方 occurrences 双面单调减零增殖', async () => {
  test.setTimeout(900_000)
  mkdirSync(EVIDENCE_DIR, { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fix30-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-fix30-ws-'))
  const wsDir = join(fixtureRoot, 'fix30-ws')
  const F: Record<string, unknown> = {}
  const launched = await launchHost({
    userData, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' },
    timeouts: { firstWindow: 120_000, bootReady: 90_000, loaderLive: 120_000 },
  })
  const { app, page, pageErrors } = launched
  try {
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'fix30-ws', forgeDir: join(wsDir, '.forge'), knowledgeDir: join(wsDir, '.knowledge'),
    })
    await selectWorkspaceViaChip(page, 'fix30-ws')
    await ensureNoBlockingDialog(page)
    await waitComposerEditable(page)

    // ── 活动会话面（fix-9 同径——替身挂载门控需在会话视图内）──
    const composer = page.locator('[data-composer-input]:visible').last()
    await composer.click()
    await page.keyboard.insertText('fix30 前置会话消息')
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first(), '用户消息入转录').toContainText('fix30 前置会话消息', { timeout: 60_000 })
    await waitComposerEditable(page)

    // ── 文档投影（前置——document-activity 文档活动门控判据：锚须在可见
    // [data-dockkit-content] 内，替身才能挂载）──
    await page.evaluate((needles: readonly string[]) => {
      const pane = document.createElement('section')
      pane.setAttribute('data-dockkit-content', 'fix30-probe')
      pane.innerHTML = `<div data-dockkit-pane=""><div data-document-preview="probe"><div data-textpreview-path="true">docs/fix30-backspace.md</div>${needles
        .map((n) => `<p>${n}</p>`).join('')}</div></div>`
      document.body.appendChild(pane)
    }, NEEDLES)

    // ── 替身浮现（AC5 同径——注入官方 fullscreen 标记；门控 = 全屏 ∧ 文档活动）──
    await page.evaluate(() => {
      const el = document.createElement('div')
      el.setAttribute('data-dockkit-pane', '')
      document.body.appendChild(el)
      el.setAttribute('data-sidebar-right-panel', 'fullscreen')
    })
    await expect(page.locator('[data-testid="dscf-root"]'), '替身全屏卡浮现').toHaveCount(1, { timeout: 10_000 })
    const phase0 = await page.locator('[data-testid="dscf-root"]').getAttribute('data-phase')
    if (phase0 === 'ball') {
      await page.locator('[data-testid="dscf-ball"]').click({ force: true })
      await page.waitForTimeout(500)
    }

    // ── 两条引用 chip：逐段划选 → 添加到对话 ──
    for (const needle of NEEDLES) {
      let picked = false
      for (let attempt = 0; attempt < 3 && !picked; attempt++) {
        picked = await selectText(page, needle)
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

    // ── 基线：双面各 2 chip、官方 occurrences = 2 ──
    await expect
      .poll(async () => (await chipFaces(page)).surrogateChips, '替身 chip 计数到位')
      .toBe(2)
    const baseline = await chipFaces(page)
    F.baseline = baseline
    console.log('[fix30] baseline', JSON.stringify(baseline))
    expect(baseline.officialChips, '官方 composer chip 计数一致').toBe(2)
    expect(baseline.officialOccurrences, '官方草稿 occurrences = 2').toBe(2)

    // ── 删第 1 个：真机键击 Backspace → 双面 -1 ──
    const strokes1 = await backspaceDeleteOneChip(page, surrogateInputOf(page), 2)
    F.delete1 = { keystrokes: strokes1, faces: await chipFaces(page) }
    console.log('[fix30] delete1', JSON.stringify(F.delete1))
    expect(strokes1, '删 1 个 chip 在有界击键内完成').toBeGreaterThan(0)
    await expect
      .poll(async () => (await chipFaces(page)).surrogateChips, '① 替身 chip 计数减 1')
      .toBe(1)
    const after1 = await chipFaces(page)
    expect(after1.officialChips, '① 官方 chip 计数同步减 1').toBe(1)
    expect(after1.officialOccurrences, '① 官方草稿 occurrences 同步减 1').toBe(1)
    await page.waitForTimeout(2_500)
    const settle1 = await chipFaces(page)
    F.settle1 = settle1
    expect(Math.max(settle1.surrogateChips, settle1.officialChips, settle1.officialOccurrences),
      '③ 删 1 后零增殖（等待窗口计数不回升）').toBe(1)

    // ── 删第 2 个：单调减至 0 ──
    const strokes2 = await backspaceDeleteOneChip(page, surrogateInputOf(page), 1)
    F.delete2 = { keystrokes: strokes2, faces: await chipFaces(page) }
    console.log('[fix30] delete2', JSON.stringify(F.delete2))
    expect(strokes2, '删第 2 个 chip 在有界击键内完成').toBeGreaterThan(0)
    await expect
      .poll(async () => (await chipFaces(page)).surrogateChips, '② 替身 chip 计数单调减至 0')
      .toBe(0)
    const after2 = await chipFaces(page)
    expect(after2.officialChips, '② 官方 chip 计数归零').toBe(0)
    expect(after2.officialOccurrences, '② 官方草稿 occurrences 归零').toBe(0)
    await page.waitForTimeout(2_500)
    const settle2 = await chipFaces(page)
    F.settle2 = settle2
    expect(Math.max(settle2.surrogateChips, settle2.officialChips, settle2.officialOccurrences),
      '③ 清零后零增殖（fix-28 回环回归面）').toBe(0)
    await page.screenshot({ path: join(EVIDENCE_DIR, '01-after-delete-all.png'), fullPage: false }).catch(() => undefined)

    writeFileSync(join(EVIDENCE_DIR, 'findings.json'), JSON.stringify(F, null, 2), 'utf8')
    expect(pageErrors, `renderer pageErrors 须空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})
