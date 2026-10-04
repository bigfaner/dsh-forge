// 任务 2.2 测试 —— registerProject 四步补偿链（AC1–AC6）：vitest + 临时 SQLite + registry 桩。
// 桩语义按 G1 pin 第 4 项（上游 dsh-workspace 源码核实）：create 幂等（同 canonical path 返回
// 既有实体）、delete 保目录保日志且未知 id 幂等 no-op（false）、list 同步投影。
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from '../db/index.js'
import { CompensationError, ProjectWriteError, WorkspaceCreateError } from './errors.js'
import { createProjectService, type ProjectServiceDeps } from './project-service.js'
import type { WorkspaceRenamePort } from './registry.js'
// registry 桩（G1 pin 4 语义）——fix-34 收编 testutil 单份（注入面 superset）；
// readRows/keyLogs 行读取——fix-35 收编 testutil 单份（与 reconcile-queries 同源）；
// seedRow/失败触发器——fix-37 收编 db-seeds 单源（与 reconcile-queries/e2e 同源）。
import { StubRegistry } from '../testutil/registry-stub.js'
import { keyLogs, readRows } from '../testutil/project-rows.js'
import { isParseableDateStyle } from '../testutil/date-assertions.js'
import { installProjectInsertFailure, seedProjectRow } from '../testutil/db-seeds.js'

// ── 测试环境（每用例独占临时库，2.1 口径） ──

// fix-39：注册链目录自愈（② 前 mkdir 三目录）落地后，新建径用例会真实建目录——WS 基座
// 迁临时根（盘副作用入 tmpdir，afterAll 统一清理；原 C: 常量路径会污染用户盘）
const WS_ROOT = mkdtempSync(join(tmpdir(), 'dsh-forge-reg-ws-'))
const WS = join(WS_ROOT, 'ws')
let dir: string
let seq = 0
const dbs: Database.Database[] = []
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-reg-'))), `state-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  for (const db of dbs) db.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
  rmSync(WS_ROOT, { recursive: true, force: true })
})

// ── rename 桩（fix-24 ②：官方 workspace/rename 命令形状记录——调用形状 = 断言面） ──

class StubRename implements WorkspaceRenamePort {
  readonly calls: { workspaceId: string; title: string }[] = []
  failRename?: Error
  async rename(request: { readonly workspaceId: string; readonly title: string }): Promise<unknown> {
    this.calls.push({ workspaceId: request.workspaceId, title: request.title })
    if (this.failRename) throw this.failRename
    return { workspace: {} }
  }
}

function setup() {
  const db = openDatabase(dbPath())
  dbs.push(db)
  const registry = new StubRegistry()
  const rename = new StubRename()
  const service = createProjectService({ db, registry, rename } satisfies ProjectServiceDeps)
  return { db, registry, rename, service }
}

/** 种入陈旧 projects 行 + ③ 失败注入载体：经 testutil/db-seeds 单源（fix-37——与
 *  reconcile-queries/e2e 同源；触发器名 e2e_fail_projects_insert） */

const input = (o: { workspaceDir?: string; forgeDir?: string } = {}) => ({
  workspaceDir: o.workspaceDir ?? join(WS, 'proj'),
  name: 'proj',
  forgeDir: o.forgeDir ?? join(WS, 'proj', '.forge'),
  knowledgeDir: join(WS, 'proj', '.knowledge'),
})

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
    expect(isParseableDateStyle(row?.created_at ?? '')).toBe(true)
    expect(isParseableDateStyle(row?.updated_at ?? '')).toBe(true)
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
    // fix-39：注册链会真实建 forge 目录——仓外路径取临时根内工作区外位置（不触真实盘符）
    await service.registerProject(input({ forgeDir: join(WS_ROOT, 'elsewhere-forge') }))
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
    seedProjectRow(db, { id: 'stale', workspaceId: existing.id, wsPath: 'C:\\other' }) // workspace_id UNIQUE 冲突 → ③ 失败
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    expect((err as ProjectWriteError).code).toBe('ERR_PROJECT_WRITE')
    expect((err as ProjectWriteError).data.compensated).toBeUndefined()
    expect(registry.deleteCalls).toEqual([]) // 既有工作区绝不被补偿删除
    expect(registry.records.has(existing.id)).toBe(true)
    expect(keyLogs(db)).toEqual([])
  })
})

// ── fix-27 重注册自愈/幂等（① 前防御：既有行在场 → 不新 INSERT，绝不撞 UNIQUE(ws_path)） ──

describe('fix-27 重注册自愈/幂等：悬空行自愈 / 健康行幂等（走查人 Z:\\learn 死锁场景）', () => {
  it('悬空行（引用 registry 无实体——fix-18 home 翻转遗留）→ recreate 自愈 + 幂等成功返回既有行', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    seedProjectRow(db, { id: 'legacy', workspaceId: 'ws-gone', wsPath: canonical }) // 悬空引用占位
    const result = await service.registerProject(input())
    expect(result).toMatchObject({ projectId: 'legacy', attachedToExisting: true }) // 既有项目幂等返回
    expect(result.workspaceId).not.toBe('ws-gone') // 引用已修（幂等重建新实体）
    const rows = readRows(db)
    expect(rows).toHaveLength(1) // 不新 INSERT——原行 UPDATE 单向修引用
    expect(rows[0]).toMatchObject({ id: 'legacy', workspace_id: result.workspaceId, ws_path: canonical })
    expect(registry.records.get(result.workspaceId)?.path).toBe(canonical) // 幂等重建落地
    expect(registry.deleteCalls).toEqual([]) // 不登记补偿（挂接保护恒成立）
    expect(keyLogs(db)).toEqual([]) // recreated 成功路径不记（§交互三口径）
  })

  it('悬空行但 registry 按 path 找回既有实体 → relink 自愈（零 create）+ 幂等成功 + warn 单条记账', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    const found = registry.seed(canonical) // path 在场、行引用却指向别的 id
    seedProjectRow(db, { id: 'legacy', workspaceId: 'ws-other', wsPath: canonical })
    const result = await service.registerProject(input())
    expect(result).toMatchObject({ projectId: 'legacy', workspaceId: found.id, attachedToExisting: true })
    expect(registry.createCalls).toEqual([]) // relink 路径零 create
    expect(readRows(db)[0]?.workspace_id).toBe(found.id)
    // relink 自动修复 = 关键一致性事件 → warn 单条（§交互三记名域②口径复用）
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'reconcile' })
  })

  it('健康行（registry 实体在场且 path 一致——正常重注册场景）→ 幂等成功零写零记账，不炸 UNIQUE', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    const existing = registry.seed(canonical)
    seedProjectRow(db, { id: 'healthy', workspaceId: existing.id, wsPath: canonical })
    const before = readRows(db)[0]
    const result = await service.registerProject(input())
    expect(result).toEqual({ projectId: 'healthy', workspaceId: existing.id, attachedToExisting: true })
    expect(registry.createCalls).toEqual([])
    expect(registry.deleteCalls).toEqual([]) // 绝不删既有工作区
    const after = readRows(db)
    expect(after).toHaveLength(1)
    expect(after[0]?.updated_at).toBe(before?.updated_at) // 健康短路：零写
    expect(keyLogs(db)).toEqual([])
  })
})

// ── AC3 ③ 写入失败 → ④ 补偿删除 ──

describe('AC3 ③ 写入失败（模拟）→ ④ 补偿删除，dsh 零孤儿、目录日志保留', () => {
  it('新建路径 ③ 失败（INSERT 触发器 ABORT 注入）→ delete 补偿一次 + ProjectWriteError(compensated)', async () => {
    const { db, registry, service } = setup()
    const canonical = resolve(join(WS, 'proj'))
    installProjectInsertFailure(db) // fix-27：ws_path 冲突行已被自愈面消费——③ 失败注入载体改触发器
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
    // 应用库零新增行（触发器拦截）+ 补偿成功不记关键日志（成功路径不记流水）
    expect(readRows(db)).toHaveLength(0)
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
    installProjectInsertFailure(db)
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
    installProjectInsertFailure(db)
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
    expect(readRows(db)).toHaveLength(0) // 触发器拦截 → 应用库零行
  })
})

// ── AC6 registry.create 失败 → ERR_WORKSPACE_CREATE 中止 ──

describe('AC6 registry.create 失败 → ERR_WORKSPACE_CREATE 中止，无补偿需要', () => {
  it('create 抛错 → 中止：无 delete、无落库、无记账、无 rename（fix-24 ② 排序免疫）', async () => {
    const { db, registry, rename, service } = setup()
    registry.failCreate = new Error('ENOTDIR: not a directory')
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(WorkspaceCreateError)
    expect((err as WorkspaceCreateError).code).toBe('ERR_WORKSPACE_CREATE')
    expect((err as WorkspaceCreateError).data.wsPath).toBe(input().workspaceDir)
    expect(registry.deleteCalls).toEqual([]) // 无补偿需要
    expect(readRows(db)).toEqual([]) // 无落库
    expect(keyLogs(db)).toEqual([]) // 无记账
    expect(rename.calls).toEqual([]) // fix-24 ②：② 失败径 rename 未发生（零残留）
  })
})

// ── fix-24 ② 注册时 workspace 标题对齐项目名（官方 workspace/rename 调用形状） ──

describe('fix-24 ② 注册时标题对齐：新建/挂接/自愈三径收口 + fail-soft + 补偿链零 rename 残留', () => {
  it('新建路径全链成功 → rename({workspaceId, title=name}) 恰一调用（title 跟项目名不跟目录名）', async () => {
    const { db, registry, rename, service } = setup()
    const result = await service.registerProject(input())
    expect(result.attachedToExisting).toBe(false)
    expect(registry.records.has(result.workspaceId)).toBe(true)
    expect(rename.calls).toEqual([{ workspaceId: result.workspaceId, title: 'proj' }]) // 调用形状
    expect(readRows(db)[0]?.name).toBe('proj') // 行 name 与 title 同源
  })

  it('挂接既有路径（① 预检命中 dsh 既有工作区）→ 同对齐（attachedToExisting=true 时 rename 仍发生）', async () => {
    const { rename, registry, service } = setup()
    registry.seed(join(WS, 'proj')) // dsh 侧既有（canonical path 命中）
    const result = await service.registerProject(input())
    expect(result.attachedToExisting).toBe(true)
    expect(rename.calls).toEqual([{ workspaceId: result.workspaceId, title: 'proj' }])
  })

  it('重注册幂等（fix-27 自愈路径）→ rename 以既有行 name 对齐（input.name 对既有行不生效；存量项目重注册即愈）', async () => {
    const { db, rename, registry, service } = setup()
    const existing = registry.seed(join(WS, 'proj'))
    seedProjectRow(db, { id: 'legacy-row', workspaceId: existing.id, wsPath: existing.path }) // 存量行 name=id
    const result = await service.registerProject(input({ workspaceDir: join(WS, 'proj') }))
    expect(result.projectId).toBe('legacy-row') // 幂等复用既有行
    expect(rename.calls).toEqual([{ workspaceId: existing.id, title: 'legacy-row' }]) // title 跟行不跟输入
  })

  it('同项目重注册不炸（幂等可重入）：官方 rename 等值跳过由官方面承接——本链每次注册恰一调用', async () => {
    const { rename, service } = setup()
    const first = await service.registerProject(input())
    const second = await service.registerProject(input()) // 重注册 → 自愈路径幂等成功
    expect(second.projectId).toBe(first.projectId) // 幂等复用
    expect(rename.calls).toHaveLength(2) // 每次注册各恰一；等值幂等（零写）归官方命令语义
    expect(rename.calls[0]).toEqual(rename.calls[1])
  })

  it('rename 失败（name-conflict 模拟）→ fail-soft：注册仍成功、无重试、行不受影响', async () => {
    const { db, rename, service } = setup()
    rename.failRename = new Error("Workspace name 'proj' is already in use")
    const result = await service.registerProject(input())
    expect(result.projectId).toBeTypeOf('string') // 注册不受对齐失败拖垮
    expect(rename.calls).toHaveLength(1) // 无重试
    expect(readRows(db)).toHaveLength(1) // 行已落定
  })

  it('③ 写入失败（补偿路径）→ rename 零调用（补偿链 rename 零残留——排序免疫：rename 仅在 ③ 落定后执行）', async () => {
    const { db, rename, service } = setup()
    installProjectInsertFailure(db)
    const err: unknown = await service.registerProject(input()).catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    expect(rename.calls).toEqual([]) // 失败径 rename 未发生——补偿链无需 rename 回滚
  })
})

// ── fix-30 拼写变体归一：盘符大小写/尾分隔符/…回折/symlink 击穿面收口 ──
// 缺陷形态（修复前）：BINARY 预检/自愈查询未命中变体 → dsh（按 canonical）返回既有实体
// 而误判「本次新建」→ ③ 撞 UNIQUE(ws_path) 或 ④ 把流程前就存在的健康工作区补偿删除。

/** 大小写翻转（非字母不变）——盘符/段大小写变体生成器 */
const flipCase = (s: string): string =>
  s
    .split('')
    .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
    .join('')

describe('fix-30 拼写变体注册：幂等 / 零身份 churn / 既有实体绝不被补偿删除', () => {
  it('已注册后以盘符大小写+尾分隔符变体再注册（真实目录）→ 幂等成功：项目/工作区 id 不变、零 create、零补偿删除', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fix30-case-'))
    try {
      const { db, registry, service } = setup()
      const reg = { workspaceDir: root, name: 'learn', forgeDir: join(root, '.forge'), knowledgeDir: join(root, '.knowledge') }
      const first = await service.registerProject(reg)
      expect(first.attachedToExisting).toBe(false)
      const variant = flipCase(root) + '\\'
      const second = await service.registerProject({
        ...reg,
        workspaceDir: variant,
        forgeDir: join(variant, '.forge'),
        knowledgeDir: join(variant, '.knowledge'),
      })
      expect(second).toEqual({ projectId: first.projectId, workspaceId: first.workspaceId, attachedToExisting: true })
      expect(registry.createCalls).toEqual([root]) // 变体径零 create——归一键在 ①/自愈面命中
      expect(registry.deleteCalls).toEqual([]) // 绝无补偿删除
      expect(registry.list()).toHaveLength(1) // dsh 侧零身份 churn（id 稳定）
      expect(registry.list()[0]?.id).toBe(first.workspaceId)
      expect(readRows(db)).toHaveLength(1) // 应用侧零身份 churn（不新 INSERT）
      expect(keyLogs(db)).toEqual([]) // 健康短路零记账
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('大小写+尾分隔符变体（无盘面依赖）→ 自愈查询归一键命中：幂等成功、零补偿', async () => {
    const { db, registry, service } = setup()
    const canonical = join(WS, 'learn') // 不存在路径——realpath fail-soft 回退原拼写（边界口径）
    const existing = registry.seed(canonical)
    seedProjectRow(db, { id: 'row-learn', workspaceId: existing.id, wsPath: canonical })
    const result = await service.registerProject(input({ workspaceDir: `${flipCase(canonical)}\\` }))
    expect(result).toEqual({ projectId: 'row-learn', workspaceId: existing.id, attachedToExisting: true })
    expect(registry.createCalls).toEqual([])
    expect(registry.deleteCalls).toEqual([])
    expect(readRows(db)).toHaveLength(1) // 幂等：不新 INSERT（id 稳定）
    expect(keyLogs(db)).toEqual([]) // 健康引用短路——零写零记账
  })

  it('结构判据：变体径穿透预检但 ② 返回既有实体 → attachedToExisting=true，③ 失败绝不补偿删除既有', async () => {
    const { db, registry, service } = setup()
    const canonical = join(WS, 'learn')
    const existing = registry.seed(canonical)
    installProjectInsertFailure(db) // ③ 恒失败（触发器）——修复前缺陷形态即在此径把既有工作区 delete
    const err: unknown = await service
      .registerProject(input({ workspaceDir: `${canonical}\\sub\\..` })) // 归一键不可折叠 '..'（lexical 折叠对 symlink 父级不安全）——穿透面载体
      .catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    expect((err as ProjectWriteError).data.compensated).toBeUndefined()
    expect(registry.deleteCalls).toEqual([]) // id 快照差集判「本次新建」——既有实体绝不被补偿删除
    expect(registry.records.has(existing.id)).toBe(true)
    expect(readRows(db)).toHaveLength(0) // 触发器拦截零行
  })

  it('兜底①：变体径穿透预检且 ③ 撞 UNIQUE(ws_path) → 重入自愈幂等成功（无补偿删除、无错误上抛）', async () => {
    const { db, registry, rename, service } = setup()
    const canonical = join(WS, 'learn')
    const existing = registry.seed(canonical)
    seedProjectRow(db, { id: 'row-learn', workspaceId: 'ws-gone', wsPath: canonical }) // 悬空引用行（撞键载体）
    const result = await service.registerProject(input({ workspaceDir: `${canonical}\\sub\\..` }))
    expect(result).toEqual({ projectId: 'row-learn', workspaceId: existing.id, attachedToExisting: true })
    expect(rename.calls).toEqual([{ workspaceId: existing.id, title: 'row-learn' }]) // 确经 attachExistingRow 自愈径（title 跟行不跟输入）
    expect(registry.deleteCalls).toEqual([]) // 撞 UNIQUE 不进补偿——既有工作区存活
    expect(registry.records.has(existing.id)).toBe(true)
    expect(readRows(db)).toHaveLength(1) // 不新 INSERT——原行 UPDATE 单向修引用（relink）
    expect(readRows(db)[0]?.workspace_id).toBe(existing.id)
  })

  it('symlink/junction 变体再注册（可行平台）→ realpath 展开收敛既有：幂等、零补偿删除', async (ctx) => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-forge-fix30-sym-'))
    const link = `${root}-link`
    try {
      symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      rmSync(root, { recursive: true, force: true })
      ctx.skip() // 平台/权限不可建 symlink——任务文件「可行平台」口径
      return
    }
    try {
      const { db, registry, service } = setup()
      const reg = { workspaceDir: root, name: 'sym', forgeDir: join(root, '.forge'), knowledgeDir: join(root, '.knowledge') }
      const first = await service.registerProject(reg)
      const second = await service.registerProject({
        ...reg,
        workspaceDir: link,
        forgeDir: join(link, '.forge'),
        knowledgeDir: join(link, '.knowledge'),
      })
      expect(second).toEqual({ projectId: first.projectId, workspaceId: first.workspaceId, attachedToExisting: true })
      expect(registry.deleteCalls).toEqual([])
      expect(registry.list()).toHaveLength(1)
      expect(readRows(db)).toHaveLength(1)
    } finally {
      rmSync(link, { recursive: true, force: true })
      rmSync(root, { recursive: true, force: true })
    }
  })
})

// ── fix-33 ⑪⑫⑬ 加固批次（rename 联动 / 自愈降级记账 / 对账记账防护） ──

describe('fix-33 ⑪ updateProject name patch 联动 workspace 标题对齐', () => {
  it('name patch 成功 → fire-and-forget rename({workspaceId, title=新名})——chip/账本跟项目名（fix-24 注记耦合收口）', async () => {
    const { rename, service } = setup()
    const reg = await service.registerProject(input())
    await service.updateProject(reg.projectId, { name: 'renamed' })
    expect(rename.calls).toEqual([
      { workspaceId: reg.workspaceId, title: 'proj' }, // 注册链末位对齐
      { workspaceId: reg.workspaceId, title: 'renamed' }, // fix-33 ⑪：改名联动
    ])
  })

  it('archived-only patch → 零 rename（展示名未变不折腾）；空 patch 同径', async () => {
    const { rename, service } = setup()
    const reg = await service.registerProject(input())
    await service.updateProject(reg.projectId, { archived: true })
    await service.updateProject(reg.projectId, {})
    expect(rename.calls).toEqual([{ workspaceId: reg.workspaceId, title: 'proj' }]) // 仅注册一次
  })

  it('rename 失败（name-conflict 模拟）→ fail-soft：更新仍成功返回、无重试', async () => {
    const { db, rename, service } = setup()
    const reg = await service.registerProject(input())
    rename.failRename = new Error("Workspace name 'renamed' is already in use")
    const updated = await service.updateProject(reg.projectId, { name: 'renamed' })
    expect(updated.name).toBe('renamed') // 行已更新——对齐是展示面增益不拖垮更新面
    expect(readRows(db)[0]?.name).toBe('renamed')
    expect(rename.calls).toHaveLength(2) // 注册 1 + 改名联动 1，无重试
  })
})

describe('fix-33 ⑫ attachExistingRow 自愈失败降级记账（现场可追溯）', () => {
  it('自愈链失败（悬空引用 + create 不可用）→ warn/reconcile 单条记账后降级现行链（原静默零记账）', async () => {
    const { db, registry, service } = setup()
    const canonical = join(WS, 'learn')
    seedProjectRow(db, { id: 'row-x', workspaceId: 'ws-gone', wsPath: canonical }) // 悬空引用 → 自愈径进 reconcileProjectRef
    registry.failCreate = new Error('dsh create down') // 找不回 → create 重建失败 → 自愈链抛
    const err: unknown = await service.registerProject(input({ workspaceDir: canonical })).catch((e) => e)
    // 降级现行链：① list 命中不了（无此路径）→ ② create 仍失败 → WorkspaceCreateError（错误面由现行链承接）
    expect(err).toBeInstanceOf(WorkspaceCreateError)
    const logs = keyLogs(db)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', scope: 'reconcile' })
    expect(logs[0]?.message).toContain('自愈面失败')
    expect(logs[0]?.message).toContain(canonical)
  })

  it('无既有行（正常首注册）→ 零记账（自愈未参与不记流水）', async () => {
    const { db, service } = setup()
    await service.registerProject(input())
    expect(keyLogs(db)).toEqual([])
  })
})

describe('fix-33 ⑬ 对账记账防护（记账抛错不截断本轮剩余行）', () => {
  it('逐项 catch 内 recordKeyLog 抛错（app_key_logs 损坏）→ 吞掉并继续对账剩余行', async () => {
    const { db, registry, service } = setup()
    const ok = registry.seed(join(WS, 'repair-ok'))
    // 行序：失败行在前（id 序）——记账被吞后第二行必须仍被修复（原样上抛 = 本轮截断）
    seedProjectRow(db, { id: 'a-bad', workspaceId: 'ws-x', wsPath: join(WS, 'missing') })
    seedProjectRow(db, { id: 'b-ok', workspaceId: ok.id, wsPath: ok.path })
    registry.failCreate = new Error('dsh create down') // a-bad 修复链失败 → 逐项 catch 走记账
    db.exec('DROP TABLE app_key_logs') // 记账面本身损坏 → recordKeyLog 抛

    const report = await service.reconcileAtStartup() // 不 reject 即达成（外层整体降级兜底）

    expect(report.repaired).toEqual([]) // a-bad 失败不入清单（b-ok 健康短路零修复）
    expect(readRows(db).find((r) => r.id === 'b-ok')?.workspace_id).toBe(ok.id) // 剩余行照常对账
    // a-bad 引用未动（修复失败语义不变）
    expect(readRows(db).find((r) => r.id === 'a-bad')?.workspace_id).toBe('ws-x')
  })
})

// ── fix-39 注册链目录自愈：新建径三目录缺则建；挂接/自愈径零盘副作用（Hard Rule） ──

describe('fix-39 注册链目录自愈（② 前置步）', () => {
  it('新建径：全新空工作区（无 .forge/.knowledge）注册 → 成功且两目录落盘（验收①）', async () => {
    const { service } = setup()
    const ws = join(WS_ROOT, 'fresh-ws') // 全新空目录——三目录均不存在
    const result = await service.registerProject({
      workspaceDir: ws,
      name: 'fresh',
      forgeDir: join(ws, '.forge'),
      knowledgeDir: join(ws, '.knowledge'),
    })
    expect(result.attachedToExisting).toBe(false)
    expect(existsSync(ws)).toBe(true)
    expect(existsSync(join(ws, '.forge'))).toBe(true)
    expect(existsSync(join(ws, '.knowledge'))).toBe(true)
  })

  it('直输多级缺失路径 → 注册成功，目录递归创建（验收②：D:\\a\\b\\c\\.knowledge 同构面）', async () => {
    const { service } = setup()
    const ws = join(WS_ROOT, 'deep-ws')
    const knowledgeDir = join(WS_ROOT, 'deep-ws', 'a', 'b', 'c', '.knowledge') // 多级缺失
    const result = await service.registerProject({
      workspaceDir: ws,
      name: 'deep',
      forgeDir: join(ws, '.forge'),
      knowledgeDir,
    })
    expect(result.attachedToExisting).toBe(false)
    expect(existsSync(knowledgeDir)).toBe(true) // 递归建齐
  })

  it('workspaceDir 选定后被删再注册 → 注册成功（目录自愈）而非 ERR_WORKSPACE_CREATE（验收④）', async () => {
    const { service } = setup()
    const ws = join(WS_ROOT, 'racy-ws')
    mkdirSync(ws) // 模拟浏览器/原生选取器选定时刻在场
    rmSync(ws, { recursive: true, force: true }) // 选定后被删（竞态窗口）——修复前 ② realpath 门必炸
    const result = await service.registerProject({
      workspaceDir: ws,
      name: 'racy',
      forgeDir: join(ws, '.forge'),
      knowledgeDir: join(ws, '.knowledge'),
    })
    expect(result.attachedToExisting).toBe(false)
    expect(existsSync(ws)).toBe(true) // 自愈重建
  })

  it('挂接径（① 预检命中 dsh 既有）零建目录：.forge/.knowledge 缺失不落盘（Hard Rule）', async () => {
    const { registry, service } = setup()
    const ws = join(WS_ROOT, 'attach-ws')
    registry.seed(ws) // dsh 侧既有 → ① 命中（挂接径）
    const result = await service.registerProject({
      workspaceDir: ws,
      name: 'attach',
      forgeDir: join(ws, '.forge'),
      knowledgeDir: join(ws, '.knowledge'),
    })
    expect(result.attachedToExisting).toBe(true)
    expect(existsSync(ws)).toBe(false) // 挂接径零 mkdir——工作区目录亦不建
    expect(existsSync(join(ws, '.forge'))).toBe(false)
    expect(existsSync(join(ws, '.knowledge'))).toBe(false)
  })

  it('自愈径（attachExistingRow 既有行幂等重注册）零建目录（Hard Rule：幂等语义不破）', async () => {
    const { db, registry, service } = setup()
    const ws = join(WS_ROOT, 'reattach-ws')
    const existing = registry.seed(ws)
    seedProjectRow(db, { id: 'row-39', workspaceId: existing.id, wsPath: ws }) // 既有行在场
    const result = await service.registerProject({
      workspaceDir: ws,
      name: 'reattach',
      forgeDir: join(ws, '.forge'),
      knowledgeDir: join(ws, '.knowledge'),
    })
    expect(result).toMatchObject({ projectId: 'row-39', attachedToExisting: true })
    expect(existsSync(ws)).toBe(false) // 自愈径零 mkdir
    expect(existsSync(join(ws, '.knowledge'))).toBe(false)
  })

  it('workspaceDir 建失败（路径为普通文件）→ WorkspaceCreateError（现行六码面承接；② 未启动无补偿）', async () => {
    const { db, registry, service } = setup()
    const fileWs = join(WS_ROOT, 'ws-as-file')
    writeFileSync(fileWs, '占位文件', 'utf8') // mkdir recursive 对在场文件抛 EEXIST
    const err: unknown = await service
      .registerProject({
        workspaceDir: fileWs,
        name: 'x',
        forgeDir: join(WS_ROOT, 'f-forge'),
        knowledgeDir: join(WS_ROOT, 'f-kn'),
      })
      .catch((e) => e)
    expect(err).toBeInstanceOf(WorkspaceCreateError)
    expect((err as WorkspaceCreateError).code).toBe('ERR_WORKSPACE_CREATE')
    expect((err as WorkspaceCreateError).data.wsPath).toBe(fileWs)
    expect(registry.createCalls).toEqual([]) // ② 前中止——dsh 侧零副作用
    expect(readRows(db)).toEqual([])
  })

  it('knowledgeDir 建失败（父级为普通文件）→ ProjectWriteError 前置（建失败沿现行六码面，不扩码）', async () => {
    const { db, registry, service } = setup()
    const parentFile = join(WS_ROOT, 'kn-parent-file')
    writeFileSync(parentFile, '占位文件', 'utf8')
    const err: unknown = await service
      .registerProject({
        workspaceDir: join(WS_ROOT, 'kn-fail-ws'),
        name: 'x',
        forgeDir: join(WS_ROOT, 'kn-fail-ws', '.forge'),
        knowledgeDir: join(parentFile, 'sub', '.knowledge'), // 父级为文件 → mkdir ENOTDIR
      })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ProjectWriteError)
    expect((err as ProjectWriteError).code).toBe('ERR_PROJECT_WRITE')
    expect(registry.createCalls).toEqual([]) // ② 前置失败——dsh 侧零副作用、零补偿需要
    expect(readRows(db)).toEqual([])
  })
})
