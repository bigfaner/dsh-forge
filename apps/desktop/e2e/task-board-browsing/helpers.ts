// @feature dsh-forge-m2 | @web-e2e | @journey task-board-browsing
// Traceability: docs/features/dsh-forge-m2/testing/task-board-browsing/contracts/step-1..step-5
//
// task-board-browsing 的共享机械(>1 个 step 文件使用;gen-test-scripts house
// shape —— 每 journey 一份 helpers.ts,复用 6.x 的 fixture/helper 栈):
//
//   - boardBundles / boardStageTarballs —— 最小产品配置(BASE_BUNDLES + 必备
//     forge 核心 tarball)。
//   - groundOf / expectedDepChain / diffSamples —— 生成器模型 → 看板必须渲染
//     的行/边/悬空标记全集(sc1 三视图一致性镜像,small-scale 口径;500 任务
//     性能腿属 sc1,已落地,不在此复制)。
//   - 双语状态标签表(tasks.status.<status>,sc1/sc7 模式)+ 筛选子集镜像
//     (expectedKeysOf:feature/状态/worktree 三维与客户端 filterTasks 同语义)。
//   - readForgeIndexTruth —— 测试进程直读 fixture forge 文件(权威读数);
//     readTerminalStatuses —— stub CLI stdout(`forge task status` TSV)。
//   - readBoard / assertReadonlyBridgeFace —— dshForge bridge 只读读数 +
//     FT-030 白名单对拍(人侧只读不变量的数据面断言,每 journey ≥1 次)。
//   - emptyTaskSet / filterTaskSetFixture —— 手工 typed 模型(sc4 先例):
//     零任务 fixture(Task 实体缺席表达,不虚构字段)与筛选腿的全 pending
//     feature × 混合 feature fixture。
//   - setUpBoardJourney / disposeBoardJourney —— 一次性 journey 脚手架(临时
//     目录 + 隔离 userData + stub 通道;浏览旅程不发会话,通道 stub 仅保持
//     与 house 启动口径一致的 env 缝)。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { PluginShellOptions } from '../helpers/plugins.ts'
import { BASE_BUNDLES, FORGE_WORKBENCH, FORGE_WORKBENCH_STAGED_AT, forgeWorkbenchTarball } from '../helpers/plugins.ts'
import { writeForgeProject } from '../fixtures/forge-project.ts'
import type { WrittenForgeProject } from '../fixtures/forge-project.ts'
import type { GeneratedFeature, GeneratedRecord, GeneratedTask, GeneratedTaskSet, GeneratedTaskStatus } from '../fixtures/task-generator.ts'
import { TASK_STATUSES } from '../fixtures/task-generator.ts'
import { materializeStubCli } from '../fixtures/stubs/cli.ts'
import type { StubCli } from '../fixtures/stubs/cli.ts'
import { createChannelStub } from '../fixtures/stubs/channel.ts'
import type { ChannelStub } from '../fixtures/stubs/channel.ts'
import type { AppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import { createAppSessionFactory } from '../tests/m2/helpers/restart-app.ts'
import { zh } from '../../../../packages/plugins/forge-workbench/src/client/locale/zh.ts'
import type { WorkbenchKey } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'
import { en } from '../../../../packages/plugins/forge-workbench/src/client/locale/en.ts'

/** 本 journey 的固定 seed(浏览腿)—— 同 seed ⇒ 同模型 ⇒ 同文件字节。 */
export const BOARD_SEED = 'tsel-g'

/** 加载腿的固定 seed(96 任务:加宽 loading 窗口的较大任务集)。 */
export const BOARD_LOADING_SEED = 'tsel-load'

/** 最小产品配置:基座 + 必备 forge 核心(mandatory tarball 源)。 */
export function boardBundles(): PluginShellOptions['bundles'] {
  return [
    ...BASE_BUNDLES,
    { name: FORGE_WORKBENCH, source: `tarball:${FORGE_WORKBENCH_STAGED_AT}`, mandatory: true } as const,
  ]
}

/** factory 的 staged tarball 腿(与 boardBundles 配对)。 */
export function boardStageTarballs(): PluginShellOptions['stageTarballs'] {
  return [{ at: FORGE_WORKBENCH_STAGED_AT, from: forgeWorkbenchTarball() }]
}

// ---------------------------------------------------------------------------
// Ground truth: the generator model → the exact rows/badges the board must
// render (sc1 的镜像,small-scale 口径)。
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
  const danglingKeys = new Set(ground.filter(task => task.dangling.length > 0).map(task => task.key))
  return { ground, byKey, danglingKeys }
}

/** ≤N missing/unexpected samples between two id collections (sc1 差异样本)。 */
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
// 双语状态标签表(sc1/sc7 模式:view-B/C 标签 → 状态;排序/状态筛选菜单项名)。
// ---------------------------------------------------------------------------

/** view-B/C 状态标签的 locale 键。 */
const STATUS_LABEL_KEY_OF: Readonly<Record<GeneratedTaskStatus, WorkbenchKey>> = {
  pending: 'tasks.status.pending',
  in_progress: 'tasks.status.in_progress',
  completed: 'tasks.status.completed',
  blocked: 'tasks.status.blocked',
  suspended: 'tasks.status.suspended',
  skipped: 'tasks.status.skipped',
  rejected: 'tasks.status.rejected',
}

/** 标签 → 状态(the shell's `t` seat is either locale)。 */
export const statusOfLabel = new Map<string, GeneratedTaskStatus>()

/** 状态 → 双语标签集。 */
export const labelsOf = new Map<GeneratedTaskStatus, string[]>()

for (const status of TASK_STATUSES) {
  const key = STATUS_LABEL_KEY_OF[status]
  for (const label of [zh[key], en[key]]) {
    statusOfLabel.set(label, status)
    const bucket = labelsOf.get(status) ?? []
    bucket.push(label)
    labelsOf.set(status, bucket)
  }
}

/** One feature index.json's authority read: stem → { id, status, dependencies }。 */
export interface ForgeIndexEntry {
  readonly id: string
  readonly status: string
  readonly dependencies: readonly string[]
}

/** 跨面断言通道 ①:测试进程直读 tasks/index.json → 限定地址键 → 条目。 */
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

/** 跨面断言通道 ②:stub CLI stdout(`forge task status` TSV,测试进程直启)。 */
export function readTerminalStatuses(stub: StubCli, codeRoot: string): ReadonlyMap<string, string> {
  const result = spawnSync(stub.cliPath, ['task', 'status'], { cwd: codeRoot, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error(`stub forge task status exited ${String(result.status)}: ${result.stderr ?? ''}`)
  }
  const byKey = new Map<string, string>()
  for (const line of result.stdout.split('\n')) {
    if (line.trim() === '') continue
    const parts = line.split('\t')
    if (parts.length !== 2 || (parts[0] ?? '') === '' || (parts[1] ?? '') === '') {
      throw new Error(`unparseable status row: ${JSON.stringify(line)}`)
    }
    byKey.set(parts[0] ?? '', parts[1] ?? '')
  }
  return byKey
}

// ---------------------------------------------------------------------------
// dshForge bridge 只读读数(page.evaluate 面)。
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

/** The preload-bridge subsets the in-page evaluates read (declared once). */
export interface BoardBridgeGlobals {
  dshForge?: {
    workbench?: {
      getTaskBoard?: (id: string) => Promise<BridgeBoardData>
    }
  }
}

/** 数据面整板读数(getTaskBoard 直调)。 */
export async function readBoard(page: Page, projectId: string): Promise<BridgeBoardData> {
  return await page.evaluate(async (id: string) => {
    const bridge = (globalThis as BoardBridgeGlobals).dshForge?.workbench
    const board = await bridge?.getTaskBoard?.(id)
    if (board === undefined) throw new Error('dshForge.workbench.getTaskBoard bridge unavailable in the e2e renderer')
    return board
  }, projectId)
}

/**
 * FT-030 verb whitelist 对拍(人侧只读不变量,数据面):bridge 键集 ⊆ 16
 * 动词白名单,且不含任何任务写动词。每 journey 至少一次(step-1 或 smoke)。
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
  expect(writeVerbs, 'no task-write verb on the bridge face (人侧只读)').toEqual([])
}

// ---------------------------------------------------------------------------
// 筛选子集镜像(客户端 filterTasks 同语义;排序键未定约 —— 仅集合断言)。
// ---------------------------------------------------------------------------

/** The toolbar filter shape the expected-subset mirror reads. */
export interface ExpectedFilter {
  readonly featureSlug?: string | null
  readonly statuses?: ReadonlySet<GeneratedTaskStatus>
  readonly worktreeOnly?: boolean
}

/** 模型派生的可见键集合(与 filterTasks 同语义,空 statuses = 无限制)。 */
export function expectedKeysOf(ground: readonly GroundTask[], filter: ExpectedFilter = {}): Set<string> {
  // 方言:parse-task 恒 worktree=false(Hard Rule 不虚构)⇒ worktree-only 恒空集。
  if (filter.worktreeOnly === true) return new Set()
  return new Set(ground
    .filter(task => filter.featureSlug === undefined || filter.featureSlug === null || task.feature === filter.featureSlug)
    .filter(task => filter.statuses === undefined || filter.statuses.size === 0 || filter.statuses.has(task.status))
    .map(task => task.key))
}

/** 任务计数文案(zh '{v}/{t} 个任务' / en '{v}/{t} tasks' 的双形态)。 */
export function countTexts(visible: number, total: number): string[] {
  return [zh['tasks.count'], en['tasks.count']]
    .map(template => template.replaceAll('{visible}', String(visible)).replaceAll('{total}', String(total)))
}

// ---------------------------------------------------------------------------
// 手工 typed 模型(sc4 先例):零任务 fixture 与筛选腿 fixture。
// ---------------------------------------------------------------------------

/** 零任务 fixture:Task 实体以缺席表达(min_count 0)—— projects 表无任务
 * 计数字段,不虚构;该项目的 forge 数据无任何任务条目。 */
export function emptyTaskSet(): GeneratedTaskSet {
  const zeroCounts = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<GeneratedTaskStatus, number>
  return {
    options: {
      seed: 'empty-board',
      taskCount: 0,
      featureCount: 1,
      danglingRate: 0,
      recordRate: 0,
      tasksPerPhase: 6,
      gates: true,
      statusWeights: {},
    },
    features: [{
      slug: 'fixture-empty-board',
      status: 'tasks',
      docKinds: [],
      tasks: [],
    }],
    facts: {
      taskCount: 0,
      featureCount: 1,
      statusCounts: zeroCounts,
      edgeCount: 0,
      dangling: [],
      tasksWithRecord: 0,
      recordsWithSessionActor: 0,
      recordsWithTerminalActor: 0,
    },
  }
}

function handTask(input: {
  localId: string
  seq: number
  title: string
  status: GeneratedTaskStatus
  type: GeneratedTask['type']
  dependencies: string[]
  record?: GeneratedRecord
}): GeneratedTask {
  return {
    stem: `${input.localId}-t${String(input.seq)}`,
    localId: input.localId,
    title: input.title,
    status: input.status,
    type: input.type,
    dependencies: [...input.dependencies],
    record: input.record ?? null,
  }
}

/**
 * 筛选腿 fixture(手工 typed):alpha = 全 pending feature(与「状态筛选选
 * completed」交叉必空 —— 契约 no-match 配方);beta = 多状态混合 + 会话/
 * 终端来源记录各一。方言注记:契约 step-3 的 worktree true/false 并存不可达
 * (parse-task 恒 worktree=false,Hard Rule 不虚构)—— worktree-only 筛选的
 * code-faithful 形态 = 空集 + no-match 空态。
 */
export function filterTaskSetFixture(): GeneratedTaskSet {
  const alphaTasks: GeneratedTask[] = [
    handTask({ localId: '1.1', seq: 1, title: 'alpha 根任务 pending', status: 'pending', type: 'coding.feature', dependencies: [] }),
    handTask({ localId: '1.2', seq: 2, title: 'alpha 子任务 pending', status: 'pending', type: 'test', dependencies: ['1.1'] }),
    handTask({ localId: '1.3', seq: 3, title: 'alpha 汇聚任务 pending', status: 'pending', type: 'doc.feature', dependencies: ['1.1', '1.2'] }),
    handTask({ localId: '1.gate', seq: 4, title: 'alpha phase gate pending', status: 'pending', type: 'gate', dependencies: ['1.3'] }),
  ]
  const betaTasks: GeneratedTask[] = [
    handTask({ localId: '1.1', seq: 1, title: 'beta 根任务 in_progress', status: 'in_progress', type: 'coding.feature', dependencies: [] }),
    handTask({
      localId: '1.2', seq: 2, title: 'beta 会话来源记录任务', status: 'completed', type: 'coding.feature', dependencies: ['1.1'],
      record: { actor: 'session:fixture-filter-beta-1-2', summary: '会话侧完成(fixture 记录)', completed: '2026-09-20 10:00' },
    }),
    handTask({
      localId: '1.3', seq: 3, title: 'beta 终端来源记录任务', status: 'completed', type: 'test', dependencies: ['1.2'],
      record: { actor: 'terminal', summary: '终端侧完成(fixture 记录)', completed: '2026-09-20 11:00' },
    }),
    handTask({ localId: '1.4', seq: 4, title: 'beta blocked 任务', status: 'blocked', type: 'validation', dependencies: ['1.3'] }),
    handTask({ localId: '1.5', seq: 5, title: 'beta skipped 任务', status: 'skipped', type: 'doc.feature', dependencies: ['1.3'] }),
    handTask({ localId: '1.gate', seq: 6, title: 'beta phase gate rejected', status: 'rejected', type: 'gate', dependencies: ['1.4'] }),
  ]
  const statusCounts = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<GeneratedTaskStatus, number>
  for (const task of [...alphaTasks, ...betaTasks]) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const edgeCount = [...alphaTasks, ...betaTasks].reduce((sum, task) => sum + task.dependencies.length, 0)
  return {
    options: {
      seed: 'board-filter',
      taskCount: 10,
      featureCount: 2,
      danglingRate: 0,
      recordRate: 0.2,
      tasksPerPhase: 6,
      gates: true,
      statusWeights: {},
    },
    features: [
      { slug: 'fixture-filter-alpha', status: 'tasks', docKinds: [], tasks: alphaTasks },
      { slug: 'fixture-filter-beta', status: 'in-progress', docKinds: ['prd'], tasks: betaTasks },
    ],
    facts: {
      taskCount: 10,
      featureCount: 2,
      statusCounts,
      edgeCount,
      dangling: [],
      tasksWithRecord: 2,
      recordsWithSessionActor: 1,
      recordsWithTerminalActor: 1,
    },
  }
}

// ---------------------------------------------------------------------------
// Journey scaffolding(一次性 fixture;调用方自带 GeneratedTaskSet —— 生成器
// 或手工 typed 模型皆可)。
// ---------------------------------------------------------------------------

/** One journey's disposable scaffolding. */
export interface BoardJourneySetup {
  readonly set: GeneratedTaskSet
  readonly root: string
  readonly stub: StubCli
  readonly channel: ChannelStub
  readonly project: WrittenForgeProject
  readonly session: AppSessionFactory
}

/** Materialize the journey over a caller-built task set. */
export function setUpBoardJourney(set: GeneratedTaskSet): BoardJourneySetup {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-board-'))
  const stub = materializeStubCli(join(root, 'stub-cli'))
  const channel = createChannelStub(join(root, 'stub-channel'))
  const project = writeForgeProject(set, { codeRoot: join(root, 'fixture-project') })
  stub.attachProject(project.codeRoot)
  const session = createAppSessionFactory({
    bundles: boardBundles(),
    stageTarballs: boardStageTarballs(),
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
export function disposeBoardJourney(setup: BoardJourneySetup): void {
  if (process.env.DSH_E2E_KEEP_ROOT === '1') {
    console.log(`[board] journey root kept for diagnostics: ${setup.root}`)
    return
  }
  rmSync(setup.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  expect(existsSync(setup.root)).toBe(false)
}

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
  throw new Error(`board fixture carries no task matching: ${what}`)
}

/** The mutated feature model for index.json surgery(单任务结构性移除腿)。 */
export function featureWithoutTask(feature: GeneratedFeature, localId: string): GeneratedFeature {
  return { ...feature, tasks: feature.tasks.filter(task => task.localId !== localId) }
}
