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
  type ForgeBugsService,
  type ForgeDocsService,
  type ForgeFeaturesService,
  type ForgeProposalsService,
  type ForgeSettingsService,
  type ForgeTasksService,
  type ProjectService,
  type ProjectServiceM2,
  type RemoteApprovalDecisionInput,
  type RemoteApprovalForwardResult,
  type TasksChangedEvent,
} from '@dsh-forge/contracts'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { TunnelProvider } from '../tunnel/index.js'
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
  | 'forgeBugs'
  | 'approval'

/** 服务名全集常量（ready 在场位逐名校验的迭代面；完备性经 ServiceNamesCoverage 收敛 never） */
export const BRIDGE_SERVICE_NAMES = [
  'forgeProjects',
  'forgeKnowledge',
  'forgeTasks',
  'forgeFeatures',
  'forgeProposals',
  'forgeDocs',
  'forgeSettings',
  'forgeBugs',
  'approval',
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

/**
 * fix-17 ② 主 → 子：隧道 tab 重连缝（UI 切互联网 tab 隧道不在线时触发——child 侧
 * tunnel-toggle 分支消费；dshForge 域外直转面先例同制，不进 forge RPC allowlist）。
 */
export interface BridgeTunnelToggleRequest {
  readonly type: 'tunnel-toggle'
}

/**
 * fix-18 主 → 子：隧道显式换线（UI 换线链接触发——child 侧 tunnel-fallback 分支消费；
 * dshForge 域外直转面先例同制，不进 forge RPC allowlist）。
 */
export interface BridgeTunnelFallbackRequest {
  readonly type: 'tunnel-fallback'
}

/**
 * fix-18 主 → 子：连接密码（PIN）重置（UI PIN 方框「重置密码」触发——child 侧 pin-reset
 * 分支消费 pinIssuer.rotate 并经 pair 消息换新回推；同制不进 forge RPC allowlist）。
 */
export interface BridgePinResetRequest {
  readonly type: 'pin-reset'
}

/**
 * fix-26 主 → 子：长效密码开关（UI PIN 方框 consent checkbox 触发——官方 POST
 * /desktop/pin/consent {consent} 同语义；child 侧 pinIssuer.setDurable 分支消费；
 * 同制不进 forge RPC allowlist）。
 */
export interface BridgePinConsentRequest {
  readonly type: 'pin-consent'
  readonly consent: boolean
}

export type MainToChildMessage =
  | BridgeRpcRequest
  | BridgeShutdownRequest
  | BridgeTunnelToggleRequest
  | BridgeTunnelFallbackRequest
  | BridgePinResetRequest
  | BridgePinConsentRequest

/** 子 → 主：boot 就绪（manifest 面 {url, injections} + 六服务在场位——Interface 6 ready 位 ×4 扩池；
 *  tools = ToolRuntime 已注册 tool 名清单（3.4 冒烟观测面——plugin-forge tool 面可达性经 spawn
 *  链路断言；可选字段：读取失败/旧 child 缺席 = undefined，不阻 ready 守卫） */
export interface BridgeReadyMessage {
  readonly type: 'ready'
  readonly url: string
  readonly injections: readonly unknown[]
  readonly services: Readonly<Record<BridgeServiceName, boolean>>
  readonly tools?: readonly string[]
  /** fix-3：webserver 实际绑定 host（装配期 remoteApproval.enabled 读数的结果面——UI
   *  pending/listening 判读单源；可选：旧 child 缺席 = undefined，不阻 ready 守卫） */
  readonly remoteHost?: string
  /** fix-5：官方配对/连接地址（fix-6 起 /pair?token= 形状；
   *  可选：回环绑定/无局域网 IPv4/旧 child = 缺席，不阻 ready 守卫） */
  readonly remotePairUrl?: string
  /** fix-6：配对令牌到期时刻（epoch ms——桌面 QR 倒计时单源；可选缺席降级不阻 ready） */
  readonly remotePairExpiresAt?: number
  /** fix-17 ③：连接密码 PIN（官方 6 位数字——互联网 tab PIN 卡单源；可选缺席降级不阻 ready） */
  readonly remotePin?: string
  /** fix-17 ③：PIN 到期时刻（epoch ms——PIN 倒计时单源；与 remotePin 同生同灭） */
  readonly remotePinExpiresAt?: number
  /** fix-26：长效密码位（true = PIN 长期生效不轮换；可选：临时态/旧 child = 缺席） */
  readonly remotePinDurable?: boolean
}

/** 子 → 主：boot 致命失败（main 侧 catch → app.exit(1) 消费） */
export interface BridgeFatalMessage {
  readonly type: 'fatal'
  readonly message: string
}

/**
 * fix-6 子 → 主：配对令牌轮换推送（child 定时器每 TTL 驱动——官方 reload 轮换的桥载体；
 * run.ts 消费刷新 boot manifest，桌面 QR 倒计时到期经 BOOT_CHANNEL 重取即得新 token）。
 */
export interface BridgePairMessage {
  readonly type: 'pair'
  readonly remotePairUrl: string
  readonly remotePairExpiresAt: number
  /** fix-17 ③：新 PIN（6 位数字——随轮换换新；可选——旧 child 零 PIN 载荷兼容） */
  readonly remotePin?: string
  /** fix-17 ③：新 PIN 到期时刻（epoch ms；与 remotePin 同生同灭） */
  readonly remotePinExpiresAt?: number
  /** fix-26：长效密码位（true = 新 PIN 长期生效；可选——临时态 = 缺席） */
  readonly remotePinDurable?: boolean
}

/**
 * fix-7 子 → 主：/pair 握手成功推送（child 校验通过即发一次——run.ts 消费抬 manifest
 * remoteDeviceConnected 粘性位，UI「手机已连接」态卡单源；轮换 pair 消息不携本态）。
 */
export interface BridgePairConnectedMessage {
  readonly type: 'pair-connected'
}

/**
 * dsh-mobile-tunnel 子 → 主：隧道状态推送（child 侧 TunnelManager 事件/pair 轮换驱动——
 * run.ts 消费重建 manifest 隧道面）。激活态携 tunnelUrl（`${tunnelUrl}/pair?token=` 形状，
 * token 随 pair 轮换换新）+ 链路类型 + Pinggy TTL 到期时刻；零载荷 `{type:'tunnel'}` =
 * 关闭/失效（manifest 隧道字段撤除面——WiFi 面不受影响）。
 */
export interface BridgeTunnelMessage {
  readonly type: 'tunnel'
  readonly tunnelUrl?: string
  readonly tunnelProvider?: TunnelProvider
  readonly tunnelExpiresAt?: number
  /** fix-19 ⑦：意外死亡位（官方 :1188 unexpectedlyClosed——UI 一次性守卫自动重开隧道单源） */
  readonly unexpectedlyClosed?: true
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

/**
 * fix-23 子 → 主：诊断日志行（[pair-diag] 决策链——console.log 无落盘链的修复载体：
 * child 侧经桥消息送达主进程，main.ts 消费 → noteHarnessLog 落 harness.log）。
 */
export interface BridgeDiagMessage {
  readonly type: 'diag'
  readonly line: string
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
  | BridgePairMessage
  | BridgePairConnectedMessage
  | BridgeTunnelMessage
  | BridgeDiagMessage

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
  'recordSpawn',
  'submitTask',
  'reconcileInterrupted',
  'transitionTask',
  'updateTask',
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
 * bug 域服务方法白名单（fix-bug——Interface 1 扩池第八服务；桥白名单 = 代理可达面全集锚，
 * listBugs/commitFiles/fileDiff 三读法透传；recordBug/resolveBug 两写径不上 RPC 面）。
 */
export const BUGS_SERVICE_METHODS = ['listBugs', 'commitFiles', 'fileDiff'] as const satisfies readonly (keyof ForgeBugsService)[]

/** 白名单覆盖完备性（= never：缺席的 ForgeBugsService 方法在此编译期点名） */
export type BugsWhitelistCoverage = AssertNever<Exclude<keyof ForgeBugsService, (typeof BUGS_SERVICE_METHODS)[number]>>

/**
 * projects 域 M2 扩法白名单（Interface 5 派生行第六法——P1 五法常量零波及，独立锚；
 * 代理可达面 = PROJECT_SERVICE_METHODS ∪ 本常量，覆盖完备性两常量合并判定）。
 */
export const PROJECTS_M2_SERVICE_METHODS = ['deriveTaskStoreDir'] as const satisfies readonly (keyof ProjectServiceM2)[]

/** 扩法覆盖完备性（= never：ProjectServiceM2 相对 P1 五法 + 扩法的新增缺席在此点名） */
export type ProjectsM2WhitelistCoverage = AssertNever<
  Exclude<keyof ProjectServiceM2, (typeof PROJECT_SERVICE_METHODS)[number] | (typeof PROJECTS_M2_SERVICE_METHODS)[number]>
>

/**
 * 审批决策中继面（mobile-remote-approval fix-2——官方 user-approval 桥接）：
 * main 侧 forge:remote/approval 转发器经桥 rpc 调 worker 侧中继 deposit，把手机决策
 * 存入内存待答表（产品不自持审批状态——仅转交，不持久化）；worker 侧 approval/request
 * waterfall 应答监听器（child.ts 注册）经 take() 消费。类型 = contracts RemoteApproval*
 * 单一来源（RemoteChannelService 转发器注入缝同型）。
 */
export interface BridgeApprovalRelay {
  deposit(input: RemoteApprovalDecisionInput): Promise<RemoteApprovalForwardResult>
}

/** 审批中继方法白名单（main → worker 单向决策通路；覆盖完备性经 ApprovalWhitelistCoverage 收敛 never） */
export const APPROVAL_SERVICE_METHODS = ['deposit'] as const satisfies readonly (keyof BridgeApprovalRelay)[]

/** 白名单覆盖完备性（= never：BridgeApprovalRelay 新增方法未入白名单在此编译期点名） */
export type ApprovalWhitelistCoverage = AssertNever<Exclude<keyof BridgeApprovalRelay, (typeof APPROVAL_SERVICE_METHODS)[number]>>

/** worker 侧审批中继运行时面（child.ts waterfall 应答监听器消费半边） */
export interface ApprovalRelay extends BridgeApprovalRelay {
  /** FIFO 消费一笔已受理决策；空表（手机决策未在场）→ undefined（未命中 → fail-open） */
  take(): RemoteApprovalDecisionInput | undefined
}

/**
 * 创建 worker 侧审批中继（mobile-remote-approval fix-2 纯逻辑——child.ts 装配、
 * bridge.test.ts 锚定）。deposit = 中继面在场即受理（forwarded:true，决策入内存表）；
 * take = FIFO 消费。决策→outcome 词汇映射（contracts 'allow'/'reject' → 官方
 * ApprovalOutcome 'allowed-once'/'rejected'）在 approvalWaterfallAnswer。
 */
export function createApprovalRelay(): ApprovalRelay {
  const pending: RemoteApprovalDecisionInput[] = []
  return {
    deposit: async (input) => {
      pending.push(input)
      return { forwarded: true }
    },
    take: () => pending.shift(),
  }
}

/**
 * approval/request waterfall 应答（fail-open 语义，用户裁决 2026-10-14）：
 * 手机决策未命中（deposit 表空）→ 不消费请求，透传 next() 放行后续 answerer
 * （桌面工作台 / 官方 fallback——手机不在场时桌面审批恒可用）；命中 → 消费一笔
 * 决策并映射为官方 ApprovalOutcome 词汇返回（不触 next，不与桌面 answerer 竞争）。
 * child.ts 以 (req, next) => approvalWaterfallAnswer(relay, next) 注册监听器。
 */
export async function approvalWaterfallAnswer(
  relay: Pick<ApprovalRelay, 'take'>,
  next: () => Promise<ApprovalOutcome>,
): Promise<ApprovalOutcome> {
  const decision = relay.take()
  if (decision === undefined) return next()
  return decision.decision === 'allow' ? 'allowed-once' : 'rejected'
}

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
  // fix-3 绑定 host：可选字段——在场须为非空 string（畸形视为缺席降级，同 tools 口径）
  const remoteHost = typeof m.remoteHost === 'string' && m.remoteHost !== '' ? m.remoteHost : undefined
  // fix-5 官方配对地址：可选字段——同口径（非空 string 才透传）
  const remotePairUrl =
    typeof m.remotePairUrl === 'string' && m.remotePairUrl !== '' ? m.remotePairUrl : undefined
  // fix-6 配对令牌到期时刻：可选字段——正有限数才透传（同降级口径）
  const remotePairExpiresAt =
    typeof m.remotePairExpiresAt === 'number' && Number.isFinite(m.remotePairExpiresAt) && m.remotePairExpiresAt > 0
      ? m.remotePairExpiresAt
      : undefined
  // fix-17 ③ PIN 读数：可选字段——pin 须 6 位数字、expiresAt 正有限数（同降级口径）
  const remotePin = typeof m.remotePin === 'string' && /^\d{6}$/.test(m.remotePin) ? m.remotePin : undefined
  const remotePinExpiresAt = positiveTsOf(m.remotePinExpiresAt)
  return {
    type: 'ready',
    url: m.url,
    injections: m.injections,
    services: bits as Record<BridgeServiceName, boolean>,
    ...(tools !== undefined ? { tools } : {}),
    ...(remoteHost !== undefined ? { remoteHost } : {}),
    ...(remotePairUrl !== undefined ? { remotePairUrl } : {}),
    ...(remotePairExpiresAt !== undefined ? { remotePairExpiresAt } : {}),
    ...(remotePin !== undefined ? { remotePin } : {}),
    ...(remotePinExpiresAt !== undefined ? { remotePinExpiresAt } : {}),
    // fix-26：长效位透传（严格 === true 才携带）
    ...(m.remotePinDurable === true ? { remotePinDurable: true as const } : {}),
  }
}

/**
 * fix-17 ③ PIN 形状守卫（官方 6 位数字——畸形 = undefined 降级缺席）。
 */
function pinOf(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{6}$/.test(value) ? value : undefined
}

/** fix-17 ③ 正有限时刻守卫（remotePairExpiresAt 同口径——可选读数统一降级面） */
function positiveTsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * fix-6 pair 消息守卫（子 → 主轮换推送分流——run.ts 消费）。remotePairUrl 须非空串、
 * remotePairExpiresAt 须正有限数；他形（ready/event/rpc-result 等）= undefined 静默忽略。
 */
export function asPairMessage(message: unknown): BridgePairMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'pair') return undefined
  if (typeof m.remotePairUrl !== 'string' || m.remotePairUrl === '') return undefined
  if (
    typeof m.remotePairExpiresAt !== 'number' ||
    !Number.isFinite(m.remotePairExpiresAt) ||
    m.remotePairExpiresAt <= 0
  ) {
    return undefined
  }
  // fix-17 ③：PIN 读数可选透传（随轮换换新；畸形 = 字段缺席——零载荷兼容旧 child）
  const remotePin = pinOf(m.remotePin)
  const remotePinExpiresAt = positiveTsOf(m.remotePinExpiresAt)
  return {
    type: 'pair',
    remotePairUrl: m.remotePairUrl,
    remotePairExpiresAt: m.remotePairExpiresAt,
    ...(remotePin !== undefined ? { remotePin } : {}),
    ...(remotePinExpiresAt !== undefined ? { remotePinExpiresAt } : {}),
    // fix-26：长效位透传（严格 === true 才携带）
    ...(m.remotePinDurable === true ? { remotePinDurable: true as const } : {}),
  }
}

/**
 * fix-7 pair-connected 消息守卫（子 → 主 /pair 握手成功推送分流——run.ts connected 分支
 * 消费）。零载荷面：type 恒等即通过；他形 = undefined 静默忽略。
 */
export function asPairConnectedMessage(message: unknown): BridgePairConnectedMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  if ((message as Record<string, unknown>).type !== 'pair-connected') return undefined
  return { type: 'pair-connected' }
}

/**
 * dsh-mobile-tunnel tunnel 消息守卫（子 → 主隧道状态推送分流——run.ts tunnel 分支消费）。
 * 激活态：tunnelUrl 非空串 + tunnelProvider ∈ {cloudflared, pinggy} 齐备（expiresAt 正有限
 * 数可选）；零载荷 = 关闭/失效撤除面；畸形（单边在场/provider 越域/TTL 非法）→ undefined
 * 静默忽略。
 */
export function asTunnelMessage(message: unknown): BridgeTunnelMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'tunnel') return undefined
  const hasUrl = typeof m.tunnelUrl === 'string' && m.tunnelUrl !== ''
  const hasProvider =
    m.tunnelProvider === 'cloudflared' || m.tunnelProvider === 'pinggy'
  if (!hasUrl && !hasProvider) return { type: 'tunnel' } // 零载荷 = 关闭/失效撤除面
  if (!hasUrl || !hasProvider) return undefined // 单边在场 = 畸形
  const expiresAt =
    typeof m.tunnelExpiresAt === 'number' && Number.isFinite(m.tunnelExpiresAt) && m.tunnelExpiresAt > 0
      ? m.tunnelExpiresAt
      : undefined
  return {
    type: 'tunnel',
    tunnelUrl: m.tunnelUrl as string,
    tunnelProvider: m.tunnelProvider as TunnelProvider,
    ...(expiresAt !== undefined ? { tunnelExpiresAt: expiresAt } : {}),
    // fix-19 ⑦：意外死亡位透传（撤面事件携位——web 自动重开守卫判定单源）
    ...(m.unexpectedlyClosed === true ? { unexpectedlyClosed: true as const } : {}),
  }
}

/**
 * fix-17 ② tunnel-toggle 消息守卫（主 → 子 tab 重连请求分流——child.ts 隧道分支消费）。
 * 零载荷面：type 恒等即通过；他形 = undefined 静默忽略。
 */
export function asTunnelToggleMessage(message: unknown): BridgeTunnelToggleRequest | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  if ((message as Record<string, unknown>).type !== 'tunnel-toggle') return undefined
  return { type: 'tunnel-toggle' }
}

/**
 * fix-18 tunnel-fallback 消息守卫（主 → 子显式换线分流——child.ts 隧道分支消费）。
 * 零载荷面：type 恒等即通过；他形 = undefined 静默忽略。
 */
export function asTunnelFallbackMessage(message: unknown): BridgeTunnelFallbackRequest | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  if ((message as Record<string, unknown>).type !== 'tunnel-fallback') return undefined
  return { type: 'tunnel-fallback' }
}

/**
 * fix-18 pin-reset 消息守卫（主 → 子 PIN 重置分流——child.ts pinIssuer.rotate 缝消费）。
 * 零载荷面：type 恒等即通过；他形 = undefined 静默忽略。
 */
export function asPinResetMessage(message: unknown): BridgePinResetRequest | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  if ((message as Record<string, unknown>).type !== 'pin-reset') return undefined
  return { type: 'pin-reset' }
}

/**
 * fix-26 pin-consent 消息守卫（主 → 子长效密码开关分流——child.ts setDurable 缝消费）。
 * consent 须布尔；他形 = undefined 静默忽略。
 */
export function asPinConsentMessage(message: unknown): BridgePinConsentRequest | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'pin-consent' || typeof m.consent !== 'boolean') return undefined
  return { type: 'pin-consent', consent: m.consent }
}

/**
 * fix-23 diag 消息守卫（子 → 主诊断行分流——createBridgeChannel diag 分支消费）。
 * line 须非空 string；他形 = undefined 静默忽略。
 */
export function asDiagMessage(message: unknown): BridgeDiagMessage | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const m = message as Record<string, unknown>
  if (m.type !== 'diag' || typeof m.line !== 'string' || m.line === '') return undefined
  return { type: 'diag', line: m.line }
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

/**
 * fix-16 配对 302 重定向权威面（官方 main.js:1489 同形——Location 由到达请求的 Host 头
 * 构造）。Root cause: 原 /pair 把 authority 强制回退 `${lanIpv4}:${pairPort}` 且 scheme
 * 硬编码 http——经隧道域扫码的手机被 302 到不可达的局域网地址。
 *   · authority：Host 头非空且非回环、非 LAN 本身 → 原样取之（隧道域路径）；否则回退构造
 *     LAN 权威（本地扫码/畸形 Host 缺席兜底）。authority 仅取自本次请求 Host——零开放重定向。
 *   · origin scheme 按到达域判定：隧道域 → https；LAN/回环 → http。
 */
export function pairRedirectOf(
  hostHeader: string | undefined,
  lanIpv4: string,
  pairPort: number,
): { authority: string; origin: string } {
  const fallback = `${lanIpv4}:${pairPort}`
  const host = typeof hostHeader === 'string' ? hostHeader.trim() : ''
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  const loopback = hostname === '' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  const lanItself = hostname === lanIpv4.toLowerCase()
  const tunnel = host !== '' && !loopback && !lanItself
  const authority = tunnel ? host : fallback
  return { authority, origin: `${tunnel ? 'https' : 'http'}://${authority}` }
}

/**
 * fix-22 诊断日志面：URL 行脱敏（token/pin 查询参数值 → '***'——决策链日志可落宿主日志
 * 文件而不携带敏感凭据）。解析失败 = '(unparsable-url)' 占位（不抛——日志面 fail-soft）。
 */
export function redactTokenQuery(url: string): string {
  try {
    const u = new URL(url)
    // set() 就地替换值不改键集（键序不变）——live 迭代安全，无需快照
    for (const key of u.searchParams.keys()) {
      if (key === 'token' || key === 'pin') u.searchParams.set(key, '***')
    }
    return u.href
  } catch {
    return '(unparsable-url)'
  }
}

/**
 * fix-22 诊断日志面：单行化 + 控制字符剥离 + 长度截断（beacon 体是浏览器侧任意文本——
 * 落日志前先消毒，零日志注入面）。302 字符上限（一条决策行足量）。
 */
export function sanitizeLogLine(text: string): string {
  const oneLine = text.replace(/[\r\n\t\0]+/g, ' ').replace(/[^\x20-\x7E\u4e00-\u9fff]/g, '')
  return oneLine.length > 302 ? oneLine.slice(0, 302) : oneLine
}

/**
 * fix-22 真机修复（bug cbb9131e 架构级根因：产品 dist 仅经 dsh-forge://app 自定义协议在主窗
 * 分发，webserver 面从未服务产品 bundle——手机 302 链落地官方 web 前端）。/remote 移动面
 * 挂载点：/pair 与 /pair/verify 302 目标（authenticatedUrl 包住）+ webserver 前缀路由静态
 * 服务产品 dist。
 */
export const REMOTE_VIEW_MOUNT = '/remote'

/**
 * fix-22：请求 URL → dist 相对路径映射（挂载点外/路径逃逸/畸形 = undefined，服务侧 403/404）。
 * 仅认挂载点前缀；index 形态（挂载点本体/尾斜杠）= 'index.html'。
 */
export function remoteViewFilePathOf(requestUrl: string): string | undefined {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://dsh.invalid').pathname)
  } catch {
    return undefined
  }
  if (pathname !== REMOTE_VIEW_MOUNT && !pathname.startsWith(`${REMOTE_VIEW_MOUNT}/`)) return undefined
  const rel = pathname === REMOTE_VIEW_MOUNT ? '' : pathname.slice(REMOTE_VIEW_MOUNT.length + 1)
  if (rel === '') return 'index.html'
  if (rel.includes('\\') || rel.includes('\0') || rel.includes('../')) return undefined
  return rel
}

/**
 * fix-22：官方 index 弹射脚本（webServer.tapIndex 注入官方 web 前端 index.html——官方
 * BrowserAuth 根交换只落在 "/"，tapIndex 是不改写官方面行为的唯一合缝跳转点）。dswf
 * cookie 在场（/pair 成功面所设，非 HttpOnly 可读）→ replace 到 /remote/ 移动面。
 */
export const REMOTE_VIEW_BOUNCE_MARKUP =
  '<script>if(/(?:^|; )dswf_forge_remote=1(?:;|$)/.test(document.cookie))location.replace("/remote/")</script>'

/** fix-22：tapIndex 纯变换——<head> 开标签后注入弹射脚本（无 <head> = 原样返回 fail-soft）。 */
export function remoteViewIndexTap(html: string): string {
  return html.replace(/<head(?:\s[^>]*)?>/i, (open) => `${open}${REMOTE_VIEW_BOUNCE_MARKUP}`)
}
