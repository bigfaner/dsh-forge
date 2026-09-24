// Task 4.1 kernel legs — the stages write side (forge.stage.summarize kernel
// write face + advanceStage gate internalization + stage_advanced). AC groups:
//
//   AC-1 summarize 写路径 — the write verb lands
//            `features/<slug>/stages/<stage>.md` with the canonical frontmatter
//            { stage, generated, goal } + summary body (kernel-minted timestamp);
//            same-stage rewrite = overwrite (single canonical file, T4); the
//            stage_asset index syncs perception-equivalently (the write path
//            shares the scan implementation — zero drift); input violations →
//            ERR_STAGE_ASSET_INVALID.
//   AC-2 推进门矩阵 — summary missing → ERR_STAGE_GATE_UNSATISFIED with the
//            missing-asset guidance (manifest untouched, zero events);
//            generated → manifest status flips kernel-side (other frontmatter
//            fields + body preserved), feature_snapshot syncs, stage_advanced
//            fires exactly once; in-progress → completed = feature complete
//            internalized (归宿表 feature set/complete).
//   AC-3 推进后链路 — after summarize(current) + advance, the presynth engine
//            composes the NEXT stage's session injection with the latest
//            stage_asset (PhaseSummary block carries the asset path whose file
//            holds goal + summary; current-stage assets stay excluded).
//   AC-4 门校验幂等 — terminal 'completed' re-advance = idempotent no-op
//            (zero writes, zero events); a repeat right after a successful
//            advance = gate rejection for the NEW current stage (defined,
//            observable guidance).
//   IPC 面 — 两动词通道路由 + 参数形状校验 + 域错误封装原码透传。
//
// Everything runs against the real migrated db (node:sqlite) + tmp doc trees —
// no spawn, no CLI, no network.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import type { RepoDb } from '../src/main/workbench/repos/types.ts'
import { upsertFeatureSnapshot } from '../src/main/workbench/repos/feature-snapshots.ts'
import { insertTask } from '../src/main/workbench/tasks/task-repo.ts'
import type { AuthoritativeTask } from '../src/main/workbench/tasks/task-repo.ts'
import { scanForgeFiles, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import { parseStageAssetMarkdown, listStageAssetRows } from '../src/main/workbench/stages/stage-asset-index.ts'
import { parseFrontmatterObject, splitFrontmatter } from '../src/main/workbench/knowledge/frontmatter.ts'
import { createStageWriteService, StageWriteError, type StageWriteService } from '../src/main/workbench/stages/advance-service.ts'
import { createPresynthEngine } from '../src/main/workbench/dispatch/presynth/assemble.ts'
import type { WorkbenchEvent } from '../src/main/workbench/indexer/diff.ts'
import { WORKBENCH_VERB_CHANNELS } from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  installWorkbenchVerbs,
  toWorkbenchIpcError,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import type { WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'

const FIXED_AT = '2026-09-20T10:00:00.000Z'
const SLUG = 'alpha'

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-stage-adv-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

function writeDoc(featureDir: string, rel: string, content: string): void {
  const path = join(featureDir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function manifestOf(status: string, slug = SLUG): string {
  return `---\nfeature: "${slug}"\nstatus: ${status}\ncreated: "2026-09-18"\n---\n\n# ${slug}\n\nBody stays.\n`
}

/** 写侧测试树:external 文档根 + 真库 + 事件捕获 + 三服务(写/预合成/扫描)。 */
interface Tree {
  readonly db: DatabaseSyncLike
  readonly projectId: string
  readonly root: string
  readonly featuresRoot: string
  readonly featureDir: string
  readonly service: StageWriteService
  readonly events: WorkbenchEvent[]
  readonly scan: () => void
  dispose(): void
}

interface SeedOptions {
  readonly manifestStatus?: string | null
  readonly manifestContent?: string
  readonly featureSnapshotStatus?: string | null
  /** sqlite 权威任务(AC-3 预合成链语料;缺省 1.1 coding.feature)。 */
  readonly withTask?: boolean
}

async function seedTree(options: SeedOptions = {}): Promise<Tree> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  const projectId = 'p-1'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)

  const featuresRoot = join(root, 'docs', 'features')
  const featureDir = join(featuresRoot, SLUG)
  mkdirSync(featureDir, { recursive: true })
  if (options.manifestContent !== undefined) {
    writeDoc(featureDir, 'manifest.md', options.manifestContent)
  } else if (options.manifestStatus !== null && options.manifestStatus !== undefined) {
    writeDoc(featureDir, 'manifest.md', manifestOf(options.manifestStatus))
  }
  if (options.featureSnapshotStatus !== null && options.featureSnapshotStatus !== undefined) {
    upsertFeatureSnapshot(db as RepoDb, {
      projectId,
      featureSlug: SLUG,
      status: options.featureSnapshotStatus as never,
      docKinds: [],
      updatedAt: FIXED_AT,
    })
  }
  if (options.withTask === true) {
    writeDoc(featureDir, join('tasks', '1.1.md'), [
      '---',
      'id: "1.1"',
      'title: "demo task"',
      'complexity: "medium"',
      '---',
      '',
      '# demo task',
      '',
      'demo body',
      '',
    ].join('\n'))
    // index.json 在场:感知扫描才能收编 feature(manifestOk + tasks 可知 →
    // feature_snapshot.status 落库;预合成链的 featureStatus 消费面)。
    writeDoc(featureDir, join('tasks', 'index.json'), JSON.stringify({
      tasks: { '1.1': { id: '1.1', title: 'demo task', status: 'pending', dependencies: [], file: '1.1.md' } },
    }, null, 2))
    insertTask(db as RepoDb, {
      projectId,
      taskKey: `${SLUG}/1.1`,
      featureSlug: SLUG,
      title: 'demo task',
      status: 'pending',
      blockers: [],
      taskType: 'coding.feature',
      descPath: `${SLUG}/tasks/1.1.md`,
      updatedBy: 'kernel',
      updatedAt: FIXED_AT,
    })
  }

  const events: WorkbenchEvent[] = []
  const resolveFeaturesRoot = (id: string): string | null => (id === projectId ? featuresRoot : null)
  const service = createStageWriteService({
    db: db as RepoDb,
    resolveFeaturesRoot,
    onEvent: event => events.push(event),
  })
  const target: ScanTarget = { id: projectId, codeRoot: join(root, 'code'), docLocationPath: root }
  return {
    db,
    projectId,
    root,
    featuresRoot,
    featureDir,
    service,
    events,
    scan: () => { scanForgeFiles(db as RepoDb, target) },
    dispose(): void {
      db.close()
    },
  }
}

function summarize(tree: Tree, stage: string, goal = `Goal of ${stage}`, summary = `Summary of ${stage}.`): unknown {
  return tree.service.stageSummarize({ projectId: tree.projectId, featureSlug: SLUG, stage: stage as never, goal, summary })
}

// ---------------------------------------------------------------------------
// AC-1: forge.stage.summarize write path (file + frontmatter + index sync)
// ---------------------------------------------------------------------------

describe('stageSummarize — the stage-asset write face', () => {
  it('writes stages/<stage>.md with canonical frontmatter { stage, generated, goal } + summary body (kernel-minted timestamp)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      const result = tree.service.stageSummarize({
        projectId: tree.projectId,
        featureSlug: SLUG,
        stage: 'design',
        goal: 'Design the stage gate write side',
        summary: 'Decided the gate matrix and idempotency semantics.',
      }) as { stage: string; path: string; generatedAt: string; featureStage: string; gateOpen: boolean }

      expect(result.stage).toBe('design')
      expect(result.path).toBe('alpha/stages/design.md')
      expect(result.featureStage).toBe('design')
      expect(result.gateOpen).toBe(true)
      expect(() => new Date(result.generatedAt).toISOString()).not.toThrow()

      const markdown = readFileSync(join(tree.featureDir, 'stages', 'design.md'), 'utf8')
      const { body } = splitFrontmatter(markdown)
      const fields = parseFrontmatterObject(markdown)
      expect(fields?.stage).toBe('design')
      expect(fields?.generated).toBe(result.generatedAt)
      expect(fields?.goal).toBe('Design the stage gate write side')
      expect(body).toContain('Decided the gate matrix and idempotency semantics.')
      // 感知方言零损:同一解析器(indexer)读回同形。
      expect(parseStageAssetMarkdown(markdown)).toEqual({
        stage: 'design',
        generatedAt: result.generatedAt,
        goal: 'Design the stage gate write side',
      })
    } finally {
      tree.dispose()
    }
  })

  it('same-stage rewrite = overwrite (single canonical file, content + timestamp replaced; T4)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      summarize(tree, 'design', 'first goal', 'first summary')
      const second = summarize(tree, 'design', 'revised goal', 'revised summary') as { generatedAt: string }
      const markdown = readFileSync(join(tree.featureDir, 'stages', 'design.md'), 'utf8')
      expect(markdown).toContain('revised goal')
      expect(markdown).toContain('revised summary')
      expect(markdown).not.toContain('first goal')
      expect(parseFrontmatterObject(markdown)?.generated).toBe(second.generatedAt)
      // 索引行集 = 单行(同 stage 不重复)。
      expect(listStageAssetRows(tree.db as RepoDb, tree.projectId, SLUG)).toEqual([
        { stage: 'design', path: 'alpha/stages/design.md', generatedAt: second.generatedAt },
      ])
    } finally {
      tree.dispose()
    }
  })

  it('syncs the stage_asset index perception-equivalently (write path shares the scan implementation, zero drift)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      summarize(tree, 'prd', 'Goal of prd', 'Summary of prd.')
      summarize(tree, 'design', 'Goal of design', 'Summary of design.')
      const afterWrite = listStageAssetRows(tree.db as RepoDb, tree.projectId, SLUG)
      expect(afterWrite.map(row => row.stage)).toEqual(['prd', 'design'])
      // 感知重扫后行集不变(同实现零漂移;generated 为内核铸造值,扫描保留原词)。
      tree.scan()
      expect(listStageAssetRows(tree.db as RepoDb, tree.projectId, SLUG)).toEqual(afterWrite)
    } finally {
      tree.dispose()
    }
  })

  it('gateOpen mirrors the live current-stage verdict (asset for a non-current stage does not open the gate)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      const result = summarize(tree, 'prd', 'Goal of prd', 'Summary of prd.') as { gateOpen: boolean; featureStage: string }
      expect(result.featureStage).toBe('design')
      expect(result.gateOpen).toBe(false) // design.md 尚未生成(当前阶段门未开)
    } finally {
      tree.dispose()
    }
  })

  it('rejects out-of-vocabulary stage / empty goal / empty summary with ERR_STAGE_ASSET_INVALID (no file written)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      const cases: Array<Record<string, unknown>> = [
        { projectId: tree.projectId, featureSlug: SLUG, stage: 'shipped', goal: 'g', summary: 's' },
        { projectId: tree.projectId, featureSlug: SLUG, stage: 'design', goal: '  ', summary: 's' },
        { projectId: tree.projectId, featureSlug: SLUG, stage: 'design', goal: 'g', summary: '' },
      ]
      for (const input of cases) {
        expect(() => tree.service.stageSummarize(input as never)).toThrowError(
          expect.objectContaining({ code: 'ERR_STAGE_ASSET_INVALID' }) as Error,
        )
      }
      expect(listStageAssetRows(tree.db as RepoDb, tree.projectId, SLUG)).toEqual([])
    } finally {
      tree.dispose()
    }
  })

  it('rejects unknown project (ERR_PROJECT_NOT_FOUND) and unknown feature (ERR_FEATURE_NOT_FOUND)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      expect(() => tree.service.stageSummarize({ projectId: 'p-x', featureSlug: SLUG, stage: 'design', goal: 'g', summary: 's' }))
        .toThrowError(expect.objectContaining({ code: 'ERR_PROJECT_NOT_FOUND' }) as Error)
      expect(() => tree.service.stageSummarize({ projectId: tree.projectId, featureSlug: 'ghost', stage: 'design', goal: 'g', summary: 's' }))
        .toThrowError(StageWriteError)
      expect(() => tree.service.advanceStage(tree.projectId, 'ghost')).toThrowError(
        expect.objectContaining({ code: 'ERR_FEATURE_NOT_FOUND' }) as Error,
      )
    } finally {
      tree.dispose()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-2: advanceStage gate matrix (reject + guidance / advance + event)
// ---------------------------------------------------------------------------

describe('advanceStage — the advance gate', () => {
  it('rejects with ERR_STAGE_GATE_UNSATISFIED + missing-asset guidance when the current stage summary is not generated', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      summarize(tree, 'prd', 'Goal of prd', 'Summary of prd.') // 上一阶段资产在,当前 design 缺
      const before = readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8')
      let caught: unknown
      try {
        tree.service.advanceStage(tree.projectId, SLUG)
      } catch (error) {
        caught = error
      }
      const rejected = caught as StageWriteError
      expect(rejected).toBeInstanceOf(StageWriteError)
      expect(rejected.code).toBe('ERR_STAGE_GATE_UNSATISFIED')
      expect(rejected.message).toContain('design')
      expect(rejected.detail).toContain('features/alpha/stages/design.md')
      expect(rejected.detail).toContain('forge_stage_summarize')
      // 拒绝 = 零副作用:manifest 原文未动、零事件。
      expect(readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8')).toBe(before)
      expect(tree.events).toEqual([])
    } finally {
      tree.dispose()
    }
  })

  it('advances on a satisfied gate: manifest status flips kernel-side (other fields + body preserved), snapshot syncs, stage_advanced fires once', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      summarize(tree, 'design', 'Goal of design', 'Summary of design.')
      const summary = tree.service.advanceStage(tree.projectId, SLUG)
      expect(summary.slug).toBe(SLUG)
      expect(summary.status).toBe('tasks')

      // manifest:status 翻转 + 其余字段/正文原文保留(阶段推进内化)。
      const manifest = readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8')
      const fields = parseFrontmatterObject(manifest)
      expect(fields?.status).toBe('tasks')
      expect(fields?.feature).toBe(SLUG)
      expect(fields?.created).toBe('2026-09-18')
      expect(manifest).toContain('Body stays.')

      // feature_snapshot 派生缓存即时同步。
      const row = tree.db.prepare('SELECT status FROM feature_snapshot WHERE project_id = ? AND feature_slug = ?').get(tree.projectId, SLUG) as { status: string }
      expect(row.status).toBe('tasks')

      // 事件:恰一条 stage_advanced(载荷 = projectId + featureSlug)。
      expect(tree.events).toEqual([{ type: 'stage_advanced', projectId: tree.projectId, featureSlug: SLUG }])
    } finally {
      tree.dispose()
    }
  })

  it('in-progress → completed carries the feature-complete semantics (归宿表 feature set/complete 内化腿)', async () => {
    const tree = await seedTree({ manifestStatus: 'in-progress' })
    try {
      summarize(tree, 'in-progress', 'Goal of in-progress', 'Summary of in-progress.')
      const summary = tree.service.advanceStage(tree.projectId, SLUG)
      expect(summary.status).toBe('completed')
      expect(parseFrontmatterObject(readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8'))?.status).toBe('completed')
      expect(tree.events).toEqual([{ type: 'stage_advanced', projectId: tree.projectId, featureSlug: SLUG }])
    } finally {
      tree.dispose()
    }
  })

  it('manifest write variants: absent → created; no frontmatter block → prepended; corrupt YAML → ERR_STAGE_MANIFEST_UNREADABLE', async () => {
    // ① 缺席:快照降级解析阶段 → 内核创建最小 manifest。
    const absent = await seedTree({ manifestStatus: null, featureSnapshotStatus: 'design' })
    try {
      summarize(absent, 'design', 'Goal of design', 'Summary of design.')
      expect(absent.service.advanceStage(absent.projectId, SLUG).status).toBe('tasks')
      const created = readFileSync(join(absent.featureDir, 'manifest.md'), 'utf8')
      expect(parseFrontmatterObject(created)?.status).toBe('tasks')
      expect(splitFrontmatter(created).body.trim()).toBe('')
    } finally {
      absent.dispose()
    }

    // ② 无 frontmatter 块:原文整体保留为正文,前插 status frontmatter。
    const bare = await seedTree({ manifestContent: '# Just a heading\n\nNo frontmatter here.\n' })
    try {
      summarize(bare, 'prd', 'Goal of prd', 'Summary of prd.') // 无快照 → 管线头 prd
      expect(bare.service.advanceStage(bare.projectId, SLUG).status).toBe('design')
      const manifest = readFileSync(join(bare.featureDir, 'manifest.md'), 'utf8')
      expect(parseFrontmatterObject(manifest)?.status).toBe('design')
      expect(manifest).toContain('# Just a heading')
      expect(manifest).toContain('No frontmatter here.')
    } finally {
      bare.dispose()
    }

    // ③ frontmatter YAML 损坏:不可安全合并 → 拒绝(零数据损失),manifest 原文未动。
    const corrupt = await seedTree({
      manifestContent: '---\nstatus: [unclosed\ncreated: "2026-09-18"\n---\n\nBody.\n',
    })
    try {
      summarize(corrupt, 'prd', 'Goal of prd', 'Summary of prd.')
      const before = readFileSync(join(corrupt.featureDir, 'manifest.md'), 'utf8')
      expect(() => corrupt.service.advanceStage(corrupt.projectId, SLUG)).toThrowError(
        expect.objectContaining({ code: 'ERR_STAGE_MANIFEST_UNREADABLE' }) as Error,
      )
      expect(readFileSync(join(corrupt.featureDir, 'manifest.md'), 'utf8')).toBe(before)
      expect(corrupt.events).toEqual([])
    } finally {
      corrupt.dispose()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-4: gate idempotency (terminal no-op / repeat-after-success rejection)
// ---------------------------------------------------------------------------

describe('advanceStage — idempotency', () => {
  it('a repeated advance at the terminal stage completed is an idempotent no-op (zero writes, zero events)', async () => {
    const tree = await seedTree({ manifestStatus: 'completed' })
    try {
      const before = readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8')
      const summary = tree.service.advanceStage(tree.projectId, SLUG)
      expect(summary.status).toBe('completed')
      expect(summary.slug).toBe(SLUG)
      expect(readFileSync(join(tree.featureDir, 'manifest.md'), 'utf8')).toBe(before)
      expect(tree.events).toEqual([])
    } finally {
      tree.dispose()
    }
  })

  it('a repeat right after a successful advance = gate rejection for the NEW current stage (defined, observable)', async () => {
    const tree = await seedTree({ manifestStatus: 'design' })
    try {
      summarize(tree, 'design', 'Goal of design', 'Summary of design.')
      expect(tree.service.advanceStage(tree.projectId, SLUG).status).toBe('tasks')
      // 重复推进:新当前阶段 tasks 的总结未生成 → 门拒绝 + 引导(非静默)。
      let caught: unknown
      try {
        tree.service.advanceStage(tree.projectId, SLUG)
      } catch (error) {
        caught = error
      }
      const repeat = caught as StageWriteError
      expect(repeat).toBeInstanceOf(StageWriteError)
      expect(repeat.code).toBe('ERR_STAGE_GATE_UNSATISFIED')
      expect(repeat.message).toContain('tasks')
      expect(repeat.detail).toContain('features/alpha/stages/tasks.md')
      // 事件仍只一条(第二次请求零副作用)。
      expect(tree.events).toEqual([{ type: 'stage_advanced', projectId: tree.projectId, featureSlug: SLUG }])
    } finally {
      tree.dispose()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-3: the post-advance chain (presynth consumes the latest stage_asset)
// ---------------------------------------------------------------------------

describe('post-advance chain — new-stage presynth injection', () => {
  it('after summarize(current) + advance, the presynth injection carries the latest stage_asset (goal + summary file)', async () => {
    const tree = await seedTree({ manifestStatus: 'design', withTask: true })
    try {
      const engine = createPresynthEngine({
        db: tree.db as RepoDb,
        resolveFeaturesRoot: () => tree.featuresRoot,
      })
      const task: AuthoritativeTask = {
        projectId: tree.projectId,
        taskKey: `${SLUG}/1.1`,
        featureSlug: SLUG,
        title: 'demo task',
        status: 'pending',
        blockers: [],
        branch: null,
        worktree: false,
        taskType: 'coding.feature',
        descPath: `${SLUG}/tasks/1.1.md`,
        updatedBy: 'kernel',
        updatedAt: FIXED_AT,
      }

      // 推进前(感知先就位:feature_snapshot 由扫描从 manifest 收编):
      // 当前阶段 design 自身的资产不是「上一阶段」语料 → 块整体省略。
      tree.scan()
      summarize(tree, 'design', 'Goal of design', 'Summary of design.')
      const before = engine.composePresynth(task)
      expect(before).not.toContain('## PhaseSummary')

      // 推进后:新阶段 tasks 的会话注入携带 design 资产(最新 stage_asset)。
      tree.service.advanceStage(tree.projectId, SLUG)
      const after = engine.composePresynth(task)
      expect(after).toContain('## PhaseSummary')
      expect(after).toContain(join(tree.featuresRoot, 'alpha', 'stages', 'design.md'))
      expect(after).toContain('read that file for key decisions and conventions from the previous phase.')

      // 注入锚点文件承载目标 + 摘要(frontmatter goal + 摘要正文)。
      const asset = readFileSync(join(tree.featuresRoot, 'alpha', 'stages', 'design.md'), 'utf8')
      expect(parseFrontmatterObject(asset)?.goal).toBe('Goal of design')
      expect(asset).toContain('Summary of design.')
    } finally {
      tree.dispose()
    }
  })
})

// ---------------------------------------------------------------------------
// IPC face: verb wiring through the services assembly + handler registration
// ---------------------------------------------------------------------------

describe('stages write verbs on the IPC/service face', () => {
  const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

  async function withServicesTree(): Promise<{
    verbs: WorkbenchVerbServices
    events: WorkbenchEvent[]
    featureDir: string
    dispose: () => void
  }> {
    const root = makeScratch()
    const userData = join(root, 'user')
    mkdirSync(userData, { recursive: true })
    const { db } = await openDatabase(userData)
    const projectId = 'p-1'
    db.prepare(
      `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
       VALUES (?, ?, ?, 'external', ?, ?)`,
    ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)
    const featuresRoot = join(root, 'docs', 'features')
    const featureDir = join(featuresRoot, SLUG)
    writeDoc(featureDir, 'manifest.md', manifestOf('design'))
    writeDoc(featureDir, join('prd', 'prd-spec.md'), '# spec\n')
    const events: WorkbenchEvent[] = []
    const assembly = createWorkbenchIpcServices({
      db,
      pluginBundlesPath: join(root, 'plugin-bundles.json'),
      userDataPath: userData,
      onEvents: batch => events.push(...batch),
      perception: { retarget: () => {}, rescan: () => {} },
    })
    return {
      verbs: assembly.verbs,
      events,
      featureDir,
      dispose: () => {
        assembly.dispose()
        db.close()
      },
    }
  }

  it('services assembly exposes both write verbs end-to-end (write → gate → advance → event)', async () => {
    const ctx = await withServicesTree()
    try {
      // 门未满足 → 拒绝 + 引导。
      expect(() => ctx.verbs.advanceStage('p-1', SLUG)).toThrowError(
        expect.objectContaining({ code: 'ERR_STAGE_GATE_UNSATISFIED' }) as Error,
      )
      // summarize 开门 → advance → stage_advanced 事件(经装配 sink 直发)。
      const written = ctx.verbs.stageSummarize({ projectId: 'p-1', featureSlug: SLUG, stage: 'design', goal: 'g', summary: 's' })
      expect(written.gateOpen).toBe(true)
      const summary = ctx.verbs.advanceStage('p-1', SLUG)
      expect(summary.status).toBe('tasks')
      expect(parseFrontmatterObject(readFileSync(join(ctx.featureDir, 'manifest.md'), 'utf8'))?.status).toBe('tasks')
      expect(ctx.events).toEqual([{ type: 'stage_advanced', projectId: 'p-1', featureSlug: SLUG }])
    } finally {
      ctx.dispose()
    }
  })

  it('handlers route the two channels with positional/shape validation; domain codes pass through the envelope', async () => {
    const ctx = await withServicesTree()
    try {
      const advance = vi.fn(() => ({ slug: SLUG, status: 'tasks', docKinds: [], taskTotal: 0, taskCompleted: 0, updatedAt: FIXED_AT }))
      const summarizeMock = vi.fn(() => ({ stage: 'design', path: 'alpha/stages/design.md', generatedAt: FIXED_AT, featureStage: 'design', gateOpen: true }))
      const services = {
        ...ctx.verbs,
        advanceStage: advance,
        stageSummarize: summarizeMock,
      } as unknown as WorkbenchVerbServices
      const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
      const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
      installWorkbenchVerbs(registrar, services, {
        sink: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        get size() { return 0 },
      })

      const C = WORKBENCH_VERB_CHANNELS
      handlers.get(C.advanceStage)?.(OWNED, 'p-1', SLUG)
      expect(advance).toHaveBeenCalledWith('p-1', SLUG)

      handlers.get(C.stageSummarize)?.(OWNED, { projectId: 'p-1', featureSlug: SLUG, stage: 'design', goal: 'g', summary: 's' })
      expect(summarizeMock).toHaveBeenCalledWith({ projectId: 'p-1', featureSlug: SLUG, stage: 'design', goal: 'g', summary: 's' })

      // 形状校验:非对象入参 / 词表外阶段 → 调用方契约错(plain Error,不达服务面)。
      expect(() => handlers.get(C.stageSummarize)?.(OWNED, 'nope')).toThrow(/stageSummarize: input must be an object/)
      expect(() => handlers.get(C.stageSummarize)?.(OWNED, { projectId: 'p-1', featureSlug: SLUG, stage: 'bogus', goal: 'g', summary: 's' }))
        .toThrow(/input\.stage must be one of prd\/design\/tasks\/in-progress\/completed/)
      expect(() => handlers.get(C.stageSummarize)?.(OWNED, { projectId: 'p-1', featureSlug: SLUG, stage: 'design', goal: 'g' }))
        .toThrow(/input\.summary must be a non-empty string/)
      expect(() => handlers.get(C.advanceStage)?.(OWNED, 'p-1', '')).toThrow(/featureSlug must be a non-empty string/)

      // 域错误封装:StageWriteError → 同码 WorkbenchIpcError(message = 封装 JSON)。
      const envelope = toWorkbenchIpcError(
        new StageWriteError('ERR_STAGE_GATE_UNSATISFIED', 'gate unsatisfied', 'missing guidance'),
        'advanceStage',
      )
      expect(JSON.parse(envelope.message)).toMatchObject({ code: 'ERR_STAGE_GATE_UNSATISFIED', message: 'gate unsatisfied' })
    } finally {
      ctx.dispose()
    }
  })
})
