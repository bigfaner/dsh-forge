// fix-1 boot 子进程桥协议 pin：消息形状守卫 / Map wire 编解码 / argv 选项解析 /
// 子侧 RPC 派发（ok 与 fail 双态）/ 主侧代理转发与白名单——child 形态的纯逻辑面
// 逐项锚定（进程编排在 run.ts，e2e 面 = flywheel.spec.ts）。
// fix-28 错误过桥保真：typed error 结构化（code/message/data）/ 非 typed string 形态
// 不变（fail-loud）/ 主侧双形态解码重建——信封面（rpcEnvelope 判型）衔接见 rpc-envelope.test.ts。
import { describe, expect, it } from 'vitest'
import {
  asReadyMessage,
  createBridgeProxy,
  decodeWire,
  dispatchRpc,
  encodeWire,
  extraPatchFiles,
  KNOWLEDGE_SERVICE_METHODS,
  parseChildOptions,
  PROJECT_SERVICE_METHODS,
  rebuildBridgeError,
  serializeBridgeError,
  type BridgeRpcRequest,
} from './bridge.js'

/** typed error 结构替身（core ProjectWriteError 同型：readonly code + data + Error——fix-28 过桥保真锚） */
class ProjectWriteLikeError extends Error {
  readonly code = 'ERR_PROJECT_WRITE' as const
  readonly data: Record<string, unknown>
  constructor(data: Record<string, unknown>) {
    super(`应用库 projects 行写入失败（registry.delete 补偿已执行，dsh 侧零孤儿）：${String(data.wsPath ?? '')}`)
    this.name = 'ProjectWriteError'
    this.data = data
  }
}

describe('encodeWire / decodeWire（Map wire 信封）', () => {
  it('Map → entries 信封 → Map 往返（heatByEntry 形状：number 键）', () => {
    const heat = new Map<number, number>([
      [1, 3],
      [7, 12],
    ])
    const wire = JSON.parse(JSON.stringify(encodeWire(heat))) as unknown // 过 IPC JSON 序列化面
    const decoded = decodeWire(wire)
    expect(decoded).toBeInstanceOf(Map)
    expect([...(decoded as Map<number, number>).entries()]).toEqual([
      [1, 3],
      [7, 12],
    ])
  })

  it('非 Map 值原样（DTO/数组/null 不动）', () => {
    for (const value of [{ id: 'x' }, [1, 2], null, 'text', 42]) {
      expect(encodeWire(value)).toBe(value)
      expect(decodeWire(value)).toBe(value)
    }
  })

  it('信封载荷非法原样降级（不抛、不猜）', () => {
    const malformed = { __dshForgeMap__: 'not-entries' }
    expect(decodeWire(malformed)).toBe(malformed)
  })
})

describe('parseChildOptions（argv[2] BootDshOptions JSON）', () => {
  const valid = JSON.stringify({
    profileDir: 'C:/p',
    installAnchor: 'C:/a/package.json',
    port: 19400,
    stateDb: 'C:/ud/state.db',
    bindingsFile: 'C:/ud/bindings.json',
  })

  it('合法 JSON → 完整选项', () => {
    expect(parseChildOptions(['electron.exe', 'child.js', valid])).toEqual({
      profileDir: 'C:/p',
      installAnchor: 'C:/a/package.json',
      port: 19400,
      stateDb: 'C:/ud/state.db',
      bindingsFile: 'C:/ud/bindings.json',
    })
  })

  it('argv 缺席 / 非 JSON / 形状非法 → undefined', () => {
    expect(parseChildOptions(['electron.exe', 'child.js'])).toBeUndefined()
    expect(parseChildOptions(['electron.exe', 'child.js', 'not-json'])).toBeUndefined()
    expect(parseChildOptions(['electron.exe', 'child.js', '{"port":19400}'])).toBeUndefined() // 路径字段缺席
    expect(
      parseChildOptions(['electron.exe', 'child.js', JSON.stringify({ ...JSON.parse(valid), port: 0 })]),
    ).toBeUndefined() // 非法端口
  })
})

describe('asReadyMessage（ready 守卫）', () => {
  it('形状齐备 → ready 消息（url/injections/双服务在场位）', () => {
    const ready = asReadyMessage({
      type: 'ready',
      url: 'http://127.0.0.1:1/#t',
      injections: [{ url: 'x.js' }],
      services: { forgeProjects: true, forgeKnowledge: false },
    })
    expect(ready).toEqual({
      type: 'ready',
      url: 'http://127.0.0.1:1/#t',
      injections: [{ url: 'x.js' }],
      services: { forgeProjects: true, forgeKnowledge: false },
    })
  })

  it('非 ready 消息（rpc-result 等）与形状残缺 → undefined', () => {
    expect(asReadyMessage({ type: 'rpc-result', id: 1, ok: true, data: 1 })).toBeUndefined()
    expect(asReadyMessage({ type: 'ready', injections: [], services: { forgeProjects: true } })).toBeUndefined()
    expect(asReadyMessage(null)).toBeUndefined()
  })
})

describe('dispatchRpc（子侧派发——结果面永不 reject）', () => {
  const request = (over: Partial<BridgeRpcRequest> = {}): BridgeRpcRequest => ({
    type: 'rpc',
    id: 7,
    service: 'forgeProjects',
    method: 'listProjects',
    args: [],
    ...over,
  })
  const services = {
    forgeProjects: {
      listProjects: async () => [{ id: 'p1', wsPath: 'C:/ws' }],
      getProject: () => {
        throw new Error('ERR_PROJECT_NOT_FOUND')
      },
    },
  }

  it('ok 态：方法执行 + wire 编码应用（Map → 信封）', async () => {
    const result = await dispatchRpc(
      { forgeKnowledge: { heatByEntry: async () => new Map([[3, 5]]) } },
      request({ service: 'forgeKnowledge', method: 'heatByEntry' }),
    )
    expect(result).toEqual({ type: 'rpc-result', id: 7, ok: true, data: { __dshForgeMap__: [[3, 5]] } })
  })

  it('服务方法异常 → ok=false + 错误信息（服务层 error code 透传）', async () => {
    const result = await dispatchRpc(services, request({ method: 'getProject', args: ['x'] }))
    expect(result.ok).toBe(false)
    expect((result as { error?: unknown }).error).toBe('ERR_PROJECT_NOT_FOUND')
  })

  it('typed error（fix-28）→ ok=false + 结构化形态（code/message/data 过桥保真）', async () => {
    const failure = new ProjectWriteLikeError({
      wsPath: 'C:\\ws\\demo',
      compensated: { workspaceId: 'ws-uuid-1', reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
    })
    const failing = { forgeProjects: { registerProject: () => { throw failure } } }
    const result = await dispatchRpc(failing, request({ method: 'registerProject', args: [{}] }))
    expect(result.ok).toBe(false)
    expect((result as { error?: unknown }).error).toEqual({
      code: 'ERR_PROJECT_WRITE',
      message: failure.message,
      data: {
        wsPath: 'C:\\ws\\demo',
        compensated: { workspaceId: 'ws-uuid-1', reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
      },
    })
  })

  it('伪造码 typed 形态（fix-28）→ 判型拒绝 → string 形态（fail-loud 语义不变）', async () => {
    const fake = new Error('fake code') as Error & { code: string }
    fake.code = 'ERR_MADE_UP'
    expect(serializeBridgeError(fake)).toBe('fake code')
    const plain = new Error('boom')
    expect(serializeBridgeError(plain)).toBe('boom')
    expect(serializeBridgeError('raw string')).toBe('raw string')
    expect(serializeBridgeError({ not: 'error' })).toBe('[object Object]')
  })

  it('服务/方法不在场 → ok=false（白名单外不可达）', async () => {
    expect((await dispatchRpc(services, request({ service: 'forgeKnowledge' }))).ok).toBe(false)
    expect((await dispatchRpc(services, request({ method: 'nope' }))).ok).toBe(false)
  })
})

describe('rebuildBridgeError（主侧双形态解码——fix-28 wire 兼容）', () => {
  it('string 旧形态 → 普通 Error（现行为不变——无 code/data 属性）', () => {
    const err = rebuildBridgeError('bridge: forgeProjects.nope 不在场')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('bridge: forgeProjects.nope 不在场')
    expect('code' in err).toBe(false)
    expect('data' in err).toBe(false)
  })

  it('结构化形态 → Error 重建 code/data 属性（rpcEnvelope 判型素材齐备）', () => {
    const err = rebuildBridgeError({
      code: 'ERR_PROJECT_WRITE',
      message: '应用库 projects 行写入失败（registry.delete 补偿已执行）',
      data: { wsPath: 'C:\\ws\\demo', compensated: { workspaceId: 'ws-uuid-1' } },
    }) as Error & { code?: unknown; data?: unknown }
    expect(err.message).toBe('应用库 projects 行写入失败（registry.delete 补偿已执行）')
    expect(err.code).toBe('ERR_PROJECT_WRITE')
    expect(err.data).toEqual({ wsPath: 'C:\\ws\\demo', compensated: { workspaceId: 'ws-uuid-1' } })
  })

  it('结构化形态字段缺席 → 按在场属性重建；message 非法 → 字符串化降级（绝不抛）', () => {
    const noCode = rebuildBridgeError({ message: 'x' }) as Error & { code?: unknown }
    expect(noCode.message).toBe('x')
    expect(noCode.code).toBeUndefined()
    const malformed = rebuildBridgeError({ message: 42, code: 'ERR_PROJECT_WRITE' } as unknown as { message: string })
    expect(malformed.message).toBe('[object Object]')
    expect((malformed as Error & { code?: unknown }).code).toBe('ERR_PROJECT_WRITE')
  })

  it('往返保真：serializeBridgeError → rebuildBridgeError → code/message/data 等值', () => {
    const failure = new ProjectWriteLikeError({ wsPath: 'C:\\ws\\rt', compensated: { workspaceId: 'ws-2' } })
    const rebuilt = rebuildBridgeError(serializeBridgeError(failure)) as Error & { code?: unknown; data?: unknown }
    expect(rebuilt.message).toBe(failure.message)
    expect(rebuilt.code).toBe('ERR_PROJECT_WRITE')
    expect(rebuilt.data).toEqual(failure.data)
  })
})

describe('createBridgeProxy（主侧代理）', () => {
  it('白名单方法逐一转发 (service, method, args) 并 wire 解码', async () => {
    const calls: Array<[string, string, readonly unknown[]]> = []
    const proxy = createBridgeProxy<Record<string, () => Promise<unknown>>>('forgeKnowledge', ['heatByEntry'], async (s, m, a) => {
      calls.push([s, m, a])
      return { __dshForgeMap__: [[2, 9]] } // 子侧 encodeWire 产物形状
    })
    const heat = (await proxy.heatByEntry()) as Map<number, number>
    expect(calls).toEqual([['forgeKnowledge', 'heatByEntry', []]])
    expect(heat).toBeInstanceOf(Map)
    expect(heat.get(2)).toBe(9)
  })

  it('方法白名单常量 = contracts 服务面全集（代理可达面锚）', () => {
    expect([...PROJECT_SERVICE_METHODS]).toEqual([
      'registerProject',
      'listProjects',
      'getProject',
      'updateProject',
      'reconcileAtStartup',
    ])
    expect([...KNOWLEDGE_SERVICE_METHODS]).toEqual([
      'rebuildIndex',
      'search',
      'readAbstract',
      'listEntries',
      'getEntryDetail',
      'heatByEntry',
      'sessionRecall',
      'browse',
    ])
  })
})

describe('extraPatchFiles（DSH_FORGE_PATCH_FILES 外部叠层清单）', () => {
  it("';' 分隔 + trim + 空段滤除；缺席 = 空清单", () => {
    expect(extraPatchFiles({ DSH_FORGE_PATCH_FILES: ' C:/a.yml ; ;C:/b.yml ' })).toEqual(['C:/a.yml', 'C:/b.yml'])
    expect(extraPatchFiles({})).toEqual([])
    expect(extraPatchFiles({ DSH_FORGE_PATCH_FILES: '' })).toEqual([])
  })
})
