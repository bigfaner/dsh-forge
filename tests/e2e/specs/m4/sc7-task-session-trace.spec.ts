// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc7
// Traceability: docs/features/dsh-forge-m4/tasks/2.9-sc7-e2e-subagent-stub.md
// Authorities: tech-design §Testing Strategy·Key Test Scenarios(SC7 + stub
// 扩展 + 实例锁纪律)、§Interfaces·Interface 3/6/7、prd-spec §Success Criteria
// SC7 + §subagent 归拢与反查机制(PRD 必答⑥/⑦)、ui-design §Component C5
// States + §Component C6(bound/ambiguous/unbound)、BIZ-workbench-007/008.
//
// SC7 — 任务↔会话反查(血缘语料 = stub 协议扩展):
//
//   语料     subagent 血缘语料经 stub 协议扩展注入(tests/e2e/stubs/
//            lineage-corpus.ts):`parentSession`/`origin` 头 + subagent/
//            descriptor(mode+label)+ session/title(手工改名桩)落 REAL
//            session-persistence backend(zstd 缺省口径),host child 以真核心
//            消费(会话列表 byId/parentSessionId/origin + workspaceRegistry
//            bootstrap 归组 + subagentsByParent catalog);journal `session-
//            seeded` 行 ↔ 二次 backend 读回的头 ↔ UI 行三方对拍。
//   ①挂接历史 任务详情呈现 active/ended 行(新→旧);行展开血缘后代;
//            [打开] 双通道(顶层 sessionId / 后代 SubagentAddress)。
//   ②标识     执行 subagent 在任务维度可标识(命名 + 血缘)。
//   ③打开     任务 → 顶层与 subagent 会话打开 ≤1 次点击(e2e 断言)。
//   ④归拢     subagent 会话不出现在项目会话列表顶层、归拢于 parent 血缘
//            树下且默认收起(C3 树断言)。
//   ⑤C6       subagent 会话视图任务元数据条(bound)+ 点击回任务详情(双向)。
//   ⑥命名     命名遵循率固定桩(桩会话名断言:descriptor label = 「任务 id +
//            title」;派发 prompt 命名行在场 —— Interface 7)。
//   ⑦冲突     手工改名桩(命名与血缘冲突)→ 展示以血缘为准(Hard Rule)。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { createDispatchStub } from '../../stubs/dispatch.ts'
import {
  MANY_DESCENDANT_COUNT, namingCompliantName, readCorpusSession, seedLineageCorpus,
} from '../../stubs/lineage-corpus.ts'
import { verifyPromptInjection } from '../../stubs/oracle.ts'
import {
  bridgeInvoke, buildKernelWorld, dispatchFromBoard, freshRoot, getDispatchRows,
  openKernelDb, recomputePresynth, waitForPromptRow,
  type DispatchRowView, type KernelWorld,
} from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The corpus vocabulary (feature/tasks + sessions — ids are stable anchors)
// ---------------------------------------------------------------------------

const FEATURE = 'sc7-trace'
const TASK_LINEAGE = `${FEATURE}/2.1` // active link → top A (the SC7 main task)
const TASK_ENDED = `${FEATURE}/2.2` // ended links → M (查看全部 corpus) + B
const TASK_DISPATCH = `${FEATURE}/3.1` // the dispatch leg (naming line + oracle)
const TITLE_LINEAGE = 'sc7 trace lineage task'
const TITLE_ENDED = 'sc7 trace ended task'
const TITLE_DISPATCH = 'sc7 trace dispatch task'

const TOP_A = 'sc7-sess-top-a'
const TOP_B = 'sc7-sess-top-b'
const TOP_M = 'sc7-sess-top-many'
const SUB_OK = 'sc7-sess-sub-ok' // compliant naming (continuable)
const SUB_NESTED = 'sc7-sess-sub-nested' // depth-2 child of SUB_OK (one-shot)
const SUB_RENAMED = 'sc7-sess-sub-renamed' // manual rename stub (conflict corpus)
const SUB_B = 'sc7-sess-sub-b'
const RENAME_STUB = '手工改名桩 sc7 renamed stub'

/** The SC7 kernel corpus: one feature, three tasks (in_progress ×2 + pending). */
function sc7Kernel(root: string): Promise<KernelWorld> {
  return buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc7' },
    tasks: [
      { stem: '2.1', localId: '2.1', title: TITLE_LINEAGE, status: 'in_progress', type: 'coding.feature', dependencies: [] },
      { stem: '2.2', localId: '2.2', title: TITLE_ENDED, status: 'in_progress', type: 'coding.feature', dependencies: [] },
      { stem: '3.1', localId: '3.1', title: TITLE_DISPATCH, status: 'pending', type: 'coding.feature', dependencies: [] },
    ],
  })
}

/**
 * The lineage corpus (pre-boot, through the REAL persistence backend):
 * A (2.1's active top) with three descendants — compliant / renamed-conflict /
 * nested depth-2; B (ended link, one child); M with 24 children (查看全部).
 */
function sc7Seeds(codeRoot: string, now: number) {
  const compliant = namingCompliantName(TASK_LINEAGE, TITLE_LINEAGE)
  const seeds = [
    { sessionId: TOP_A, cwd: codeRoot, createdAt: now - 1_000, title: 'SC7 顶层会话 A' },
    // 命名遵循桩:descriptor label 与 durable title 双写一致(「任务 id + title」
    // —— 冷会话的名字经 projection 缓存面流列表,catalog label 面随 open 加载)。
    { sessionId: SUB_OK, cwd: codeRoot, createdAt: now - 500, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: compliant, title: compliant },
    { sessionId: SUB_NESTED, cwd: codeRoot, createdAt: now - 400, parentSession: SUB_OK, origin: 'subagent' as const, mode: 'one-shot' as const, label: compliant, title: compliant },
    { sessionId: SUB_RENAMED, cwd: codeRoot, createdAt: now - 300, parentSession: TOP_A, origin: 'subagent' as const, mode: 'continuable' as const, label: compliant, title: RENAME_STUB },
    { sessionId: TOP_B, cwd: codeRoot, createdAt: now - 60_000, title: 'SC7 顶层会话 B' },
    { sessionId: SUB_B, cwd: codeRoot, createdAt: now - 59_000, parentSession: TOP_B, origin: 'subagent' as const, mode: 'one-shot' as const, label: namingCompliantName(TASK_ENDED, TITLE_ENDED), title: namingCompliantName(TASK_ENDED, TITLE_ENDED) },
    { sessionId: TOP_M, cwd: codeRoot, createdAt: now - 120_000, title: 'SC7 查看全部语料 M' },
  ]
  for (let index = 0; index < MANY_DESCENDANT_COUNT; index += 1) {
    seeds.push({
      sessionId: `sc7-sess-many-${String(index).padStart(2, '0')}`,
      cwd: codeRoot,
      createdAt: now - 119_000 + index,
      parentSession: TOP_M,
      origin: 'subagent' as const,
      mode: 'one-shot' as const,
      label: `${namingCompliantName(TASK_ENDED, TITLE_ENDED)} #${String(index)}`,
    })
  }
  return seeds
}

// ---------------------------------------------------------------------------
// Renderer + rightbar helpers
// ---------------------------------------------------------------------------

/**
 * Dismiss the upstream onboarding modal CHAIN (the isolated DSH_HOME is a
 * fresh face — the 内测声明 welcome notice plus whatever onboarding steps
 * follow it; each completes into the NEXT a tick later, and the chain can
 * start late, after the home session list hydrates). Opportunistic: absent =
 * no-op.
 */
async function dismissOnboarding(page: Page): Promise<void> {
  // UPSTREAM onboarding modals only. Two exclusions, both load-bearing:
  // · the forge M3 DialogFrame dialogs (`data-dsh-forge-dialog` — the dispatch
  //   chain's own drivers click them);
  // · the task DETAIL DOCK — it, too, is role=dialog aria-modal=true (the UF3
  //   non-modal focus contract) WITHOUT data-dsh-forge-dialog, so an
  //   unfiltered query matches it and the dismisser would click its LAST
  //   button (an expanded 挂接历史 row's [打开]!) on every 500ms tick —
  //   randomly switching sessions and unmounting the dock (the fix-1 ledger's
  //   whole "行展开 aria 复位 / 元素 detached" flake family).
  // The dismissal itself is a DIRECT DOM click: a Playwright click's
  // pointerdown would land OUTSIDE the task dock and fire its outside-close
  // arbitration; HTMLElement.click() fires the same React handler with no
  // pointerdown at all.
  const acted = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-dsh-forge-dialog])')]
      .find(candidate => candidate.closest('[data-dsh-forge-task-detail]') === null)
    if (modal === undefined) return false
    const buttons = [...modal.querySelectorAll('button')]
    // Prefer the DEFER/skip affordance (the API-key step's 保存并继续 with an
    // empty key refuses to advance); fall back to the chain's primary button.
    const defer = buttons.find(button => /稍后|跳过|以后|skip|later/i.test(button.textContent ?? ''))
    const target = defer ?? buttons[buttons.length - 1]
    if (target === undefined) return false
    ;(target as HTMLElement).click()
    return true
  }).catch(() => false)
  void acted
}

/**
 * The onboarding chain's arrival time VARIES (welcome at boot; the API-key
 * step seconds later on the models mirror) — a point-in-time settle always
 * races it. This background loop keeps dismissing upstream modals until the
 * caller stops it (the dispatch leg stops it: its own dialogs are forge's).
 */
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

/** Click one locator RETRYING across pane re-layouts (the dock's row tail can
 * sit in a scroll-bouncing region — the normal actionability loop never
 * settles; the dock DOM itself is near-static, so a positioned click after
 * the first grace attempts is safe). */
async function clickStable(page: Page, selector: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      if (attempt < 4) {
        await page.locator(selector).first().click({ timeout: 2_000, force: attempt % 2 === 1 })
      } else {
        // The session-scoped right column can re-create its strip faster than
        // the actionability loop settles — a direct DOM click on the live
        // element fires the same React handler.
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
  // Diagnostics on give-up (the flake ledger's blind spot): what the dock /
  // modal / strip faces looked like when the click exhausted its retries.
  const state = await page.evaluate((sel: string) => ({
    target: document.querySelectorAll(sel).length,
    dock: document.querySelectorAll('[data-dsh-forge-task-detail]').length,
    dockTask: document.querySelector('[data-dsh-forge-task-detail]')?.getAttribute('data-dsh-forge-task-detail') ?? null,
    panelExists: document.querySelectorAll('[data-sidebar-right-panel]').length,
    panelOpen: document.querySelector('[data-sidebar-right-panel]')?.hasAttribute('data-sidebar-right-open') ?? false,
    expandBtn: document.querySelectorAll('[data-sidebar-right-expand]').length,
    currentTreeRow: document.querySelector('[data-dsh-forge-tree-session][aria-current="true"]')?.getAttribute('data-dsh-forge-tree-session') ?? null,
    stripChips: [...document.querySelectorAll('[data-sidebar-right-panel] [data-dockkit-strip] [role="tab"]')].map(tab => tab.textContent?.trim() ?? ''),
    modal: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
  }), selector).catch(() => 'evaluate-failed')
  throw new Error(`click never settled: ${selector} — page state ${JSON.stringify(state)}`)
}

/** Click one dock control whose SUCCESS UNMOUNTS IT — the session-open [打开]
 * rows: the open switches the conversation, the 会话域 right column rebinds to
 * the new session's fresh collapsed surface, and the whole dock (this button
 * included) goes with the old session's layout. Playwright's actionability can
 * watch the element vanish mid-gesture and report a LANDED click as a failure,
 * and every later retry finds the element gone — so success is decided by the
 * POSTCONDITION predicate (`landed`), never by the target's survival. */
async function clickSelfUnmounting(page: Page, selector: string, landed: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (await landed().catch(() => false)) return
    try {
      if (attempt % 2 === 0) {
        await page.locator(selector).first().click({ timeout: 2_000 })
      } else {
        const clicked = await page.evaluate((sel: string) => {
          const el = document.querySelector(sel)
          if (el === null) return false
          ;(el as HTMLElement).click()
          return true
        }, selector)
        if (!clicked) throw new Error('not attached')
      }
      // A dispatched click does not prove the postcondition yet (the session
      // switch is async) — fall through and let `landed` decide.
    } catch {
      // The click may have already landed and unmounted the target — the
      // postcondition check at the loop head is the arbiter.
    }
    await page.waitForTimeout(400)
  }
  if (await landed().catch(() => false)) return
  throw new Error(`self-unmounting click never landed: ${selector}`)
}

/** The session-open landed signal: the rebound right column presents the NEW
 * session's fresh surface — the panel exists but stands collapsed (the dock
 * that hosted the clicked [打开] is gone with the old session's layout). */
function sessionOpenLanded(page: Page): () => Promise<boolean> {
  return async () => await page.evaluate(() => {
    const panel = document.querySelector('[data-sidebar-right-panel]')
    return panel !== null && !panel.hasAttribute('data-sidebar-right-open')
  }).catch(() => false)
}

/** DOM-click one rightbar tab chip by its exact text (the strip re-creates
 * its tabs while the session-scoped column settles — direct DOM clicks on the
 * live element fire the React handler reliably). */
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

/**
 * Bring the 项目概览 tasks pane forward over the session-scoped right column
 * whose re-entry surface VARIES after view/session switches (the chip, the
 * fresh-scope door card, or neither mid-transition). Strategies loop until
 * one lands; all clicks go through the live DOM (the strip re-creates its
 * tabs faster than the actionability loop settles).
 */
async function focusOverviewTasks(page: Page): Promise<void> {
  await expandRightbar(page)
  for (let round = 0; round < 10; round += 1) {
    const overviewLive = await page.evaluate(() => {
      const overview = document.querySelector('[data-dsh-forge-overview]')
      return overview !== null && (overview as HTMLElement).offsetParent !== null
    })
    if (overviewLive) break
    const acted = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
      const chip = tabs.find(tab => tab.textContent?.trim() === '项目概览')
      if (chip !== undefined) {
        ;(chip as HTMLElement).click()
        return 'chip'
      }
      const card = document.querySelector('[data-dsh-forge-guide-card="overview"]')
      if (card !== null) {
        ;(card as HTMLElement).click()
        return 'card'
      }
      return null
    })
    void acted
    await page.waitForTimeout(700)
  }
  await expect(page.locator('[data-dsh-forge-overview]')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1_200)
  await clickStable(page, '[data-dsh-forge-overview-subtab="tasks"]')
  await expect(page.locator('[data-dsh-forge-overview-tasks]')).toBeVisible({ timeout: 10_000 })
}

/** Expand one 挂接历史 row, RETRYING the toggle across dock re-feeds (a re-feed
 * remounts the section and collapses local expansion state). */
async function expandLinkRow(page: Page, sessionId: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await clickStable(page, `[data-dsh-forge-detail-link-toggle="${sessionId}"]`).catch(() => {})
    const expanded = await page.locator(
      `[data-dsh-forge-detail-link-toggle="${sessionId}"]`).getAttribute('aria-expanded').catch(() => null)
    if (expanded === 'true'
      && await page.locator(`[data-dsh-forge-detail-link-body="${sessionId}"]`).isVisible().catch(() => false)) {
      return
    }
    await page.waitForTimeout(800)
  }
  throw new Error(`link row ${sessionId} never expanded`)
}

/** Open a task's detail dock. Two openers, tried in order per round:
 * the OVERVIEW tasks row (the 2.3 select + board-forward seam — the reliable
 * first entry), then the BOARD's own list row / status card (the pane's
 * durable surface once its tab is live; its cards only settle under direct
 * DOM clicks). The dock check is ATTACHED: the upstream API-key onboarding
 * modal can briefly cover the column (the background dismisser clears it). */
async function openTaskDetail(page: Page, taskKey: string): Promise<void> {
  const dock = page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    // Opener A — the overview tasks row.
    await focusOverviewTasks(page)
    const overviewRow = page.locator(`[data-dsh-forge-overview-task="${taskKey}"]`).first()
    if (await overviewRow.isVisible().catch(() => false)) {
      await clickStable(page, `[data-dsh-forge-overview-task="${taskKey}"]`)
      if (await dock.waitFor({ state: 'attached', timeout: 6_000 }).then(() => true, () => false)) return
    }
    // Opener B — the board pane's own row/card (bring the tab forward first).
    if (await clickRightbarChip(page, '任务看板')) await page.waitForTimeout(600)
    const boardRow = `[data-dsh-forge-task-row="${taskKey}"]`
    if (await page.locator(boardRow).first().isVisible().catch(() => false)) {
      await clickStable(page, boardRow)
    } else {
      await page.evaluate((key: string) => {
        const el = document.querySelector(`[data-dsh-forge-node-card="${key}"]`)
        if (el !== null) (el as HTMLElement).click()
      }, taskKey).catch(() => {})
    }
    if (await dock.waitFor({ state: 'attached', timeout: 6_000 }).then(() => true, () => false)) return
  }
  throw new Error(`detail dock never opened for ${taskKey}`)
}

// 交互确定性(fix-1 恢复;断言本体零删改):板内 dock 交互的两处失稳源已
// 修 —— ①右栏会话域 seam:ensureBoardActive/ensureOverviewActive 的
// inventory-keyed focus 在会话切换后指向跨会话清单里的外国 tab(controller
// 静默 no-op),现经 openTab 走唯一「挂在会话」命令(per-pane page 去重
// 落 focus-or-open);②e2e 环境 prefers-reduced-motion: reduce —— 右栏
// 面板 slide 过渡关闭,expand/chip 断言不再与 0.2s 动画赛跑。
test('sc7/task-session-trace: 挂接历史/标识/双通道打开/归拢收起/C6 元数据/命名遵循率固定桩/血缘为准', async ({ }, testInfo) => {
  testInfo.setTimeout(480_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc7')
  const kernel = await sc7Kernel(root)
  const dshHome = join(root, 'dsh-home')
  const stub = createDispatchStub(join(root, 'dispatch-stub'))
  // The stub 协议扩展 leg ①: the corpus lands through the REAL persistence
  // backend BEFORE launch (the boot-time bootstrap + list read consume it),
  // with one journal 对拍 row per seed.
  await seedLineageCorpus({
    dshHome,
    seeds: sc7Seeds(kernel.codeRoot, Date.now()),
    note: entry => { stub.noteSessionSeeded(entry) },
  })

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    // The REAL shell over the REAL plugin; DSH_HOME pins the vendored host
    // child's sessions root (and its whole harness home) to the journey root.
    shell = await launchWorkbenchShell({
      userDataDir: kernel.userDataDir,
      rootDir: kernel.root,
      stubEnv: stub.env,
      env: {
        DSH_HOME: dshHome,
        // A present credential keeps the upstream API-key onboarding dialog
        // from re-surfacing on every models-mirror refresh (the inherited env
        // layer outranks the managed store; no real calls ever run — the
        // session channel is the stub).
        DEEPSEEK_API_KEY: 'sc7-e2e-stub-key',
      },
    })
    const { page } = shell
    await shell.uiReady()
    // 确定性环境(fix-1):右栏面板/条带的 stylesheet 过渡在 reduced-motion
    // 下关闭 —— expandRightbar/chip 断言不再与 slide-in 动画赛跑。
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // 隔离 DSH_HOME 的首次启动弹上游 onboarding 模态链(内测声明 → API-key
    // 步;到达时刻不定)—— 后台自动 dismiss 直至派发腿(forge 自己的确认
    // 对话框由派发链驱动,自动腿显式排除之)。
    stopAutoDismiss = startAutoDismiss(page)

    // ---- 激活项目(tree row click — the sc1 pattern)----------------------
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow, '注册行在树在场(boot 读数)').toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // ---- 挂接登记(real verbs:recordSessionLink / endSessionLink)---------
    await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{
      projectId: kernel.projectId, taskKey: TASK_LINEAGE, sessionId: TOP_A,
    }])
    await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{
      projectId: kernel.projectId, taskKey: TASK_ENDED, sessionId: TOP_B,
    }])
    const linkM = await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{
      projectId: kernel.projectId, taskKey: TASK_ENDED, sessionId: TOP_M,
    }])
    await bridgeInvoke<void>(page, 'endSessionLink', [linkM.id])

    // ---- ④ 归拢不顶层 + 默认收起(C3 树,真核心会话列表)-------------------
    // 顶层 A/B/M 归组于项目组(workspaceRegistry bootstrap:cwd canonical 归组)。
    for (const top of [TOP_A, TOP_B, TOP_M]) {
      await expect(page.locator(`[data-dsh-forge-tree-session="${top}"]`),
        `顶层会话 ${top} 在项目组(真核心列表 byId 消费)`).toBeVisible({ timeout: 30_000 })
    }
    await expect(page.locator('[data-dsh-forge-tree-kind="subagent"]'),
      '默认收起:零 subagent 行渲染(BIZ-workbench-007)').toHaveCount(0)
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"]`),
      'subagent 会话不出现在顶层(kind=top 行缺席)').toHaveCount(0)
    // 行展开 → 归拢于 parent 血缘树下(含 depth-2 默认收起逐级)。
    await page.locator(`[data-dsh-forge-tree-caret="${TOP_A}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_OK}"][data-dsh-forge-tree-kind="subagent"]`),
      'A 展开后直属 subagent 行在场(归拢非顶层)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_RENAMED}"][data-dsh-forge-tree-kind="subagent"]`),
      'A 展开后改名桩行在场').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_NESTED}"]`),
      'depth-2 后代默认仍收起(逐级收起)').toHaveCount(0)
    await page.locator(`[data-dsh-forge-tree-caret="${SUB_OK}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-session="${SUB_NESTED}"][data-dsh-forge-tree-kind="subagent"]`),
      'C1 展开后 depth-2 后代在场(递归血缘)').toBeVisible()

    // ---- ① 挂接历史呈现 + [打开] 在场(首 dock,未切会话)------------------
    await focusOverviewTasks(page)
    // 执行中段(必答⑦ 判定:in_progress × active 挂接)—— the ⟞ 1-click face.
    await expect(page.locator(`[data-dsh-forge-overview-task-exec="${TASK_LINEAGE}"]`),
      '执行中段呈现(in_progress ∧ active 挂接,BIZ-workbench-008)').toBeVisible({ timeout: 20_000 })
    await openTaskDetail(page, TASK_LINEAGE)
    await expect(page.locator(`[data-dsh-forge-detail-link="${TOP_A}"]`),
      '挂接历史行 = active 顶层 A').toHaveAttribute('data-link-status', 'active')
    await expect(page.locator(`[data-dsh-forge-detail-enter="${TOP_A}"]`),
      '[打开] 行尾 ghost 在场(顶层通道)').toBeVisible()

    // ① ended 行(新→旧)+ 查看历史展开 + 「查看全部」上限 20 折叠。
    await openTaskDetail(page, TASK_ENDED)
    const endedRows = page.locator('[data-dsh-forge-detail-link]')
    await expect(endedRows, 'ended 挂接两行(M 新于 B)').toHaveCount(2)
    await expect(endedRows.nth(0)).toHaveAttribute('data-link-status', 'ended')
    await expect(endedRows.nth(0), '新→旧:M 行在前(startedAt 降序)').toContainText(TOP_M)
    // B 先展开(后行;M 的 20 行展开会把 B 推出窄面板可点区)。
    await expandLinkRow(page, TOP_B)
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_B}"]`),
      'B(ended)行展开 = 历史快照查看(PRD UF5)').toBeVisible()
    // M 展开(重试跨 dock 再喂料的收起复位);计数限定 M 的行体(B 已展开 1 行)。
    const mDescendants = page.locator(
      `[data-dsh-forge-detail-link-body="${TOP_M}"] [data-dsh-forge-detail-descendant]`)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expandLinkRow(page, TOP_M)
      if (await mDescendants.count().then(n => n === 20, () => false)) break
      await page.waitForTimeout(800)
    }
    await expect(mDescendants,
      '查看全部折叠:恰 20 行(LINEAGE_DESCENDANT_LIMIT,限 M 行体)').toHaveCount(20, { timeout: 10_000 })
    await expect(page.locator(`[data-dsh-forge-detail-descendants-more="${String(MANY_DESCENDANT_COUNT)}"]`),
      `「查看全部 {n} 个」尾注(total = ${String(MANY_DESCENDANT_COUNT)})`).toBeVisible()

    // ---- ⑥' 派发腿:预合成两行追加(归因 + 命名行)+ 四检 oracle ---------
    await openTaskDetail(page, TASK_DISPATCH)
    await clickStable(page, '[data-dsh-forge-detail-close]')
    await expect(page.locator('[data-dsh-forge-task-detail]')).toHaveCount(0, { timeout: 10_000 })
    await dispatchFromBoard(page, [TASK_DISPATCH])
    const dispatchRows = async (): Promise<readonly DispatchRowView[]> => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const rows = await getDispatchRows(page, kernel.projectId)
        const hit = rows.filter(row => row.taskKey === TASK_DISPATCH && row.promptHash !== '')
        if (hit.length > 0) return hit
        await page.waitForTimeout(200)
      }
      throw new Error('dispatch row with promptHash never landed')
    }
    const dispatched = await dispatchRows()
    expect(dispatched[0]?.sessionId, '派发会话预铸 id 在座').toBeTruthy()
    const stubSessionId = dispatched[0].sessionId as string
    const promptRow = await waitForPromptRow(page, stub, stubSessionId)
    expect(promptRow.text, '命名行在场(Interface 7:任务 id + title)').toContain(
      `执行本任务时,你 spawn 的 subagent 会话须以『${TASK_DISPATCH} ${TITLE_DISPATCH}』命名`)
    const db = await openKernelDb(kernel.userDataDir)
    try {
      const presynth = recomputePresynth(db, kernel.featuresRoot, kernel.projectId, TASK_DISPATCH)
      const oracle = verifyPromptInjection({
        journalText: promptRow.text,
        presynthContent: presynth,
        promptHash: dispatched[0].promptHash,
        sessionId: stubSessionId,
        requestId: promptRow.requestId,
      })
      expect(oracle, '四检 oracle(内核三查 + requestId 确定性)').toEqual({ ok: true })
    } finally {
      db.close()
    }
    // ---- stub 协议 journal ↔ 真核心 artifact ↔ UI 三方对拍(AC-1)--------
    const seeded = stub.readSeeded()
    expect(seeded.length, 'journal session-seeded 行数 = 语料数').toBe(7 + MANY_DESCENDANT_COUNT)
    const subOkSeed = seeded.find(row => row.sessionId === SUB_OK)
    expect(subOkSeed?.parentSession, 'journal 头注入事实:parentSession').toBe(TOP_A)
    expect(subOkSeed?.origin, 'journal 头注入事实:origin').toBe('subagent')
    const reread = await readCorpusSession({ dshHome, sessionId: SUB_OK })
    expect(reread.header.parentSession, '真核心读回头 = journal 对拍(parentSession)').toBe(subOkSeed?.parentSession)
    expect(reread.header.origin, '真核心读回头 = journal 对拍(origin)').toBe('subagent')
    expect(reread.events.map(event => event.type), 'descriptor 事件在日志(catalog 消费面)').toContain('subagent/descriptor')
    // UI 侧对拍:SUB_OK 的血缘行已在上文断言(归拢 + 命名 + 打开)。

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// The OPEN-leg cluster (③⑤⑥ cold-name/⑦), restored by fix-1 — 断言本体零删改:
//
//   The right column is 会话域 (per-session surfaces): every ③ 打开 switches
//   the conversation's active session, which mounts that session's FRESH
//   collapsed surface — the pane-hosted board tab (and the C5 dock inside
//   it) unmounts with the old session's layout. Two determinism legs: the
//   plugin seam (ensureBoardActive routes through the MOUNTED-session
//   openTab — the cross-session inventory no longer wins a silent no-op
//   focus) and the DRIVER re-entry (after a session switch the test re-opens
//   the dock through the same user path — the overview tasks row → board
//   pane — before asserting on the dock's interior).
// ---------------------------------------------------------------------------
test('sc7/task-session-open-legs: 顶层/subagent 打开 + C6 元数据条 + 命名遵循率冷名字 + 血缘为准', async ({ }, testInfo) => {
  testInfo.setTimeout(360_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc7-open')
  const kernel = await sc7Kernel(root)
  const dshHome = join(root, 'dsh-home')
  const stub = createDispatchStub(join(root, 'dispatch-stub'))
  await seedLineageCorpus({
    dshHome,
    seeds: sc7Seeds(kernel.codeRoot, Date.now()),
    note: entry => { stub.noteSessionSeeded(entry) },
  })

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({
      userDataDir: kernel.userDataDir,
      rootDir: kernel.root,
      stubEnv: stub.env,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc7-e2e-stub-key' },
    })
    const { page } = shell
    await shell.uiReady()
    // 确定性环境(fix-1):右栏 stylesheet 过渡在 reduced-motion 下关闭。
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow).toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await bridgeInvoke<{ id: string }>(page, 'recordSessionLink', [{
      projectId: kernel.projectId, taskKey: TASK_LINEAGE, sessionId: TOP_A,
    }])

    // ---- ③⑤⑥⑦ 打开腿(会话切换改变右栏会话域,置于全部板内聚类之后;
    //      冷会话的名字/catalog 面随 open 加载 —— 命名断言随打开腿走)------
    await openTaskDetail(page, TASK_LINEAGE)
    // ③ 顶层打开 ≤1 次点击:主区切会话视图,树行 aria-current(mainView
    // retain 读写径),catalog(refreshSubagents)随 open 加载。
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-enter="${TOP_A}"]`,
      async () => await sessionOpenLanded(page)()
        && await page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`)
          .getAttribute('aria-current').catch(() => null) === 'true',
    )
    await expect(page.locator(`[data-dsh-forge-tree-session="${TOP_A}"]`),
      '顶层打开后树行 aria-current(主视图选中)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })

    // 会话域重入(fix-1 驱动侧):③ 打开把会话切换到 A,右栏随之挂 A 的全新
    // 折叠面 —— 板内 dock(旧会话 layout 的 board tab)随之卸载。经同一用户
    // 路径(概览任务行 → 板 pane)重开 dock 后再断言板内交互;plugin 侧
    // ensureBoardActive 已走挂载会话 openTab,此重入为确定性。
    await openTaskDetail(page, TASK_LINEAGE)

    // ⑥ 命名遵循率(固定桩)+ ② 标识:行展开后代名 = descriptor label =
    // 「任务 id + title」(命名遵循);depth-2 递归;改名桩行名 = 手工改名。
    await expandLinkRow(page, TOP_A)
    const subOkRow = page.locator(`[data-dsh-forge-detail-descendant="${SUB_OK}"]`)
    await expect(subOkRow,
      '行展开血缘后代(C5 增强;catalog 地址权威)').toBeVisible({ timeout: 10_000 })
    await expect(subOkRow).toContainText(namingCompliantName(TASK_LINEAGE, TITLE_LINEAGE))
    await expect(page.locator(`[data-dsh-forge-detail-descendant="${SUB_NESTED}"]`),
      'depth-2 后代在展开态(递归 DFS)').toBeVisible()
    const renamedRow = page.locator(`[data-dsh-forge-detail-descendant="${SUB_RENAMED}"]`)
    // 改名桩行名断言 rides the ⑦ open below (verbatim body, relocated): a COLD
    // catalog row carries only the descriptor label — the durable
    // session/title projection reaches the sessions list once the host LOADS
    // the session (the open), and the row then shows the manual rename
    // (derive is title-first, the sessions service's own displayTitle rule).

    // ③⑤ subagent 打开 ≤1 次点击(SubagentAddress 通道)+ C6 元数据条 bound。
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_OK}"]`,
      sessionOpenLanded(page),
    )
    const bar = page.locator('[data-dsh-forge-metadata-bar]')
    await expect(bar, 'C6 元数据条 bound(血缘命中唯一任务)').toBeVisible({ timeout: 20_000 })
    await expect(bar).toHaveAttribute('data-dsh-forge-metadata-state', 'bound')
    await expect(bar).toHaveAttribute('data-dsh-forge-metadata-task', TASK_LINEAGE)
    await expect(bar).toContainText(TITLE_LINEAGE)
    await expect(page.locator('[data-dsh-forge-metadata-open]'), '「查看任务」ghost 在场').toBeVisible()

    // ⑤ 双向:点击元数据条 → C5 任务详情(board pane 前置 + dock 打开)。
    await page.locator('[data-dsh-forge-metadata-open]').click()
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_LINEAGE}"]`),
      '查看任务 → 任务详情 dock(双向互通)').toBeVisible({ timeout: 20_000 })

    // ⑦ 命名与血缘冲突语料 → 以血缘为准(Hard Rule):改名桩会话打开后,
    // C6 条仍以血缘推导的任务标识呈现(静默矫正,非会话名)。
    await expandLinkRow(page, TOP_A)
    await expect(renamedRow).toBeVisible()
    await clickSelfUnmounting(
      page, `[data-dsh-forge-detail-descendant-open="${SUB_RENAMED}"]`,
      sessionOpenLanded(page),
    )
    await expect(page.locator('[data-dsh-forge-metadata-bar]'),
      '改名桩会话视图元数据条在场(血缘覆盖)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-metadata-bar]')).toHaveAttribute('data-dsh-forge-metadata-task', TASK_LINEAGE)
    await expect(page.locator('[data-dsh-forge-metadata-bar]'), '任务号 = 血缘推导(非会话名)').not.toContainText(RENAME_STUB)

    // ⑥'(relocated, body verbatim): the open above made the host project the
    // renamed session's durable title into the sessions list — re-enter the
    // pane-hosted dock through the same user path and assert the row now
    // shows the manual rename (会话名自持), while the C6 bar above held the
    // LINEAGE identity (血缘为准) — the two faces stay distinct.
    await openTaskDetail(page, TASK_LINEAGE)
    await expandLinkRow(page, TOP_A)
    await expect(renamedRow, '命名辅助:改名桩行名 = 手工改名(会话名自持)').toContainText(RENAME_STUB)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
