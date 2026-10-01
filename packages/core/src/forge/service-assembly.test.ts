// 任务 2.2 测试 —— service.ts 装配点：ctx.forgeProjects Cordis 服务注册。
// Cordis Plugin.Function 形态断言：loader 取 default 导出（exports.default ?? exports，上游核实），
// inject 依赖声明、reflect.provide 注册官方面（Service 基类同径）、返回值 = 句柄 disposer。
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ProjectWriteError } from './errors.js'
import type { WorkspaceLike } from './registry.js'
import corePlugin, { type CoreContextFace } from '../service.js'

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
  it('默认导出函数插件：inject=workspaceRegistry，provide forgeProjects（Interface 1 全五法面——2.3 并齐）', () => {
    const { ctx, provided } = stubCtx()
    const dispose = corePlugin(ctx, { dbFile: dbPath() })
    expect(corePlugin.inject).toEqual(['workspaceRegistry'])
    const svc = provided.get('forgeProjects') as Record<string, unknown> | undefined
    expect(svc).toBeDefined()
    for (const method of ['registerProject', 'listProjects', 'getProject', 'updateProject', 'reconcileAtStartup']) {
      expect(typeof svc?.[method]).toBe('function')
    }
    expect(typeof dispose).toBe('function')
    dispose()
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
