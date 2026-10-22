// @proposal:super-composer @web-e2e @blitz
// 互斥硬规则 AC 级 pin（proposal.md §模块设计 2 互斥硬规则：正式 composer 与全屏替身
// 互斥、不同时出现——全屏态落 chip 聚焦替身、非全屏聚焦主 composer）。
// 溯源：bug 9c3635a9（全屏替身语义回落三档）/ bug 1ab2f4e6（全屏聚焦缝接线）。
// 语义单测正本 = packages/plugins/quote-reference/tests/selection-menu.test.tsx（布尔回落）
// + packages/plugins/super-composer/tests/mini-composer-mount.test.ts；本 spec = git 内
// 真机 e2e 锚（过程件 walkthrough 探针不进 git，驱动逻辑在此收编）。
// chip 落地断言投影链联动：真因 = 订阅闩锁 1d1e07af（fixed@073c107b），前置登记
// 74a341e8 已回填 fixed、85ca6ba5 终态 unresolved 由 74a341e8 销账——真机 1 passed 实证投影存活；
// 断言用直读（替身 textarea value）+ 投影（dscf-chips textContent）双活腿（data-draft 死腿已删：
// 全插件源码零生产者恒 null）。
// 驱动链：launchHost → 会话装配 → dockkit 文档打开 → 全屏开关（官方 chrome「全屏」按钮
// 进入 / ⧉ = 官方 ISidebarRight.toggleFullscreen 同径退出）→ 文档划选（mouseup 触发径）
// → 菜单「添加到对话」→ 断言 document.activeElement 对应面。
// Hard Rules：零产品源码改动（断言失败 → 三分流归因上报）；夹具 = 仓外 tmp；
// 零真实模型凭据。

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { closeApp, launchHost } from '../../support/launch.js'
import { CONVERSATION_CONTENT, docPanelOf, ovDocRowOf, ovSubtabOf, OV_PARENT_ANY } from '../../support/anchors.js'
import { openOverviewDock } from '../../support/navigation.js'
import { ensureNoBlockingDialog } from '../../support/modals.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { selectWorkspaceViaChip, forgeInvoke } from '../../support/rpc.js'

const DOC_BODY = '互斥聚焦锚定文本：选区映射为稳定描述符，三段拼合引用。'
const DOC_NEEDLE = '三段拼合'

function composerOf(page: Page): ReturnType<Page['locator']> {
  return page.locator('[data-composer-input]:visible').last()
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

/** 划选 → 浮出菜单 → 「添加到对话」（菜单行 role=menuitem；menu root 为常挂 portal 空壳，isVisible 会误报，以菜单行为准）。 */
async function selectAndAddToChat(page: Page, containerSelector: string): Promise<void> {
  expect(await selectTextAndMouseup(page, containerSelector, DOC_NEEDLE), '划选命中目标文本').toBe(true)
  const addBtn = page.getByRole('menuitem', { name: '添加到对话' }).first()
  await expect(addBtn).toBeVisible({ timeout: 10_000 })
  await addBtn.click()
  await page.waitForTimeout(600)
}

test('@web-e2e @blitz 互斥聚焦两态：全屏落 chip 聚焦替身输入 / 非全屏聚焦主 composer', async () => {
  test.setTimeout(900_000)
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-mutex-ud-'))
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-sc-mutex-ws-'))
  const wsDir = join(fixtureRoot, 'sc-ws')
  const docDir = join(wsDir, 'docs', 'features', 'sc-feat', 'design')
  mkdirSync(docDir, { recursive: true })
  const docRel = 'docs/features/sc-feat/design/tech-design.md'
  writeFileSync(join(docDir, 'tech-design.md'), `# tech-design\n\n${DOC_BODY}\n`, 'utf8')
  const launched = await launchHost({ userData, expectPhase: 'hero', env: { DSH_FORGE_WINDOW_HIDDEN: '0' } })
  const { app, page, pageErrors } = launched
  try {
    // ── 会话装配：注册工作区 → chip 流开会话 → 发送首条消息（composer 在场）──
    await forgeInvoke(page, 'forge:projects/register', {
      workspaceDir: wsDir, name: 'sc-mutex-ws', forgeDir: wsDir, knowledgeDir: join(wsDir, '.knowledge'),
    })
    await selectWorkspaceViaChip(page, 'sc-mutex-ws')
    await ensureNoBlockingDialog(page)
    const MSG = '互斥聚焦锚首条消息-1.21'
    const composer = composerOf(page)
    await composer.click()
    await page.keyboard.insertText(MSG)
    await page.keyboard.press('Enter')
    await expect(page.locator(CONVERSATION_CONTENT).first()).toContainText(MSG, { timeout: 60_000 })

    // ── dockkit 文档打开（划选源 = 真实 dockkit pane 内容区）──
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
    const docPanelSel = docPanelOf(projId, docRel)
    await expect(page.locator(docPanelSel).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator(docPanelSel).locator('[data-dswf-doc-body]')).toContainText(DOC_NEEDLE, { timeout: 30_000 })

    // ── U1 非全屏基线门控：markers=0 → 替身不挂载（互斥基线）──
    const baseline = await page.evaluate(() => ({
      fullscreenMarkers: document.querySelectorAll('[data-sidebar-right-panel="fullscreen"]').length,
      dscfMounted: document.querySelectorAll('[data-testid="dscf-root"]').length,
    }))
    expect(baseline.fullscreenMarkers, '基线：非全屏（fullscreen markers 归零）').toBe(0)
    expect(baseline.dscfMounted, '互斥基线：非全屏替身不常驻挂载').toBe(0)

    // ── U2 全屏态：官方 chrome「全屏」按钮进入（官方 layout.mode 真值）→ 替身浮现 ──
    await page.getByRole('button', { name: '全屏', exact: true }).first().click()
    await expect(page.locator('[data-sidebar-right-panel="fullscreen"]').first(), '全屏标记在场').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="dscf-root"]'), '全屏态替身挂载').toHaveCount(1, { timeout: 10_000 })

    await selectAndAddToChat(page, docPanelSel)
    const stateFullscreen = await page.evaluate(() => ({
      activeIsDscf: document.activeElement?.getAttribute('data-dscf-composer-input') === '' ||
        document.activeElement?.closest('[data-testid="dscf-root"]') !== null,
      dscfMounted: document.querySelectorAll('[data-testid="dscf-root"]').length,
      chipLanded: (document.querySelector('[data-dscf-composer-input]')?.value ?? '').includes('](quote:') ||
        (document.querySelector('[data-testid="dscf-chips"]')?.textContent ?? '').length > 0,
    }))
    expect(stateFullscreen.dscfMounted, '全屏态替身在挂（互斥：替身为唯一合法输入面）').toBe(1)
    expect(stateFullscreen.chipLanded, '全屏态：chip 落替身草稿').toBe(true)
    expect(stateFullscreen.activeIsDscf, '互斥硬规则：全屏态落 chip 后 activeElement=替身输入锚').toBe(true)

    // ── U3 ⧉ 退全屏（官方 ISidebarRight.toggleFullscreen 同径）→ 替身卸载、markers 归零 ──
    await page.locator('[data-testid="dscf-fullscreen"]').click()
    await expect(page.locator('[data-testid="dscf-root"]'), '退全屏后替身卸载').toHaveCount(0, { timeout: 10_000 })
    const markersAfterExit = await page.evaluate(() => document.querySelectorAll('[data-sidebar-right-panel="fullscreen"]').length)
    expect(markersAfterExit, '退全屏后官方 fullscreen markers 归零').toBe(0)

    // ── U4 非全屏重复：划选 → 落 chip → activeElement=主 composer 输入锚 ──
    await selectAndAddToChat(page, docPanelSel)
    const stateNormal = await page.evaluate(() => ({
      activeInMainComposer: (document.activeElement?.closest('[data-composer-input]') ?? null) !== null,
      activeIsDscf: document.activeElement?.closest('[data-testid="dscf-root"]') !== null,
      dscfMounted: document.querySelectorAll('[data-testid="dscf-root"]').length,
    }))
    expect(stateNormal.dscfMounted, '互斥硬规则：非全屏替身不在场（两态不同时出现）').toBe(0)
    expect(stateNormal.activeInMainComposer, '互斥硬规则：非全屏落 chip 后 activeElement=主 composer 输入锚').toBe(true)
    expect(stateNormal.activeIsDscf, '非全屏聚焦不落替身面').toBe(false)

    // ── U5 全程干净面 ──
    expect(pageErrors, `renderer 未捕获异常面须为空：${pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await closeApp(app)
    rmDirBestEffort(userData)
    rmDirBestEffort(fixtureRoot)
  }
})
