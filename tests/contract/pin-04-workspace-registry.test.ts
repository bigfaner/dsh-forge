// G1 pin ④：`ctx.workspaceRegistry` API（create 幂等 / delete 保目录保日志 / get / list 语义）。
// 权威：tech-design Appendix 契约面清单第 4 项 + tech-research §1.7（写入面源码核实）+
// S4 spike 判定（同 canonical path 两次 create() 返回同一实体）。上游面（0.2.0-rc.2，
// dsh-workspace lib/types/index.d.ts + lib/index.js 运行期导出）：
//   - create(path, title?)：canonicalize（realpath，须存在且为目录）→ 建/复用注册；同 canonical
//     path 幂等返回既有实体不改标题；返回值不区分新建与命中（ownership 判定归调用方预检）
//   - delete(id)：删注册记录，保留目录与全部会话日志；unknown id 幂等 no-op（false）
//   - get(id)：未知 → undefined；list()：durable 序同步投影，无持久化读
//   - 无按路径查询 → ownership 预检 = list() 后按 canonical path 匹配（补偿链 ① 的依据）
// 实现注记（Implementation Notes）：registry 语义 pin 用集成桩验证幂等/删除保目录行为
// （S4 结论作对照）——真 registry 需 cordis + storage 全栈（超公开面范围），故以 S4 语义
// 可执行桩驱动本仓真实 registerProject 链做集成自证。我方镜像：core forge registry.ts。
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../../packages/core/src/db/index.js'
import { createProjectService, type ProjectServiceDeps } from '../../packages/core/src/forge/project-service.js'
import type { WorkspaceLike, WorkspaceRegistryPort } from '../../packages/core/src/forge/registry.js'
import { expectPinnedVersion, importUpstream, readTypes } from './pins.js'

describe('pin ④-1 版本锚', () => {
  it('dsh-workspace（host 锚）= 精确 pin 版本', () => {
    expectPinnedVersion('host', '@deepseek-ai/dsh-workspace')
  })
})

describe('pin ④-2 运行期类面（lib/index.js 导出的公开类）', () => {
  it('WorkspaceRegistry 导出为类（cordis Service 子类面——可 new 构造形状）', async () => {
    const mod = await importUpstream('host', '@deepseek-ai/dsh-workspace')
    const Ctor = mod['WorkspaceRegistry'] as unknown as { prototype: object }
    expect(typeof mod['WorkspaceRegistry']).toBe('function')
    expect(Ctor.prototype).toBeDefined()
    expect(typeof Ctor.prototype.constructor).toBe('function')
  })

  it('static inject = [storageDomain, sessionPersistence]（启动等待面）', async () => {
    const mod = await importUpstream('host', '@deepseek-ai/dsh-workspace')
    const Ctor = mod['WorkspaceRegistry'] as { inject: readonly string[] }
    expect([...Ctor.inject]).toEqual(['storageDomain', 'sessionPersistence'])
  })

  it('消费面四法原型在场且参数数吻合：create(path, title?)/get(id)/list()/delete(id)', async () => {
    const mod = await importUpstream('host', '@deepseek-ai/dsh-workspace')
    const proto = (mod['WorkspaceRegistry'] as { prototype: Record<string, unknown> }).prototype
    const arity = (name: string) => (proto[name] as (...args: unknown[]) => unknown).length
    expect(typeof proto['create']).toBe('function')
    expect(arity('create')).toBe(2)
    expect(typeof proto['get']).toBe('function')
    expect(arity('get')).toBe(1)
    expect(typeof proto['list']).toBe('function')
    expect(arity('list')).toBe(0)
    expect(typeof proto['delete']).toBe('function')
    expect(arity('delete')).toBe(1)
  })
})

describe('pin ④-3 语义锚（上游 d.ts 文档化语义——补偿链设计的契约依据）', () => {
  const types = readTypes('host', '@deepseek-ai/dsh-workspace', 'lib/types/index.d.ts')

  it('服务挂载面：Context 增强声明 workspaceRegistry: WorkspaceRegistry', () => {
    expect(types).toContain('workspaceRegistry: WorkspaceRegistry')
  })

  it('create 幂等：同 canonical path 返回既有实体且不改标题（S4 判定原文）', () => {
    expect(types).toContain('Repeated calls for the same canonical path return the existing entity without changing its title')
  })

  it('create 返回值不区分新建/命中（ownership 判定归调用方预检——补偿链 ① list() 预检依据）', () => {
    expect(types).toContain('the existing or newly durable workspace')
    expect(types).toContain('Different canonical paths may share a display title')
  })

  it('delete 保目录保日志 + 未知 id 幂等 no-op（false）——补偿 ④ 的安全依据', () => {
    expect(types).toContain('Delete one workspace registration while retaining its directory and every session log')
    expect(types).toContain('Unknown ids are an idempotent no-op for domain callers')
  })

  it('get 未知 → undefined；list = durable 序同步投影无持久化读', () => {
    expect(types).toContain('the workspace, or `undefined` when unknown')
    expect(types).toContain('Synchronous workspace projection in durable registry order')
  })
})

// ── S4 语义可执行桩（幂等/保目录/保日志四事实的结构化复刻；core 2.2 同款语义） ──

class S4SemanticsRegistry implements WorkspaceRegistryPort {
  private readonly records = new Map<string, WorkspaceLike>()
  /** dsh 侧目录与会话日志（delete 语义 = 只删注册记录，两者保留） */
  readonly retainedDirs = new Set<string>()
  readonly createCalls: string[] = []
  readonly deleteCalls: string[] = []

  get(id: string): WorkspaceLike | undefined {
    return this.records.get(id)
  }

  list(): WorkspaceLike[] {
    return [...this.records.values()]
  }

  async create(path: string, title?: string): Promise<WorkspaceLike> {
    this.createCalls.push(title === undefined ? path : `${path}|${title}`)
    const canonical = resolve(path)
    const existing = this.list().find((ws) => ws.path === canonical)
    if (existing) return existing // 幂等：同 canonical path 返回既有实体（标题不变）
    const ws = { id: randomUUID(), path: canonical }
    this.records.set(ws.id, ws)
    this.retainedDirs.add(canonical)
    return ws
  }

  async delete(id: string): Promise<boolean> {
    this.deleteCalls.push(id)
    const removed = this.records.get(id)
    if (removed === undefined) return false // 未知 id 幂等 no-op
    this.records.delete(id)
    return true // 目录（retainedDirs）与会话日志不触碰——保目录保日志
  }
}

describe('pin ④-4 集成桩自证（S4 结论作对照：桩 = 上游语义的可执行规格）', () => {
  it('S4 判定：同 canonical path 两次 create() 返回同一实体（幂等）', async () => {
    const registry = new S4SemanticsRegistry()
    const a = await registry.create('C:\\dsh-pin-ws')
    const b = await registry.create('C:\\dsh-pin-ws')
    expect(b).toBe(a) // 同一实体（===）
    expect(registry.list()).toHaveLength(1)
  })

  it('delete 保目录保日志（只删注册记录）；未知 id 幂等 no-op 返回 false', async () => {
    const registry = new S4SemanticsRegistry()
    const ws = await registry.create('C:\\dsh-pin-ws')
    await expect(registry.delete(randomUUID())).resolves.toBe(false)
    await expect(registry.delete(ws.id)).resolves.toBe(true)
    expect(registry.list().find((x) => x.id === ws.id)).toBeUndefined()
    expect(registry.retainedDirs.has(resolve('C:\\dsh-pin-ws'))).toBe(true) // 目录保留
    await expect(registry.delete(ws.id)).resolves.toBe(false) // 重复补偿调用幂等
  })

  it('get 未知 → undefined（对账逐项校验消费）', () => {
    expect(new S4SemanticsRegistry().get(randomUUID())).toBeUndefined()
  })
})

// ── 集成：S4 语义桩驱动本仓真实 registerProject 链（补偿链对上游语义的依赖面） ──

describe('pin ④-5 集成（真实 registerProject × S4 语义桩 + 临时 SQLite）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-pin04-'))
  const dbs: Database.Database[] = []
  afterAll(() => {
    for (const db of dbs) db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function setup() {
    const db = openDatabase(join(dir, `state-${dbs.length}.db`))
    dbs.push(db)
    const registry = new S4SemanticsRegistry()
    // fix-33 ⑩：rename 桩补齐（fix-24 后 ProjectServiceDeps 必填——本面不断言 rename 形状）
    const service = createProjectService({ db, registry, rename: { rename: async () => ({}) } } satisfies ProjectServiceDeps)
    return { db, registry, service }
  }

  // fix-39：注册链目录自愈（② 前 mkdir 三目录）落地后，本集成组的 create 分支用例会真实
  // 建目录——WS 迁本组临时根（原 C: 常量路径会污染用户盘；afterAll 随 dir 统一清理）
  const WS = join(dir, 'ws')

  it('预检命中 → 挂接既有：不重复 create、不登记补偿（ownership 归调用方预检）', async () => {
    const { registry, service } = setup()
    const seeded = await registry.create(WS)
    const result = await service.registerProject({
      workspaceDir: WS,
      name: 'p1',
      forgeDir: join(WS, 'docs'),
      knowledgeDir: join(WS, 'know'),
    })
    expect(result.attachedToExisting).toBe(true)
    expect(result.workspaceId).toBe(seeded.id)
    expect(registry.createCalls).toHaveLength(1) // 仅桩自证那一次；链路 ① 预检命中未再 create
  })

  it('③ 写入失败 → ④ delete 补偿：dsh 侧零孤儿且目录保留（S4 语义下补偿成立）', async () => {
    const { db, registry, service } = setup()
    // fix-27 后注入载体改 INSERT ABORT 触发器（ws_path 冲突行已被自愈面消费——重注册
    // 幂等成功；core 2.2 测试同款 failProjectInserts 注入面）
    db.exec(
      `CREATE TRIGGER fail_projects_insert BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'simulated projects write failure'); END`,
    )
    await expect(
      service.registerProject({
        workspaceDir: WS,
        name: 'p1',
        forgeDir: join(WS, 'docs'),
        knowledgeDir: join(WS, 'know'),
      }),
    ).rejects.toThrow(/写入失败|补偿/)
    // 补偿后：注册记录已删（list 无该 path）但目录保留（保目录保日志）
    expect(registry.list().find((ws) => ws.path === WS)).toBeUndefined()
    expect(registry.retainedDirs.has(WS)).toBe(true)
    expect(registry.deleteCalls).toHaveLength(1)
  })
})
