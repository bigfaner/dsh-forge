// boot 子进程桥协议（fix-1；定位：基础）——child 形态的全部纯逻辑，进程编排归 run.ts。
// 动机：direct-in-main 形态（runProfile 跑 Electron main）boot 可跑但 agent 工具派发
// 恒挂起（4.2 dogfood 插桩实证：模型往返正常、任意工具 3min+ 不返回、ToolRuntime
// prepare/dispatch 全未进入、会话文件不落盘）——官方 Desktop 素以 child 形态跑宿主
// （ELECTRON_RUN_AS_NODE=1 --expose-internals 子进程，S1 spike run3 验证 boot）。
// 本模块承载：
//   · IPC 消息形状（ready/fatal/rpc-result/event ↔ rpc/shutdown）与 ready/事件守卫
//   · wire 编解码（Map → entries 信封——Node IPC 缺省 JSON 序列化不保 Map；
//     heatByEntry 为产品面唯一 Map 返回体）
//   · 子进程 argv 选项解析（BootDshOptions JSON 单串）与外部叠层清单解析
//   · 子侧 RPC 派发（白名单 service.method 动态调用 + 异常归一，永不 reject）
//   · 主侧服务代理（方法白名单 → call 转发 + wire 解码）
//   · 错误过桥保真（fix-28）：子侧 typed error 判型镜像 serializeRpcError → 结构化
//     {code,message,data} 上桥；主侧双形态解码重建带 code/data 的 Error——经
//     rpcEnvelope 判型后走带内 RpcErr 信封（child 形态下 UI 六码文案映射的通路半边）
// 零 node:child_process 依赖——纯函数逐项单测锚定（bridge.test.ts）。
import {
  ERROR_CODES,
  FORGE_EVENT_CHANNELS,
  type BrowseKnowledgeService,
  type BridgeEventMessage,
  type ForgeDocsService,
  type ForgeFeaturesService,
  type ForgeProposalsService,
  type ForgeSettingsService,
  type ForgeTasksService,
  type ProjectService,
  type ProjectServiceM2,
  type TasksChangedEvent,
} from '@dsh-forge/contracts'
import type { BootDshOptions } from './run.js'

/**
 * 桥接服务名（P1 双服务 + M2 四域 + M3 设置域——Interface 6 六名 → 3.8 七名；runProfile
 * ctx 面世，main 侧 forge:* 通道接线。四域 = tasksHome 注入时 core provide（缺席 = M2 面
 * 降级，ready 位 false）；forgeSettings = settingsFile 注入时 provide（独立缝——缺席仅
 * 设置域降级，六服务形制不动）
 */
export type BridgeServiceName =
  | 'forgeProjects'
  | 'forgeKnowledge'
  | 'forgeTasks'
  | 'forgeFeatures'
  | 'forgeProposals'
  | 'forgeDocs'
  | 'forgeSettings'

/** 服务名全集常量（ready 在场位逐名校验的迭代面；完备性经 ServiceNamesCoverage 收敛 never） */
export const BRIDGE_SERVICE_NAMES = [
  'forgeProjects',
  'forgeKnowledge',
  'forgeTasks',
  'forgeFeatures',
  'forgeProposals',
  'forgeDocs',
  'forgeSettings',
] as const satisfies readonly BridgeServiceName[]

/** 服务名全集完备性（= never：BridgeServiceName 新增名未入常量在此编译期点名） */
export type ServiceNamesCoverage = AssertNever<Exclude<BridgeServiceName, (typeof BRIDGE_SERVICE_NAMES)[number]>>

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

/** 子 → 主：boot 就绪（manifest 面 {url, injections} + 六服务在场位——Interface 6 ready 位 ×4 扩池；
 *  tools = ToolRuntime 已注册 tool 名清单（3.4 冒烟观测面——plugin-forge tool 面可达性经 spawn
 *  链路断言；可选字段：读取失败/旧 child 缺席 = undefined，不阻 ready 守卫） */
export interface BridgeReadyMessage {
  readonly type: 'ready'
  readonly url: string
  readonly injections: readonly unknown[]
  readonly services: Readonly<Record<BridgeServiceName, boolean>>
  readonly tools?: readonly string[]
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

export type ChildToMainMessage =
  | BridgeReadyMessage
  | BridgeFatalMessage
  | BridgeRpcResultMessage
  | BridgeEventMessage

// 桥事件信封唯一源 = contracts BridgeEventMessage（1.1 定稿；Interface 6——G1-09 pin）。
// 子侧发射 = core workspace/events.ts 写动词闭包尾部 sendGuarded（direct 形态 IPC 缺席
// 静默降级）；主侧消费 = run.ts event 分支 → DshHostHandle.onEvent → main webContents.send。
export type { BridgeEventMessage, TasksChangedEvent }

/** 编译期断言助手：类型参数须收敛 never（否则报错并点名残余成员） */
type AssertNever<T extends never> = T

/**
 * ProjectService 方法白名单（Interface 1 五法；主侧代理与子侧可达面共用锚）。
 * fix-33 类型锚：satisfies 收敛到 contracts 服务面（改名/漂移编译期显形）；
 * 覆盖完备性经 ProjectWhitelistCoverage 收敛 never（服务面新增方法未入白名单即报错）。
 */
export const PROJECT_SERVICE_METHODS = [
  'registerProject',
  'listProjects',
  'getProject',
  'updateProject',
  'reconcileAtStartup',
] as const satisfies readonly (keyof ProjectService)[]

/** 白名单覆盖完备性（= never：缺席的 ProjectService 方法在此编译期点名） */
export type ProjectWhitelistCoverage = AssertNever<Exclude<keyof ProjectService, (typeof PROJECT_SERVICE_METHODS)[number]>>

/**
 * KnowledgeService + browse 方法白名单（Interface 2 七法 + 聚合第八法）。
 * fix-33 类型锚：锚到 contracts BrowseKnowledgeService（第八法命名类型单一来源）。
 */
export const KNOWLEDGE_SERVICE_METHODS = [
  'rebuildIndex',
  'search',
  'readAbstract',
  'listEntries',
  'getEntryDetail',
  'heatByEntry',
  'sessionRecall',
  'browse',
] as const satisfies readonly (keyof BrowseKnowledgeService)[]

/** 白名单覆盖完备性（= never：缺席的 BrowseKnowledgeService 方法在此编译期点名） */
export type KnowledgeWhitelistCoverage = AssertNever<Exclude<keyof BrowseKnowledgeService, (typeof KNOWLEDGE_SERVICE_METHODS)[number]>>

/**
 * M2 四域服务方法白名单（Interface 6 六白名单之四——G1-10 pin：satisfies 收敛到
 * contracts 服务面 + 覆盖完备性 AssertNever）。锚全集而非 RPC 面（knowledge 八法先例：
 * 双门分工的收窄发生在 ipc 注册面注入类型，桥白名单 = 代理可达面全集锚）——故
 * addTask/claimTask/submitTask/createProposal/transitionProposal 在列（子进程内 tool 面
 * 同服务；renderer 恒不可达：ipc 通道族不注册写动词，SC7 断言面）。
 */
export const TASKS_SERVICE_METHODS = [
  'addTask',
  'claimTask',
  'submitTask',
  'transitionTask',
  'queryTask',
  'validateFeatureTasks',
  'listTasks',
  'taskStats',
  'taskGraph',
  'taskDetail',
  'sessionLinks',
] as const satisfies readonly (keyof ForgeTasksService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeTasksService 方法在此编译期点名） */
export type TasksWhitelistCoverage = AssertNever<Exclude<keyof ForgeTasksService, (typeof TASKS_SERVICE_METHODS)[number]>>

export const FEATURES_SERVICE_METHODS = [
  'registerFeature',
  'transitionFeature',
  'upsertFeatureDoc',
  'listFeatures',
  'listFeatureDocs',
] as const satisfies readonly (keyof ForgeFeaturesService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeFeaturesService 方法在此编译期点名） */
export type FeaturesWhitelistCoverage = AssertNever<Exclude<keyof ForgeFeaturesService, (typeof FEATURES_SERVICE_METHODS)[number]>>

export const PROPOSALS_SERVICE_METHODS = [
  'createProposal',
  'transitionProposal',
  'listProposals',
  // M3（1.1 契约对齐）：两新面透传名就位（core 垫片 fail-loud；语义实现归 2.2/2.3，
  // RPC 通道接线 = 3.8，UI 消费 = 4.x——桥面白名单完备性恒编译期点名）
  'setProposalMode',
  'listProposalDocs',
] as const satisfies readonly (keyof ForgeProposalsService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeProposalsService 方法在此编译期点名） */
export type ProposalsWhitelistCoverage = AssertNever<Exclude<keyof ForgeProposalsService, (typeof PROPOSALS_SERVICE_METHODS)[number]>>

export const DOCS_SERVICE_METHODS = ['read'] as const satisfies readonly (keyof ForgeDocsService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeDocsService 方法在此编译期点名） */
export type DocsWhitelistCoverage = AssertNever<Exclude<keyof ForgeDocsService, (typeof DOCS_SERVICE_METHODS)[number]>>

/**
 * 设置域服务方法白名单（M3 3.8——Interface 1 设置域第七服务；get/set 单门读写，
 * 存储 = boot overlay 注 core 行 config.settingsFile 指向的 {userData}/forge-settings.json）。
 */
export const SETTINGS_SERVICE_METHODS = ['get', 'set'] as const satisfies readonly (keyof ForgeSettingsService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeSettingsService 方法在此编译期点名） */
export type SettingsWhitelistCoverage = AssertNever<Exclude<keyof ForgeSettingsService, (typeof SETTINGS_SERVICE_METHODS)[number]>>

/**
 * projects 域 M2 扩法白名单（Interface 5 派生行第六法——P1 五法常量零波及，独立锚；
 * 代理可达面 = PROJECT_SERVICE_METHODS ∪ 本常量，覆盖完备性两常量合并判定）。
 */
export const PROJECTS_M2_SERVICE_METHODS = ['deriveTaskStoreDir'] as const satisfies readonly (keyof ProjectServiceM2)[]

/** 扩法覆盖完备性（= never：ProjectServiceM2 相对 P1 五法 + 扩法的新增缺席在此点名） */
export type ProjectsM2WhitelistCoverage = AssertNever<
  Exclude<keyof ProjectServiceM2, (typeof PROJECT_SERVICE_METHODS)[number] | (typeof PROJECTS_M2_SERVICE_METHODS)[number]>
>

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
  const credentialsPath =
    typeof o.credentialsPath === 'string' && o.credentialsPath !== '' ? o.credentialsPath : undefined
  // 3.4 M2 装配两缝（可选——缺席/空串 = 不注入：core M2 四域降级 / plugin-forge 技能面降级）
  const tasksHome = typeof o.tasksHome === 'string' && o.tasksHome !== '' ? o.tasksHome : undefined
  const skillsDir = typeof o.skillsDir === 'string' && o.skillsDir !== '' ? o.skillsDir : undefined
  // M3 3.7：spec skills 物化锚（预设 customSkillDirs[spec]——远征组合携带；缺席 = spec 技能面降级）
  const specSkillsDir = typeof o.specSkillsDir === 'string' && o.specSkillsDir !== '' ? o.specSkillsDir : undefined
  // M3 3.8：设置域存储路径（boot overlay 注 core 行 config.settingsFile——缺席 = forgeSettings 服务降级）
  const settingsFile = typeof o.settingsFile === 'string' && o.settingsFile !== '' ? o.settingsFile : undefined
  return {
    profileDir: o.profileDir as string,
    installAnchor: o.installAnchor as string,
    port: o.port,
    stateDb: o.stateDb as string,
    bindingsFile: o.bindingsFile as string,
    credentialsPath, // fix-26 凭据桥（可选——缺席/空串 = 不桥，与 env 开关空串缺省惯例一致）
    tasksHome,
    skillsDir,
    specSkillsDir,
    settingsFile,
  }
}

/**
 * ready 消息守卫（子 → 主消息的最小形状校验——url/injections/六服务在场位齐备
 * 才可作 manifest 面；其余消息（rpc-result 等）返回 undefined 由调用方分流。
 * 在场位逐名校验经 BRIDGE_SERVICE_NAMES 迭代（新增服务名 = 名单 + 此处自动覆盖））。
 */
export function asReadyMessage(message: unknown): BridgeReadyMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'ready' || typeof m.url !== 'string' || !Array.isArray(m.injections)) return undefined
  const services = m.services
  if (typeof services !== 'object' || services === null) return undefined
  const bits: Partial<Record<BridgeServiceName, boolean>> = {}
  for (const name of BRIDGE_SERVICE_NAMES) {
    const bit = (services as Record<string, unknown>)[name]
    if (typeof bit !== 'boolean') return undefined
    bits[name] = bit
  }
  // tools 清单（3.4 冒烟观测面）：可选字段——在场须为 string[]（畸形视为缺席降级，
  // 不阻 ready 守卫：tools 面缺席 = 观测降级，boot 本身仍成立）
  const tools = Array.isArray(m.tools) && m.tools.every((t) => typeof t === 'string')
    ? (m.tools as string[])
    : undefined
  return {
    type: 'ready',
    url: m.url,
    injections: m.injections,
    services: bits as Record<BridgeServiceName, boolean>,
    ...(tools !== undefined ? { tools } : {}),
  }
}

/**
 * 事件消息守卫（子 → 主单向推送分流——run.ts child.on('message') event 分支消费）。
 * channel 须 ∈ FORGE_EVENT_CHANNELS 值域（allowlist 唯一源）；载荷形状 { projectId }
 * 只读校验（Hard Rule——畸形静默忽略返回 undefined，不猜测不转发）。
 */
export function asEventMessage(message: unknown): BridgeEventMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'event') return undefined
  if (typeof m.channel !== 'string' || !(Object.values(FORGE_EVENT_CHANNELS) as readonly string[]).includes(m.channel)) {
    return undefined
  }
  const payload = m.payload
  if (typeof payload !== 'object' || payload === null) return undefined
  const projectId = (payload as Record<string, unknown>).projectId
  if (typeof projectId !== 'string') return undefined
  return { type: 'event', channel: m.channel as BridgeEventMessage['channel'], payload: { projectId } }
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

/**
 * 子侧消息发送防护（fix-33 ①）：Node IPC 缺省 JSON 序列化对 BigInt/循环引用载荷同步抛错
 * ——裸 process.send 会把该错误落成 unhandled rejection，主侧对应 pending 永不结算
 * （renderer 无 RPC 超时 → 无限挂起）。本包装：
 *   · rpc-result 面序列化失败 → 回填**保 id** 降级 error-result（纯字符串载荷可序列化——
 *     主侧 pending 正常结算为失败，错误文案带原序列化失败因）；
 *   · ready/fatal/event 面失败 → 降级丢弃（无 id 可保；boot 失败由主侧 waitForReady/close
 *     兜底显形；事件面 = 交互重取兜底——交互二「direct 形态 IPC 缺席静默降级」同口径）；
 *   · 降级面自身再失败（通道已死等）→ 静默（disconnect 关停兜底）。
 * 本函数永不抛——child.ts 以之包裹全部 send 调用（含 .then(send) 链尾）。
 */
export function sendGuarded(message: ChildToMainMessage, send: (message: ChildToMainMessage) => void): void {
  try {
    send(message)
  } catch (cause) {
    if (message.type !== 'rpc-result') return
    try {
      send({
        type: 'rpc-result',
        id: message.id,
        ok: false,
        error: `bridge: rpc #${String(message.id)} 结果载荷 IPC 序列化失败（BigInt/循环引用？）——${String(
          (cause as Error)?.message ?? cause,
        )}`,
      })
    } catch {
      // 降级面亦不可达（IPC 通道已死）——静默；子进程关停由 disconnect 面兜底
    }
  }
}
