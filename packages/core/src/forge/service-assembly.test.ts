// 任务 2.2 测试 —— index.ts（插件装配入口，原 service.ts——fix-35 对称化）装配点：ctx.forgeProjects Cordis 服务注册。
// 2.7 扩测：provide ×4（ctx.forgeTasks/forgeFeatures/forgeProposals/forgeDocs 四域注入 + tasksHome
// 缺席降级 + 惰性首开发现面接线端到端）。Cordis Plugin.Function 形态断言：loader 取 default 导出
// （exports.default ?? exports，上游核实），inject 依赖声明、reflect.provide 注册官方面
// （Service 基类同径）、返回值 = 句柄 disposer。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { ProjectWriteError } from './errors.js'
import type { WorkspaceLike } from './registry.js'
import { seedProjectRow } from '../testutil/db-seeds.js'
import corePlugin, { type CoreContextFace } from '../index.js'
import { deriveTaskStoreDir } from './workspace/derive-dir.js'
import { FORGE_DB_SCHEMA_VERSION, WORKSPACE_MIGRATIONS } from './workspace/migrations.js'

/** rename 结构化桩（fix-24 ②：workspaceController 窄面——注册链标题对齐消费） */
const stubRename = { rename: async () => ({}) }

let dir: string
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})
const dbPath = () => join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))), `${randomUUID()}.db`)

/** 结构化 ctx 桩（reflect.provide 记录调用；workspaceRegistry 最小面） */
function stubCtx() {
  const provided = new Map<string, unknown>()
  const records = new Map<string, WorkspaceLike>()
  const registry = {
    records,
    get: (id: string): WorkspaceLike | undefined => records.get(id),
    list: (): WorkspaceLike[] => [...records.values()],
    async create(path: string): Promise<WorkspaceLike> {
      const ws = { id: randomUUID(), path }
      records.set(ws.id, ws)
      return ws
    },
    async delete(id: string): Promise<boolean> {
      return records.delete(id)
    },
  }
  const ctx: CoreContextFace = {
    workspaceRegistry: registry,
    workspaceController: stubRename,
    reflect: {
      provide(name: string, value?: unknown) {
        provided.set(name, value)
        return () => provided.delete(name)
      },
    },
  }
  return { ctx, provided, registry }
}

describe('service.ts 装配：ctx.forgeProjects 注册（Plugin.Function 形态）', () => {
  it('默认导出函数插件：inject=workspaceRegistry+workspaceController（fix-24 ② 标题对齐面），provide forgeProjects（Interface 1 全五法面——2.3 并齐）', () => {
    const { ctx, provided } = stubCtx()
    const dispose = corePlugin(ctx, { dbFile: dbPath() })
    expect(corePlugin.inject).toEqual(['workspaceRegistry', 'workspaceController'])
    const svc = provided.get('forgeProjects') as Record<string, unknown> | undefined
    expect(svc).toBeDefined()
    for (const method of ['registerProject', 'listProjects', 'getProject', 'updateProject', 'reconcileAtStartup']) {
      expect(typeof svc?.[method]).toBe('function')
    }
    expect(typeof dispose).toBe('function')
    dispose()
  })

  it('1.4 M2 扩族：config.tasksHome 注入 → deriveTaskStoreDir 第六动词在场可用（Interface 5——P1 五法不动）', async () => {
    const { ctx, provided } = stubCtx()
    const tasksHome = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-m2-'))
    try {
      const dispose = corePlugin(ctx, { dbFile: dbPath(), tasksHome })
      const svc = provided.get('forgeProjects') as {
        deriveTaskStoreDir: (q: { workspaceDir: string }) => Promise<{ dir: string }>
      }
      expect(typeof svc.deriveTaskStoreDir).toBe('function')
      const result = await svc.deriveTaskStoreDir({ workspaceDir: 'Z:\\project\\dsh' })
      expect(result.dir).toBe(`${tasksHome}\\Z-project-dsh@9d2471be`) // 单源逐字（G1-12 布局 pin 同源）
      dispose()
    } finally {
      rmSync(tasksHome, { recursive: true, force: true })
    }
  })

  it('返回值 = 句柄 disposer：调用后库已关，registerProject 失败（挂接路径 → 无补偿不删既有）', async () => {
    const { ctx, provided, registry } = stubCtx()
    registry.records.set('ws-existing', { id: 'ws-existing', path: 'C:\\proj' }) // 挂接路径
    const dispose = corePlugin(ctx, { dbFile: dbPath() })
    const svc = provided.get('forgeProjects') as {
      registerProject: (i: unknown) => Promise<unknown>
    }
    dispose()
    const err: unknown = await svc
      .registerProject({
        workspaceDir: 'C:\\proj',
        name: 'p',
        forgeDir: 'C:\\proj\\.forge',
        knowledgeDir: 'C:\\proj\\.knowledge',
      })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError) // 库已关 → ③ 失败；挂接路径 → ownership 保护无补偿
    expect(registry.records.has('ws-existing')).toBe(true)
  })
})

describe('2.7 provide ×4 装配：ctx.forgeTasks / forgeFeatures / forgeProposals / forgeDocs', () => {
  it('tasksHome 注入：四域服务全部在场，方法面完整（Interface 1/2/3/4 锚）', () => {
    const { ctx, provided } = stubCtx()
    const tasksHome = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-m2-'))
    try {
      const dispose = corePlugin(ctx, { dbFile: dbPath(), tasksHome })
      // Interface 1（壳——2.2–2.6 接线期）：十一法面完整（桥白名单/ready 位锚）
      const tasks = provided.get('forgeTasks') as Record<string, unknown> | undefined
      expect(tasks).toBeDefined()
      for (const method of [
        'addTask',
        'claimTask',
        'submitTask',
        'transitionTask',
        'queryTask',
        'validateFeatureTasks',
        'listTasks',
        'taskStats',
        'taskGraph',
        'taskDetail',
        'sessionLinks',
      ]) {
        expect(typeof tasks?.[method]).toBe('function')
      }
      // Interface 2：feature 域五法（fix-2 增 listFeatureDocs 列举读面）
      const features = provided.get('forgeFeatures') as Record<string, unknown> | undefined
      expect(features).toBeDefined()
      for (const method of ['registerFeature', 'transitionFeature', 'upsertFeatureDoc', 'listFeatures', 'listFeatureDocs']) {
        expect(typeof features?.[method]).toBe('function')
      }
      // Interface 3：提案域三法
      const proposals = provided.get('forgeProposals') as Record<string, unknown> | undefined
      expect(proposals).toBeDefined()
      for (const method of ['createProposal', 'transitionProposal', 'listProposals']) {
        expect(typeof proposals?.[method]).toBe('function')
      }
      // Interface 4：文档读域单法
      const docs = provided.get('forgeDocs') as Record<string, unknown> | undefined
      expect(docs).toBeDefined()
      expect(typeof docs?.read).toBe('function')
      // P1 双服务不受 M2 装配影响
      expect(provided.has('forgeProjects')).toBe(true)
      expect(provided.has('forgeKnowledge')).toBe(true)
      dispose()
    } finally {
      rmSync(tasksHome, { recursive: true, force: true })
    }
  })

  it('tasksHome 缺席：四域降级缺席（P1 双服务零变化）——1.4 降级语义同径', () => {
    const { ctx, provided } = stubCtx()
    const dispose = corePlugin(ctx, { dbFile: dbPath() })
    expect([...provided.keys()].sort()).toEqual(['forgeKnowledge', 'forgeProjects'])
    dispose()
  })

  it('2.6 读面接线：占位 fail-loud 面退役——listTasks/taskStats 直读返回（十一法全接线）', async () => {
    const { ctx, provided } = stubCtx()
    const tasksHome = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-m2-'))
    // 中央行先行种入（routing.wsPath/resolveDir 消费面）
    const central = dbPath()
    const centralDb = openDatabase(central)
    seedProjectRow(centralDb, {
      id: 'p-read',
      workspaceId: 'w-read',
      wsPath: 'C:\\dsh-forge-read',
      forgeDir: 'C:\\dsh-forge-read\\.forge',
    })
    centralDb.close()
    try {
      const dispose = corePlugin(ctx, { dbFile: central, tasksHome })
      const tasks = provided.get('forgeTasks') as {
        listTasks: (q: { projectId: string }) => Promise<unknown[]>
        taskStats: (q: { projectId: string }) => Promise<{ total: number; byStatus: Record<string, number> }>
      }
      await expect(tasks.listTasks({ projectId: 'p-read' })).resolves.toEqual([]) // 直读空库
      const stats = await tasks.taskStats({ projectId: 'p-read' })
      expect(stats.total).toBe(0)
      expect(Object.keys(stats.byStatus)).toHaveLength(7) // 七态 chips 数据源
      dispose()
    } finally {
      rmSync(tasksHome, { recursive: true, force: true })
    }
  })

  it('惰性首开端到端：首次触达建库 v1 + 发现面扫描（交互二）→ listFeatures 见吸收行', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-e2e-'))
    const wsDir = join(root, 'ws')
    const forgeDir = join(wsDir, '.forge', 'docs', 'features', 'discovered-feature')
    mkdirSync(forgeDir, { recursive: true })
    writeFileSync(join(forgeDir, 'manifest.md'), '---\ntitle: 发现面特性\n---\n\n正文\n', 'utf-8')
    // 中央行先行种入（插件开库前——routing 消费）
    const central = openDatabase(join(root, 'state.db'))
    seedProjectRow(central, { id: 'p-e2e', workspaceId: 'w-e2e', wsPath: wsDir, forgeDir: join(wsDir, '.forge') })
    central.close()

    const { ctx, provided } = stubCtx()
    const dispose = corePlugin(ctx, { dbFile: join(root, 'state.db'), tasksHome: join(root, 'tasks-home') })
    try {
      const features = provided.get('forgeFeatures') as {
        listFeatures: (q: { projectId: string }) => Promise<{ slug: string; title: string; docCount: number }[]>
      }
      const cards = await features.listFeatures({ projectId: 'p-e2e' })
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({ slug: 'discovered-feature', title: '发现面特性', docCount: 0 })
    } finally {
      dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('2.5 送校接线：惰性首开 → post-ingestion 挂点对新入库 feature 逐个送校（发现违规 warn 记账工作区 app_key_logs）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-val-'))
    const wsDir = join(root, 'ws')
    // 违规形态：manifest 无 status（初值 'prd'）+ design 文档在场 → docPhaseMax='design' > 'prd'
    // → 相位派生不变量违规（发现面送校的可断言面）；同目录再放一干净 feature（无文档无漂移）
    const driftDir = join(wsDir, '.forge', 'docs', 'features', 'drift-feature')
    mkdirSync(join(driftDir, 'design'), { recursive: true })
    writeFileSync(join(driftDir, 'manifest.md'), '---\ntitle: 漂移特性\n---\n\n正文\n', 'utf-8')
    writeFileSync(join(driftDir, 'design', 'tech-design.md'), '# 设计\n', 'utf-8')
    const cleanDir = join(wsDir, '.forge', 'docs', 'features', 'clean-feature')
    mkdirSync(cleanDir, { recursive: true })
    writeFileSync(join(cleanDir, 'manifest.md'), '---\ntitle: 干净特性\n---\n\n正文\n', 'utf-8')
    const central = openDatabase(join(root, 'state.db'))
    seedProjectRow(central, { id: 'p-val', workspaceId: 'w-val', wsPath: wsDir, forgeDir: join(wsDir, '.forge') })
    central.close()

    const { ctx, provided } = stubCtx()
    const dispose = corePlugin(ctx, { dbFile: join(root, 'state.db'), tasksHome: join(root, 'tasks-home') })
    try {
      // 首次触达 → 建库 + 发现面吸收 + 送校（挂点 fail-soft 闭包内同步执行）
      const tasks = provided.get('forgeTasks') as {
        validateFeatureTasks: (q: { projectId: string; featureSlug: string }) => Promise<{
          violations: { kind: string }[]
          checked: { featureSlug: string; tasks: number }
        }>
      }
      const report = await tasks.validateFeatureTasks({ projectId: 'p-val', featureSlug: 'drift-feature' })
      expect(report.checked).toEqual({ featureSlug: 'drift-feature', tasks: 0 })
      expect(report.violations.map((v) => v.kind)).toEqual(['phase-invariant'])

      // 送校 warn 记账（派生目录单源——第二连接直读工作区 app_key_logs，WAL 并发读安全）
      const wsDb = openDatabase(join(deriveTaskStoreDir(join(root, 'tasks-home'), wsDir), 'forge.db'), {
        migrations: WORKSPACE_MIGRATIONS,
        schemaVersion: FORGE_DB_SCHEMA_VERSION,
      })
      try {
        const logs = wsDb
          .prepare<unknown[], { level: string; scope: string; data_json: string }>(
            `SELECT level, scope, data_json FROM app_key_logs ORDER BY id`,
          )
          .all()
        const sent = logs.filter((l) => l.data_json.includes('drift-feature'))
        expect(sent).toHaveLength(1)
        expect(sent[0]?.level).toBe('warn')
        expect(sent[0]?.scope).toBe('tasks')
        const data = JSON.parse(sent[0]?.data_json ?? '{}') as {
          violations?: { kind: string }[]
          disposition?: string
        }
        expect(data.violations?.map((v) => v.kind)).toEqual(['phase-invariant'])
        expect(data.disposition).toContain('送校')
        // 干净 feature 送校零违规——不记账
        expect(logs.some((l) => l.data_json.includes('clean-feature'))).toBe(false)
      } finally {
        wsDb.close()
      }
    } finally {
      dispose()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('disposer：调用后中央库已关——四域动词经 routing 解析即失败（句柄生命周期收口）', async () => {
    const { ctx, provided } = stubCtx()
    const tasksHome = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-m2-'))
    try {
      const dispose = corePlugin(ctx, { dbFile: dbPath(), tasksHome })
      const docs = provided.get('forgeDocs') as { read: (q: { projectId: string; docRel: string }) => Promise<unknown> }
      dispose()
      await expect(docs.read({ projectId: 'p1', docRel: 'a.md' })).rejects.toThrow()
    } finally {
      rmSync(tasksHome, { recursive: true, force: true })
    }
  })
})
