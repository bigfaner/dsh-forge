// @feature dsh-forge-m3 | @web-e2e | @journey forge-m3-sc4
// Traceability: docs/features/dsh-forge-m3/tasks/6.6-sc4-stage-gates.md (AC-1..5)
// Authorities: tech-design §Testing Strategy·Key Test Scenarios (SC4 行)、
// §Interfaces·Interface 5 (阶段门与阶段资产:checkStageArtifacts 确定性 /
// advanceStage 门拒绝/放行 / stage_asset 文件 + 只读渲染 / 预合成消费 /
// watcher 偏离), prd-spec G4/SC4 + Story 4 (阶段门与上下文跨阶段传递),
// 6.2 base (已迁移语料 / unified dispatch stub / instance lock)。
//
// SC4 — the stage-gate acceptance leg over the 6.2 base, one journey:
//
//   已迁移项目(buildSc4Corpus 真内核链:write → register → scan → migrate →
//   stage_asset 索引;单 feature status='design' 且 docKinds=['prd'] ——
//   design/ 产物缺席即 AC-1 的「当前阶段产物不齐全」语料,2 个零依赖
//   pending coding.feature 任务)→
//     AC-1 任务一派发:警告门(缺失清单恰一项 design/)+ stub journal
//       零行(Hard Rule:检查路径零模型调用,e2e 侧 = 无模型通道流量)+
//       checkStageArtifacts 双调逐字段相等(确定性证据;依赖注入侧 = 单测
//       import 面白名单,apps/desktop/tests/workbench-stages.spec.ts 已钉定,
//       本腿不重复)→ 继续派发 → 确认 → running 角标 + journal prompt 行 +
//       注入 oracle 四件套(PhaseSummary 锚 = prd 资产,推进前最近一份);
//     AC-2 拒绝腿:Feature 详情 stepper design 节点 gate-pending 态(看板
//       可观察的被动面)→ [推进阶段] → GateHint ERR_STAGE_GATE_UNSATISFIED
//       + 内核缺失引导(路径 + forge_stage_summarize 生成路径)+ manifest
//       字节未动(拒绝零写入);
//     AC-2/3 放行腿:补 design/ 产物(tech-design.md)→ stageSummarize
//       (renderer 桥直达内核写面 = forge_stage_summarize 工具的同路由动词,
//       任务描述的「直写」腿)→ gateOpen=true + 文档根 stages/design.md
//       (frontmatter { stage, generated, goal } + 摘要正文)→ 重开详情门态
//       翻转(stepper 回正常态)→ 推进成功(manifest/pill/stepper 三面)→
//       「阶段资产」tab 渲染 design 卡:目标 + 摘要内容一致(逐字锚点)+
//       只读(渲染区零交互元素,TECH-markdown-001);
//     AC-4 新阶段注入:任务二派发(产物已齐 → 无警告直达确认)→ journal
//       prompt 的 PhaseSummary 块锚 = 新 design 资产绝对路径(最新目标 +
//       摘要的载体,spike-4 载体翻转:注入携路径、内容留文件 —— 路径 →
//       文件 → 目标/摘要链在 AC-3 已逐字断言)+ prd 旧锚退场 + oracle
//       四件套;
//     AC-5 偏离腿:外部直改 manifest status(tasks → completed,测试内
//       模拟外部会话跨阶段操作)→ watcher 偏离 → 看板卡「⚠ 偏离」徽标 →
//       不硬阻断三面:manifest 字节原样(感知零写回)、详情仍可开、动词
//       仍应答。
//
// 注入口径(spike-3/spike-4,SC3 同源):oracle 四件套 = ① sha256(text)
//   === dispatch 行 prompt_hash;② text 以测试侧重算的预合成内容逐字节
//   开头(重算 = 内核引擎字节 + 派发后库/文档树现场,故每程 oracle 紧随
//   其派发执行、先于任何阶段变更);③ 追加行恰好一行;④ requestId
//   确定性。
//
// 零模型调用双重证据(Hard Rule):journal 面 = 警告对话框在场时刻 stub
//   journal 零行(检查裁决已产出而模型通道零流量);依赖注入面 =
//   artifacts-check 的 import 白名单单测(既有,AC 引用不重复)。

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import { rebuildStageAssetIndex, listStageAssetRows, parseStageAssetMarkdown } from '../../../apps/desktop/src/main/workbench/stages/stage-asset-index.ts'
import { getTask } from '../../../apps/desktop/src/main/workbench/tasks/task-repo.ts'
import { createPresynthEngine } from '../../../apps/desktop/src/main/workbench/dispatch/presynth/assemble.ts'
import type { RepoDb } from '../../../apps/desktop/src/main/workbench/repos/types.ts'
import type { StageArtifactsReport, StageSummarizeResult } from '../../../apps/desktop/src/main/workbench/ipc/types.ts'

// ---------------------------------------------------------------------------
// The SC4 corpus: one design-stage feature whose design/ artifacts are absent
// ---------------------------------------------------------------------------

/** The journey's single feature slug. */
const SC4_FEATURE = 'sc4-stage-gates'

/** The pre-existing (pre-advance) stage asset — the OLD PhaseSummary anchor. */
const PRD_ASSET_REL = `${SC4_FEATURE}/stages/prd.md`

/** The gate-opening asset this journey generates — the NEW anchor (AC-3/4). */
const DESIGN_ASSET_REL = `${SC4_FEATURE}/stages/design.md`

/** The missing artifact AC-1's warning list must carry (exactly this one). */
const DESIGN_DOC_REL = `${SC4_FEATURE}/design/tech-design.md`

/**
 * Two tasks: 1 rides the warn-then-confirm dispatch (AC-1); 2 rides the
 * post-advance dispatch whose injection must carry the NEW stage asset
 * (AC-4). Zero dependencies (dispatchability), pending, typed.
 */
const SC4_TASKS = [
  { localId: '1', title: 'SC4 警告不阻断腿任务(coding.feature 协议)', type: 'coding.feature' },
  { localId: '2', title: 'SC4 新阶段注入腿任务(coding.feature 协议)', type: 'coding.feature' },
] as const

/** The board-qualified key of one task. */
const keyOf = (localId: string): string => `${SC4_FEATURE}/${localId}`

/** The distinctive strings the generated design asset carries (AC-3 内容一致 anchors). */
const DESIGN_GOAL = 'SC4 design 阶段目标 — 阶段硬门验收旅程的目标锚点(警告不阻断/门拒绝/资产/注入/偏离)'
const DESIGN_SUMMARY_MARK = 'SC4 design 摘要锚点 — 门校验、资产面板与新阶段注入三链路已验收'
const DESIGN_SUMMARY = [
  DESIGN_SUMMARY_MARK,
  '',
  '交付面:确定性产物检查(warn 不阻断)、推进门(总结未生成即拒)、阶段资产单一规范文件、新阶段会话注入最新目标与摘要、外部跨阶段偏离标识。',
  '',
].join('\n')

/** The hand-built task set (the exact SC4 shape: 2 zero-dep pending tasks). */
function sc4TaskSet(): GeneratedTaskSet {
  const tasks: GeneratedTask[] = SC4_TASKS.map(spec => ({
    stem: `${spec.localId}-sc4`,
    localId: spec.localId,
    title: spec.title,
    status: 'pending',
    type: spec.type as GeneratedTask['type'],
    dependencies: [],
    record: null,
  }))
  const statusCounts = { pending: 0, in_progress: 0, completed: 0, blocked: 0, suspended: 0, skipped: 0, rejected: 0 } as Record<string, number>
  for (const task of tasks) statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1
  // status 'design' + docKinds ['prd']: the artifacts matrix at the CURRENT
  // stage expects design/ ≥ 1 — absent by construction ⇒ AC-1's corpus.
  const feature: GeneratedFeature = {
    slug: SC4_FEATURE,
    status: 'design',
    docKinds: ['prd'],
    tasks,
  }
  return {
    options: {
      seed: 'dsh-forge-m3-sc4',
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
function stageAssetMarkdown(stage: 'prd', goal: string): string {
  return [
    '---',
    `stage: ${stage}`,
    'generated: "2026-09-20T10:00:00.000Z"',
    `goal: "${goal}"`,
    '---',
    '',
    `# ${stage} 阶段总结(SC4 语料)`,
    '',
    `目标:${goal}`,
    '',
  ].join('\n')
}

/** Facts about the built journey corpus. */
interface Sc4Corpus {
  readonly codeRoot: string
  readonly docsRoot: string
  readonly featuresRoot: string
  readonly userDataDir: string
  readonly projectId: string
}

/**
 * Build the PRE-MIGRATED SC4 corpus through the REAL kernel chain (the
 * buildSc3Corpus discipline: write tree → register → scan → migrate →
 * stage-asset index), so the app boots on `data_authority='sqlite'` with the
 * two typed rows and the prd stage-asset indexed. design/ docs are NOT
 * written — the missing-artifact warning corpus (AC-1).
 */
async function buildSc4Corpus(root: string): Promise<Sc4Corpus> {
  const written = writeForgeProject(sc4TaskSet(), { codeRoot: join(root, 'repo') })
  // The pre-advance asset (the OLD injection anchor): prd stage summary.
  const stagesDir = join(written.docsRoot, 'docs', 'features', SC4_FEATURE, 'stages')
  mkdirSync(stagesDir, { recursive: true })
  writeFileSync(join(stagesDir, 'prd.md'), stageAssetMarkdown('prd', 'SC4 语料 — PRD 阶段目标'))

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
    if (indexed < 1 || listStageAssetRows(db as RepoDb, project.id, SC4_FEATURE).length < 1) {
      throw new Error(`SC4 corpus stage-asset index incomplete (${String(indexed)} rows) — the prd anchor is missing`)
    }
    return { codeRoot: written.codeRoot, docsRoot: written.docsRoot, featuresRoot, userDataDir, projectId: project.id }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------
// Renderer-side helpers (SC1/SC3 precedents)
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

/**
 * The board dispatch entry leg, PAUSED for in-dialog assertions: enter
 * selection → check one task → [派发] → return once the warning OR confirm
 * dialog is on screen (the caller asserts + drives the rest of the chain).
 */
async function startBoardDispatch(page: Page, taskKey: string): Promise<void> {
  await page.locator('[data-dsh-forge-dispatch-entry]').click()
  await expect(page.locator('[data-dsh-forge-selection-layer="active"]')).toBeVisible({ timeout: 10_000 })
  await page.locator(`[data-dsh-forge-select-chk="${taskKey}"] [data-dsh-forge-select-chk-input]`).check()
  await page.locator('[data-dsh-forge-dispatch-go]').click()
  await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"], [data-dsh-forge-dialog="dispatch-confirm"]').first())
    .toBeVisible({ timeout: 10_000 })
}

/** The kernel-side recomputation of one task's presynth content (oracle input). */
function recomposePresynth(db: RepoDb, featuresRoot: string, projectId: string, taskKey: string): string {
  const task = getTask(db, projectId, taskKey)
  if (task === null) throw new Error(`task ${taskKey} not found in the journey kernel`)
  const engine = createPresynthEngine({ db, resolveFeaturesRoot: () => featuresRoot })
  return engine.composePresynth(task)
}

/** One journal prompt row (the injection oracle's subject). */
interface PromptRow { readonly sessionId: string; readonly text: string; readonly requestId: string }

/** Poll the unified stub journal until one session's prompt row lands. */
async function waitForPromptRow(shell: PluginShell, stub: DispatchStub, sessionId: string): Promise<PromptRow> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const row = stub.readJournal()
      .filter(entry => entry.kind === 'prompt' && entry.sessionId === sessionId)
      .map(entry => ({ sessionId: entry.sessionId as string, text: entry.text as string, requestId: entry.requestId as string }))[0]
    if (row !== undefined) return row
    await shell.page.waitForTimeout(100)
  }
  throw new Error(`stub journal never recorded the prompt row of session ${sessionId}`)
}

// ---------------------------------------------------------------------------
// The SC4 leg
// ---------------------------------------------------------------------------

test('sc4/stage-gates: warn-not-blocking dispatch (zero model traffic) → gate reject/pass → stage asset render → post-advance injection → deviation badge', async ({ }, testInfo) => {
  testInfo.setTimeout(600_000)

  // Hard Rule / 6.2 base — the instance-lock discipline runs BEFORE any launch.
  assertNoActiveDshForgeInstances({ excludePids: new Set([process.pid]) })

  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-sc4-'))
  const stubDir = mkdtempSync(join(tmpdir(), 'dsh-forge-sc4-stub-'))
  const stub: DispatchStub = createDispatchStub(stubDir)
  const corpus = await buildSc4Corpus(root)
  const manifestPath = join(corpus.featuresRoot, SC4_FEATURE, 'manifest.md')
  const prdAssetAbs = join(corpus.featuresRoot, PRD_ASSET_REL)
  const designAssetAbs = join(corpus.featuresRoot, DESIGN_ASSET_REL)

  const shell = await launchWorkbenchShell({
    userDataDir: corpus.userDataDir,
    stubEnv: stub.env,
  })
  try {
    const { page } = shell
    await shell.uiReady()
    await switchToWorkbench(page)

    // ---- journey pre-state: the migrated corpus is the boot's own kernel ----
    expect(existsSync(join(corpus.featuresRoot, SC4_FEATURE, 'tasks', 'index.json')),
      '已迁移语料:index.json 已淘汰').toBe(false)

    // 显式激活(单激活事务)→ 任务 tab。
    const displayName = corpus.codeRoot.split(/[\\/]/).filter(part => part !== '').pop() as string
    const card = page.locator('[data-dsh-forge-project-card]', { hasText: displayName }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.locator('[data-dsh-forge-card-action="activate"]').click()
    await expect(card).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()

    const state = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    const projectId = state.activeProjectId
    expect(projectId, '激活项目在座').toBe(corpus.projectId)
    for (const spec of SC4_TASKS) {
      await expect(page.locator(`[data-dsh-forge-node-card="${keyOf(spec.localId)}"]`)).toBeVisible({ timeout: 20_000 })
    }

    // =========================================================================
    // AC-1:产物缺失 → 警告 + 缺失清单(warn 不阻断)→ 确认后派发成功
    // =========================================================================
    await startBoardDispatch(page, keyOf('1'))

    // 警告对话框在场(而非直达确认)= 缺失清单已呈现,派发未发生。
    const warning = page.locator('[data-dsh-forge-dialog="dispatch-warning"]')
    await expect(warning, '产物缺失 → 警告对话框(非直达确认)').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]'), '警告门先于确认门').toHaveCount(0)
    await expect(page.locator('[data-dsh-forge-dispatch-warning-note]'), '不阻断说明行在场').toBeVisible()

    // 缺失清单:恰一项 —— design/ 文档存在性(stage=design,rule=file-missing)。
    const missingItems = page.locator('[data-dsh-forge-dispatch-missing-item]')
    await expect(missingItems, '缺失清单恰一项(design/ 产物缺席)').toHaveCount(1)
    await expect(missingItems.first()).toHaveAttribute('data-dsh-forge-dispatch-missing-stage', 'design')
    await expect(missingItems.first()).toHaveAttribute('data-dsh-forge-dispatch-missing-rule', 'file-missing')
    await expect(missingItems.first()).toContainText('design/')

    // Hard Rule:检查路径零模型调用 —— 裁决已产出(对话框在场)而模型通道
    // (stub journal:create/prompt/...)零流量。依赖注入侧证据 = 单测 import
    // 面白名单(workbench-stages.spec.ts AC-2,既有钉定)。
    expect(stub.readJournal(), '警告在场时刻 stub journal 零行(检查 = 确定性代码,无模型通道流量)').toHaveLength(0)

    // 确定性证据(双重面之一):同输入双调逐字段相等。
    const reportA = await bridgeInvoke<StageArtifactsReport>(page, 'checkStageArtifacts', [{ projectId, featureSlug: SC4_FEATURE }])
    const reportB = await bridgeInvoke<StageArtifactsReport>(page, 'checkStageArtifacts', [{ projectId, featureSlug: SC4_FEATURE }])
    expect(reportA, 'checkStageArtifacts 双调逐字段相等(确定性)').toEqual(reportB)
    expect(reportA.stage, '检查对象 = feature 当前阶段 design').toBe('design')
    expect(reportA.satisfied, '缺失 ⇒ satisfied=false(仍可派发)').toBe(false)
    expect(reportA.missing, '报告缺失集 = design/ 存在性').toEqual([
      { stage: 'design', rule: 'file-missing', artifact: 'design/', detail: 'expected at least 1 design document under design/ (found 0)' },
    ])

    // 确认后派发成功:继续 → 确认 → 派发 → running + journal prompt 行。
    await page.locator('[data-dsh-forge-dispatch-warning-continue]').click()
    const confirm = page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')
    await expect(confirm, '继续派发 → 确认门').toBeVisible({ timeout: 10_000 })
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(confirm).toHaveCount(0, { timeout: 15_000 })
    await waitForOrchBadge(page, keyOf('1'), 'running', 20_000)

    const row1 = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === keyOf('1'))[0] as DispatchRowView
    expect(row1.state, '任务一派发成功(确认后不阻断)').toBe('running')
    expect(row1.sessionId, '行携带预铸 session id').not.toBeNull()

    // 注入 oracle 四件套 + 推进前锚(要素② = prd 资产,最近的「上一阶段」)。
    const prompt1 = await waitForPromptRow(shell, stub, row1.sessionId as string)
    const { DatabaseSync } = await import('node:sqlite')
    let db = new DatabaseSync(join(corpus.userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as RepoDb
    try {
      const oracle1 = verifyPromptInjection({
        journalText: prompt1.text,
        presynthContent: recomposePresynth(db, corpus.featuresRoot, projectId, keyOf('1')),
        promptHash: row1.promptHash,
        sessionId: row1.sessionId as string,
        requestId: prompt1.requestId,
      })
      expect(oracle1, '任务一注入 oracle 四件套(hash/逐字节前缀/单追加行/requestId)').toEqual({ ok: true })
      expect(prompt1.text, '推进前 PhaseSummary 块在场').toContain('## PhaseSummary')
      expect(prompt1.text, '推进前锚 = prd 资产(最近一份)').toContain(prdAssetAbs)
    } finally {
      (db as unknown as { close(): void }).close()
    }

    // =========================================================================
    // AC-2 拒绝腿:总结未生成 → advanceStage 拒绝 + 引导(看板可观察)
    // =========================================================================
    await page.locator('[data-dsh-forge-tab="workbench/features"]').click()
    const featureCard = page.locator(`[data-dsh-forge-feature-card="${SC4_FEATURE}"]`)
    await expect(featureCard, 'Feature 卡在场').toBeVisible({ timeout: 30_000 })
    await expect(featureCard.locator('[data-dsh-forge-badge="deviation"]'), '前置:无偏离徽标').toHaveCount(0)
    await featureCard.click()

    const detail = page.locator(`[data-dsh-forge-feature-detail="${SC4_FEATURE}"]`)
    await expect(detail).toBeVisible({ timeout: 10_000 })
    const stepperDesign = detail.locator('[data-dsh-forge-stepper-phase="design"]')
    await expect(stepperDesign, 'stepper design 节点 gate-pending 态(门态被动面)').toHaveAttribute('data-dsh-forge-stepper-state', 'gate-pending', { timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-gate-hint-line]'), '门提示行在场(总结未生成)').toBeVisible()

    // 推进 → 拒绝:ERR_STAGE_GATE_UNSATISFIED + 内核引导(缺失路径 + 生成路径)。
    const advanceEntry = detail.locator('[data-dsh-forge-advance-entry]')
    await expect(advanceEntry).toBeVisible({ timeout: 10_000 })
    await advanceEntry.click()
    const rejected = detail.locator('[data-dsh-forge-gate-hint-rejected="ERR_STAGE_GATE_UNSATISFIED"]')
    await expect(rejected, '推进被拒 + 引导块(role=alert)').toBeVisible({ timeout: 10_000 })
    await expect(rejected, '引导携带缺失资产地址').toContainText(`stages/design.md`)
    await expect(rejected, '引导携带生成路径(forge_stage_summarize)').toContainText('forge_stage_summarize')
    expect(readFileSync(manifestPath, 'utf8'), '拒绝零写入:manifest 仍为 design').toContain('status: design')

    // =========================================================================
    // AC-2 放行 + AC-3:总结生成(直写腿)→ 推进成功 → 资产文件 + 只读渲染
    // =========================================================================
    // 模拟 design 阶段 agent 会话的产出:补齐 design/ 产物(消除 AC-1 的
    // 缺失项,使 AC-4 的派发走「产物齐 → 无警告」极性)+ 生成阶段总结
    // (stageSummarize = forge_stage_summarize 工具的同路由内核写面)。
    mkdirSync(join(corpus.featuresRoot, SC4_FEATURE, 'design'), { recursive: true })
    writeFileSync(join(corpus.featuresRoot, DESIGN_DOC_REL), `# ${SC4_FEATURE} design fixture\n\nSC4 旅程补齐的 design 阶段产物(tech-design)。\n`, 'utf8')
    const summarized = await bridgeInvoke<StageSummarizeResult>(page, 'stageSummarize', [{
      projectId,
      featureSlug: SC4_FEATURE,
      stage: 'design',
      goal: DESIGN_GOAL,
      summary: DESIGN_SUMMARY,
    }])
    expect(summarized.path, '写后相对路径 = stages/<stage>.md').toBe(DESIGN_ASSET_REL)
    expect(summarized.featureStage, '写时 feature 仍在 design').toBe('design')
    expect(summarized.gateOpen, '本次写入即开门(gateOpen)').toBe(true)

    // AC-3 文件面:文档根存在 stages/design.md,内容 = frontmatter{stage,
    // goal} + 摘要正文(内核铸造;内容一致的第一断言面)。
    expect(existsSync(designAssetAbs), '推进后文档根存在 stages/design.md(单一规范文件)').toBe(true)
    const assetMarkdown = readFileSync(designAssetAbs, 'utf8')
    const parsedAsset = parseStageAssetMarkdown(assetMarkdown)
    expect(parsedAsset, '资产 frontmatter 可解析').not.toBeNull()
    expect(parsedAsset?.stage, 'frontmatter stage = design').toBe('design')
    expect(parsedAsset?.goal, 'frontmatter goal 逐字一致').toBe(DESIGN_GOAL)
    expect(assetMarkdown, '正文摘要逐字一致').toContain(DESIGN_SUMMARY_MARK)

    // 重开详情(返回 → 再入):门态被动面翻转 —— gate-pending 退场。
    await detail.locator('[data-dsh-forge-feature-back]').click()
    await expect(featureCard).toBeVisible({ timeout: 10_000 })
    await featureCard.click()
    await expect(detail).toBeVisible({ timeout: 10_000 })
    await expect(stepperDesign, '总结已生成 → design 节点回正常态').toHaveAttribute('data-dsh-forge-stepper-state', 'current', { timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-gate-hint-line]'), '门提示行退场').toHaveCount(0)

    // 推进成功:manifest(status: tasks)+ 详情 pill + stepper 三面。
    await advanceEntry.click()
    await expect(advanceEntry, '推进按钮态翻 advanced').toHaveAttribute('data-dsh-forge-advance-state', 'advanced', { timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-feature-status="tasks"]'), '详情状态 Pill = tasks(板回流)').toBeVisible({ timeout: 10_000 })
    await expect(stepperDesign, 'stepper:design 已越过(reached)').toHaveAttribute('data-dsh-forge-stepper-state', 'reached', { timeout: 10_000 })
    expect(readFileSync(manifestPath, 'utf8'), '内核写 manifest status(推进内化)').toContain('status: tasks')

    // AC-3 渲染面:「阶段资产」tab 只读渲染 design 卡(目标 + 摘要,内容一致)。
    await detail.locator('[data-dsh-forge-feature-doc-tab="assets"]').click()
    const assetsPanel = detail.locator('[data-dsh-forge-feature-doc-panel="assets"]')
    await expect(assetsPanel, '阶段资产 tab 面板在场').toBeVisible({ timeout: 10_000 })
    const designCard = assetsPanel.locator('[data-dsh-forge-stage-asset="design"]')
    await expect(designCard, 'design 资产卡在场(stage_advanced 回流 → 新卡入场)').toBeVisible({ timeout: 15_000 })
    await expect(designCard, '目标逐字渲染(frontmatter goal)').toContainText(DESIGN_GOAL)
    await expect(designCard, '摘要逐字渲染(正文)').toContainText(DESIGN_SUMMARY_MARK)
    await expect(designCard.locator('button, a, [role="button"]'), '只读纪律:渲染区零交互元素').toHaveCount(0)

    // =========================================================================
    // AC-4:推进后新派发注入含最新目标 + 摘要(journal 断言)
    // =========================================================================
    await page.locator('[data-dsh-forge-tab="workbench/tasks"]').click()
    await expect(page.locator(`[data-dsh-forge-node-card="${keyOf('2')}"]`)).toBeVisible({ timeout: 20_000 })
    await startBoardDispatch(page, keyOf('2'))

    // 产物已齐(AC-1 的缺失项已补)→ 无警告,直达确认门(门矩阵极性翻转)。
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]'), '产物齐 → 无警告直达确认').toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-warning"]'), '警告门不再出现').toHaveCount(0)
    await page.locator('[data-dsh-forge-dispatch-confirm-go]').click()
    await expect(page.locator('[data-dsh-forge-dialog="dispatch-confirm"]')).toHaveCount(0, { timeout: 15_000 })
    await waitForOrchBadge(page, keyOf('2'), 'running', 20_000)

    const row2 = (await bridgeInvoke<DispatchRowView[]>(page, 'getDispatches', [projectId]))
      .filter(row => row.taskKey === keyOf('2'))[0] as DispatchRowView
    expect(row2.state, '任务二派发成功').toBe('running')

    // journal 断言:注入 PhaseSummary 块锚 = 最新阶段资产(design,携目标 +
    // 摘要的规范载体 —— 载体翻转:注入携路径,内容留文件,AC-3 已逐字验)。
    const prompt2 = await waitForPromptRow(shell, stub, row2.sessionId as string)
    expect(prompt2.text, '新阶段注入含 PhaseSummary 块').toContain('## PhaseSummary')
    expect(prompt2.text, '锚 = 最新(design)阶段资产绝对路径').toContain(designAssetAbs)
    expect(prompt2.text, '旧(prd)锚退场(推进后最新一份语义)').not.toContain(prdAssetAbs)

    db = new DatabaseSync(join(corpus.userDataDir, 'workbench', 'workbench.db'), { readOnly: true }) as unknown as RepoDb
    try {
      const oracle2 = verifyPromptInjection({
        journalText: prompt2.text,
        presynthContent: recomposePresynth(db, corpus.featuresRoot, projectId, keyOf('2')),
        promptHash: row2.promptHash,
        sessionId: row2.sessionId as string,
        requestId: prompt2.requestId,
      })
      expect(oracle2, '任务二注入 oracle 四件套(推进后链口径)').toEqual({ ok: true })
    } finally {
      (db as unknown as { close(): void }).close()
    }

    // =========================================================================
    // AC-5:外部直改 manifest status → 看板偏离徽标;外部操作不被阻断
    // =========================================================================
    await page.locator('[data-dsh-forge-tab="workbench/features"]').click()
    await expect(featureCard, 'Feature 看板(列表视图)在场').toBeVisible({ timeout: 30_000 })
    await expect(featureCard.locator('[data-dsh-forge-badge="deviation"]'), '前置:无偏离徽标').toHaveCount(0)

    // 外部跨阶段操作(测试内模拟):manifest status 直改 tasks → completed。
    const manifestBefore = readFileSync(manifestPath, 'utf8')
    expect(manifestBefore, '前置:manifest 在 tasks').toContain('status: tasks')
    const externalManifest = manifestBefore.replace('status: tasks', 'status: completed')
    expect(externalManifest, '替换确实发生').not.toBe(manifestBefore)
    const tDeviate = Date.now()
    writeFileSync(manifestPath, externalManifest, 'utf8')

    // watcher(变更批 400ms debounce)→ 偏离检测 → deviation_detected →
    // 看板回流 → 「⚠ 偏离」徽标呈现(呈现-only,Hard Rule:不阻断)。
    await featureCard.locator('[data-dsh-forge-badge="deviation"]').waitFor({ state: 'visible', timeout: 20_000 })
    const deviateMs = Date.now() - tDeviate
    console.log(`[sc4] external-edit→deviation-badge(ms)=${String(deviateMs)} (watcher 400ms debounce + scan + board reflux)`)

    // 不硬阻断三面:① manifest 字节原样(感知零写回,外部操作不被撤销);
    expect(readFileSync(manifestPath, 'utf8'), '偏离 ≠ 阻断:外部 manifest 字节原样(零写回)').toBe(externalManifest)
    // ② 看板仍可导航(详情可开,详情头部同徽标);
    await featureCard.click()
    await expect(detail, '详情仍可打开(不阻断导航)').toBeVisible({ timeout: 10_000 })
    await expect(detail.locator('[data-dsh-forge-badge="deviation"]'), '详情头部偏离徽标(卡 + 详情同源)').toBeVisible()
    // ③ 动词面仍应答(内核未进入任何阻断态)。
    const stateAfter = await bridgeInvoke<{ activeProjectId: string | null }>(page, 'getState', [])
    expect(stateAfter.activeProjectId, '动词面仍应答').toBe(projectId)

    // ---- 收尾:零 renderer pageerrors ---------------------------------------
    expect(shell.pageErrors, `renderer pageerrors: ${shell.pageErrors.join(' | ')}`).toEqual([])
  } finally {
    await shell.close()
    rmSync(stubDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  }
})
