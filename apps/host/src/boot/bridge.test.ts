// fix-1 boot 子进程桥协议 pin：消息形状守卫 / Map wire 编解码 / argv 选项解析 /
// 子侧 RPC 派发（ok 与 fail 双态）/ 主侧代理转发与白名单——child 形态的纯逻辑面
// 逐项锚定（进程编排在 run.ts，e2e 面 = flywheel.spec.ts）。
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
  type BridgeRpcRequest,
} from './bridge.js'

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
    expect((result as { error?: string }).error).toBe('ERR_PROJECT_NOT_FOUND')
  })

  it('服务/方法不在场 → ok=false（白名单外不可达）', async () => {
    expect((await dispatchRpc(services, request({ service: 'forgeKnowledge' }))).ok).toBe(false)
    expect((await dispatchRpc(services, request({ method: 'nope' }))).ok).toBe(false)
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
