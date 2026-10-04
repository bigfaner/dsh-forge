// 任务 2.3 测试 —— 启动对账 reconcileAtStartup（tech-design §交互三）+ 项目查询面（§Interface 1）：
// vitest + 临时 SQLite + registry 桩（2.2 同型；get 语义 = 上游 WorkspaceRegistry.get——同步查表、
// 未知 id → undefined，node_modules @deepseek-ai/dsh-workspace 类型核实）。
// 记账口径（§交互三 + ER APP_KEY_LOGS 记名域②）：ws_path 失配找回（warn，结果入 data_json）与
// 孤儿发现（warn，全部孤儿并入同条）记账；幂等重建成功不记（成功路径一律不记）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { createProjectService, type ProjectServiceDeps } from './project-service.js'
// registry 桩（G1 pin 4 语义 + get 同步查表）——fix-34 收编 testutil 单份（注入面 superset）；
// readRows/keyLogs 行读取——fix-35 收编 testutil 单份（与 project-service 同源）；
// seedRow——fix-37 收编 db-seeds 单源（SEED_TS = 本处 T0 断言基准同值）。
import { StubRegistry } from '../testutil/registry-stub.js'
import { keyLogs, readRows } from '../testutil/project-rows.js'
import { SEED_TS, seedProjectRow } from '../testutil/db-seeds.js'

// ── 测试环境（每用例独占临时库，2.2 口径） ──

const WS = 'C:\\dsh-forge-rc'
const T0 = SEED_TS // 固定种入时间——updated_at 断言基准

let dir: string
let seq = 0
const dbs: Database.Database[] = []
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-rc-'))), `state-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  for (const db of dbs) {
    try {
      db.close()
    } catch {
      // 用例内已关（库不可用降级用例）——幂等收尾
    }
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const db = openDatabase(dbPath())
  dbs.push(db)
  const registry = new StubRegistry()
  // fix-33 ⑩ rename 桩补齐（fix-24 后 ProjectServiceDeps 必填——本面不断言 rename 调用形状，
  // 形状断言归 project-service.test；TS2741 由测试类型门拦截不再漏网）
  const service = createProjectService({ db, registry, rename: { rename: async () => ({}) } } satisfies ProjectServiceDeps)
  return { db, registry, service }
}

const logData = (db: Database.Database, i: number): Record<string, unknown> =>
  JSON.parse(keyLogs(db)[i]?.data_json ?? '{}') as Record<string, unknown>

/** 种入 projects 行：经 testutil/db-seeds 单源（fix-37——与 project-service/e2e 同源） */

// ── AC1 ws_path 失配 → 按 path 找回，单向修引用 + 记账（结果入 data_json） ──

describe('AC1 ws_path 失配 → 按 ws_path 找回，单向修 workspace_id 引用 + app_key_logs 记账', () => {
  it('引用失联（registry 无此 id）→ list() 按 ws_path 命中既有 → 引用单向修正 + 单条 warn 记账（结果入 data_json）', async () => {
    const { db, registry, service } = setup()
    const ws = registry.seed(join(WS, 'a')) // dsh 侧既有（新实体）
    seedProjectRow(db, { id: 'p-1', workspaceId: 'ws-gone', wsPath: ws.path }) // 应用侧陈旧引用

    const report = await service.reconcileAtStartup()

    expect(report.repaired).toEqual([{ projectId: 'p-1', workspaceId: ws.id, action: 'relinked' }])
    expect(report.orphans).toEqual([])
    expect(readRows(db)[0]?.workspace_id).toBe(ws.id) // 引用已修
    expect((readRows(db)[0]?.updated_at ?? '') > T0).toBe(true) // 修引用即行更新
    // 单向修引用：dsh 侧零改动（无 delete、实体原样）
    expect(registry.deleteCalls).toEqual([])
    expect(registry.records.get(ws.id)?.path).toBe(ws.path)
    expect(registry.createCalls).toEqual([]) // 找回路径不走 create
    // 记账：单事件单条 warn/reconcile，old→new 与处置结果入 data_json
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'reconcile' })
    expect(logData(db, 0)).toMatchObject({
      projectId: 'p-1',
      wsPath: ws.path,
      oldWorkspaceId: 'ws-gone',
      workspaceId: ws.id,
      action: 'relinked',
    })
    expect(String(logData(db, 0).disposition)).toContain('单向')
  })

  it('get 命中但 path 失配（dsh 实体重指它径）→ 找回修引用；旧工作区留存 dsh → 同轮孤儿反查只提示不删', async () => {
    const { db, registry, service } = setup()
    const oldWs = registry.seed(join(WS, 'b-elsewhere'), '11111111-1111-4111-8111-111111111111') // 被引用实体已重指它径（uuid 形状——WorkspaceLike.id 模板字面量型）
    const newWs = registry.seed(join(WS, 'b'), '22222222-2222-4222-8222-222222222222') // ws_path 现属实体
    seedProjectRow(db, { id: 'p-2', workspaceId: '11111111-1111-4111-8111-111111111111', wsPath: newWs.path })

    const report = await service.reconcileAtStartup()

    expect(report.repaired).toEqual([{ projectId: 'p-2', workspaceId: '22222222-2222-4222-8222-222222222222', action: 'relinked' }])
    expect(readRows(db)[0]?.workspace_id).toBe('22222222-2222-4222-8222-222222222222')
    expect(report.orphans).toEqual([{ workspaceId: '11111111-1111-4111-8111-111111111111', wsPath: oldWs.path }]) // 旧引用留存 → 只提示
    expect(registry.deleteCalls).toEqual([]) // 绝不自动删
    expect(registry.records.has('11111111-1111-4111-8111-111111111111')).toBe(true)
    // 记账：失配找回 1 条 + 孤儿发现 1 条（各单事件单条）
    const logs = keyLogs(db)
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.level === 'warn' && l.scope === 'reconcile')).toBe(true)
  })

  it('path 匹配 → 通过：零修复、零记账、零 create/delete 副作用', async () => {
    const { db, registry, service } = setup()
    const ws = registry.seed(join(WS, 'c'))
    seedProjectRow(db, { id: 'p-3', workspaceId: ws.id, wsPath: ws.path })

    const report = await service.reconcileAtStartup()

    expect(report).toEqual({ repaired: [], orphans: [] })
    expect(registry.createCalls).toEqual([])
    expect(registry.deleteCalls).toEqual([])
    expect(keyLogs(db)).toEqual([]) // 成功路径一律不记
  })
})

// ── AC2 找不回 → create(ws_path) 幂等重建修引用 ──

describe('AC2 找不回 → create(ws_path) 幂等重建并修引用', () => {
  it('registry 无此路径 → create(ws_path) 一次 + 新 id 修引用 + action=recreated（成功重建不记账）', async () => {
    const { db, registry, service } = setup()
    const p = resolve(join(WS, 'd'))
    seedProjectRow(db, { id: 'p-4', workspaceId: 'ws-vanished', wsPath: p })

    const report = await service.reconcileAtStartup()

    expect(registry.createCalls).toEqual([p])
    expect(report.repaired).toEqual([
      { projectId: 'p-4', workspaceId: expect.any(String) as string, action: 'recreated' },
    ])
    const repairedTo = report.repaired[0]?.workspaceId
    expect(registry.records.get(repairedTo ?? '')?.path).toBe(p) // dsh 侧新实体落位
    expect(readRows(db)[0]?.workspace_id).toBe(repairedTo) // 引用已修
    expect(report.orphans).toEqual([])
    expect(keyLogs(db)).toEqual([]) // 交互三：记账仅失配找回与孤儿发现——重建成功不记
  })
})

// ── AC3 孤儿发现（dsh 有、应用无）→ 提示数据齐备，不自动删 ──

describe('AC3 孤儿发现（dsh 有、应用无）→ ReconcileReport 提示数据齐备，不自动删', () => {
  it('未引用工作区入 orphans（workspaceId + wsPath）+ 单条 warn 记账；绝不 delete', async () => {
    const { db, registry, service } = setup()
    const ref = registry.seed(join(WS, 'e1'))
    const orphan = registry.seed(join(WS, 'e2'))
    seedProjectRow(db, { id: 'p-5', workspaceId: ref.id, wsPath: ref.path })

    const report = await service.reconcileAtStartup()

    expect(report.repaired).toEqual([])
    expect(report.orphans).toEqual([{ workspaceId: orphan.id, wsPath: orphan.path }])
    expect(registry.deleteCalls).toEqual([]) // 只提示不自动删
    expect(registry.records.size).toBe(2) // dsh 侧原样
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1) // 单事件单条：全部孤儿并入同条
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'reconcile' })
    expect(logData(db, 0).orphans).toEqual([{ workspaceId: orphan.id, wsPath: orphan.path }])
  })

  it('无孤儿 → 零记账（成功路径不记流水）', async () => {
    const { db, registry, service } = setup()
    const ws = registry.seed(join(WS, 'f'))
    seedProjectRow(db, { id: 'p-6', workspaceId: ws.id, wsPath: ws.path })
    const report = await service.reconcileAtStartup()
    expect(report.orphans).toEqual([])
    expect(keyLogs(db)).toEqual([])
  })
})

// ── AC4 查询面与 Interface 1 一致 ──

describe('AC4 查询面：list/get/update 与 Interface 1 一致（archived 过滤口径、patch 仅 name/archived）', () => {
  it('listProjects → 摘要行（id/workspaceId/name/wsPath/archived），archived 态随行供过滤，含归档行', async () => {
    const { db, registry, service } = setup()
    const a = registry.seed(join(WS, 'qa'))
    const b = registry.seed(join(WS, 'qb'))
    seedProjectRow(db, { id: 'pa', workspaceId: a.id, wsPath: a.path, name: 'alpha' })
    seedProjectRow(db, { id: 'pb', workspaceId: b.id, wsPath: b.path, name: 'beta', archived: 1 })

    const list = await service.listProjects()

    expect(list).toEqual([
      { id: 'pa', workspaceId: a.id, name: 'alpha', wsPath: a.path, archived: false },
      { id: 'pb', workspaceId: b.id, name: 'beta', wsPath: b.path, archived: true },
    ])
  })

  it('listProjects 空库 → 空数组', async () => {
    const { service } = setup()
    await expect(service.listProjects()).resolves.toEqual([])
  })

  it('getProject → 全字段 Project（INTEGER→boolean、ISO 时间原样）；未知 id → null', async () => {
    const { db, registry, service } = setup()
    const a = registry.seed(join(WS, 'qc'))
    seedProjectRow(db, { id: 'pa', workspaceId: a.id, wsPath: a.path, name: 'alpha' })

    await expect(service.getProject('pa')).resolves.toEqual({
      id: 'pa',
      workspaceId: a.id,
      wsPath: a.path,
      name: 'alpha',
      forgeDir: resolve(a.path, '.forge'),
      forgeDirExternal: false,
      knowledgeDir: resolve(a.path, '.knowledge'),
      archived: false,
      createdAt: T0,
      updatedAt: T0,
    })
    await expect(service.getProject('nope')).resolves.toBeNull()
  })

  it('updateProject patch name → 仅 name 与 updated_at 变（其余字段原样），返回体 = 更新后行', async () => {
    const { db, registry, service } = setup()
    const a = registry.seed(join(WS, 'qd'))
    seedProjectRow(db, { id: 'pa', workspaceId: a.id, wsPath: a.path, name: 'alpha' })

    const updated = await service.updateProject('pa', { name: 'renamed' })

    expect(updated.name).toBe('renamed')
    expect(updated.archived).toBe(false)
    expect(updated.wsPath).toBe(a.path)
    expect(updated.forgeDir).toBe(resolve(a.path, '.forge'))
    expect(updated.knowledgeDir).toBe(resolve(a.path, '.knowledge'))
    expect(updated.updatedAt > T0).toBe(true)
    expect(updated.createdAt).toBe(T0) // 创建时间不动
  })

  it('updateProject patch archived → 翻转并经 listProjects 可见（过滤口径数据源同源）', async () => {
    const { db, registry, service } = setup()
    const a = registry.seed(join(WS, 'qe'))
    seedProjectRow(db, { id: 'pa', workspaceId: a.id, wsPath: a.path, name: 'alpha' })

    expect((await service.updateProject('pa', { archived: true })).archived).toBe(true)
    expect((await service.listProjects()).find((s) => s.id === 'pa')?.archived).toBe(true)
    expect((await service.updateProject('pa', { archived: false })).archived).toBe(false)
  })

  it('updateProject 空 patch → 零写（updated_at 原样），返回当前行', async () => {
    const { db, registry, service } = setup()
    const a = registry.seed(join(WS, 'qf'))
    seedProjectRow(db, { id: 'pa', workspaceId: a.id, wsPath: a.path, name: 'alpha' })

    const same = await service.updateProject('pa', {})

    expect(same.name).toBe('alpha')
    expect(same.updatedAt).toBe(T0) // 无字段即无写
  })

  it('updateProject 未知 id → 抛错（非六码 typed——RPC 边界 fail-loud 原样上抛）', async () => {
    const { service } = setup()
    await expect(service.updateProject('nope', { name: 'x' })).rejects.toThrow(/不存在/)
  })
})

// ── AC5 对账全程永不抛断启动（异常降级记账） ──

describe('AC5 对账全程永不抛断启动（关键异常降级 app_key_logs，绝不 reject）', () => {
  it('重建路径 registry.create 抛错 → 单项降级跳过（error 记账、引用未动），其余项目照常对账', async () => {
    const { db, registry, service } = setup()
    const ok = registry.seed(join(WS, 'ga'))
    seedProjectRow(db, { id: 'p-bad', workspaceId: 'ws-x', wsPath: resolve(join(WS, 'gmissing')) }) // id 序在前的失联行
    seedProjectRow(db, { id: 'p-ok', workspaceId: ok.id, wsPath: ok.path })
    registry.failCreate = new Error('dsh create down')

    const report = await service.reconcileAtStartup() // 不 reject 即达成

    expect(report.repaired).toEqual([]) // 失败项不入修复清单
    expect(readRows(db).find((r) => r.id === 'p-bad')?.workspace_id).toBe('ws-x') // 引用未动
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1) // 单项降级单条
    expect(logs[0]).toMatchObject({ level: 'error', scope: 'reconcile' })
    expect(logData(db, 0).projectId).toBe('p-bad')
  })

  it('库不可用（整体读失败）→ 空报告返回，绝不抛（记账亦不可行则吞掉）', async () => {
    const { db, registry: _registry, service } = setup()
    seedProjectRow(db, { id: 'p-9', workspaceId: 'ws-9', wsPath: resolve(join(WS, 'h')) })
    db.close()

    await expect(service.reconcileAtStartup()).resolves.toEqual({ repaired: [], orphans: [] })
  })

  it('registry.list 抛错（找回与孤儿面均不可用）→ 逐层降级记账后空报告返回', async () => {
    const { db, registry, service } = setup()
    seedProjectRow(db, { id: 'p-10', workspaceId: 'ws-gone', wsPath: resolve(join(WS, 'i')) })
    registry.failList = new Error('list down')

    const report = await service.reconcileAtStartup()

    expect(report).toEqual({ repaired: [], orphans: [] })
    const logs = keyLogs(db)
    expect(logs).toHaveLength(2) // 单项降级 1 + 孤儿面整体降级 1
    expect(logs.every((l) => l.level === 'error' && l.scope === 'reconcile')).toBe(true)
  })
})
