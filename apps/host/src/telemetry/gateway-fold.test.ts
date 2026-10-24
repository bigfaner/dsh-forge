// 网关折叠点挂接单测（app-observability 1.2——官方缝 wrap，零改制）：非 RemoteError →
// emit 含栈 + rethrow（官方 invokeRpc 折叠行为不变）；RemoteError（结构标记）不触发。
// fix-1：causeStack 生境选项（dev）——折叠面 Error 改写为结构同型 Remote 承载
// details.causeStack 重抛/透传（官方 rpcFailure details 保真）；缺省 = 官方行为逐字不变。
import { describe, expect, it } from 'vitest'
import { attachGatewayFoldDiag, isFoldedInternalError, withCauseStack } from './gateway-fold.js'

/** RemoteError 结构同型（dsh-typert-protocol 结构标记——isDSHRemoteError + string code） */
function remoteError(code: string): Error {
  const e = new Error(`remote: ${code}`) as Error & { isDSHRemoteError: boolean; code: string }
  e.isDSHRemoteError = true
  e.code = code
  return e
}

function fakeGateway(): { prepareInvocation: () => Promise<never>; invokePrepared: () => Promise<never>; wireStream: { failure: (e: unknown) => unknown } } {
  return {
    prepareInvocation: async () => { throw new TypeError('boom at prepare') },
    invokePrepared: async () => { throw new TypeError('boom at invoke') },
    wireStream: { failure: (e) => ({ folded: String(e) }) },
  }
}

describe('isFoldedInternalError（gateway/internal 折叠面判定）', () => {
  it('非 RemoteError → true（折叠丢栈面）', () => {
    expect(isFoldedInternalError(new TypeError('x'))).toBe(true)
    expect(isFoldedInternalError('str')).toBe(true)
  })
  it('RemoteError 结构标记 → false（官方原样编码不丢信息）', () => {
    expect(isFoldedInternalError(remoteError('session/not-found'))).toBe(false)
  })
})

describe('attachGatewayFoldDiag（unary 双段 wrap + stream failure 替换）', () => {
  it('prepareInvocation 抛错 → emit 含栈 + 原错误 rethrow（官方折叠链不受扰）', async () => {
    const gateway = fakeGateway()
    const emitted: Array<{ error: unknown; phase: string }> = []
    attachGatewayFoldDiag(gateway, (error, phase) => emitted.push({ error, phase }))
    await expect(gateway.prepareInvocation()).rejects.toThrow(TypeError)
    expect(emitted).toEqual([{ error: expect.any(TypeError), phase: 'unary' }])
    expect((emitted[0]!.error as Error).stack).toContain('TypeError')
  })

  it('invokePrepared 抛错同构', async () => {
    const gateway = fakeGateway()
    const emitted: Array<{ phase: string }> = []
    attachGatewayFoldDiag(gateway, (_e, phase) => emitted.push({ phase }))
    await expect(gateway.invokePrepared()).rejects.toThrow('boom at invoke')
    expect(emitted).toEqual([{ phase: 'unary' }])
  })

  it('RemoteError 抛出 → 零 emit（非折叠面）', async () => {
    const gateway = { prepareInvocation: () => { throw remoteError('session/not-found') } }
    let called = 0
    attachGatewayFoldDiag(gateway, () => { called += 1 })
    await expect(gateway.prepareInvocation()).rejects.toThrow('remote')
    expect(called).toBe(0)
  })

  it('wireStream.failure 替换：非 RemoteError → emit + 原 failure 照常调用；RemoteError 零 emit', () => {
    const gateway = fakeGateway()
    const emitted: Array<{ phase: string }> = []
    attachGatewayFoldDiag(gateway, (_e, phase) => emitted.push({ phase }))
    expect(gateway.wireStream.failure(new Error('stream boom'))).toEqual({ folded: 'Error: stream boom' })
    gateway.wireStream.failure(remoteError('gateway/x'))
    expect(emitted).toEqual([{ phase: 'stream' }])
  })

  it('撤销面：恢复原方法/原 failure 引用', async () => {
    const gateway = fakeGateway()
    const originalPrepare = gateway.prepareInvocation
    const originalFailure = gateway.wireStream.failure
    const dispose = attachGatewayFoldDiag(gateway, () => {})
    dispose()
    expect(gateway.prepareInvocation).toBe(originalPrepare)
    expect(gateway.wireStream.failure).toBe(originalFailure)
  })

  it('形状缺席面 fail-soft（缺方法/缺 failure = 零挂接不抛）', () => {
    expect(() => attachGatewayFoldDiag({}, () => {})).not.toThrow()
    expect(() => attachGatewayFoldDiag({ wireStream: {} }, () => {})).not.toThrow()
  })
})

describe('causeStack 生境注入（fix-1 方案 6——dev 附栈 / 生产零税）', () => {
  /** 官方 rpcFailure 同构折叠（gateway/internal details 面断言替身——remoteErrorOf 结构判型） */
  const rpcFailure = (error: unknown): { ok: false; error: { code: string; message: string; details: unknown } } => {
    const v = error as { isDSHRemoteError?: boolean; code?: string; message?: string; details?: unknown }
    if (v?.isDSHRemoteError === true && typeof v.code === 'string') {
      return { ok: false, error: { code: v.code, message: v.message ?? '', details: v.details } }
    }
    return { ok: false, error: { code: 'gateway/internal', message: String((error as Error).message), details: {} } }
  }

  it('dev 生境：unary 折叠面 rethrow 结构同型 Remote——details.causeStack 含 TypeError 栈帧', async () => {
    const gateway = fakeGateway()
    attachGatewayFoldDiag(gateway, () => {}, { causeStack: true })
    const caught = await gateway.prepareInvocation().then(
      () => { throw new Error('should reject') },
      (e: unknown) => e,
    )
    const wire = rpcFailure(caught)
    expect(wire.error.code).toBe('gateway/internal')
    expect(wire.error.message).toBe('boom at prepare')
    expect((wire.error.details as { causeStack?: string }).causeStack).toEqual(expect.stringContaining('TypeError'))
  })

  it('dev 生境：stream 折叠面透传改写错误——原 failure 收到 details.causeStack 承载', () => {
    const gateway = fakeGateway()
    let failureArg: unknown
    const original = gateway.wireStream.failure
    gateway.wireStream.failure = (e) => { failureArg = e; return original(e) }
    attachGatewayFoldDiag(gateway, () => {}, { causeStack: true })
    gateway.wireStream.failure(new TypeError('stream boom'))
    const wire = rpcFailure(failureArg)
    expect(wire.error.code).toBe('gateway/internal')
    expect(wire.error.message).toBe('stream boom')
    expect((wire.error.details as { causeStack?: string }).causeStack).toEqual(expect.stringContaining('TypeError'))
  })

  it('dev 生境：RemoteError 非折叠面——原样透传零改写', async () => {
    const gateway = { prepareInvocation: () => { throw remoteError('session/not-found') } }
    attachGatewayFoldDiag(gateway, () => {}, { causeStack: true })
    await expect(gateway.prepareInvocation()).rejects.toThrow('remote: session/not-found')
  })

  it('生产生境（缺省）：unary 原错误 rethrow、stream 原 failure 收原错误——官方行为逐字不变', async () => {
    const gateway = fakeGateway()
    let failureArg: unknown
    const original = gateway.wireStream.failure
    gateway.wireStream.failure = (e) => { failureArg = e; return original(e) }
    attachGatewayFoldDiag(gateway, () => {})
    await expect(gateway.prepareInvocation()).rejects.toThrow(TypeError)
    gateway.wireStream.failure(new TypeError('stream boom'))
    expect(failureArg).toBeInstanceOf(TypeError)
    expect('isDSHRemoteError' in (failureArg as object)).toBe(false)
  })

  it('withCauseStack：非 Error 原样返回；RemoteError 不经本函数（折叠面判定先行）', () => {
    expect(withCauseStack('str')).toBe('str')
    const e = new TypeError('x')
    const shaped = withCauseStack(e) as { isDSHRemoteError: boolean; code: string; details: { causeStack?: string } }
    expect(shaped.isDSHRemoteError).toBe(true)
    expect(shaped.code).toBe('gateway/internal')
    expect(shaped.details.causeStack).toContain('TypeError')
  })
})
