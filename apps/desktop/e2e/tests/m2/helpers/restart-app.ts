// e2e/tests/m2/helpers/restart-app — task 6.3 Implementation Notes file: the
// shell-lifecycle helpers the SC2/SC3 legs share.
//
//   - assertNoActiveForgeInstance — the Hard-Rule OS-level single-instance
//     probe (ERR_SINGLE_INSTANCE lesson): run before EVERY launch, including
//     the in-spec restarts. win32 = WMI over electron*/dsh* command lines,
//     POSIX = ps (the SC1 verbatim semantics).
//   - closeAndAwaitExit — graceful close + wait for the Electron MAIN pid to
//     actually exit, so the next boot's single-instance lock is free.
//   - createAppSessionFactory — a reboot-stable factory over ONE config
//     root + ONE isolated userData (the 6.1 seam): every boot re-asserts the
//     instance guard and re-applies the env seams (stub CLI + stub channel),
//     which is exactly SC2-3's "restart with the same userData" shape.
//   - board navigation (switchToWorkbench / openTasksBoard / waitForTreeNodes)
//     — the SC1 navigation facts (boot session-restore bounce tolerance, the
//     tasks-tab panel + node population wait), factored for both legs.
//
// The landed SC1 leg keeps its own inline copies (6.2 code is untouched by the
// 6.3 diff — surgical-change discipline).
import { execSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { isProcessAlive } from '../../../helpers/fixture-app.ts'
import { launchPluginShell } from '../../../helpers/plugins.ts'
import type { PluginShell, PluginShellOptions } from '../../../helpers/plugins.ts'

/** Live dsh-forge shell processes (dev instance or a leaked e2e boot). */
function listActiveForgeInstances(): Array<{ pid: number; command: string }> {
  const rows: Array<{ pid: number; command: string }> = []
  if (process.platform === 'win32') {
    // Double-quoted JS string (content carries single quotes — avoidEscape).
    // The inner \" pairs escape through the sh layer so powershell receives
    // ONE -Command argument whose WML strings ride PS single quotes.
    const psCommand = "Get-CimInstance Win32_Process -Filter 'Name LIKE \\\"electron%\\\" OR Name LIKE \\\"dsh%\\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
    const out = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8' })
    const parsed = JSON.parse(out.trim() === '' ? '[]' : out.trim()) as
      { ProcessId: number; CommandLine: string | null } | Array<{ ProcessId: number; CommandLine: string | null }>
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      const pid = Number(row.ProcessId)
      if (pid === process.pid) continue
      const command = row.CommandLine ?? ''
      if (command.includes('dsh-forge')) rows.push({ pid, command: command.slice(0, 160) })
    }
    return rows
  }
  const out = execSync('ps -eo pid=,command=', { encoding: 'utf8' })
  for (const line of out.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (match === null) continue
    const pid = Number(match[1])
    const command = match[2] ?? ''
    if (pid === process.pid) continue
    if (command.includes('dsh-forge') && /electron|main\.cjs/.test(command)) {
      rows.push({ pid, command: command.slice(0, 160) })
    }
  }
  return rows
}

/** Hard Rule: fail loudly BEFORE launching if any dsh-forge instance is live. */
export function assertNoActiveForgeInstance(): void {
  const found = listActiveForgeInstances()
  if (found.length > 0) {
    throw new Error(
      `active dsh-forge instance(s) detected before launch (ERR_SINGLE_INSTANCE guard): ${JSON.stringify(found)}`
      + ' — close the dev shell / leaked e2e boot before running this leg',
    )
  }
}

/** Close the shell and wait for the Electron main pid to actually exit. */
export async function closeAndAwaitExit(shell: PluginShell): Promise<void> {
  const mainPid = await shell.electronApp.evaluate(() => process.pid).catch(() => null)
  await shell.close()
  if (mainPid === null) return
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (!isProcessAlive(mainPid)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`electron main pid ${String(mainPid)} still alive 20s after close`)
}

/** The factory's fixed launch inputs (one config root, one userData, one env). */
export type AppSessionOptions = Pick<
  PluginShellOptions, 'bundles' | 'stageTarballs' | 'env' | 'cwd' | 'rootDir' | 'userDataDir'
>

/** A reboot-stable app session: boot() re-launches the SAME profile/userData. */
export interface AppSessionFactory {
  boot(): Promise<PluginShell>
}

/**
 * Create the session factory for one journey: every boot carries the identical
 * bundles, staged tarballs, env seams (stub CLI + stub channel), launch cwd,
 * config root, and isolated userData — so an in-spec restart is EXACTLY "the
 * app restarted" (SC2-3), never a re-registered fixture.
 */
export function createAppSessionFactory(options: AppSessionOptions): AppSessionFactory {
  return {
    async boot(): Promise<PluginShell> {
      assertNoActiveForgeInstance()
      const shell = await launchPluginShell(options)
      await shell.uiReady()
      return shell
    },
  }
}

/** The upstream sidebar's workbench row (the 5.15 locator). */
export const workbenchRow = (page: Page): ReturnType<Page['getByRole']> =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

/** Switch into the workbench tolerating the boot session-restore bounce (3.3). */
export async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    // The boot bounce can also land BETWEEN the click and the mount (the panel
    // never appears — selectPanel(null) wipes the click's selection); that
    // variant retries like the mounted-then-vanished one instead of failing.
    const mounted = await shellPanel.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
    if (mounted) {
      await page.waitForTimeout(2_500)
      if (await shellPanel.count() > 0) return
    }
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** Wait until the default view-A panel carries the full node population. */
export async function waitForTreeNodes(page: Page, expectedNodes: number, timeout = 45_000): Promise<void> {
  await page.waitForFunction((expected: number) => {
    const panel = document.querySelector('[data-dsh-forge-board-panel="tree"]')
    if (panel === null) return false
    return document.querySelectorAll('.react-flow__node').length === expected
  }, expectedNodes, { timeout })
}

/**
 * Open the task board's P2 host: the rightbar pane family's 任务看板 tab
 * (M4 task 2.10, 迁移清单 第②行 — 2.1's dual-host TasksView in its pane
 * form). The board's ONLY UI opener is the overview tasks subtab's row seam
 * (select + ensureBoardActive), so the route is: expand the collapsed
 * column → bring the 项目概览 tab forward (chip, or the 开始页 card on a
 * fresh column) → activate the 任务 subtab → click one task row. Every step
 * is postcondition-driven (the session-scoped right column can re-mount its
 * tabs while settling — direct DOM clicks + a visible-board arbiter, the
 * 2.9/fix-1 discipline).
 *
 * Requires ≥1 task in the ACTIVE project's corpus (the row seam is the
 * opener); a zero-task corpus has no board entry — that leg stays parked
 * (2.10 regression-inventory 开放项).
 */
export async function openBoardPane(page: Page): Promise<void> {
  for (let round = 0; round < 12; round += 1) {
    if (await isBoardPaneLive(page)) {
      // The row seam opens the detail dock as its other leg — retire it so
      // the board face starts clean (the dispatch chain's own stray guard
      // would close it too; here it is deterministic).
      await page.evaluate(() => {
        const dock = document.querySelector('[data-dsh-forge-task-detail]')
        if (dock === null) return
        const close = dock.querySelector('[data-dsh-forge-detail-close]') as HTMLElement | null
        close?.click()
      }).catch(() => {})
      return
    }
    await navigateBoardColumnRound(page, true)
  }
  // Diagnostics on give-up (what the column / overview faces looked like).
  const state = await page.evaluate(() => ({
    panelExists: document.querySelectorAll('[data-sidebar-right-panel]').length,
    panelOpen: document.querySelector('[data-sidebar-right-panel]')?.hasAttribute('data-sidebar-right-open') ?? false,
    expandBtn: document.querySelectorAll('[data-sidebar-right-expand]').length,
    stripChips: [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')].map(tab => tab.textContent?.trim() ?? ''),
    guideCards: [...document.querySelectorAll('[data-dsh-forge-guide-card]')].map(card => card.getAttribute('data-dsh-forge-guide-card') ?? ''),
    overview: document.querySelectorAll('[data-dsh-forge-overview]').length,
    overviewVisible: (document.querySelector('[data-dsh-forge-overview]') as HTMLElement | null)?.offsetParent !== null,
    subtabTasks: document.querySelectorAll('[data-dsh-forge-overview-subtab="tasks"]').length,
    taskRows: document.querySelectorAll('[data-dsh-forge-overview-task]').length,
    board: document.querySelectorAll('[data-dsh-forge-task-board]').length,
    treeSeat: document.querySelectorAll('[data-dsh-forge-project-seat]').length,
  })).catch(() => 'evaluate-failed')
  throw new Error(`board pane never opened (rightbar: column → 项目概览 → 任务 subtab → row seam) — page state ${JSON.stringify(state)}`)
}


/** Is the board pane mounted AND visible? */
async function isBoardPaneLive(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const board = document.querySelector('[data-dsh-forge-task-board]')
    return board !== null && (board as HTMLElement).offsetParent !== null
  }).catch(() => false)
}

/** One navigation round toward the board: door exit → column → overview →
 * tasks subtab (+ the row-seam click when `clickRow`). */
async function navigateBoardColumnRound(page: Page, clickRow: boolean): Promise<void> {
  // Step 0 — leave the escape door: the rightbar is the conversation-side
  // column; the workbench door (forge's shell in the main slot) displaces
  // it. Clicking the panellist「项目」row is selectPanel(null) — back to
  // the native home, where the column lives.
  await page.evaluate(() => {
    if (document.querySelector('[data-dsh-forge-shell]') === null) return
    const row = document.querySelector('[aria-label="项目"], [aria-label="Project"]') as HTMLElement | null
    const newSession = [...document.querySelectorAll('button')]
      .find(button => /新建会话|New Session/.test(button.textContent ?? ''))
    const target = row ?? newSession
    target?.click()
  }).catch(() => {})
  await page.waitForTimeout(500)
  // Step 1 — the column: expand, then the overview tab forward.
  await page.evaluate(() => {
    const panel = document.querySelector('[data-sidebar-right-panel]')
    if (panel !== null && !panel.hasAttribute('data-sidebar-right-open')) {
      const expand = document.querySelector('[data-sidebar-right-expand]') as HTMLElement | null
      expand?.click()
      return
    }
    const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
    const chip = tabs.find(tab => /^(项目概览|Project overview)$/.test(tab.textContent?.trim() ?? ''))
    if (chip !== undefined) {
      ;(chip as HTMLElement).click()
      return
    }
    const card = document.querySelector('[data-dsh-forge-guide-card="overview"]') as HTMLElement | null
    card?.click()
  }).catch(() => {})
  await page.waitForTimeout(600)
  // Step 2 — the tasks subtab (+ the row seam, ATOMICALLY: the overview
  // body re-mounts between protocol round-trips otherwise).
  await page.evaluate((open: boolean) => {
    const overview = document.querySelector('[data-dsh-forge-overview]')
    if (overview === null || (overview as HTMLElement).offsetParent === null) return
    const subtab = document.querySelector('[data-dsh-forge-overview-subtab="tasks"]') as HTMLElement | null
    subtab?.click()
    if (!open) return
    const row = document.querySelector('[data-dsh-forge-overview-task]') as HTMLElement | null
    row?.click()
  }, clickRow).catch(() => {})
  await page.waitForTimeout(700)
}

/**
 * Prepare the board entry WITHOUT the opening click: leave the escape door,
 * expand the column, bring 项目概览 forward, activate the 任务 subtab. The
 * postcondition = the subtab active with its task rows mounted (the seam's
 * clickable face). The timing legs then time the row click itself.
 */
export async function prepareBoardEntry(page: Page): Promise<void> {
  for (let round = 0; round < 14; round += 1) {
    const ready = await page.evaluate(() => {
      const tab = document.querySelector('[data-dsh-forge-overview-subtab="tasks"]')
      const selected = tab?.getAttribute('aria-selected') === 'true'
      const overview = document.querySelector('[data-dsh-forge-overview]')
      const overviewVisible = overview !== null && (overview as HTMLElement).offsetParent !== null
      const row = document.querySelector('[data-dsh-forge-overview-task]')
      return selected && overviewVisible && row !== null
    }).catch(() => false)
    if (ready) return
    await navigateBoardColumnRound(page, false)
  }
  throw new Error('board entry never prepared (rightbar: column → 项目概览 → 任务 subtab)')
}

/**
 * Click the first overview task row — the board-opening seam (select +
 * ensureBoardActive). Exported for the timing legs that need t0 + click in
 * ONE evaluate round-trip.
 */
export async function clickBoardEntryRow(page: Page): Promise<void> {
  await page.evaluate(() => {
    const row = document.querySelector('[data-dsh-forge-overview-task]') as HTMLElement | null
    row?.click()
  }).catch(() => {})
}

/**
 * Navigate to the populated task board (M4 re-homing, task 2.10 / 迁移清单
 * 第②行): the rightbar 任务看板 pane, view-A panel with the full node
 * population. The parked board specs' assertion bodies stay verbatim — only
 * this entry plumbing changed hosts (view-key → tab-kind addressing).
 */
export async function openTasksBoard(page: Page, expectedNodes: number): Promise<void> {
  await openBoardPane(page)
  await waitForTreeNodes(page, expectedNodes, 60_000)
}

/** The 5.14 localStorage hygiene: drop the persisted view key before a close. */
export async function cleanupViewKey(page: Page): Promise<void> {
  await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
}
