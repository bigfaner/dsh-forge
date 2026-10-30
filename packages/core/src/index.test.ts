// 任务 3.3 装配收口测试 —— index.ts（插件装配入口，原 service.ts——fix-35 与 knowledge=index.ts
// 对称化）注册 ctx.forgeKnowledge 双服务面完整（Interface 2 逐项对齐：七法齐全 + 3.5 browse
// 聚合法 + 装配后端到端冒烟——含 listEntries 静默重建路径）。
// 形态：CoreContextFace 结构化桩（provide 记账）+ registry 桩（知识域冒烟不经注册链路，
// projects 行经第二连接直插——注册链路归 forge 域 2.2 已测）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import type { KnowledgeService } from '@dsh-forge/contracts'
import type { WorkspaceRegistryPort, WorkspaceRenamePort } from './forge/registry.js'
import { StubRegistry } from './testutil/registry-stub.js'
import { seedProjectRow } from './testutil/db-seeds.js'
import corePlugin, { type CoreContextFace } from './index.js'
import { openDatabase } from './db/index.js'
import type Database from 'better-sqlite3'

const dirs: string[] = []
const dbs: Database.Database[] = []

afterAll(() => {
  for (const db of dbs) db.close()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** registry 桩（本测试不经注册链路——形状兼容即可；fix-34 收编 testutil 单份） */
function stubRegistry(): WorkspaceRegistryPort {
  return new StubRegistry()
}

/** rename 结构化桩（fix-24 ②——workspaceController 窄面形状兼容即可） */
function stubRename(): WorkspaceRenamePort {
  return { rename: async () => ({}) }
}

/** 起插件（provide 记账）→ 返回 { services, dispose } */
function startPlugin(home: string): { services: Map<string, unknown>; dispose: () => void } {
  const services = new Map<string, unknown>()
  const ctx: CoreContextFace = {
    workspaceRegistry: stubRegistry(),
    workspaceController: stubRename(),
    reflect: {
      provide(name: string, value?: unknown) {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  const dispose = corePlugin(ctx, { dbFile: join(home, 'state.db') })
  return { services, dispose }
}

// ── bug 4e25858a：project-sort 埋点生产接线（corePlugin 装配闭包桥 ctx 官方 diag/log
// 事件域结构缝 → createProjectService onDiag——core 不 import host）──

/** 起插件（diag 缝捕获变体：ctx.emit 记账 emit 行——官方 cordis 事件混入原型方法同名缝） */
function startPluginWithDiag(home: string): {
  services: Map<string, unknown>
  dispose: () => void
  diagEmits: Array<{ event: string; payload: Record<string, unknown> }>
} {
  const services = new Map<string, unknown>()
  const diagEmits: Array<{ event: string; payload: Record<string, unknown> }> = []
  const ctx: CoreContextFace = {
    workspaceRegistry: stubRegistry(),
    workspaceController: stubRename(),
    emit: (event, payload) => diagEmits.push({ event, payload: payload as Record<string, unknown> }),
    reflect: {
      provide(name: string, value?: unknown) {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  const dispose = corePlugin(ctx, { dbFile: join(home, 'state.db') })
  return { services, dispose, diagEmits }
}

/** projects 行种入（插件已建库——第二连接直插，冒烟测试同径） */
function seedTwoProjects(home: string): [string, string] {
  const conn = openDatabase(join(home, 'state.db'))
  dbs.push(conn)
  const p1 = randomUUID()
  const p2 = randomUUID()
  const now = new Date().toISOString()
  for (const id of [p1, p2]) {
    seedProjectRow(conn, { id, workspaceId: randomUUID(), wsPath: `C:\\ws-${id}`, createdAt: now })
  }
  return [p1, p2]
}

type ProjectsServiceFace = { updateProject(id: string, patch: { sortOrders: Record<string, number> }): Promise<unknown> }

it('生产装配接线：patch.sortOrders 成功（info）经 ctx.emit 落 diag/log 事件域（event=project-sort, process=child）', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const { services, dispose, diagEmits } = startPluginWithDiag(home)
  try {
    const [p1, p2] = seedTwoProjects(home)
    const projects = services.get('forgeProjects') as ProjectsServiceFace
    await projects.updateProject(p1, { sortOrders: { [p1]: 1, [p2]: 2 } })
    expect(diagEmits).toHaveLength(1)
    expect(diagEmits[0]!.event).toBe('diag/log')
    expect(diagEmits[0]!.payload).toMatchObject({
      level: 'info',
      process: 'child',
      event: 'project-sort',
      projectId: p1,
      projectCount: 2,
    })
  } finally {
    dispose()
  }
})

it('生产装配接线：写失败（触发器 ABORT）warn 同面 emit；diag 缝缺席（ctx.emit 未注入）零 emit 不抛', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const { services, dispose, diagEmits } = startPluginWithDiag(home)
  try {
    const [p1, p2] = seedTwoProjects(home)
    const triggerConn = openDatabase(join(home, 'state.db'))
    dbs.push(triggerConn)
    triggerConn.exec(
      `CREATE TRIGGER fail_sort_update BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT, 'inject sort failure'); END`,
    )
    const projects = services.get('forgeProjects') as ProjectsServiceFace
    await expect(projects.updateProject(p1, { sortOrders: { [p1]: 1, [p2]: 9 } })).rejects.toThrowError(/inject sort failure/)
    expect(diagEmits).toHaveLength(1)
    expect(diagEmits[0]!.payload).toMatchObject({ level: 'warn', process: 'child', event: 'project-sort', projectCount: 2 })
  } finally {
    dispose()
  }
  // 缝缺席（ctx.emit 未注入——bug 4e25858a 的生产形态）：排序写面照常、零 emit 不抛
  const home2 = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home2)
  const { services: services2, dispose: dispose2 } = startPlugin(home2)
  try {
    const [q1, q2] = seedTwoProjects(home2)
    const plain = services2.get('forgeProjects') as ProjectsServiceFace
    await expect(plain.updateProject(q1, { sortOrders: { [q1]: 1, [q2]: 2 } })).resolves.toBeDefined()
  } finally {
    dispose2()
  }
})

// ── bug 590b8eff：真 cordis Context 形态复现（同成因——Proxy get 陷阱对未声明属性即抛，
// 与 cordis lib ReflectService.handler.get 同型；diagEmit 虚构属性在此形态下装载即崩）──

/** 真 cordis 形态桩：已知键放行（含原型语义的 emit），未知属性访问按 cordis 陷阱抛错 */
function startPluginCordisLike(home: string): {
  services: Map<string, unknown>
  dispose: () => void
  diagEmits: Array<{ event: string; payload: Record<string, unknown> }>
} {
  const services = new Map<string, unknown>()
  const diagEmits: Array<{ event: string; payload: Record<string, unknown> }> = []
  const target: Record<string, unknown> = {
    workspaceRegistry: stubRegistry(),
    workspaceController: stubRename(),
    emit: (event: string, payload: unknown) => diagEmits.push({ event, payload: payload as Record<string, unknown> }),
    reflect: {
      provide(name: string, value?: unknown) {
        services.set(name, value)
        return () => services.delete(name)
      },
    },
  }
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string]
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  }) as CoreContextFace
  const dispose = corePlugin(ctx, { dbFile: join(home, 'state.db') })
  return { services, dispose, diagEmits }
}

it('bug 590b8eff：真 cordis Proxy 形态（未知属性即抛）下 corePlugin 装配不抛，project-sort 经 ctx.emit 桥出', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const { services, dispose, diagEmits } = startPluginCordisLike(home)
  try {
    const [p1, p2] = seedTwoProjects(home)
    const projects = services.get('forgeProjects') as ProjectsServiceFace
    await projects.updateProject(p1, { sortOrders: { [p1]: 1, [p2]: 2 } })
    expect(diagEmits).toHaveLength(1)
    expect(diagEmits[0]!.event).toBe('diag/log')
    expect(diagEmits[0]!.payload).toMatchObject({ level: 'info', process: 'child', event: 'project-sort' })
  } finally {
    dispose()
  }
})

it('ctx.forgeKnowledge 双服务面完整：Interface 2 七法 + 3.5 browse 聚合法（八法精确）', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const { services, dispose } = startPlugin(home)
  try {
    expect([...services.keys()].sort()).toEqual(['forgeKnowledge', 'forgeProjects']) // 双服务面
    const knowledge = services.get('forgeKnowledge') as KnowledgeService
    expect(Object.keys(knowledge).sort()).toEqual([
      'browse', 'getEntryDetail', 'heatByEntry', 'listEntries', 'readAbstract',
      'rebuildIndex', 'search', 'sessionRecall',
    ])
  } finally {
    dispose()
  }
})

it('装配后端到端冒烟：forgeKnowledge.listEntries 经静默重建返回卡片（真实 SQLite + 知识目录）', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-forge-svc-'))
  dirs.push(home)
  const knowledgeDir = join(home, 'knowledge')
  mkdirSync(knowledgeDir)
  writeFileSync(join(knowledgeDir, '索引.md'), '---\nsummary: 冒烟摘要\nkeywords: [smoke]\n---\n冒烟正文', 'utf8')

  const { services, dispose } = startPlugin(home)
  try {
    // 插件已建库——第二连接直插 projects 行（WAL 多连接可见；seed 经 testutil/db-seeds 单源）
    const conn = openDatabase(join(home, 'state.db'))
    dbs.push(conn)
    const projectId = randomUUID()
    const now = new Date().toISOString()
    seedProjectRow(conn, {
      id: projectId,
      workspaceId: randomUUID(),
      wsPath: 'C:\\smoke-ws',
      name: '冒烟项目',
      forgeDir: join(home, '.forge'),
      knowledgeDir,
      createdAt: now,
      updatedAt: now,
    })

    const knowledge = services.get('forgeKnowledge') as KnowledgeService
    const cards = await knowledge.listEntries({ projectId }) // 零行索引 → 静默重建路径
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ title: '索引', summary: '冒烟摘要', keywords: ['smoke'], domainPath: '', heat: 0 })
    const detail = await knowledge.getEntryDetail({ projectId, entryId: cards[0]!.entryId })
    expect(detail.body).toBe('冒烟正文')
  } finally {
    dispose()
  }
})
