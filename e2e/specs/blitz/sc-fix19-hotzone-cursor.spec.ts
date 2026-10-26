// @proposal:super-composer @web-e2e @probe
// 过程件（不进 git——super-composer/1.25 bug 64817807 chevron 单向箭头真机取证探针）：
//   可折叠态（S2 展开中）光标 = 单向下箭头（点击收起）；可展开态（S1）= 单向上箭头。
// 证据归档 .forge/docs/proposals/super-composer/walkthrough/111-25/111-26-*
// fix-12 输入区切换官方复制件，锚随迁：dscf-input 退役 → [data-dscf-official-input] [data-composer-input]（contenteditable）。
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'

const WALKTHROUGH = join(fileURLToPath(new URL('../../../.forge/docs/proposals/super-composer/walkthrough', import.meta.url)))

test('@web-e2e @probe 1.25 替身热区 chevron 单向光标两态真机取证', async () => {
  test.setTimeout(600_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc125-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc125-ws-'))
  const wsDir = join(fixtureRoot, 'sc-ws')
  mkdirSync(wsDir, { recursive: true })
  const F: Record<string, unknown> = {}
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' } })
  const { app, page, pageErrors } = launched
  try {
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'sc-125-ws', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    for (let attempt = 0; ; attempt++) {
      try {
        await selectWorkspaceViaChip(page, 'sc-125-ws')
        break
      } catch (error) {
        if (attempt >= 2) throw error
        await page.keyboard.press('Escape').catch(() => undefined)
        await page.waitForTimeout(3_000)
      }
    }
    await ensureNoBlockingDialog(page)

    // ── 全屏 → 替身挂载 → 替身发一条消息（发送自动展开 S2，消息流非空 = 可展开/可折叠） ──
    await page.getByRole('button', { name: '全屏', exact: true }).first().click().catch(() => undefined)
    await page.waitForTimeout(1_500)
    let dscfCount = await page.evaluate(() => document.querySelectorAll('[data-testid="dscf-root"]').length)
    if (dscfCount === 0) {
      await page.evaluate(() => {
        const el = document.createElement('div')
        el.setAttribute('data-dockkit-pane', '')
        document.body.appendChild(el)
        el.setAttribute('data-sidebar-right-panel', 'fullscreen')
      })
      await page.waitForTimeout(1_500)
      dscfCount = await page.evaluate(() => document.querySelectorAll('[data-testid="dscf-root"]').length)
    }
    expect(dscfCount, '替身挂载').toBe(1)
    const dscfInput = page.locator('[data-testid="dscf-root"] [data-dscf-official-input] [data-composer-input]').last()
    await expect(dscfInput).toHaveCount(1, { timeout: 15_000 })
    await dscfInput.fill('替身消息-1.25')
    await dscfInput.press('Enter')
    await page.waitForTimeout(3_000)

    // ── 态一：S2 可折叠（展开中）→ 光标应为单向下箭头（svg chevron-down + s-resize 回落） ──
    const collapseFace = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="dscf-root"]')
      const hotzone = document.querySelector('[data-testid="dscf-hotzone"]')
      return {
        phase: root?.getAttribute('data-phase') ?? null,
        cls: hotzone?.className ?? '',
        cursor: hotzone === null ? null : getComputedStyle(hotzone).cursor,
      }
    })
    F.stateCollapse = collapseFace
    console.log('[125] collapse', JSON.stringify(collapseFace))
    expect(collapseFace.phase).toBe('s2')
    expect(collapseFace.cls).toContain('dscf-hotzone-collapse')
    expect(collapseFace.cursor).not.toContain('ns-resize')
    expect(collapseFace.cursor).toContain('%23')
    expect(collapseFace.cursor).toContain('s-resize')
    expect(collapseFace.cursor).toMatch(/M3\.5 5\.5 8 10l4\.5-4\.5/) // chevron-down path
    await page.screenshot({ path: join(WALKTHROUGH, '111-25-cursor-collapse-s2.png'), fullPage: false }).catch(() => undefined)

    // ── 态二：点热区收起 → S1 可展开 → 光标应为单向上箭头（chevron-up + n-resize 回落） ──
    await page.locator('[data-testid="dscf-hotzone"]').click()
    await page.waitForTimeout(800)
    const expandFace = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="dscf-root"]')
      const hotzone = document.querySelector('[data-testid="dscf-hotzone"]')
      return {
        phase: root?.getAttribute('data-phase') ?? null,
        cls: hotzone?.className ?? '',
        cursor: hotzone === null ? null : getComputedStyle(hotzone).cursor,
      }
    })
    F.stateExpand = expandFace
    console.log('[125] expand', JSON.stringify(expandFace))
    expect(expandFace.phase).toBe('s1')
    expect(expandFace.cls).toContain('dscf-hotzone-expand')
    expect(expandFace.cursor).not.toContain('ns-resize')
    expect(expandFace.cursor).toContain('%23')
    expect(expandFace.cursor).toContain('n-resize')
    expect(expandFace.cursor).toMatch(/M3\.5 10\.5 8 6l4\.5 4\.5/) // chevron-up path
    try {
      await page.screenshot({ path: join(WALKTHROUGH, '111-26-cursor-expand-s1.png'), fullPage: false, timeout: 20_000 })
      console.log('[125] shot-expand-ok')
    } catch (e) {
      console.log('[125] shot-expand-fail', String(e).slice(0, 400))
      // 兜底：截 dscf-root 元素面（等价证据——热区类名/光标态二取证）
      await page.locator('[data-testid="dscf-root"]').screenshot({ path: join(WALKTHROUGH, '111-26-cursor-expand-s1.png'), timeout: 20_000 })
        .catch((e2: unknown) => console.log('[125] shot-expand-fail2', String(e2).slice(0, 400)))
    }

    writeFileSync(join(WALKTHROUGH, '111-fix19-cursor-findings.json'), JSON.stringify(F, null, 2), 'utf8')
    expect(pageErrors, `renderer pageErrors 须空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})
