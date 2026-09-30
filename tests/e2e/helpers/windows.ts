// tests/e2e/helpers/windows — M4 task 4.6's multi-window e2e helper (the seam
// 4.2's Implementation Notes flagged: "需新增双窗口 e2e helper(4.6 消费)").
//
// The shell's SECOND window (windowOpenDetached, tech-design §Interfaces·
// Interface 5) is created by the MAIN process — the renderer never opens it —
// so an _electron test drives it through the ElectronApplication faces, not
// page-level navigation:
//
//   waitForDetachedBoard   poll the window set for the detached BOARD page,
//                          keyed on its content marker (not a creation event:
//                          the window can open before the poll subscribes,
//                          and its SPA boot + role handshake take seconds).
//                          Returns the Page with a pageerror tap attached.
//   shellWindowCount       BrowserWindow.getAllWindows().length — the
//                          AUTHORITATIVE count. Hidden ≠ closed: the UF1 tray
//                          residency intercepts the main window's close into a
//                          hide, so the window STAYS in the set — exactly the
//                          distinction AC4 (residency intact / detached not
//                          swept by a hide) asserts through this number.
//   closeMainWindowLikeUser the OS title-bar close path (BrowserWindow.close on
//                          the boot main window — getAllWindows()[0], created
//                          first): the M1 semantics face.
//   quitShellAssertZeroWindows the tray-quit funnel (app.quit → before-quit
//                          destroys the tray FIRST, releasing the residency
//                          latch → every window closes, the main window's
//                          'closed' recalls every detached window → process
//                          exits) + the Hard-Rule leak guard: the explicit
//                          all-windows close rides the app's own quit funnel
//                          and the Playwright window set must drain to ZERO.
//
// The main-process evaluates degrade to their fallback once the process is
// gone (a quit already settled) — helpers compose with catch-guards at the
// call sites, never throw on a dead app.

import type { ElectronApplication, Page } from '@playwright/test'
import { isProcessAlive } from '../../../apps/desktop/e2e/helpers/fixture-app.ts'

/** The poll cadence for the window-set faces (ms). */
const WINDOW_POLL_MS = 250

/** A resolved detached-board page + its error tap (the spec asserts both). */
export interface DetachedBoardWindow {
  readonly page: Page
  /** Every renderer pageerror since the marker landed (the leak-guard twin). */
  readonly pageErrors: string[]
}

/**
 * The authoritative window count (main-process BrowserWindow registry).
 * @param electronApp - the running application.
 * @returns the window count (0 once the process is gone).
 */
export async function shellWindowCount(electronApp: ElectronApplication): Promise<number> {
  return await electronApp
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
    .catch(() => 0)
}

/**
 * Every live window's OS title via the MAIN process (the P-1 discipline:
 * detached titles live on `BrowserWindow.getTitle()` — the composeDetachedTitle
 * value the page-title-updated guard keeps authoritative; the renderer's own
 * `document.title` (page.title()) is the vendored SPA's fallback and NEVER
 * carries the composed project title post-fix-3).
 * @returns the titles ([] once the process is gone).
 */
export async function osWindowTitles(electronApp: ElectronApplication): Promise<readonly string[]> {
  return await electronApp
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.getTitle()))
    .catch(() => [] as string[])
}

/** The main process's pid (null once unreachable). */
export async function shellMainPid(electronApp: ElectronApplication): Promise<number | null> {
  return await electronApp.evaluate(() => process.pid).catch(() => null)
}

/** One diagnostic row per live window (title/visibility — the residency face). */
export async function shellWindowStates(electronApp: ElectronApplication): Promise<
  ReadonlyArray<{ readonly title: string, readonly visible: boolean, readonly destroyed: boolean }>
> {
  return await electronApp
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => ({
      title: win.getTitle(),
      visible: win.isVisible(),
      destroyed: win.isDestroyed(),
    })))
    .catch(() => [])
}

/**
 * Wait for the detached BOARD window of one project (tech-design Interface 5:
 * same-origin SPA reload, role via handshake — the content marker is the
 * detached assembly's own `data-dsh-forge-detached-board` root).
 * @param electronApp - the running application.
 * @param projectId - the source project the window was detached FROM.
 * @param timeoutMs - the marker budget (window open + SPA boot + handshake).
 * @param options.exclude - pages to SKIP (calibration r2, P-2: two same-marker
 *   windows coexist after a second detach — the matcher must return the NEW
 *   window, never the already-matched first one; the poll's first iteration
 *   would otherwise deterministically hit the older match).
 * @returns the page and its pageerror tap.
 */
export async function waitForDetachedBoard(
  electronApp: ElectronApplication,
  projectId: string,
  timeoutMs = 30_000,
  options: { readonly exclude?: readonly Page[] } = {},
): Promise<DetachedBoardWindow> {
  const deadline = Date.now() + timeoutMs
  const excluded = options.exclude ?? []
  const errorsByPage = new Map<Page, string[]>()
  const tapErrors = (page: Page): void => {
    if (errorsByPage.has(page)) return
    const errors: string[] = []
    errorsByPage.set(page, errors)
    page.on('pageerror', error => { errors.push(String(error)) })
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })
  }
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (excluded.includes(page)) continue
      tapErrors(page)
      const found = await page
        .evaluate(
          (id: string) => document.querySelector(`[data-dsh-forge-detached-board][data-dsh-forge-detached-project="${id}"]`) !== null,
          projectId,
        )
        .then(hit => hit, () => false)
      if (found) {
        const pageErrors: string[] = []
        page.on('pageerror', error => { pageErrors.push(String(error)) })
        return { page, pageErrors }
      }
    }
    await new Promise(resolve => setTimeout(resolve, WINDOW_POLL_MS))
  }
  const windows = electronApp.windows()
  const titles = await electronApp
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => win.getTitle()))
    .catch(() => [] as string[])
  const survey = await Promise.all(windows.map(async (page, index) => {
    const url = page.url().slice(0, 80)
    const markers = await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { window?: { getRole?: () => Promise<unknown> } } }).dshForge?.window
      const role = await bridge?.getRole?.().catch((error: unknown) => String(error))
      const boot = (globalThis as { __DSH_BOOT__?: { entries?: unknown[] } }).__DSH_BOOT__
      return {
        role,
        bootIds: [...(boot?.entries ?? [])].map((row) => {
          const entry = row as { id?: unknown; name?: unknown }
          return String(entry.id ?? entry.name ?? '')
        }).filter(id => id.includes('forge')),
        detached: [...document.querySelectorAll('[data-dsh-forge-detached-board]')]
          .map(node => node.getAttribute('data-dsh-forge-detached-project') ?? ''),
        recall: document.querySelectorAll('[data-dsh-forge-detached-recall]').length,
        tree: document.querySelectorAll('[data-dsh-forge-tree]').length,
        shell: document.querySelectorAll('[data-dsh-forge-shell]').length,
        crash: document.querySelectorAll('#dsh-forge-crash-recovery').length,
        body: document.body?.textContent?.trim().slice(0, 120) ?? '',
      }
    }).catch(() => 'evaluate-failed')
    return `window[${index}] title=${JSON.stringify(titles[index] ?? '')} ${url} ${JSON.stringify(markers)}`
  }))
  const errorDump = [...errorsByPage.entries()]
    .map(([page, errors], index) => errors.length === 0 ? '' : `window[${index}] pageerrors: ${errors.join(' || ').slice(0, 600)}`)
    .filter(entry => entry !== '')
    .join(' | ')
  throw new Error(
    `detached board window of ${projectId} never presented its marker within ${String(timeoutMs)}ms — ${windows.length} window(s): ${survey.join(' | ')}${errorDump === '' ? '' : ` — ${errorDump}`}`,
  )
}

/**
 * Close the MAIN window the way a user does (OS title-bar close). With the
 * UF1 tray present this lands in residency (hide, not destroy) — the M1
 * semantics the zero-regression leg asserts; without a tray it quits.
 *
 * The main window is identified by EXCLUSION: the detached page is tagged
 * (`__sc4Detached`) and the close lands on the first window whose renderer
 * does NOT carry the tag — `BrowserWindow.getAllWindows()` order is not a
 * stable main-first guarantee (observed detached-first in the wild).
 * @param electronApp - the running application.
 * @param detachedPage - the detached window's page (the exclusion tag).
 */
export async function closeMainWindowLikeUser(electronApp: ElectronApplication, detachedPage: Page): Promise<void> {
  await detachedPage
    .evaluate(() => { (globalThis as { __sc4Detached?: boolean }).__sc4Detached = true })
    .catch(() => {})
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const isDetached = await win.webContents
        .executeJavaScript('(globalThis.__sc4Detached === true)')
        .catch(() => false)
      if (!isDetached) {
        win.close()
        return
      }
    }
  })
}

/** Is the MAIN (non-tagged) window visible? False once hidden or gone. */
export async function mainWindowVisible(electronApp: ElectronApplication): Promise<boolean> {
  return await electronApp.evaluate(async ({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const isDetached = await win.webContents
        .executeJavaScript('(globalThis.__sc4Detached === true)')
        .catch(() => false)
      if (!isDetached) return win.isVisible()
    }
    return false
  }).catch(() => false)
}

/**
 * Quit the shell through the app's own funnel and assert the Hard-Rule leak
 * guard: every window closes (detached windows swept by the main window's
 * 'closed' recallAll — Interface 5「主窗关闭 = 退出,detached 随之关闭」),
 * the process exits, and the Playwright window set drains to ZERO.
 * @param electronApp - the running application.
 * @param timeoutMs - the whole funnel's budget (the host settle can take seconds).
 */
export async function quitShellAssertZeroWindows(electronApp: ElectronApplication, timeoutMs = 30_000): Promise<void> {
  const pid = await shellMainPid(electronApp)
  await electronApp.evaluate(({ app }) => { app.quit() }).catch(() => {})
  // ① the window set drains to zero BEFORE (or exactly as) the process exits —
  //    an evaluate that can no longer reach the process means the windows are
  //    necessarily gone with it.
  const windowsDeadline = Date.now() + timeoutMs
  let windowsZero = false
  while (Date.now() < windowsDeadline) {
    if (await shellWindowCount(electronApp) === 0) { windowsZero = true; break }
    await new Promise(resolve => setTimeout(resolve, WINDOW_POLL_MS))
  }
  if (!windowsZero) {
    throw new Error(`window handles leaked: ${String(await shellWindowCount(electronApp))} window(s) still open after the quit funnel`)
  }
  // ② the main process itself exits (the host settle precedes it).
  if (pid !== null) {
    const exitDeadline = Date.now() + timeoutMs
    while (Date.now() < exitDeadline) {
      if (!isProcessAlive(pid)) break
      await new Promise(resolve => setTimeout(resolve, WINDOW_POLL_MS))
    }
    if (isProcessAlive(pid)) throw new Error(`electron main pid ${String(pid)} still alive ${String(timeoutMs)}ms after quit`)
  }
  // ③ the Hard Rule's face: the Playwright window count is zero (no handle
  //    leak). The driver's window-set drains ASYNCHRONOUSLY after the process
  //    exit — under load the handles can outlive the pid by seconds (r2
  //    full-lane replays: 1-3 phantom pages at the immediate check, zero at
  //    every earlier poll). Bounded drain wait; the Rule stays absolute —
  //    anything still alive at the deadline is a real leak and throws.
  const drainDeadline = Date.now() + 10_000
  let leaked = electronApp.windows().length
  while (leaked !== 0 && Date.now() < drainDeadline) {
    await new Promise(resolve => setTimeout(resolve, WINDOW_POLL_MS))
    leaked = electronApp.windows().length
  }
  if (leaked !== 0) throw new Error(`playwright window handles leaked: ${String(leaked)} page(s) survive the app exit`)
}
