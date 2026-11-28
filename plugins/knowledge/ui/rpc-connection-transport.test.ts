// fix-9 双运输面单测（bug 1c2a603e）：connectionRpcTransport 通道映射/信封投影 +
// resolveRpcClientFactory 装配期分流（connection 在场→connection 面；缺席→preload 面
// 回落；两缺 = 现行 fail-loud）+ 缺省 factory 页内缝。既有 preload 路径零回归断言在列。
import { afterEach, describe, expect, it } from 'vitest'
import { KNOWLEDGE_CHANNELS, PROJECTS_CHANNELS } from '@dsh-forge/lib-api/channels'
import {
  CONNECTION_ENDPOINT_BY_CHANNEL,
  KNOWLEDGE_RPC_CHANNEL,
  connectionRpcClientFactory,
  connectionRpcTransport,
  currentDefaultRpcClientFactory,
  installDefaultRpcClientFactory,
  preloadRpcClientFactory,
  resolveRpcClientFactory,
  type ConnectionRpcCallFace,
} from './rpc-channels.js'

/** 连接 RPC 调用捕获替身（ClientConnectionRpc.call 结构同型） */
function callRecorder(result: unknown, error?: unknown): ConnectionRpcCallFace & {
  calls: { channel: string; endpoint: string; payload: unknown }[]
} {
  const calls: { channel: string; endpoint: string; payload: unknown }[] = []
  return {
    calls,
    async call(channel, endpoint, payload) {
      calls.push({ channel, endpoint, payload })
      if (error !== undefined) throw error
      return result
    },
  }
}

afterEach(() => {
  // 页内缺省缝复位（测试间零串扰——重装 preload 基线）
  installDefaultRpcClientFactory(preloadRpcClientFactory)
})

describe('connectionRpcTransport 通道映射（endpoint 段官方校验合法——点分族前缀）', () => {
  it('九通道映射逐项：knowledge 七 + projects 两（逻辑通道恒 /knowledge）', async () => {
    const conn = callRecorder({ ok: true, value: null })
    const transport = connectionRpcTransport(conn)
    await transport(KNOWLEDGE_CHANNELS.browse, { projectId: 'p-1' })
    await transport(KNOWLEDGE_CHANNELS.listEntries, {})
    await transport(KNOWLEDGE_CHANNELS.entryDetail, {})
    await transport(KNOWLEDGE_CHANNELS.heat, { projectId: 'p-1' })
    await transport(KNOWLEDGE_CHANNELS.sessionRecall, {})
    await transport(KNOWLEDGE_CHANNELS.entryAction, {})
    await transport(KNOWLEDGE_CHANNELS.recallFeedback, {})
    await transport(PROJECTS_CHANNELS.list)
    await transport(PROJECTS_CHANNELS.get, { id: 'p-1' })
    expect(conn.calls.map((c) => c.channel)).toEqual(Array<string>(9).fill(KNOWLEDGE_RPC_CHANNEL))
    expect(KNOWLEDGE_RPC_CHANNEL).toBe('/api')
    expect(conn.calls.map((c) => c.endpoint)).toEqual([
      'knowledge.browse',
      'knowledge.listEntries',
      'knowledge.entryDetail',
      'knowledge.heat',
      'knowledge.sessionRecall',
      'knowledge.entryAction',
      'knowledge.recallFeedback',
      'projects.list',
      'projects.get',
    ])
    expect(conn.calls[0]!.payload).toEqual({ projectId: 'p-1' })
    // 映射表键集 = contracts 通道字面（共享锚——host 分发表同源）
    expect(Object.keys(CONNECTION_ENDPOINT_BY_CHANNEL)).toEqual([
      ...Object.values(KNOWLEDGE_CHANNELS),
      PROJECTS_CHANNELS.list,
      PROJECTS_CHANNELS.get,
    ])
  })

  it('未映射通道（worktree.resolve 等）= typed 拒绝信封（不外呼）', async () => {
    const conn = callRecorder({ ok: true, value: null })
    const transport = connectionRpcTransport(conn)
    const out = await transport('forge:worktree/resolve', {}) as { ok: boolean }
    expect(out.ok).toBe(false)
    expect(conn.calls).toHaveLength(0)
  })
})

describe('connectionRpcTransport 信封投影（ConnectionRpcResult → contracts RpcResult）', () => {
  it('成功：{ok,value} → {ok,data:value}（invokeRpc 拆装面零改动）', async () => {
    const transport = connectionRpcTransport(callRecorder({ ok: true, value: [1, 2, 3] }))
    const out = await transport(PROJECTS_CHANNELS.list) as { ok: boolean; data?: unknown }
    expect(out).toEqual({ ok: true, data: [1, 2, 3] })
  })

  it('失败：{ok:false,error:{code,message,details}} → {ok:false,error:{code,message,data:details}}', async () => {
    const transport = connectionRpcTransport(callRecorder({
      ok: false,
      error: { code: 'ERR_ENTRY_NOT_FOUND', message: '条目未命中', details: { entryId: 7 } },
    }))
    const out = await transport(KNOWLEDGE_CHANNELS.entryDetail, {}) as { ok: boolean; error?: { code: string; message: string; data?: unknown } }
    expect(out).toEqual({ ok: false, error: { code: 'ERR_ENTRY_NOT_FOUND', message: '条目未命中', data: { entryId: 7 } } })
  })

  it('信封形状非法 / failure 字段劣形 → typed internal 拒绝（不抛）', async () => {
    const malformed = (await connectionRpcTransport(callRecorder('nope'))(PROJECTS_CHANNELS.list)) as { ok: boolean; error?: { code: string } }
    expect(malformed).toMatchObject({ ok: false, error: { code: 'internal' } })
    const degraded = (await connectionRpcTransport(callRecorder({ ok: false, error: {} }))(PROJECTS_CHANNELS.list)) as { ok: boolean; error?: { code: string; message: string } }
    expect(degraded).toMatchObject({ ok: false, error: { code: 'internal', message: 'connection rpc failure' } })
  })
})

describe('resolveRpcClientFactory 装配期分流（connection 在场优先 / 缺席回落 preload）', () => {
  it('ctx.connection.rpc.call 函数面在场 → connection 面工厂（projects.list 走 connection.call）', async () => {
    const conn = callRecorder({ ok: true, value: [] })
    const makeClient = resolveRpcClientFactory({ connection: { rpc: { call: conn.call } } })
    const projects = await makeClient().projects.list()
    expect(projects).toEqual([])
    expect(conn.calls).toEqual([{ channel: KNOWLEDGE_RPC_CHANNEL, endpoint: 'projects.list', payload: {} }])
  })

  it('ctx.connection 缺席 → 现行 preload 面工厂（零回归——无 preload 载体构造期 fail-loud）', () => {
    expect(resolveRpcClientFactory({})).toBe(preloadRpcClientFactory)
    expect(resolveRpcClientFactory(undefined)).toBe(preloadRpcClientFactory)
    const prev = (globalThis as { dshForge?: unknown }).dshForge
    delete (globalThis as { dshForge?: unknown }).dshForge
    try {
      expect(() => preloadRpcClientFactory()).toThrow(/dshForge/)
    } finally {
      if (prev !== undefined) (globalThis as { dshForge?: unknown }).dshForge = prev
    }
  })

  it('connectionRpcClientFactory：面切片注入 → 全方法集经 connection 面', async () => {
    const conn = callRecorder({ ok: true, value: { id: 'p-1', name: 'n', wsPath: 'C:/w', archived: false } })
    const client = connectionRpcClientFactory(conn)
    const project = await client.projects.get('p-1')
    expect(project).toMatchObject({ id: 'p-1' })
    expect(conn.calls[0]).toMatchObject({ channel: KNOWLEDGE_RPC_CHANNEL, endpoint: 'projects.get' })
  })
})

describe('缺省 factory 页内缝（apply 期安装——anchored-projects 镜像 pin 签名不动）', () => {
  it('install 后 currentDefault 返回安装面；复位回 preload 基线', () => {
    expect(currentDefaultRpcClientFactory()).toBe(preloadRpcClientFactory)
    const custom = (): ReturnType<typeof preloadRpcClientFactory> => ({}) as never
    installDefaultRpcClientFactory(custom)
    expect(currentDefaultRpcClientFactory()).toBe(custom)
    installDefaultRpcClientFactory(preloadRpcClientFactory)
    expect(currentDefaultRpcClientFactory()).toBe(preloadRpcClientFactory)
  })

  it('resolveRpcClientFactory(connection) 安装后 useForgeProjects 缺省参消费面换面（经缝读连接面）', async () => {
    const conn = callRecorder({ ok: true, value: [] })
    installDefaultRpcClientFactory(resolveRpcClientFactory({ connection: { rpc: { call: conn.call } } }))
    expect(currentDefaultRpcClientFactory()).not.toBe(preloadRpcClientFactory)
    const projects = await currentDefaultRpcClientFactory()().projects.list()
    expect(projects).toEqual([])
    expect(conn.calls[0]).toMatchObject({ endpoint: 'projects.list' })
  })
})
