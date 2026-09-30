// tests/e2e/specs/_lib/m4-world — the gen-test-scripts (T-test-gen-scripts)
// shared world library for the 6 M4 contract-derived journeys
// (project-workbench-home / project-registration-projection /
// project-lifecycle-projection / split-pane-layout-memory /
// multi-window-tearout / task-session-roundtrip).
//
// One home for the M4 SC legs' proven techniques (1.8/2.9/2.10/3.6/3.7/4.6/
// 4.7 legs), re-based onto the journey discipline:
//   · the M4 app world — the REAL shell over the REAL forge-workbench plugin
//     with an ISOLATED `$DSH_HOME` (the vendored host child's sessions root +
//     its whole harness home pinned to the journey temp root) and the
//     REAL session-persistence seeding channel (`seedLineageCorpus`), booted
//     straight into the project-center first screen (conversation; the M3
//     `bootAppWorld` escape-door switch does NOT apply to M4 journeys);
//   · the live native registry reader (`$DSH_HOME/storages/workspace.json` —
//     the relay follow 流's durable face) + the projection status kernel face
//     (`getProjectionStatus`) + the layout-memory blob reader
//     (`project_ui_state.layout_json`);
//   · the tree/lifecycle/overview/dock/split/window dialects the SC legs
//     proved in place (C3 tree rows + C8 lifecycle menus, the C7 confirm
//     card's probe states, the C5 dock's 挂接历史 rows, the C9 split controls,
//     the C10 detached windows).
//
// Isolation model (gen-test-scripts): every spec file owns its worlds;
// strictly ONE live app instance at a time (the single-instance lock
// discipline — workers:1 lane plus the launch-time probe), and everything
// torn down in afterAll regardless of outcome. No cross-file state.

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { createDispatchStub, type DispatchStub } from '../../stubs/dispatch.ts'
import { captureMainStdout, freshRoot, normPath, type KernelWorld } from './journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The M4 app world (launch → uiReady → tree-row activation)
// ---------------------------------------------------------------------------

/** The M4 boot env (isolated DSH_HOME + a present stub credential). */
export function m4Env(dshHome: string, extra: Record<string, string> = {}): Record<string, string> {
  return { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'm4-e2e-stub-key', ...extra }
}

/** One launched M4 app world (the shell over one kernel + one DSH_HOME). */
export interface M4World {
  readonly tag: string
  readonly shell: PluginShell
  readonly page: Page
  readonly kernel: KernelWorld
  readonly root: string
  readonly dshHome: string
  readonly stub: DispatchStub | null
  /** Main-process stdout captured from launch (log-level assertion anchor). */
  readonly mainLog: readonly string[]
}

export interface M4BootOptions {
  /** Extra env after everything else (fault seams etc; wins conflicts). */
  readonly env?: Record<string, string>
  /** Launch with the dispatch stub env pair (default false for M4 journeys). */
  readonly stub?: boolean
  /** Skip the instance-lock probe (default false — the Hard Rule runs it). */
  readonly skipLockProbe?: boolean
  /** The journey root (freshRoot caller's tag already names it). */
  readonly root: string
  readonly dshHome: string
  readonly kernel: KernelWorld
  readonly tag: string
}

/** Boot one M4 world: lock probe → launch (isolated DSH_HOME) → uiReady. */
export async function bootM4World(options: M4BootOptions): Promise<M4World> {
  if ((options.skipLockProbe ?? false) === false) assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
  const stub = (options.stub ?? false) === true ? createDispatchStub(join(options.root, 'dispatch-stub')) : null
  const shell = await launchWorkbenchShell({
    userDataDir: options.kernel.userDataDir,
    rootDir: options.root,
    ...(stub === null ? {} : { stubEnv: stub.env }),
    ...(options.env === undefined ? {} : { env: options.env }),
  })
  const mainLog = captureMainStdout(shell)
  await shell.uiReady()
  await shell.page.emulateMedia({ reducedMotion: 'reduce' })
  return {
    tag: options.tag,
    shell,
    page: shell.page,
    kernel: options.kernel,
    root: options.root,
    dshHome: options.dshHome,
    stub,
    mainLog,
  }
}

/**
 * The per-file M4 world manager: strictly ONE live app instance at a time
 * (`acquire` closes the previous world first), everything torn down by
 * `closeAll` (wire into afterAll). `adopt` registers an externally-booted
 * world (relaunch legs) as the live one.
 */
export class M4WorldManager {
  private readonly roots = new Set<string>()
  private world: M4World | null = null

  async acquire(boot: () => Promise<M4World>): Promise<M4World> {
    await this.closeLive()
    const world = await boot()
    this.world = world
    this.roots.add(world.root)
    return world
  }

  adopt(world: M4World): void {
    this.world = world
    this.roots.add(world.root)
  }

  get live(): M4World | null {
    return this.world
  }

  private async closeLive(): Promise<void> {
    const world = this.world
    if (world === null) return
    this.world = null
    await world.shell.close().catch(() => {})
  }

  /** Close the live app + remove every tracked journey root (afterAll face). */
  async closeAll(options: { removeRoot?: boolean } = {}): Promise<void> {
    await this.closeLive()
    if ((options.removeRoot ?? true) === true) {
      for (const root of this.roots) removeRoot(root)
      this.roots.clear()
    }
  }
}

/** Remove one journey root tolerantly (Windows handle-release race face). */
export function removeRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch (error) {
    console.warn(`[m4-world] temp root teardown deferred (OS will reclaim): ${String(error)}`)
  }
}

export { freshRoot }

// ---------------------------------------------------------------------------
// The renderer verb face + the tree activation dialect (sc1/sc3 pattern)
// ---------------------------------------------------------------------------

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
export async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

/** The conversation-ready signal (the native new-session surface). */
export const newSessionButton = (page: Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

/** Activate one project through its tree row (原位换台 #28 的用户径). */
export async function activateProjectByTreeRow(page: Page, projectId: string): Promise<void> {
  const row = page.locator(`[data-dsh-forge-tree-project="${projectId}"]`)
  await expect(row, '注册行在树在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(row, '激活后左栏项目行 aria-current(树行语言)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
  const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
  expect(state.activeProjectId, '激活指针读数 = 目标项目').toBe(projectId)
}

/** Expand one project's tree group through the caret (the user path). */
export async function ensureProjectGroupExpanded(page: Page, projectId: string): Promise<void> {
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

/** Open one session through the tree row (attachment-first, then click). */
export async function openTreeSession(page: Page, sessionId: string): Promise<void> {
  const row = page.locator(`[data-dsh-forge-tree-session="${sessionId}"]`).first()
  const attached = await row.waitFor({ state: 'attached', timeout: 45_000 }).then(() => true, () => false)
  if (!attached) {
    throw new Error(`session row ${sessionId} never attached (home-list hydration / workspace grouping)`)
  }
  await clickStable(page, `[data-dsh-forge-tree-session="${sessionId}"]`)
  await expect(page.locator(`[data-dsh-forge-tree-session="${sessionId}"]`),
    `会话 ${sessionId} 打开(树行 aria-current)`).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Onboarding dismissers (sc3/sc4/sc7 discipline: UPSTREAM modals only)
// ---------------------------------------------------------------------------

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
export function startAutoDismiss(page: Page): () => void {
  let stopped = false
  void (async () => {
    while (!stopped) {
      await dismissOnboarding(page).catch(() => {})
      await page.waitForTimeout(500).catch(() => {})
    }
  })()
  return () => { stopped = true }
}

// ---------------------------------------------------------------------------
// Interaction determinism (sc4/sc7 discipline)
// ---------------------------------------------------------------------------

/** Click one locator RETRYING across pane re-layouts (DOM clicks after the
 * first grace attempts fire the React handler reliably). */
export async function clickStable(page: Page, selector: string): Promise<void> {
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
 * Click one control whose SUCCESS UNMOUNTS IT (the session-open [打开] rows):
 * success is decided by the POSTCONDITION predicate, never the target's
 * survival (sc7's clickSelfUnmounting).
 */
export async function clickSelfUnmounting(page: Page, selector: string, landed: () => Promise<boolean>): Promise<void> {
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
 * session's fresh collapsed surface. */
export function sessionOpenLanded(page: Page): () => Promise<boolean> {
  return async () => await page.evaluate(() => {
    const panel = document.querySelector('[data-sidebar-right-panel]')
    return panel !== null && !panel.hasAttribute('data-sidebar-right-open')
  }).catch(() => false)
}

// ---------------------------------------------------------------------------
// The rightbar dialect (sc2/sc7 vocabulary)
// ---------------------------------------------------------------------------

/** DOM-click one rightbar tab chip by its exact text. */
export async function clickRightbarChip(page: Page, label: string): Promise<boolean> {
  return await page.evaluate((text: string) => {
    const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
    const chip = tabs.find(tab => tab.textContent?.trim() === text)
    if (chip === undefined) return false
    ;(chip as HTMLElement).click()
    return true
  }, label)
}

/** Expand the native right column (the collapsed-state edge affordance). */
export async function expandRightbar(page: Page): Promise<void> {
  const panel = page.locator('[data-sidebar-right-panel]').first()
  if (await panel.getAttribute('data-sidebar-right-open') === null) {
    await page.locator('[data-sidebar-right-expand]').first().click()
  }
  await expect(panel).toHaveAttribute('data-sidebar-right-open', /.*/, { timeout: 15_000 })
}

/**
 * Bring the ACTIVE project's 项目概览 pane forward (the projection status
 * row's host; postcondition = the overview title matches the expected
 * project name — the store-binding arbiter, sc3-degrade pattern).
 */
export async function openOverviewForActiveProject(page: Page, expectedTitle: string, treeRowSelector?: string): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    if (treeRowSelector !== undefined && (round === 6 || round === 12 || round === 18)) {
      await page.locator(treeRowSelector).click().catch(() => {})
    }
    const ready = await page.evaluate((title: string) => {
      const panel = document.querySelector('[data-sidebar-right-panel]')
      if (panel !== null && !panel.hasAttribute('data-sidebar-right-open')) {
        ;(document.querySelector('[data-sidebar-right-expand]') as HTMLElement | null)?.click()
        return false
      }
      const overview = document.querySelector('[data-dsh-forge-overview]') as HTMLElement | null
      const visible = overview !== null && overview.offsetParent !== null
      const shownTitle = document.querySelector('[data-dsh-forge-overview-title]')?.textContent?.trim() ?? ''
      if (visible && shownTitle === title) return true
      const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
      const chip = tabs.find(tab => /^(项目概览|Project overview)$/.test(tab.textContent?.trim() ?? ''))
      if (chip !== undefined) {
        ;(chip as HTMLElement).click()
        return false
      }
      ;(document.querySelector('[data-dsh-forge-guide-card="overview"]') as HTMLElement | null)?.click()
      return false
    }, expectedTitle).catch(() => false)
    if (ready) return
    await page.waitForTimeout(500)
  }
  throw new Error(`overview pane never showed the active project ${expectedTitle}`)
}

/** Activate one overview SUBTAB (postcondition = selected + pane visible). */
export async function focusOverviewSubtab(page: Page, kind: 'proposals' | 'features' | 'tasks', paneRoot: string): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const active = await page.evaluate((input: { kind: string, pane: string }) => {
      const overview = document.querySelector('[data-dsh-forge-overview]')
      const overviewVisible = overview !== null && (overview as HTMLElement).offsetParent !== null
      if (!overviewVisible) {
        const chip = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
          .find(tab => /^(项目概览|Project overview)$/.test(tab.textContent?.trim() ?? ''))
        ;(chip as HTMLElement | null)?.click()
        return false
      }
      const tab = document.querySelector(`[data-dsh-forge-overview-subtab="${input.kind}"]`)
      const selected = tab?.getAttribute('aria-selected') === 'true'
      const pane = document.querySelector(input.pane)
      const visible = pane !== null && (pane as HTMLElement).offsetParent !== null
      return selected && visible
    }, { kind, pane: paneRoot }).catch(() => false)
    if (active) return
    await clickStable(page, `[data-dsh-forge-overview-subtab="${kind}"]`).catch(() => {})
    await page.waitForTimeout(600)
  }
  throw new Error(`overview subtab never activated: ${kind}`)
}

/**
 * Bring the 项目概览 tasks pane forward and open one task's detail dock
 * (the overview tasks row seam first, the board row/card second — sc7).
 */
export async function openTaskDetail(page: Page, taskKey: string): Promise<void> {
  const dock = page.locator(`[data-dsh-forge-task-detail="${taskKey}"]`)
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await expandRightbar(page)
    // Opener A — the overview tasks subtab row.
    for (let round = 0; round < 8; round += 1) {
      const overviewLive = await page.evaluate(() => {
        const overview = document.querySelector('[data-dsh-forge-overview]')
        return overview !== null && (overview as HTMLElement).offsetParent !== null
      }).catch(() => false)
      if (overviewLive) break
      await clickRightbarChip(page, '项目概览')
      await page.waitForTimeout(600)
    }
    await clickStable(page, '[data-dsh-forge-overview-subtab="tasks"]').catch(() => {})
    const overviewRow = page.locator(`[data-dsh-forge-overview-task="${taskKey}"]`).first()
    if (await overviewRow.isVisible().catch(() => false)) {
      await clickStable(page, `[data-dsh-forge-overview-task="${taskKey}"]`)
      if (await dock.waitFor({ state: 'attached', timeout: 6_000 }).then(() => true, () => false)) return
    }
    // Opener B — the board pane's own row/card.
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

/** Expand one 挂接历史 row, RETRYING across dock re-feeds. */
export async function expandLinkRow(page: Page, sessionId: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// The live native registry reader ($DSH_HOME/storages/workspace.json)
// ---------------------------------------------------------------------------

/** 实况 workspace 行(注册表序中的消费面三列 + 归组账)。 */
export interface LiveWorkspaceRow {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/** 一次实况读取(缺文件 = null:bootstrap 未落笔)。 */
export interface LiveRegistry {
  readonly initialized: boolean
  readonly order: readonly LiveWorkspaceRow[]
}

/** path 折叠键(小写 + 正斜杠,seat 配对同口径)。 */
export const foldPath = (path: string): string => normPath(path).toLowerCase().replace(/\/+$/, '')

/** 读实况注册表(原子重写的 durable 面;文件缺席 = null)。 */
export function readLiveRegistry(dshHome: string): LiveRegistry | null {
  const file = join(dshHome, 'storages', 'workspace.json')
  if (!existsSync(file)) return null
  let parsed: {
    unit?: { name?: string }
    global?: { initialized?: boolean; workspaceIds?: string[] } | null
    tables?: { workspaces?: Record<string, { path: string; title: string; sessionIds: string[] }> } | null
  }
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as typeof parsed
  } catch {
    return null
  }
  if (parsed.unit?.name !== 'workspace') return null
  const records = parsed.tables?.workspaces ?? {}
  const order = (parsed.global?.workspaceIds ?? [])
    .map(id => {
      const record = records[id]
      return record === undefined ? undefined : { workspaceId: id, ...record, sessionIds: [...record.sessionIds] }
    })
    .filter((row): row is LiveWorkspaceRow => row !== undefined)
  return { initialized: parsed.global?.initialized === true, order }
}

/** 实况内按锚点路径定位行(canonical 折叠匹配;缺 = undefined)。 */
export const rowAtAnchor = (registry: LiveRegistry, anchor: string): LiveWorkspaceRow | undefined =>
  registry.order.find(row => foldPath(row.path) === foldPath(anchor))

/** 轮询实况直到谓词成立(投影 push → relay → 上游动词 → durable 落笔全异步)。 */
export async function waitForRegistry(
  page: Page, dshHome: string,
  predicate: (registry: LiveRegistry) => boolean,
  label: string, timeoutMs = 20_000,
): Promise<LiveRegistry> {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 200); attempt += 1) {
    const registry = readLiveRegistry(dshHome)
    if (registry !== null && predicate(registry)) return registry
    await page.waitForTimeout(200)
  }
  const last = readLiveRegistry(dshHome)
  throw new Error(`live workspace registry never reached: ${label} — last read ${JSON.stringify(last)}`)
}

// ---------------------------------------------------------------------------
// The projection status kernel face (getProjectionStatus via the bridge)
// ---------------------------------------------------------------------------

/** getProjectionStatus 行(消费面子集)。 */
export interface StatusRowView {
  readonly projectId: string
  readonly displayName: string
  readonly state: 'pending' | 'healthy' | 'degraded' | 'deviation'
  readonly lastError: string | null
  readonly pushedAt: string | null
  readonly archived: boolean
  readonly deviations: ReadonlyArray<{ type: 'renamed' | 'deleted' | 'reordered'; detail: string }>
}

/** 全量状态行(bridgeInvoke 直读内核;GUI 面另行断言)。 */
export async function statusRows(page: Page): Promise<StatusRowView[]> {
  return await bridgeInvoke<StatusRowView[]>(page, 'getProjectionStatus', [{}])
}

/** The active project's 投影状态行 locator(概览宿主;state 面向断言)。 */
export const projectionStatusRow = (page: Page) => page.locator('[data-dsh-forge-projection-status]')

/** 轮询单项目状态行直到谓词成立(对账 debounce + relay 回填全异步)。 */
export async function waitForStatus(
  page: Page, projectId: string,
  predicate: (row: StatusRowView) => boolean, label: string, timeoutMs = 20_000,
): Promise<StatusRowView> {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 250); attempt += 1) {
    const row = (await statusRows(page)).find(candidate => candidate.projectId === projectId)
    if (row !== undefined && predicate(row)) return row
    await page.waitForTimeout(250)
  }
  const rows = await statusRows(page)
  throw new Error(`projection status never reached: ${label} — last rows ${JSON.stringify(rows)}`)
}

/** 投影面活动行数(plan 发出 + 快照上报)。 */
export const projectionActivityCount = (mainLog: readonly string[]): number =>
  mainLog.filter(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT') || line.includes('WORKBENCH_PROJECTION_PUSH')).length

/**
 * 投影面静默门:活动行数连续 ~1.2s 无增长 = 延迟收敛腿全部落定(手改注入
 * 前置门;healthy 状态本身不足以证明静默)。
 */
export async function waitForProjectionQuiescence(page: Page, mainLog: readonly string[], timeoutMs = 20_000): Promise<void> {
  let stableRounds = 0
  let lastCount = projectionActivityCount(mainLog)
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 300); attempt += 1) {
    await page.waitForTimeout(300)
    const count = projectionActivityCount(mainLog)
    stableRounds = count === lastCount ? stableRounds + 1 : 0
    lastCount = count
    if (stableRounds >= 4) return
  }
  throw new Error('projection plane never went quiescent')
}

// ---------------------------------------------------------------------------
// The layout-memory blob reader (project_ui_state.layout_json)
// ---------------------------------------------------------------------------

/** The stored ProjectLayout blob of one project (SQLite beside the live app). */
export async function readLayoutBlob(userDataDir: string, projectId: string): Promise<Record<string, unknown> | undefined> {
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

// ---------------------------------------------------------------------------
// The C8 lifecycle tree dialect (sc3-sync pattern)
// ---------------------------------------------------------------------------

/** One project tree row's session ids (active or archived row scoping). */
export async function sessionsInProjectBlock(page: Page, projectId: string): Promise<string[] | null> {
  return await page.evaluate((id: string) => {
    const row = document.querySelector(`[data-dsh-forge-tree-project="${id}"]`)
      ?? document.querySelector(`[data-dsh-forge-tree-archived-row="${id}"]`)
    if (row === null) return null
    const block = row.parentElement
    if (block === null) return []
    return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
      .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
  }, projectId)
}

/** The 未分组 block's session ids(块缺席 = null)。 */
export async function ungroupedSessionIds(page: Page): Promise<string[] | null> {
  return await page.evaluate(() => {
    const header = document.querySelector('[data-dsh-forge-tree-ungrouped]')
    if (header === null) return null
    const block = header.parentElement
    if (block === null) return []
    return [...block.querySelectorAll('[data-dsh-forge-tree-session]')]
      .map(el => el.getAttribute('data-dsh-forge-tree-session') ?? '')
  })
}

/** 打开一行的 C8 生命周期 ⋯ 菜单(active 行与归档行同一组件面)。 */
export async function openLifecycleMenu(page: Page, projectId: string): Promise<void> {
  const row = page.locator(
    `[data-dsh-forge-tree-project="${projectId}"], [data-dsh-forge-tree-archived-row="${projectId}"]`,
  ).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.hover()
  const more = page.locator(`[data-dsh-forge-tree-project-more="${projectId}"]`)
  await expect(more, '⋯ 尾动作在场(hover 揭示)').toBeVisible({ timeout: 5_000 })
  await more.click()
  await expect(page.locator(`[data-dsh-forge-tree-project-menu="${projectId}"]`),
    '生命周期菜单在座').toBeVisible({ timeout: 5_000 })
}

/** 菜单项点击(词面 = zh locale 键值;菜单一次仅一行持有)。 */
export async function clickMenuItem(page: Page, projectId: string, label: RegExp): Promise<void> {
  const item = page.locator(`[data-dsh-forge-tree-project-menu="${projectId}"] [role="menuitem"]`, { hasText: label })
  await expect(item).toBeVisible({ timeout: 5_000 })
  await item.click()
}

// ---------------------------------------------------------------------------
// The C9 split dialect (sc4 pattern)
// ---------------------------------------------------------------------------

/** The 工作台头 [分屏] → 看板 pick (the C9 user path; DOM clicks throughout). */
export async function pickSplitBoard(page: Page): Promise<void> {
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
  throw new Error('[分屏] → 看板 never landed (the utilities seat needs a session body)')
}

/**
 * Drive the column to the C9 split-ACTIVE state (≥2 C9 panes → the pane 头 +
 * 分隔条 render). The vendored budget is TWO docked panes, so the reachable
 * real-chain split is a board tab in EACH pane (sc4 口径).
 */
export async function ensureSplitActive(page: Page): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const active = await page.evaluate(() =>
      document.querySelector('[data-dsh-forge-split-separator]') !== null)
    if (active) return
    await expandRightbar(page).catch(() => {})
    if (round > 0) await clickRightbarChip(page, '开始')
    await pickSplitBoard(page)
    await page.waitForTimeout(700)
  }
  throw new Error('C9 split never became active (≥2 C9 panes)')
}

/** The separator's committed percentage (the model ratio's aria face). */
export async function splitRatioPercent(page: Page): Promise<string | null> {
  return await page.evaluate(() =>
    document.querySelector('[data-dsh-forge-split-separator]')?.getAttribute('aria-valuenow') ?? null)
}

/**
 * Adjust the split ratio through the 分隔条 keyboard model (focus by click,
 * Home = 复位 50/50, two Shift+← large steps → 30% — the C9 band's floor).
 */
export async function commitSplitRatioToFloor(page: Page): Promise<void> {
  const separator = page.locator('[data-dsh-forge-split-separator]').first()
  await separator.click({ timeout: 10_000 })
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
}
