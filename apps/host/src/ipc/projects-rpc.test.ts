// 2.4 AC1/AC2/AC3 集成层——五通道经 1.4 ipc/ 机制注册端到端（双层自证）：
//   双层之一（替身层）：fake 全量 ProjectService × 五通道 → typed 结果 + 负载映射正确；
//   双层之二（实层）  ：core createProjectService 真身（2.2 registerProject + 临时 SQLite +
//                      registry 桩，2.2 同型）→ 真实 typed error 过真实注册机制入信封保真。
// 注：实层经相对路径引 core 源码仅限测试文件（结构 pin 豁免 *.test.*；生产面 host 禁 import core）。
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { FORGE_CHANNELS, PROJECTS_CHANNELS, type ProjectService } from '@dsh-forge/contracts'
// core 源码相对引入（测试面专用——见文件头注）
import { openDatabase } from '../../../../packages/core/src/db/index.js'
import {
  CompensationError,
  WorkspaceCreateError,
} from '../../../../packages/core/src/forge/errors.js'
import { createProjectService } from '../../../../packages/core/src/forge/project-service.js'
import type { WorkspaceLike, WorkspaceRegistryPort } from '../../../../packages/core/src/forge/registry.js'
import { createForgeIpc, type IpcMainLike } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'
import { registerProjectsChannels, runStartupReconcile } from './projects-rpc.js'

// ── ipc 替身（ipcMain.handle 语义：注册表存储，invoke 直调 handler）──

function fakeIpcMain() {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  }
  return { ipcMain, handlers }
}

/** renderer invoke 语义替身：handler(event, payload) → 结果（信封由 handler 自带） */
const invoke = (handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>, channel: string, payload?: unknown) => {
  const handler = handlers.get(channel)
  if (handler === undefined) throw new Error(`No handler registered for '${channel}'`)
  return Promise.resolve(handler(undefined, payload))
}

// ── 替身层：fake 全量 ProjectService（调用记录 + 可编程返回/抛错）──

const registerResult = { projectId: 'p-1', workspaceId: 'w-1', attachedToExisting: false }
const summaries = [{ id: 'p-1', workspaceId: 'w-1', name: 'demo', wsPath: 'C:\\ws\\demo', archived: false }]
const projectRow = {
  id: 'p-1', workspaceId: 'w-1', wsPath: 'C:\\ws\\demo', name: 'demo', forgeDir: 'C:\\ws\\demo\\.forge',
  forgeDirExternal: false, knowledgeDir: 'C:\\ws\\demo\\.knowledge', archived: false,
  createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}
const reconcileReport = { repaired: [{ projectId: 'p-1', workspaceId: 'w-2', action: 'relinked' as const }], orphans: [] }

function fakeService() {
  return {
    registerProject: vi.fn().mockResolvedValue(registerResult),
    listProjects: vi.fn().mockResolvedValue(summaries),
    getProject: vi.fn().mockResolvedValue(projectRow),
    updateProject: vi.fn().mockResolvedValue({ ...projectRow, name: 'renamed' }),
    reconcileAtStartup: vi.fn().mockResolvedValue(reconcileReport),
  } satisfies ProjectService
}

// ── 实层：core 真身素材（2.2 同型 registry 桩 + 临时 SQLite）──

class StubRegistry implements WorkspaceRegistryPort {
  readonly records = new Map<string, WorkspaceLike>()
  failCreate?: Error
  failDelete?: Error
  seed(path: string, id = randomUUID()): WorkspaceLike {
    const ws = { id, path: resolve(path) }
    this.records.set(id, ws)
    return ws
  }
  list(): WorkspaceLike[] {
    return [...this.records.values()]
  }
  async create(path: string): Promise<WorkspaceLike> {
    if (this.failCreate) throw this.failCreate
    const canonical = resolve(path)
    const existing = this.list().find((ws) => ws.path === canonical)
    if (existing) return existing
    const ws = { id: randomUUID(), path: canonical }
    this.records.set(ws.id, ws)
    return ws
  }
  async delete(id: string): Promise<boolean> {
    if (this.failDelete) throw this.failDelete
    return this.records.delete(id)
  }
}

let dir: string
let seq = 0
const dbPath = () =>
  join((dir ??= mkdtempSync(join(tmpdir(), 'dsh-forge-rpc-'))), `state-${String(++seq).padStart(3, '0')}.db`)

afterAll(() => {
  // Windows 句柄释放延迟容错（断言失败路径可能跳过 close——重试兜底防 EPERM 掩盖真因）
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

// ── AC1/AC3：五通道注册与端到端（替身层）──

describe('2.4 五通道注册（经 1.4 机制 + allowlist）', () => {
  it('注册面 = contracts PROJECTS_CHANNELS 全集五通道（无多无少）', () => {
    const { ipcMain } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    registerProjectsChannels(ipc, fakeService())
    expect([...ipc.registered()].sort()).toEqual(Object.values(PROJECTS_CHANNELS).slice().sort())
  })

  it('通道名仅出自 contracts 常量（负样例：伪通道不落 ipcMain.handle）', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    registerProjectsChannels(ipc, fakeService())
    expect(handlers.has('forge:projects/drop-table')).toBe(false)
    expect(handlers.has('evil:anything')).toBe(false)
    expect(handlers.has(FORGE_CHANNELS.list)).toBe(true) // 通道名 = 常量值本尊
  })
})

describe('2.4 AC1 五通道端到端（替身层：typed 结果 + 负载映射）', () => {
  function setup() {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    const service = fakeService()
    registerProjectsChannels(ipc, service)
    return { handlers, service, call: (channel: string, payload?: unknown) => invoke(handlers, channel, payload) }
  }

  it('register：RegisterProjectInput 透传 → RegisterResult typed 返回', async () => {
    const { service, call } = setup()
    const input = { workspaceDir: 'C:\\ws\\demo', name: 'demo', forgeDir: 'C:\\ws\\demo\\.forge', knowledgeDir: 'C:\\ws\\demo\\.knowledge' }
    await expect(call(PROJECTS_CHANNELS.register, input)).resolves.toEqual({ ok: true, data: registerResult })
    expect(service.registerProject).toHaveBeenCalledWith(input)
  })

  it('list：void 负载 → ProjectSummary[] typed 返回', async () => {
    const { service, call } = setup()
    await expect(call(PROJECTS_CHANNELS.list)).resolves.toEqual({ ok: true, data: summaries })
    expect(service.listProjects).toHaveBeenCalledOnce()
  })

  it('get：{id} 负载解包 → getProject(id) → Project | null', async () => {
    const { service, call } = setup()
    await expect(call(PROJECTS_CHANNELS.get, { id: 'p-1' })).resolves.toEqual({ ok: true, data: projectRow })
    expect(service.getProject).toHaveBeenCalledWith('p-1')
  })

  it('update：{id, patch} 负载解包 → updateProject(id, patch)', async () => {
    const { service, call } = setup()
    await expect(call(PROJECTS_CHANNELS.update, { id: 'p-1', patch: { name: 'renamed' } })).resolves.toEqual({
      ok: true,
      data: { ...projectRow, name: 'renamed' },
    })
    expect(service.updateProject).toHaveBeenCalledWith('p-1', { name: 'renamed' })
  })

  it('reconcile：void 负载 → ReconcileReport typed 返回', async () => {
    const { service, call } = setup()
    await expect(call(PROJECTS_CHANNELS.reconcile)).resolves.toEqual({ ok: true, data: reconcileReport })
    expect(service.reconcileAtStartup).toHaveBeenCalledOnce()
  })

  it('AC2：typed error 经全链入信封（ERR_COMPENSATION，code/message/data 保真）', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const ipc = createForgeIpc(ipcMain)
    const service = fakeService()
    const compensation = {
      workspaceId: 'w-9', wsPath: 'C:\\ws\\orphan', projectId: 'p-9',
      writeError: 'write boom', deleteError: 'delete boom',
    }
    service.getProject.mockRejectedValue(
      Object.assign(new Error('registry.delete 补偿失败（已 app_key_logs 记账）'), {
        code: 'ERR_COMPENSATION',
        data: compensation,
      }),
    )
    registerProjectsChannels(ipc, service)
    await expect(invoke(handlers, PROJECTS_CHANNELS.get, { id: 'p-9' })).resolves.toEqual({
      ok: false,
      error: { code: 'ERR_COMPENSATION', message: expect.stringContaining('补偿失败'), data: compensation },
    })
  })
})

// ── AC2 实层：core 真身（2.2 registerProject）× 真实注册组合 ──

/** 实层素材：每用例独占临时库 + registry 桩（重复注入同因失败互不染指——registry 状态会跨调用演化） */
function setupReal(ws: string, opts: { failInsert?: boolean; failCreate?: Error; failDelete?: Error } = {}) {
  const db = openDatabase(dbPath())
  const registry = new StubRegistry()
  registry.failCreate = opts.failCreate
  registry.failDelete = opts.failDelete
  if (opts.failInsert) {
    // fix-27：同 ws_path 陈旧行已被服务面自愈消费——③ 失败注入载体改 INSERT ABORT 触发器
    db.exec(
      `CREATE TRIGGER fail_projects_insert BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'simulated projects write failure'); END`,
    )
  }
  const service = createProjectService({ db, registry })
  const input = { workspaceDir: ws, name: 'x', forgeDir: ws, knowledgeDir: ws }
  const handler = rpcEnvelope((payload: typeof input) => service.registerProject(payload))
  return { db, registry, service, input, handler }
}

describe('2.4 AC2 实层：core 真身 typed error 过 RPC 边界保真', () => {
  it('register 成功 → RpcOk 携真实 RegisterResult（SQLite 落库 + registry 创建）', async () => {
    const ws = resolve('C:\\dsh-forge-rpc-real')
    const { db, registry, input, handler } = setupReal(ws)
    const result = (await handler(undefined, input)) as {
      ok: boolean
      data: { projectId: string; workspaceId: string; attachedToExisting: boolean }
    }
    expect(result.ok).toBe(true)
    expect(result.data.attachedToExisting).toBe(false)
    expect(registry.records.has(result.data.workspaceId)).toBe(true)
    expect(db.prepare('SELECT id FROM projects WHERE id = ?').get(result.data.projectId)).toBeDefined()
    db.close()
  })

  it('ERR_WORKSPACE_CREATE：registry.create 失败 → 真类入信封（code/message/data 保真）', async () => {
    const ws = resolve('C:\\dsh-forge-rpc-create-fail')
    const direct = setupReal(ws, { failCreate: new Error('dsh create exploded') })
    let thrown: unknown
    try {
      await direct.service.registerProject(direct.input)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(WorkspaceCreateError)
    direct.db.close()
    // 真实组合（同因失败重演于新库——registry 状态零污染前提）
    const replay = setupReal(ws, { failCreate: new Error('dsh create exploded') })
    const envelope = (await replay.handler(undefined, replay.input)) as {
      ok: boolean
      error: { code: string; message: string; data: unknown }
    }
    expect(envelope).toEqual({
      ok: false,
      error: {
        code: 'ERR_WORKSPACE_CREATE',
        message: (thrown as WorkspaceCreateError).message,
        data: { wsPath: ws }, // data.wsPath = 输入 workspaceDir 原样（2.2 口径）
      },
    })
    replay.db.close()
  })

  it('ERR_COMPENSATION：③写失败+补偿失败 → 真类入信封（记账后原样保真）', async () => {
    const ws = resolve('C:\\dsh-forge-rpc-compensate')
    const direct = setupReal(ws, { failInsert: true, failDelete: new Error('delete exploded') })
    let thrown: unknown
    try {
      await direct.service.registerProject(direct.input)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(CompensationError)
    // 关键异常降级 app_key_logs（单事件单条）——不抛断流程
    expect(direct.db.prepare('SELECT COUNT(*) AS n FROM app_key_logs').get()).toEqual({ n: 1 })
    direct.db.close()
    // 真实组合（新库重演）：CompensationError → 信封三元组保真
    const replay = setupReal(ws, { failInsert: true, failDelete: new Error('delete exploded') })
    const envelope = (await replay.handler(undefined, replay.input)) as {
      ok: boolean
      error: { code: string; message: string; data: Record<string, unknown> }
    }
    expect(envelope.ok).toBe(false)
    expect(envelope.error.code).toBe('ERR_COMPENSATION')
    expect(envelope.error.message).toBe((thrown as CompensationError).message)
    expect(envelope.error.data).toMatchObject({
      wsPath: ws,
      deleteError: 'delete exploded',
    })
    // ③ 注入 = UNIQUE 冲突真实 SQL 错误（消息动态，断言非空在场即可）
    expect(typeof envelope.error.data.writeError).toBe('string')
    expect(envelope.error.data.writeError).not.toBe('')
    expect(typeof envelope.error.data.workspaceId).toBe('string')
    expect(typeof envelope.error.data.projectId).toBe('string')
    replay.db.close()
  })
})

// ── fix-27 启动对账接线（fire-and-forget：报告入日志 + 异常吞掉不阻断启动）──

describe('fix-27 runStartupReconcile（boot 面服务就绪后调一次）', () => {
  it('成功 → repaired/orphans 摘要入日志；失败 → warn 吞掉（不抛、不 unhandled）', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const ok = fakeService()
      expect(() => runStartupReconcile(ok)).not.toThrow() // fire-and-forget：同步面零抛
      await new Promise((done) => setTimeout(done, 0))
      expect(ok.reconcileAtStartup).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledWith(expect.stringContaining('启动对账完成：repaired=1 orphans=0'))
      const failing = fakeService()
      failing.reconcileAtStartup = vi.fn().mockRejectedValue(new Error('bridge rpc down'))
      expect(() => runStartupReconcile(failing)).not.toThrow()
      await new Promise((done) => setTimeout(done, 0)) // 拒绝已被吞——无 unhandled rejection
      expect(failing.reconcileAtStartup).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('bridge rpc down'))
    } finally {
      log.mockRestore()
      warn.mockRestore()
    }
  })
})
