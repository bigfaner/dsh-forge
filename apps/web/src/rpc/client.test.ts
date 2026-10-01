// 2.4 AC1/AC2/AC3 renderer 层——forge:projects/* client：typed 结果、通道常量唯一源、信封反序列化。
// 2.8 增 fs 面（forge:fs/listDir）：通道常量唯一源 + 缺省主目录请求负载形状。
import { describe, expect, it, vi } from 'vitest'
import { FS_CHANNELS, PROJECTS_CHANNELS, type DirListing, type RpcResult } from '@dsh-forge/contracts'
import { createForgeRpcClient } from './client.js'
import { RpcClientError } from './errors.js'

/** 传输替身：记录 (channel, payload) 并可编程返回信封 */
function fakeTransport() {
  const calls: Array<{ channel: string; payload?: unknown }> = []
  let respond: (channel: string, payload: unknown) => unknown = () => ({ ok: true, data: null })
  const transport = vi.fn((channel: string, payload?: unknown) => {
    calls.push({ channel, payload })
    return Promise.resolve(respond(channel, payload))
  })
  return {
    calls,
    transport,
    respondWith: (fn: (channel: string, payload: unknown) => unknown) => {
      respond = fn
    },
  }
}

const registerResult = { projectId: 'p-1', workspaceId: 'w-1', attachedToExisting: true }
const summaries = [{ id: 'p-1', workspaceId: 'w-1', name: 'demo', wsPath: '/ws/demo', archived: false }]

describe('AC1 五通道 renderer 侧 typed 结果', () => {
  it('register：信封 RpcOk → RegisterResult typed 返回', async () => {
    const t = fakeTransport()
    t.respondWith(() => ({ ok: true, data: registerResult } as RpcResult<typeof registerResult>))
    const client = createForgeRpcClient(t.transport)
    await expect(client.projects.register({ workspaceDir: '/ws/demo', name: 'demo', forgeDir: '/ws/demo/.forge', knowledgeDir: '/ws/demo/.knowledge' })).resolves.toEqual(registerResult)
  })

  it('list / get / update / reconcile：typed 返回（null 过滤与 patch 面不丢失）', async () => {
    const t = fakeTransport()
    const project = {
      id: 'p-1', workspaceId: 'w-1', wsPath: '/ws/demo', name: 'demo', forgeDir: '/ws/demo/.forge',
      forgeDirExternal: false, knowledgeDir: '/ws/demo/.knowledge', archived: true,
      createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
    }
    t.respondWith((channel) => {
      if (channel === PROJECTS_CHANNELS.list) return { ok: true, data: summaries }
      if (channel === PROJECTS_CHANNELS.get) return { ok: true, data: null }
      if (channel === PROJECTS_CHANNELS.update) return { ok: true, data: project }
      return { ok: true, data: { repaired: [], orphans: [] } }
    })
    const client = createForgeRpcClient(t.transport)
    await expect(client.projects.list()).resolves.toBe(summaries)
    await expect(client.projects.get('p-1')).resolves.toBe(null)
    await expect(client.projects.update('p-1', { archived: true })).resolves.toEqual(project)
    await expect(client.projects.reconcile()).resolves.toEqual({ repaired: [], orphans: [] })
  })
})

describe('AC3 通道名仅出自 contracts 常量', () => {
  it('五方法发出的通道名 = PROJECTS_CHANNELS 常量值本尊（禁字面量漂移）', async () => {
    const t = fakeTransport()
    const client = createForgeRpcClient(t.transport)
    await client.projects.register({ workspaceDir: '/w', name: 'n', forgeDir: '/f', knowledgeDir: '/k' })
    await client.projects.list()
    await client.projects.get('p-1')
    await client.projects.update('p-1', { name: 'x' })
    await client.projects.reconcile()
    expect(t.calls.map((c) => c.channel)).toEqual([
      PROJECTS_CHANNELS.register,
      PROJECTS_CHANNELS.list,
      PROJECTS_CHANNELS.get,
      PROJECTS_CHANNELS.update,
      PROJECTS_CHANNELS.reconcile,
    ])
  })

  it('请求负载形状 = dto/rpc.ts 映射（get {id} / update {id, patch}）', async () => {
    const t = fakeTransport()
    const client = createForgeRpcClient(t.transport)
    await client.projects.get('p-9')
    await client.projects.update('p-9', { name: 'renamed' })
    expect(t.calls[0]?.payload).toEqual({ id: 'p-9' })
    expect(t.calls[1]?.payload).toEqual({ id: 'p-9', patch: { name: 'renamed' } })
  })
})

describe('2.8 fs 面（forge:fs/listDir——文件浏览器数据源）', () => {
  const listing: DirListing = {
    path: 'Z:\\project',
    parentPath: 'Z:\\',
    entries: [
      { name: 'ai', path: 'Z:\\project\\ai' },
      { name: 'dsh', path: 'Z:\\project\\dsh' },
    ],
  }

  it('通道名 = FS_CHANNELS.listDir 常量值本尊；typed DirListing 返回', async () => {
    const t = fakeTransport()
    t.respondWith(() => ({ ok: true, data: listing } as RpcResult<DirListing>))
    const client = createForgeRpcClient(t.transport)
    await expect(client.fs.listDir('Z:\\project')).resolves.toBe(listing)
    expect(t.calls).toEqual([{ channel: FS_CHANNELS.listDir, payload: { dirPath: 'Z:\\project' } }])
  })

  it('dirPath 缺省 = 主目录请求（负载 { dirPath: undefined } → IPC 结构化克隆后 {}）', async () => {
    const t = fakeTransport()
    t.respondWith(() => ({ ok: true, data: listing } as RpcResult<DirListing>))
    const client = createForgeRpcClient(t.transport)
    await client.fs.listDir()
    expect(t.calls[0]?.channel).toBe('forge:fs/listDir')
    expect(t.calls[0]?.payload).toEqual({ dirPath: undefined })
  })
})

describe('AC2 typed error 反序列化保真（renderer 侧半边）', () => {
  it('RpcErr 信封 → 抛 RpcClientError（code/message/data 三元组保真）', async () => {
    const t = fakeTransport()
    const compensationData = {
      workspaceId: 'w-9', wsPath: '/ws/orphan', projectId: 'p-9',
      writeError: 'write boom', deleteError: 'delete boom',
    }
    t.respondWith(() => ({
      ok: false,
      error: { code: 'ERR_COMPENSATION', message: '补偿失败：孤儿交启动对账提示', data: compensationData },
    }))
    const client = createForgeRpcClient(t.transport)
    const caught = await client.projects.list().then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(caught).toBeInstanceOf(RpcClientError)
    const err = caught as RpcClientError
    expect(err.code).toBe('ERR_COMPENSATION')
    expect(err.message).toBe('补偿失败：孤儿交启动对账提示')
    expect(err.data).toEqual(compensationData)
  })

  it('ERR_WORKSPACE_CREATE 同径保真（六码第二码自证）', async () => {
    const t = fakeTransport()
    t.respondWith(() => ({
      ok: false,
      error: { code: 'ERR_WORKSPACE_CREATE', message: 'dsh 工作区创建失败', data: { wsPath: '/ws/demo' } },
    }))
    const client = createForgeRpcClient(t.transport)
    await expect(client.projects.register({ workspaceDir: '/ws/demo', name: 'd', forgeDir: '/f', knowledgeDir: '/k' })).rejects.toMatchObject({
      name: 'RpcClientError',
      code: 'ERR_WORKSPACE_CREATE',
      data: { wsPath: '/ws/demo' },
    })
  })

  it('信封形状非法 → fail-loud（不静默捏造结果）', async () => {
    const t = fakeTransport()
    t.respondWith(() => 'not-an-envelope' as unknown as RpcResult<never>)
    const client = createForgeRpcClient(t.transport)
    await expect(client.projects.list()).rejects.toThrow(/信封形状非法/)
    const t2 = fakeTransport()
    t2.respondWith(() => null as unknown as RpcResult<never>)
    const client2 = createForgeRpcClient(t2.transport)
    await expect(client2.projects.list()).rejects.toThrow(/信封形状非法/)
  })
})
