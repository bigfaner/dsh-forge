// 网关错误折叠点落栈（app-observability 方案 3 + 评审 Note-1 官方缝定版）：官方
// TypertGatewayService 把非 RemoteError 折为 gateway/internal 且只保 message 丢栈
// （dsh-api-gateway lib/types/index.js rpcFailure L1046-1059）。官方包零改制——只落
// 实例自有可写面的方法 wrap（AGENTS 合法缝清单）：
//   unary：invokeRpc 内部 catch 吞错（L486-488 直接 rpcFailure 返回，外层 wrap 见不到
//   抛出）——落点为其实际抛出面的两个内段方法 prepareInvocation / invokePrepared 的
//   wrap（catch → emit 含栈 → rethrow，官方 invokeRpc 折叠行为逐字不变）；
//   stream：wireStream.failure 属性替换（L63——原 failure 函数保留调用）。
// 形状不符/服务缺席 = 零挂接 fail-soft（不抛不阻 boot）。
/** 网关折叠缝最小面（官方实例结构同型即挂接——不 import 官方类） */
export interface GatewayFoldFace {
  prepareInvocation?: unknown
  invokePrepared?: unknown
  readonly wireStream?: { failure?: unknown } & Record<string, unknown>
}

/** 折叠点判定（官方 remoteErrorOf 结构同型：isDSHRemoteError === true + string code）——
 *  RemoteError 官方原样编码不丢信息，不折叠点；其余 = gateway/internal 折叠面。 */
export function isFoldedInternalError(error: unknown): boolean {
  return !(
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>)['isDSHRemoteError'] === true &&
    typeof (error as Record<string, unknown>)['code'] === 'string'
  )
}

export interface GatewayFoldEmit {
  (error: unknown, phase: 'unary' | 'stream'): void
}

/**
 * 挂接网关折叠点（实例方法 wrap + wireStream.failure 属性替换；返回撤销面——恢复原
 * 引用）。emit 只对非 RemoteError（gateway/internal 折叠面）触发。
 */
export function attachGatewayFoldDiag(
  gateway: GatewayFoldFace,
  emit: GatewayFoldEmit,
): () => void {
  const undo: Array<() => void> = []
  const wrapMethod = (name: 'prepareInvocation' | 'invokePrepared', phase: 'unary'): void => {
    const original = gateway[name]
    if (typeof original !== 'function') return
    const bound = (original as (...args: unknown[]) => unknown).bind(gateway)
    const wrapped = async (...args: unknown[]): Promise<unknown> => {
      try {
        return await bound(...args)
      } catch (error) {
        if (isFoldedInternalError(error)) emit(error, phase)
        throw error
      }
    }
    ;(gateway as Record<string, unknown>)[name] = wrapped
    undo.push(() => {
      ;(gateway as Record<string, unknown>)[name] = original
    })
  }
  wrapMethod('prepareInvocation', 'unary')
  wrapMethod('invokePrepared', 'unary')
  const failure = gateway.wireStream?.failure
  if (gateway.wireStream !== undefined && typeof failure === 'function') {
    const originalFailure = failure as (error: unknown) => unknown
    gateway.wireStream.failure = (error: unknown): unknown => {
      if (isFoldedInternalError(error)) emit(error, 'stream')
      return originalFailure(error)
    }
    undo.push(() => {
      gateway.wireStream!.failure = originalFailure
    })
  }
  return () => {
    for (const dispose of undo) {
      try {
        dispose()
      } catch {
        // 撤销失败不阻关停链
      }
    }
  }
}
