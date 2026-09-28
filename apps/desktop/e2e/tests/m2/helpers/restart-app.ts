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
import { expect } from '@playwright/test'
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
 * Navigate to the populated task board: workbench row → 任务 tab → view-A
 * panel with the full node population. Safe to re-run after a launch's
 * 切会话视图 (the keyed main slot re-mounts the whole shell).
 *
 * @deprecated M4 task 1.8 (迁移清单 #9 / 必答② 第②行): the 任务 tab and the
 * tasks main view retired with 1.7 — the board re-homes into the rightbar
 * pane family (P2 2.1/2.2). Kept for the test.fixme'd board specs' compile
 * face; restored to a live path with the P2 hosts.
 */
export async function openTasksBoard(page: Page, expectedNodes: number): Promise<void> {
  await switchToWorkbench(page)
  await page.getByRole('tab', { name: /^任务$|^Tasks$/ }).click()
  await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-tasks"]')).toBeVisible()
  await waitForTreeNodes(page, expectedNodes, 60_000)
}

/** The 5.14 localStorage hygiene: drop the persisted view key before a close. */
export async function cleanupViewKey(page: Page): Promise<void> {
  await page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
}
