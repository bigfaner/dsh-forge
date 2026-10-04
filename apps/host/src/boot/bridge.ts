// boot 子进程桥协议（fix-1；定位：基础）——child 形态的全部纯逻辑，进程编排归 run.ts。
// 动机：direct-in-main 形态（runProfile 跑 Electron main）boot 可跑但 agent 工具派发
// 恒挂起（4.2 dogfood 插桩实证：模型往返正常、任意工具 3min+ 不返回、ToolRuntime
// prepare/dispatch 全未进入、会话文件不落盘）——官方 Desktop 素以 child 形态跑宿主
// （ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程，S1 spike run3 验证 boot）。
// 本模块承载：
//   · IPC 消息形状（ready/fatal/rpc-result ↔ rpc/shutdown）与 ready 守卫
//   · wire 编解码（Map → entries 信封——Node IPC 缺省 JSON 序列化不保 Map；
//     heatByEntry 为产品面唯一 Map 返回体）
//   · 子进程 argv 选项解析（BootDshOptions JSON 单串）与外部叠层清单解析
//   · 子侧 RPC 派发（白名单 service.method 动态调用 + 异常归一，永不 reject）
//   · 主侧服务代理（方法白名单 → call 转发 + wire 解码）
//   · 错误过桥保真（fix-28）：子侧 typed error 判型镜像 serializeRpcError → 结构化
//     {code,message,data} 上桥；主侧双形态解码重建带 code/data 的 Error——经
//     rpcEnvelope 判型后走带内 RpcErr 信封（child 形态下 UI 六码文案映射的通路半边）
// 零 node:child_process 依赖——纯函数逐项单测锚定（bridge.test.ts）。
import { ERROR_CODES } from '@dsh-forge/contracts'
import type { BootDshOptions } from './run.js'

/** 桥接服务名（产品双服务——runProfile ctx 面世，main 侧 forge:* 通道接线） */
export type BridgeServiceName = 'forgeProjects' | 'forgeKnowledge'

/** 主 → 子：RPC 调用（id 供 rpc-result 关联回） */
export interface BridgeRpcRequest {
  readonly type: 'rpc'
  readonly id: number
  readonly service: BridgeServiceName
  readonly method: string
  readonly args: readonly unknown[]
}

/** 主 → 子：优雅关停（子侧 ProcessShutdown.shutdown(0)——内部 5s 升级强退） */
export interface BridgeShutdownRequest {
  readonly type: 'shutdown'
}

export type MainToChildMessage = BridgeRpcRequest | BridgeShutdownRequest

/** 子 → 主：boot 就绪（manifest 面 {url, injections} + 双服务在场位） */
export interface BridgeReadyMessage {
  readonly type: 'ready'
  readonly url: string
  readonly injections: readonly unknown[]
  readonly services: Readonly<Record<BridgeServiceName, boolean>>
}

/** 子 → 主：boot 致命失败（main 侧 catch → app.exit(1) 消费） */
export interface BridgeFatalMessage {
  readonly type: 'fatal'
  readonly message: string
}

/**
 * 桥错误结构化形态（fix-28：typed error 过桥保真）。code ∈ contracts 六码（子侧判型
 * 保证）；data = RpcErrorPayload.data 同源附载。string 旧形态 = 非 typed（fail-loud
 * 语义——不捏造结构化）。
 */
export interface BridgeErrorPayload {
  readonly code?: string
  readonly message: string
  readonly data?: unknown
}

/** 子 → 主：RPC 结果（ok=false 时 error 承载服务失败信息——双形态：string = 非 typed / 结构化 = typed） */
export interface BridgeRpcResultMessage {
  readonly type: 'rpc-result'
  readonly id: number
  readonly ok: boolean
  readonly data?: unknown
  readonly error?: string | BridgeErrorPayload
}

export type ChildToMainMessage = BridgeReadyMessage | BridgeFatalMessage | BridgeRpcResultMessage

/** ProjectService 方法白名单（Interface 1 五法；主侧代理与子侧可达面共用锚） */
export const PROJECT_SERVICE_METHODS = [
  'registerProject',
  'listProjects',
  'getProject',
  'updateProject',
  'reconcileAtStartup',
] as const

/** KnowledgeService + browse 方法白名单（Interface 2 七法 + 聚合第八法） */
export const KNOWLEDGE_SERVICE_METHODS = [
  'rebuildIndex',
  'search',
  'readAbstract',
  'listEntries',
  'getEntryDetail',
  'heatByEntry',
  'sessionRecall',
  'browse',
] as const

/** Map wire 信封键（产品 DTO 面无此键——碰撞面为零） */
const MAP_ENVELOPE = '__dshForgeMap__'

/** wire 编码：Map → entries 信封（IPC 缺省 JSON 序列化不保 Map；其余原样） */
export function encodeWire(value: unknown): unknown {
  if (value instanceof Map) return { [MAP_ENVELOPE]: [...value.entries()] }
  return value
}

/** wire 解码：entries 信封 → Map（非信封/载荷非法原样降级——绝不抛） */
export function decodeWire(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !(MAP_ENVELOPE in value)) return value
  const entries = (value as Record<string, unknown>)[MAP_ENVELOPE]
  if (!Array.isArray(entries)) return value
  return new Map(entries as readonly (readonly [unknown, unknown])[])
}

/**
 * 子进程 argv 选项解析（argv[2] = BootDshOptions JSON——spawn 约定见 run.ts）。
 * 形状非法一律 undefined（子入口据此 fatal 上报，不在桥层猜测默认值）。
 */
export function parseChildOptions(argv: readonly string[]): BootDshOptions | undefined {
  const raw = argv.length > 2 ? argv[2] : undefined
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const o = parsed as Record<string, unknown>
  for (const key of ['profileDir', 'installAnchor', 'stateDb', 'bindingsFile'] as const) {
    if (typeof o[key] !== 'string' || (o[key] as string) === '') return undefined
  }
  if (typeof o.port !== 'number' || !Number.isInteger(o.port) || o.port <= 0) return undefined
  return {
    profileDir: o.profileDir as string,
    installAnchor: o.installAnchor as string,
    port: o.port,
    stateDb: o.stateDb as string,
    bindingsFile: o.bindingsFile as string,
  }
}

/**
 * ready 消息守卫（子 → 主消息的最小形状校验——url/injections/双服务在场位齐备
 * 才可作 manifest 面；其余消息（rpc-result 等）返回 undefined 由调用方分流）。
 */
export function asReadyMessage(message: unknown): BridgeReadyMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'ready' || typeof m.url !== 'string' || !Array.isArray(m.injections)) return undefined
  const services = m.services
  if (typeof services !== 'object' || services === null) return undefined
  const { forgeProjects, forgeKnowledge } = services as Record<string, unknown>
  if (typeof forgeProjects !== 'boolean' || typeof forgeKnowledge !== 'boolean') return undefined
  return { type: 'ready', url: m.url, injections: m.injections, services: { forgeProjects, forgeKnowledge } }
}

/**
 * 子侧 RPC 派发（纯函数——child.ts 以 process 消息驱动）。服务/方法不在场或执行
 * 异常均归一为 ok=false 结果消息（永不 reject——IPC 结果面单通道，调用侧按 error 结算）。
 */
export async function dispatchRpc(
  services: Partial<Record<BridgeServiceName, object>>,
  request: BridgeRpcRequest,
): Promise<BridgeRpcResultMessage> {
  const target = services[request.service] as Record<string, unknown> | undefined
  const method = target?.[request.method]
  if (target === undefined || typeof method !== 'function') {
    return {
      type: 'rpc-result',
      id: request.id,
      ok: false,
      error: `bridge: ${request.service}.${request.method} 不在场（core/knowledge 插件行未装载？）`,
    }
  }
  try {
    const data = await (method as (...args: readonly unknown[]) => Promise<unknown> | unknown)(
      ...request.args,
    )
    return { type: 'rpc-result', id: request.id, ok: true, data: encodeWire(data) }
  } catch (cause) {
    return { type: 'rpc-result', id: request.id, ok: false, error: serializeBridgeError(cause) }
  }
}

/**
 * 子侧错误判型（fix-28——serializeRpcError 逻辑镜像）：Error 且 code ∈ contracts 六码 →
 * 结构化 {code,message,data}（code/data 过桥保真）；其余（无 code / 伪造码 / 非 Error）→
 * message string（现行为不变——非 typed fail-loud 语义）。判型自持本模块：host 禁 import
 * core 错误类（结构同型即判型，同 rpc-envelope 口径），contracts ERROR_CODES 可 import。
 */
export function serializeBridgeError(cause: unknown): string | BridgeErrorPayload {
  if (cause instanceof Error) {
    const { code, data } = cause as Error & { code?: unknown; data?: unknown }
    if (typeof code === 'string' && (ERROR_CODES as readonly string[]).includes(code)) {
      return { code, message: cause.message, data }
    }
    return cause.message
  }
  return String(cause)
}

/**
 * 主侧错误重建（fix-28 双形态解码——wire 兼容）：string（旧形态 / 非 typed）→ 普通 Error
 * （现行为不变）；结构化 → Error + code/data 赋属性 → rpcEnvelope 判型通过 → 带内
 * RpcErr 信封 → renderer 侧 RpcClientError instanceof 恢复命中（UI 六码文案映射通路）。
 * 形状残缺（message 非 string 等——对端版本错配期）降级为字符串化 Error，绝不抛。
 */
export function rebuildBridgeError(error: string | BridgeErrorPayload): Error {
  if (typeof error === 'string') return new Error(error)
  const shape = error as { code?: unknown; message?: unknown; data?: unknown }
  const message = typeof shape.message === 'string' ? shape.message : String(error)
  const rebuilt = new Error(message) as Error & { code?: unknown; data?: unknown }
  if (typeof shape.code === 'string') rebuilt.code = shape.code
  if ('data' in shape) rebuilt.data = shape.data
  return rebuilt
}

/**
 * 主侧服务代理（方法白名单 → call 转发 + wire 解码）。类型面：T 为 contracts 服务
 * 结构类型，白名单常量即 T 的方法名全集锚（RPC 边界动态调用，类型由白名单承载）。
 */
export function createBridgeProxy<T extends object>(
  service: BridgeServiceName,
  methods: readonly string[],
  call: (service: BridgeServiceName, method: string, args: readonly unknown[]) => Promise<unknown>,
): T {
  const proxy: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
  for (const method of methods) {
    proxy[method] = (...args: unknown[]) => call(service, method, args).then(decodeWire)
  }
  return proxy as T
}

/**
 * 外部叠层清单（DSH_FORGE_PATCH_FILES——';' 分隔的 patch yaml 路径；e2e/调试用）：
 * 用户层与 boot overlay 之后应用（runProfile patchFiles 序 = 应用序）。0.2.0-rc.2
 * 设置面 = profile 插件行 config，e2e 以此注入 dogfood 模型行而不改仓内共享
 * profile——见 e2e/specs/flywheel.spec.ts（4.2）。child 形态下由子进程读取
 * （env 经 spawn 继承，语义与 direct 形态逐字一致）。
 */
export function extraPatchFiles(env: { DSH_FORGE_PATCH_FILES?: string }): readonly string[] {
  return (env.DSH_FORGE_PATCH_FILES ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '')
}
