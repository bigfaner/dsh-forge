// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc6
// Traceability: docs/features/dsh-forge-m4/tasks/4.7-sc5-sc6-final-acceptance.md (AC-2/AC-3/AC-4)
// Authorities: prd-spec §Performance Requirements(首屏 ≤2s@500 继承既有预算;
// 视图切换不劣于重构前;投影操作同步完成 ≤2s 失败降级不阻断)、§Test Pipeline
// (性能断言)、tech-design §Testing Strategy·Key Test Scenarios(SC6)、
// BIZ-workbench-005(≤5s 感知/回流预算族 —— SC1/SC3/SC6 口径)。
//
// SC6 性能断言(4.7 收口)—— 三腿,全部硬门(Hard Rule:任一超标即 fail,
// 不做软警告;断言零放宽):
//
//   ① 首屏腿:项目工作台首屏 ≤2s @ 500 任务(median of 3 measured boots,
//     预热靴不计)。计量口径 = M2 SC1 继承口径(m2/sc1-board-consistency
//     6.2 定义,PRD「继承既有预算」的权威窗):t0 = 页内任务行 seam click
//     派发前一瞬,t1 = 依赖树面板 500 节点齐全后再过两帧 rAF —— 即「进入
//     看板(启动就绪)→ 首屏可交互」;app 启动段(launch→uiReady)不含在
//     预算内,与切换段/数据段一并计入诊断分解打印(launchToInteractive
//     合计 = 诊断面,非门)。500 任务种子走真内核写径(sc1TaskSet 500/50
//     → writeForgeProject 真文件树 → 真动词注册 → 真索引),读侧零 mock。
//     测量靴间删除 project_ui_state 行(布局记忆种子卫生,防 4.5 replay
//     预挂看板 pane 毒化窗口 —— 同 m2 清 localStorage view key 的纪律面)。
//
//   ② 切换腿:三面切换自基线采样 ——
//     · 项目切换(左栏树行 A↔B;终态 = 目标行 aria-current + 指针读数);
//     · 右栏 tab(项目概览 ↔ 任务看板 chip,@500 任务规模;「会话→看板」
//       方向即看板进入窗,锚 M2 ≤2s 预算硬门);
//     · 看板↔会话(工作台逃生门 main ↔ conversation 主面板切换,M4 IA 的
//       工作台/会话注意力全幅切换;boot-bounce 容窗在窗外复核)。
//     不劣化口径(诚实记录,不虚构重构前数字):1.8 迁移前取证 = 绿名单
//     (非时基),且 M4 前 IA 无右栏 tab/看板 pane 面(ProjectSwitcher 旧面
//     不可同口径对拍)—— 本腿以「重构前已绿的预算腿在新 IA 上复断言」为
//     不劣化锚(看板进入 ≤2s = M2 SC1 预算腿;其余面 ≤5s = BIZ-005 感知
//     预算族),当前中位数落盘点终验记录为后续回归对照基线。
//
//   ③ 投影腿:四投影操作同步完成 ≤2s —— 注册/改名/删除 = 收敛窗(动词
//     派发 → 实况 workspace registry 落笔;$DSH_HOME/storages/workspace.json
//     直读 100ms 轮询),归档 = 动词回程(dsh 侧零投影 op,sc3 ③ 已证
//     workspace 不动,窗外复核)。3 轮 × (注册×3 + 改名 + 归档 + 删除)
//     = 18 样本逐样本硬门。失败降级不阻断同口径(3.7 腿为降态语义权威):
//     通道故障注入样本 —— 注册动词回程 ≤2s 且不因投影失败 reject。
//
// 实例锁纪律(Hard Rule):每次 launch 前 assertNoActiveDshForgeInstances;
// workers:1;DSH_HOME 逐腿隔离。

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { bridgeInvoke, freshRoot, handBuiltTaskSet } from '../_lib/journey-world.ts'
import { sc1TaskSet } from '../../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { registerFixtureProject, writeForgeProject } from '../../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { closeAndAwaitExit, openBoardPane, prepareBoardEntry, waitForTreeNodes } from '../../../../apps/desktop/e2e/tests/m2/helpers/restart-app.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'

// ---------------------------------------------------------------------------
// Budgets (SC 口径;阈值恒定,永不放宽)
// ---------------------------------------------------------------------------

/** AC-2:首屏可交互 ≤2s @ 500 任务(M2 SC1 继承预算;median of 3)。 */
const FIRST_INTERACTIVE_BUDGET_MS = 2_000
/** Measured boots after the (uncounted) warm-up boot. */
const MEASURED_RUNS = 3
/** BIZ-workbench-005 感知/回流预算族(SC1/SC3/SC6 口径):切换面逐样本硬门。 */
const SWITCH_PERCEPTION_BUDGET_MS = 5_000
/** AC-4:投影操作同步完成 ≤2s(逐样本硬门)。 */
const PROJECTION_OP_BUDGET_MS = 2_000
/** The 500-task preset seed (byte-reproducible). */
const SC6_SEED = 'sc6-m4'

/** median-of-N (odd N assumed, fallback to the upper middle). */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY
}

/** Delete the layout-memory rows (measurement hygiene: no 4.5 pane replay). */
async function deleteUiStateRows(userDataDir: string): Promise<void> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(userDataDir, 'workbench', 'workbench.db'))
  try {
    db.exec('DELETE FROM project_ui_state')
  } finally {
    db.close()
  }
}

/** The onboarding chain's background dismisser (sc3 同款;机会式,缺席即 no-op)。 */
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

/**
 * One measured switch: t0 captured in-page at the click dispatch; t1 read via
 * ONE evaluate after the caller's waitForFunction postcondition (50ms 轮询;
 * 读钟往返 ≈ ms 级 —— 记录于口径)。
 */
async function measuredSwitch(page: Page, dispatch: (page: Page) => Promise<number | null>, postcondition: Promise<void>): Promise<number> {
  const t0 = await dispatch(page)
  expect(t0, 'switch click target attached (t0 captured at dispatch)').not.toBeNull()
  await postcondition
  const t1 = await page.evaluate(() => performance.now())
  return t1 - (t0 as number)
}

/** t1 的首绘落定读钟(两帧 rAF 后;节流窗兜底 5s 只报告不拯救)。 */
async function rafSettleClock(page: Page): Promise<number> {
  const { t1 } = await page.evaluate(() => new Promise<{ t1: number }>((resolve) => {
    const settle = (): void => resolve({ t1: performance.now() })
    const frame = requestAnimationFrame(() => { requestAnimationFrame(settle) })
    setTimeout(() => { cancelAnimationFrame(frame); settle() }, 5_000)
  }))
  return t1
}

/** DOM-click one rightbar tab chip by its exact text (sc2 vocabulary)。 */
function chipClickDispatch(label: string): (page: Page) => Promise<number | null> {
  return (page: Page) => page.evaluate((text: string) => {
    const tabs = [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')]
    const chip = tabs.find(tab => tab.textContent?.trim() === text)
    if (chip === undefined) return null
    const started = performance.now()
    ;(chip as HTMLElement).click()
    return started
  }, label)
}

// ---------------------------------------------------------------------------
// Leg ①: 首屏 ≤2s @ 500 任务(median of 3;M2 继承口径)
// ---------------------------------------------------------------------------

test('sc6/first-screen: 项目工作台首屏 ≤2s @ 500 任务(median of 3 measured boots;真内核写径种子,M2 继承口径)', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc6-first')
  const set = sc1TaskSet(SC6_SEED)
  expect(set.facts.taskCount, '语料前提:恰好 500 任务').toBe(500)
  const written = writeForgeProject(set, { codeRoot: join(root, 'sc6-corpus') })
  const dshHome = join(root, 'dsh-home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  // 会话语料(boot 前预种,REAL persistence backend):隔离 DSH_HOME 下会话
  // 主面/右栏(session-scoped 列)确定性水合(sc4 纪律:turnStart 闭 turn 对
  // = 非 blank 会话)—— prepareBoardEntry 的右栏导航前提。
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: 'sc6-sess-corpus', cwd: written.codeRoot, createdAt: Date.now() - 60_000, title: 'SC6 首屏会话语料', turnStart: true }],
  })
  const expectedNodes = set.facts.taskCount
  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    // ---- Warm-up boot (uncounted):真动词注册(真注册/索引链)+ 全量节点核 ---
    shell = await launchWorkbenchShell({
      userDataDir, rootDir: root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc6-e2e-stub-key' },
    })
    await shell.uiReady()
    stopAutoDismiss = startAutoDismiss(shell.page)
    const projectId = await registerFixtureProject(shell.page, written)
    expect(typeof projectId, '真动词注册完成(写径 = 注册动词,非 mock 读侧)').toBe('string')
    await openBoardPane(shell.page)
    await waitForTreeNodes(shell.page, expectedNodes, 60_000)
    await shell.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
    stopAutoDismiss()
    await closeAndAwaitExit(shell)
    shell = undefined

    // ---- Measured boots ×3 -------------------------------------------------
    interface RunBreakdown { bootMs: number; switchMs: number; interactiveMs: number; dataSampleMs: number | null; launchToInteractiveMs: number }
    const runs: RunBreakdown[] = []
    for (let run = 1; run <= MEASURED_RUNS; run += 1) {
      assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })
      await deleteUiStateRows(userDataDir) // 布局记忆种子卫生(防 replay 预挂看板 pane)
      const bootStart = Date.now()
      shell = await launchWorkbenchShell({
        userDataDir, rootDir: root,
        env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc6-e2e-stub-key' },
      })
      const current = shell
      stopAutoDismiss = startAutoDismiss(current.page)
      try {
        await current.uiReady()
        const bootMs = Date.now() - bootStart
        const page = current.page
        const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
        expect(state.activeProjectId, `measured run ${String(run)}: 持久活跃项目在座`).toBe(projectId)
        const switchStart = Date.now()
        await prepareBoardEntry(page)
        const switchMs = Date.now() - switchStart
        // t0 + 行 seam click 同一 evaluate(零驱动延迟;M2 口径)
        const t0 = await page.evaluate(() => {
          const started = performance.now()
          const row = document.querySelector('[data-dsh-forge-overview-task]') as HTMLElement | null
          row?.click()
          return started
        })
        expect(typeof t0, '行 seam 在场(任务行点击 = 看板唯一开口)').toBe('number')
        await waitForTreeNodes(page, expectedNodes, 60_000)
        const t1 = await rafSettleClock(page)
        const interactiveMs = t1 - t0
        // 数据段诊断:代表性 getTaskBoard 直调(SQLite 读 + IPC 序列化 @500 行)
        const dataSampleMs = await page.evaluate(async (id: string) => {
          const bridge = (globalThis as { dshForge?: { workbench?: { getTaskBoard?: (id: string) => Promise<unknown> } } }).dshForge?.workbench
          if (bridge?.getTaskBoard === undefined) return null
          const started = performance.now()
          await bridge.getTaskBoard(id)
          return performance.now() - started
        }, projectId)
        expect(current.pageErrors, `measured run ${String(run)} renderer pageerrors: ${current.pageErrors.join(' | ')}`).toEqual([])
        runs.push({
          bootMs, switchMs, interactiveMs, dataSampleMs,
          launchToInteractiveMs: bootMs + switchMs + interactiveMs,
        })
      } finally {
        await current.page.evaluate(() => { localStorage.removeItem('dsh.forge.workbench.view') }).catch(() => {})
        stopAutoDismiss()
        await closeAndAwaitExit(current).catch(() => {})
        if (shell === current) shell = undefined
      }
    }

    const median = medianOf(runs.map(row => row.interactiveMs))
    const distribution = runs.map((row, index) => ({
      run: index + 1,
      boot: Math.round(row.bootMs),
      switch: Math.round(row.switchMs),
      interactive: Math.round(row.interactiveMs),
      data: row.dataSampleMs === null ? null : Math.round(row.dataSampleMs),
      launchToInteractive: Math.round(row.launchToInteractiveMs),
    }))
    console.log(`[sc6-first] interactive runs(ms)=${JSON.stringify(runs.map(row => Math.round(row.interactiveMs)))}`
      + ` median=${String(Math.round(median))} budget=${String(FIRST_INTERACTIVE_BUDGET_MS)}`)
    console.log('[sc6-first] breakdown per run (boot=launch→uiReady, switch=就绪→行 seam 前, interactive=行 seam→500 节点+2rAF, data=getTaskBoard 直调, launchToInteractive=诊断合计):')
    console.log('[sc6-first] ' + JSON.stringify(distribution))
    testInfo.annotations.push({ type: 'sc6-first-screen', description: `median=${String(Math.round(median))}ms runs=${JSON.stringify(runs.map(r => Math.round(r.interactiveMs)))} launchToInteractive=${JSON.stringify(runs.map(r => Math.round(r.launchToInteractiveMs)))}` })
    expect(
      median,
      `SC6 首屏:500 任务首屏可交互中位数 ${String(Math.round(median))}ms > ${String(FIRST_INTERACTIVE_BUDGET_MS)}ms`
        + ` — 耗时分解: ${JSON.stringify(distribution, null, 2)}`,
    ).toBeLessThanOrEqual(FIRST_INTERACTIVE_BUDGET_MS)
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg ②: 三面切换自基线(项目切换 / 右栏 tab / 看板↔会话)
// ---------------------------------------------------------------------------

test('sc6/view-switch: 项目切换 + 右栏 tab(概览↔看板@500)+ 看板↔会话 自基线采样(预算锚 = M2 ≤2s / BIZ-005 ≤5s,逐样本硬门)', async ({ }, testInfo) => {
  testInfo.setTimeout(480_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc6-switch')
  // 语料:A = 500 任务 SC1 preset;B = 三任务小语料(切换目标)。
  const writtenA = writeForgeProject(sc1TaskSet(SC6_SEED), { codeRoot: join(root, 'proj-a') })
  const writtenB = writeForgeProject(handBuiltTaskSet(
    { slug: 'sc6-b', status: 'in-progress', docKinds: ['tasks'], seed: 'dsh-forge-m4-sc6-b' },
    [
      { stem: '1.1', localId: '1.1', title: 'sc6 switch task one', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.2', localId: '1.2', title: 'sc6 switch task two', status: 'pending', type: 'coding.feature', dependencies: [] },
      { stem: '1.3', localId: '1.3', title: 'sc6 switch task three', status: 'pending', type: 'coding.feature', dependencies: [] },
    ],
  ), { codeRoot: join(root, 'proj-b') })
  const dshHome = join(root, 'dsh-home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  // 会话语料(boot 前预种):同腿 ① —— 右栏/会话主面确定性水合前提。
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: 'sc6-sess-a', cwd: writtenA.codeRoot, createdAt: Date.now() - 60_000, title: 'SC6 切换会话语料', turnStart: true }],
  })

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({
      userDataDir, rootDir: root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc6-e2e-stub-key' },
    })
    await shell.uiReady()
    const { page } = shell
    stopAutoDismiss = startAutoDismiss(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const projectA = await registerFixtureProject(page, writtenA)
    const projectB = await registerFixtureProject(page, writtenB)

    // ---- Face 1:项目切换(左栏树行 A↔B;终态 = 目标行 aria-current)------
    // 序终态 = A(后续看板面以 A 的 500 任务为规模)。
    const treeRowA = `[data-dsh-forge-tree-project="${projectA}"]`
    const treeRowB = `[data-dsh-forge-tree-project="${projectB}"]`
    await page.locator(treeRowA).waitFor({ state: 'visible', timeout: 30_000 })
    const projectSwitchMs: number[] = []
    const switchTargets = [treeRowB, treeRowA, treeRowB, treeRowA, treeRowB, treeRowA]
    for (const target of switchTargets) {
      const expectedId = target === treeRowA ? projectA : projectB
      const other = target === treeRowA ? treeRowB : treeRowA
      const ms = await measuredSwitch(
        page,
        current => current.evaluate((sel: string) => {
          const el = document.querySelector(sel)
          if (el === null) return null
          const started = performance.now()
          ;(el as HTMLElement).click()
          return started
        }, target),
        page.waitForFunction((sel: string) =>
          document.querySelector(sel)?.getAttribute('aria-current') === 'true', target, { timeout: 30_000, polling: 50 }),
      )
      // 语义复核(窗口外):指针读数随行 + 前活跃行让位(切错/虚亮即红)。
      const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
      expect(state.activeProjectId, '项目切换语义:点击后指针 = 目标行').toBe(expectedId)
      expect(page.locator(other), '前活跃行让位(aria-current 翻转)').not.toHaveAttribute('aria-current', 'true')
      projectSwitchMs.push(ms)
    }
    expect(projectSwitchMs.every(ms => ms <= SWITCH_PERCEPTION_BUDGET_MS),
      `项目切换逐样本 ≤${String(SWITCH_PERCEPTION_BUDGET_MS)}ms(BIZ-005 感知预算;样本 = ${JSON.stringify(projectSwitchMs.map(Math.round))})`).toBe(true)

    // ---- Face 2:右栏 tab(项目概览 ↔ 任务看板 @500 任务)------------------
    // 预热开板(行 seam 用户径);此后 chip 往返即「会话→看板/看板→会话」面。
    await openBoardPane(page)
    await waitForTreeNodes(page, 500, 60_000)
    const boardForwardMs: number[] = []
    const overviewForwardMs: number[] = []
    for (let round = 0; round < 5; round += 1) {
      // 看板 → 概览(看板→会话注意面:概览承载项目知识面)。
      const overviewMs = await measuredSwitch(
        page,
        chipClickDispatch('项目概览'),
        page.waitForFunction(() => {
          const overview = document.querySelector('[data-dsh-forge-overview]')
          return overview !== null && (overview as HTMLElement).offsetParent !== null
        }, undefined, { timeout: 30_000, polling: 50 }),
      )
      overviewForwardMs.push(overviewMs)
      // 概览 → 看板(会话→看板;M2 ≤2s 预算锚的 chip 往返面)。
      const boardMs = await measuredSwitch(
        page,
        chipClickDispatch('任务看板'),
        (async () => {
          await page.waitForFunction(() => {
            const board = document.querySelector('[data-dsh-forge-task-board]')
            return board !== null && (board as HTMLElement).offsetParent !== null
          }, undefined, { timeout: 30_000, polling: 50 })
          await page.waitForFunction((expected: number) =>
            document.querySelectorAll('.react-flow__node').length === expected, 500, { timeout: 30_000, polling: 50 })
          await rafSettleClock(page)
        })(),
      )
      boardForwardMs.push(boardMs)
    }
    expect(boardForwardMs.every(ms => ms <= SWITCH_PERCEPTION_BUDGET_MS),
      `看板进入逐样本 ≤${String(SWITCH_PERCEPTION_BUDGET_MS)}ms(样本 = ${JSON.stringify(boardForwardMs.map(Math.round))})`).toBe(true)
    const boardMedian = medianOf(boardForwardMs)
    expect(boardMedian,
      `会话→看板(chip 往返)中位数 ${String(Math.round(boardMedian))}ms > ${String(FIRST_INTERACTIVE_BUDGET_MS)}ms`
        + `(M2 SC1 预算锚 —— 重构前已绿的预算腿在新 IA 复断言;样本 = ${JSON.stringify(boardForwardMs.map(Math.round))})`)
      .toBeLessThanOrEqual(FIRST_INTERACTIVE_BUDGET_MS)
    expect(overviewForwardMs.every(ms => ms <= SWITCH_PERCEPTION_BUDGET_MS),
      `概览进入逐样本 ≤${String(SWITCH_PERCEPTION_BUDGET_MS)}ms(样本 = ${JSON.stringify(overviewForwardMs.map(Math.round))})`).toBe(true)

    // ---- Face 3:看板↔会话主面板切换(工作台逃生门 main ↔ conversation)--
    // 终态判据 = 呈现且驻留(boot bounce 容窗在窗外复核,不计入切换窗)。
    const workbenchSwitchMs: number[] = []
    for (let round = 0; round < 3; round += 1) {
      // 会话 → 工作台 main(逃生门;DOM 径避免驱动延迟入窗)。
      workbenchSwitchMs.push(await measuredSwitch(
        page,
        current => current.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find(candidate => /^(工作台|Workbench)$/.test(candidate.textContent?.trim() ?? ''))
          if (button === undefined) return null
          const started = performance.now()
          ;(button as HTMLElement).click()
          return started
        }),
        page.waitForFunction(() =>
          document.querySelector('[data-dsh-forge-shell]') !== null, undefined, { timeout: 30_000, polling: 50 }),
      ))
      await page.waitForTimeout(2_500) // bounce 容窗(窗外)
      expect(await page.evaluate(() => document.querySelector('[data-dsh-forge-shell]') !== null),
        '工作台 main 呈现驻留(bounce 后仍在;窗外复核)').toBe(true)
      // 工作台 → 会话(项目行 = selectPanel(null) → conversation)。
      try {
        workbenchSwitchMs.push(await measuredSwitch(
          page,
          current => current.evaluate(() => {
            const button = document.querySelector('[aria-label="项目"], [aria-label="Project"]') as HTMLElement | null
            if (button === null) return null
            const started = performance.now()
            button.click()
            return started
          }),
          page.waitForFunction(() => {
            // 会话侧终态语言 = sc1 口径:shell 卸载 + panellist「项目」行
            // 选中态(activePanelId === null;新建会话钮在已播种会话的家页
            // 面不呈现,非稳定终态信号)。
            const shellGone = document.querySelector('[data-dsh-forge-shell]') === null
            const projectSelected = document.querySelector('[aria-label="项目"], [aria-label="Project"]')
              ?.getAttribute('aria-current') === 'page'
            return shellGone && projectSelected
          }, undefined, { timeout: 30_000, polling: 50 }),
        ))
      } catch (error) {
        const dump = await page.evaluate(() => ({
          shellCount: document.querySelectorAll('[data-dsh-forge-shell]').length,
          projectLabeled: [...document.querySelectorAll('[aria-label="项目"], [aria-label="Project"]')].slice(0, 4)
            .map(el => ({ tag: el.tagName, visible: (el as HTMLElement).offsetParent !== null, text: el.textContent?.slice(0, 30) ?? '' })),
          newSessionButtons: [...document.querySelectorAll('button')]
            .filter(button => /新建会话|New Session/.test(button.textContent ?? ''))
            .map(button => ({ visible: button.offsetParent !== null, text: button.textContent?.slice(0, 20) ?? '' })),
          panelTabs: [...document.querySelectorAll('[data-sidebar-right-panel] [role="tab"]')].map(tab => tab.textContent?.trim() ?? ''),
          dialogs: [...document.querySelectorAll('[role="dialog"]')].map(dialog => dialog.getAttribute('data-dsh-forge-dialog') ?? 'native'),
        })).catch(() => 'evaluate-failed')
        throw new Error(`face-3 backward (工作台→会话) never settled — page state ${JSON.stringify(dump)}\n${String(error)}`)
      }
    }
    expect(workbenchSwitchMs.every(ms => ms <= SWITCH_PERCEPTION_BUDGET_MS),
      `看板↔会话主面板切换逐样本 ≤${String(SWITCH_PERCEPTION_BUDGET_MS)}ms(样本 = ${JSON.stringify(workbenchSwitchMs.map(Math.round))})`).toBe(true)

    console.log('[sc6-switch] medians(ms): '
      + JSON.stringify({
        projectSwitch: Math.round(medianOf(projectSwitchMs)),
        boardForwardChip: Math.round(boardMedian),
        overviewForwardChip: Math.round(medianOf(overviewForwardMs)),
        workbenchConversation: Math.round(medianOf(workbenchSwitchMs)),
      })
      + ` samples: project=${JSON.stringify(projectSwitchMs.map(Math.round))}`
      + ` board=${JSON.stringify(boardForwardMs.map(Math.round))}`
      + ` overview=${JSON.stringify(overviewForwardMs.map(Math.round))}`
      + ` main=${JSON.stringify(workbenchSwitchMs.map(Math.round))}`)
    testInfo.annotations.push({ type: 'sc6-view-switch', description: `projectSwitch=${String(Math.round(medianOf(projectSwitchMs)))}ms boardChip=${String(Math.round(boardMedian))}ms overviewChip=${String(Math.round(medianOf(overviewForwardMs)))}ms mainPanel=${String(Math.round(medianOf(workbenchSwitchMs)))}ms` })
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})

// ---------------------------------------------------------------------------
// Leg ③: 投影操作同步完成 ≤2s(实况 registry 收敛;逐样本硬门)
// ---------------------------------------------------------------------------

/** 实况 workspace 行(sc3 同款读法:$DSH_HOME/storages/workspace.json)。 */
interface LiveWorkspaceRow { readonly workspaceId: string; readonly path: string; readonly title: string; readonly sessionIds: readonly string[] }
interface LiveRegistry { readonly initialized: boolean; readonly order: readonly LiveWorkspaceRow[] }

const foldPath = (path: string): string => path.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '')

/** 读实况注册表(原子重写的 durable 面;文件缺席 = null)。 */
function readLiveRegistry(dshHome: string): LiveRegistry | null {
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

const rowAtAnchor = (registry: LiveRegistry, anchor: string): LiveWorkspaceRow | undefined =>
  registry.order.find(row => foldPath(row.path) === foldPath(anchor))

test('sc6/projection-ops: 注册/改名/删除实况收敛 ≤2s + 归档动词回程 ≤2s(逐样本硬门,3 轮 ×4 操作)+ 通道故障注册不阻断 ≤2s', async ({ }, testInfo) => {
  testInfo.setTimeout(480_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc6-proj')
  const rounds = 3
  const anchors: string[][] = []
  for (let round = 0; round < rounds; round += 1) {
    anchors.push(['alpha', 'beta', 'gamma'].map(suffix => {
      const anchor = join(root, `r${String(round)}-${suffix}`)
      mkdirSync(join(anchor, 'docs'), { recursive: true }) // repo-existing 落位(docs 在位)
      return anchor
    }))
  }
  const dshHome = join(root, 'dsh-home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  // 中性 cwd 会话语料(不落任何锚点:bootstrap 建表不预占锚点 workspace,
  // 注册收敛窗仍测「从缺席到落位」);会话主面水合前提同前两腿。
  const neutralSessionHome = join(root, 'session-home')
  mkdirSync(neutralSessionHome, { recursive: true })
  await seedLineageCorpus({
    dshHome,
    seeds: [{ sessionId: 'sc6-sess-neutral', cwd: neutralSessionHome, createdAt: Date.now() - 60_000, title: 'SC6 投影会话语料', turnStart: true }],
  })
  const faultStub = createProjectionFaultStub(join(root, 'stub'))

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  const registerMs: number[] = []
  const renameMs: number[] = []
  const archiveMs: number[] = []
  const removeMs: number[] = []
  try {
    shell = await launchWorkbenchShell({
      userDataDir, rootDir: root,
      env: { DSH_HOME: dshHome, DEEPSEEK_API_KEY: 'sc6-e2e-stub-key', ...faultStub.env },
    })
    await shell.uiReady()
    const { page } = shell
    stopAutoDismiss = startAutoDismiss(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('[data-dsh-forge-project-seat]')).toBeVisible({ timeout: 30_000 })

    /** t0 → 实况收敛谓词成立(100ms 轮询;返回收敛窗 ms)。 */
    const convergeMs = async (t0: number, predicate: (registry: LiveRegistry) => boolean, label: string): Promise<number> => {
      for (let attempt = 0; attempt < Math.ceil(30_000 / 100); attempt += 1) {
        const registry = readLiveRegistry(dshHome)
        if (registry !== null && predicate(registry)) return Date.now() - t0
        await page.waitForTimeout(100)
      }
      throw new Error(`live workspace registry never converged: ${label} (last=${JSON.stringify(readLiveRegistry(dshHome))})`)
    }

    for (let round = 0; round < rounds; round += 1) {
      const [alpha, beta, gamma] = anchors[round] as [string, string, string]
      const ids = new Map<string, string>()
      // ---- 注册 ×3(动词派发 → 实况同名落位收敛)--------------------------
      for (const [index, anchor] of [alpha, beta, gamma].entries()) {
        const displayName = `sc6-r${String(round)}-${['alpha', 'beta', 'gamma'][index] as string}`
        const registerT0 = Date.now()
        const row = await bridgeInvoke<{ id: string }>(page, 'registerProject',
          [{ anchor, displayName, docsPlacement: 'repo-existing' }])
        expect(row.id, `注册动词完成:${displayName}`).toBeTruthy()
        ids.set(anchor, row.id)
        registerMs.push(await convergeMs(registerT0, registry => rowAtAnchor(registry, anchor)?.title === displayName,
          `round ${String(round)} register ${displayName}`))
      }
      // ---- 改名(实况 title 收敛)-----------------------------------------
      const renamedTo = `sc6-r${String(round)}-alpha-renamed`
      const renameT0 = Date.now()
      await bridgeInvoke<unknown>(page, 'renameProject', [{ projectId: ids.get(alpha) as string, displayName: renamedTo }])
      renameMs.push(await convergeMs(renameT0, registry => rowAtAnchor(registry, alpha)?.title === renamedTo,
        `round ${String(round)} rename`))
      // ---- 归档(动词回程;dsh 侧零投影 op —— 实况不动,窗外复核)---------
      const betaId = ids.get(beta) as string
      const archiveT0 = Date.now()
      await bridgeInvoke<unknown>(page, 'archiveProject', [{ projectId: betaId }])
      archiveMs.push(Date.now() - archiveT0)
      await page.waitForTimeout(1_200) // 跨过潜在抖动窗再钉「零 op 不动」
      const afterArchive = readLiveRegistry(dshHome) as LiveRegistry
      expect(rowAtAnchor(afterArchive, beta), '归档语义:workspace 保留(零投影 op;sc3 ③ 口径)').toBeDefined()
      // ---- 删除(实况行移除收敛)------------------------------------------
      const removeT0 = Date.now()
      await bridgeInvoke<unknown>(page, 'removeProject', [betaId])
      removeMs.push(await convergeMs(removeT0, registry => rowAtAnchor(registry, beta) === undefined,
        `round ${String(round)} remove`))
    }

    // ---- 失败降级不阻断(3.7 同口径):通道故障下注册动词 ≤2s 且不 reject --
    faultStub.failChannel()
    const faultT0 = Date.now()
    const faultAnchor = join(root, 'fault-delta')
    mkdirSync(join(faultAnchor, 'docs'), { recursive: true })
    const delta = await bridgeInvoke<{ id: string }>(page, 'registerProject',
      [{ anchor: faultAnchor, displayName: 'sc6-fault-delta', docsPlacement: 'repo-existing' }])
    const faultMs = Date.now() - faultT0
    expect(delta.id, '降级不阻断:注册动词完成(不因投影失败 reject;3.7 ② 口径)').toBeTruthy()

    // ---- 逐样本硬门 --------------------------------------------------------
    const gates: Array<{ readonly label: string; readonly samples: number[] }> = [
      { label: '注册收敛', samples: registerMs },
      { label: '改名收敛', samples: renameMs },
      { label: '归档动词回程', samples: archiveMs },
      { label: '删除收敛', samples: removeMs },
    ]
    for (const gate of gates) {
      const over = gate.samples.filter(ms => ms > PROJECTION_OP_BUDGET_MS)
      expect(over,
        `SC6 投影:${gate.label} 逐样本 ≤${String(PROJECTION_OP_BUDGET_MS)}ms`
        + `(样本 = ${JSON.stringify(gate.samples.map(Math.round))},超标 = ${JSON.stringify(over.map(Math.round))})`).toEqual([])
    }
    expect(faultMs,
      `SC6 投影:通道故障下注册动词回程 ${String(faultMs)}ms > ${String(PROJECTION_OP_BUDGET_MS)}ms(降级不阻断同口径)`).toBeLessThanOrEqual(PROJECTION_OP_BUDGET_MS)

    console.log('[sc6-projection] medians(ms): '
      + JSON.stringify({
        register: Math.round(medianOf(registerMs)),
        rename: Math.round(medianOf(renameMs)),
        archiveVerb: Math.round(medianOf(archiveMs)),
        remove: Math.round(medianOf(removeMs)),
        faultRegisterVerb: Math.round(faultMs),
      })
      + ` samples: register=${JSON.stringify(registerMs.map(Math.round))}`
      + ` rename=${JSON.stringify(renameMs.map(Math.round))}`
      + ` archive=${JSON.stringify(archiveMs.map(Math.round))}`
      + ` remove=${JSON.stringify(removeMs.map(Math.round))}`)
    testInfo.annotations.push({ type: 'sc6-projection-ops', description: `register=${String(Math.round(medianOf(registerMs)))}ms rename=${String(Math.round(medianOf(renameMs)))}ms archive=${String(Math.round(medianOf(archiveMs)))}ms remove=${String(Math.round(medianOf(removeMs)))}ms faultRegisterVerb=${String(Math.round(faultMs))}ms` })
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) await shell.close().catch(() => {})
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
