// Task 3.4 kernel legs — the pre-synthesis engine (three-element assembly +
// prompt_hash discipline + the ported template library). AC groups:
//
//   AC-1 三要素注入内容 — 组装产物逐段包含包装协议前导段、身份块、任务类型
//            协议正文、stage_asset 目标摘要(要素②)、生效偏好渲染(要素③,
//            三级解析 + task frontmatter 覆盖优先级);组合消息逐字符断言。
//   AC-2 prompt_hash 口径 — sha256(组合首条消息)落 dispatch 行(引擎经
//            dispatch-service 全链);hash oracle 复用 M2 journal 逐字符比对
//            形态(接口预留:hash 全等/前缀逐字节/恰好两行追加 + 逐行前缀
//            对拍 —— Interface 7,任务 2.8 两行化口径)。
//   AC-3 模板映射 — spike-4 清单全覆盖(逐类型路由 + 特征片段;surface
//            后缀回退;fix-record-missed 旗标路由);受限/被机制取代类型
//            派发面封闭;模板库完整性校验(ValidatePromptTemplates 契约
//            移植);零 CLI 文案残留(取代 forge prompt,禁 eval 的常数性)。
//   AC-4 动态性 — 摘要更新/偏好变更后再派发产物反映最新值;无 stage_asset
//            的行为显式定义(PhaseSummary 块整体省略)并有断言。
//
// Everything runs against the real migrated db (node:sqlite) + real scratch
// doc trees — no spawn, no CLI, no network, no model calls (Hard Rule:
// 确定性内核).

import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'
import { getTask, insertTask, type AuthoritativeTask } from '../src/main/workbench/tasks/task-repo.ts'
import type { StageArtifactsReport } from '../src/main/workbench/ipc/types.ts'
import { createDispatchVerbService, type DispatchVerbService } from '../src/main/workbench/dispatch/dispatch-service.ts'
import type { DispatchLaunchInput, DispatchLaunchPort } from '../src/main/workbench/dispatch/launch-port.ts'
import {
  buildPromptTemplateData,
  categoryForType,
  collapseBlankLines,
  composeFirstUserMessage,
  composePresynthContent,
  createPresynthEngine,
  isTestableType,
  mintDispatchSessionId,
  readTaskFrontmatter,
  renderPromptTemplate,
  resolveCoverageForType,
  resolveStageSummaryPath,
  routeTemplate,
  taskFileOf,
  validateTemplateLibrary,
  type PresynthContextInput,
} from '../src/main/workbench/dispatch/presynth/assemble.ts'
import {
  DISPATCH_RESTRICTED_TYPES,
  EXECUTOR_PREAMBLE,
  MECHANISM_REPLACED_TYPES,
  NAMING_MARKER,
  PROMPT_TEMPLATES,
  attributionLine,
  namingLine,
} from '../src/main/workbench/dispatch/presynth/templates.ts'
import { ATTRIBUTION_MARKER, checkInjectionOracle, promptHashOf } from '../src/main/workbench/dispatch/presynth/hash.ts'
import { replaceStageAssets } from '../src/main/workbench/stages/stage-asset-index.ts'
import type { StageAssetRow } from '../src/main/workbench/ipc/types.ts'
import { upsertFeatureSnapshot } from '../src/main/workbench/repos/feature-snapshots.ts'

const FIXED_AT = '2026-09-24T10:00:00.000Z'

const scratches: string[] = []
const openDbs: DatabaseSyncLike[] = []
let scratchSeq = 0

function makeScratch(): string {
  scratchSeq += 1
  const dir = join(tmpdir(), `dsh-forge-presynth-${String(process.pid)}-${String(scratchSeq)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try {
      db.close()
    } catch {
      // already closed by the test — nothing to do
    }
  }
  for (const dir of scratches.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
    } catch {
      // best effort:句柄竞态留给下一个唯一命名(不复用序列号)
    }
  }
})

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 域错误 code 断言(message 与 code 分立面)。 */
function expectErrorCode(run: () => unknown, code: string): void {
  try {
    run()
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
    return
  }
  throw new Error(`expected ${code} but nothing was thrown`)
}

/** 可派发类型 × 特征片段(spike-4 §2.2 移植清单;受限 5 类型不在派发面)。 */
const DISPATCHABLE_TYPES: ReadonlyArray<readonly [string, string, string]> = [
  ['coding.feature', 'coding', 'implementing a new feature'],
  ['coding.enhancement', 'coding', 'enhancing an existing feature'],
  ['coding.cleanup', 'coding', 'cleaning up technical debt'],
  ['coding.refactor', 'coding', 'restructuring code without changing its external behavior'],
  ['coding.fix', 'coding', 'fixing compilation errors, test failures'],
  ['doc', 'doc', 'creating or modifying documentation'],
  ['doc.review', 'doc', 'reviewing documentation'],
  ['doc.fix', 'doc', 'fixing documentation issues surfaced by review or evaluation'],
  ['test.gen-contracts', 'test', 'generating test contracts'],
  ['test.gen-journeys', 'test', 'generating test journeys'],
  ['test.gen-scripts', 'test', 'generating test scripts'],
  ['test.run', 'test', 'running e2e tests'],
  ['validation.code', 'validation', 'validating code quality'],
  ['validation.ux', 'validation', 'validating UX quality'],
]

/** spike-4 §7 库成员清单(19 类型 + fix-record-missed;gate/doc.summary 不入库)。 */
const EXPECTED_LIBRARY_KEYS: readonly string[] = [
  ...DISPATCHABLE_TYPES.map(([type]) => type),
  'doc.consolidate',
  'doc.drift',
  'eval.journey',
  'eval.contract',
  'code-quality.simplify',
  'fix-record-missed',
]

// ---------------------------------------------------------------------------
// 种子工具(db + 文档树)
// ---------------------------------------------------------------------------

interface Seed {
  readonly db: RepoDb
  readonly projectId: string
  readonly featuresRoot: string
}

async function seedProject(options?: { authority?: 'files' | 'sqlite' }): Promise<Seed> {
  const root = makeScratch()
  const featuresRoot = join(root, 'features')
  mkdirSync(featuresRoot, { recursive: true })
  const { db } = await openDatabase(join(root, 'user'))
  openDbs.push(db)
  const projectId = 'p-presynth'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)
  db.prepare('UPDATE projects SET data_authority = ? WHERE id = ?').run(options?.authority ?? 'sqlite', projectId)
  return { db, projectId, featuresRoot }
}

function seedTask(seed: Seed, overrides?: Partial<AuthoritativeTask>): AuthoritativeTask {
  const taskKey = overrides?.taskKey ?? 'alpha/1.1'
  insertTask(seed.db, {
    projectId: seed.projectId,
    taskKey,
    featureSlug: 'alpha',
    title: 'demo task',
    status: 'pending',
    blockers: [],
    taskType: overrides?.taskType ?? 'coding.feature',
    descPath: overrides !== undefined && 'descPath' in overrides ? overrides.descPath : 'alpha/tasks/1.1.md',
    updatedBy: 'kernel',
    updatedAt: FIXED_AT,
  })
  const task = getTask(seed.db, seed.projectId, taskKey)
  if (task === null) throw new Error(`seed task ${taskKey} not readable back`)
  return task
}

/** 写任务 md(真实文档树;frontmatter 摄取面 = 缺口 2 裁定的派发时读取)。 */
function writeTaskDoc(seed: Seed, relative: string, frontmatter: { coverage?: number; complexity?: string } = {}): string {
  const file = join(seed.featuresRoot, relative)
  mkdirSync(join(file, '..'), { recursive: true })
  const lines = ['---', 'id: "1.1"', 'title: "demo"']
  if (frontmatter.coverage !== undefined) lines.push(`coverage: ${String(frontmatter.coverage)}`)
  lines.push(`complexity: "${frontmatter.complexity ?? 'medium'}"`)
  lines.push('---', '', '# demo task', '', '## Description', '', 'demo', '')
  writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}

function seedStageAssets(seed: Seed, stages: readonly string[]): StageAssetRow[] {
  const rows = stages.map(stage => ({ stage: stage as StageAssetRow['stage'], path: `alpha/stages/${stage}.md`, generatedAt: FIXED_AT }))
  replaceStageAssets(seed.db, seed.projectId, 'alpha', rows)
  return rows
}

function seedPref(seed: Seed, scope: 'global' | 'project' | 'feature', key: string, value: unknown): void {
  const scopeId = scope === 'global' ? '' : scope === 'project' ? seed.projectId : `${seed.projectId}/alpha`
  seed.db
    .prepare('INSERT INTO prefs (scope, scope_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(scope, scopeId, key, JSON.stringify(value), FIXED_AT)
}

/** 纯数据上下文(矩阵测试直给;默认 = coding.feature + prd 资产 + 注册表默认偏好)。 */
function makeContext(seed: Seed, task: AuthoritativeTask, overrides?: Partial<PresynthContextInput>): PresynthContextInput {
  return {
    task,
    featuresRoot: seed.featuresRoot,
    stageAssets: seedStageAssets(seed, ['prd']),
    featureStatus: 'design',
    effectivePrefs: {
      'coverage.coding.feature': { type: 'percentage', percentage: 80 },
    },
    taskFrontmatter: { coverage: null, complexity: 'medium' },
    ...(overrides ?? {}),
  }
}

// ---------------------------------------------------------------------------
// AC-3 前置:模板库完整性(校验不过则逐类型矩阵全部失真)
// ---------------------------------------------------------------------------

describe('AC-3 template library — spike-4 manifest completeness', () => {
  it('holds exactly the spike-4 §7 manifest (19 type protocols + fix-record-missed; gate/doc.summary excluded)', () => {
    expect([...Object.keys(PROMPT_TEMPLATES)].sort()).toEqual([...EXPECTED_LIBRARY_KEYS].sort())
    expect(PROMPT_TEMPLATES.gate).toBeUndefined()
    expect(PROMPT_TEMPLATES['doc.summary']).toBeUndefined()
    for (const key of Object.keys(PROMPT_TEMPLATES)) {
      expect((PROMPT_TEMPLATES[key] ?? '').length, `template ${key} non-empty`).toBeGreaterThan(0)
    }
  })

  it('passes the ported ValidatePromptTemplates contract (metadata cross-check + zero-value render)', () => {
    expect(() => validateTemplateLibrary()).not.toThrow()
  })

  it('closes dispatch on restricted types and mechanism-replaced types, rejects unknown/null types', () => {
    for (const type of DISPATCH_RESTRICTED_TYPES) {
      expectErrorCode(() => routeTemplate(type), 'ERR_TASK_TYPE_NOT_DISPATCHABLE')
    }
    for (const type of MECHANISM_REPLACED_TYPES) {
      expectErrorCode(() => routeTemplate(type), 'ERR_TASK_TYPE_NOT_DISPATCHABLE')
    }
    expectErrorCode(() => routeTemplate(null), 'ERR_TASK_TYPE_UNKNOWN')
    expectErrorCode(() => routeTemplate('nope.thing'), 'ERR_TASK_TYPE_UNKNOWN')
    // surface 后缀仅系统类型可带(业务类型严格校验保留)
    expectErrorCode(() => routeTemplate('coding.feature.cli'), 'ERR_TASK_TYPE_UNKNOWN')
    // 受限类型的 suffixed 变体共享基型协议 → 同样封闭
    expectErrorCode(() => routeTemplate('eval.journey.web'), 'ERR_TASK_TYPE_NOT_DISPATCHABLE')
  })

  it('routes surface-suffixed system types back to the base protocol and honors the fix-record-missed flag', () => {
    expect(routeTemplate('test.gen-scripts.cli')).toBe(PROMPT_TEMPLATES['test.gen-scripts'])
    expect(routeTemplate('coding.feature')).toBe(PROMPT_TEMPLATES['coding.feature'])
    expect(routeTemplate('doc', { fixRecordMissed: true })).toBe(PROMPT_TEMPLATES['fix-record-missed'])
    expectErrorCode(() => routeTemplate('gate.cli'), 'ERR_TASK_TYPE_NOT_DISPATCHABLE') // suffixed 变体解析到被机制取代的基型
  })
})

// ---------------------------------------------------------------------------
// AC-1 三要素注入内容断言(逐段逐字符)
// ---------------------------------------------------------------------------

describe('AC-1 three-element assembly — section-by-section character assertions', () => {
  it('renders wrapper preamble + identity block + type protocol + stage summary + effective coverage (逐段包含)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    writeTaskDoc(seed, 'alpha/tasks/1.1.md')
    const context = makeContext(seed, task)
    const presynth = composePresynthContent(context)

    // 前导段(包装协议并入):六步协议 + 硬约束 + Pause Protocol + DONE 格式
    expect(presynth.startsWith(EXECUTOR_PREAMBLE)).toBe(true)
    expect(presynth).toContain('## Execution Protocol')
    expect(presynth).toContain('<EXTREMELY-IMPORTANT>')
    expect(presynth).toContain('**Pause Protocol**')
    expect(presynth).toContain('DONE: <TASK_ID> | ✅ | <commit-hash> | <summary>')
    // 身份块(TaskID = 看板限定地址;TaskFile = 文档根绝对路径;TASK_CATEGORY 显式行)
    expect(presynth).toContain('TASK_ID: alpha/1.1\n')
    expect(presynth).toContain(`TASK_FILE: ${join(seed.featuresRoot, 'alpha/tasks/1.1.md')}\n`)
    expect(presynth).toContain('TASK_CATEGORY: coding\n')
    // 要素① 协议正文(coding.feature 渲染产物)
    expect(presynth).toContain('You are a focused task executor implementing a new feature.')
    expect(presynth).toContain('### Step 2: TDD Implementation')
    // 要素② stage_asset 最近资产(绝对路径,PhaseSummary 头部块)
    expect(presynth).toContain('## PhaseSummary')
    expect(presynth).toContain(join(seed.featuresRoot, 'alpha/stages/prd.md'))
    expect(presynth).toContain('read that file for key decisions and conventions from the previous phase.')
    // 要素③ 生效偏好(注册表默认经三级解析,percentage 80)
    expect(presynth).toContain('Coverage strategy: percentage — Target: Achieve 80% test coverage.')
    // complexity 默认 medium → Step 1.5 段在场
    expect(presynth).toContain('### Step 1.5: Spec-Code Conflict Scan')
  })

  it('renders the composed first user message character-for-character (presynth + "\\n\\n" + two appendix lines: attribution + naming)', () => {
    const presynth = 'CONTENT-原文\r\nunicode ✓ µ — trailing   \n'
    const subject = { taskKey: 'alpha/1.1', title: 'demo task' }
    const message = composeFirstUserMessage(presynth, 'session-abc', subject)
    expect(message).toBe(`${presynth}\n\n${attributionLine('session-abc')}\n${namingLine(subject)}`)
    expect(message.startsWith(presynth)).toBe(true) // 原文不改写(前缀逐字节)
    // 恰好两行 + 逐行前缀对拍(Interface 7 口径,任务 2.8)
    const [attribution, naming] = message.slice(presynth.length + 2).split('\n')
    expect(message.slice(presynth.length + 2).split('\n')).toHaveLength(2)
    expect(attribution?.startsWith(ATTRIBUTION_MARKER)).toBe(true) // 第一行 = 归因行
    expect(naming?.startsWith(NAMING_MARKER)).toBe(true) // 第二行 = 命名行
    expect(message.split(ATTRIBUTION_MARKER).length - 1).toBe(1)
    expect(message.split(NAMING_MARKER).length - 1).toBe(1)
    expect(message).toContain('FORGE_ACTOR=session:session-abc') // 值与 dispatch.session_id 同键
    expect(message).toContain('『alpha/1.1 demo task』') // 命名行文案含 taskKey + title
  })

  it('keeps the two-line appendix identical regardless of the type protocol (mode-agnostic single construction point)', () => {
    // 审计结论(任务 2.8):追加行仅在内核 composeFirstUserMessage 一处构造,
    // dispatch-service → launch-port → host 通道对任何会话预设(标准/PTC/极简)
    // 逐字符交付(零改写)—— 一致性 = 结构性保证;此处以两个类型协议的
    // 差异正文反证追加行与协议路由/派发模式无关。
    const subject = { taskKey: 'alpha/1.1', title: 'demo task' }
    const featureMsg = composeFirstUserMessage('FEATURE-CONTENT', 'session-m', subject)
    const docMsg = composeFirstUserMessage('DOC-CONTENT', 'session-m', subject)
    const tailOf = (content: string, message: string): string => message.slice(content.length + 2)
    expect(tailOf('FEATURE-CONTENT', featureMsg)).toBe(tailOf('DOC-CONTENT', docMsg))
    expect(tailOf('DOC-CONTENT', docMsg)).toBe(`${attributionLine('session-m')}\n${namingLine(subject)}`)
  })

  it('reflects the real three-tier prefs chain through the engine (registry default → project → feature)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    writeTaskDoc(seed, 'alpha/tasks/1.1.md')
    const engine = createPresynthEngine({ db: seed.db, resolveFeaturesRoot: () => seed.featuresRoot })
    // 无任何级设置 → 注册表权威默认(80)经三级解析生效
    expect(engine.composePresynth(task)).toContain('Coverage strategy: percentage — Target: Achieve 80% test coverage.')
    seedPref(seed, 'project', 'coverage.coding.feature', { type: 'percentage', percentage: 65 })
    expect(engine.composePresynth(task)).toContain('Achieve 65% test coverage') // project 级生效
    seedPref(seed, 'feature', 'coverage.coding.feature', { type: 'maintain' })
    const content = engine.composePresynth(task)
    expect(content).toContain('Coverage strategy: maintain — Target: Maintain existing coverage, no more than 2% decrease.')
    expect(content).not.toContain('Achieve 65% test coverage') // feature 覆盖 project
  })

  it('lets the task-file coverage frontmatter override prefs (priority 1, spike-4 缺口 2 裁定)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    writeTaskDoc(seed, 'alpha/tasks/1.1.md', { coverage: 77 })
    const read = readTaskFrontmatter(seed.featuresRoot, task)
    expect(read).toEqual({ coverage: 77, complexity: 'medium' })
    const context = makeContext(seed, task, { taskFrontmatter: read })
    expect(composePresynthContent(context)).toContain('Coverage strategy: percentage — Target: Achieve 77% test coverage.')
  })

  it('forces maintain for cleanup/refactor and omits coverage entirely for non-testable types', async () => {
    const seed = await seedProject()
    const cleanup = seedTask(seed, { taskKey: 'alpha/2.1', taskType: 'coding.cleanup', descPath: 'alpha/tasks/2.1.md' })
    const cleanupContent = composePresynthContent(makeContext(seed, cleanup, {
      effectivePrefs: { 'coverage.coding.cleanup': { type: 'percentage', percentage: 90 } }, // 即便偏好给百分比也强制 maintain
    }))
    expect(cleanupContent).toContain('Coverage strategy: maintain')
    expect(cleanupContent).not.toContain('Achieve 90% test coverage')
    const doc = seedTask(seed, { taskKey: 'alpha/3.1', taskType: 'doc', descPath: 'alpha/tasks/3.1.md' })
    const docContent = composePresynthContent(makeContext(seed, doc, { effectivePrefs: { 'coverage.doc': { type: 'percentage', percentage: 50 } } }))
    expect(docContent).not.toContain('Coverage strategy')
  })
})

// ---------------------------------------------------------------------------
// AC-2 prompt_hash 口径 + oracle 接口预留
// ---------------------------------------------------------------------------

describe('AC-2 prompt_hash — spike-3 口径 over the composed first user message', () => {
  it('computes sha256(utf-8) hex lowercase of the combined message (M2 e2e 同式)', () => {
    const message = composeFirstUserMessage('正文', 'session-x', { taskKey: 'alpha/1.1', title: 'demo task' })
    expect(promptHashOf(message)).toBe(sha256(message))
    expect(promptHashOf(message)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('lands prompt_hash = sha256(injection) on the dispatch row with the pre-minted session id (engine → dispatch-service 全链)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    writeTaskDoc(seed, 'alpha/tasks/1.1.md')
    seedStageAssets(seed, ['prd'])
    const engine = createPresynthEngine({ db: seed.db, resolveFeaturesRoot: () => seed.featuresRoot })
    const launchInputs: DispatchLaunchInput[] = []
    const port: DispatchLaunchPort = {
      launch(input) {
        launchInputs.push(input)
        return { ok: true, sessionId: input.sessionId ?? 's-fallback' }
      },
    }
    const service: DispatchVerbService = createDispatchVerbService({
      db: seed.db,
      checkArtifacts: (): StageArtifactsReport => ({ stage: 'tasks', satisfied: true, missing: [] }),
      composePrompt: injected => engine.compose(injected),
      launchPort: port,
    })
    const result = await service.dispatchTasks({ projectId: seed.projectId, taskKeys: ['alpha/1.1'] }, 'session:board-1')
    const row = (result as { dispatched: Array<{ promptHash: string; sessionId: string | null; state: string }> }).dispatched[0]
    const input = launchInputs[0]
    if (row === undefined || input === undefined) throw new Error('expected one dispatch row and one launch input')

    // 预铸 sessionId 随行落库 + 透传 launch(同键);hash = sha256(组合消息)
    expect(row.sessionId).not.toBeNull()
    expect(input.sessionId).toBe(row.sessionId)
    expect(row.sessionId).toMatch(/^session-[0-9a-f-]{36}$/)
    expect(row.promptHash).toBe(sha256(input.prompt))
    expect(input.promptHash).toBe(row.promptHash)
    expect(row.state).toBe('running') // host 回报同 session → starting→running

    // 注入形态:前导段开头 + 尾部两行追加(归因行值 = 预铸 session;命名行
    // 文案 = taskKey + title)
    const appendix = `${attributionLine(row.sessionId as string)}\n${namingLine(task)}`
    expect(input.prompt.startsWith(EXECUTOR_PREAMBLE)).toBe(true)
    expect(input.prompt.endsWith(appendix)).toBe(true)
    expect(input.prompt.split(ATTRIBUTION_MARKER).length - 1).toBe(1)
    expect(input.prompt.split(NAMING_MARKER).length - 1).toBe(1)
    expect(input.prompt).toContain(`『${task.taskKey} ${task.title}』命名`)

    // oracle 四件套的内核侧三查(journal text 以通道投递串本身体现)
    const presynth = input.prompt.slice(0, input.prompt.length - appendix.length - 2)
    expect(checkInjectionOracle({ journalText: input.prompt, presynthContent: presynth, promptHash: row.promptHash })).toEqual({ ok: true })
  })

  it('exposes the M2-journal-shaped oracle: hash equality / byte prefix / exactly two appendix lines with per-line prefixes', () => {
    const presynth = '原文\r\nunicode ✓\n'
    const subject = { taskKey: 'alpha/1.1', title: 'demo task' }
    const message = composeFirstUserMessage(presynth, 'session-1', subject)
    const hash = promptHashOf(message)
    expect(checkInjectionOracle({ journalText: message, presynthContent: presynth, promptHash: hash })).toEqual({ ok: true })
    // ① 尾部篡改 → hash 失配(前缀仍逐字节)
    expect(checkInjectionOracle({ journalText: `${message}X`, presynthContent: presynth, promptHash: hash }))
      .toEqual({ ok: false, failures: ['hash-mismatch'] })
    // ② 前缀改写 → prefix-rewritten(hash 同时失配)
    expect(checkInjectionOracle({ journalText: `rewritten${message}`, presynthContent: presynth, promptHash: hash }).failures)
      .toContain('prefix-rewritten')
    // ③ 归因行翻倍 → appendix-not-two-lines(两行形态破坏:第三行不再以命名前缀开头)
    const doubled = `${message}\n${attributionLine('session-1')}`
    expect(checkInjectionOracle({ journalText: doubled, presynthContent: presynth, promptHash: promptHashOf(doubled) }).failures)
      .toEqual(['appendix-not-two-lines'])
    // ③' 命名行缺失(仅剩归因行)→ appendix-not-two-lines(恰好一行 ≠ 恰好两行)
    const noNaming = `${presynth}\n\n${attributionLine('session-1')}`
    expect(checkInjectionOracle({ journalText: noNaming, presynthContent: presynth, promptHash: promptHashOf(noNaming) }).failures)
      .toEqual(['appendix-not-two-lines'])
  })

  it('mints caller-minted session ids in the M2 shape (create({sessionId}) 幂等 adopt 面)', () => {
    expect(mintDispatchSessionId()).toMatch(/^session-[0-9a-f-]{36}$/)
    expect(mintDispatchSessionId()).not.toBe(mintDispatchSessionId())
  })
})

// ---------------------------------------------------------------------------
// AC-3 模板映射矩阵(spike-4 清单全覆盖,逐类型)
// ---------------------------------------------------------------------------

describe('AC-3 routing matrix — every dispatchable type renders its own protocol', () => {
  for (const [type, category, fragment] of DISPATCHABLE_TYPES) {
    it(`routes ${type} → own protocol (${fragment})`, async () => {
      const seed = await seedProject()
      const task = seedTask(seed, { taskKey: 'alpha/9.9', taskType: type, descPath: 'alpha/tasks/9.9.md' })
      writeTaskDoc(seed, 'alpha/tasks/9.9.md')
      const content = composePresynthContent(makeContext(seed, task))
      expect(content).toContain(fragment)
      expect(content).toContain('TASK_ID: alpha/9.9\n')
      expect(content).toContain(`TASK_CATEGORY: ${category}\n`)
      expect(categoryForType(type)).toBe(category)
    })
  }

  it('routes the fix-record-missed recovery leg (旗标覆盖类型路由)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    const content = composePresynthContent(makeContext(seed, task), { fixRecordMissed: true })
    expect(content).toContain('recovering a missing task record')
    expect(content).toContain('VERIFY-ONLY')
  })

  it('carries zero forge-CLI residue in any dispatched injection (取代 forge prompt;缺口 4 改写完备)', async () => {
    const seed = await seedProject()
    let seq = 0
    for (const [type] of DISPATCHABLE_TYPES) {
      seq += 1
      const task = seedTask(seed, { taskKey: `alpha/x${String(seq)}`, taskType: type, descPath: `alpha/tasks/x${String(seq)}.md` })
      const content = composePresynthContent(makeContext(seed, task))
      expect(content, `${type} carries no 'forge prompt' self-run path`).not.toContain('forge prompt')
      expect(content, `${type} carries no bare forge CLI task verbs`).not.toMatch(/\bforge task\b/)
      expect(content, `${type} carries no forge surfaces step`).not.toContain('forge surfaces')
      expect(content, `${type} addresses skills by flat name`).not.toContain('Skill(skill="forge:')
    }
    expect(EXECUTOR_PREAMBLE).not.toContain('forge prompt')
    expect(EXECUTOR_PREAMBLE).toContain('forge_task_get') // task status 查询改写为 dsh tool 只读动词
  })

  it('is deterministic for identical inputs (template constants; no eval, no model calls)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    const context = makeContext(seed, task)
    expect(composePresynthContent(context)).toBe(composePresynthContent(context)) // 字节全等
  })
})

// ---------------------------------------------------------------------------
// AC-4 动态性(Story 3 AC3)+ 无 stage_asset 显式行为
// ---------------------------------------------------------------------------

describe('AC-4 dynamism — recomposition reflects the latest stage assets and prefs', () => {
  it('picks up a newer stage asset on the next composition (载体翻转:stages/<stage>.md)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    const before = composePresynthContent(makeContext(seed, task, { stageAssets: seedStageAssets(seed, ['prd']), featureStatus: 'tasks' }))
    expect(before).toContain(join(seed.featuresRoot, 'alpha/stages/prd.md'))
    const after = composePresynthContent(makeContext(seed, task, { stageAssets: seedStageAssets(seed, ['prd', 'design']), featureStatus: 'tasks' }))
    expect(after).toContain(join(seed.featuresRoot, 'alpha/stages/design.md')) // 最近阶段资产
    expect(after).not.toContain(`## PhaseSummary\n${join(seed.featuresRoot, 'alpha/stages/prd.md')}`)
  })

  it('picks up pref changes on the next composition (feature 级覆盖生效)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    const before = composePresynthContent(makeContext(seed, task, { effectivePrefs: { 'coverage.coding.feature': { type: 'percentage', percentage: 80 } } }))
    expect(before).toContain('Achieve 80% test coverage')
    const after = composePresynthContent(makeContext(seed, task, { effectivePrefs: { 'coverage.coding.feature': { type: 'percentage', percentage: 99 } } }))
    expect(after).toContain('Achieve 99% test coverage')
  })

  it('omits the PhaseSummary block entirely when no stage asset exists (显式定义行为)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    const content = composePresynthContent(makeContext(seed, task, { stageAssets: [] }))
    expect(content).not.toContain('## PhaseSummary')
    expect(content).not.toContain('read that file for key decisions')
    expect(content).toContain('You are a focused task executor implementing a new feature.') // 协议本体完整
  })

  it('excludes the feature current-stage asset from the previous-stage candidates', async () => {
    const seed = await seedProject()
    const task = seedTask(seed)
    upsertFeatureSnapshot(seed.db, { projectId: seed.projectId, featureSlug: 'alpha', status: 'in-progress', docKinds: [], updatedAt: FIXED_AT })
    const content = composePresynthContent(makeContext(seed, task, {
      stageAssets: seedStageAssets(seed, ['prd', 'design', 'in-progress']),
      featureStatus: 'in-progress',
    }))
    expect(content).toContain(join(seed.featuresRoot, 'alpha/stages/design.md')) // 最近一个「非当前」阶段
    expect(content).not.toContain(join(seed.featuresRoot, 'alpha/stages/in-progress.md'))
  })

  it('degrades gracefully when the task doc is unreadable (medium complexity, no frontmatter override)', async () => {
    const seed = await seedProject()
    const task = seedTask(seed, { descPath: 'alpha/tasks/missing.md' })
    expect(readTaskFrontmatter(seed.featuresRoot, task)).toEqual({ coverage: null, complexity: '' })
    const data = buildPromptTemplateData(makeContext(seed, task, { taskFrontmatter: { coverage: null, complexity: '' } }))
    expect(data.Complexity).toBe('medium')
    expect(data.TaskFile).toBe(join(seed.featuresRoot, 'alpha/tasks/missing.md')) // desc_path 寻址仍定型
  })
})

// ---------------------------------------------------------------------------
// 渲染器与映射面单元(Go text/template 子集;missingkey=error 纪律)
// ---------------------------------------------------------------------------

describe('renderer + mapping units', () => {
  const zero = { TaskID: '', TaskFile: '', TaskCategory: '', FeatureSlug: '', PhaseSummary: '', CoverageStrategy: '', CoverageTarget: '', TestTypeArg: '', SurfaceKey: '', SurfaceType: '', Complexity: '' }

  it('substitutes fields, honors truthy/ne/eq conditions and else branches (Go newline 语义)', () => {
    expect(renderPromptTemplate('A: {{.TaskID}}', { ...zero, TaskID: 'x' })).toBe('A: x')
    // 行内 if(SURFACE_KEY 行/just 前缀形态)
    expect(renderPromptTemplate('just {{if .SurfaceKey}}{{.SurfaceKey}}-{{end}}compile', zero)).toBe('just compile')
    expect(renderPromptTemplate('just {{if .SurfaceKey}}{{.SurfaceKey}}-{{end}}compile', { ...zero, SurfaceKey: 'web' })).toBe('just web-compile')
    // ne 条件(complexity 门控形态)
    expect(renderPromptTemplate('{{if ne .Complexity "low"}}SCAN{{end}}', { ...zero, Complexity: 'low' })).toBe('')
    expect(renderPromptTemplate('{{if ne .Complexity "low"}}SCAN{{end}}', { ...zero, Complexity: 'high' })).toBe('SCAN')
    // eq + else
    expect(renderPromptTemplate('{{if eq .Complexity "low"}}L{{else}}M{{end}}', { ...zero, Complexity: 'low' })).toBe('L')
    expect(renderPromptTemplate('{{if eq .Complexity "low"}}L{{else}}M{{end}}', { ...zero, Complexity: 'medium' })).toBe('M')
    // 块级 if 的换行语义:false 块整体消失(含内部换行),end 后换行保留
    expect(renderPromptTemplate('H\n{{if .PhaseSummary}}\nS\n{{.PhaseSummary}}\n{{end}}\nT', zero)).toBe('H\n\nT')
    expect(renderPromptTemplate('H\n{{if .PhaseSummary}}\nS\n{{.PhaseSummary}}\n{{end}}\nT', { ...zero, PhaseSummary: 'P' })).toBe('H\n\nS\nP\n\nT')
  })

  it('enforces missingkey=error: unknown fields, malformed actions and unclosed blocks throw', () => {
    expect(() => renderPromptTemplate('{{.Wrong}}', zero)).toThrow(/unknown template field/)
    expect(() => renderPromptTemplate('{{if .TaskID}}{{.Wrong}}{{end}}', { ...zero, TaskID: 'x' })).toThrow(/unknown template field/)
    expect(() => renderPromptTemplate('{{ bogus }}', zero)).toThrow(/unsupported action/)
    expect(() => renderPromptTemplate('{{if .TaskID}}open', zero)).toThrow(/unclosed/)
    expect(() => renderPromptTemplate('{{end}}', zero)).toThrow(/outside an if block/)
  })

  it('collapses 3+ consecutive newlines to exactly 2 (collapseBlankLines 移植)', () => {
    expect(collapseBlankLines('a\n\n\n\n\nb')).toBe('a\n\nb')
    expect(collapseBlankLines('a\n\nb')).toBe('a\n\nb')
  })

  it('maps categories and testable types per the Go registry (prefix semantics preserved)', () => {
    expect(categoryForType('coding.feature')).toBe('coding')
    expect(categoryForType('code-quality.simplify')).toBe('coding')
    expect(categoryForType('doc')).toBe('doc')
    expect(categoryForType('doc.fix')).toBe('doc')
    expect(categoryForType('test.run')).toBe('test')
    expect(categoryForType('validation.code')).toBe('validation')
    expect(categoryForType('eval.journey')).toBe('eval')
    expect(categoryForType('gate')).toBe('gate')
    expect(categoryForType('totally-unknown')).toBe('coding') // Go 默认
    expect(isTestableType('coding.feature')).toBe(true)
    expect(isTestableType('code-quality.simplify')).toBe(true)
    expect(isTestableType('doc')).toBe(false)
    expect(isTestableType('test.run')).toBe(false)
  })

  it('resolves coverage per the Go priority chain (forced maintain > frontmatter > prefs > none)', () => {
    expect(resolveCoverageForType('coding.refactor', 90, {})).toEqual({ strategy: 'maintain', target: 'Maintain existing coverage, no more than 2% decrease' })
    expect(resolveCoverageForType('coding.feature', 77, {})).toEqual({ strategy: 'percentage', target: 'Achieve 77% test coverage' })
    expect(resolveCoverageForType('coding.feature', null, { 'coverage.coding.feature': { type: 'percentage', percentage: 60 } }))
      .toEqual({ strategy: 'percentage', target: 'Achieve 60% test coverage' })
    expect(resolveCoverageForType('coding.feature', null, { 'coverage.coding.feature': { type: 'maintain' } }))
      .toEqual({ strategy: 'maintain', target: 'Maintain existing coverage, no more than 2% decrease' })
    expect(resolveCoverageForType('code-quality.simplify', null, {})).toEqual({ strategy: '', target: '' }) // 键集封闭外 → 无指令
  })

  it('resolves TaskFile via desc_path with the canonical doc-tree fallback, and stage summary ordering', async () => {
    const seed = await seedProject()
    const withPath = seedTask(seed, { descPath: 'alpha/tasks/1.1.md' })
    expect(taskFileOf(seed.featuresRoot, withPath)).toBe(join(seed.featuresRoot, 'alpha/tasks/1.1.md'))
    const bare = seedTask(seed, { taskKey: 'alpha/4.2', descPath: null })
    expect(taskFileOf(seed.featuresRoot, bare)).toBe(join(seed.featuresRoot, 'alpha/tasks/4.2.md'))
    expect(resolveStageSummaryPath(seed.featuresRoot, [], null)).toBe('')
    expect(resolveStageSummaryPath(seed.featuresRoot, seedStageAssets(seed, ['prd']), null))
      .toBe(join(seed.featuresRoot, 'alpha/stages/prd.md'))
  })
})
