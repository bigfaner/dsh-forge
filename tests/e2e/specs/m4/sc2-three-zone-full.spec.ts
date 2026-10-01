// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc2
// Traceability: docs/features/dsh-forge-m4/tasks/2.10-sc2-full-regression-inventory.md (AC-1)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios(SC2 全量腿)、
// prd-spec §Success Criteria SC2(三区容器 + M3 面零缩水收纳 + 知识区零空占位)、
// §导航迁移清单(必答② 第③④行 收纳重组的 pane 宿主)、ui-design §Component C2
// (右栏 dockkit:开始/概览/文档/依赖图/看板)+ §页面总览(收纳宿主对照)。
//
// SC2 全量腿(2.10 口径 = 1.8 布局腿之上的右栏 M3 面收纳深度):
//
//   ① 三区同页:左栏 forge 项目树座位 + 中间原生会话面板 + 右栏 forge tabs
//      宿主同 document 同页(1.8 布局腿证容器;本腿证承载内容);
//   ② 右栏 M3 面收纳零缩水(forge 文件区 = 右栏概览子 tab):提案/feature/
//      任务三子 tab 逐面「既有操作可达」—— 提案面(目录行 + 状态 Pill +
//      proposal/eval 开文档 tab + feature 互跳)、feature 面(目录行 + 状态 +
//      文档行开文档 tab)、任务面(执行中段 + 全量列表 + 行点击 → 任务详情
//      dock + 看板 tab 前置)+ 任务看板 tab(2.1 双宿主 TasksView 完整面:
//      节点全集 + 派发入口/多选链可达)+ 文档 tab(路径栏 + 只读正文)+
//      依赖图 tab(feature 名即下拉 + DAG/泳道双模式);
//   ③ 知识区零空占位:子 tab 呈现真实语料数据(非预置占位);无空 tab/
//      空视图(不建空占位纪律);conversation 侧零 forge main 内景。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { rmSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { buildKernelWorld, freshRoot, type KernelWorld } from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The corpus: one project — a feature (3 doc kinds + 1 stage asset), three
// tasks (in-progress + zero-dep pending + a dependency edge), two proposals
// (one feature-associated WITH eval, one orphan draft).
// ---------------------------------------------------------------------------

const FEATURE = 'sc2-full'
const TASK_EXEC = `${FEATURE}/1.1` // in_progress, no active link → 执行中段 idle
const TASK_FREE = `${FEATURE}/1.2` // zero-dep pending (dispatchable)
const TASK_DEP = `${FEATURE}/1.3` // deps [1.2] → the DAG carries an edge
const PROP_LINKED = FEATURE // slug === feature slug → the 互跳 chip corpus
const PROP_ORPHAN = 'sc2-orphan-proposal'

function sc2FullKernel(root: string): Promise<KernelWorld> {
  return buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['prd', 'design', 'tasks'], seed: 'dsh-forge-m4-sc2-full' },
    tasks: [
      { stem: '1.1', localId: '1.1', title: 'sc2 full in-progress task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc2 full dispatchable task', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.3', localId: '1.3', title: 'sc2 full dependent task', status: 'pending', type: 'coding.feature', dependencies: ['1.2'] },
    ],
    stageAssets: [
      { stage: 'design', goal: 'sc2 full stage asset', summaryMark: '阶段资产行(概览 feature 面 corpus)。' },
    ],
    proposals: [
      {
        slug: PROP_LINKED, status: 'accepted', author: 'sc2-author', created: '2026-09-28T10:00:00.000Z',
        title: 'SC2 全量腿关联提案', mark: 'feature 关联提案(互跳 chip 语料)。', evalReport: '# SC2 eval 报告\n\neval 文档行语料。\n',
      },
      { slug: PROP_ORPHAN, status: 'draft', author: 'sc2-author', created: '2026-09-28T11:00:00.000Z', title: 'SC2 孤儿提案', mark: '无关联 feature、无 eval。' },
    ],
  })
}

// ---------------------------------------------------------------------------
// Renderer helpers (the sc7-proven rightbar navigation vocabulary)
// ---------------------------------------------------------------------------

/** The conversation-ready signal (the native new-session surface). */
const newSessionButton = (page: Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

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

/** Click one locator RETRYING across pane re-layouts (the pane DOM is
 * near-static; a positioned/DOM click after the first grace attempts is
 * safe — the sc7 discipline). */
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

/** Bring the 项目概览 tab forward (chip, or the 开始页 card on a fresh
 * column) and wait for its body. */
async function focusOverview(page: Page): Promise<void> {
  await expandRightbar(page)
  for (let round = 0; round < 10; round += 1) {
    const live = await page.evaluate(() => {
      const overview = document.querySelector('[data-dsh-forge-overview]')
      return overview !== null && (overview as HTMLElement).offsetParent !== null
    })
    if (live) break
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
}

/**
 * Activate one overview SUBTAB, retrying across overview-body re-mounts (a
 * re-mount — e.g. the rightbar churn a doc open causes — resets the subtab
 * to the default 'features'; the aria-selected + visible-pane postcondition
 * is the arbiter, never the click).
 */
async function focusSubtab(page: Page, kind: 'proposals' | 'features' | 'tasks', paneRoot: string): Promise<void> {
  for (let round = 0; round < 8; round += 1) {
    await focusOverview(page)
    const active = await page.evaluate((input: { kind: string, pane: string }) => {
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
 * Activate one SUBTAB and expand one directory row ATOMICALLY — both DOM
 * clicks ride ONE evaluate round-trip (the session-scoped right column can
 * re-mount the overview body between protocol round-trips, resetting BOTH
 * the active subtab and the pane's expansion set; a one-tick dispatch leaves
 * no churn window). Self-healing parity: a persisted-but-hidden expansion
 * simply toggles again on the next attempt.
 */
async function activateSubtabAndExpand(
  page: Page,
  subtab: { kind: 'proposals' | 'features' | 'tasks', paneRoot: string },
  dirSelector: string,
  markerSelector: string,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await focusOverview(page)
    const acted = await page.evaluate((input: { kind: string, pane: string, dir: string, marker: string }) => {
      const pane = document.querySelector(input.pane)
      const paneVisible = pane !== null && (pane as HTMLElement).offsetParent !== null
      if (!paneVisible) {
        const tab = document.querySelector(`[data-dsh-forge-overview-subtab="${input.kind}"]`) as HTMLElement | null
        tab?.click()
        const dir = document.querySelector(input.dir) as HTMLElement | null
        dir?.click()
        return 'dispatched'
      }
      const row = document.querySelector(input.dir)
      if (row?.getAttribute('aria-expanded') !== 'true') {
        ;(row as HTMLElement).click()
        return 'toggled'
      }
      return 'settled'
    }, { kind: subtab.kind, pane: subtab.paneRoot, dir: dirSelector, marker: markerSelector }).catch(() => null)
    void acted
    const done = await page.evaluate((input: { dir: string, marker: string, kind: string }) => {
      const tab = document.querySelector(`[data-dsh-forge-overview-subtab="${input.kind}"]`)
      const selected = tab?.getAttribute('aria-selected') === 'true'
      const row = document.querySelector(input.dir)
      const open = row?.getAttribute('aria-expanded') === 'true'
      const marker = document.querySelector(input.marker)
      const markerVisible = marker !== null && (marker as HTMLElement).offsetParent !== null
      return selected && open && markerVisible
    }, { dir: dirSelector, marker: markerSelector, kind: subtab.kind }).catch(() => false)
    if (done) return
    await page.waitForTimeout(600)
  }
  throw new Error(`subtab+dir never settled: ${subtab.kind} / ${dirSelector}`)
}

test('sc2/three-zone-full: 三区同页 + 右栏 M3 面收纳零缩水(提案/feature/任务逐面操作可达 + 文档/依赖图 tab)+ 知识区零空占位', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc2-full')
  const kernel = await sc2FullKernel(root)
  let shell: PluginShell | undefined
  try {
    shell = await launchWorkbenchShell({ userDataDir: kernel.userDataDir, rootDir: kernel.root })
    const { page } = shell
    await shell.uiReady()
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // ---- ① 三区同页 ------------------------------------------------------
    // 左栏 = forge 项目树座位;激活走树行点击(原位换台唯一口径)。
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow, '左栏项目树座位呈现注册行').toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow).toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    // 中间 = 原生会话面板;右栏 = 原生 rightbar(forge tabs 宿主);同页判据。
    await expect(page.locator('[data-dsh-forge-shell]'),
      '中间 = 原生 conversation(零 forge main 挂载)').toHaveCount(0)
    await expect(newSessionButton(page), 'conversation 交互面在场').toBeVisible()
    await expandRightbar(page)
    const samePage = await page.evaluate(() => ({
      seat: document.querySelector('[data-dsh-forge-project-seat]') !== null,
      rightbar: document.querySelector('[data-sidebar-right-panel]') !== null,
      shell: document.querySelector('[data-dsh-forge-shell]') !== null,
    }))
    expect(samePage, '三区同 document 同页(树座位 + conversation + rightbar)').toEqual({
      seat: true, rightbar: true, shell: false,
    })

    // ---- ② 概览 tab:三子 tab + 逐面既有操作可达 -------------------------
    await focusOverview(page)
    // 三子 tab 齐备(提案/feature/任务 —— M3 面收纳宿主,零缺面)。
    for (const kind of ['proposals', 'features', 'tasks'] as const) {
      await expect(page.locator(`[data-dsh-forge-overview-subtab="${kind}"]`),
        `概览子 tab ${kind} 在场(收纳宿主三面齐备)`).toBeVisible()
    }
    // 概要信息区常显(标题栏 = 项目名 + 概要行;不随子 tab 切换变化)。
    const overviewHeaderName = await page.evaluate(() => {
      const overview = document.querySelector('[data-dsh-forge-overview]')
      return overview?.textContent ?? ''
    })
    expect(overviewHeaderName, '概览承载真实语料(项目名在场)').toContain(FEATURE)

    // ---- ②-face feature 子 tab(默认子 tab;M3 feature 面)--------------
    await focusSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await expect(page.locator(`[data-dsh-forge-overview-feature-dir="${FEATURE}"]`),
      'feature 目录行在场(slug 起 + 状态)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-feature-status="${FEATURE}"]`),
      'feature 状态词在场(M3 词表直透)').toContainText('in-progress')
    await activateSubtabAndExpand(page,
      { kind: 'features', paneRoot: '[data-dsh-forge-overview-features]' },
      `[data-dsh-forge-overview-feature-dir="${FEATURE}"]`,
      `[data-dsh-forge-overview-doc="features/${FEATURE}/prd"]`)
    // 文档行 = M3 既有 docKind 集(canonical 序;缺席 kind 不虚构 —— 零空占位)。
    for (const kind of ['prd', 'design', 'tasks'] as const) {
      await expect(page.locator(`[data-dsh-forge-overview-doc="features/${FEATURE}/${kind}"]`),
        `feature 文档行 ${kind} 在场(点文档名开文档 tab)`).toBeVisible()
    }
    // 既有操作:点文档名 → 文档 tab(路径栏 + 只读正文)。
    await clickStable(page, `[data-dsh-forge-overview-doc="features/${FEATURE}/prd"]`)
    await expect(page.locator('[data-dsh-forge-doc="docs/features/sc2-full/prd"]'),
      '文档 tab 打开(prd;路径身份 = data 面)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-doc-reload]'),
      '文档 tab 既有操作可达(↻ 重读)').toBeVisible()
    await expect(page.locator('[data-dsh-forge-doc="docs/features/sc2-full/prd"] [data-dsh-forge-doc-path]'),
      '路径栏 h38 呈现全路径(路径身份)').toHaveText('docs/features/sc2-full/prd')
    const prdBody = await page.evaluate(() =>
      document.querySelector('[data-dsh-forge-doc="docs/features/sc2-full/prd"]')?.textContent ?? '')
    expect(prdBody.trim().length, '只读正文渲染真实语料(非空占位)').toBeGreaterThan(0)

    // ---- ②-face 提案 子 tab(M3 提案板收纳;目录树方言)------------------
    // 文档 tab 打开后概览退居后台(chip 切回;子 tab 面仍在挂载)。
    await focusSubtab(page, 'proposals', '[data-dsh-forge-overview-proposals]')
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`),
      '提案目录行在场(关联提案)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_ORPHAN}"]`),
      '提案目录行在场(孤儿提案)').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-overview-prop-feature="${FEATURE}"]`),
      '关联提案 feature 互跳 chip 在场(M3 互跳面)').toBeVisible()
    // 既有操作:展开 → proposal/eval 文档行 → 开文档 tab(multiple)。
    await activateSubtabAndExpand(page,
      { kind: 'proposals', paneRoot: '[data-dsh-forge-overview-proposals]' },
      `[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`,
      `[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/proposal"]`)
    await expect(page.locator(`[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/proposal"]`),
      'proposal 文档行在场(展开后)').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/eval"]`),
      'eval 文档行在场(hasEval 语料)').toBeVisible()
    await clickStable(page, `[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/proposal"]`)
    await expect(page.locator('[data-dsh-forge-doc="docs/proposals/sc2-full/proposal.md"]'),
      '第二文档 tab 打开(doc kind multiple;提案正文)').toBeVisible({ timeout: 15_000 })
    // 既有操作:feature 互跳 chip → feature 子 tab + 目标目录展开(原子重试
    // —— 互跳 = 子 tab 切换 + focus 展开,两态一体断言)。
    let jumped = false
    for (let attempt = 0; attempt < 10 && !jumped; attempt += 1) {
      await focusOverview(page)
      await page.evaluate((slug: string) => {
        const chip = document.querySelector(`[data-dsh-forge-overview-prop-feature="${slug}"]`) as HTMLElement | null
        chip?.click()
      }, FEATURE).catch(() => {})
      jumped = await page.evaluate((slug: string) => {
        const tab = document.querySelector('[data-dsh-forge-overview-subtab="features"]')
        const selected = tab?.getAttribute('aria-selected') === 'true'
        const dir = document.querySelector(`[data-dsh-forge-overview-feature-dir="${slug}"`)
        return selected && dir?.getAttribute('aria-expanded') === 'true'
      }, FEATURE).catch(() => false)
      if (!jumped) await page.waitForTimeout(600)
    }
    expect(jumped, '互跳 chip → feature 子 tab + 目标目录展开(M3 badge-jump 的 pane 形态)').toBe(true)

    // ---- ②-face 任务 子 tab(M3 任务面收纳)------------------------------
    await focusSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    await expect(page.locator('[data-dsh-forge-overview-tasks]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-overview-tasks-idle]'),
      '执行中段 idle 文案(in_progress 无 active 挂接 = 非执行中,BIZ-workbench-008)').toBeVisible({ timeout: 20_000 })
    for (const key of [TASK_EXEC, TASK_FREE, TASK_DEP]) {
      await expect(page.locator(`[data-dsh-forge-overview-task="${key}"]`),
        `任务列表行 ${key} 在场(M3 短状态词表)`).toBeVisible({ timeout: 20_000 })
    }
    // 既有操作:行点击 → 任务详情 dock + 看板 tab 前置(ensureBoardActive)。
    await clickStable(page, `[data-dsh-forge-overview-task="${TASK_FREE}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_FREE}"]`),
      '任务详情 dock 打开(行点击 → C5 面可达)').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')

    // ---- ② 任务看板 tab(2.1 双宿主 TasksView 完整面,零缩水)------------
    await expect(page.locator('[data-dsh-forge-task-board]'),
      '看板 tab 前置(pane 形态 TasksView 挂载)').toBeVisible({ timeout: 20_000 })
    for (const key of [TASK_EXEC, TASK_FREE, TASK_DEP]) {
      await expect(page.locator(`[data-dsh-forge-node-card="${key}"]`),
        `看板节点全集含 ${key}(DAG 视图 = 默认视图 A)`).toBeVisible({ timeout: 20_000 })
    }
    // 既有操作:派发入口 → 多选链 → 取消(M3 发起链入口面可达)。
    const entry = page.locator('[data-dsh-forge-dispatch-entry]')
    await expect(entry, '派发入口在场(M3 发起链原位保留)').toBeVisible({ timeout: 15_000 })
    await expect(entry).toHaveAttribute('data-dsh-forge-dispatch-entry-active', 'false', { timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-dispatch-entry]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '多选链进入(选择层激活)').toBeVisible({ timeout: 10_000 })
    await clickStable(page, `[data-dsh-forge-select-chk="${TASK_FREE}"] [data-dsh-forge-select-chk-input]`)
    await expect(page.locator('[data-dsh-forge-dispatch-count]'),
      '选中计数在座(多选面)').toContainText('1')
    await clickStable(page, '[data-dsh-forge-dispatch-cancel]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '取消退出选择层(链路可退出,零悬挂面)').toHaveCount(0, { timeout: 10_000 })

    // ---- ② 依赖图 tab(feature 名即下拉 + DAG/泳道双模式)----------------
    await focusSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    await clickStable(page, '[data-dsh-forge-overview-depgraph-open]')
    await expect(page.locator(`[data-dsh-forge-depgraph="${FEATURE}"]`),
      '依赖图 tab 打开(feature 选择落在活跃 feature)').toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-dsh-forge-depgraph-mode="dag"]'),
      'DAG 模式分段钮在场(默认)').toBeVisible()
    // 既有操作:双模式切换(模式随会话保留)。
    await clickStable(page, '[data-dsh-forge-depgraph-mode="lane"]')
    await expect(page.locator('[data-dsh-forge-depgraph-lanes]'),
      '泳道图模式切换可达(状态分组七态列)').toBeVisible({ timeout: 10_000 })

    // ---- ③ 知识区零空占位 ------------------------------------------------
    // 子 tab 呈现真实语料(上文逐面已证 ≥1 真实行);无空 tab/空视图:
    // conversation 侧零 forge main 内景,forge tabs 均为用户打开(无预置)。
    await expect(page.locator('[data-dsh-forge-shell]'),
      'conversation 侧零 forge main 内景(无预置视图)').toHaveCount(0)
    const tabChips = await page.evaluate(() =>
      [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
        .map(tab => tab.textContent?.trim() ?? ''))
    expect(tabChips, '在场 tab 均为用户打开的功能面(概览/文档/依赖图/看板,无空 tab)').toEqual(
      expect.arrayContaining(['项目概览', '任务看板']))

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
