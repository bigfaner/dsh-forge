// 网关折叠点挂接单测（app-observability 1.2——官方缝 wrap，零改制）：非 RemoteError →
// emit 含栈 + rethrow（官方 invokeRpc 折叠行为不变）；RemoteError（结构标记）不触发。
import { describe, expect, it } from 'vitest'
import { attachGatewayFoldDiag, isFoldedInternalError } from './gateway-fold.js'

/** RemoteError 结构同型（dsh-typert-protocol 结构标记——isDSHRemoteError + string code） */
function remoteError(code: string): Error {
  const e = new Error(`remote: ${code}`) as Error & { isDSHRemoteError: boolean; code: string }
  e.isDSHRemoteError = true
  e.code = code
  return e
}

function fakeGateway(): { prepareInvocation: () => never; invokePrepared: () => never; wireStream: { failure: (e: unknown) => unknown } } {
  return {
    prepareInvocation: () => { throw new TypeError('boom at prepare') },
    invokePrepared: () => { throw new TypeError('boom at invoke') },
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
    expect((emitted[0].error as Error).stack).toContain('TypeError')
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
