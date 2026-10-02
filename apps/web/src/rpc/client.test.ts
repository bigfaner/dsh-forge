// 2.4 AC1/AC2/AC3 renderer 层——forge:projects/* client：typed 结果、通道常量唯一源、信封反序列化。
// 2.8 增 fs 面（forge:fs/listDir）：通道常量唯一源 + 缺省主目录请求负载形状。
// 3.5 增 knowledge 面（forge:knowledge/* 五通道）：typed 结果、负载形状、双门分工（AC4）、
// 知识域三码 typed error 反序列化（AC2 renderer 侧半边——与 host 实层信封互为往返自证）。
import { describe, expect, it, vi } from 'vitest'
import {
  FS_CHANNELS,
  KNOWLEDGE_CHANNELS,
  PROJECTS_CHANNELS,
  type DirListing,
  type DomainNode,
  type EntryDetail,
  type KnowledgeCard,
  type RecallGroup,
  type RpcResult,
} from '@dsh-forge/contracts'
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

describe('3.5 knowledge 面（forge:knowledge/* 五通道——浏览数据面）', () => {
  const domainNodes: DomainNode[] = [
    { domainPath: '前端', label: '前端', depth: 1, entryCount: 2 },
    { domainPath: '编程/java', label: 'java', depth: 2, entryCount: 1 },
  ]
  const cards: KnowledgeCard[] = [
    { entryId: 1, title: '框架选型', summary: '前端框架选型基线', keywords: ['react', 'frontend'], status: 'draft', domainPath: '前端', updated: '2026-10-01T00:00:00.000Z', heat: 2 },
  ]
  const detail: EntryDetail = {
    entryId: 1, title: '框架选型', summary: '前端框架选型基线', keywords: ['react', 'frontend'], status: 'draft',
    domainPath: '前端', authors: '平台组', updated: '2026-10-01T00:00:00.000Z', body: '正文',
  }
  const heat = new Map([[1, 2]])
  const groups: RecallGroup[] = [
    { callId: 'call-1', verb: 'search', query: null, hitCount: 0, durationMs: 3, createdAt: '2026-10-01T00:00:00.000Z', hits: [] },
  ]

  it('AC1 五方法 typed 结果（browse 聚合 / 过滤卡片 / 详情 / 热度 Map / 召回分组）', async () => {
    const t = fakeTransport()
    t.respondWith((channel) => {
      if (channel === KNOWLEDGE_CHANNELS.browse) return { ok: true, data: domainNodes }
      if (channel === KNOWLEDGE_CHANNELS.listEntries) return { ok: true, data: cards }
      if (channel === KNOWLEDGE_CHANNELS.entryDetail) return { ok: true, data: detail }
      if (channel === KNOWLEDGE_CHANNELS.heat) return { ok: true, data: heat }
      return { ok: true, data: groups }
    })
    const client = createForgeRpcClient(t.transport)
    await expect(client.knowledge.browse('p-1')).resolves.toBe(domainNodes)
    await expect(client.knowledge.listEntries({ projectId: 'p-1', domainPrefix: '前端', keyword: 'css' })).resolves.toBe(cards)
    await expect(client.knowledge.entryDetail({ projectId: 'p-1', entryId: 1 })).resolves.toBe(detail)
    await expect(client.knowledge.heat('p-1')).resolves.toBe(heat) // Map 经 IPC 结构化克隆保真
    await expect(client.knowledge.sessionRecall({ projectId: 'p-1', sessionId: 'sess-1' })).resolves.toBe(groups)
  })

  it('AC3 通道名 = KNOWLEDGE_CHANNELS 常量值本尊；负载形状 = dto/rpc.ts 映射', async () => {
    const t = fakeTransport()
    const client = createForgeRpcClient(t.transport)
    await client.knowledge.browse('p-1')
    await client.knowledge.listEntries({ projectId: 'p-1', domainPrefix: '前端' })
    await client.knowledge.entryDetail({ projectId: 'p-1', entryId: 9 })
    await client.knowledge.heat('p-1')
    await client.knowledge.sessionRecall({ projectId: 'p-1', sessionId: 'sess-1' })
    expect(t.calls.map((c) => c.channel)).toEqual([
      KNOWLEDGE_CHANNELS.browse,
      KNOWLEDGE_CHANNELS.listEntries,
      KNOWLEDGE_CHANNELS.entryDetail,
      KNOWLEDGE_CHANNELS.heat,
      KNOWLEDGE_CHANNELS.sessionRecall,
    ])
    expect(t.calls[0]?.payload).toEqual({ projectId: 'p-1' })
    expect(t.calls[1]?.payload).toEqual({ projectId: 'p-1', domainPrefix: '前端' })
    expect(t.calls[2]?.payload).toEqual({ projectId: 'p-1', entryId: 9 })
    expect(t.calls[3]?.payload).toEqual({ projectId: 'p-1' })
    expect(t.calls[4]?.payload).toEqual({ projectId: 'p-1', sessionId: 'sess-1' })
  })

  it('AC4 双门分工：knowledge 面恰五方法，search/readAbstract 不在面（agent 面唯一门 = 插件 tool）', () => {
    const t = fakeTransport()
    const client = createForgeRpcClient(t.transport)
    expect(Object.keys(client.knowledge).sort()).toEqual(['browse', 'entryDetail', 'heat', 'listEntries', 'sessionRecall'])
    expect('search' in client.knowledge).toBe(false)
    expect('readAbstract' in client.knowledge).toBe(false)
  })

  it('AC2 三码反序列化保真：ERR_INDEX_STALE / ERR_ENTRY_NOT_FOUND / ERR_INVALID_KNOWLEDGE_DIR → RpcClientError 三元组', async () => {
    // 信封形状 = host 实层序列化产物同构（knowledge-rpc.test.ts 实层互证——边界往返）
    const envelopes = [
      { code: 'ERR_INDEX_STALE', message: '知识索引缺失或过期且重建未恢复：p-1', data: { projectId: 'p-1', reason: '重建器内部异常' } },
      { code: 'ERR_ENTRY_NOT_FOUND', message: '知识条目未命中：projectId=p-1 entryId=99', data: { projectId: 'p-1', entryId: 99 } },
      { code: 'ERR_INVALID_KNOWLEDGE_DIR', message: '知识目录不可达或非法：/ws/knowledge', data: { knowledgeDir: '/ws/knowledge' } },
    ] as const
    const t = fakeTransport()
    let i = 0
    t.respondWith(() => ({ ok: false, error: envelopes[i++] }))
    const client = createForgeRpcClient(t.transport)
    const methods = [
      () => client.knowledge.listEntries({ projectId: 'p-1' }),
      () => client.knowledge.entryDetail({ projectId: 'p-1', entryId: 99 }),
      () => client.knowledge.browse('p-1'),
    ] as const
    for (let j = 0; j < envelopes.length; j += 1) {
      const caught = await methods[j]!().then(
        () => undefined,
        (e: unknown) => e,
      )
      expect(caught).toBeInstanceOf(RpcClientError)
      const err = caught as RpcClientError
      expect(err.code).toBe(envelopes[j]!.code)
      expect(err.message).toBe(envelopes[j]!.message)
      expect(err.data).toEqual(envelopes[j]!.data)
    }
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
