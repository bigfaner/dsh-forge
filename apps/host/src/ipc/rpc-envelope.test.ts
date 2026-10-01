// 2.4 AC2 单元层——typed error 边界序列化保真（{ code, message, data }）。
// core 错误类结构同型复刻（code/data 成员 + Error 基类；真类的端到端保真见 projects-rpc.test.ts 实层）。
import { describe, expect, it } from 'vitest'
import { rpcEnvelope, serializeRpcError } from './rpc-envelope.js'

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
