// fix-9 host 半连接 RPC 通道单测（bug 1c2a603e）：knowledgeRpcHandler 端点分发 +
// 信封形状（typed error 带内返回）+ projects 数据源两形态（core 服务 / workspaceRegistry
// 投影）+ registerKnowledgeConnectionRpc 注册/注销语义。
import { describe, expect, it } from 'vitest'
import type { ProjectSummary } from '@dsh-forge/lib-api/dto/project'
import { EntryNotFoundError } from '../host/service/errors.js'
import {
  isForgeProjectsSource,
  isWorkspaceRegistryFace,
  knowledgeRpcHandler,
  registryProjectsSource,
  registerKnowledgeConnectionRpc,
  type ForgeProjectsSource,
  type KnowledgeConnectionService,
} from '../host/connection-rpc.js'
import { CONNECTION_ENDPOINT_BY_CHANNEL } from '../shared/connection-rpc.js'
import { projectKeyOf as libProjectKeyOf } from '@dsh-forge/lib-path'
import { canonicalWsPath } from '../host/storage/registry.js'

// 被测口径 = knowledge 派生键（lib projectKeyOf · canonical 基准 ws_path）
const projectKeyOf = (wsPath: string): string => libProjectKeyOf(canonicalWsPath(wsPath))

/** 知识服务替身（KnowledgeConnectionService 结构切片——逐端点捕获） */
function fakeService(overrides: Partial<KnowledgeConnectionService> = {}): KnowledgeConnectionService {
  const base = {
    browse: (async () => [{ domainPath: 'a', count: 1 }]),
    listEntries: (async () => []),
    getEntryDetail: (async () => { throw new EntryNotFoundError({ projectId: 'p-1', entryId: 9 }) }),
    heatByEntry: (async () => new Map<number, number>()),
    sessionRecall: (async () => []),
    confirmBatch: (async () => []),
    rejectBatch: (async () => []),
    moveEntry: (async () => ({ entryId: 1, outcome: 'success' })),
    updateEntry: (async () => ({ entryId: 1, outcome: 'success' })),
    createDomain: (async () => ({ outcome: 'success' })),
    recallFeedback: (async () => ({ outcome: 'success' })),
  } as unknown as KnowledgeConnectionService
  return { ...base, ...overrides }
}

const noopSignal = AbortSignal.abort()

async function call(handler: ReturnType<typeof knowledgeRpcHandler>, endpoint: string, payload?: unknown): Promise<unknown> {
  return handler(endpoint, payload, noopSignal, undefined)
}

describe('knowledgeRpcHandler 端点分发（case 集 = client 映射表值集）', () => {
  it('knowledge 七端点逐项委托（browse/listEntries/heat/sessionRecall）', async () => {
    const seen: string[] = []
    const service = fakeService({
      browse: (async (q: { projectId: string }) => {
        seen.push(`browse:${q.projectId}`)
        return []
      }),
      heatByEntry: (async (projectId: string) => {
        seen.push(`heat:${projectId}`)
        return new Map()
      }),
    })
    const handler = knowledgeRpcHandler({ service, projects: () => undefined })
    const browse = await call(handler, 'knowledge.browse', { projectId: 'p-1' })
    expect(browse).toEqual({ ok: true, value: [] })
    const heat = await call(handler, 'knowledge.heat', { projectId: 'p-2' })
    expect(heat).toMatchObject({ ok: true })
    expect(seen).toEqual(['browse:p-1', 'heat:p-2'])
    expect(await call(handler, 'knowledge.listEntries', { projectId: 'p-1' })).toMatchObject({ ok: true })
    expect(await call(handler, 'knowledge.sessionRecall', { projectId: 'p-1', sessionId: 's-1' })).toMatchObject({ ok: true })
  })

  it('透传端点全量劣形反例：入口即拒（invalid-request 信封带 endpoint+field 字段级报文，服务零触达）', async () => {
    const touched: string[] = []
    const probe = (): Partial<KnowledgeConnectionService> => ({
      browse: (async () => { touched.push('browse'); return [] }),
      listEntries: (async () => { touched.push('listEntries'); return [] }),
      getEntryDetail: (async () => { touched.push('entryDetail'); throw new EntryNotFoundError({ projectId: 'p-1', entryId: 9 }) }),
      heatByEntry: (async () => { touched.push('heat'); return new Map() }),
      sessionRecall: (async () => { touched.push('sessionRecall'); return [] }),
    })
    const handler = knowledgeRpcHandler({ service: fakeService(probe()), projects: () => undefined })
    const cases: [endpoint: string, payload: unknown, field: string][] = [
      ['knowledge.browse', {}, 'projectId'],
      ['knowledge.browse', { projectId: 7 }, 'projectId'],
      ['knowledge.listEntries', {}, 'projectId'],
      ['knowledge.listEntries', { projectId: 'p-1', domainPrefix: 1 }, 'domainPrefix'],
      ['knowledge.listEntries', { projectId: 'p-1', keyword: 2 }, 'keyword'],
      ['knowledge.listEntries', { projectId: 'p-1', statusFilter: 'recent' }, 'statusFilter'],
      ['knowledge.listEntries', { projectId: 'p-1', scopeFilter: 'mine' }, 'scopeFilter'],
      ['knowledge.entryDetail', { projectId: 'p-1' }, 'entryId'],
      ['knowledge.entryDetail', { projectId: 'p-1', entryId: 1.5 }, 'entryId'],
      ['knowledge.heat', {}, 'projectId'],
      ['knowledge.heat', { projectId: null }, 'projectId'],
      ['knowledge.sessionRecall', { projectId: 'p-1' }, 'sessionId'],
      ['knowledge.sessionRecall', { sessionId: 's-1' }, 'projectId'],
      ['projects.get', {}, 'id'],
      ['projects.get', { id: 9 }, 'id'],
    ]
    for (const [endpoint, payload, field] of cases) {
      const out = await call(handler, endpoint, payload) as { ok: boolean; error?: { code: string; details: Record<string, unknown> } }
      expect(out.ok, `${endpoint} ${JSON.stringify(payload)} 应拒`).toBe(false)
      expect(out.error?.code, endpoint).toBe('invalid-request')
      expect(out.error?.details, endpoint).toMatchObject({ endpoint, field })
    }
    // 劣形载荷入口即拒——服务零触达（写面/读面均未分派）
    expect(touched).toEqual([])
    // 合法载荷不受累（同 handler 正常透传）
    expect(await call(handler, 'knowledge.browse', { projectId: 'p-1' })).toMatchObject({ ok: true })
    expect(await call(handler, 'knowledge.listEntries', { projectId: 'p-1', statusFilter: 'unconfirmed', scopeFilter: 'global', domainPrefix: 'a', keyword: 'k' })).toMatchObject({ ok: true })
    expect(await call(handler, 'knowledge.entryDetail', { projectId: 'p-1', entryId: 3 })).toMatchObject({ ok: false, error: { code: 'ERR_ENTRY_NOT_FOUND' } })
  })

  it('entryAction：confirm 批量透传 + 形状拒收（invalid-request 请求级信封）', async () => {
    const seen: unknown[] = []
    const service = fakeService({ confirmBatch: (async (q: unknown) => { seen.push(q); return [] }) })
    const handler = knowledgeRpcHandler({ service, projects: () => undefined })
    await call(handler, 'knowledge.entryAction', { projectId: 'p-1', action: 'confirm', entryIds: [1, 2] })
    expect(seen).toEqual([{ projectId: 'p-1', entryIds: [1, 2] }])
    const invalid = await call(handler, 'knowledge.entryAction', { projectId: 'p-1', action: 'confirm', entryIds: [] }) as { ok: boolean; value?: { code?: string } }
    expect(invalid.ok).toBe(true)
    expect(invalid.value).toMatchObject({ code: 'invalid-request' })
  })

  it('recallFeedback：row 动作透传 + feedback 越界请求级拒收', async () => {
    const seen: unknown[] = []
    const service = fakeService({ recallFeedback: (async (q: unknown) => { seen.push(q); return { results: [] } }) })
    const handler = knowledgeRpcHandler({ service, projects: () => undefined })
    await call(handler, 'knowledge.recallFeedback', { projectId: 'p-1', action: 'row', rowId: 3, feedback: 1 })
    expect(seen).toEqual([{ projectId: 'p-1', action: 'row', rowId: 3, feedback: 1 }])
    const bad = await call(handler, 'knowledge.recallFeedback', { projectId: 'p-1', action: 'row', rowId: 3, feedback: 2 }) as { ok: boolean; value?: { code?: string } }
    expect(bad.ok).toBe(true)
    expect(bad.value).toMatchObject({ code: 'invalid-request' })
  })

  it('typed error 带内返回（EntryNotFoundError → ERR_ENTRY_NOT_FOUND + data 附载）', async () => {
    const handler = knowledgeRpcHandler({ service: fakeService(), projects: () => undefined })
    const out = await call(handler, 'knowledge.entryDetail', { projectId: 'p-1', entryId: 9 }) as { ok: boolean; error?: { code: string; details: unknown } }
    expect(out.ok).toBe(false)
    expect(out.error?.code).toBe('ERR_ENTRY_NOT_FOUND')
    expect(out.error?.details).toMatchObject({ entryId: 9 })
  })

  it('非 typed 异常收敛 internal（连接面无拒绝通道——信封带内可辨）', async () => {
    const service = fakeService({ listEntries: (async () => { throw new Error('boom') }) })
    const handler = knowledgeRpcHandler({ service, projects: () => undefined })
    const out = await call(handler, 'knowledge.listEntries', { projectId: 'p-1' }) as { ok: boolean; error?: { code: string } }
    expect(out).toMatchObject({ ok: false, error: { code: 'internal' } })
  })

  it('未知 endpoint = typed internal（映射表外零外溢）', async () => {
    const handler = knowledgeRpcHandler({ service: fakeService(), projects: () => undefined })
    expect(await call(handler, 'nope')).toMatchObject({ ok: false, error: { code: 'internal' } })
  })
})

describe('projects 数据源两形态', () => {
  const rows: ProjectSummary[] = [{ id: 'p-1', workspaceId: 'w-1', name: 'n', wsPath: 'C:/w', archived: false }]

  it('core forgeProjects 源（isForgeProjectsSource 形状校验）', async () => {
    const core: ForgeProjectsSource = { listProjects: async () => rows, getProject: async () => null }
    expect(isForgeProjectsSource(core)).toBe(true)
    expect(isForgeProjectsSource({})).toBe(false)
    const handler = knowledgeRpcHandler({ service: fakeService(), projects: () => core })
    expect(await call(handler, 'projects.list')).toEqual({ ok: true, value: rows })
  })

  it('双缺 = typed 拒绝（ERR_WORKSPACE_NOT_REGISTERED——knowledge 端点不受阻）', async () => {
    const handler = knowledgeRpcHandler({ service: fakeService(), projects: () => undefined })
    expect(await call(handler, 'projects.list')).toMatchObject({ ok: false, error: { code: 'ERR_WORKSPACE_NOT_REGISTERED' } })
    expect(await call(handler, 'projects.get', { id: 'p-1' })).toMatchObject({ ok: false })
    expect(await call(handler, 'knowledge.heat', { projectId: 'p-1' })).toMatchObject({ ok: true })
  })

  it('workspaceRegistry 投影（fix-11 B 方案——行 id = projectKeyOf 派生 forge project key，workspaceId 归位关联列两字段不同值）', async () => {
    const row = { id: 'w-9', path: 'C:/kn', title: 'kn' }
    const registry = {
      list: async () => [row],
      get: async (id: string) => (id === 'w-9' ? row : undefined),
    }
    expect(isWorkspaceRegistryFace(registry)).toBe(true)
    expect(isWorkspaceRegistryFace({ list: async () => [] })).toBe(false)
    const key = projectKeyOf(row.path)
    const source = registryProjectsSource(registry)
    const summaries = await source.listProjects()
    expect(summaries).toEqual([
      { id: key, workspaceId: 'w-9', name: 'kn', wsPath: 'C:/kn', archived: false },
    ])
    // 两字段不再同值（id 域统一 forge project key；workspaceId 归位官方关联列）
    expect(summaries[0]!.id).not.toBe(summaries[0]!.workspaceId)
    // getProject 派生键命中（域内反查）；workspace 域 id 不再命中
    const project = await source.getProject(key)
    expect(project).toMatchObject({ id: key, workspaceId: 'w-9', wsPath: 'C:/kn', name: 'kn', archived: false })
    expect(await source.getProject('w-9')).toBeNull()
    expect(await source.getProject('absent')).toBeNull()
  })
})

describe('registerKnowledgeConnectionRpc 注册/注销语义（/api 精确路由缝）', () => {
  it('逐 endpoint 注册精确路由 + 注销器并组；fetch.register 缺席 = 零注册零抛', () => {
    const registered: string[] = []
    let disposed = 0
    const dispose = registerKnowledgeConnectionRpc({
      fetch: {
        register: (route) => {
          registered.push(route.path)
          return () => {
            disposed += 1
          }
        },
      },
    }, { service: fakeService(), projects: () => undefined })
    expect(registered).toEqual([
      '/api/knowledge.browse', '/api/knowledge.listEntries', '/api/knowledge.entryDetail', '/api/knowledge.heat',
      '/api/knowledge.sessionRecall', '/api/knowledge.entryAction', '/api/knowledge.recallFeedback',
      '/api/projects.list', '/api/projects.get',
    ])
    dispose()
    expect(disposed).toBe(9)
    expect(registerKnowledgeConnectionRpc(undefined as never, { service: fakeService(), projects: () => undefined })).not.toThrow()
    expect(registerKnowledgeConnectionRpc({} as never, { service: fakeService(), projects: () => undefined })).not.toThrow()
  })

  it('route fetch：ClientRequest 信封解析 → ServerResponse 应答（合法 rpcId 回显）', async () => {
    let route: ((request: { json(): Promise<unknown>; signal: AbortSignal }) => Promise<Response>) | undefined
    registerKnowledgeConnectionRpc({
      fetch: {
        register: (r) => {
          if (r.path === '/api/projects.list') route = r.fetch as typeof route
          return () => {}
        },
      },
    }, { service: fakeService(), projects: () => ({ listProjects: async () => [{ id: 'p-1', workspaceId: 'w', name: 'n', wsPath: 'C:/w', archived: false }], getProject: async () => null }) })
    const response = await route!({ json: async () => ({ type: 'client-request', rpcId: 'r-9', method: 'projects.list', payload: {} }), signal: AbortSignal.abort() })
    expect(response.status).toBe(200)
    const envelope = await response.json() as { type: string; rpcId: string; result?: { ok: boolean; value?: unknown } }
    expect(envelope).toEqual({ type: 'server-response', rpcId: 'r-9', result: { ok: true, value: [{ id: 'p-1', workspaceId: 'w', name: 'n', wsPath: 'C:/w', archived: false }] } })
    // 非法信封 = 400 + server-response 错误信封（官方 clientRequestSchema 门）
    const bad = await route!({ json: async () => ({ nonsense: true }), signal: AbortSignal.abort() })
    expect(bad.status).toBe(400)
    // method↔endpoint 失配 = gateway/bad-request
    const mismatch = await route!({ json: async () => ({ type: 'client-request', rpcId: 'r-1', method: 'other', payload: {} }), signal: AbortSignal.abort() })
    const mismatchEnvelope = await mismatch.json() as { result?: { error?: { code?: string } } }
    expect(mismatchEnvelope.result?.error?.code).toBe('gateway/bad-request')
  })

  it('端点集对账：client 映射表值集 = 路由族（共享锚漂移即红）', () => {
    const served = [
      'knowledge.browse', 'knowledge.listEntries', 'knowledge.entryDetail', 'knowledge.heat',
      'knowledge.sessionRecall', 'knowledge.entryAction', 'knowledge.recallFeedback',
      'projects.list', 'projects.get',
    ]
    for (const endpoint of Object.values(CONNECTION_ENDPOINT_BY_CHANNEL)) {
      expect(served).toContain(endpoint)
    }
    expect(Object.keys(CONNECTION_ENDPOINT_BY_CHANNEL)).toHaveLength(served.length)
  })
})
