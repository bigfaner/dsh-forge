// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc5
// Traceability: docs/features/dsh-forge-m4/tasks/4.7-sc5-sc6-final-acceptance.md (AC-1/AC-6)
// Authorities: prd-spec §Success Criteria SC5(零缩水回归:迁移后规格全绿,
// 零功能删除断言)、tech-design §Testing Strategy·Key Test Scenarios(SC5:
// 既有 M1-M3 e2e 按迁移清单全量迁移全绿;M1 原样)、regression-inventory.md
// (2.10 盘点定稿 = 本腿对照基线;§三:P4 4.7 SC5 终验清单 = SC1-SC7 零 SC8)。
//
// SC5 零缩水终验(4.7 收口)—— 双面:
//
//   静态台账腿(ledger):2.10 基线的计数面二次断言 ——
//     · fixme 挂起台账仍 = 62(grep test.fixme( 口径,与 2.10 定稿同法):
//       挂起 = 有档记(开放项 A-F 指针),非功能删除;静默删除/静默恢复均违规;
//     · 既有 skip 仍 = 2(tray-residence 环境条件腿 + plugin step-1 代理腿);
//     · 全量收集数 ≥ 388(2.10 终态 384 + 4.6 SC4 四腿;零规格文件删除);
//     · 盘点 §一 七行绿证据锚点规格文件在场(逐行指针的载体零丢失)。
//     全量 e2e 全绿(0 failed)本身 = 批次执行面证据,由 4.7 全量回归批次
//     产出并落盘点终验记录(本腿静态面 + 逐行活面共同构成「逐行二次断言」)。
//
//   逐行活面腿(rows ①-⑦ + 孤儿复核):单一真内核语料(feature 三任务 +
//   关联/孤儿提案 + 阶段资产)boot 后,按盘点 §一 七行逐行走查各自的
//   消费面「仍在座」:
//     ① 项目一级导航:panellist「项目」首项 + retired 面三重零残留
//        (TabBar/三容器/降级 rail)+ 逃生门收缩 overview 单页;
//     ② M2 看板:右栏任务看板 pane 双宿主面(节点全集 + 派发入口在场);
//     ③ M3 提案板:概览提案子 tab(目录行 + 状态 Pill + 互跳 chip + 文档行);
//     ④ M3 feature 面:概览 feature 子 tab(目录行 + 状态词表直透 + 文档行);
//     ⑤ 文档根设置/添加入口:C7 确认卡为唯一添加入口(树区头 [＋] 同卡);
//     ⑥ M3 发起链:任务行 → 详情 dock + 派发入口原位(选择层可进可退);
//     ⑦ M1 会话主面:boot 落 conversation + 会话交互面在场(同底座复用)。
//   断言零缩水口径 = 断言本体不弱化(每面锚定盘点行的消费面语言);
//   全链路深度(22 腿派发链/proposal 详情等)由台账锚点规格的全量批次承载。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { buildKernelWorld, freshRoot } from '../_lib/journey-world.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The 2.10 baseline ledger (regression-inventory.md §二 定稿计数;口径 =
// grep 台账法,与本腿复算同法)。4.6 增 SC4 四腿 → 收集基线 388。
// ---------------------------------------------------------------------------

const BASELINE_FIXME = 62
const BASELINE_PREEXISTING_SKIPS = 2
const BASELINE_COLLECTED_FLOOR = 388 // 2.10 终态 384 + 4.6 SC4 四腿(零删除下限)

/** The two e2e lanes' spec roots (playwright.config.ts testDir faces). */
const SPEC_LANES = ['apps/desktop/e2e', 'tests/e2e/specs'] as const

/**
 * 盘点 §一 七行绿证据锚点(每行 ≥1 载体;在场断言 = 证据链载体零丢失)。
 * 行号注释对应盘点表格 ①-⑦。
 */
const ROW_ANCHOR_SPECS: ReadonlyArray<{ readonly row: string; readonly path: string }> = [
  // ① 全局导航 → 项目一级导航(SC1 腿 + 逃生门改写腿)
  { row: '①', path: 'tests/e2e/specs/m4/sc1-project-nav.spec.ts' },
  { row: '①', path: 'apps/desktop/e2e/forge-workbench-nav/view-switch-smoke.spec.ts' },
  // ② M2 看板重宿主(看板浏览 + 派发执行回路 + m2 SC 腿)
  { row: '②', path: 'apps/desktop/e2e/task-board-browsing/step-2-switch-board-views.spec.ts' },
  { row: '②', path: 'tests/e2e/specs/task-dispatch-execution-loop/step-1-board-browse-multiselect.spec.ts' },
  { row: '②', path: 'apps/desktop/e2e/tests/m2/sc1-board-consistency.spec.ts' },
  { row: '②', path: 'apps/desktop/e2e/tests/m2/sc7-dual-form.spec.ts' },
  // ③ M3 提案板 pane 方言(SC2 全量腿 + 仓外回流读数腿)
  { row: '③', path: 'tests/e2e/specs/m4/sc2-three-zone-full.spec.ts' },
  { row: '③', path: 'tests/e2e/specs/sc9-out-of-repo.spec.ts' },
  // ④ M3 feature 面(SC2 全量腿 feature 面;阶段资产面挂起台账指针)
  { row: '④', path: 'tests/e2e/specs/sc4-stage-gates.spec.ts' },
  // ⑤ 文档根设置承接(存活向导腿入口统一)
  { row: '⑤', path: 'tests/e2e/specs/sc2-migration.spec.ts' },
  { row: '⑤', path: 'tests/e2e/specs/explicit-sot-migration/step-1-migration-entry-discovery.spec.ts' },
  { row: '⑤', path: 'tests/e2e/specs/out-of-repo-docs-root/step-1-wizard-doc-location.spec.ts' },
  // ⑥ M3 发起链原位(派发链 22 腿)
  { row: '⑥', path: 'tests/e2e/specs/task-dispatch-execution-loop/step-7-status-backflow.spec.ts' },
  // ⑦ M1 会话主面原样(M1 九根规格)
  { row: '⑦', path: 'apps/desktop/e2e/shell.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/shell-fallback.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/shell-ui.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/tray.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/protocol-carriage.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/sc3-process-footprint.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/sc6-update.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/sc7-smoke.spec.ts' },
  { row: '⑦', path: 'apps/desktop/e2e/uf4-recovery.spec.ts' },
]

/** The ledger spec's own path fragment (self-exclusion: its marker string
 * literals are counting code, not parked legs). */
const OWN_SPEC_FRAGMENT = join('m4', 'sc5-zero-loss.spec.ts')

/** Recursively collect .spec.ts files under one lane root (self-excluded). */
function listSpecFiles(laneRoot: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const dirent of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const child = join(dir, dirent.name)
      if (dirent.isDirectory()) walk(child)
      else if (dirent.name.endsWith('.spec.ts') && !normPath(child).endsWith(normPath(OWN_SPEC_FRAGMENT))) out.push(child)
    }
  }
  walk(laneRoot)
  return out
}

/** Normalize a Windows/POSIX path for comparison. */
const normPath = (path: string): string => path.replaceAll('\\', '/')

/** Count literal marker occurrences across one lane (the 2.10 台账 grep 法). */
function countMarker(laneRoot: string, marker: string): number {
  let count = 0
  for (const file of listSpecFiles(laneRoot)) {
    const text = readFileSync(file, 'utf8')
    let at = text.indexOf(marker)
    while (at !== -1) {
      count += 1
      at = text.indexOf(marker, at + marker.length)
    }
  }
  return count
}

test('sc5/ledger: 2.10 盘点台账静态二次断言 — fixme 62 / 既有 skip 2 / 收集下限 388 / 七行锚点规格在场(零功能删除)', async ({ }, testInfo) => {
  testInfo.setTimeout(180_000)

  // ---- 挂起台账不变量:62 fixme(开放项 A-F 指针在档;非功能删除)--------
  let fixme = 0
  let skips = 0
  for (const lane of SPEC_LANES) {
    fixme += countMarker(lane, 'test.fixme(')
    skips += countMarker(lane, 'test.skip(')
  }
  expect(fixme,
    `fixme 挂起台账 = ${String(BASELINE_FIXME)}(2.10 基线;少了 = 挂起腿被静默删除,多了 = 无档恢复)`).toBe(BASELINE_FIXME)
  expect(skips,
    `既有 skip = ${String(BASELINE_PREEXISTING_SKIPS)}(tray-residence 环境腿 + plugin step-1 代理腿)`).toBe(BASELINE_PREEXISTING_SKIPS)

  // ---- 收集面下限:全量收集 ≥ 388(零规格删除;新增只增不减)------------
  const listOut = execSync('pnpm exec playwright test --list', { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 })
  const total = Number(/Total:\s*(\d+)\s*tests/.exec(listOut)?.[1] ?? NaN)
  expect(Number.isFinite(total), 'playwright --list 输出携带 Total 计数').toBe(true)
  expect(total,
    `全量收集 ${String(total)} ≥ 基线下限 ${String(BASELINE_COLLECTED_FLOOR)}(384 + SC4 四腿;零规格文件删除)`).toBeGreaterThanOrEqual(BASELINE_COLLECTED_FLOOR)

  // ---- 盘点 §一 七行绿证据锚点规格逐行在场(证据链载体零丢失)----------
  const missing = ROW_ANCHOR_SPECS.filter(anchor => !existsSync(join(process.cwd(), anchor.path)))
  expect(missing.map(anchor => `${anchor.row} ${anchor.path}`),
    '七行锚点规格全部在场(缺 = 对应盘点行的绿证据载体被删除)').toEqual([])

  // ---- SC8 废止口径对照:SC8 专属规格不存在(盘点 §三:P4 终验 = SC1-SC7)--
  const sc8Specs = SPEC_LANES.flatMap(lane => listSpecFiles(lane)).filter(file => /sc8/.test(file))
  expect(sc8Specs, '零 SC8 验收腿(2026-09-27 裁决 #27 废止;盘点 §三 口径)').toEqual([])
})

// ---------------------------------------------------------------------------
// The live corpus (sc2 同形:feature 三任务 + 关联/孤儿提案 + 阶段资产)
// ---------------------------------------------------------------------------

const FEATURE = 'sc5-zerosloss'
const TASK_EXEC = `${FEATURE}/1.1` // in_progress(执行中段语料)
const TASK_FREE = `${FEATURE}/1.2` // zero-dep pending(行点击/dock 语料)
const TASK_DEP = `${FEATURE}/1.3` // deps [1.2](DAG 边语料)
const PROP_LINKED = FEATURE
const PROP_ORPHAN = 'sc5-orphan-proposal'

function sc5Kernel(root: string) {
  return buildKernelWorld(root, {
    feature: { slug: FEATURE, status: 'in-progress', docKinds: ['prd', 'design', 'tasks'], seed: 'dsh-forge-m4-sc5' },
    tasks: [
      { stem: '1.1', localId: '1.1', title: 'sc5 zero-loss in-progress task', status: 'in_progress', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc5 zero-loss dispatchable task', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.3', localId: '1.3', title: 'sc5 zero-loss dependent task', status: 'pending', type: 'coding.feature', dependencies: ['1.2'] },
    ],
    stageAssets: [
      { stage: 'design', goal: 'sc5 stage asset', summaryMark: '阶段资产语料(④ 行派发预合成消费面)。' },
    ],
    proposals: [
      {
        slug: PROP_LINKED, status: 'accepted', author: 'sc5-author', created: '2026-09-30T10:00:00.000Z',
        title: 'SC5 关联提案', mark: 'feature 关联提案(③ 行互跳语料)。', evalReport: '# SC5 eval 报告\n\neval 文档行语料。\n',
      },
      { slug: PROP_ORPHAN, status: 'draft', author: 'sc5-author', created: '2026-09-30T11:00:00.000Z', title: 'SC5 孤儿提案', mark: '无关联 feature、无 eval。' },
    ],
  })
}

// ---------------------------------------------------------------------------
// Renderer helpers(sc2 同款词汇:rightbar 导航 + 稳定点击 + onboarding 链)
// ---------------------------------------------------------------------------

const newSessionButton = (page: Page) =>
  page.getByRole('button', { name: /新建会话|New Session/ }).first()

const workbenchRow = (page: Page) =>
  page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()

const projectRow = (page: Page) =>
  page.locator('[aria-label="项目"], [aria-label="Project"]').first()

/** The onboarding chain's background dismisser(sc3 同款;forge 对话框不受扰)。 */
function startAutoDismiss(page: Page): () => void {
  let stopped = false
  void (async () => {
    while (!stopped) {
      await page.evaluate(() => {
        const modal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]:not([data-dsh-forge-dialog])')]
          .find(candidate => candidate.closest('[data-dsh-forge-task-detail]') === null)
        if (modal === undefined) return
        const buttons = [...modal.querySelectorAll('button')]
        const defer = buttons.find(button => /稍后|跳过|以后|skip|later/i.test(button.textContent ?? ''))
        const target = defer ?? buttons[buttons.length - 1]
        if (target !== undefined) (target as HTMLElement).click()
      }).catch(() => {})
      await page.waitForTimeout(500).catch(() => {})
    }
  })()
  return () => { stopped = true }
}

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

async function expandRightbar(page: Page): Promise<void> {
  const panel = page.locator('[data-sidebar-right-panel]').first()
  if (await panel.getAttribute('data-sidebar-right-open') === null) {
    await page.locator('[data-sidebar-right-expand]').first().click()
  }
  await expect(panel).toHaveAttribute('data-sidebar-right-open', /.*/, { timeout: 15_000 })
}

async function focusOverview(page: Page): Promise<void> {
  await expandRightbar(page)
  for (let round = 0; round < 10; round += 1) {
    const live = await page.evaluate(() => {
      const overview = document.querySelector('[data-dsh-forge-overview]')
      return overview !== null && (overview as HTMLElement).offsetParent !== null
    })
    if (live) break
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
      const chip = tabs.find(tab => tab.textContent?.trim() === '项目概览')
      if (chip !== undefined) {
        ;(chip as HTMLElement).click()
        return
      }
      const card = document.querySelector('[data-dsh-forge-guide-card="overview"]') as HTMLElement | null
      card?.click()
    }).catch(() => {})
    await page.waitForTimeout(700)
  }
  await expect(page.locator('[data-dsh-forge-overview]')).toBeVisible({ timeout: 15_000 })
}

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

async function activateSubtabAndExpand(
  page: Page,
  subtab: { kind: 'proposals' | 'features' | 'tasks', paneRoot: string },
  dirSelector: string,
): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await focusOverview(page)
    await page.evaluate((input: { kind: string, pane: string, dir: string }) => {
      const pane = document.querySelector(input.pane)
      const paneVisible = pane !== null && (pane as HTMLElement).offsetParent !== null
      if (!paneVisible) {
        const tab = document.querySelector(`[data-dsh-forge-overview-subtab="${input.kind}"]`) as HTMLElement | null
        tab?.click()
        const dir = document.querySelector(input.dir) as HTMLElement | null
        dir?.click()
        return
      }
      const row = document.querySelector(input.dir)
      if (row?.getAttribute('aria-expanded') !== 'true') (row as HTMLElement).click()
    }, { kind: subtab.kind, pane: subtab.paneRoot, dir: dirSelector }).catch(() => {})
    await page.waitForTimeout(500)
    const done = await page.evaluate((input: { dir: string, kind: string }) => {
      const tab = document.querySelector(`[data-dsh-forge-overview-subtab="${input.kind}"]`)
      const selected = tab?.getAttribute('aria-selected') === 'true'
      const open = document.querySelector(input.dir)?.getAttribute('aria-expanded') === 'true'
      return selected && open
    }, { dir: dirSelector, kind: subtab.kind }).catch(() => false)
    if (done) return
  }
  throw new Error(`subtab+dir never settled: ${subtab.kind} / ${dirSelector}`)
}

/** Open the 任务看板 pane(2.10 恢复的 ② 行宿主;行 seam 唯一开口)。 */
async function openBoardPane(page: Page): Promise<void> {
  for (let round = 0; round < 12; round += 1) {
    const live = await page.evaluate(() => {
      const board = document.querySelector('[data-dsh-forge-task-board]')
      return board !== null && (board as HTMLElement).offsetParent !== null
    }).catch(() => false)
    if (live) {
      await page.evaluate(() => {
        const dock = document.querySelector('[data-dsh-forge-task-detail]')
        if (dock === null) return
        const close = dock.querySelector('[data-dsh-forge-detail-close]') as HTMLElement | null
        close?.click()
      }).catch(() => {})
      return
    }
    await focusSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    await page.evaluate(() => {
      const row = document.querySelector('[data-dsh-forge-overview-task]') as HTMLElement | null
      row?.click()
    }).catch(() => {})
    await page.waitForTimeout(700)
  }
  throw new Error('board pane never opened (② 行任务看板 pane)')
}

// ---------------------------------------------------------------------------
// The live rows walk(①-⑦ + 孤儿复核)
// ---------------------------------------------------------------------------

test('sc5/rows-walk: 盘点七行逐行活面二次断言(导航/看板/提案/feature/添加入口/发起链/会话底座)+ 孤儿视图清零复核', async ({ }, testInfo) => {
  testInfo.setTimeout(420_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc5')
  const kernel = await sc5Kernel(root)
  const dshHome = join(root, 'dsh-home')
  // 会话语料(boot 前预种,REAL persistence backend):① 使会话主面/右栏
  // (session-scoped 列)在隔离 DSH_HOME 下确定性水合(sc4 纪律:turnStart
  // 闭 turn 对 = 非 blank 会话,会话 chrome 渲染前提);② 给树的项目组一
  // 条真实会话行(⑦/① 行消费面语料)。
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: 'sc5-sess-alpha', cwd: kernel.codeRoot, createdAt: Date.now() - 60_000, title: 'SC5 会话语料', turnStart: true }],
  })
  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({
      userDataDir: kernel.userDataDir,
      rootDir: kernel.root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc5-e2e-stub-key' },
    })
    const { page } = shell
    await shell.uiReady()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)

    // ---- ⑦ M1 会话主面(同底座复用):boot 落 conversation + 交互面 -------
    await newSessionButton(page).waitFor({ state: 'visible', timeout: 30_000 })
    await expect(page.locator('[data-dsh-forge-shell]'), '⑦ boot 落 conversation(M1 底座原样)').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-project-seat]'), '⑦ 左栏 forge 项目树座位在座(M4 增量)')
      .toBeVisible({ timeout: 30_000 })

    // ---- ① 项目一级导航:panellist「项目」首项 + 激活走树行 --------------
    const treeRow = page.locator(`[data-dsh-forge-tree-project="${kernel.projectId}"]`)
    await expect(treeRow, '① 注册行在树在场').toBeVisible({ timeout: 30_000 })
    await treeRow.click()
    await expect(treeRow, '① 激活后树行 aria-current(原位换台指针写)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await expect(projectRow(page), '① panellist「项目」行在场').toBeAttached({ timeout: 15_000 })
    const nav = projectRow(page).locator('xpath=ancestor::nav[1]')
    const labels = await nav.locator('button').evaluateAll(buttons =>
      buttons.map(button => button.getAttribute('aria-label') ?? ''))
    expect(labels.findIndex(label => label === '项目' || label === 'Project'),
      `① 「项目」行为 panellist 首项(order -100;实际序 = ${JSON.stringify(labels)}`).toBe(0)

    // ---- ①/孤儿复核:retired 面三重零残留(conversation 面)--------------
    await expect(page.locator('[data-dsh-forge-tab]'), '孤儿复核 ① retired TabBar 面零残留').toHaveCount(0)
    for (const retired of ['tasks', 'features', 'proposals'] as const) {
      await expect(page.locator(`[data-dsh-forge-view="dsh-forge-view-${retired}"]`),
        `孤儿复核 ② retired 容器 dsh-forge-view-${retired} 零挂载`).toHaveCount(0)
    }
    await expect(page.locator('[data-dsh-forge-rail]'), '孤儿复核 ③ 降级 rail 不在场').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-add-project]'), 'retired TopBar 添加入口零残留').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-switcher-trigger]'), 'retired ProjectSwitcher 零残留').toHaveCount(0)

    // ---- ③ M3 提案板(概览提案子 tab:目录行 + Pill + 互跳 + 文档行)------
    await focusSubtab(page, 'proposals', '[data-dsh-forge-overview-proposals]')
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`),
      '③ 关联提案目录行在场').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-prop-dir="${PROP_ORPHAN}"]`),
      '③ 孤儿提案目录行在场').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-overview-prop-feature="${FEATURE}"]`),
      '③ feature 互跳 chip 在场(M3 互跳面)').toBeVisible()
    await activateSubtabAndExpand(page,
      { kind: 'proposals', paneRoot: '[data-dsh-forge-overview-proposals]' },
      `[data-dsh-forge-overview-prop-dir="${PROP_LINKED}"]`)
    await expect(page.locator(`[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/proposal"]`),
      '③ proposal 文档行在场').toBeVisible()
    await expect(page.locator(`[data-dsh-forge-overview-doc="proposals/${PROP_LINKED}/eval"]`),
      '③ eval 文档行在场(hasEval 语料)').toBeVisible()

    // ---- ④ M3 feature 面(概览 feature 子 tab:目录行 + 状态 + 文档行)---
    await focusSubtab(page, 'features', '[data-dsh-forge-overview-features]')
    await expect(page.locator(`[data-dsh-forge-overview-feature-dir="${FEATURE}"]`),
      '④ feature 目录行在场').toBeVisible({ timeout: 20_000 })
    await expect(page.locator(`[data-dsh-forge-overview-feature-status="${FEATURE}"]`),
      '④ feature 状态词在场(M3 词表直透)').toContainText('in-progress')
    await activateSubtabAndExpand(page,
      { kind: 'features', paneRoot: '[data-dsh-forge-overview-features]' },
      `[data-dsh-forge-overview-feature-dir="${FEATURE}"]`)
    for (const kind of ['prd', 'design', 'tasks'] as const) {
      await expect(page.locator(`[data-dsh-forge-overview-doc="features/${FEATURE}/${kind}"]`),
        `④ feature 文档行 ${kind} 在场(canonical docKind 序)`).toBeVisible()
    }

    // ---- ⑥ M3 发起链原位(任务行 → 详情 dock;派发入口可进可退)---------
    await focusSubtab(page, 'tasks', '[data-dsh-forge-overview-tasks]')
    await expect(page.locator(`[data-dsh-forge-overview-task="${TASK_FREE}"]`),
      '⑥ 任务列表行在场(发起链消费面)').toBeVisible({ timeout: 20_000 })
    await clickStable(page, `[data-dsh-forge-overview-task="${TASK_FREE}"]`)
    await expect(page.locator(`[data-dsh-forge-task-detail="${TASK_FREE}"]`),
      '⑥ 任务详情 dock 打开(M3 C5 面)').toBeVisible({ timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-detail-close]')

    // ---- ② M2 看板(右栏任务看板 pane:节点全集 + 派发入口原位)----------
    await openBoardPane(page)
    await expect(page.locator('[data-dsh-forge-task-board]'), '② 看板 pane 在座(双宿主 TasksView)').toBeVisible({ timeout: 20_000 })
    for (const key of [TASK_EXEC, TASK_FREE, TASK_DEP]) {
      await expect(page.locator(`[data-dsh-forge-node-card="${key}"]`),
        `② 看板节点 ${key} 在场(节点全集零缩水)`).toBeVisible({ timeout: 20_000 })
    }
    const entry = page.locator('[data-dsh-forge-dispatch-entry]')
    await expect(entry, '②/⑥ 派发入口在场(M3 发起链原位保留)').toBeVisible({ timeout: 15_000 })
    await expect(entry).toHaveAttribute('data-dsh-forge-dispatch-entry-active', 'false', { timeout: 20_000 })
    await clickStable(page, '[data-dsh-forge-dispatch-entry]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '⑥ 多选链进入(发起链可进)').toBeVisible({ timeout: 10_000 })
    await clickStable(page, '[data-dsh-forge-dispatch-cancel]')
    await expect(page.locator('[data-dsh-forge-selection-layer="active"]'),
      '⑥ 多选链可退(零悬挂面)').toHaveCount(0, { timeout: 10_000 })

    // ---- ⑤ 添加入口唯一:C7 确认卡(树区头 [＋] 同卡)-------------------
    await clickStable(page, '[data-dsh-forge-tree-add-btn]')
    await expect(page.locator('[data-dsh-forge-confirm-code]'),
      '⑤ 树区头 [＋] 打开 C7 确认卡(添加项目唯一入口,清单第 5 行)').toBeVisible({ timeout: 15_000 })
    await clickStable(page, '[data-dsh-forge-confirm-cancel]')
    await expect(page.locator('[data-dsh-forge-confirm-code]'), '⑤ C7 卡可收起(非驻留面)').toHaveCount(0, { timeout: 10_000 })

    // ---- ① 逃生门复核:workbench main 收缩 overview 单页 + 孤儿清零 ----
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await workbenchRow(page).click()
      const mounted = await page.locator('[data-dsh-forge-shell]').waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
      if (mounted) {
        await page.waitForTimeout(2_500)
        if (await page.locator('[data-dsh-forge-shell]').count() > 0) break
      }
    }
    await expect(page.locator('[data-dsh-forge-view="dsh-forge-view-overview"]'),
      '① 逃生门唯一内景 = overview 单页容器').toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-dsh-forge-shell] [data-dsh-forge-view]'),
      '① 逃生门内景恰一挂载容器(单页收缩)').toHaveCount(1)
    await expect(page.locator('[data-dsh-forge-tab]'), '① 逃生门内零 tab(孤儿清零复核)').toHaveCount(0)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
