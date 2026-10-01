// @feature dsh-forge-m4 | @web-e2e | @journey forge-m4-sc3
// Traceability: docs/features/dsh-forge-m4/tasks/3.7-sc3-deviation-degrade-e2e.md
// Authorities: tech-design §Testing Strategy·Key Test Scenarios(SC3 后半:偏差/
// 故障注入/降级)、§Error Handling·Error Types & Codes(ERR_PROJECTION_OP_FAILED
// /ERR_PROJECTION_CHANNEL_UNAVAILABLE)+ §Propagation Strategy(投影面:动词不
// 因投影失败 reject;偏差仅呈现无反向写 BIZ-006)、§Interfaces·Interface 1/2
// (幂等全量重推 = 单 plan 收敛全部期望状态)、prd-spec §Success Criteria SC3、
// §投影语义与降级规则(必答④ 偏差/降级/不破坏)、§Flow Description·降级流、
// prd-user-stories Story 4(注册即归组·投影失败降级不阻断)/Story 5(手改不
// 回流仅偏差提示)。
//
// SC3 后半(偏差与降级)e2e 腿 —— 单向投影的故障语义在真链上的实况断言:
//
//   ⓪ 竞态裁决腿(3.6 移交):注册动词【不】等 follow 流首报即驱动 —— plan
//           在实况未知下组装(ensure/rename 可达,reorder 恒缺席),boot 语料
//           (会话 cwd 预种 → bootstrap 期 workspace 序 [γ,β,α])≠ forge 注册序
//           → 断言无用户重试下的最终收敛(实况序 = [α,β,γ] 同名同序 + 全
//           healthy 零偏差) = 内核「首报到达即补推」(3.7 service 裁决)的真
//           链证据;修复缺席世界 = 滞留 boot 序 + 伪 deviation。
//   ① 手改不回流:经 stub 快照(submitWorkspaceSnapshot = 对账收数动词,
//           Implementation Notes 明示的「手改 dsh 侧」形态)注入三类手改
//           (改名/删除/乱序)→ 状态行 deviation + 偏差明细(pill + kernel
//           detail 串)呈现;零反向写断言:实况投影面(注册表序 path/title)
//           不动(= 无任何反向写/收敛推送被执行)、偏差折叠区零交互元素
//           (BIZ-006)、forge 侧期望名不被 dsh 新名覆写。
//   ② 降级不阻断注册:投影通道故障注入(env 缝族先例 DSH_FORGE_PROJECTION_
//           FAULTS 控制文件,channel:'unavailable' = 内核 relayPresence 探测
//           恒假;产品降级逻辑零改动)→ 注册动词完成(项目入列表)+ degraded
//           (ERR_PROJECTION_CHANNEL_UNAVAILABLE,plan 保留)+ 实况零投递 +
//           [重试投影] GUI 可达。
//   ③ 重试恢复:控制文件 clear()(随探测重读)→ 点 [重试投影] → healthy
//           状态行 + 实况快照一致(workspace 落位 + 改名后新名)。
//   ④ verb 不因投影失败 reject:同一故障下 注册/改名/归档 全部本地生效
//           (getState 断言 + 树消费面)。
//   ⑤ 上游动词错误码映射面:reportProjectionOutcome(workspace/invalid-path)
//           → degraded = ERR_PROJECTION_OP_FAILED 携原码 → 重试恢复 healthy
//           (3.2 单测矩阵的 e2e 对拍腿;零注错缝 = 直驱动词既定入参)。
//
// 实况断言取数(3.6 同款)= 原生 registry 读 —— $DSH_HOME/storages/
// workspace.json(storage-json single-layout KV unit workspace);宿主单写者
// 原子重写,测试进程读 = relay follow 流同源实况,「零反向写」按投影面
// (注册表序 path/title = 上游四动词的全部写径)全等断言 —— 会话归属
// (DF002 原生归组)与 updatedAt 等宿主自留位不在比对内。
//
// 实例锁纪律(Hard Rule):launch 前 assertNoActiveDshForgeInstances。

import { mkdirSync } from 'node:fs'
import { readFileSync, rmSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../../helpers/instance-lock.ts'
import { launchWorkbenchShell } from '../../helpers/app.ts'
import { seedLineageCorpus } from '../../stubs/lineage-corpus.ts'
import { createProjectionFaultStub } from '../../stubs/projection-faults.ts'
import { bridgeInvoke, captureMainStdout, freshRoot, normPath } from '../_lib/journey-world.ts'
import type { PluginShell } from '../../../../apps/desktop/e2e/helpers/plugins.ts'

// ---------------------------------------------------------------------------
// The corpus vocabulary (4 project anchors; α/β/γ carry session seeds, δ none)
// ---------------------------------------------------------------------------

/** 注册序(= sort_order 权威)语料:锚点目录名 + 期望展示名。 */
const PROJECTS = [
  { dir: 'repo-alpha', displayName: 'sc3d-project-alpha' },
  { dir: 'repo-beta', displayName: 'sc3d-project-beta' },
  { dir: 'repo-gamma', displayName: 'sc3d-project-gamma' },
  { dir: 'repo-delta', displayName: 'sc3d-project-delta' },
] as const

const ALPHA = 0
const BETA = 1
const GAMMA = 2
const DELTA = 3

/** ④ 改名腿的新名(故障注入下本地生效的断言目标)。 */
const DELTA_RENAMED = 'sc3d-delta-本地改名'
/** ① 手改腿注入的 dsh 侧新名(≠ forge 期望名,偏差断言目标)。 */
const ALPHA_MANUALLY_RENAMED = 'sc3d-alpha-手改'

/** 派发会话语料 id(2.9 纪律:真核心 artifact;bootstrap 按 canonical cwd 归组)。 */
const SESS_ALPHA = 'sc3d-sess-alpha'
const SESS_BETA = 'sc3d-sess-beta'
/** gamma 最晚创建 —— bootstrap 注册表序 = [γ, β, α](3.6 实测序,⓪ 的漂移语料)。 */
const SESS_GAMMA = 'sc3d-sess-gamma'

// ---------------------------------------------------------------------------
// The live native registry reader (3.6 同款;零反向写按文件字节全等断言)
// ---------------------------------------------------------------------------

/** 实况 workspace 行(注册表序中的消费面三列 + 归组账)。 */
interface LiveWorkspaceRow {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly string[]
}

/** 一次实况读取(缺文件 = null:bootstrap 未落笔)。 */
interface LiveRegistry {
  readonly initialized: boolean
  /** global.workspaceIds 序(注册表序权威)物化的行序列。 */
  readonly order: readonly LiveWorkspaceRow[]
}

/** path 折叠键(与 seat 的 codeRoot↔workspace.path 配对同口径:小写 + 正斜杠)。 */
const foldPath = (path: string): string => normPath(path).toLowerCase().replace(/\/+$/, '')

const registryFile = (dshHome: string): string => join(dshHome, 'storages', 'workspace.json')

/** 读实况注册表(原子重写的 durable 面;文件缺席 = null)。 */
function readLiveRegistry(dshHome: string): LiveRegistry | null {
  const file = registryFile(dshHome)
  if (!existsSync(file)) return null
  let parsed: {
    unit?: { name?: string }
    global?: { initialized?: boolean; workspaceIds?: string[] } | null
    tables?: { workspaces?: Record<string, { path: string; title: string; sessionIds: string[] }> } | null
  }
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as typeof parsed
  } catch {
    return null // 原子重写窗口的旧/新完整文档之外不该有形态;防御读取面
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

/** 轮询实况直到谓词成立(投影 push → relay → 上游动词 → durable 落笔全异步)。 */
async function waitForRegistry(
  page: Page, dshHome: string,
  predicate: (registry: LiveRegistry) => boolean,
  label: string, timeoutMs = 30_000,
): Promise<LiveRegistry> {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 200); attempt += 1) {
    const registry = readLiveRegistry(dshHome)
    if (registry !== null && predicate(registry)) return registry
    await page.waitForTimeout(200)
  }
  const last = readLiveRegistry(dshHome)
  throw new Error(`live workspace registry never reached: ${label} — last read ${JSON.stringify(last)}`)
}

/** 实况内按锚点路径定位行(canonical 折叠匹配;缺 = undefined)。 */
const rowAtAnchor = (registry: LiveRegistry, anchor: string): LiveWorkspaceRow | undefined =>
  registry.order.find(row => foldPath(row.path) === foldPath(anchor))

// ---------------------------------------------------------------------------
// Renderer helpers (onboarding dismisser + rightbar overview pane + status)
// ---------------------------------------------------------------------------

/**
 * Dismiss the upstream onboarding modal CHAIN(3.6 同款:隔离 DSH_HOME 的首启
 * 链,到达时刻不定;排除 forge 自有 DialogFrame 与任务详情 dock)。
 * Opportunistic: absent = no-op.
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

/** The onboarding chain's background dismisser(3.6 同款;forge 对话框不受扰)。 */
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

/**
 * Bring the ACTIVE project's 项目概览 pane forward(the C8 投影状态行的宿主;
 * journey-world navigateRightbarRound 的本腿子集:列展开 → tab chip/guide
 * card → overview 可见)。Postcondition 严格化:概览标题 = 期望项目名(右栏
 * 宿主绑定的 active-project store 与树激活异面,标题对上才算「到达」);
 * 多轮未达 → 重激活树行再试(store 刷新事件面宽,重放激活即收敛)。
 */
async function openOverviewForActiveProject(page: Page, expectedTitle: string, treeRowSelector?: string): Promise<void> {
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
  const state = await page.evaluate(() => ({
    overview: document.querySelectorAll('[data-dsh-forge-overview]').length,
    title: document.querySelector('[data-dsh-forge-overview-title]')?.textContent ?? null,
    statusRows: document.querySelectorAll('[data-dsh-forge-projection-status]').length,
  })).catch(() => 'evaluate-failed')
  throw new Error(`overview pane never showed the active project ${expectedTitle} — page state ${JSON.stringify(state)}`)
}

/** The active project's 投影状态行 locator(state 面向断言)。 */
const projectionStatusRow = (page: Page) => page.locator('[data-dsh-forge-projection-status]')

// ---------------------------------------------------------------------------
// The kernel status face (getProjectionStatus via the bridge verb)
// ---------------------------------------------------------------------------

/** getProjectionStatus 行(消费面子集)。 */
interface StatusRowView {
  readonly projectId: string
  readonly displayName: string
  readonly state: 'pending' | 'healthy' | 'degraded' | 'deviation'
  readonly lastError: string | null
  readonly pushedAt: string | null
  readonly archived: boolean
  readonly deviations: ReadonlyArray<{ type: 'renamed' | 'deleted' | 'reordered'; detail: string }>
}

/** 全量状态行(bridgeInvoke 直读内核;GUI 面另行断言)。 */
async function statusRows(page: Page): Promise<StatusRowView[]> {
  return await bridgeInvoke<StatusRowView[]>(page, 'getProjectionStatus', [{}])
}

/** 轮询单项目状态行直到谓词成立(对账 debounce + relay 回填全异步)。 */
async function waitForStatus(
  page: Page, projectId: string,
  predicate: (row: StatusRowView) => boolean, label: string, timeoutMs = 20_000,
  diagnostics?: () => string,
): Promise<StatusRowView> {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 250); attempt += 1) {
    const row = (await statusRows(page)).find(candidate => candidate.projectId === projectId)
    if (row !== undefined && predicate(row)) return row
    await page.waitForTimeout(250)
  }
  const rows = await statusRows(page)
  const diag = diagnostics === undefined ? '' : `\n${diagnostics()}`
  throw new Error(`projection status never reached: ${label} — last rows ${JSON.stringify(rows)}${diag}`)
}

/** 诊断面:主进程快照上报 + plan 发出序列(排障:谁在何时推了什么/报了什么)。 */
const snapshotReportTail = (mainLog: readonly string[], count = 24): string =>
  mainLog
    .filter(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT') || line.includes('WORKBENCH_PROJECTION_PUSH'))
    .slice(-count)
    .join('\n')

/** 投影面活动行数(plan 发出 + 快照上报)。 */
const projectionActivityCount = (mainLog: readonly string[]): number =>
  mainLog.filter(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT') || line.includes('WORKBENCH_PROJECTION_PUSH')).length

/**
 * 投影面静默门:活动行数连续 ~1.2s 无增长 = 延迟收敛腿(②类静置定时
 * ~600ms + relay 回填 + follow 流 order 帧上报)全部落定。healthy 状态本身
 * 不足以证明静默 —— 首次 outcome 即 healthy,而 ②类定时腿与 order 帧仍
 * 在途(实测:静默前 600ms 的补推会把漂移注入当滞后视图冲掉)。
 */
async function waitForProjectionQuiescence(page: Page, mainLog: readonly string[], timeoutMs = 20_000): Promise<void> {
  let stableRounds = 0
  let lastCount = projectionActivityCount(mainLog)
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 300); attempt += 1) {
    await page.waitForTimeout(300)
    const count = projectionActivityCount(mainLog)
    stableRounds = count === lastCount ? stableRounds + 1 : 0
    lastCount = count
    if (stableRounds >= 4) return // ≥1.2s 零新活动
  }
  throw new Error(`projection plane never went quiescent — activity tail:\n${snapshotReportTail(mainLog)}`)
}

// ---------------------------------------------------------------------------
// The SC3 deviation/degrade leg (one sequential lifecycle: ⓪ → ② → ④ → ③ → ⑤ → ①)
// ---------------------------------------------------------------------------

test('sc3/projection-degrade: 实况未知注册收敛(竞态裁决) / 通道故障降级不阻断注册+重试恢复 / verb 不 reject / 手改不回流+偏差提示', async ({ }, testInfo) => {
  testInfo.setTimeout(540_000)
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = freshRoot('m4-sc3-degrade')
  const anchors = PROJECTS.map(project => join(root, project.dir))
  for (const anchor of anchors) {
    mkdirSync(anchor, { recursive: true })
    mkdirSync(join(anchor, 'docs'), { recursive: true }) // 仓内 docs 在位(repo-existing 落位)
  }
  const dshHome = join(root, 'dsh-home')
  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })

  // 语料预种(boot 前):α/β/γ 各一「派发会话」;γ 最晚 → bootstrap 注册表序
  // [γ, β, α](⓪ 的实况漂移语料);δ 无会话 —— 其 workspace 只能经投影 push
  // 落位(② 降级腿「零投递」的对照面)。
  const now = Date.now()
  await seedLineageCorpus({
    dshHome,
    seeds: [
      { sessionId: SESS_ALPHA, cwd: anchors[ALPHA], createdAt: now - 30_000, title: 'SC3δ 会话 alpha' },
      { sessionId: SESS_BETA, cwd: anchors[BETA], createdAt: now - 20_000, title: 'SC3δ 会话 beta' },
      { sessionId: SESS_GAMMA, cwd: anchors[GAMMA], createdAt: now - 10_000, title: 'SC3δ 会话 gamma' },
    ],
  })

  // 注错缝:test 半身控制文件(boot 期通道在场;② 中途写故障,③ clear 恢复)。
  const faultStub = createProjectionFaultStub(join(root, 'stub'))

  let shell: PluginShell | undefined
  let stopAutoDismiss: () => void = () => {}
  try {
    shell = await launchWorkbenchShell({
      userDataDir,
      rootDir: root,
      env: {
        DSH_HOME: dshHome,
        DEEPSEEK_API_KEY: 'sc3d-e2e-stub-key',
        ...faultStub.env,
      },
    })
    const { page } = shell
    // 主进程 stdout 自 launch 起捕获(⓪ 竞态注记 + ① 零新 push 断言的活性面)。
    const mainLog = captureMainStdout(shell)
    await shell.uiReady()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    stopAutoDismiss = startAutoDismiss(page)
    await expect(page.locator('[data-dsh-forge-project-seat]'), '座位在座(插件 client 已装载)').toBeVisible({ timeout: 30_000 })

    // ---- ⓪ 竞态裁决腿:注册动词不等 follow 流首报即驱动(3.6 反向口径)-------
    // 语料前提:bootstrap 注册表序 = [γ, β, α](≠ forge 注册序 [α, β, γ])——
    // 实况序漂移在注册前已在场,plan 若在实况未知下组装(⓪ 的竞态窗),reorder
    // op 恒缺席,唯有内核「首报到达即补推」(3.7 裁决)能收敛。
    const bootRegistry = await waitForRegistry(page, dshHome, registry =>
      registry.initialized && registry.order.length === 3,
    'boot:bootstrap 注册表在座(3 workspace)', 30_000)
    expect(bootRegistry.order.map(row => foldPath(row.path)),
      '语料前提:bootstrap 注册表序 = [γ, β, α](实况漂移在注册前已在场)').toEqual([
      foldPath(anchors[GAMMA]), foldPath(anchors[BETA]), foldPath(anchors[ALPHA]),
    ])

    // 注册三项目:真动词 v2(内核 hook → plan → relay → 上游四动词)。无快照
    // 竞态门 —— 注册与首报的到达序交给真实时序(两种世界都必须收敛)。
    const snapshotReportsSoFar = mainLog.filter(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT')).length
    const registered: Array<{ id: string; displayName: string }> = []
    for (const project of PROJECTS.slice(0, 3)) {
      const row = await bridgeInvoke<{ id: string; displayName: string }>(
        page, 'registerProject',
        [{ anchor: join(root, project.dir), displayName: project.displayName, docsPlacement: 'repo-existing' }],
      )
      expect(row.id, `注册成功:${project.displayName}`).toBeTruthy()
      registered.push(row)
    }
    // 竞态注记(非断言面):注册起跑时首报是否仍未落笔(= 竞态窗命中倾向;
    // push 事件不落主进程 stdout,以快照 log 行为观测锚)。
    testInfo.annotations.push({
      type: 'snapshot-race',
      description: snapshotReportsSoFar === 0
        ? 'race-window: registrations started before the first snapshot report (deferred-convergence drain is the收敛 path)'
        : 'snapshot-first: a snapshot report preceded the registrations (direct convergence path)',
    })

    // 收敛断言(AC:无用户重试):实况序 = [α, β, γ] 同名同序 —— 修复缺席世界
    // 滞留 boot 序 [γ, β, α] 且首报对账呈现伪 deviation,永不收敛。
    await waitForRegistry(page, dshHome, registry =>
      registry.initialized
      && registry.order.length === 3
      && registry.order.every((row, index) =>
        foldPath(row.path) === foldPath(anchors[index])
        && row.title === PROJECTS[index].displayName),
    '⓪ 实况未知注册收敛:实况序 = [α, β, γ] 且 title = displayName(无用户重试)', 40_000)
    // 状态面:全 healthy + 零偏差(伪偏差 = 修复缺席世界的症状)。
    for (const project of registered) {
      const row = await waitForStatus(page, project.id, candidate =>
        candidate.state === 'healthy' && candidate.deviations.length === 0,
      `⓪ ${project.displayName} healthy 零偏差`)
      expect(row.lastError, '⓪ 零降级残留').toBeNull()
    }

    // ---- ② 降级腿:投影通道故障注入 → 注册不被阻断 + degraded + 可重试 -----
    faultStub.failChannel()
    const delta = await bridgeInvoke<{ id: string; displayName: string }>(
      page, 'registerProject',
      [{ anchor: anchors[DELTA], displayName: PROJECTS[DELTA].displayName, docsPlacement: 'repo-existing' }],
    )
    expect(delta.id, '② 降级不阻断注册:注册动词完成(不因投影失败 reject)').toBeTruthy()
    // forge 侧:项目入列表(本地落库即业务成功)。
    const stateWithDelta = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string }> }>(page, 'getState', [])
    expect(stateWithDelta.projects.map(row => row.id), '② 项目入 forge 列表').toContain(delta.id)
    // 内核状态面:degraded(ERR_PROJECTION_CHANNEL_UNAVAILABLE;plan 保留期望在库)。
    const deltaDegraded = await waitForStatus(page, delta.id, candidate =>
      candidate.state === 'degraded'
      && (candidate.lastError ?? '').includes('ERR_PROJECTION_CHANNEL_UNAVAILABLE'),
    '② delta degraded = 通道不可用(重试一次后)')
    expect(deltaDegraded.pushedAt, '② plan 保留(从未成功投递;期望在库禁静默丢弃)').toBeNull()
    // dsh 侧实况:零投递(降级为无投影继续运行 —— δ 的 workspace 不落位)。
    await page.waitForTimeout(1_500) // 跨过通道缺席重试窗(500ms)再钉缺席
    expect(rowAtAnchor(readLiveRegistry(dshHome) as LiveRegistry, anchors[DELTA]),
      '② 实况零投递:delta workspace 不在(plan 未到通道外)').toBeUndefined()

    // ---- ④ verb 不因投影失败 reject:同一故障下 注册(② 已证)/ 改名/归档 --
    const deltaRenamed = await bridgeInvoke<{ id: string; displayName: string }>(
      page, 'renameProject', [{ projectId: delta.id, displayName: DELTA_RENAMED }],
    )
    expect(deltaRenamed.displayName, '④ 改名本地生效(动词 resolve + forge 侧新名)').toBe(DELTA_RENAMED)
    // 通道缺席重试窗纪律(产品语义:缺席重试一次 = 500ms 定时腿):改名 push 的
    // 重试定时器必须在【故障仍在场】时走完(探测仍假 → degraded 收口)—— 否则
    // ③ 的 clear() 若落在重试窗内,迟到的补发 push 会在 ① 的 stub 快照注入之后
    // 入列执行,其执行后快照覆写漂移注入(实测竞态:注入 19.133 → 覆写 19.332)。
    // 故障在场静置 >500ms = 定时腿确定性收口,① 的漂移注入即内核最后写入。
    await page.waitForTimeout(1_200)
    await expect(page.locator(`[data-dsh-forge-tree-project="${delta.id}"]`),
      '④ 树消费面呈现新名(project_list_changed 推送后的本地效果)').toContainText(DELTA_RENAMED, { timeout: 15_000 })
    const betaArchived = await bridgeInvoke<{ id: string; archived: boolean }>(
      page, 'archiveProject', [{ projectId: registered[BETA].id }],
    )
    expect(betaArchived.archived, '④ 归档本地生效(动词 resolve + archived 位)').toBe(true)
    await expect(page.locator(`[data-dsh-forge-tree-archived-row="${registered[BETA].id}"]`),
      '④ forge 归档分区行在座(本地效果;投影故障不阻断)').toBeVisible({ timeout: 15_000 })
    await expect(page.locator(`[data-dsh-forge-tree-project="${registered[BETA].id}"]`),
      '④ 活跃分区行退场').toHaveCount(0, { timeout: 15_000 })
    expect(rowAtAnchor(readLiveRegistry(dshHome) as LiveRegistry, anchors[BETA]),
      '④ 归档 = dsh 侧保留(必答⑤;故障下同样零投影 op)').toBeDefined()

    // ---- ③ 重试恢复腿:故障恢复(控制文件 clear,随探测重读)→ GUI 重试 ---
    // 激活 delta(状态行 = 活跃项目行)→ 概览在座 → degraded 状态行 + [重试投影]。
    await page.locator(`[data-dsh-forge-tree-project="${delta.id}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-project="${delta.id}"]`),
      'delta 行激活(aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await openOverviewForActiveProject(page, DELTA_RENAMED, `[data-dsh-forge-tree-project="${delta.id}"]`)
    const statusRow = projectionStatusRow(page)
    await expect(statusRow, '③ 概览投影状态行在座').toBeVisible({ timeout: 15_000 })
    await expect(statusRow, '②/③ degraded 状态行(投影同步降级文案)')
      .toHaveAttribute('data-state', 'degraded', { timeout: 15_000 })
    await expect(statusRow, '② degraded 文案 = 投影同步降级').toContainText('投影同步降级')
    const retryButton = page.locator('[data-dsh-forge-projection-retry]')
    await expect(retryButton, '② [重试投影] 可达(degraded 态唯一动作,BIZ-005)').toBeVisible({ timeout: 5_000 })
    // 故障恢复:clear() → 下一次 presence 探测即通道在位(控制文件随探测重读)。
    faultStub.clear()
    await retryButton.click()
    // ③ 恢复断言:healthy 状态行 + 实况快照一致(workspace 落位 + 改名后新名)。
    await expect(statusRow, '③ 重试后 healthy 状态行(与 dsh 侧一致文案)')
      .toHaveAttribute('data-state', 'healthy', { timeout: 30_000 })
    await expect(statusRow, '③ healthy 文案 = 与 dsh 侧一致').toContainText('与 dsh 侧一致')
    await waitForRegistry(page, dshHome, registry => {
      const row = rowAtAnchor(registry, anchors[DELTA])
      return row !== undefined && row.title === DELTA_RENAMED
    }, '③ delta workspace 落位且 title = 改名后新名(两侧一致)')
    const deltaHealed = await waitForStatus(page, delta.id, candidate =>
      candidate.state === 'healthy' && candidate.deviations.length === 0,
    '③ delta healthy 零偏差')
    expect(deltaHealed.lastError, '③ 恢复即净(last_error 清位)').toBeNull()

    // ---- ⑤ 上游动词错误码映射面(3.2 单测矩阵的 e2e 对拍;零注错缝)--------
    // reportProjectionOutcome = relay 回填动词的既定入参 —— 直驱 error 腿即
    // 「mock 上游动词错误码」(Implementation Notes 形态;产品映射逻辑零改动)。
    await bridgeInvoke(page, 'reportProjectionOutcome', [{
      projectId: registered[GAMMA].id,
      ok: false,
      error: { code: 'workspace/invalid-path', message: 'sc3d e2e op-fault' },
    }])
    const gammaDegraded = await waitForStatus(page, registered[GAMMA].id, candidate =>
      candidate.state === 'degraded'
      && (candidate.lastError ?? '').includes('ERR_PROJECTION_OP_FAILED (upstream workspace/invalid-path)'),
    '⑤ 上游码映射:ERR_PROJECTION_OP_FAILED detail 携原码')
    expect(gammaDegraded.lastError, '⑤ detail 携上游原码与消息').toContain('sc3d e2e op-fault')
    // 重试恢复(动词面;GUI 重试面 ③ 已证):幂等全量重推 → relay 回填 ok。
    await bridgeInvoke(page, 'retryProjection', [{ projectId: registered[GAMMA].id }])
    await waitForStatus(page, registered[GAMMA].id, candidate =>
      candidate.state === 'healthy' && candidate.deviations.length === 0,
    '⑤ gamma 重试恢复 healthy')

    // ---- ① 手改不回流腿(末位:stub 快照替换内核对账输入,终局即收)--------
    // 手改形态 = stub 快照(Implementation Notes:「直接改 workspace 实况(stub
    // 快照或上游动词)」):从【真实实况】出发改写出三类手改 —— α 改名 / γ 删除
    // / δ 前插 α 之前(乱序)—— 经 submitWorkspaceSnapshot(对账收数动词)注入。
    // 前置静默门:③/⑤ 的延迟收敛腿(②类静置定时 ~600ms + relay 回填 +
    // follow 流 order 帧上报)必须全部落定 —— 活动静默 + 全行 healthy 零偏差
    // = 自动收敛终态;漂移注入才是内核对账输入的最后写入。
    await waitForProjectionQuiescence(page, mainLog)
    const allIds = [...registered.map(row => row.id), delta.id]
    for (const id of allIds) {
      await waitForStatus(page, id, candidate =>
        candidate.state === 'healthy' && candidate.deviations.length === 0,
      `① 前置静默门:${id.slice(0, 8)} 全收敛(延迟收敛腿落定)`, 15_000)
    }
    const beforeDriftRegistry = readLiveRegistry(dshHome) as LiveRegistry
    /**
     * 实况的投影面投影(零反向写比对基线):注册表序的 path + title ——
     * forge 反向写的全部可达面(ensure 重建 = path 行集变化 / 改名回写 =
     * title / 重排 = 序;上游四动词再无其他投影写径)。会话归属(sessionIds)
     * = DF002 原生归组(宿主自有生命周期,非 forge 写径)与文件 updatedAt
     * 等宿主自留位,均不在比对内。
     */
    const projectionSurfaceOf = (registry: LiveRegistry): string =>
      JSON.stringify(registry.order.map(row => ({ path: foldPath(row.path), title: row.title })))
    const driftBaselineSurface = projectionSurfaceOf(beforeDriftRegistry)
    const alphaRow = rowAtAnchor(beforeDriftRegistry, anchors[ALPHA]) as LiveWorkspaceRow
    const betaRowDrift = rowAtAnchor(beforeDriftRegistry, anchors[BETA]) as LiveWorkspaceRow
    const deltaRowDrift = rowAtAnchor(beforeDriftRegistry, anchors[DELTA]) as LiveWorkspaceRow
    expect(alphaRow, '① 手改基线:α workspace 在座').toBeDefined()
    expect(deltaRowDrift, '① 手改基线:δ workspace 在座').toBeDefined()
    // 手改后实况序:δ 前插至 α 之前(乱序),α 改名,γ 删除(β 归档保留不动)。
    const driftedEntries = [deltaRowDrift, betaRowDrift, { ...alphaRow, title: ALPHA_MANUALLY_RENAMED }]
      .map((row, index) => ({ workspaceId: row.workspaceId, path: row.path, title: row.title, orderIdx: index }))
    await bridgeInvoke(page, 'submitWorkspaceSnapshot', [{ workspaces: driftedEntries }])

    // forge 侧呈现:状态行 deviation + 偏差明细(α: renamed + reordered;γ:
    // deleted;δ: reordered)—— 偏差仅提示(BIZ-006),零反向写。
    const alphaDeviation = await waitForStatus(page, registered[ALPHA].id, candidate =>
      candidate.state === 'deviation'
      && candidate.deviations.some(row => row.type === 'renamed' && row.detail.includes(ALPHA_MANUALLY_RENAMED))
      && candidate.deviations.some(row => row.type === 'reordered' && row.detail.includes('order drift')),
    '① α deviation:renamed(手改新名)+ reordered(order drift)明细', 20_000,
    () => `snapshot-report tail:
${snapshotReportTail(mainLog)}`)
    const renamedDetail = alphaDeviation.deviations.find(row => row.type === 'renamed')?.detail ?? ''
    expect(renamedDetail, '① renamed detail 携两侧名(pushed 期望名 vs dsh 手改名)')
      .toContain(PROJECTS[ALPHA].displayName)
    const gammaDeviation = await waitForStatus(page, registered[GAMMA].id, candidate =>
      candidate.state === 'deviation'
      && candidate.deviations.some(row => row.type === 'deleted' && row.detail.includes('workspace gone')),
    '① γ deviation:deleted(workspace gone)明细', 20_000,
    () => `snapshot-report tail:
${snapshotReportTail(mainLog)}`)
    expect(gammaDeviation.deviations.find(row => row.type === 'deleted')?.detail,
      '① deleted detail 携消失 workspace 证据').toContain('no longer reported')
    await waitForStatus(page, delta.id, candidate =>
      candidate.state === 'deviation'
      && candidate.deviations.some(row => row.type === 'reordered'),
    '① δ deviation:reordered(乱序成员各一行)', 20_000,
    () => `snapshot-report tail:
${snapshotReportTail(mainLog)}`)

    // GUI 面:激活 α → 概览状态行 deviation → [偏差明细 N] 展开 → pill + 明细。
    await page.locator(`[data-dsh-forge-tree-project="${registered[ALPHA].id}"]`).click()
    await expect(page.locator(`[data-dsh-forge-tree-project="${registered[ALPHA].id}"]`),
      'α 行激活(aria-current)').toHaveAttribute('aria-current', 'true', { timeout: 15_000 })
    await openOverviewForActiveProject(page, PROJECTS[ALPHA].displayName, `[data-dsh-forge-tree-project="${registered[ALPHA].id}"]`)
    const deviationRow = projectionStatusRow(page)
    await expect(deviationRow, '① 状态行 deviation(与 dsh 侧存在偏差文案)')
      .toHaveAttribute('data-state', 'deviation', { timeout: 15_000 })
    await expect(deviationRow, '① deviation 文案').toContainText('与 dsh 侧存在偏差')
    const detailsButton = page.locator('[data-dsh-forge-projection-details]')
    await expect(detailsButton, '① [偏差明细 N] 折叠钮在座(默认收起)').toBeVisible({ timeout: 5_000 })
    await detailsButton.click()
    const deviationsFold = page.locator('[data-dsh-forge-projection-deviations]')
    await expect(deviationsFold, '① 偏差明细折叠区展开').toBeVisible({ timeout: 5_000 })
    await expect(deviationsFold.locator('[data-dsh-forge-deviation-row="renamed"] [data-dsh-forge-deviation-pill]'),
      '① 改名 pill(类型词面)').toHaveText('改名')
    await expect(deviationsFold.locator('[data-dsh-forge-deviation-row="renamed"]'),
      '① renamed 行携 kernel detail 串(手改新名证据)').toContainText(ALPHA_MANUALLY_RENAMED)
    await expect(deviationsFold.locator('[data-dsh-forge-deviation-row="reordered"]'),
      '① 乱序行携 order drift detail').toContainText('order drift')
    // BIZ-006 GUI 面:偏差折叠区零交互元素(无按钮/链接 = 无反向写入口)。
    const interactiveCount = await page.evaluate(() =>
      document.querySelectorAll('[data-dsh-forge-projection-deviations] button, [data-dsh-forge-projection-deviations] a').length)
    expect(interactiveCount, '① 偏差明细区零交互元素(仅提示,禁反向写入口)').toBe(0)

    // 零反向写双面断言:
    //   (a) 实况投影面不动(注册表序 path/title/会话归属 —— forge 反向写的
    //       全部可达面:改名回写/ensure 重建/重排/拆组;宿主自留位 updatedAt
    //       不在比对内)。该断言同时覆盖「偏差呈现不触发收敛推送」—— 收敛
    //       仅经用户重试;GUI 断言链已跨过足够的异步窗口。
    expect(projectionSurfaceOf(readLiveRegistry(dshHome) as LiveRegistry),
      '①(a) 零反向写:实况投影面不动(forge 未把 dsh 侧改回)').toBe(driftBaselineSurface)
    //   (b) forge 侧期望名不被 dsh 新名覆写(单向:forge 注册表是权威)。
    const stateAfterDrift = await bridgeInvoke<{ projects: Array<{ id: string; displayName: string }> }>(page, 'getState', [])
    expect(stateAfterDrift.projects.find(row => row.id === registered[ALPHA].id)?.displayName,
      '①(b) 零反向写:forge 期望名原样(不回流 dsh 手改名)').toBe(PROJECTS[ALPHA].displayName)

    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
    expect(mainLog.some(line => line.includes('WORKBENCH_PROJECTION_SNAPSHOT')),
      '主进程日志流在场(快照活性锚点)').toBe(true)
  } finally {
    stopAutoDismiss()
    if (shell !== undefined) {
      // Windows 句柄释放竞态:等主进程真正退出再拆根,拆不动不掩盖测试本体
      // 断言(残留 temp 根交由 OS 清理;失败仅告警)。process() 须在 close() 前
      // 取(close 后 ElectronApplication 包装对象即清理)。
      const proc = shell.electronApp.process()
      await shell.close().catch(() => {})
      for (let i = 0; i < 20 && proc.exitCode === null; i += 1) {
        await new Promise(resolve => { setTimeout(resolve, 500) })
      }
    }
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    } catch (error) {
      console.warn(`[sc3-degrade] temp root teardown deferred (OS will reclaim): ${String(error)}`)
    }
  }
})
