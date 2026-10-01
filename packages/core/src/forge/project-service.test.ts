// 任务 2.2 测试 —— registerProject 四步补偿链（AC1–AC6）：vitest + 临时 SQLite + registry 桩。
// 桩语义按 G1 pin 第 4 项（上游 dsh-workspace 源码核实）：create 幂等（同 canonical path 返回
// 既有实体）、delete 保目录保日志且未知 id 幂等 no-op（false）、list 同步投影。
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { createProjectService, type ProjectServiceDeps } from './project-service.js'
import type { WorkspaceLike, WorkspaceRegistryPort } from './registry.js'

// ── registry 桩（G1 pin 4 语义的结构化复刻；不触盘——canonical 化用 path.resolve 替身） ──

class StubRegistry implements WorkspaceRegistryPort {
  readonly records = new Map<string, WorkspaceLike>()
  /** dsh 侧目录与日志（delete 语义=保目录保日志：本桩 delete 不触碰） */
  readonly dirs = new Set<string>()
  readonly createCalls: string[] = []
  readonly deleteCalls: string[] = []
  failCreate?: Error
  failDelete?: Error
  /** delete 执行前钩子（模拟「补偿删除时工作区已被并发清理」→ delete 返回 false） */
  beforeDelete?: (id: string) => void

  seed(path: string, id = randomUUID()): WorkspaceLike {
    const ws = { id, path: resolve(path) }
    this.records.set(id, ws)
    this.dirs.add(ws.path)
    return ws
  }

  get(id: string): WorkspaceLike | undefined {
    return this.records.get(id) // 未知 id → undefined（上游 get 语义，2.3 对账消费）
  }

  list(): WorkspaceLike[] {
    return [...this.records.values()]
  }

  async create(path: string): Promise<WorkspaceLike> {
    this.createCalls.push(path)
    if (this.failCreate) throw this.failCreate
    const canonical = resolve(path)
    const existing = this.list().find((ws) => ws.path === canonical)
    if (existing) return existing // 幂等：同 canonical path 返回既有实体
    const ws = { id: randomUUID(), path: canonical }
    this.records.set(ws.id, ws)
    this.dirs.add(canonical)
    return ws
  }

  async delete(id: string): Promise<boolean> {
    this.deleteCalls.push(id)
    this.beforeDelete?.(id)
    if (this.failDelete) throw this.failDelete
    return this.records.delete(id) // 未知 id → false（幂等 no-op）；目录与日志保留
  }
}

// ── 测试环境（每用例独占临时库，2.1 口径） ──

const WS = 'C:\\dsh-forge-test-ws'
let dir: string
let seq = 0
const dbs: Database.Database[] = []
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-reg-'))), `state-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  for (const db of dbs) db.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

interface ProjectRow {
  id: string
  workspace_id: string
  ws_path: string
  name: string
  forge_dir: string
  forge_dir_external: number
  knowledge_dir: string
  archived: number
  created_at: string
  updated_at: string
}

function setup() {
  const db = openDatabase(dbPath())
  dbs.push(db)
  const registry = new StubRegistry()
  const service = createProjectService({ db, registry } satisfies ProjectServiceDeps)
  return { db, registry, service }
}

const readRows = (db: Database.Database): ProjectRow[] =>
  db.prepare<unknown[], ProjectRow>(`SELECT * FROM projects`).all()

const keyLogs = (db: Database.Database): { level: string; scope: string; message: string; data_json: string | null }[] =>
  db.prepare<unknown[], { level: string; scope: string; message: string; data_json: string | null }>(
    `SELECT level, scope, message, data_json FROM app_key_logs ORDER BY id`,
  ).all()

/** 种入陈旧 projects 行（直接 SQL，模拟 ③ 唯一冲突的失败注入面） */
function seedRow(db: Database.Database, o: { id: string; workspaceId: string; wsPath: string }) {
  db.prepare(
    `INSERT INTO projects (id, workspace_id, ws_path, name, forge_dir, knowledge_dir, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(o.id, o.workspaceId, o.wsPath, o.id, `${o.wsPath}\\.forge`, `${o.wsPath}\\.knowledge`, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
}

const input = (o: { workspaceDir?: string; forgeDir?: string } = {}) => ({
  workspaceDir: o.workspaceDir ?? join(WS, 'proj'),
  name: 'proj',
  forgeDir: o.forgeDir ?? join(WS, 'proj', '.forge'),
  knowledgeDir: join(WS, 'proj', '.knowledge'),
})

const ISO = (s: string) => !Number.isNaN(Date.parse(s))

// ── AC1 新建路径全链成功 ──

describe('AC1 新建路径全链成功：create + 行落库 + attachedToExisting=false', () => {
  it('①未命中 → ②create → ③行落库：字段齐备、ws_path=canonical、仓内 external=0', async () => {
    const { db, registry, service } = setup()
    const result = await service.registerProject(input())
    expect(registry.createCalls).toEqual([input().workspaceDir])
    expect(result.attachedToExisting).toBe(false)
    expect(result.workspaceId).toBe(registry.list()[0]?.id)
    expect(result.projectId).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    const row = readRows(db)[0]
    expect(row).toBeDefined()
    expect(row).toMatchObject({
      id: result.projectId,
      workspace_id: result.workspaceId,
      ws_path: resolve(join(WS, 'proj')),
      name: 'proj',
      forge_dir: join(WS, 'proj', '.forge'),
      forge_dir_external: 0,
      knowledge_dir: join(WS, 'proj', '.knowledge'),
      archived: 0,
    })
    expect(ISO(row.created_at)).toBe(true)
    expect(ISO(row.updated_at)).toBe(true)
  })

  it('非规范拼写传入 → 落库 ws_path 以 registry 返回的 canonical 为准（非用户拼写原样）', async () => {
    const { db, service } = setup()
    const messy = join(WS, 'proj', '..', 'proj') + '\\'
    const result = await service.registerProject(input({ workspaceDir: messy }))
    const row = readRows(db)[0]
    expect(row?.ws_path).toBe(resolve(join(WS, 'proj')))
    expect(row?.ws_path).not.toBe(messy)
    expect(result.workspaceId).toBeTruthy()
  })

  it('forge 目录位于工作区外 → forge_dir_external=1（路径关系自动推导）', async () => {
    const { db, service } = setup()
    await service.registerProject(input({ forgeDir: 'D:\\elsewhere\\forge' }))
    expect(readRows(db)[0]?.forge_dir_external).toBe(1)
  })
})

// ── AC2 幂等命中 → 挂接不登记补偿（ownership 保护） ──

describe('AC2 幂等命中（canonical 命中既有）→ 挂接不登记补偿', () => {
  it('命中既有 → ②create 不执行，attachedToExisting=true，行挂既有 workspace_id', async () => {
    const { db, registry, service } = setup()
    const existing = registry.seed(join(WS, 'proj'))
    const result = await service.registerProject(input())
    expect(registry.createCalls).toEqual([])
    expect(result.attachedToExisting).toBe(true)
    expect(result.workspaceId).toBe(existing.id)
    const row = readRows(db)[0]
    expect(row?.workspace_id).toBe(existing.id)
    expect(row?.ws_path).toBe(existing.path)
  })

  it('canonical 等价拼写（.. 回折）仍命中挂接', async () => {
    const { registry, service } = setup()
    const existing = registry.seed(join(WS, 'proj'))
    const result = await service.registerProject(input({ workspaceDir: join(WS, 'proj', '..', 'proj') }))
    expect(result.attachedToExisting).toBe(true)
    expect(registry.createCalls).toEqual([])
    expect(result.workspaceId).toBe(existing.id)
  })

  it('挂接后 ③ 写入失败 → 不删既有工作区（ownership 保护：delete 零调用、零记账）', async () => {
    const { db, registry, service } = setup()
    const existing = registry.seed(join(WS, 'proj'))
    seedRow(db, { id: 'stale', workspaceId: existing.id, wsPath: 'C:\\other' }) // workspace_id UNIQUE 冲突 → ③ 失败
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    expect((err as ProjectWriteError).code).toBe('ERR_PROJECT_WRITE')
    expect((err as ProjectWriteError).data.compensated).toBeUndefined()
    expect(registry.deleteCalls).toEqual([]) // 既有工作区绝不被补偿删除
    expect(registry.records.has(existing.id)).toBe(true)
    expect(keyLogs(db)).toEqual([])
  })
})

// ── AC3 ③ 写入失败 → ④ 补偿删除 ──

describe('AC3 ③ 写入失败（模拟）→ ④ 补偿删除，dsh 零孤儿、目录日志保留', () => {
  it('新建路径 ③ 失败（ws_path UNIQUE 冲突）→ delete 补偿一次 + ProjectWriteError(compensated)', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    seedRow(db, { id: 'stale', workspaceId: 'ws-stale', wsPath: canonical }) // 陈旧引用占位 → ③ 失败
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    const pwe = err as ProjectWriteError
    expect(pwe.code).toBe('ERR_PROJECT_WRITE')
    expect(pwe.data.compensated).toEqual({
      workspaceId: expect.any(String) as string,
      reason: expect.stringContaining('写入失败') as string,
    })
    // ④ 补偿：本次新建工作区被删一次（registry 记录清空 = dsh 侧零孤儿）
    expect(registry.deleteCalls).toEqual([pwe.data.compensated?.workspaceId])
    expect(registry.list()).toEqual([])
    // 保目录保日志（G1 pin 4：delete 不触碰目录）——桩 dirs 模拟 dsh 侧目录留存
    expect(registry.dirs.has(canonical)).toBe(true)
    // 应用库零新增行（仅陈旧占位行）+ 补偿成功不记关键日志（成功路径不记流水）
    expect(readRows(db)).toHaveLength(1)
    expect(keyLogs(db)).toEqual([])
  })
})

// ── AC4 补偿幂等：重复 registry.delete 为 no-op ──

describe('AC4 补偿幂等（重复 registry.delete 为 no-op）', () => {
  it('桩语义 pin：未知 id delete → false 且不抛（G1 pin 4）', async () => {
    const registry = new StubRegistry()
    await expect(registry.delete('unknown-id')).resolves.toBe(false)
    await expect(registry.delete('unknown-id')).resolves.toBe(false) // 重复 delete 仍 no-op
  })

  it('补偿删除返回 false（工作区已被清理）→ 仍视为补偿成功，不抛 ERR_COMPENSATION', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    seedRow(db, { id: 'stale', workspaceId: 'ws-stale', wsPath: canonical })
    registry.beforeDelete = (id) => registry.records.delete(id) // 并发清理在前 → 本次 delete 返回 false
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError) // 而非 CompensationError
    expect((err as ProjectWriteError).data.compensated).toBeDefined()
    expect(registry.deleteCalls).toHaveLength(1)
    expect(keyLogs(db)).toEqual([]) // no-op 补偿非失败事件，不记账
  })
})

// ── AC5 补偿失败 → app_key_logs 记账 + ERR_COMPENSATION ──

describe('AC5 补偿失败 → app_key_logs 记账（scope=compensation）+ 抛 ERR_COMPENSATION', () => {
  it('delete 抛错 → 单事件单条记账（结果入 data_json）+ CompensationError，孤儿留存不自动删', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    seedRow(db, { id: 'stale', workspaceId: 'ws-stale', wsPath: canonical })
    registry.failDelete = new Error('dsh storage down')
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(CompensationError)
    expect((err as CompensationError).code).toBe('ERR_COMPENSATION')
    // 单事件单条：仅补偿失败一条（③ 失败原因并入同条 data_json，不另记）
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'error', scope: 'compensation' })
    const data = JSON.parse(logs[0]?.data_json ?? '{}') as Record<string, unknown>
    expect(data.workspaceId).toBe((err as CompensationError).data.workspaceId)
    expect(data.wsPath).toBe(canonical)
    expect(data.writeError).toBeTruthy() // 触发原因（③ 写入失败）
    expect(data.deleteError).toBe('dsh storage down')
    expect(String(data.disposition)).toContain('不自动删') // 处置结果并入同条
    // 孤儿留存（dsh 侧记录未删，交启动对账提示）
    expect(registry.records.size).toBe(1)
    expect(readRows(db)).toHaveLength(1) // 仅陈旧占位行
  })
})

// ── AC6 registry.create 失败 → ERR_WORKSPACE_CREATE 中止 ──

describe('AC6 registry.create 失败 → ERR_WORKSPACE_CREATE 中止，无补偿需要', () => {
  it('create 抛错 → 中止：无 delete、无落库、无记账', async () => {
    const { db, registry, service } = setup()
    registry.failCreate = new Error('ENOTDIR: not a directory')
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(WorkspaceCreateError)
    expect((err as WorkspaceCreateError).code).toBe('ERR_WORKSPACE_CREATE')
    expect((err as WorkspaceCreateError).data.wsPath).toBe(input().workspaceDir)
    expect(registry.deleteCalls).toEqual([]) // 无补偿需要
    expect(readRows(db)).toEqual([]) // 无落库
    expect(keyLogs(db)).toEqual([]) // 无记账
  })
})
