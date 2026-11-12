// forge RPC client 窄面（定位：装配——插件 bundle 内部面，inventory §2.4「RPC 数据源改
// 插件 bundle 内部面」）：add-project 流程与 Bug 台账 pane 的数据源单门。传输真身 =
// 官方 Typert Remote namespace（plugin-project 1.38 正典化——八族 forge:* 收编 ctx.remote
// 第一等通道；1.33 connection.rpc/fetch 过渡缝与 preload 桥 forge:* 通道随本批退役）。
// face 安装：apply 期 installForgeRemoteFace 安装解析缝（逐调用现查不缓存——AGENTS 1.6），
// 官方 remote 面缺席 = 通道不可用诚实降级（diag 留痕 + typed Error，不静默不炸壳）。
// 信封拆装：RemoteResult → data（value 原样），failure → 抛 RpcClientError（typed error
// 反序列化），形状非法 fail-loud。通道名/方法名单源 = ui/remote.ts descriptor 表 +
// host 半 typert-remotes.ts（两表测试 pin 锁定）。
import {
  type BugCard,
  type DeriveTaskStoreDirResult,
  type DirListing,
  type FeatureCard,
  type ListBugsQuery,
  type ListFeaturesQuery,
  type ListProposalsQuery,
  type ProposalCard,
  type ProjectSummary,
  type RegisterProjectInput,
  type RegisterResult,
  type RpcErrorPayload,
  type RpcResult,
  type WorktreeAheadBehindRequest,
  type WorktreeAheadBehindResult,
  type WorktreeBranchesRequest,
  type WorktreeBranchesResult,
  type WorktreeChecksRequest,
  type WorktreeChecksResult,
  type WorktreeCreateRequest,
  type WorktreeCreateResult,
  type WorktreeDeleteRequest,
  type WorktreeDeleteResult,
  type WorktreeEnsureWorkspaceRequest,
  type WorktreeEnsureWorkspaceResult,
  type WorktreeListRequest,
  type WorktreeListResult,
  type WorktreeSelectRequest,
  type WorktreeSelectResult,
  type WorktreeSealRequest,
  type WorktreeSealResult,
} from '@dsh-forge/contracts'

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

/** 官方 ctx.remote 六族消费切片（apply 期 installForgeRemoteFace 安装的解析目标） */
export interface ForgeRemoteFace {
  readonly forgeProjects: ForgeRemoteNamespaceFace
  readonly forgeFs: ForgeRemoteNamespaceFace
  readonly forgeBugs: ForgeRemoteNamespaceFace
  readonly forgeWorktree: ForgeRemoteNamespaceFace
  readonly forgeProposals: ForgeRemoteNamespaceFace
  readonly forgeFeatures: ForgeRemoteNamespaceFace
}

/** 降级诊断钩子（apply 期可选安装——缺席 console 兜底，client 束豁免面） */
let dualTransportDiag: ((line: string) => void) | undefined

// ── 页内跨 bundle 单例锚（bug 837a70fc——1.38 client 半换面回归收口）──
// rpc.ts 的解析缝是模块级状态，页面同时存在两份本模块实例（plugins/project bundle +
// 壳 bundle 经 client-ui/add-project 内联的副本）：壳侧副本从不调用 installForgeRemote-
// Face → resolver 恒缺席反复诚实降级（真机 fb-console [forge-rpc-transport] 前缀实证）。
// 收口 = 安装面同步发布页内全局锚（KEY 契约先例：__dshForgeOpenWorkspace/
// __dshForgeWorktreeSwitchGate 双注同型），缺本地缝的副本回退读锚——页内单例状态。

/** 页内锚键（写读双注：写入器 = @dsh-forge/project bundle apply；读取器 = 壳侧同源副本） */
export const FORGE_REMOTE_FACE_ANCHOR_KEY = '__dshForgeRemoteFace'

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
  if (forgeRemoteResolver !== undefined) return { resolver: forgeRemoteResolver, diag: dualTransportDiag }
  return faceAnchorOf() ?? { resolver: () => undefined }
}

/**
 * 安装官方 Typert remote 解析缝（projectClient.apply 装配期调用一次）：
 * resolver 逐调用现查 ctx.remote 六族面（reflect 防御读取，缺席宿主 = undefined 诚实降级）。
 */
export function installForgeRemoteFace(
  resolver: () => ForgeRemoteFace | undefined,
  onDiag?: (line: string) => void,
): void {
  forgeRemoteResolver = resolver
  if (onDiag !== undefined) dualTransportDiag = onDiag
  // 页内锚同步发布（跨 bundle 副本单例——见 FORGE_REMOTE_FACE_ANCHOR_KEY 注）
  globalScopeOf()[FORGE_REMOTE_FACE_ANCHOR_KEY] = { resolver, diag: onDiag }
}

/** face 解析缝（apply 期安装——每调用现查不缓存） */
let forgeRemoteResolver: (() => ForgeRemoteFace | undefined) | undefined

/** namespace face 取法（解析缝缺席/面形状非法 = undefined——调用期诚实降级）。
 * 官方 face 双形态兼容（bug bead3e88）：官方 typert RemoteView 把命名空间挂在
 * `face.namespaces` 子对象（w140 真机探针 faceKeys 实证），旧解析缝只认顶层命名空间
 * → 解析缺席诚实降级。此处先探 namespaces 子对象、缺席回退顶层（双形态兼容）。 */
function namespaceOf(face: ForgeRemoteFace, namespace: keyof ForgeRemoteFace): ForgeRemoteNamespaceFace | undefined {
  const rawNamespaces = (face as unknown as Record<string, unknown>)['namespaces']
  const holder =
    rawNamespaces !== undefined && rawNamespaces !== null && typeof rawNamespaces === 'object'
      ? (rawNamespaces as Record<string, unknown>)
      : (face as unknown as Record<string, unknown>)
  const ns = holder[namespace] as unknown
  if (ns === undefined || ns === null || typeof ns !== 'object') return undefined
  return ns as ForgeRemoteNamespaceFace
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

/** typert 调用（一元——位置参直透 + RemoteResult 信封投影 + typed error 抛出） */
async function invokeRemote<T>(
  namespace: keyof ForgeRemoteFace,
  method: string,
  args: readonly unknown[],
): Promise<T> {
  const seam = faceSeamOf()
  const face = seam.resolver()
  const ns = face === undefined ? undefined : namespaceOf(face, namespace)
  const fn = methodOf(ns, method)
  if (fn === undefined) {
    const line = `dsh-forge project client: 官方 forge remote 面缺席（${String(namespace)}.${method}）——通道不可用（诚实降级）`
    const diag = seam.diag ?? dualTransportDiag
    if (diag !== undefined) diag(line)
    else console.warn(`[forge-rpc-transport] ${line}`)
    throw new Error(line)
  }
  return invokeEnvelope(await (fn as (...args: unknown[]) => unknown)(...args), `${String(namespace)}/${method}`)
}

async function invokeEnvelope<T>(raw: unknown, channel: string): Promise<T> {
  const result = remoteResultOf(raw, channel) as RpcResult<T>
  if (result.ok) return result.data
  throw new RpcClientError(result.error)
}

/** typert 流调用（mode:'stream'——AsyncIterable 帧直透，缺席 face = 诚实降级 throw） */
function streamRemote<T>(
  namespace: keyof ForgeRemoteFace,
  method: string,
  args: readonly unknown[],
): AsyncIterable<T> {
  const seam = faceSeamOf()
  const face = seam.resolver()
  const ns = face === undefined ? undefined : namespaceOf(face, namespace)
  const fn = methodOf(ns, method)
  if (fn === undefined) {
    const line = `dsh-forge project client: 官方 forge remote 面缺席（${String(namespace)}.${method}）——通道不可用（诚实降级）`
    const diag = seam.diag ?? dualTransportDiag
    if (diag !== undefined) diag(line)
    else console.warn(`[forge-rpc-transport] ${line}`)
    throw new Error(line)
  }
  const handle = (fn as (...args: unknown[]) => unknown)(...args) as AsyncIterable<T>
  return (async function* () {
    for await (const frame of handle) yield frame
  })()
}

/** forge:projects/* 面方法集（本插件消费切片：list/register/deriveTaskStoreDir） */
export interface ForgeProjectsRpc {
  list(): Promise<ProjectSummary[]>
  register(input: RegisterProjectInput): Promise<RegisterResult>
  deriveTaskStoreDir(workspaceDir: string): Promise<DeriveTaskStoreDirResult>
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
}

/** forge:{proposals,features}/* list 读面（新建弹窗 slug 候选数据源——worktree-picker 消费切片） */
export interface ForgeProposalFeaturesListRpc {
  list(q: ListProposalsQuery): Promise<ProposalCard[]>
}

export interface ForgeFeaturesListRpc {
  list(q: ListFeaturesQuery): Promise<FeatureCard[]>
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
  proposals: ForgeRpcClient['proposals']
  features: ForgeRpcClient['features']
  worktree: Omit<ForgeRpcClient['worktree'], 'followSeal'> & Partial<Pick<ForgeRpcClient['worktree'], 'followSeal'>>
}

/** forge RPC client（传输 = 官方 Typert remote face，installForgeRemoteFace 注入真身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly bugs: ForgeBugsRpc
  readonly worktree: ForgeWorktreeRpc
  readonly proposals: ForgeProposalFeaturesListRpc
  readonly features: ForgeFeaturesListRpc
}

export function createForgeRpcClient(): ForgeRpcClient {
  return {
    projects: {
      list: () => invokeRemote<ProjectSummary[]>('forgeProjects', 'list', []),
      register: (input) => invokeRemote<RegisterResult>('forgeProjects', 'register', [input]),
      deriveTaskStoreDir: (workspaceDir) =>
        invokeRemote<DeriveTaskStoreDirResult>('forgeProjects', 'deriveTaskStoreDir', [workspaceDir]),
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
    },
    proposals: {
      list: (q) => invokeRemote<ProposalCard[]>('forgeProposals', 'list', [q]),
    },
    features: {
      list: (q) => invokeRemote<FeatureCard[]>('forgeFeatures', 'list', [q]),
    },
  }
}

/** RPC client 构造器（缺省 = typert 真身；注入 = 测试面覆写 installForgeRemoteFace） */
export type RpcClientFactory = () => ForgeRpcClient

/** 缺省构造：官方 Typert remote 真身（face 缺席构造期不抛——调用期诚实降级） */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient()
}
