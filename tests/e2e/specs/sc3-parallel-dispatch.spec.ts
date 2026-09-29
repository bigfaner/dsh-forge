// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc3
// Traceability: docs/features/dsh-forge-m3/tasks/6.5-sc3-parallel-dispatch.md (AC-1..5)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC3)、
// §Interfaces·Interface 3 (预合成三要素 + prompt_hash 口径 spike③ + 并行 =
// N 次独立 create + 审批路由 decideApproval 反向经桥回 subagent), prd-spec
// G3/SC3 + prd-user-stories Story 2/3 (看板派发并行闭环 / 派发即得预合成上下文),
// 6.2 base (已迁移语料 / unified dispatch stub / prompt oracle / instance lock)。
//
// SC3 — the parallel-dispatch acceptance leg over the 6.2 base, one journey:
//
//   已迁移项目(buildMigratedCorpus 同型真内核链:write → register → scan →
//   migrate → stage_asset 索引;单 feature、4 个零依赖 pending coding.* 任务)
//   → 三级偏好 feature 级覆盖注入(coverage.<task-type> 三键,值异于注册表
//   默认 —— 生效偏好要素的非平凡锚点)→ 看板多选 3 任务并行派发(单批
//   batch_id、每任务独立行)→ renderer launch relay → host dispatch-launch →
//   stub 会话通道 3 次独立 create + prompt(journal 逐字符可取回)→ 注入
//   oracle 四件套 ×3(逐字符,Hard Rule)→ 审批两腿(stub 注入 → dock +
//   角标 + 计数 → 批准回执行中 / 拒绝回执行中 + journal outcome)→ 失败 +
//   重派发腿(stub create 注错 → failed 态 + 原因 + [重派发] → 清错 → 重派发
//   → 新行 running + oracle 复验)。
//
// 注入断言口径(Hard Rule:逐字符,不接受弱包含):每个 subagent 的 journal
// prompt 行 text 经 tests/e2e/stubs/oracle.ts 四件套裁决 —— ① sha256(text)
//   === dispatch 行 prompt_hash;② text 以**测试侧重独立重算**的预合成内容
//   逐字节开头(重算 = 内核引擎字节 + 派发后库/文档树现场:同 db 只读句柄、
//   同 featuresRoot、真 loadPresynthContext —— 派发管线喂数正确性由此承载);
//   ③ 追加行恰好一行;④ requestId 确定性。三要素锚点在重算内容上断言(值
//   全部来自测试自有输入:任务类型协议头/阶段资产绝对路径/偏好覆盖百分比),
//   任一要素缺席即红。
//
// 审批可见可操作的本任务补件(6.3 relay 先例同型):SC3 全链验收暴露决策
//   送达链的 renderer 半腿缺席 —— host approval-bridge 的 settle 面
//   (`approvalBridge/answer`)无人调用,人决策后 subagent 侧 pending 永悬。
//   本任务补齐 approval-answer.ts(descriptor 并入工具桥共享贡献 + 模块槽 +
//   decideApproval 后 fire-and-forget 投递),stub journal 的 approval outcome
//   行(allowed-once / rejected)即该腿的收据。
//
// 失败态半链注记:「拒绝 → 失败态」的执行器侧半链(rejected → 会话失败 →
//   dispatch failed)在 M3 当前缝下不可达 —— running→failed 边存在但
//   notifyDispatchEnded 无生产者/无 IPC 动词(spike-1 §5:会话无终局信号)。
//   失败 + 重派发面经真链路的 launch 注错腿覆盖(starting→failed,PRD
//   Story 2 AC4 同一可观察面:失败状态 + 原因 + 一键重派发)。
//
// 时效(AC-4,真实时钟,阈值恒定):派发确认点击 → stub journal 三条 prompt
//   行全齐(= subagent 会话已建且首条消息已投递,可交互)≤3s;状态回流
//   (看板角标翻待审批 / 回执行中)≤5s。

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { assertNoActiveDshForgeInstances } from '../helpers/instance-lock.ts'
import { createDispatchStub, type DispatchStub } from '../stubs/dispatch.ts'
import { verifyPromptInjection } from '../stubs/oracle.ts'
import { launchWorkbenchShell } from '../helpers/app.ts'
import type { PluginShell } from '../../../apps/desktop/e2e/helpers/plugins.ts'
import type { GeneratedFeature, GeneratedTask, GeneratedTaskSet } from '../../../apps/desktop/e2e/fixtures/task-generator.ts'
import { writeForgeProject } from '../../../apps/desktop/e2e/fixtures/forge-project.ts'
import { openDatabase } from '../../../apps/desktop/src/main/workbench/store/db.ts'
import { registerProject } from '../../../apps/desktop/src/main/workbench/repos/projects.ts'
import { scanForgeFiles } from '../../../apps/desktop/src/main/workbench/indexer/scan.ts'
import { createMigrationService } from '../../../apps/desktop/src/main/workbench/migration/pipeline.ts'
import { rebuildStageAssetIndex, listStageAssetRows } from '../../../apps/desktop/src/main/workbench/stages/stage-asset-index.ts'
import { getTask } from '../../../apps/desktop/src/main/workbench/tasks/task-repo.ts'
import { createPresynthEngine } from '../../../apps/desktop/src/main/workbench/dispatch/presynth/assemble.ts'
import type { RepoDb } from '../../../apps/desktop/src/main/workbench/repos/types.ts'
import { openBoardPane } from './_lib/journey-world.ts'

// ---------------------------------------------------------------------------
// The SC3 corpus: one feature, four zero-dependency pending coding.* tasks
// ---------------------------------------------------------------------------

/** The journey's single feature slug (one feature ⇒ one shared goal summary). */
const SC3_FEATURE = 'sc3-parallel-dispatch'

/** The design-stage summary asset (element ②'s anchor file). */
const DESIGN_ASSET_REL = `${SC3_FEATURE}/stages/design.md`

interface Sc3TaskSpec {
  readonly localId: string
  readonly title: string
  /** The dispatchable task type — element ①'s protocol routing key. */
  readonly type: 'coding.feature' | 'coding.fix' | 'coding.enhancement'
  /** The feature-level coverage override (element ③'s non-default value). */
  readonly coveragePercentage: number
  /** The type protocol's distinctive executor sentence (routing evidence). */
  readonly protocolSentence: string
}

/**
 * Four tasks: 1-3 ride the parallel batch (distinct types ⇒ distinct protocols
 * and distinct pref values — per-task independence is the assertion target);
 * task 4 drives the failed + redispatch leg afterwards.
 */
const SC3_TASKS: readonly Sc3TaskSpec[] = [
  {
    localId: '1',
    title: 'SC3 并行任务一(coding.feature 协议)',
    type: 'coding.feature',
    coveragePercentage: 65,
    protocolSentence: 'You are a focused task executor implementing a new feature.',
  },
  {
    localId: '2',
    title: 'SC3 并行任务二(coding.fix 协议)',
    type: 'coding.fix',
    coveragePercentage: 55,
    protocolSentence: 'You are a focused task executor fixing compilation errors, test failures, and verification issues.',
  },
  {
    localId: '3',
    title: 'SC3 并行任务三(coding.enhancement 协议)',
    type: 'coding.enhancement',
    coveragePercentage: 75,
    protocolSentence: 'You are a focused task executor enhancing an existing feature.',
  },
  {
    localId: '4',
    title: 'SC3 失败重派发腿任务(coding.feature 协议)',
    type: 'coding.feature',
    coveragePercentage: 65,
    protocolSentence: 'You are a focused task executor implementing a new feature.',
  },
]

/** The board-qualified key of one task. */
const keyOf = (spec: Sc3TaskSpec): string => `${SC3_FEATURE}/${spec.localId}`

/** The hand-built task set (zero deps + pending + typed — the exact SC3 shape). */
function sc3TaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = SC3_TASKS.map(spec => ({
    stem: `${spec.localId}-sc3`,
    localId: spec.localId,
    title: spec.title,
    status: 'pending',
    type: spec.type as GeneratedTask['type'],
    dependencies: [],
    record: null,
  }))
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  const feature: GeneratedFeature = {
    slug: SC3_FEATURE,
    // 'tasks' stage: the artifacts matrix (manifest + prd-spec + design/ + tasks/)
    // is satisfied by the written tree ⇒ dispatch reaches confirm without the
    // warning gate; stage assets exist for prd + design (element ②).
    status: 'tasks',
    docKinds: ['prd', 'design'],
    tasks,
  }
  return {
    options: {
      seed: 'dsh-forge-m3-sc3',
      taskCount: tasks.length,
      featureCount: 1,
      danglingRate: 0,
      recordRate: 0,
      tasksPerPhase: 6,
      gates: false,
      statusWeights: {},
    },
    features: [feature],
    facts: {
      taskCount: tasks.length,
      featureCount: 1,
      statusCounts,
      edgeCount: 0,
      dangling: [],
      tasksWithRecord: 0,
      recordsWithSessionActor: 0,
      recordsWithTerminalActor: 0,
    },
  }
}

/** One stage-asset file body (frontmatter { stage, generated, goal } + summary). */
function stageAssetMarkdown(stage: 'prd' | 'design', goal: string): string {
  return [
    '---',
    `stage: ${stage}`,
    'generated: "2026-09-20T10:00:00.000Z"',
    `goal: "${goal}"`,
    '---',
    '',
    `# ${stage} 阶段总结(SC3 语料)`,
    '',
    `目标:${goal}`,
    '',
  ].join('\n')
}

/** Facts about the built journey corpus. */
interface Sc3Corpus {
  readonly codeRoot: string
  readonly docsRoot: string
  readonly featuresRoot: string
  readonly userDataDir: string
  readonly projectId: string
}

/**
 * Build the PRE-MIGRATED SC3 corpus through the REAL kernel chain (the
 * buildMigratedCorpus discipline: write tree → register → scan → migrate →
 * stage-asset index), so the app boots on `data_authority='sqlite'` with the
 * four typed rows and the stage-asset index in place.
 */
async function buildSc3Corpus(root: string): Promise<Sc3Corpus> {
  const written = writeForgeProject(sc3TaskSet(), { codeRoot: join(root, 'repo') })
  // Stage assets (element ②'s anchor files) — prd + design, manifest stays
  // 'tasks' so resolveStageSummaryPath picks the design asset (the most recent
  // stage before the current one).
  const stagesDir = join(written.docsRoot, 'docs', 'features', SC3_FEATURE, 'stages')
  mkdirSync(stagesDir, { recursive: true })
  writeFileSync(join(stagesDir, 'prd.md'), stageAssetMarkdown('prd', 'SC3 语料 — PRD 阶段目标'))
  writeFileSync(join(stagesDir, 'design.md'), stageAssetMarkdown('design', 'SC3 语料 — 并行派发验收设计目标'))

  const userDataDir = join(root, 'user-data')
  mkdirSync(userDataDir, { recursive: true })
  const { db } = await openDatabase(userDataDir)
  try {
    const project = registerProject(db, { codeRoot: written.codeRoot, docLocationType: 'in_repo' })
    scanForgeFiles(db, { id: project.id, codeRoot: written.codeRoot, docLocationPath: null })
    const service = createMigrationService({
      db: db as RepoDb,
      userDataPath: userDataDir,
      loadProject: id => (id === project.id ? project : null),
      onEvent: () => {},
    })
    await service.startMigration(project.id)
    const featuresRoot = join(written.docsRoot, 'docs', 'features')
    const indexed = rebuildStageAssetIndex(db as RepoDb, project.id, featuresRoot)
    if (indexed < 2 || listStageAssetRows(db as RepoDb, project.id, SC3_FEATURE).length < 2) {
      throw new Error(`SC3 corpus stage-asset index incomplete (${String(indexed)} rows) — element ② anchor missing`)
    }
    return { codeRoot: written.codeRoot, docsRoot: written.docsRoot, featuresRoot, userDataDir, projectId: project.id }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Renderer-side helpers (SC1 precedents)
// ---------------------------------------------------------------------------

/** The in-page preload-bridge verb dispatcher (one evaluate per call). */
async function bridgeInvoke<T>(page: Page, verb: string, args: readonly unknown[]): Promise<T> {
  return await page.evaluate(async (input: { verb: string; args: unknown[] }) => {
    const bridge = (globalThis as { dshForge?: { workbench?: Record<string, (...invoke: unknown[]) => Promise<unknown>> } }).dshForge?.workbench
    if (bridge === undefined || typeof bridge[input.verb] !== 'function') {
      throw new Error(`dshForge.workbench.${input.verb} unavailable in the e2e renderer`)
    }
    return await bridge[input.verb](...input.args)
  }, { verb, args })
}

const workbenchRow = (page: Page) => page.getByRole('button', { name: /^工作台$|^Workbench$/ }).first()
async function switchToWorkbench(page: Page): Promise<void> {
  const shellPanel = page.locator('[data-dsh-forge-shell]')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await workbenchRow(page).click()
    await expect(shellPanel).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(2_500)
    if (await shellPanel.count() > 0) return
  }
  throw new Error('workbench selection never settled (boot session-restore keeps deselecting it)')
}

/** The card-level orchestration badge of one task (its state attribute). */
const orchBadge = (page: Page, taskKey: string, state: string) =>
  page.locator(`[data-dsh-forge-node-card="${taskKey}"] [data-dsh-forge-orch-badge="${state}"]`)

/** Wait until one task's card shows the given orchestration badge state. */
async function waitForOrchBadge(page: Page, taskKey: string, state: string, timeoutMs: number): Promise<void> {
  await orchBadge(page, taskKey, state).waitFor({ state: 'visible', timeout: Math.max(1_000, timeoutMs) })
}

/** One dispatch row as getDispatches answers it (the camelCase projection). */
interface DispatchRowView {
  readonly id: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  readonly state: string
  readonly sessionId: string | null
  readonly promptHash: string
  readonly actor: string
  readonly dispatchedAt: string
  readonly endedAt: string | null
  readonly error: string | null
}

/** AC-1's board multi-select dispatch (enter → check N → go → [warning] → confirm). */
async function dispatchFromBoard(page: Page, taskKeys: readonly string[]): Promise<number> {
  await page.locator('[data-dsh-forge-dispatch-entry]').click()
  await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
  for (const taskKey of taskKeys) {
    await page.locator(`[data-dsh-forge-select-chk="${taskKey}"] [data-dsh-forge-select-chk-input]`).check()
  }
  await page.locator('[data-dsh-forge-dispatch-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"], [data-dsh-forge-dialog="dispatch-confirm"]').first())
    .toBeVisible({ timeout: 10_000 })
  if (await page.locator('[data-dsh-forge-dialog="dispatch-warning"]').isVisible().catch(() => false)) {
    await page.locator('[data-dsh-forge-dispatch-warning-continue]').click()
  }
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toBeVisible({ timeout: 10_000 })
  const t0 = Date.now()
  await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toHaveCount(0, { timeout: 15_000 })
  return t0
}

/** The kernel-side recomputation of one task's presynth content (oracle input). */
function recomposePresynth(db: RepoDb, featuresRoot: string, projectId: string, taskKey: string): string {
  const task = getTask(db, projectId, taskKey)
  if (task === null) throw new Error(`task ${taskKey} not found in the journey kernel`)
  const engine = createPresynthEngine({ db, resolveFeaturesRoot: () => featuresRoot })
  return engine.composePresynth(task)
}

// ---------------------------------------------------------------------------
// The SC3 leg
// ---------------------------------------------------------------------------

test('sc3/parallel-dispatch: 3-task board batch → 3 independent subagents (byte-oracle ×3: type protocol + shared stage summary + effective prefs) → approvals visible/operable (approve & reject) → failed + redispatch leg', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / 6.2 base — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc3-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc3-stub-'))
  const stub: DispatchStub = createDispatchStub(stubDir)
  const corpus = await buildSc3Corpus(root)
  const [a, b, c, d] = SC3_TASKS
  if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('SC3_TASKS must carry exactly four entries')

  const shell = await launchWorkbenchShell({
    userDataDir: corpus.userDataDir,
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- journey pre-state: the migrated corpus is the boot's own kernel ----
    expect(existsSync(join(corpus.docsRoot, 'docs', 'features', SC3_FEATURE, 'tasks', 'index.json')),
      '已迁移语料:index.json 已淘汰').toBe(false)

    // 显式激活(单激活事务)→ 任务 tab。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    // 2.10 右栏宿主 store 推送位(同 bootAppWorld):裸 card-activate 不发
    // project_list_changed —— 同值 renameProject(纯 DB)推列表变更,概览/
    // 看板 pane 绑定的 active-project store 随之重读。
    await page.evaluate(async () => {
      const bridge = (globalThis as { dshForge?: { workbench?: {
        getState(): Promise<{ activeProjectId: string | null; projects: Array<{ id: string; displayName?: string }> }>
        renameProject(input: { projectId: string; displayName: string }): Promise<unknown>
      } } }).dshForge?.workbench
      if (bridge === undefined) return
      const state = await bridge.getState()
      const id = state.activeProjectId
      if (id === null) return
      const name = state.projects.find(row => row.id === id)?.displayName ?? id
      await bridge.renameProject({ projectId: id, displayName: name }).catch(() => {})
    })

    await openBoardPane(page)

    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId
    expect(projectId, '激活项目在座').toBe(corpus.projectId)
    for (const spec of SC3_TASKS) {
      await expect(page.locator(`[data-dsh-forge-node-card="${keyOf(spec)}"]`)).toBeVisible({ timeout: 20_000 })
    }

    // ---- 要素③前置:feature 级偏好覆盖(值异于注册表默认,非平凡锚点)----
    await bridgeInvoke(page, 'setPrefs', [
      { feature: `${projectId}/${SC3_FEATURE}` },
      SC3_TASKS.map(spec => ({ key: `coverage.${spec.type}`, value: { type: 'percentage', percentage: spec.coveragePercentage } })),
    ])

    // ---- AC-1 + AC-4:3 无依赖任务多选并行派发 ---------------------------
    const parallelKeys = [keyOf(a), keyOf(b), keyOf(c)]
    const t0 = await dispatchFromBoard(page, parallelKeys)

    // journal 三条 prompt 行齐(= 3 个 subagent 会话已建 + 首条消息已投递)。
    const codeRootNormalized = corpus.codeRoot.replaceAll('\\', '/')
    const promptRows = { rows: [] as Array<{ sessionId: string; text: string; requestId: string; at: string }> }
    for (let attempt = 0; attempt < 200 && promptRows.rows.length < 3; attempt += 1) {
      promptRows.rows = stub.readJournal()
        .filter(row => row.kind === 'prompt')
        .map(row => ({ sessionId: row.sessionId as string, text: row.text as string, requestId: row.requestId as string, at: row.at }))
      if (promptRows.rows.length < 3) await page.waitForTimeout(100)
    }
    expect(promptRows.rows, 'stub journal 记录 3 条首条消息投递(3 个独立 subagent)').toHaveLength(3)
    const createRows = stub.readJournal().filter(row => row.kind === 'create')
    expect(createRows, 'stub journal 记录 3 次独立 create(N 次独立 create,G3)').toHaveLength(3)
    for (const row of createRows) {
      expect(String(row.cwd).replaceAll('\\', '/'), 'create cwd = 项目 codeRoot').toBe(codeRootNormalized)
    }

    // AC-4 时效:派发 → stub 可交互 ≤3s(journal prompt 行的 at 全齐)。
    const interactiveMs = Math.max(...promptRows.rows.map(row => Date.parse(row.at))) - t0
    console.log(`[sc3] dispatch→interactive(ms)=${String(interactiveMs)} budget=3000 (stub journal at-anchors, real clock)`)
    expect(interactiveMs, `派发 → stub 可交互 ≤3000ms(实际 ${String(interactiveMs)}ms)`).toBeLessThanOrEqual(3_000)

    // ---- AC-1:dispatch 行独立、角标互不串扰(看板 + 库双面)------------
    const dispatchRows = await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId])
    const parallelRows = dispatchRows.filter(row => parallelKeys.includes(row.taskKey))
    expect(parallelRows, '3 条独立 dispatch 行').toHaveLength(3)
    expect(new Set(parallelRows.map(row => row.id)).size, '行 id 互异').toBe(3)
    expect(new Set(parallelRows.map(row => row.sessionId)).size, '行 session_id 互异(互不共享会话)').toBe(3)
    expect(new Set(parallelRows.map(row => row.batchId)).size, '同批单 batch_id 聚合').toBe(1)
    const textSet = new Set(promptRows.rows.map(row => row.text))
    expect(textSet.size, '3 份注入内容互异(各任务类型协议不同)').toBe(3)

    // 行 session_id = 预铸 id(= stub create adopt 的 id)+ running 态。
    for (const row of parallelRows) {
      expect(row.state, `${row.taskKey} 行态 running(notifySessionStarted 回填)`).toBe('running')
      expect(createRows.some(created => created.sessionId === row.sessionId), `${row.taskKey} 行 session_id = stub create adopt id`).toBe(true)
      expect(promptRows.rows.some(prompted => prompted.sessionId === row.sessionId), `${row.taskKey} 注入行与行 session 对齐`).toBe(true)
    }

    // AC-4 回流:确认点击 → 三卡角标齐 running ≤5s(事件推送 + 渲染全链)。
    const badgeDeadline = t0 + 20_000
    for (const spec of [a, b, c]) {
      await waitForOrchBadge(page, keyOf(spec), 'running', badgeDeadline - Date.now())
    }
    const reflowMs = Date.now() - t0
    console.log(`[sc3] dispatch→board-badges(ms)=${String(reflowMs)} budget=5000`)
    expect(reflowMs, `派发 → 看板角标回流 ≤5000ms(实际 ${String(reflowMs)}ms)`).toBeLessThanOrEqual(5_000)

    // ---- AC-2:注入 oracle 四件套 ×3(逐字符,Hard Rule)-----------------
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(corpus.userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as RepoDb
    try {
      for (const spec of [a, b, c]) {
        const row = parallelRows.find(candidate => candidate.taskKey === keyOf(spec)) as DispatchRowView
        const prompted = promptRows.rows.find(candidate => candidate.sessionId === row.sessionId) as { sessionId: string; text: string; requestId: string }
        // 测试侧重算(内核引擎字节 + 派发后库/文档树现场)。
        const content = recomposePresynth(db, corpus.featuresRoot, projectId, keyOf(spec))
        const oracle = verifyPromptInjection({
          journalText: prompted.text,
          presynthContent: content,
          promptHash: row.promptHash,
          sessionId: row.sessionId as string,
          requestId: prompted.requestId,
        })
        expect(oracle, `${keyOf(spec)} 注入 oracle 四件套(hash/逐字节前缀/单追加行/requestId 确定性)`).toEqual({ ok: true })

        // 三要素锚点(在重算内容上;值全部来自测试自有输入):
        // ① 任务类型协议(路由头 + 类型专属执行句);
        const taskFile = join(corpus.featuresRoot, SC3_FEATURE, 'tasks', `${spec.localId}-sc3.md`)
        expect(content, `${keyOf(spec)} 要素① 协议路由头`).toContain(`TASK_ID: ${keyOf(spec)}`)
        expect(content, `${keyOf(spec)} 要素① TASK_FILE 寻址`).toContain(taskFile)
        expect(content, `${keyOf(spec)} 要素① 类型专属协议句(${spec.type})`).toContain(spec.protocolSentence)
        // ② 同 feature 目标摘要(PhaseSummary 块 = 最近阶段资产绝对路径);
        const designAssetAbs = join(corpus.featuresRoot, DESIGN_ASSET_REL)
        expect(content, `${keyOf(spec)} 要素② PhaseSummary 块在场`).toContain('## PhaseSummary')
        expect(content, `${keyOf(spec)} 要素② 阶段资产绝对路径(design)`).toContain(designAssetAbs)
        // ③ 生效偏好(feature 级覆盖百分比,非默认值)。
        expect(content, `${keyOf(spec)} 要素③ 生效覆盖偏好(${String(spec.coveragePercentage)}%)`)
          .toContain(`Coverage strategy: percentage — Target: Achieve ${String(spec.coveragePercentage)}% test coverage.`)
      }
    } finally {
      (db as unknown as { close(): void }).close()
    }

    // ---- AC-3 批准腿:stub 注入审批 → 看板可见(dock + 角标 + 计数)→ 批准 → 回执行中 ----
    const bRow = parallelRows.find(candidate => candidate.taskKey === keyOf(b)) as DispatchRowView
    stub.injectToolExec('sc3-call-b', { command: 'pnpm exec vitest run tests/sc3-b' })
    stub.injectApproval({
      agentId: bRow.sessionId as string,
      toolName: 'Bash',
      callId: 'sc3-call-b',
      reason: 'SC3 approval leg B: run the targeted fix tests',
    })
    const tAwait = Date.now()
    await waitForOrchBadge(page, keyOf(b), 'awaiting', 20_000)
    const entry = page.locator('[data-dsh-forge-approval-entry]')
    await expect(entry, '工具栏「审批 N」入口在场').toBeVisible({ timeout: 10_000 })
    await expect(entry).toHaveAttribute('data-dsh-forge-approval-entry-count', '1', { timeout: 10_000 })
    const awaitMs = Date.now() - tAwait
    console.log(`[sc3] inject→awaiting-visible(ms)=${String(awaitMs)} budget=5000`)
    expect(awaitMs, `审批注入 → 看板可见 ≤5000ms(实际 ${String(awaitMs)}ms)`).toBeLessThanOrEqual(5_000)

    // dock 打开 + 条目可见(正文 = 请求载荷;拒绝 ghost / 批准 primary)。
    await entry.click()
    const dock = page.locator('[data-dsh-forge-approval-panel]')
    await expect(dock, '审批 dock 打开').toBeVisible({ timeout: 10_000 })
    const bItem = dock.locator(`[data-dsh-forge-approval-task="${keyOf(b)}"]`)
    await expect(bItem, 'B 的审批条目在场(dock 内)').toBeVisible({ timeout: 10_000 })
    await expect(bItem.locator('[data-dsh-forge-approval-body]'), '请求正文可见(载荷 join)')
      .toContainText('SC3 approval leg B: run the targeted fix tests')
    const bApprovalId = await bItem.getAttribute('data-dsh-forge-approval-item')

    // 互不串扰:B 待审批时 A/C 角标保持执行中。
    await expect(orchBadge(page, keyOf(a), 'running')).toBeVisible()
    await expect(orchBadge(page, keyOf(c), 'running')).toBeVisible()

    // 批准 → B 回执行中(≤5s)+ subagent 侧收据(outcome = allowed-once)。
    const tApprove = Date.now()
    await bItem.locator(`[data-dsh-forge-approval-approve="${bApprovalId}"]`).click()
    await waitForOrchBadge(page, keyOf(b), 'running', 20_000)
    const approveMs = Date.now() - tApprove
    console.log(`[sc3] approve→running(ms)=${String(approveMs)} budget=5000`)
    expect(approveMs, `批准 → 回执行中回流 ≤5000ms(实际 ${String(approveMs)}ms)`).toBeLessThanOrEqual(5_000)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const outcome = stub.readApprovals().find(row => row.agentId === bRow.sessionId && row.claimed === true)
      if (outcome !== undefined) {
        expect(outcome.outcome, '批准的决策送达(subagent 侧收据 = allowed-once)').toBe('allowed-once')
        break
      }
      await page.waitForTimeout(100)
      if (attempt === 99) throw new Error('approve outcome never reached the stub journal (decision delivery leg)')
    }

    // ---- AC-3 拒绝腿:注入 → 可见 → 拒绝 → 回执行中 + rejected 收据 ----
    const cRow = parallelRows.find(candidate => candidate.taskKey === keyOf(c)) as DispatchRowView
    stub.injectApproval({
      agentId: cRow.sessionId as string,
      toolName: 'Bash',
      callId: 'sc3-call-c',
      reason: 'SC3 approval leg C: the reject verdict leg',
    })
    await waitForOrchBadge(page, keyOf(c), 'awaiting', 20_000)
    await expect(entry).toHaveAttribute('data-dsh-forge-approval-entry-count', '1', { timeout: 10_000 })
    const cItem = dock.locator(`[data-dsh-forge-approval-task="${keyOf(c)}"]`)
    await expect(cItem).toBeVisible({ timeout: 10_000 })
    const cApprovalId = await cItem.getAttribute('data-dsh-forge-approval-item')
    await cItem.locator(`[data-dsh-forge-approval-reject="${cApprovalId}"]`).click()
    await waitForOrchBadge(page, keyOf(c), 'running', 20_000)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const outcome = stub.readApprovals().find(row => row.agentId === cRow.sessionId && row.claimed === true)
      if (outcome !== undefined) {
        expect(outcome.outcome, '拒绝的决策送达(subagent 侧收据 = rejected)').toBe('rejected')
        break
      }
      await page.waitForTimeout(100)
      if (attempt === 99) throw new Error('reject outcome never reached the stub journal (decision delivery leg)')
    }
    // 库级审计:两行审批已决(decided_by = workbench;批准/拒绝各一)。
    const decided = await bridgeInvoke<Array<{ state: string; decidedBy: string | null }>>(page, 'listApprovals', [projectId])
    const decidedStates = decided.filter(row => row.decidedBy === 'workbench').map(row => row.state).sort()
    expect(decidedStates, '审批审计:批准 + 拒绝各一(decided_by = workbench)').toEqual(['approved', 'rejected'])

    // 关闭审批 dock(后续失败腿需要工具栏派发入口;dock 是全高侧板,拦截指针)。
    await dock.locator('[data-dsh-forge-approval-close]').click()
    await expect(dock).toHaveCount(0, { timeout: 10_000 })

    // ---- 失败 + 重派发腿(stub create 注错 → failed + 原因 + 重派发)----
    stub.writeControl({ create: 'fail', createError: 'sc3 orchestrated launch failure' })
    await dispatchFromBoard(page, [keyOf(d)])
    await waitForOrchBadge(page, keyOf(d), 'failed', 30_000)
    const dRows = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === keyOf(d))
    expect(dRows, 'D 恰一行(失败程)').toHaveLength(1)
    const dFailed = dRows[0] as DispatchRowView
    expect(dFailed.state, 'D 行 failed(ERR_DISPATCH_LAUNCH_FAILED 面)').toBe('failed')
    expect(dFailed.error, '失败原因留档(呈现面 = 详情编排分区 reason)').toContain('sc3 orchestrated launch failure')

    // 详情侧板:失败行 + 原因 + [重派发](PRD Story 2 AC4 的一键重派发面)。
    await page.locator(`[data-dsh-forge-node-card="${keyOf(d)}"]`).click()
    const detail = page.locator(`[data-dsh-forge-task-detail="${keyOf(d)}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    const orchSection = detail.locator('[data-dsh-forge-orchestration-section]')
    await expect(orchSection).toBeVisible({ timeout: 10_000 })
    await expect(orchSection.locator('[data-dsh-forge-orch-failed-line]'), '编排分区失败行在场').toBeVisible()
    await expect(orchSection.locator('[data-dsh-forge-orch-reason]'), '失败原因呈现').toContainText('sc3 orchestrated launch failure')
    const redispatchButton = orchSection.locator(`[data-dsh-forge-orch-redispatch="${dFailed.id}"]`)
    await expect(redispatchButton, '[重派发] 在场且可用').toBeVisible()

    // 清错 → 重派发(二次确认)→ 新行 running + oracle 复验(重走全链)。
    stub.writeControl({})
    await redispatchButton.click()
    const redispatchConfirm = page.locator('[data-dsh-forge-dialog="redispatch-confirm"]')
    await expect(redispatchConfirm, '重派发二次确认对话框').toBeVisible({ timeout: 10_000 })
    await expect(redispatchConfirm.locator('[data-dsh-forge-redispatch-reason]'), '确认框回显失败原因').toContainText('sc3 orchestrated launch failure')
    await redispatchConfirm.locator('[data-dsh-forge-redispatch-go]').click()
    await expect(redispatchConfirm).toHaveCount(0, { timeout: 15_000 })
    await waitForOrchBadge(page, keyOf(d), 'running', 30_000)

    const dRowsAfter = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === keyOf(d))
    expect(dRowsAfter, '重派发 = 新行(旧行留审计轨迹)').toHaveLength(2)
    const dRetried = dRowsAfter.find(row => row.id !== dFailed.id) as DispatchRowView
    expect(dRetried.state, '新行 running').toBe('running')
    expect(dRetried.sessionId, '新行新预铸 session id(≠ 失败行)').not.toBe(dFailed.sessionId)

    let dPrompt: { sessionId: string; text: string; requestId: string } | undefined
    for (let attempt = 0; attempt < 100 && dPrompt === undefined; attempt += 1) {
      dPrompt = stub.readJournal()
        .filter(row => row.kind === 'prompt' && row.sessionId === dRetried.sessionId)
        .map(row => ({ sessionId: row.sessionId as string, text: row.text as string, requestId: row.requestId as string }))[0]
      if (dPrompt === undefined) await page.waitForTimeout(100)
    }
    expect(dPrompt, '重派发程 stub journal prompt 行在座').toBeDefined()
    const db2 = new DatabaseSync(join(corpus.userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as RepoDb
    try {
      const oracle = verifyPromptInjection({
        journalText: (dPrompt as { text: string }).text,
        presynthContent: recomposePresynth(db2, corpus.featuresRoot, projectId, keyOf(d)),
        promptHash: dRetried.promptHash,
        sessionId: dRetried.sessionId as string,
        requestId: (dPrompt as { requestId: string }).requestId,
      })
      expect(oracle, '重派发程注入 oracle 四件套(重走链口径不变)').toEqual({ ok: true })
    } finally {
      (db2 as unknown as { close(): void }).close()
    }

    // ---- 收尾:零 renderer pageerrors ------------------------------------
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
