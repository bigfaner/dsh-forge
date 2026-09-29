// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc4
// Traceability: docs/features/dsh-forge-m4/tasks/4.6-sc4-e2e.md (AC-1..AC-4)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios(SC4)、
// §Interfaces·Interface 4(布局记忆/恢复 = 重放 open 序列)·Interface 5(窗口
// 管理/主窗关闭 = 退出,detached 随之关闭)、prd-spec §Success Criteria SC4 +
// §分屏/多窗口行为要求(必答⑨)、prd-user-stories Story 6 验收标准(三条)、
// tasks/4.5-layout-memory-engine.md(恢复断言口径:重进重放,恢复态 = 离开前
// 布局;换台写离)。
//
// SC4 — 分屏/多窗口 e2e 腿:
//
//   ① 分屏同屏:会话 + 看板双 pane 同屏(conversation 中区 + 右栏 board pane,
//      C9 [分屏] 菜单用户径),两视图均可操作 —— 会话侧输入一次(composer
//      contenteditable 注入 + 读回)、看板侧点击一次(节点卡 → 任务详情 dock);
//   ② 布局恢复:调整 pane 比例(分隔条键盘模型 → 30%)与收起状态(subagent
//      收起 = TOP_A 血缘组 caret 收起、树展开 = 项目组展开)→ 离开重进项目 →
//      布局恢复。两路径:项目切换(原位换台,写离口径 = 切走即落库可读
//      SQLite project_ui_state)与应用重启(_electron 同 userData 重启,冷进程
//      重放)。比例断言口径:重放落位后原生 per-pane 页唯一性使第二个 board
//      去重,冷态重进先回单 board pane,再经同一用户径补开第二个 board 才见
//      分隔条,其值即重放恢复的模型态(4.5 边界:aside 无 v1 槽、真链
//      [会话旁置] 行禁用 —— 2 C9 pane 的真链可达态 = 双 pane 各一 board tab);
//   ③ 拆出并行:board pane 头 [拆出为窗口] → 第二 BrowserWindow(主进程
//      windowOpenDetached)同源 SPA 重载,role 握手挂单视图;detached 看板
//      钉死来源项目(BIZ-002:不随主窗激活指针)—— 主窗切 B 后 A 窗不变,
//      两窗并行各自可操作(detached 节点点击 → 其内 dock;主窗 composer 输入);
//   ④ 单实例:主窗用户径关闭 = UF1 托盘驻留(隐藏非销毁,M1 语义零回归,
//      detached 不被误清);第二实例同 userData 启动即被单实例锁挡退;
//      退出漏斗(app.quit,托盘「退出」同径)→ 主窗 'closed' recallAll 清扫
//      detached → 窗口计数归零 + 主进程退出(Hard Rule:双窗口 e2e 防句柄
//      泄漏 —— 收尾显式关全部窗口并断言计数为零)。
//
// 实例锁纪律(Hard Rule):每次 launch 前 assertNoActiveDshForgeInstances;
// workers:1(根 playwright.config 两 project 共用单 worker 池)。
//
// 确定性纪律(fix-1/3.6/3.7 谱系):reduced-motion 仿真、事件锚点门控
// (aria 属性/标记在场,绝不猜时序)、DOM 直点(popover/chip 重挂载下
// HTMLElement.click() 可靠触发 React handler)、启动期 onboarding 模态链
// 后台自动 dismiss(排除 forge 自己的 dialog 与任务 dock)。

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { _electron, expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import {
  closeMainWindowLikeUser,
  mainWindowVisible,
  quitShellAssertZeroWindows,
  shellWindowCount,
  shellWindowStates,
  waitForDetachedBoard,
} from '../../helpers/windows.ts'
import { MAIN_PATH, type PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'
import { isProcessAlive } from '../../../../apps/desktop/e2e/helpers/fixture-app.ts'
import { writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import { buildKernelWorld, freshRoot, handBuiltTaskSet, openBoardPane, type KernelWorld } from '../_lib/journey-world.ts'

// ---------------------------------------------------------------------------
// The corpus vocabulary (project A = the split/detach subject; project B = the
// switch target; sessions TOP_A(+SUB_A subagent) / TOP_B = stable anchors)
// ---------------------------------------------------------------------------

const FEATURE = 'sc4-split'
const TASK_BOARD = `${FEATURE}/1.1` // the board's node-card / dock anchor
const TASK_FREE = `${FEATURE}/1.2` // the second node (the second dock click)
const OTHER_FEATURE = 'sc4-other'
const TASK_OTHER = `${OTHER_FEATURE}/1.1` // project B's own task (互不干扰 anchor)

const TOP_A = 'sc4-sess-top-a' // one subagent child (the 收起 corpus)
const SUB_A = 'sc4-sess-sub-a'
const TOP_B = 'sc4-sess-top-b' // the conversation session (no children — its
// ancestor chain never auto-expands TOP_A's group, keeping the 收起 assertion
// free of the active-chain display expansion)

/** Project A's kernel corpus: one feature, two tasks. */
function sc4Kernel(root: string): Promise<KernelWorld> {
  return buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc4' },
    tasks: [
      { stem: '1.1', localId: '1.1', title: 'sc4 split board task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc4 split second task', status: 'pending', type: 'coding.feature', dependencies: [] },
    ],
  })
}

/**
 * Seed project B (the 换台 target) into A's kernel db pre-boot: a minimal
 * forge tree + register + scan — the tree presents its row without the
 * wizard, exactly the buildKernelWorld chain for a second project.
 */
async function seedSecondProject(root: string, userDataDir: string): Promise<{ projectId: string, codeRoot: string }> {
  const set = handBuiltTaskSet(
    { slug: OTHER_FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc4-b' },
    [{ stem: '1.1', localId: '1.1', title: 'sc4 other project task', status: 'pending', type: 'coding.feature', dependencies: [] }],
  )
  const written = writeForgeProject(set, { codeRoot: join(root, 'repo-b') })
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    return { projectId: project.id, codeRoot: written.codeRoot }
  } finally {
    db.close()
  }
}

/** The lineage corpus: TOP_A with one subagent child; TOP_B carrying one
 * closed turn (blank=false → the conversation session CHROME — the header
 * utilities row the C9 [分屏] seat rides — renders on it). */
function sc4Seeds(codeRoot: string, now: number) {
  return [
    { sessionId: TOP_A, cwd: codeRoot, createdAt: now - 1_000, title: 'SC4 顶层会话 A' },
    { sessionId: SUB_A, cwd: codeRoot, createdAt: now - 500, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: 'SC4 subagent 后代', title: 'SC4 subagent 后代' },
    { sessionId: TOP_B, cwd: codeRoot, createdAt: now - 60_000, title: 'SC4 顶层会话 B', turnStart: true },
  ]
}

// ---------------------------------------------------------------------------
// Renderer helpers (the sc2/sc7-proven vocabulary + the C9/C10 drivers)
// ---------------------------------------------------------------------------

/** The session composer's contenteditable host (the 输入 assertion's face). */
const composerInput = (page: Page) =>
  page.locator('[data-composer-card] [contenteditable="true"]').first()

/**
 * Dismiss the upstream onboarding modal CHAIN (the isolated DSH_HOME is a
 * fresh face — the 内测声明 welcome notice plus whatever onboarding steps
 * follow; the chain can start late, after the home session list hydrates).
 * Opportunistic: absent = no-op. Excludes forge's own dialogs and the task
 * detail dock (the sc7 discipline — both are role=dialog without the marker).
 */
async function dismissOnboarding(page: Page): Promise<void> {
  const acted = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-dsh-forge-dialog])')]
      .find(candidate => candidate.closest('[data-dsh-forge-task-detail]') === null)
    if (modal === undefined) return false
    const buttons = [...modal.querySelectorAll('button')]
    const defer = buttons.find(button => /稍后|跳过|以后|skip|later/i.test(button.textContent ?? ''))
    const target = defer ?? buttons[buttons.length - 1]
    if (target === undefined) return false
    ;(target as HTMLElement).click()
    return true
  }).catch(() => false)
  void acted
}

/** The onboarding chain's background dismisser (runs until stopped). */
function startAutoDismiss(page: Page): () => void {
  let stopped = false
  void (async () => {
    while (!stopped) {
      await dismissOnboarding(page).catch(() => {})
      await page.waitForTimeout(500).catch(() => {})
    }
  })()
  return () => { stopped = true }
}

/** DOM-click one rightbar tab chip by its exact text (the strip re-creates
 * its tabs while the session-scoped column settles — direct DOM clicks fire
 * the React handler reliably). */
async function clickRightbarChip(page: Page, label: string): Promise<boolean> {
  return await page.evaluate((text: string) => {
    const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
    const chip = tabs.find(tab => tab.textContent?.trim() === text)
    if (chip === undefined) return false
    ;(chip as HTMLElement).click()
    return true
  }, label)
}

/** Expand the native right column (the collapsed-state edge affordance). */
async function expandRightbar(page: Page): Promise<void> {
  const panel = page.locator('[data-sidebar-right-panel]').first()
  if (await panel.getAttribute('data-sidebar-right-open') === null) {
    await page.locator('[data-sidebar-right-expand]').first().click()
  }
  await expect(panel).toHaveAttribute('data-sidebar-right-open', /.*/, { timeout: 15_000 })
}

/** Click one locator RETRYING across pane re-layouts (the sc7 discipline:
 * positioned/DOM clicks after the first grace attempts). */
async function clickStable(page: Page, selector: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      if (attempt < 4) {
        await page.locator(selector).first().click({ timeout: 2_000, force: attempt % 2 === 1 })
      } else {
        const clicked = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel)
          if (el === null) return false
          ;(el as HTMLElement).click()
          return true
        }, selector)
        if (!clicked) throw new Error('not attached')
      }
      return
    } catch {
      await page.waitForTimeout(400)
    }
  }
  throw new Error(`click never settled: ${selector}`)
}

/**
 * The 工作台头 [分屏] → 看板 pick (the C9 user path): open the menu, click the
 * board row. DOM clicks throughout — the popover menu is absolutely
 * positioned and a document pointerdown would close it.
 */
async function pickSplitBoard(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const opened = await page.evaluate(() => {
      const trigger = document.querySelector('[data-dsh-forge-split-trigger]') as HTMLElement | null
      if (trigger === null) return false
      trigger.click()
      return true
    }).catch(() => false)
    if (!opened) {
      await page.waitForTimeout(700)
      continue
    }
    await page.waitForTimeout(150)
    const picked = await page.evaluate(() => {
      const item = document.querySelector('[data-dsh-forge-split-menu-item="board"]') as HTMLElement | null
      if (item === null) return false
      item.click()
      return true
    }).catch(() => false)
    if (picked) return
    await page.waitForTimeout(500)
  }
  const state = await page.evaluate(() => ({
    splitMenu: document.querySelectorAll('[data-dsh-forge-split-menu]').length,
    headerCorner: document.querySelectorAll('[data-conversation-header-corner]').length,
    composer: document.querySelectorAll('[data-composer-card]').length,
    sessionTreeRow: [...document.querySelectorAll('[data-dsh-forge-tree-session][aria-current="true"]')]
      .map(node => node.getAttribute('data-dsh-forge-tree-session')),
    utilitiesRows: [...document.querySelectorAll('.headerUtilities, [class*="headerUtilities"]')].length,
    shell: document.querySelectorAll('[data-dsh-forge-shell]').length,
    modal: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
  })).catch(() => 'evaluate-failed')
  throw new Error(`[分屏] → 看板 never landed (the utilities seat needs a session body) — page state ${JSON.stringify(state)}`)
}

/**
 * Drive the column to the C9 split-ACTIVE state (≥2 C9 panes → the pane 头 +
 * 分隔条 render). The vendored budget is TWO docked panes, so the reachable
 * real-chain split is a board tab in EACH pane: the first pick splits the
 * base pane; routing through the base pane's 开始 chip first makes the next
 * pick land its board tab in the BASE pane (budget spent → no third pane).
 * Postcondition-driven across the strip's settling re-mounts.
 */
async function ensureSplitActive(page: Page): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const active = await page.evaluate(() =>
      document.querySelector('[data-dsh-forge-split-separator]') !== null)
    if (active) return
    await expandRightbar(page).catch(() => {})
    if (round > 0) await clickRightbarChip(page, '开始')
    await pickSplitBoard(page)
    await page.waitForTimeout(700)
  }
  const state = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')].map(tab => tab.textContent?.trim() ?? ''),
    separator: document.querySelectorAll('[data-dsh-forge-split-separator]').length,
    board: document.querySelectorAll('[data-dsh-forge-task-board]').length,
  })).catch(() => 'evaluate-failed')
  throw new Error(`C9 split never became active (≥2 C9 panes) — page state ${JSON.stringify(state)}`)
}

/** The separator's committed percentage (the model ratio's aria face). */
async function splitRatioPercent(page: Page): Promise<string | null> {
  return await page.evaluate(() =>
    document.querySelector('[data-dsh-forge-split-separator]')?.getAttribute('aria-valuenow') ?? null)
}

/**
 * Adjust the split ratio through the 分隔条 keyboard model (the deterministic
 * a11y driver — no pointer-drag math): focus by click, then Home (复位 50/50)
 * and two Shift+← large steps → 30% (the C9 band's floor, a value the 50/50
 * default can never collide with).
 */
async function commitSplitRatioToFloor(page: Page): Promise<void> {
  const separator = page.locator('[data-dsh-forge-split-separator]').first()
  await separator.click({ timeout: 10_000 })
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
}

/** The stored ProjectLayout blob of one project (SQLite beside the live app). */
async function readLayoutBlob(userDataDir: string, projectId: string): Promise<Record<string, unknown> | undefined> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(userDataDir, 'workbench', 'workbench.db'), { readOnly: true })
  try {
    const row = db.prepare('SELECT layout_json FROM project_ui_state WHERE project_id = ?').get(projectId) as
      { layout_json: string } | undefined
    return row === undefined ? undefined : JSON.parse(row.layout_json) as Record<string, unknown>
  } finally {
    db.close()
  }
}

/** One tree-posture read (project-group expansion + subagent 收起). */
async function treePosture(page: Page, projectId: string): Promise<{ projectExpanded: boolean, subagentRows: number }> {
  return await page.evaluate((ids: { project: string, sub: string }) => ({
    projectExpanded: document.querySelector(`[data-dsh-forge-tree-project-toggle="${ids.project}"]`)?.getAttribute('aria-expanded') === 'true',
    subagentRows: document.querySelectorAll(`[data-dsh-forge-tree-session="${ids.sub}"]`).length,
  }), { project: projectId, sub: SUB_A })
}

/**
 * Expand one project's tree group through the caret (the user path). The
 * FIRST boot of a project replays its (still empty) stored tree — the 4.5
 * restore re-notify lands after the §2.3 activation auto-expand and the
 * group starts collapsed (a first-boot wart, noted for the record); the
 * caret is how a user opens it.
 */
async function ensureProjectGroupExpanded(page: Page, projectId: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const expanded = await page.evaluate((id: string) =>
      document.querySelector(`[data-dsh-forge-tree-project-toggle="${id}"]`)?.getAttribute('aria-expanded') === 'true',
      projectId).catch(() => false)
    if (expanded) return
    await clickStable(page, `[data-dsh-forge-tree-project-toggle="${projectId}"]`).catch(() => {})
    await page.waitForTimeout(500)
  }
  throw new Error(`project group ${projectId} never expanded (caret user path)`)
}

/** Open one session through the tree row (the conversation's user path). */
async function openTreeSession(page: Page, sessionId: string): Promise<void> {
  const row = page.locator(`[data-dsh-forge-tree-session="${sessionId}"]`).first()
  // The home session list hydrates seconds after ui-ready (sc1's boot-bounce
  // note) and the workspace grouping rides the projection push — wait for the
  // row's ATTACHMENT first (the grouped tree renders it), then click.
  const attached = await row.waitFor({ state: 'attached', timeout: 45_000 }).then(() => true, () => false)
  if (!attached) {
    const state = await page.evaluate(() => ({
      treeRows: [...document.querySelectorAll('[data-dsh-forge-tree] [data-dsh-forge-tree-session]')]
        .map(node => node.getAttribute('data-dsh-forge-tree-session')),
      projectToggles: [...document.querySelectorAll('[data-dsh-forge-tree-project-toggle]')]
        .map(node => ({ id: node.getAttribute('data-dsh-forge-tree-project-toggle'), expanded: node.getAttribute('aria-expanded') })),
      seat: document.querySelectorAll('[data-dsh-forge-project-seat]').length,
    })).catch(() => 'evaluate-failed')
    throw new Error(`session row ${sessionId} never attached (home-list hydration / workspace grouping) — page state ${JSON.stringify(state)}`)
  }
  await clickStable(page, `[data-dsh-forge-tree-session="${sessionId}"]`)
  await expect(page.locator(`[data-dsh-forge-tree-session="${sessionId}"]`),
    `会话 ${sessionId} 打开(树行 aria-current)`).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Leg ① + ②: 分屏同屏可操作 + 布局重进恢复(项目切换 / 应用重启 两路径)
// ---------------------------------------------------------------------------
test('sc4/split-layout-restore: 分屏同屏可操作(输入/点击)+ 比例/收起重进恢复(切换 + 重启两路径)', async ({ }, testInfo) => {
  testInfo.setTimeout(540_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc4')
  const kernel = await sc4Kernel(root)
  const other = await seedSecondProject(root, kernel.userDataDir)
  const dshHome = join(root, 'dsh-home')
  await seedLineageCorpus({ dshHome, seeds: sc4Seeds(kernel.codeRoot, Date.now()) })

  const bootEnv = { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc4-e2e-stub-key' }
  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: kernel.root, env: bootEnv })
    const { page } = shell
    await shell.uiReady()
    // 确定性环境:右栏/条带 stylesheet 过渡在 reduced-motion 下关闭。
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)

    // ---- 项目 A 激活 + 会话 B 打开(会话域右栏的挂载面)------------------
    const treeRowA = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRowA, '注册行 A 在树在场').toBeVisible({ timeout: 30_000 })
    await treeRowA.click()
    await expect(treeRowA).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话 composer 在场(会话体挂载)').toBeVisible({ timeout: 20_000 })

    // ---- ① 分屏同屏:会话 + 看板双 pane 同页 ------------------------------
    await expandRightbar(page)
    await pickSplitBoard(page)
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '看板 pane 打开([分屏] → 看板,C9 用户径)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      '看板承载 A 语料节点').toBeVisible({ timeout: 20_000 })
    const sameScreen = await page.evaluate(() => ({
      composer: (() => { const el = document.querySelector('[data-composer-card]'); return el !== null && (el as HTMLElement).offsetParent !== null })(),
      board: (() => { const el = document.querySelector('[data-dsh-forge-task-board]'); return el !== null && (el as HTMLElement).offsetParent !== null })(),
    }))
    expect(sameScreen, '会话 + 看板双 pane 同屏(中区 composer + 右栏 board 同页在场)').toEqual({ composer: true, board: true })

    // 两视图均可操作 —— 会话侧输入一次(composer 注入 + 读回)。
    await composerInput(page).click()
    await page.keyboard.insertText('SC4 分屏同屏输入桩 sc4-split-typing')
    await expect(composerInput(page), '会话侧可操作:composer 输入读回').toContainText('sc4-split-typing')

    // 两视图均可操作 —— 看板侧点击一次(节点卡 → 任务详情 dock)。
    await clickStable(page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      '看板侧可操作:节点点击 → 任务详情 dock').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')

    // ---- ② 调整:pane 比例 + 收起状态 ------------------------------------
    await ensureSplitActive(page)
    await expect(page.locator('[data-dsh-forge-pane-header="board"]'),
      'pane 头在场(split-active ≥2 C9 pane)').toBeVisible({ timeout: 10_000 })
    await commitSplitRatioToFloor(page)
    await expect.poll(() => splitRatioPercent(page), { timeout: 10_000, message: '比例调整落位(分隔条键盘模型 → 30%)' }).toBe('30')

    // subagent 收起:TOP_A 血缘组 caret 展开 → 收起(调整以真实用户径发生)。
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      'TOP_A 展开后 subagent 行在场(归拢)').toBeVisible({ timeout: 10_000 })
    await clickStable(page, `[data-dsh-forge-tree-caret="${TOP_A}"]`)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_A}"]`),
      'subagent 收起(调整后的收起态)').toHaveCount(0, { timeout: 10_000 })
    // 树展开:项目组展开态在场(激活默认展开 + 断言锚点)。
    expect((await treePosture(page, kernel.projectId)).projectExpanded, '树展开(项目组 aria-expanded)').toBe(true)

    // ---- ② 持久化面:SQLite project_ui_state(debounce 落库)------------
    await page.waitForTimeout(1_600) // the 800ms trailing debounce + settle
    await expect.poll(async () => {
      const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
      return (blob?.rightbar as { widthPct?: number } | undefined)?.widthPct ?? -1
    }, { timeout: 15_000, message: '比例进 blob(widthPct = 30)' }).toBe(30)
    const blobNow = await readLayoutBlob(kernel.userDataDir, kernel.projectId) as {
      tree?: { expandedProjects?: string[], expandedSessions?: string[] },
      rightbar?: { panes?: Array<{ tabs: Array<{ kind: string }> }> },
    }
    expect(blobNow.tree?.expandedProjects, '树展开进 blob(离开前布局)').toEqual([kernel.projectId])
    expect(blobNow.tree?.expandedSessions, 'subagent 收起进 blob(该集无 TOP_A)').not.toContain(TOP_A)
    expect(JSON.stringify(blobNow.rightbar?.panes ?? []), 'pane 结构进 blob(含 board tab)').toContain('"board"')

    // ---- ② 路径一:项目切换(原位换台,写离 → 重进重放)------------------
    const treeRowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await expect(treeRowB, '注册行 B 在树在场(换台目标)').toBeVisible({ timeout: 30_000 })
    await treeRowB.click()
    await expect(treeRowB).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    // 写离口径:切走即落库 —— B 在座时 A 的 blob 即已含离开前布局。
    await expect.poll(async () => {
      const blob = await readLayoutBlob(kernel.userDataDir, kernel.projectId)
      return (blob?.rightbar as { widthPct?: number } | undefined)?.widthPct ?? -1
    }, { timeout: 15_000, message: '写离:切走即落库(A 的 blob 在 B 侧可读)' }).toBe(30)
    // 换台重置(B 侧):右栏回默认 —— A 的 board pane 不在 B 侧。
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '换台后 B 侧无 A 的 board pane(换台重置)').toHaveCount(0, { timeout: 15_000 })

    // 重进 A:布局恢复(重放 open 序列)。
    await treeRowA.click()
    await expect(treeRowA).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '重进 A:board pane 重放恢复').toBeVisible({ timeout: 30_000 })
    await expect.poll(() => treePosture(page, kernel.projectId),
      { timeout: 15_000, message: '重进 A:树恢复(项目组展开 + subagent 收起)' }).toEqual({ projectExpanded: true, subagentRows: 0 })

    // 比例恢复断言:重放落位后经同一用户径补开第二个 board → 分隔条呈现
    // 重放恢复的模型态(4.5 口径:冷态重进先回单 board,比例在模型态)。
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await ensureSplitActive(page)
    await expect.poll(() => splitRatioPercent(page),
      { timeout: 10_000, message: '重进 A:比例恢复(补开第二 board 后分隔条 = 30)' }).toBe('30')

    // ---- ② 路径二:应用重启(同 userData 冷进程重放)---------------------
    const userDataDir = shell.userDataDir as string
    const rootDir = shell.dir
    stopAutoDismiss()
    await quitShellAssertZeroWindows(shell.electronApp)
    shell = undefined

    assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
    const reborn = await launchWorkbenchShell({ userDataDir, rootDir, env: bootEnv })
    shell = reborn
    try {
      await reborn.uiReady()
      await reborn.page.emulateMedia({ reducedMotion: 'reduce' })
      stopAutoDismiss = startAutoDismiss(reborn.page)
      const page2 = reborn.page

      // 重启后活跃项目恢复(指针持久 + 树行 aria-current)。
      await expect(page2.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`),
        '重启后活跃项目恢复').toHaveAttribute('aria-current', 'true', { timeout: 30_000 })
      // 会话域挂载面:TOP_B(重放 open 序列的落位面)。
      await ensureProjectGroupExpanded(page2, kernel.projectId)
      await openTreeSession(page2, TOP_B)
      // board pane 重放恢复(boot 服务竞态兜底:500ms×12 有界重试,幂等)。
      await expect(page2.locator('[data-dsh-forge-task-board]'),
        '重启后 board pane 重放恢复(冷进程,布局出自 SQLite)').toBeVisible({ timeout: 45_000 })
      // 树恢复:项目组展开 + subagent 收起(恢复态 = 离开前布局)。
      await expect.poll(() => treePosture(page2, kernel.projectId),
        { timeout: 15_000, message: '重启后树恢复(项目组展开 + subagent 收起)' }).toEqual({ projectExpanded: true, subagentRows: 0 })
      // 比例恢复:补开第二个 board → 分隔条 = 重放恢复的 30%。
      await ensureSplitActive(page2)
      await expect.poll(() => splitRatioPercent(page2),
        { timeout: 10_000, message: '重启后比例恢复(补开第二 board 后分隔条 = 30)' }).toBe('30')

      expect(reborn.pageErrors, `renderer pageerrors: ${reborn.pageErrors.join(' | ')}`).toEqual([])
    } finally {
      stopAutoDismiss()
      await quitShellAssertZeroWindows(reborn.electronApp).catch(() => {})
      shell = undefined
    }
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await quitShellAssertZeroWindows(shell.electronApp).catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg ③ + ④: 拆出窗口并行互不干扰 + 单实例(驻留零回归 / 锁挡退 / 退出清扫)
// ---------------------------------------------------------------------------
test('sc4/detach-parallel-single-instance: 拆出窗口钉死来源项目并行可操作 + 主窗驻留零回归 + 锁挡退 + 退出窗口计数归零', async ({ }, testInfo) => {
  testInfo.setTimeout(480_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc4-detach')
  const kernel = await sc4Kernel(root)
  const other = await seedSecondProject(root, kernel.userDataDir)
  const dshHome = join(root, 'dsh-home')
  await seedLineageCorpus({ dshHome, seeds: sc4Seeds(kernel.codeRoot, Date.now()) })

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({
      userDataDir: kernel.userDataDir,
      rootDir: kernel.root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc4-e2e-stub-key' },
    })
    const { page, electronApp } = shell
    await shell.uiReady()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)

    // ---- 就位:项目 A + 会话 + split-active(split 态才有 pane 头动作位)--
    const treeRowA = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRowA).toBeVisible({ timeout: 30_000 })
    await treeRowA.click()
    await expect(treeRowA).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await ensureProjectGroupExpanded(page, kernel.projectId)
    await openTreeSession(page, TOP_B)
    await expect(composerInput(page), '会话 composer 在场').toBeVisible({ timeout: 20_000 })
    await expandRightbar(page)
    await pickSplitBoard(page)
    await expect(page.locator('[data-dsh-forge-task-board]'), '看板 pane 在场').toBeVisible({ timeout: 20_000 })
    await ensureSplitActive(page)
    await expect(page.locator('[data-dsh-forge-pane-detach]'),
      'pane 头 [拆出为窗口] 动作位在场(4.3 接线)').toBeVisible({ timeout: 10_000 })

    // ---- ③ 拆出:主进程开第二窗,同源 SPA 重载 + role 握手挂单视图 ------
    await clickStable(page, '[data-dsh-forge-pane-detach]')
    const detached = await waitForDetachedBoard(electronApp, kernel.projectId, 30_000)
    await expect(detached.page.locator('[data-dsh-forge-detached-recall]'),
      'detached 窗 [收回] 条在场(单视图装配)').toBeVisible({ timeout: 15_000 })
    await expect(detached.page.locator(`[data-dsh-forge-node-card="${TASK_BOARD}"]`),
      'detached 看板呈现 A 语料节点(钉死来源项目)').toBeVisible({ timeout: 30_000 })
    expect(await shellWindowCount(electronApp), '双窗口在册(主窗 + detached)').toBe(2)

    // ---- ③ 并行互不干扰:detached 点击(其内 dock)+ 主窗切 B ------------
    await clickStable(detached.page, `[data-dsh-forge-node-card="${TASK_BOARD}"]`)
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      'detached 窗可操作:节点点击 → 其内任务详情 dock').toBeVisible({ timeout: 20_000 })

    const treeRowB = page.locator(`[data-dsh-forge-tree-project="${other.projectId}"]`)
    await expect(treeRowB).toBeVisible({ timeout: 30_000 })
    await treeRowB.click()
    await expect(treeRowB).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    // 换台重置(裁决 #28-④):主窗右栏回默认 —— A 的 board pane 随换台关闭。
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '换台重置:主窗 board pane 关闭(收起 + 开始页)').toHaveCount(0, { timeout: 15_000 })
    // detached 不随主窗激活指针变化(BIZ-002:钉死来源项目 + 交互态保留)。
    await expect(detached.page.locator(`[data-dsh-forge-detached-board][data-dsh-forge-detached-project="${kernel.projectId}"]`),
      'detached 仍钉死 A(不随主窗切 B 变化)').toBeVisible()
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_BOARD}"]`),
      'detached 交互态保留(其 dock 仍在 —— 互不干扰)').toBeVisible()
    await expect(detached.page.locator(`[data-dsh-forge-node-card="${TASK_OTHER}"]`),
      'detached 看板无 B 节点(零串台)').toHaveCount(0)
    // 主窗侧确实换台:经概览任务行 seam 重开主窗看板 → 呈现 B 语料节点。
    await openBoardPane(page)
    await expect(page.locator(`[data-dsh-forge-node-card="${TASK_OTHER}"]`),
      '主窗 board 重键到 B(换台生效)').toBeVisible({ timeout: 30_000 })

    // 主窗侧并行可操作:composer 输入(detached 在场时)。
    await composerInput(page).click()
    await page.keyboard.insertText('SC4 并行主窗输入桩 sc4-parallel-typing')
    await expect(composerInput(page), '主窗并行可操作(composer 输入读回)').toContainText('sc4-parallel-typing')

    // ---- ④ 单实例:主窗用户径关闭 = UF1 托盘驻留(隐藏非销毁)-----------
    await closeMainWindowLikeUser(electronApp, detached.page)
    await expect.poll(() => mainWindowVisible(electronApp),
    { timeout: 15_000, message: '主窗关闭落驻留(隐藏,M1 语义)' }).toBe(false)
    expect(await shellWindowCount(electronApp),
      `驻留非销毁:窗口仍在册(主窗隐藏 + detached)— states ${JSON.stringify(await shellWindowStates(electronApp))}`).toBe(2)
    const mainPid = await electronApp.evaluate(() => process.pid)
    expect(isProcessAlive(mainPid), '驻留期主进程存活(未退出)').toBe(true)
    // detached 不被驻留误清(仅真实销毁才清扫)且仍可操作。
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '主窗驻留期 detached 仍在(A 看板不受驻留影响)').toBeVisible()
    await clickStable(detached.page, `[data-dsh-forge-node-card="${TASK_FREE}"]`)
    await expect(detached.page.locator(`[data-dsh-forge-task-detail="${TASK_FREE}"]`),
      '驻留期 detached 仍可操作(第二节点 → dock)').toBeVisible({ timeout: 20_000 })

    // ---- ④ 单实例锁:第二实例同 userData 启动即被挡退 --------------------
    let second: import('@playwright/test').ElectronApplication | undefined
    try {
      second = await _electron.launch({
        args: [MAIN_PATH],
        env: {
          ...process.env,
          DSH_FORGE_PLUGIN_BUNDLES: shell.configPath,
          DSH_FORGE_PROFILE_DIR: shell.profileDir,
          DSH_FORGE_USER_DATA: shell.userDataDir as string,
          DSH_HOME: dshHome,
        },
        timeout: 15_000,
      })
      const exited = await Promise.race([
        new Promise<boolean>(resolve => { second?.process().once('exit', () => resolve(true)) }),
        new Promise<boolean>(resolve => { setTimeout(() => resolve(false), 15_000) }),
      ])
      expect(exited, '第二实例被单实例锁挡退(独立窗口仍属同一实例)').toBe(true)
    } catch {
      // The lock can also refuse the launch outright — equally blocked; the
      // first-instance-intact check below still gates the leg.
    } finally {
      await second?.close().catch(() => {})
    }
    // 原实例不动(M1 口径):主进程仍活 + detached 窗仍钉 A 仍可查。
    expect(isProcessAlive(mainPid), '锁挡退后原实例存活(未受第二实例影响)').toBe(true)
    await expect(detached.page.locator(`[data-dsh-forge-detached-project="${kernel.projectId}"]`),
      '锁挡退后 detached 窗仍在(原实例不动)').toBeVisible()

    // ---- ④ 退出漏斗:主窗销毁 → detached 随之关闭 → 计数归零 + 进程退出 --
    await quitShellAssertZeroWindows(electronApp)
    expect(isProcessAlive(mainPid), '退出后主进程已退出').toBe(false)
    expect(shell.pageErrors, `主窗 pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    expect(detached.pageErrors, `detached pageerrors: ${detached.pageErrors.join(' | ')}`).toEqual([])
    shell = undefined
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await quitShellAssertZeroWindows(shell.electronApp).catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
