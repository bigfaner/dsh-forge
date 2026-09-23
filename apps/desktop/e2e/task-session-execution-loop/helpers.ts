// @feature dsh-forge-m2 | @web-e2e | @journey task-session-execution-loop
// Traceability: docs/features/dsh-forge-m2/testing/task-session-execution-loop/contracts/step-1..step-7
//
// task-session-execution-loop 的共享机械(>1 个 step 文件使用;gen-test-scripts
// house shape —— 每 journey 一份 helpers.ts,复用 6.x 的 fixture/helper 栈,
// 不重复造轮子):
//
//   - journeyBundles —— 最小产品配置(BASE_BUNDLES + 必备 forge 核心 tarball)。
//   - groundOf / expectedDepChain —— 生成器模型 → 看板必须渲染的行/边/悬空
//     标记全集(sc1 的三视图一致性镜像,small-scale 口径)。
//   - readForgeIndexTruth —— 测试进程直读 fixture forge 文件(tasks/index.json)
//     的权威读数:契约的跨面断言通道(浏览器侧不自行观测 CLI 输出)。
//   - launchOneClick / pollChannelJournal / awaitLaunchCreate —— ≤1 次点击的
//     发起链(sc2 的 launchViaTrigger 形)+ 通道 stub journal 轮询。
//   - measureReflow / assertReflowWithinBudget —— ≤5s 回流计量(sc3 原样搬来,
//     出处见函数头注释;阈值恒 5000ms,重试一次 + 打印分布,永不放宽)。
//   - readBoard / readTaskDetail / assertReadonlyBridgeFace —— dshForge bridge
//     只读读数 + FT-030 白名单对拍(看板对人只读不变量的数据面断言)。
//
// Hard Rules:每次启动经 createAppSessionFactory(内建单实例探测守卫);
// DSH_FORGE_USER_DATA = journey 临时目录;跑腿前 pnpm build:plugins &&
// pnpm stage:plugin-tarballs(factory 装配 staged tarball,非源码)。
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { PluginShellOptions } from '../helpers/plugins.ts'
import { BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import { generateTaskSet } from '../fixtures/task-generator.ts'
import type { GeneratedRecord, GeneratedTask, GeneratedTaskSet, GeneratedTaskStatus } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import { createChannelStub } from '../fixtures/stubs/channel.ts'
import type { AppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import { createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

/** 最小产品配置:基座 + 必备 forge 核心(mandatory tarball 源)。 */
export function journeyBundles(): PluginShellOptions['bundles'] {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

/** factory 的 staged tarball 腿(与 journeyBundles 配对)。 */
export function journeyStageTarballs(): PluginShellOptions['stageTarballs'] {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

// ---------------------------------------------------------------------------
// Ground truth: the generator model → the exact rows/edges/badges the board
// must render (sc1 的镜像 —— 模型 + 2.5/indexer 方言规则,small-scale 口径)。
// ---------------------------------------------------------------------------

/** One fixture task projected to every board-observable field (sc1 GroundTask). */
export interface GroundTask {
  readonly key: string
  readonly feature: string
  readonly localId: string
  readonly title: string
  readonly status: GeneratedTaskStatus
  readonly type: string
  readonly dependencies: readonly string[]
  /** Same-feature deps resolving to no task (the 悬空 slice, verbatim). */
  readonly dangling: readonly string[]
  /** Board source: record actor ①, else the ② inference (no links → terminal). */
  readonly source: 'session' | 'terminal'
  readonly record: GeneratedRecord | null
}

/** resolveActorSource (indexer/source.ts) — path ① only, verbatim semantics. */
function actorSource(actor: string | null): 'session' | 'terminal' | null {
  if (actor !== null && actor.startsWith('session:')) return 'session'
  if (actor === 'terminal') return 'terminal'
  return null
}

/** buildDepChain (ipc/services.ts) mirrored — post-order upstream walk. */
export function expectedDepChain(byKey: ReadonlyMap<string, GroundTask>, taskKey: string): string[] {
  const chain: string[] = []
  const visited = new Set([taskKey])
  const walkUpstream = (key: string): void => {
    const row = byKey.get(key)
    if (row === undefined) return
    for (const blocker of row.dependencies) {
      const qualified = blocker.includes('/') ? blocker : `${row.feature}/${blocker}`
      if (visited.has(qualified)) continue
      visited.add(qualified)
      walkUpstream(qualified)
      if (byKey.has(qualified)) chain.push(qualified)
    }
  }
  walkUpstream(taskKey)
  return chain
}

/** The model projection every view consistency assertion reads (sc1 mirror). */
export function groundOf(set: GeneratedTaskSet): {
  ground: GroundTask[]
  byKey: Map<string, GroundTask>
  edgeIds: Set<string>
  danglingKeys: Set<string>
} {
  const localIdsByFeature = new Map(set.features.map(feature =>
    [feature.slug, new Set(feature.tasks.map(task => task.localId))]))
  const ground: GroundTask[] = []
  for (const feature of set.features) {
    const ids = localIdsByFeature.get(feature.slug) ?? new Set<string>()
    for (const task of feature.tasks) {
      ground.push({
        key: `${feature.slug}/${task.localId}`,
        feature: feature.slug,
        localId: task.localId,
        title: task.title,
        status: task.status,
        type: task.type,
        dependencies: task.dependencies,
        dangling: task.dependencies.filter(dep => !ids.has(dep)),
        source: actorSource(task.record?.actor ?? null) ?? 'terminal',
        record: task.record,
      })
    }
  }
  const byKey = new Map(ground.map(task => [task.key, task] as const))
  const edgeIds = new Set<string>()
  for (const task of ground) {
    for (const dep of task.dependencies) {
      if (!task.dangling.includes(dep)) edgeIds.add(`e:${task.feature}/${dep}->${task.key}`)
    }
  }
  const danglingKeys = new Set(ground.filter(task => task.dangling.length > 0).map(task => task.key))
  return { ground, byKey, edgeIds, danglingKeys }
}

/** ≤N missing/unexpected samples between two id collections (sc1 差异样本). */
export function diffSamples(expected: readonly string[], actual: readonly string[], perSide = 4): string[] {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  const samples: string[] = []
  for (const item of expected) {
    if (!actualSet.has(item)) samples.push(`missing: ${item}`)
    if (samples.length >= perSide) return samples
  }
  for (const item of actual) {
    if (!expectedSet.has(item)) samples.push(`unexpected: ${item}`)
    if (samples.length >= perSide * 2) break
  }
  return samples
}

// ---------------------------------------------------------------------------
// 跨面断言通道:测试进程直读 fixture forge 文件(Setup 口径 —— 浏览器侧不
// 自行观测 CLI 输出;forge 文件恒为事实源)。
// ---------------------------------------------------------------------------

/** One feature index.json's authority read: stem → { id, status, dependencies }. */
export interface ForgeIndexEntry {
  readonly id: string
  readonly status: string
  readonly dependencies: readonly string[]
}

/** tasks/index.json 直读 → 限定地址键 → 条目权威读数。 */
export function readForgeIndexTruth(project: WrittenForgeProject): Map<string, ForgeIndexEntry> {
  const truth = new Map<string, ForgeIndexEntry>()
  for (const row of project.indexPaths) {
    const parsed = JSON.parse(readFileSync(row.path, 'utf8')) as {
      tasks?: Record<string, { id?: string; status?: string; dependencies?: string[] }>
    }
    for (const entry of Object.values(parsed.tasks ?? {})) {
      if (entry?.id === undefined) continue
      truth.set(`${row.slug}/${entry.id}`, {
        id: entry.id,
        status: entry.status ?? '',
        dependencies: entry.dependencies ?? [],
      })
    }
  }
  return truth
}

// ---------------------------------------------------------------------------
// Launch mechanics(sc2 launchViaTrigger 形)+ channel-stub journal 轮询。
// ---------------------------------------------------------------------------

/** Poll the channel journal until an entry matches (the host writes it). */
export async function pollChannelJournal(
  channel: ChannelStub,
  predicate: (entry: ChannelStubEntry) => boolean,
  what: string,
  timeoutMs = 15_000,
): Promise<ChannelStubEntry> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = channel.readJournal().find(predicate)
    if (found !== undefined) return found
    if (Date.now() > deadline) {
      throw new Error(`channel journal never carried ${what}: ${JSON.stringify(channel.readJournal())}`)
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/**
 * Run one ≤1-click launch through an entry trigger (sc2 的 launchViaTrigger):
 * 入口触发一次 pointer click → 确认面板(确认按钮 = 默认焦点,AC「确认默认
 * 焦点」)→ Enter(键盘,非点击)→ 发起。点击数 ≤1 的记账口径 = 发起流程内
 * 的 pointer click 数(入口触发一次;打开侧板的行选择是任务导航,不计入)。
 */
export async function launchOneClick(page: Page, triggerSelector: string): Promise<void> {
  const trigger = page.locator(triggerSelector)
  await expect(trigger, 'entry probe must reach available (stub CLI answered)').toHaveAttribute('data-probe', 'available', { timeout: 20_000 })
  await trigger.click() // the ONE pointer click of the 发起 flow
  const confirm = page.locator('[data-dsh-forge-dialog="launch-confirm"]')
  await expect(confirm).toBeVisible({ timeout: 10_000 })
  // AC「确认默认焦点」: the confirm button carries the dialog's initial focus,
  // so Enter alone launches — the click budget stays at 1.
  const focusedOk = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-dsh-forge-launch-confirm-ok') !== null)
  if (!focusedOk) {
    const holder = await page.evaluate(() => {
      const el = document.activeElement
      if (el === null || el === document.body) return String(el === document.body ? 'body' : 'none')
      return `${el.tagName.toLowerCase()}[${(el.getAttribute('data-dsh-forge-task-detail') ?? el.getAttribute('data-dsh-forge-dialog') ?? el.getAttribute('data-dsh-forge-launch-trigger') ?? el.className).toString().slice(0, 80)}]`
    })
    throw new Error(`confirm button must hold the default focus (actual holder: ${holder})`)
  }
  await page.keyboard.press('Enter') // keyboard, not a click
  // 成功跳转: the keyed main slot swaps to the session view — the workbench
  // shell unmounts. A chain failure keeps the shell (error dialog / degraded
  // toast); the dump names which terminal the chain reached.
  const jumpDeadline = Date.now() + 15_000
  while (Date.now() < jumpDeadline) {
    if (await page.locator('[data-dsh-forge-shell]').count() === 0) return
    await page.waitForTimeout(250)
  }
  const dump = await page.evaluate(() => ({
    activeElement: document.activeElement === document.body
      ? 'body'
      : (document.activeElement?.outerHTML ?? 'none').slice(0, 140),
    entryStates: Array.from(document.querySelectorAll('[data-dsh-forge-launch-trigger]'))
      .map(el => `${el.getAttribute('data-mount') ?? ''}:${el.getAttribute('data-probe') ?? ''}/${el.getAttribute('data-stage') ?? ''}`).slice(0, 6),
    dialogs: Array.from(document.querySelectorAll('[data-dsh-forge-dialog]'))
      .map(el => el.getAttribute('data-dsh-forge-dialog') ?? ''),
    degradedToast: document.querySelector('[data-dsh-forge-launch-toast]') !== null,
    persistedViewKey: localStorage.getItem('dsh.forge.workbench.view'),
  }))
  throw new Error(`launch jump never happened (shell stayed mounted): ${JSON.stringify(dump)}`)
}

/** Await the channel journal's create entry (optionally excluding a known id). */
export async function awaitLaunchCreate(
  channel: ChannelStub,
  excludeSessionId?: string,
): Promise<string> {
  const entry = await pollChannelJournal(
    channel,
    candidate => candidate.kind === 'create'
      && (excludeSessionId === undefined || candidate.sessionId !== excludeSessionId),
    excludeSessionId === undefined ? 'the session create' : `a session create ≠ ${excludeSessionId}`,
  )
  const sessionId = entry.sessionId ?? ''
  expect(sessionId).not.toBe('')
  return sessionId
}

// ---------------------------------------------------------------------------
// ≤5s reflow 计量(sc3-reflow-source.spec.ts 原样搬来,t0/t1 口径与重试策略
// 不变 —— Hard Rule: 真实时钟,不得用假时钟放宽)。
// ---------------------------------------------------------------------------

/** AC budget: the full 感知+推送+渲染 chain, real clock, never widened. */
const REFLOW_BUDGET_MS = 5_000

/** The wait's failure ceiling — well above budget so a retry leg can measure. */
const REFLOW_WAIT_TIMEOUT_MS = 20_000

/** The short-label locale keys (view-A node cards render the SHORT label). */
const SHORT_LABEL_KEYS: Readonly<Record<GeneratedTaskStatus, keyof typeof zh>> = {
  pending: 'tasks.status.short.pending',
  in_progress: 'tasks.status.short.in_progress',
  completed: 'tasks.status.short.completed',
  blocked: 'tasks.status.short.blocked',
  suspended: 'tasks.status.short.suspended',
  skipped: 'tasks.status.short.skipped',
  rejected: 'tasks.status.short.rejected',
}

/** Both locales' short labels for a status (the shell's `t` seat is either). */
export function shortLabelsOf(status: GeneratedTaskStatus): string[] {
  return [zh[SHORT_LABEL_KEYS[status]], en[SHORT_LABEL_KEYS[status]]]
}

/**
 * t0 → t1 measurement of one reflow: the DOM must show the target source badge
 * AND the new status's short label on the task's view-A node card.
 * t0 = 测试进程最后一次 writeFileSync 返回时刻;t1 = 页内 waitForFunction 首次
 * 观测到目标徽标 + 新状态短标签的时刻(测试进程时钟)。
 */
export async function measureReflow(
  page: Page,
  taskKey: string,
  expectSource: 'session' | 'terminal',
  newStatus: GeneratedTaskStatus,
  apply: () => void,
): Promise<number> {
  const newLabels = shortLabelsOf(newStatus)
  apply() // the semantic file change(s); the LAST write is the t0 anchor
  const t0 = Date.now()
  await page.waitForFunction((input: { key: string; source: string; labels: string[] }) => {
    const card = document.querySelector(`[data-dsh-forge-node-card="${input.key}"]`)
    if (card === null) return false
    const badge = card.querySelector('[data-dsh-forge-badge^="source:"]')
    if (badge?.getAttribute('data-dsh-forge-badge') !== `source:${input.source}`) return false
    const text = card.textContent ?? ''
    return input.labels.some(label => text.includes(label))
  }, { key: taskKey, source: expectSource, labels: newLabels }, { timeout: REFLOW_WAIT_TIMEOUT_MS, polling: 50 })
  return Date.now() - t0
}

/**
 * The Hard-Rule retry policy (sc3 原样): try each attempt (each a FRESH
 * mutation) until one lands inside the budget — at most the pool's size, in
 * practice ≤2 (retry once); the distribution is ALWAYS printed; the threshold
 * never moves.
 */
export async function assertReflowWithinBudget(
  label: string,
  attempts: ReadonlyArray<() => Promise<number>>,
): Promise<void> {
  const samples: number[] = []
  for (const attempt of attempts) {
    samples.push(await attempt())
    if ((samples[samples.length - 1] as number) <= REFLOW_BUDGET_MS) break
  }
  console.log(`[session-loop] ${label} reflow(ms)=${JSON.stringify(samples)} budget=${String(REFLOW_BUDGET_MS)} (感知+推送+渲染全链,真实时钟)`)
  expect(
    samples.some(ms => ms <= REFLOW_BUDGET_MS),
    `${label}: ≤${String(REFLOW_BUDGET_MS)}ms not met — distribution ${JSON.stringify(samples)} (Hard Rule: retry once + record distribution, threshold unchanged)`,
  ).toBe(true)
}

// ---------------------------------------------------------------------------
// dshForge bridge 只读读数(page.evaluate 面;NEVER observe fs from the
// browser side beyond the bridge)。
// ---------------------------------------------------------------------------

/** getTaskBoard's payload subset the evaluates read. */
export interface BridgeBoardData {
  readonly tasks: Array<{
    readonly key: string
    readonly title: string
    readonly status: string
    readonly featureSlug: string
    readonly blockers: string[]
    readonly branch: string | null
    readonly worktree: boolean
    readonly source: string | null
  }>
  readonly sync: { readonly state: 'idle' | 'scanning' | 'error'; readonly lastScanAt: string | null; readonly error?: string }
}

/** getTaskDetail's payload subset the evaluates read. */
export interface BridgeTaskDetail {
  readonly summary: {
    readonly key: string
    readonly title: string
    readonly status: string
    readonly branch: string | null
    readonly worktree: boolean
    readonly source: string | null
  }
  readonly descriptionMarkdown: string
  readonly depChain: Array<{ readonly key: string; readonly status: string }>
  readonly records: Array<{
    readonly at: string
    readonly kind: string
    readonly source: string | null
    readonly summary: string
  }>
  readonly links: Array<{
    readonly sessionId: string
    readonly status: string
    readonly startedAt: string
    readonly endedAt: string | null
  }>
}

/** The preload-bridge subsets the in-page evaluates read (declared once). */
export interface JourneyBridgeGlobals {
  dshForge?: {
    workbench?: {
      getState?: () => Promise<{ activeProjectId: string | null }>
      getTaskBoard?: (id: string) => Promise<BridgeBoardData>
      getTaskDetail?: (id: string, key: string) => Promise<BridgeTaskDetail>
    }
  }
}

/** 数据面整板读数(getTaskBoard 直调)。 */
export async function readBoard(page: Page, projectId: string): Promise<BridgeBoardData> {
  return await page.evaluate(async (id: string) => {
    const bridge = (globalThis as JourneyBridgeGlobals).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(id)
    if (board === undefined) throw new Error('dshForge.workbench.getTaskBoard bridge unavailable in the e2e renderer')
    return board
  }, projectId)
}

/** 数据面单任务详情读数(getTaskDetail 直调)。 */
export async function readTaskDetail(page: Page, projectId: string, taskKey: string): Promise<BridgeTaskDetail> {
  return await page.evaluate(async (input: { id: string; key: string }) => {
    const bridge = (globalThis as JourneyBridgeGlobals).dshForge?.workbench
    const detail = await bridge?.getTaskDetail?.(input.id, input.key)
    if (detail === undefined) throw new Error('dshForge.workbench.getTaskDetail bridge unavailable in the e2e renderer')
    return detail
  }, { id: projectId, key: taskKey })
}

/** 数据面:getState 的 activeProjectId 读数(重启后注册项目仍在的判据)。 */
export async function readActiveProjectId(page: Page): Promise<string | null> {
  return await page.evaluate(async () => {
    const bridge = (globalThis as JourneyBridgeGlobals).dshForge?.workbench
    return (await bridge?.getState?.())?.activeProjectId ?? null
  })
}

/**
 * FT-030 verb whitelist 对拍(看板对人只读不变量,数据面):bridge 面的键集
 * ⊆ 16 动词白名单,且不含任何任务写动词(claim/transition/submit/reopen/
 * addTask 族)。每个 journey 至少断言一次(step-1 与 smoke)。
 */
const FT030_VERB_WHITELIST: readonly string[] = [
  'getState', 'registerProject', 'updateProject', 'removeProject', 'activateProject',
  'getTaskBoard', 'getTaskDetail', 'getFeatureBoard', 'readFeatureDoc',
  'listPlugins', 'setPluginEnabled', 'recordSessionLink', 'endSessionLink',
  'authorizeExternalDocPath', 'subscribeEvents', 'unsubscribeEvents', 'onEvents',
]

const TASK_WRITE_VERB_FRAGMENTS: readonly string[] = [
  'claim', 'transition', 'submit', 'reopen', 'addtask', 'createtask',
  'deletetask', 'mutatetask', 'updatetaskstatus', 'settaskstatus',
]

export async function assertReadonlyBridgeFace(page: Page): Promise<void> {
  const verbs = await page.evaluate(() =>
    Object.keys((globalThis as { dshForge?: { workbench?: Record<string, unknown> } }).dshForge?.workbench ?? {}))
  expect(verbs.length, 'the bridge face is populated (FT-030)').toBeGreaterThan(0)
  const outsideWhitelist = verbs.filter(verb => !FT030_VERB_WHITELIST.includes(verb))
  expect(outsideWhitelist, 'bridge verbs ⊆ FT-030 whitelist (16-verb face)').toEqual([])
  const writeVerbs = verbs.filter(verb =>
    TASK_WRITE_VERB_FRAGMENTS.some(fragment => verb.toLowerCase().includes(fragment)))
  expect(writeVerbs, 'no task-write verb on the bridge face (看板对人只读 — add/claim/transition/submit/reopen 全无)').toEqual([])
}

// ---------------------------------------------------------------------------
// Fixture 挑选谓词(方言锚定:seed 'tsel-g' 的确定性形状,自检 expect 兜底)。
// ---------------------------------------------------------------------------

/** 本 journey 的固定 seed —— 同 seed ⇒ 同模型 ⇒ 同文件字节。 */
export const JOURNEY_SEED = 'tsel-g'

/** 挑选首个满足谓词的任务(限定地址键);找不到即失败(方言自检)。 */
export function pickTaskKey(
  set: GeneratedTaskSet,
  predicate: (task: GeneratedTask) => boolean,
  what: string,
): string {
  for (const feature of set.features) {
    for (const task of feature.tasks) {
      if (predicate(task)) return `${feature.slug}/${task.localId}`
    }
  }
  throw new Error(`session-loop fixture (${JOURNEY_SEED}) carries no task matching: ${what}`)
}

// ---------------------------------------------------------------------------
// Journey scaffolding:一次性 fixture(临时目录 + 隔离 userData + stub 通道)
// —— 每个 Outcome test 自持一套,测试后整体清理(6.1 Hard Rule)。
// ---------------------------------------------------------------------------

/** One journey's disposable scaffolding (every boot shares the factory). */
export interface JourneySetup {
  readonly set: GeneratedTaskSet
  readonly root: string
  readonly stub: StubCli
  readonly channel: ChannelStub
  readonly project: WrittenForgeProject
  readonly session: AppSessionFactory
}

/**
 * Materialize the journey:fixture tree + stub CLI(挂到项目根,win32
 * main-entry 派发)+ stub 会话通道 + reboot-stable factory(同 config root +
 * 同隔离 userData;单实例探测守卫内建于 boot())。env 缝 = stub CLI +
 * stub 通道 + DSH_FORGE_PROJECT_ROOTS(宿主 spawn 白名单的测试通道,5.11
 * leg-B 口径)。
 */
export function setUpJourney(options: {
  seed?: string
  taskCount?: number
  featureCount?: number
  danglingRate?: number
  recordRate?: number
} = {}): JourneySetup {
  const set = generateTaskSet({
    seed: options.seed ?? JOURNEY_SEED,
    taskCount: options.taskCount ?? 12,
    featureCount: options.featureCount ?? 2,
    danglingRate: options.danglingRate ?? 0.15,
    recordRate: options.recordRate ?? 0.4,
  })
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-tsel-'))
  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  stub.attachProject(project.codeRoot)
  const session = createAppSessionFactory({
    bundles: journeyBundles(),
    stageTarballs: journeyStageTarballs(),
    rootDir: join(root, 'shell'),
    userDataDir: join(root, 'user-data'),
    cwd: stub.launchCwd,
    env: {
      ...stub.env,
      ...channel.env,
      DSH_FORGE_PROJECT_ROOTS: JSON.stringify([project.codeRoot]),
    },
  })
  return { set, root, stub, channel, project, session }
}

/** Journey cleanup(6.1 Hard Rule: 测试后清理;DSH_E2E_KEEP_ROOT = 诊断逃生口)。 */
export function disposeJourney(setup: JourneySetup): void {
  if (process.env.DSH_E2E_KEEP_ROOT === '1') {
    console.log(`[session-loop] journey root kept for diagnostics: ${setup.root}`)
    return
  }
  rmSync(setup.root, { recursive: true, force: true })
  expect(existsSync(setup.root)).toBe(false)
}
