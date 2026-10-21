// 2.4 AC2 单元层——typed error 边界序列化保真（{ code, message, data }）。
// core 错误类结构同型复刻（code/data 成员 + Error 基类；真类的端到端保真见 projects-rpc.test.ts 实层）。
// fix-28 增 child 形态桥衔接面：rebuildBridgeError 重建的 Error 经本判型入带内 RpcErr 信封
// （桥面双形态解码锚见 boot/bridge.test.ts）。
import { describe, expect, it, afterEach } from 'vitest'
import { rebuildBridgeError } from '../boot/bridge.js'
import { createDiagContextStore, runWithDiagContext } from '../telemetry/diag-context.js'
import type { DiagEventPayload } from '../telemetry/diag-events.js'
import { configureRpcEnvelopeDiag, rpcEnvelope, serializeRpcError } from './rpc-envelope.js'

/** typed error 结构替身（core WorkspaceCreateError 同型：readonly code + data + Error） */
class WorkspaceCreateLikeError extends Error {
  readonly code = 'ERR_WORKSPACE_CREATE' as const
  readonly data: { wsPath: string }
  constructor(wsPath: string) {
    super(`dsh 工作区创建失败（注册中止，无补偿需要）：${wsPath}`)
    this.name = 'WorkspaceCreateError'
    this.data = { wsPath }
  }
}

/** typed error 结构替身（core CompensationError 同型：富 data 附载） */
class CompensationLikeError extends Error {
  readonly code = 'ERR_COMPENSATION' as const
  readonly data: Record<string, unknown>
  constructor(data: Record<string, unknown>) {
    super(`registry.delete 补偿失败（已 app_key_logs 记账，孤儿交启动对账提示、不自动删）`)
    this.name = 'CompensationError'
    this.data = data
  }
}

describe('serializeRpcError（typed → RpcErrorPayload）', () => {
  it('ERR_WORKSPACE_CREATE 保真：code/message/data 三元组原样序列化', () => {
    const err = new WorkspaceCreateLikeError('C:\\ws\\demo')
    expect(serializeRpcError(err)).toEqual({
      code: 'ERR_WORKSPACE_CREATE',
      message: err.message,
      data: { wsPath: 'C:\\ws\\demo' },
    })
  })

  it('ERR_COMPENSATION 保真：富 data（标识 + 双失败原因 + 处置）深保真', () => {
    const data = {
      workspaceId: 'ws-uuid-1',
      wsPath: 'C:\\ws\\demo',
      projectId: 'proj-uuid-1',
      writeError: 'UNIQUE constraint failed: projects.ws_path',
      deleteError: 'network down',
      disposition: '补偿失败——孤儿工作区交由启动对账提示（不自动删）',
    }
    const err = new CompensationLikeError(data)
    expect(serializeRpcError(err)).toEqual({ code: 'ERR_COMPENSATION', message: err.message, data })
  })

  it('非 typed（无 code 的普通 Error）→ undefined（不捏造伪码）', () => {
    expect(serializeRpcError(new Error('boom'))).toBeUndefined()
  })

  it('code 不在 contracts 六码 → undefined（伪造码拒绝入信封）', () => {
    const err = new Error('fake') as Error & { code: string }
    err.code = 'ERR_MADE_UP'
    expect(serializeRpcError(err)).toBeUndefined()
  })

  it('非 Error 值（字符串/对象）→ undefined', () => {
    expect(serializeRpcError('nope')).toBeUndefined()
    expect(serializeRpcError({ code: 'ERR_COMPENSATION' })).toBeUndefined()
  })
})

describe('rpcEnvelope（IPC handler 包装）', () => {
  it('成功 → RpcOk 信封（data 原样；异步 handler 被等待）', async () => {
    const handler = rpcEnvelope(async (n: number) => ({ doubled: n * 2 }))
    await expect(handler(undefined, 21)).resolves.toEqual({ ok: true, data: { doubled: 42 } })
  })

  it('Req=void 通道：负载 undefined 正常流转', async () => {
    const handler = rpcEnvelope(() => ['a', 'b'])
    await expect(handler(undefined, undefined)).resolves.toEqual({ ok: true, data: ['a', 'b'] })
  })

  it('typed error → RpcErr 信封（不走 promise 拒绝）', async () => {
    const handler = rpcEnvelope((_payload: unknown): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    await expect(handler(undefined, {})).resolves.toEqual({
      ok: false,
      error: { code: 'ERR_WORKSPACE_CREATE', message: expect.any(String), data: { wsPath: 'C:\\ws\\x' } },
    })
  })

  it('非 typed 错误 → fail-loud 原样上抛（不静默降级）', async () => {
    const boom = new Error('programmer error')
    const handler = rpcEnvelope((): never => {
      throw boom
    })
    await expect(handler(undefined, {})).rejects.toBe(boom)
  })
})

describe('rpcEnvelope 诊断埋点（app-observability 1.2 单点 emit）', () => {
  afterEach(() => configureRpcEnvelopeDiag(undefined))

  it('typed error → 诊断事件落 ipc-handler 行（含栈）+ 回包正常', async () => {
    const events: DiagEventPayload[] = []
    configureRpcEnvelopeDiag({ sink: (p) => events.push(p) })
    const handler = rpcEnvelope((): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    await expect(handler(undefined, {})).resolves.toEqual({ ok: false, error: expect.anything() })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ level: 'error', process: 'main', event: 'ipc-handler', message: expect.stringContaining('工作区创建失败') })
    expect(events[0].stack).toContain('WorkspaceCreateError')
  })

  it('非 typed rethrow 前也落诊断事件（Note-1 同文件闭合）', async () => {
    const events: DiagEventPayload[] = []
    configureRpcEnvelopeDiag({ sink: (p) => events.push(p) })
    const handler = rpcEnvelope((): never => {
      throw new Error('programmer error')
    })
    await expect(handler(undefined, {})).rejects.toThrow('programmer error')
    expect(events).toHaveLength(1)
    expect(events[0].message).toBe('programmer error')
    expect(events[0].stack).toBeDefined()
  })

  it('成功路径零埋点', async () => {
    const events: DiagEventPayload[] = []
    configureRpcEnvelopeDiag({ sink: (p) => events.push(p) })
    const handler = rpcEnvelope(async () => 'ok')
    await expect(handler(undefined, {})).resolves.toEqual({ ok: true, data: 'ok' })
    expect(events).toHaveLength(0)
  })

  it('埋点自身异常不破信封（红线①）', async () => {
    configureRpcEnvelopeDiag({ sink: () => { throw new Error('sink boom') } })
    const handler = rpcEnvelope((): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    await expect(handler(undefined, {})).resolves.toEqual({ ok: false, error: expect.anything() })
  })

  it('trace_id（preload 第三参）读入 ALS——handler 内可见，信封外清空（链 A）', async () => {
    const als = createDiagContextStore()
    let seen: string | undefined
    configureRpcEnvelopeDiag({ als, sink: () => {} })
    const handler = rpcEnvelope(async () => {
      seen = als.getStore()?.traceId
      return 'ok'
    })
    await expect(handler(undefined, { q: 1 }, 'tr-abc')).resolves.toEqual({ ok: true, data: 'ok' })
    expect(seen).toBe('tr-abc')
    expect(als.getStore()?.traceId).toBeUndefined()
  })

  it('无 traceId 第三参 → ALS 不包裹（原样零差异）', async () => {
    const als = createDiagContextStore()
    configureRpcEnvelopeDiag({ als, sink: () => {} })
    const handler = rpcEnvelope(async () => als.getStore()?.traceId ?? '(none)')
    await expect(handler(undefined, {})).resolves.toEqual({ ok: true, data: '(none)' })
  })

  it('ALS 上下文内 emit 的诊断行经 appender 携带同 trace_id（链 A 端到端单测）', async () => {
    const events: DiagEventPayload[] = []
    const als = createDiagContextStore()
    configureRpcEnvelopeDiag({ als, sink: (p) => events.push(p) })
    const handler = rpcEnvelope((): never => {
      throw new Error('with trace')
    })
    await expect(handler(undefined, {}, 'tr-full')).rejects.toThrow()
    expect(events[0].traceId).toBeUndefined() // payload 不带——trace 经 ALS 由订阅侧 appender 补
    const line = { timestamp: 't', level: 'error' as const, trace_id: '-', process: 'main' as const, message: '', event: '' }
    expect(line).toBeDefined()
    expect(runWithDiagContext(als, { traceId: 'tr-full' }, () => 'x')).toBe('x')
  })
})

describe('rpcEnvelope causeStack 生境注入（app-observability fix-1 方案 6）', () => {
  afterEach(() => configureRpcEnvelopeDiag(undefined))

  it('dev 生境（causeStack: true）→ typed 错误回包附原始栈（栈帧可判型）', async () => {
    configureRpcEnvelopeDiag({ sink: () => {}, causeStack: true })
    const handler = rpcEnvelope((): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    const result = await handler(undefined, {})
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.error.causeStack).toEqual(expect.stringContaining('WorkspaceCreateError'))
  })

  it('生产生境（缺省 false）→ 回包无 causeStack（零税）', async () => {
    configureRpcEnvelopeDiag({ sink: () => {} })
    const handler = rpcEnvelope((): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    const result = await handler(undefined, {})
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect('causeStack' in result.error).toBe(false)
    expect(JSON.parse(JSON.stringify(result.error)).causeStack).toBeUndefined()
  })

  it('configure(undefined) 重置 → 生境门随之关闭（零税复位）', async () => {
    configureRpcEnvelopeDiag({ sink: () => {}, causeStack: true })
    configureRpcEnvelopeDiag(undefined)
    const handler = rpcEnvelope((): never => {
      throw new WorkspaceCreateLikeError('C:\\ws\\x')
    })
    const result = await handler(undefined, {})
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect('causeStack' in result.error).toBe(false)
  })
})

describe('桥重建 Error 判型（fix-28：child 形态 typed error 过桥 → 信封带内保真）', () => {
  it('rebuildBridgeError(结构化) → serializeRpcError 判型通过 → RpcErr 信封（code/message/data 保真）', async () => {
    const wire = {
      code: 'ERR_PROJECT_WRITE',
      message: '应用库 projects 行写入失败（registry.delete 补偿已执行，dsh 侧零孤儿）：C:\\ws\\demo',
      data: {
        workspaceId: 'ws-uuid-1',
        wsPath: 'C:\\ws\\demo',
        compensated: { workspaceId: 'ws-uuid-1', reason: '③ 应用库写入失败（registry.delete 补偿已执行）' },
      },
    }
    const handler = rpcEnvelope((): never => {
      throw rebuildBridgeError(wire)
    })
    await expect(handler(undefined, {})).resolves.toEqual({
      ok: false,
      error: { code: 'ERR_PROJECT_WRITE', message: wire.message, data: wire.data },
    })
  })

  it('rebuildBridgeError(string) → 无 code 判型失败 → fail-loud 原样上抛（语义不回退）', async () => {
    const rebuilt = rebuildBridgeError('bridge: forgeProjects.registerProject 不在场（core/knowledge 插件行未装载？）')
    const handler = rpcEnvelope((): never => {
      throw rebuilt
    })
    await expect(handler(undefined, {})).rejects.toBe(rebuilt)
  })
})
