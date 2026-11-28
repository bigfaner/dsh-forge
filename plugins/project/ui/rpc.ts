// forge RPC client 窄面（定位：装配——插件 bundle 内部面，inventory §2.4「RPC 数据源改
// 插件 bundle 内部面」）：add-project 流程与 Bug 台账 pane 的数据源单门。传输真身 =
// 官方 Typert Remote namespace（五族 forge:* 收编 ctx.remote 第一等通道）。
// face 安装：apply 期 installForgeRemoteFace 安装解析缝（逐调用现查不缓存——AGENTS 1.6），
// 官方 remote 面缺席 = 通道不可用诚实降级（diag 留痕 + typed Error，不静默不炸壳；
// mount 终态前竞速窗口的诊断静默——FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY 注）。
// 信封拆装：RemoteResult → data（value 原样），failure → 抛 RpcClientError（typed error
// 反序列化），形状非法 fail-loud。descriptor/codec 由构建期生成物锁定（1.5——client 半
// 生成化：$mount 贡献 = generator 产出 ./remote TYPERT_REMOTE，手写表退役）。
import { type BugCard, type ListBugsQuery } from '@dsh-forge/lib-api/dto/bugs'
import { type DeriveTaskStoreDirResult, type FeatureCard, type ListFeaturesQuery } from '@dsh-forge/lib-api/dto/forge'
import { type DirFactRow, type Project, type ProjectPatch, type ProjectSummary, type RegisterProjectInput, type RegisterResult } from '@dsh-forge/lib-api/dto/project'
import { type DirListing } from '@dsh-forge/lib-api/dto/fs'
import { type RpcErrorPayload } from '@dsh-forge/lib-api/errors'
import { type RpcResult } from '@dsh-forge/lib-api/dto/rpc'
import { type WorktreeAheadBehindRequest, type WorktreeAheadBehindResult, type WorktreeBranchesRequest, type WorktreeBranchesResult, type WorktreeChecksRequest, type WorktreeChecksResult, type WorktreeCreateRequest, type WorktreeCreateResult, type WorktreeDeleteRequest, type WorktreeDeleteResult, type WorktreeEnsureWorkspaceRequest, type WorktreeEnsureWorkspaceResult, type WorktreeListRequest, type WorktreeListResult, type WorktreeResolveRequest, type WorktreeResolveResult, type WorktreeSelectRequest, type WorktreeSelectResult, type WorktreeSealRequest, type WorktreeSealResult } from '@dsh-forge/lib-api/dto/worktree'

/** typed error 的客户端形态（code ∈ contracts 六码域；data = 结构化附载原样保存） */
export class RpcClientError extends Error {
  readonly code: RpcErrorPayload['code']
  readonly data: unknown

  constructor(payload: RpcErrorPayload) {
    super(payload.message)
    this.name = 'RpcClientError'
    this.code = payload.code
    this.data = payload.data
  }
}

/** 官方 Typert Remote namespace 窄面（结构切片——ctx.remote.<ns> 结构同型，测试替身同型） */
export interface ForgeRemoteNamespaceFace {
  readonly [method: string]: ((...args: never[]) => unknown) | undefined
}

/** 官方 ctx.remote 五族消费切片（apply 期 installForgeRemoteFace 安装的解析目标；
 *  forgeDirs = 基本信息区族——可选边，缺席 = 事实行 fail-soft「—」，不影响其余五族） */
export interface ForgeRemoteFace {
  readonly forgeProjects: ForgeRemoteNamespaceFace
  readonly forgeFs: ForgeRemoteNamespaceFace
  readonly forgeBugs: ForgeRemoteNamespaceFace
  readonly forgeWorktree: ForgeRemoteNamespaceFace
  readonly forgeFeatures: ForgeRemoteNamespaceFace
  readonly forgeDirs?: ForgeRemoteNamespaceFace
  /** spec 子 tab 消费族（G3——可选边：spec 插件缺席 = namespace 缺席 → typed 拒绝信封，
   *  不进 FORGE_REMOTE_NAMESPACES 必选集（缺席不得拖垮其余五族 face 解析——forgeDirs 同款）） */
  readonly forgeSpecs?: ForgeRemoteNamespaceFace
  /** 任务变更事件缝（overview drawer 任务变化自动刷新——forgeTasks.follow 流，可选边：
   *  task-loop 插件 Typert 贡献经官方 gateway 下发，缺席宿主 = namespace 缺席 → 静默降级
   *  no-op 订阅，不进 FORGE_REMOTE_NAMESPACES 必选集不阻断硬族解析） */
  readonly forgeTasks?: ForgeRemoteNamespaceFace
}

/** 降级诊断钩子（apply 期可选安装——缺席 console 兜底，client 束豁免面） */
let rpcDiag: ((line: string) => void) | undefined

// ── 页内跨 bundle 单例锚 ──
// rpc.ts 的解析缝是模块级状态，页面同时存在两份本模块实例（plugins/project bundle +
// 壳 bundle 经 client-ui/add-project 内联的副本）：壳侧副本从不调用 installForgeRemote-
// Face → resolver 恒缺席反复诚实降级。收口 = 安装面同步发布页内全局锚
// （KEY 契约先例：__dshForgeOpenWorkspace/__dshForgeWorktreeSwitchGate 双注同型），
// 缺本地缝的副本回退读锚——页内单例状态。

/** 页内锚键（写读双注：写入器 = @dsh-forge/project bundle apply；读取器 = 壳侧同源副本） */
export const FORGE_REMOTE_FACE_ANCHOR_KEY = '__dshForgeRemoteFace'

/**
 * 页内 mount 终态锚键（fix-2 消费面 warn 门控——竞速分类钉）：写入器 = projectClient.apply
 * 的 remote.$mount promise settle（成功/失败/缺席均视为 mount 终态——mount 后面缺席 =
 * 真缺席，诚实 warn）；读取器 = 页内全部 rpc.ts 副本（壳侧同源副本含）。
 * 竞速窗口（键缺席 = contribution mount 未落座）的面缺席/404 属装配时序竞速——降级
 * 静默（typed Error 照抛，仅 console warn 门控）；mount 终态后的面缺席保持诚实 warn。
 */
export const FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY = '__dshForgeRemoteMountSettled'

/** mount 终态发布（projectClient.apply 的 $mount settle 三分支各调用一次——页内全局单点；
 *  发布同时逐份唤醒 waitForRemoteMountSettled 等待者并清空——订阅页内 mount 终态锚，零轮询） */
export function markForgeRemoteMountSettled(): void {
  globalScopeOf()[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY] = true
  const waiters = globalScopeOf()[FORGE_REMOTE_MOUNT_WAITERS_KEY]
  if (waiters instanceof Set) {
    for (const wake of waiters) (wake as () => void)()
    waiters.clear()
  }
}

/**
 * mount 终态锚复位（projectClient.apply 每次 $mount 前调用——插件重载会重跑 $mount，上一代
 * 留下的终态锚若不清 = 新一代落座前的面缺席被误判为「落座后的真缺席」，竞速窗口失守）。
 */
export function resetForgeRemoteMountSettled(): void {
  delete globalScopeOf()[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY]
}

/** 页内 mount 等待者锚键（写读双注：mark 侧逐份唤醒——跨 bundle 副本共享同一 Set） */
export const FORGE_REMOTE_MOUNT_WAITERS_KEY = '__dshForgeRemoteMountWaiters'

/**
 * mount 终态现查（导出面——useWorktreeSeal/ForgeSessionWorktreeChip/ForgeHeroWorkspacePicker
 * 消费：面缺席首拉失败后判「是否时序竞速窗口」——未落座才值得等落座重取，落座后的真缺席
 * 保持诚实降级不重试）。
 */
export function forgeRemoteMountSettled(): boolean {
  return remoteMountSettled()
}

/**
 * 等 mount 终态（评审 L 粘滞降级收口原语——订阅页内 mount 终态锚，禁自造轮询/定时器）：
 * 已落座 = 即刻 resolve；未落座 = 挂起至下一次 markForgeRemoteMountSettled 发布（跨 bundle
 * 副本经页内等待者锚同源唤醒）。调用方语义 = 「面缺席且 mount 未落座时，等落座后重取一次」。
 */
export function waitForRemoteMountSettled(): Promise<void> {
  if (remoteMountSettled()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const scope = globalScopeOf()
    let waiters = scope[FORGE_REMOTE_MOUNT_WAITERS_KEY]
    if (!(waiters instanceof Set)) {
      waiters = new Set<() => void>()
      scope[FORGE_REMOTE_MOUNT_WAITERS_KEY] = waiters
    }
    const wake = (): void => {
      ;(waiters as Set<() => void>).delete(wake)
      resolve()
    }
    ;(waiters as Set<() => void>).add(wake)
  })
}

/** mount 终态现查（纯锚读——零模块级缓存，页内全部副本同源判定；face 解析缝锚在场 =
 * installForgeRemoteFace 已装配（mount 后 inject fiber 激活）→ 同视为 mount 终态） */
function remoteMountSettled(): boolean {
  if (globalScopeOf()[FORGE_REMOTE_MOUNT_SETTLED_ANCHOR_KEY] === true) return true
  return faceAnchorOf() !== undefined
}

/** 页内锚形态（解析缝 + 诊断钩——与 installForgeRemoteFace 实参同型） */
interface ForgeRemoteFaceAnchor {
  readonly resolver: () => ForgeRemoteFace | undefined
  readonly diag?: (line: string) => void
}

/** 宿主全局对象（browser 束 = window；vitest/node = globalThis——测试面同键直写） */
function globalScopeOf(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>
}

/** 锚读取（缺副本本地缝时回退；缺席 = undefined 继续本地诚实降级） */
function faceAnchorOf(): ForgeRemoteFaceAnchor | undefined {
  const anchor = globalScopeOf()[FORGE_REMOTE_FACE_ANCHOR_KEY] as ForgeRemoteFaceAnchor | undefined
  if (anchor === undefined || anchor === null || typeof anchor !== 'object') return undefined
  if (typeof anchor.resolver !== 'function') return undefined
  return anchor
}

/** 生效缝（本地 install 优先——bundle 内行为不变；缺席回退页内锚） */
function faceSeamOf(): ForgeRemoteFaceAnchor {
  if (forgeRemoteResolver !== undefined) return { resolver: forgeRemoteResolver, diag: rpcDiag }
  return faceAnchorOf() ?? { resolver: () => undefined }
}

/**
 * 安装官方 Typert remote 解析缝（projectClient.apply 装配期调用一次）：
 * resolver 逐调用现查 ctx.remote 五族面（reflect 防御读取，缺席宿主 = undefined 诚实降级）。
 */
export function installForgeRemoteFace(
  resolver: () => ForgeRemoteFace | undefined,
  onDiag?: (line: string) => void,
): void {
  forgeRemoteResolver = resolver
  if (onDiag !== undefined) rpcDiag = onDiag
  // 页内锚同步发布（跨 bundle 副本单例——见 FORGE_REMOTE_FACE_ANCHOR_KEY 注）
  globalScopeOf()[FORGE_REMOTE_FACE_ANCHOR_KEY] = { resolver, diag: onDiag }
}

/** face 解析缝（apply 期安装——每调用现查不缓存） */
let forgeRemoteResolver: (() => ForgeRemoteFace | undefined) | undefined

/**
 * 现查 forge remote face（fix-15 传输适配消费面）：apply 装配的解析缝 + 页内锚回退
 * （faceSeamOf 同口径）逐调用现查，缺席 = undefined（调用方 typed 降级）。
 */
export function forgeRemoteFaceOf(): ForgeRemoteFace | undefined {
  return faceSeamOf().resolver()
}

/**
 * namespace face 归一取法（导出面——fix-15 dock tab 族 Typert 传输适配同用此取法，
 * 零形状漂移副本；归一规则与 namespaceOf 同：Map → namespaces 对象 → 顶层三形态回退）。
 */
export function namespaceFaceOf(face: ForgeRemoteFace, namespace: keyof ForgeRemoteFace): ForgeRemoteNamespaceFace | undefined {
  const rawNamespaces = (face as unknown as Record<string, unknown>)['namespaces']
  if (
    rawNamespaces !== undefined && rawNamespaces !== null && typeof rawNamespaces === 'object' &&
    typeof (rawNamespaces as { get?: unknown })['get'] === 'function'
  ) {
    const entry = (rawNamespaces as Map<string, { service?: unknown }>).get(namespace as string) as { service?: unknown } | undefined
    const service = entry?.service
    if (service === undefined || service === null || typeof service !== 'object') return undefined
    return service as ForgeRemoteNamespaceFace
  }
  const holder =
    rawNamespaces !== undefined && rawNamespaces !== null && typeof rawNamespaces === 'object'
      ? (rawNamespaces as Record<string, unknown>)
      : (face as unknown as Record<string, unknown>)
  const ns = holder[namespace] as unknown
  if (ns === undefined || ns === null || typeof ns !== 'object') return undefined
  return ns as ForgeRemoteNamespaceFace
}

/** 五族 forge:* namespace 键单源（forgeFaceOf 形状校验 + apply 期 inject 边声明共用） */
export const FORGE_REMOTE_NAMESPACES = [
  'forgeProjects',
  'forgeFs',
  'forgeBugs',
  'forgeWorktree',
  'forgeFeatures',
] as const

/**
 * 可选族 forge:* namespace 键单源（forgeSpecs = G3 spec 子 tab、forgeDirs = G1 目录行、
 * forgeTasks = 任务变更 follow 流缝——overview drawer 事件面）：
 * 在场即并入 forgeFaceOf 归一面、缺席不参与五族门控不阻断硬族解析（可选边降级语义）。
 * 注意 forgeSpecs 不得入 ui/index.ts apply 期 inject 边声明（外插件缺席 = 子 fiber 挂死红线）。
 */
export const FORGE_REMOTE_OPTIONAL_NAMESPACES = ['forgeDirs', 'forgeSpecs', 'forgeTasks'] as const

/**
 * 五族 forge remote face 归一解析（apply 期 inject 子 fiber 解析缝消费——bug 145b3d3b
 * 真根因修口）：官方 gateway client 半 rc.2 形态 = ClientRemoteService，namespace 面
 * 物化为 remote.namespaces Map（entry {service}）+ remote.<ns> 平铺 cordis 服务，
 * ctx.remote 顶层无五族属性——旧顶层五属性校验恒 false → face 恒 undefined（fiber
 * 已激活、锚已发布、resolver 恒 undefined）。归一取法复用 namespaceFaceOf 三形态
 * 回退（Map → namespaces 对象 → 顶层属性），官方 web 舞台顶层形态与 electron dev
 * Map 形态两界同源解析；缺一族 = undefined 诚实降级。可选族（FORGE_REMOTE_OPTIONAL_
 * NAMESPACES：forgeDirs/forgeSpecs/forgeTasks）在场即并入归一面、缺席不参与门控——可选边降级。
 */
export function forgeFaceOf(fiberCtx: unknown): ForgeRemoteFace | undefined {
  try {
    const face = (fiberCtx as { remote?: unknown })['remote']
    if (face === undefined || face === null || typeof face !== 'object') return undefined
    const normalized: Record<string, unknown> = {}
    for (const ns of FORGE_REMOTE_NAMESPACES) {
      const nsFace = namespaceFaceOf(face as ForgeRemoteFace, ns)
      if (nsFace === undefined) return undefined
      normalized[ns] = nsFace
    }
    for (const ns of FORGE_REMOTE_OPTIONAL_NAMESPACES) {
      const nsFace = namespaceFaceOf(face as ForgeRemoteFace, ns)
      if (nsFace !== undefined) normalized[ns] = nsFace
    }
    return normalized as unknown as ForgeRemoteFace
  } catch {
    return undefined
  }
}

/** 方法取法（缺席/非函数 = undefined——typed unavailable 信封投影） */
function methodOf(ns: ForgeRemoteNamespaceFace | undefined, method: string): ((...args: never[]) => unknown) | undefined {
  const fn = ns?.[method] as unknown
  return typeof fn === 'function' ? (fn as (...args: never[]) => unknown) : undefined
}

/** RemoteResult 信封投影（ok → data；failure {code,message,details} → RpcErrorPayload 形） */
function remoteResultOf(raw: unknown, channel: string): unknown {
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error(
      `dsh-forge project client: forge remote 响应形状非法（channel=${channel}）——期望 RemoteResult 信封，实得 ${raw === null ? 'null' : typeof raw}`,
    )
  }
  const result = raw as { ok: boolean; value?: unknown; error?: { code?: unknown; message?: unknown; details?: unknown } }
  if (result.ok) return { ok: true, data: result.value }
  return {
    ok: false,
    error: {
      code: typeof result.error?.code === 'string' ? result.error.code : 'internal',
      message: typeof result.error?.message === 'string' ? result.error.message : 'forge remote failure',
      data: result.error?.details,
    },
  }
}

/**
 * typert face 方法解析 + 缺席降级块单源（clean-code-review P1-7——invokeRemote/streamRemote
 * 逐字双份收敛）：faceSeamOf → resolver → namespaceFaceOf → methodOf 取法 + 消费面 warn 门控
 * 诊断 + typed Error 抛出。返回方法引用；面缺席抛 Error（调用方降级语义不变）。
 */
function remoteFaceMethodOf(
  namespace: keyof ForgeRemoteFace,
  method: string,
): (...args: unknown[]) => unknown {
  const seam = faceSeamOf()
  const face = seam.resolver()
  const ns = face === undefined ? undefined : namespaceFaceOf(face, namespace)
  const fn = methodOf(ns, method)
  if (fn === undefined) {
    const line = `dsh-forge project client: 官方 forge remote 面缺席（${String(namespace)}.${method}）——通道不可用（诚实降级）`
    // 消费面 warn 门控（fix-2 竞速分类钉）：contribution mount 终态前的面缺席属装配时序
    // 竞速窗口——typed Error 照抛（调用方降级语义不变），console 诊断静默（boot 窗口零
    // 「面缺席」降级记录）；mount 终态后的真缺席保持诚实 warn/diag。
    if (remoteMountSettled()) {
      const diag = seam.diag ?? rpcDiag
      if (diag !== undefined) diag(line)
      else console.warn(`[forge-rpc-transport] ${line}`)
    }
    throw new Error(line)
  }
  return fn as (...args: unknown[]) => unknown
}

/**
 * 客户端束诊断发射面（G3 spec 子 tab——emitDiag 面消费径，禁直落 console 语义）：
 * 复用 apply 期 installForgeRemoteFace 注入的诊断缝（host 侧桥接 cordis diag/log 事件域
 * emitDiag——ui/index.ts 装配同缝），缝缺席 = console.warn 按级兜底（client 束豁免面——
 * remoteFaceMethodOf 降级块同径先例，诊断不静默）。
 */
export function forgeDiagEmit(line: string): void {
  const diag = faceSeamOf().diag ?? rpcDiag
  if (diag !== undefined) diag(line)
  else console.warn(`[forge-rpc-diag] ${line}`)
}

/** typert 调用（一元——位置参直透 + RemoteResult 信封投影 + typed error 抛出） */
async function invokeRemote<T>(
  namespace: keyof ForgeRemoteFace,
  method: string,
  args: readonly unknown[],
): Promise<T> {
  const fn = remoteFaceMethodOf(namespace, method)
  return invokeEnvelope(await (fn as (...args: unknown[]) => unknown)(...args), `${String(namespace)}/${method}`)
}

async function invokeEnvelope<T>(raw: unknown, channel: string): Promise<T> {
  const result = remoteResultOf(raw, channel) as RpcResult<T>
  if (result.ok) return result.data
  throw new RpcClientError(result.error)
}

/** typert 流调用（mode:'stream'——AsyncIterable 帧直透，缺席 face = 诚实降级 throw；
 *  缺席降级块与 invokeRemote 单源（remoteFaceMethodOf——P1-7 收敛） */
function streamRemote<T>(
  namespace: keyof ForgeRemoteFace,
  method: string,
  args: readonly unknown[],
): AsyncIterable<T> {
  const fn = remoteFaceMethodOf(namespace, method)
  const handle = (fn as (...args: unknown[]) => unknown)(...args) as AsyncIterable<T>
  return (async function* () {
    for await (const frame of handle) yield frame
  })()
}

/** forge:projects/* 面方法集（本插件消费切片：list/register/deriveTaskStoreDir/update） */
export interface ForgeProjectsRpc {
  list(): Promise<ProjectSummary[]>
  register(input: RegisterProjectInput): Promise<RegisterResult>
  deriveTaskStoreDir(workspaceDir: string): Promise<DeriveTaskStoreDirResult>
  /** 项目行变更（sidebar 五功能写面：rename/archived/sortOrders patch——1.6） */
  update(id: string, patch: ProjectPatch): Promise<Project>
}

/** forge:fs/* 面方法集（目录浏览器数据源——只读列举） */
export interface ForgeFsRpc {
  listDir(dirPath?: string): Promise<DirListing>
}

/** forge:bugs/* 面方法集（Bug 台账 pane 现查读面） */
export interface ForgeBugsRpc {
  list(q: ListBugsQuery): Promise<BugCard[]>
}

/** forge:worktree/* 面方法集（worktree-picker/session-badge 消费切片——十法 + followSeal 流，UI 直调） */
export interface ForgeWorktreeRpc {
  list(q: WorktreeListRequest): Promise<WorktreeListResult>
  create(q: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  delete(q: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(q: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(q: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(q: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  seal(q: WorktreeSealRequest): Promise<WorktreeSealResult>
  /** 封存态 follow 流（mode:'stream'——baseline + 增量快照帧，AC② 推流化） */
  followSeal(q: WorktreeSealRequest): AsyncIterable<WorktreeSealResult>
  select(q: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  selected(q: { readonly projectRoot: string }): Promise<{ readonly path?: string }>
  ensureWorkspace(q: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult>
  /** 批量归属解析（sidebar 树分组/概览锚定——身份归并单点；1.6 Typert 正典通路） */
  resolve(q: WorktreeResolveRequest): Promise<WorktreeResolveResult>
}

/** forge:dirs/* 面方法集（基本信息区五行目录事实——host 侧锚注册表解析下发，UI 只渲染） */
export interface ForgeDirsRpc {
  facts(projectId: string): Promise<DirFactRow[]>
}

/** forge:features/* list 读面（新建弹窗 slug 候选数据源——worktree-picker 消费切片） */
export interface ForgeFeaturesListRpc {
  list(q: ListFeaturesQuery): Promise<FeatureCard[]>
}

// ── forgeSpecs 窄面 wire 形（G3 spec 子 tab——DTO 单点水化消费切片，零 client 拼装）──
// 形状权威 = plugins/spec host/assembly/typert-remotes.ts（SpecCardDto/SpecDetailDto——
// host 半聚合水化）；跨插件零 import 纪律（AGENTS §1.3）→ 本面窄镜像只取 UI 消费字段，
// mode/谱系/作者无等价物不映射（spec 裁定留痕）。缺席边降级语义：spec 插件缺席 = typed
// 拒绝（unavailable 信封 → RpcClientError，消费面错误条）；身份未解析（ws null）= host
// 半 ok([]) 静默空态——两支分叉由消费面（spec-tab）分别承接。

/** Spec 卡片（清单行——host 半水化出参直投镜像） */
export interface SpecCardDto {
  readonly slug: string
  readonly title: string
  readonly specStatus: string
  readonly tiers: readonly string[]
  readonly goalCount: number
  readonly acCount: number
  readonly updatedAt: string
}

/** Spec 详情（展开元数据消费切片——goals + 文档登记悬空态；transitions 台账不在消费面） */
export interface SpecDetailDto extends SpecCardDto {
  readonly goals: readonly {
    readonly title: string
    readonly brief?: string
    readonly acs: readonly { readonly criterion: string }[]
  }[]
  readonly doc?: { readonly relPath: string; readonly dangling: boolean }
}

/** forgeSpecs/* 面方法集（spec 子 tab 读面 + 2.18 worktree-picker slug 候选拉取——
 *  list/detail 清单与展开、roadmaps/roadmapDetail 目标域；写动词不上 UI 面） */
export interface ForgeSpecsRpc {
  list(q: { readonly projectId: string; readonly search?: string }): Promise<readonly SpecCardDto[]>
  detail(q: { readonly projectId: string; readonly slug: string }): Promise<SpecDetailDto>
  /** roadmap 清单（M4a 端点族——slug 候选 roadmap 组源 + 逐行 roadmapDetail 寻址键） */
  roadmaps(q: { readonly projectId: string }): Promise<readonly RoadmapRowDto[]>
  /** roadmap 详情（milestone 内嵌——milestone 无独立列表端点，逐 roadmap 拉取聚合） */
  roadmapDetail(q: { readonly projectId: string; readonly slug: string }): Promise<RoadmapDetailDto>
}

// ── Roadmap DTO 窄镜像（2.18——形状权威 = plugins/spec host/assembly/typert-remotes.ts
//    RoadmapRow / RoadmapDetailDto；跨插件零 import 纪律 → 只镜像 UI 消费字段，SpecCardDto
//    同法。milestone 无 slug 字段（领域判据：寻径 = 父 slug + seq）——候选值取 title）。

/** Roadmap 行窄镜像（slug 候选 roadmap 组——slug/title/状态/时间戳消费切片） */
export interface RoadmapRowDto {
  readonly slug: string
  readonly title: string
  readonly roadmapStatus: string
  readonly updatedAt: string
}

/** Milestone 行窄镜像（title = slug 形候选值；seq/status 备 UI 排序/徽标消费） */
export interface RoadmapMilestoneDto {
  readonly id: string
  readonly seq: number
  readonly title: string
  readonly milestoneStatus: string
}

/** Roadmap 详情窄镜像（本体 + milestones 内嵌；achievement 不在消费面不镜像） */
export interface RoadmapDetailDto {
  readonly roadmap: RoadmapRowDto
  readonly milestones: readonly RoadmapMilestoneDto[]
}

/**
 * worktree UI 两目录（worktree-picker + session-badge）makeRpc 消费切片（窄面——挂载面
 * props 类型；测试替身按本形状给值。ForgeRpcClient 结构满足本切片）。settings 族退役
 * （1.38 AC③——crossBranchRiskDismissed 归 configForms 自有 namespace，弃 forge:settings）。
 * followSeal 可选：typert 真身（ForgeRpcClient）恒在场；壳侧 legacy transport 面缺席时
 * useWorktreeSeal 退 unary seal 快照（保投影单帧——宿主形状探测现查不缓存）。
 */
export type WorktreeFacesRpc = {
  projects: ForgeRpcClient['projects']
  features: ForgeRpcClient['features']
  worktree: Omit<ForgeRpcClient['worktree'], 'followSeal'> & Partial<Pick<ForgeRpcClient['worktree'], 'followSeal'>>
  /** spec 族（2.18 slug 候选三组拉取——spec 插件缺席 = 调用期 typed 拒绝，消费面 fail-soft） */
  specs: ForgeRpcClient['specs']
}

/** forge RPC client（传输 = 官方 Typert remote face，installForgeRemoteFace 注入真身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly bugs: ForgeBugsRpc
  readonly worktree: ForgeWorktreeRpc
  readonly features: ForgeFeaturesListRpc
  readonly dirs: ForgeDirsRpc
  readonly specs: ForgeSpecsRpc
}

export function createForgeRpcClient(): ForgeRpcClient {
  return {
    projects: {
      list: () => invokeRemote<ProjectSummary[]>('forgeProjects', 'list', []),
      register: (input) => invokeRemote<RegisterResult>('forgeProjects', 'register', [input]),
      deriveTaskStoreDir: (workspaceDir) =>
        invokeRemote<DeriveTaskStoreDirResult>('forgeProjects', 'deriveTaskStoreDir', [workspaceDir]),
      update: (id, patch) => invokeRemote<Project>('forgeProjects', 'update', [id, patch]),
    },
    fs: {
      listDir: (dirPath) => invokeRemote<DirListing>('forgeFs', 'listDir', [dirPath]),
    },
    bugs: {
      list: (q) => invokeRemote<BugCard[]>('forgeBugs', 'list', [q]),
    },
    worktree: {
      list: (q) => invokeRemote<WorktreeListResult>('forgeWorktree', 'list', [q]),
      create: (q) => invokeRemote<WorktreeCreateResult>('forgeWorktree', 'create', [q]),
      delete: (q) => invokeRemote<WorktreeDeleteResult>('forgeWorktree', 'delete', [q]),
      aheadBehind: (q) => invokeRemote<WorktreeAheadBehindResult>('forgeWorktree', 'aheadBehind', [q]),
      branches: (q) => invokeRemote<WorktreeBranchesResult>('forgeWorktree', 'branches', [q]),
      checks: (q) => invokeRemote<WorktreeChecksResult>('forgeWorktree', 'checks', [q]),
      seal: (q) => invokeRemote<WorktreeSealResult>('forgeWorktree', 'seal', [q]),
      followSeal: (q) => streamRemote<WorktreeSealResult>('forgeWorktree', 'followSeal', [q]),
      select: (q) => invokeRemote<WorktreeSelectResult>('forgeWorktree', 'select', [q]),
      selected: (q) => invokeRemote<{ readonly path?: string }>('forgeWorktree', 'selected', [q]),
      ensureWorkspace: (q) => invokeRemote<WorktreeEnsureWorkspaceResult>('forgeWorktree', 'ensureWorkspace', [q]),
      resolve: (q) => invokeRemote<WorktreeResolveResult>('forgeWorktree', 'resolve', [q]),
    },
    features: {
      list: (q) => invokeRemote<FeatureCard[]>('forgeFeatures', 'list', [q]),
    },
    dirs: {
      facts: (projectId) => invokeRemote<DirFactRow[]>('forgeDirs', 'facts', [{ projectId }]),
    },
    specs: {
      list: (q) => invokeRemote<readonly SpecCardDto[]>('forgeSpecs', 'list', [q]),
      detail: (q) => invokeRemote<SpecDetailDto>('forgeSpecs', 'detail', [q]),
      roadmaps: (q) => invokeRemote<readonly RoadmapRowDto[]>('forgeSpecs', 'roadmaps', [q]),
      roadmapDetail: (q) => invokeRemote<RoadmapDetailDto>('forgeSpecs', 'roadmapDetail', [q]),
    },
  }
}

/** RPC client 构造器（缺省 = typert 真身；注入 = 测试面覆写 installForgeRemoteFace） */
export type RpcClientFactory = () => ForgeRpcClient

/** 缺省构造：官方 Typert remote 真身（face 缺席构造期不抛——调用期诚实降级） */
export function createTypertRpcClient(): ForgeRpcClient {
  return createForgeRpcClient()
}
