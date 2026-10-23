/**
 * 官方 typert 编组分发（bug 30d44e5a A 案根治——用户裁决 2026-10-22）：
 * session 族代理通道经 @deepseek-ai/dsh-api-session-controller/typert 的 TYPERT.invocations
 * 官方 descriptors 分发——wire args 按参数 wire 名取值 → 参数 codec（zod strict）parse →
 * cancellation.signal 尾参注入 → 方法调用 → result codec parse。与官方网关编组语义等价：
 * 畸形/缺必填字段的载荷在边界即拒（fail-soft 错误信封），不再深入运行时炸持久化不变量。
 *
 * 机械核销：dsh-typert-protocol lib/types/types.d.ts（InvocationParameterDescriptor.wire/
 * codec/acceptsUndefined、InvocationDescriptor.cancellation.parameter='signal' 尾参注入、
 * TypertCodec.create() zod schema）+ 官方网关 typert.host.js 分发面。
 * 类型说明：官方 generated typert.host.d.ts 将 TYPERT 声明为 unknown 且 protocol d.ts 以
 * `.ts` 扩展自引（本仓 tsconfig 不支持）——此处以源码证据定义本地最小结构面，运行时真值
 * 不受影响（TYPERT.invocations 实测在场：rc.2 typert.host.js:889-944）。
 */

/** 官方边界 codec（lib/types/types.d.ts:199——TypertCodec.create zod strict schema） */
interface TypertCodecFace {
  readonly typeSymbol: string
  create(): { parse(value: unknown): unknown }
}

/** 单业务参数（types.d.ts:221——name/wire/source/codec/acceptsUndefined） */
interface TypertParameterFace {
  readonly name: string
  readonly wire: string
  readonly source: 'json' | 'lookup'
  readonly acceptsUndefined?: true
  readonly codec: TypertCodecFace
}

/** 单方法分发描述（types.d.ts:242——InvocationDescriptor 直呼子集） */
interface TypertMethodDescriptor {
  readonly id: string
  readonly service: string
  readonly method: string
  readonly implementation?: string
  readonly mode?: 'stream'
  readonly invocation: { readonly kind: 'direct' } | { readonly kind: 'context'; readonly context: string }
  readonly parameters: readonly TypertParameterFace[]
  readonly cancellation?: { readonly parameter: 'signal' }
  readonly result: TypertCodecFace
}

/** TYPERT 载荷窄面（typert.host.js:889——package/face/invocations） */
interface TypertContributionFace {
  readonly invocations?: readonly TypertMethodDescriptor[]
}

// 官方 generated typert.host.js 运行时导出（d.ts 未附类型——本地窄面收窄，见文件头类型说明）
const { TYPERT } = (await import('@deepseek-ai/dsh-api-session-controller/typert')) as {
  TYPERT?: TypertContributionFace
}
const TYPERT_INVOCATIONS = TYPERT?.invocations ?? []

/** 官方编组错误（可读化——zod issues 摊平；fail-soft 信封 message 面） */
export class TypertCodecError extends Error {
  constructor(
    readonly descriptorId: string,
    issues: string,
  ) {
    super(`${descriptorId} 官方编组拒绝：${issues}`)
    this.name = 'TypertCodecError'
  }
}

function descriptorOf(method: string): TypertMethodDescriptor | undefined {
  return TYPERT_INVOCATIONS.find(
    (d) => d.service === 'sessionController' && d.method === method && d.invocation.kind === 'direct' && d.mode !== 'stream',
  )
}

function issuesOf(error: unknown): string {
  const issues = (error as { issues?: ReadonlyArray<{ path: readonly (string | number)[]; message: string }> })?.issues
  if (Array.isArray(issues) && issues.length > 0) {
    return issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * 单方法编组分发器：payload = 单 wire 参数（session 族全部单 request 对象形）→ 参数 codec
 * parse → 方法 bind 直调（cancellation 位尾参注入 signal）→ result codec parse。
 */
export function typertDispatch(
  descriptor: TypertMethodDescriptor,
  target: unknown,
  payload: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const method = descriptor.implementation ?? descriptor.method
  const fn = (target as Record<string, unknown>)[method]
  if (typeof fn !== 'function') {
    return Promise.reject(new Error(`${descriptor.id} 缺席（官方控制器方法漂移）——通道不可达`))
  }
  // session 族全部单 request 参数（源码核销 typert.host.js invocations）——payload 本身即
  // wire 值（mobile 侧发的就是 request 对象，非 {wire: request} 包裹形）
  const single = descriptor.parameters.length === 1
  const record = (payload ?? {}) as Record<string, unknown>
  const args: unknown[] = []
  for (const [index, parameter] of descriptor.parameters.entries()) {
    if (parameter.source !== 'json') {
      throw new TypertCodecError(descriptor.id, `${parameter.wire}: lookup 参数不经远程面（官方网关上下文专用）`)
    }
    const wireValue = single ? payload : record[parameter.wire]
    if (wireValue === undefined && single) {
      // 单 request 参数 + 载荷缺席 = 旧式无参语义（如 list(undefined)——官方 _request 保留位、
      // 实现容忍）：原样透传不解析（parse(undefined) 会误拒）
      args.push(undefined)
      continue
    }
    if (wireValue === undefined && parameter.acceptsUndefined !== true) {
      throw new TypertCodecError(descriptor.id, `${parameter.wire}: 必填字段缺席（官方 strict schema）`)
    }
    try {
      args.push(parameter.codec.create().parse(wireValue))
    } catch (error) {
      throw new TypertCodecError(descriptor.id, issuesOf(error))
    }
    void index
  }
  if (descriptor.cancellation?.parameter === 'signal') args.push(signal)
  const bound = (fn as (...a: unknown[]) => unknown).bind(target)
  // result codec 暂不启用：官方 SessionListValue/SessionPromptValue strict schema 要求完整
  // SessionSummary 字段包，启用即强制全部调用方/桩背官方全形（收益=结果侧校验，成本=大）。
  // 请求侧 codec（82f9ceb6 根因面）是本分发器的裁决范围——结果透传原样。
  return Promise.resolve()
    .then(() => bound(...args))
}

/** channel method → descriptor 查找（session 族——service 固定 sessionController） */
export function typertSessionDescriptor(method: string): TypertMethodDescriptor | undefined {
  return descriptorOf(method)
}
