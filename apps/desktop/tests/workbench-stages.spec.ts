// Task 3.2 kernel legs — the stages read side (deterministic stage-artifact
// checklist + stage_asset perception index + gate verbs). AC groups:
//
//   AC-1 五阶段清单矩阵 — prd/design/tasks/in-progress/completed 各阶段
//            期望产物逐条判定(存在性 / status 一致 / 任务集非空 / 依赖闭合 /
//            终态聚合 / 资产齐全),缺失项返回结构化 MissingItem 清单;语料 =
//            stages/__fixtures__/corpus.json(齐全/缺失矩阵,spec 落 tmp 树)。
//   AC-2 确定性断言 — 检查路径纯代码(文件 + SQLite 查询):import 面白名单
//            断言(node: 内建 + workbench 内部相对模块,零模型/网络/进程客户端
//            引用)+ 全矩阵仅以 {db, paths} 依赖注入运行。
//   AC-3 stage_asset 索引 — stages/<stage>.md 感知更新(frontmatter 解析),
//            派生可重建(清空重建零差异),消失 feature 行清理。
//   AC-4 门态动词 — getStageGate(当前阶段总结已/未生成 + 资产列表)+
//            listStageAssets 按阶段返回(管线序)。
//   IPC 面 — 三动词通道路由 + 参数形状校验 + 域错误封装原码透传。
//
// Everything below runs against the real migrated db (node:sqlite) + tmp doc
// trees — no spawn, no CLI, no network.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type DatabaseSyncLike } from '../src/main/workbench/store/db.ts'
import type { FeatureStatus, RepoDb, TaskStatus } from '../src/main/workbench/repos/types.ts'
import { upsertTaskSnapshots } from '../src/main/workbench/repos/task-snapshots.ts'
import { upsertFeatureSnapshot } from '../src/main/workbench/repos/feature-snapshots.ts'
import { insertTask } from '../src/main/workbench/tasks/task-repo.ts'
import { scanForgeFiles, type ScanTarget } from '../src/main/workbench/indexer/scan.ts'
import {
  STAGE_PIPELINE,
  collectStageAssets,
  rebuildStageAssetIndex,
} from '../src/main/workbench/stages/stage-asset-index.ts'
import { checkStageArtifacts } from '../src/main/workbench/stages/artifacts-check.ts'
import { createStagesVerbService, StageDomainError, type StagesVerbService } from '../src/main/workbench/stages/stages-service.ts'
import {
  WORKBENCH_VERB_CHANNELS,
} from '../src/main/workbench/ipc/channel-allowlist.ts'
import {
  installWorkbenchVerbs,
  type WorkbenchHandleRegistrar,
} from '../src/main/workbench/ipc/handlers.ts'
import { createWorkbenchIpcServices } from '../src/main/workbench/ipc/services.ts'
import type { WorkbenchVerbServices } from '../src/main/workbench/ipc/types.ts'
import type { WorkbenchVerbEvent } from '../src/main/workbench/ipc/sender-validate.ts'

// ---------------------------------------------------------------------------
// Corpus — stages/__fixtures__/corpus.json(五阶段齐全/缺失矩阵)
// ---------------------------------------------------------------------------

const fixturesUrl = new URL('../src/main/workbench/stages/__fixtures__/corpus.json', import.meta.url)
const corpus = JSON.parse(readFileSync(fileURLToPath(fixturesUrl), 'utf8')) as {
  readonly slug: string
  readonly templates: Record<string, string>
  readonly scenarios: readonly MatrixScenario[]
}

interface MatrixTask {
  readonly localId: string
  readonly title: string
  readonly status: string
  readonly blockers: readonly string[]
  readonly mdBody: string
}

interface MatrixScenario {
  readonly name: string
  readonly manifestStatus: string | null
  readonly prdSpec: boolean
  readonly designDocs: readonly string[]
  readonly writeTaskMds: boolean
  readonly indexJson: boolean
  readonly stageAssets: readonly string[]
  readonly tasks: readonly MatrixTask[]
  readonly authority: 'files' | 'sqlite'
  readonly featureSnapshotStatus: string | null
  readonly expect: {
    readonly stage: string
    readonly satisfied: boolean
    readonly missing: ReadonlyArray<{ readonly stage: string; readonly rule: string; readonly artifact: string }>
  }
}

const FIXED_AT = '2026-09-20T10:00:00.000Z'

/** 语料模板填充(占位符替换;deps 以 JSON 内联)。 */
function fill(template: string, fields: Record<string, string>): string {
  let out = template
  for (const [key, value] of Object.entries(fields)) {
    out = out.replaceAll(`{${key}}`, value)
  }
  return out
}

const scratches: string[] = []

function makeScratch(): string {
  const dir = join(tmpdir(), `dsh-forge-stages-${String(process.pid)}-${String(scratches.length)}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  scratches.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of scratches.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10 })
})

/** 语料场景 → tmp 文档树 + db 种子(项目行直插,external 文档根)。 */
interface Materialized {
  readonly db: DatabaseSyncLike
  readonly projectId: string
  readonly root: string
  readonly featuresRoot: string
  readonly featureDir: string
  readonly service: StagesVerbService
  /** 感知重扫(AC-3 索引随扫同步;门/资产动词的表数据由此就位)。 */
  readonly scan: () => void
}

function writeDoc(featureDir: string, rel: string, content: string): void {
  const path = join(featureDir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

async function materialize(scenario: MatrixScenario): Promise<Materialized> {
  const root = makeScratch()
  const userData = join(root, 'user')
  mkdirSync(userData, { recursive: true })
  const { db } = await openDatabase(userData)
  const projectId = 'p-1'
  db.prepare(
    `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
     VALUES (?, ?, ?, 'external', ?, ?)`,
  ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)
  if (scenario.authority === 'sqlite') {
    db.prepare('UPDATE projects SET data_authority = ? WHERE id = ?').run('sqlite', projectId)
  }

  const slug = corpus.slug
  const featuresRoot = join(root, 'docs', 'features')
  const featureDir = join(featuresRoot, slug)
  mkdirSync(featureDir, { recursive: true })

  if (scenario.manifestStatus !== null) {
    writeDoc(featureDir, 'manifest.md', fill(corpus.templates.manifest, { slug, status: scenario.manifestStatus }))
  }
  if (scenario.prdSpec) {
    writeDoc(featureDir, join('prd', 'prd-spec.md'), corpus.templates.prdSpec)
  }
  for (const file of scenario.designDocs) {
    writeDoc(featureDir, join('design', file), corpus.templates.designDoc)
  }
  if (scenario.tasks.length > 0 || scenario.indexJson) {
    if (scenario.writeTaskMds) {
      for (const task of scenario.tasks) {
        // mdBody = 描述正文:空串 → 裸 frontmatter 任务 md(「描述为空」语料,
        // 不补 Description 骨架标题 —— 否则正文恒非空,缺失态不可造)。
        const frontmatter = [
          '---',
          `id: "${task.localId}"`,
          `title: "${task.title}"`,
          `status: "${task.status}"`,
          `dependencies: ${JSON.stringify(task.blockers)}`,
          '---',
          '',
        ].join('\n')
        const markdown = task.mdBody === ''
          ? `${frontmatter}\n`
          : fill(corpus.templates.taskMd, {
            localId: task.localId,
            title: task.title,
            status: task.status,
            deps: JSON.stringify(task.blockers),
            body: task.mdBody,
          })
        writeDoc(featureDir, join('tasks', `${task.localId}.md`), markdown)
      }
    }
    if (scenario.indexJson) {
      const entries: Record<string, unknown> = {}
      for (const task of scenario.tasks) {
        entries[task.localId] = {
          id: task.localId,
          title: task.title,
          status: task.status,
          dependencies: [...task.blockers],
          file: `${task.localId}.md`,
        }
      }
      writeDoc(featureDir, join('tasks', 'index.json'), JSON.stringify({ tasks: entries }, null, 2))
    }
  }
  for (const stage of scenario.stageAssets) {
    writeDoc(featureDir, join('stages', `${stage}.md`), fill(corpus.templates.stageAsset, {
      stage,
      generated: FIXED_AT,
      goal: `Goal of ${stage}`,
    }))
  }

  // db 种子:任务集(files → task_snapshot 派生投影;sqlite → task 权威表,
  // desc_path = 摄入方言 <slug>/tasks/<localId>.md)。
  if (scenario.authority === 'files') {
    upsertTaskSnapshots(db, projectId, scenario.tasks.map(task => ({
      taskKey: `${slug}/${task.localId}`,
      featureSlug: slug,
      title: task.title,
      status: task.status as TaskStatus,
      blockers: [...task.blockers],
      branch: null,
      worktree: false,
      source: null,
      updatedAt: FIXED_AT,
    })))
  } else {
    for (const task of scenario.tasks) {
      insertTask(db, {
        projectId,
        taskKey: `${slug}/${task.localId}`,
        featureSlug: slug,
        title: task.title,
        status: task.status as TaskStatus,
        blockers: [...task.blockers],
        taskType: null,
        descPath: `${slug}/tasks/${task.localId}.md`,
        updatedBy: 'kernel',
        updatedAt: FIXED_AT,
      })
    }
  }
  if (scenario.featureSnapshotStatus !== null) {
    upsertFeatureSnapshot(db, {
      projectId,
      featureSlug: slug,
      status: scenario.featureSnapshotStatus as FeatureStatus,
      docKinds: [],
      updatedAt: FIXED_AT,
    })
  }

  const service = createStagesVerbService({
    db,
    resolveFeaturesRoot: id => (id === projectId ? featuresRoot : null),
  })
  const target: ScanTarget = { id: projectId, codeRoot: join(root, 'code'), docLocationPath: root }
  return { db, projectId, root, featuresRoot, featureDir, service, scan: () => { scanForgeFiles(db, target) } }
}

// ---------------------------------------------------------------------------
// AC-1: five-stage checklist matrix (corpus-driven, exact MissingItem lists)
// ---------------------------------------------------------------------------

describe('checkStageArtifacts — PRD stage expectation matrix', () => {
  for (const scenario of corpus.scenarios) {
    it(`scenario ${scenario.name}: stage=${scenario.expect.stage} satisfied=${String(scenario.expect.satisfied)}`, async () => {
      const m = await materialize(scenario)
      try {
        const report = m.service.checkStageArtifacts({ projectId: m.projectId, featureSlug: corpus.slug })
        expect(report.stage).toBe(scenario.expect.stage)
        expect(report.satisfied).toBe(scenario.expect.satisfied)
        // detail 为稳定文案(单独断言非空);矩阵比对锚定 stage/rule/artifact 三键。
        const projected = report.missing.map(item => ({ stage: item.stage, rule: item.rule, artifact: item.artifact }))
        expect(projected).toEqual(scenario.expect.missing)
        for (const item of report.missing) expect(item.detail.length).toBeGreaterThan(0)
      } finally {
        m.db.close()
      }
    })
  }

  it('reports a non-terminal task per task (aggregation leg, multiple offenders)', async () => {
    const m = await materialize({
      ...corpus.scenarios.find(s => s.name === 'completed-not-terminal')!,
      tasks: [
        { localId: '1.1', title: 'Task one', status: 'completed', blockers: [], mdBody: 'Done.' },
        { localId: '1.2', title: 'Task two', status: 'pending', blockers: [], mdBody: 'Never ran.' },
        { localId: '1.3', title: 'Task three', status: 'blocked', blockers: [], mdBody: 'Stuck.' },
      ],
    })
    try {
      const report = m.service.checkStageArtifacts({ projectId: m.projectId, featureSlug: corpus.slug })
      expect(report.satisfied).toBe(false)
      expect(report.missing.map(item => ({ stage: item.stage, rule: item.rule, artifact: item.artifact }))).toEqual([
        { stage: 'completed', rule: 'task-not-terminal', artifact: 'alpha/1.2' },
        { stage: 'completed', rule: 'task-not-terminal', artifact: 'alpha/1.3' },
      ])
    } finally {
      m.db.close()
    }
  })

  it('rejects unknown project with ERR_PROJECT_NOT_FOUND and unknown feature with ERR_FEATURE_NOT_FOUND', async () => {
    const base = corpus.scenarios.find(s => s.name === 'prd-complete')!
    const m = await materialize(base)
    try {
      expect(() => m.service.checkStageArtifacts({ projectId: 'p-x', featureSlug: corpus.slug }))
        .toThrowError(expect.objectContaining({ code: 'ERR_PROJECT_NOT_FOUND' }) as Error)
      expect(() => m.service.checkStageArtifacts({ projectId: m.projectId, featureSlug: 'ghost' }))
        .toThrowError(StageDomainError)
      expect(() => m.service.getStageGate(m.projectId, 'ghost')).toThrowError(
        expect.objectContaining({ code: 'ERR_FEATURE_NOT_FOUND' }) as Error,
      )
    } finally {
      m.db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-2: determinism — pure code path (files + SQLite), zero model surface
// ---------------------------------------------------------------------------

describe('deterministic check surface (G4 hard rule)', () => {
  const STAGE_MODULES = [
    'stage-asset-index.ts',
    'artifacts-check.ts',
    'stages-service.ts',
  ] as const
  const modulesUrl = new URL('../src/main/workbench/stages/', import.meta.url)

  it('stages modules import only node builtins and workbench internals (no model/network/process client)', () => {
    for (const file of STAGE_MODULES) {
      const source = readFileSync(fileURLToPath(new URL(file, modulesUrl)), 'utf8')
      const importSpecifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map(match => match[1] ?? '')
      expect(importSpecifiers.length, `${file} must declare its imports`).toBeGreaterThan(0)
      for (const specifier of importSpecifiers) {
        expect(
          specifier.startsWith('node:') || specifier.startsWith('./') || specifier.startsWith('../'),
          `${file}: import ${specifier} escapes the node:/workbench-internal surface`,
        ).toBe(true)
      }
      // Direct client usage patterns are absent even as globals (comments may
      // mention the rule; only callable forms are rejected).
      expect(source.includes('child_process'), `${file}: child_process forbidden`).toBe(false)
      expect(/\brequire\s*\(/.test(source), `${file}: require() forbidden`).toBe(false)
      expect(/\bfetch\s*\(/.test(source), `${file}: fetch() forbidden`).toBe(false)
    }
  })

  it('checkStageArtifacts runs to a verdict over {db, paths} injection alone (no async boundary)', async () => {
    const scenario = corpus.scenarios.find(s => s.name === 'tasks-complete')!
    const m = await materialize(scenario)
    try {
      // 直接函数面(非服务包装):依赖缝仅 { db } + 路径入参 —— 零模型调用面。
      const report = checkStageArtifacts(m.db, { projectId: m.projectId, featureSlug: corpus.slug, featuresRoot: m.featuresRoot })
      expect(report).toEqual({ stage: 'tasks', satisfied: true, missing: [] })
    } finally {
      m.db.close()
    }
  })
})

// ---------------------------------------------------------------------------
// AC-3: stage_asset perception index (scan-synced, derived rebuildable)
// ---------------------------------------------------------------------------

describe('stage_asset perception index', () => {
  interface IndexRun {
    (db: DatabaseSyncLike, projectId: string, target: ScanTarget, featuresRoot: string): void | Promise<void>
  }

  async function withIndexTree(run: IndexRun): Promise<void> {
    const root = makeScratch()
    const userData = join(root, 'user')
    mkdirSync(userData, { recursive: true })
    const { db } = await openDatabase(userData)
    try {
      const projectId = 'p-1'
      db.prepare(
        `INSERT INTO projects (id, display_name, code_root, doc_location_type, doc_location_path, created_at)
         VALUES (?, ?, ?, 'external', ?, ?)`,
      ).run(projectId, 'demo', join(root, 'code'), root, FIXED_AT)
      const featuresRoot = join(root, 'docs', 'features')
      // alpha:manifest + 两份资产;beta:manifest + 一份资产(索引与 feature 快照
      // 无关的行也要写 —— scanFeatures 以 manifest.md 判定 feature)。
      for (const slug of ['alpha', 'beta']) {
        writeDoc(join(featuresRoot, slug), 'manifest.md', fill(corpus.templates.manifest, { slug, status: 'tasks' }))
        writeDoc(join(featuresRoot, slug), join('tasks', 'index.json'), JSON.stringify({ tasks: {} }))
      }
      writeDoc(join(featuresRoot, 'alpha'), join('stages', 'prd.md'), fill(corpus.templates.stageAsset, { stage: 'prd', generated: FIXED_AT, goal: 'Goal of prd' }))
      writeDoc(join(featuresRoot, 'alpha'), join('stages', 'design.md'), fill(corpus.templates.stageAsset, { stage: 'design', generated: FIXED_AT, goal: 'Goal of design' }))
      writeDoc(join(featuresRoot, 'beta'), join('stages', 'tasks.md'), fill(corpus.templates.stageAsset, { stage: 'tasks', generated: FIXED_AT, goal: 'Goal of tasks' }))
      const target: ScanTarget = { id: projectId, codeRoot: join(root, 'code'), docLocationPath: root }
      await run(db, projectId, target, featuresRoot)
    } finally {
      db.close()
    }
  }

  const allRows = (db: DatabaseSyncLike): unknown[] => {
    // 行集比对基准:feature_slug 字典序 + 阶段管线序(SQL stage 列为 TEXT,
    // 字典序与管线序不一致 —— 排序在 JS 侧钉定管线序)。
    const order = new Map(STAGE_PIPELINE.map((stage, index) => [stage, index]))
    return (db.prepare('SELECT * FROM stage_asset').all() as Array<Record<string, string>>)
      .sort((a, b) =>
        a.feature_slug === b.feature_slug
          ? (order.get(a.stage) ?? 99) - (order.get(b.stage) ?? 99)
          : (a.feature_slug < b.feature_slug ? -1 : 1))
  }

  it('scan populates the index from stages/*.md frontmatter (perception update)', async () => {
    await withIndexTree((db, projectId, target) => {
      scanForgeFiles(db, target)
      expect(allRows(db)).toEqual([
        { project_id: projectId, feature_slug: 'alpha', stage: 'prd', path: 'alpha/stages/prd.md', generated_at: FIXED_AT },
        { project_id: projectId, feature_slug: 'alpha', stage: 'design', path: 'alpha/stages/design.md', generated_at: FIXED_AT },
        { project_id: projectId, feature_slug: 'beta', stage: 'tasks', path: 'beta/stages/tasks.md', generated_at: FIXED_AT },
      ])
    })
  })

  it('rescan picks up added/removed assets and prunes vanished features', async () => {
    await withIndexTree((db, projectId, target, featuresRoot) => {
      scanForgeFiles(db, target)
      // 新增资产(in-progress)+ 移除既有(prd)
      writeDoc(join(featuresRoot, 'alpha'), join('stages', 'in-progress.md'), fill(corpus.templates.stageAsset, { stage: 'in-progress', generated: FIXED_AT, goal: 'Goal of in-progress' }))
      rmSync(join(featuresRoot, 'alpha', 'stages', 'prd.md'))
      scanForgeFiles(db, target)
      expect(allRows(db).filter(row => (row as { feature_slug: string }).feature_slug === 'alpha')).toEqual([
        { project_id: projectId, feature_slug: 'alpha', stage: 'design', path: 'alpha/stages/design.md', generated_at: FIXED_AT },
        { project_id: projectId, feature_slug: 'alpha', stage: 'in-progress', path: 'alpha/stages/in-progress.md', generated_at: FIXED_AT },
      ])
      // feature 整体消失 → 行清理(派生索引不留尸行)。
      rmSync(join(featuresRoot, 'beta'), { recursive: true, force: true })
      scanForgeFiles(db, target)
      expect(allRows(db).some(row => (row as { feature_slug: string }).feature_slug === 'beta')).toBe(false)
    })
  })

  it('skips files with invalid frontmatter (stage out of vocabulary / no frontmatter) without failing the scan', async () => {
    await withIndexTree((db, _projectId, target, featuresRoot) => {
      writeDoc(join(featuresRoot, 'alpha'), join('stages', 'bogus.md'), fill(corpus.templates.stageAsset, { stage: 'shipped', generated: FIXED_AT, goal: 'bad stage' }))
      writeDoc(join(featuresRoot, 'alpha'), join('stages', 'plain.md'), 'no frontmatter here\n')
      expect(() => scanForgeFiles(db, target)).not.toThrow()
      expect(allRows(db).some(row => (row as { stage: string }).stage === 'shipped')).toBe(false)
      expect(allRows(db).some(row => (row as { path: string }).path === 'alpha/stages/plain.md')).toBe(false)
    })
  })

  it('clear + rebuild reproduces identical rows (derived rebuildable, zero diff)', async () => {
    await withIndexTree((db, projectId, target, featuresRoot) => {
      scanForgeFiles(db, target)
      const before = allRows(db)
      expect(before.length).toBe(3)
      db.prepare('DELETE FROM stage_asset').run()
      expect(allRows(db)).toEqual([])
      const rebuilt = rebuildStageAssetIndex(db as RepoDb, projectId, featuresRoot)
      expect(rebuilt).toBe(3)
      expect(allRows(db)).toEqual(before)
    })
  })

  it('collectStageAssets orders by pipeline and ignores foreign dirs', async () => {
    await withIndexTree((_db, _projectId, _target, featuresRoot) => {
      const rows = collectStageAssets(featuresRoot, 'alpha')
      expect(rows.map(row => row.stage)).toEqual(['prd', 'design'])
      expect(rows[0]).toEqual({ stage: 'prd', path: 'alpha/stages/prd.md', generatedAt: FIXED_AT })
    })
  })
})

// ---------------------------------------------------------------------------
// AC-4: gate + asset verbs
// ---------------------------------------------------------------------------

describe('getStageGate / listStageAssets', () => {
  async function withGateTree(stages: readonly string[], manifestStatus = 'design'): Promise<Materialized> {
    const base = corpus.scenarios.find(s => s.name === 'design-complete')!
    return materialize({
      ...base,
      manifestStatus,
      stageAssets: stages,
    })
  }

  it('getStageGate reports summaryGenerated=true with the gate asset when stages/<stage>.md exists', async () => {
    const m = await withGateTree(['prd', 'design'])
    try {
      m.scan()
      const gate = m.service.getStageGate(m.projectId, corpus.slug)
      expect(gate.stage).toBe('design')
      expect(gate.summaryGenerated).toBe(true)
      expect(gate.gateAssetPath).toBe('alpha/stages/design.md')
      expect(gate.assets.map(row => row.stage)).toEqual(['prd', 'design'])
    } finally {
      m.db.close()
    }
  })

  it('getStageGate reports summaryGenerated=false (gate asset absent) — live fs verdict, not index staleness', async () => {
    // 索引内无当前阶段资产行,且文件也不在 —— 门态 = 未生成。
    const m = await withGateTree(['prd'])
    try {
      m.scan()
      const gate = m.service.getStageGate(m.projectId, corpus.slug)
      expect(gate.stage).toBe('design')
      expect(gate.summaryGenerated).toBe(false)
      expect(gate.gateAssetPath).toBe(null)
      expect(gate.assets.map(row => row.stage)).toEqual(['prd'])
    } finally {
      m.db.close()
    }
  })

  it('gate verdict follows a file written after service creation (deterministic live read)', async () => {
    const m = await withGateTree([])
    try {
      m.scan()
      expect(m.service.getStageGate(m.projectId, corpus.slug).summaryGenerated).toBe(false)
      writeDoc(m.featureDir, join('stages', 'design.md'), fill(corpus.templates.stageAsset, { stage: 'design', generated: FIXED_AT, goal: 'late summary' }))
      expect(m.service.getStageGate(m.projectId, corpus.slug).summaryGenerated).toBe(true)
    } finally {
      m.db.close()
    }
  })

  it('listStageAssets returns rows ordered by the stage pipeline regardless of write order', async () => {
    const m = await withGateTree(['completed', 'prd', 'tasks'])
    try {
      m.scan()
      const rows = m.service.listStageAssets(m.projectId, corpus.slug)
      expect(rows.map(row => row.stage)).toEqual(['prd', 'tasks', 'completed'])
      expect(rows.every(row => row.path === `alpha/stages/${row.stage}.md`)).toBe(true)
      expect(rows.map(row => row.generatedAt)).toEqual([FIXED_AT, FIXED_AT, FIXED_AT])
    } finally {
      m.db.close()
    }
  })

  it('STAGE_PIPELINE pins the forge stage vocabulary and order', () => {
    expect(STAGE_PIPELINE).toEqual(['prd', 'design', 'tasks', 'in-progress', 'completed'])
  })
})

// ---------------------------------------------------------------------------
// IPC face: verb wiring through services assembly + handler registration
// ---------------------------------------------------------------------------

describe('stages verbs on the IPC/service face', () => {
  const OWNED: WorkbenchVerbEvent = { senderFrame: { url: 'dsh-app://app/' } }

  interface ServicesTree {
    readonly verbs: WorkbenchVerbServices
    readonly projectId: string
    readonly dispose: () => void
    readonly db: DatabaseSyncLike
  }

  async function withServicesTree(): Promise<ServicesTree> {
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
    writeDoc(join(featuresRoot, corpus.slug), 'manifest.md', fill(corpus.templates.manifest, { slug: corpus.slug, status: 'prd' }))
    writeDoc(join(featuresRoot, corpus.slug), join('prd', 'prd-spec.md'), corpus.templates.prdSpec)
    const assembly = createWorkbenchIpcServices({
      db,
      pluginBundlesPath: join(root, 'plugin-bundles.json'),
      userDataPath: userData,
      perception: { retarget: () => {}, rescan: () => {} },
    })
    return {
      verbs: assembly.verbs,
      projectId,
      db,
      dispose: () => {
        assembly.dispose()
        db.close()
      },
    }
  }

  it('services assembly exposes the three stage verbs end-to-end', async () => {
    const ctx = await withServicesTree()
    try {
      const report = ctx.verbs.checkStageArtifacts({ projectId: ctx.projectId, featureSlug: corpus.slug })
      expect(report).toEqual({ stage: 'prd', satisfied: true, missing: [] })
      const gate = ctx.verbs.getStageGate(ctx.projectId, corpus.slug)
      expect(gate.summaryGenerated).toBe(false)
      expect(ctx.verbs.listStageAssets(ctx.projectId, corpus.slug)).toEqual([])
    } finally {
      ctx.dispose()
    }
  })

  it('handlers route the three channels to the services with positional/shape validation', async () => {
    const ctx = await withServicesTree()
    try {
      const check = vi.fn(() => ({ stage: 'prd', satisfied: true, missing: [] }))
      const gate = vi.fn(() => ({ stage: 'prd', summaryGenerated: false, gateAssetPath: null, assets: [] }))
      const list = vi.fn(() => [])
      const services = { ...ctx.verbs, checkStageArtifacts: check, getStageGate: gate, listStageAssets: list } as WorkbenchVerbServices
      const handlers = new Map<string, (event: WorkbenchVerbEvent, ...args: unknown[]) => unknown>()
      const registrar: WorkbenchHandleRegistrar = (channel, listener) => { handlers.set(channel, listener) }
      installWorkbenchVerbs(registrar, services, {
        sink: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        get size() { return 0 },
      })

      const C = WORKBENCH_VERB_CHANNELS
      const report = handlers.get(C.checkStageArtifacts)?.(OWNED, { projectId: 'p-1', featureSlug: corpus.slug }) as { stage: string }
      expect(report.stage).toBe('prd')
      expect(check).toHaveBeenCalledWith({ projectId: 'p-1', featureSlug: corpus.slug })

      handlers.get(C.getStageGate)?.(OWNED, 'p-1', corpus.slug)
      expect(gate).toHaveBeenCalledWith('p-1', corpus.slug)

      handlers.get(C.listStageAssets)?.(OWNED, 'p-1', corpus.slug)
      expect(list).toHaveBeenCalledWith('p-1', corpus.slug)

      // 形状校验:非对象入参 / 空串 → 调用方契约错(plain Error,不达服务面)。
      expect(() => handlers.get(C.checkStageArtifacts)?.(OWNED, 'nope')).toThrow(/checkStageArtifacts: input must be an object/)
      expect(() => handlers.get(C.checkStageArtifacts)?.(OWNED, { projectId: '', featureSlug: 'x' })).toThrow(/input\.projectId must be a non-empty string/)
      expect(() => handlers.get(C.getStageGate)?.(OWNED, 'p-1', '')).toThrow(/featureSlug must be a non-empty string/)
      expect(() => handlers.get(C.listStageAssets)?.(OWNED, '')).toThrow(/projectId must be a non-empty string/)
    } finally {
      ctx.dispose()
    }
  })
})
