// forge RPC client 窄面（定位：装配——插件 bundle 内部面，inventory §2.4「RPC 数据源改
// 插件 bundle 内部面」）：add-project 流程与 Bug 台账 pane 的数据源单门。通道名仅出自
// contracts 常量（禁字面量）；传输真身 = 双宿主化传输（plugin-project 1.33）：官方缝
// connection.rpc.call 优先（official-rpc-audit sanctioned 缝——apply 期 installOfficialRpcFace
// 安装解析缝，逐调用现查不缓存），自家 channels face（preload 桥 window.dshForge.invoke，
// dsh-forge 宿主能力）兜底；两面皆缺席 = 通道不可用诚实降级（diag 留痕 + typed Error）。
// 信封拆装：RpcOk → data 原样返回，RpcErr → 抛 RpcClientError（typed error 反序列化），
// 形状非法 fail-loud。
import {
  BUGS_CHANNELS,
  FEATURES_CHANNELS,
  FS_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  PROPOSALS_CHANNELS,
  SETTINGS_CHANNELS,
  WORKTREE_CHANNELS,
  type BugCard,
  type DeriveTaskStoreDirRequest,
  type DeriveTaskStoreDirResult,
  type DirListing,
  type FeatureCard,
  type ForgeSettings,
  type ListBugsQuery,
  type ListFeaturesQuery,
  type ListProposalsQuery,
  type ProposalCard,
  type ProjectSummary,
  type RegisterProjectInput,
  type RegisterResult,
  type RpcErrorPayload,
  type RpcResult,
  type SetForgeSettingsInput,
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

/** typed error 的客户端形态（code ∈ contracts 六码；data = 结构化附载原样保存） */
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

/** forge:* 通道调用形状（client 注入消费——测试替身与 preload 真身同型） */
export type ForgeTransport = (channel: string, payload?: unknown) => Promise<unknown>

/** preload 暴露面的 RPC 切片（window.dshForge.invoke） */
interface DshForgeInvokeGlobal {
  invoke(channel: string, payload?: unknown): Promise<unknown>
}

/** 官方 client connection.rpc.call 窄面（ClientConnectionRpc 结构切片——信封 ConnectionRpcResult） */
export interface OfficialRpcCallFace {
  call(channel: string, endpoint: string, payload?: unknown, signal?: AbortSignal): Promise<unknown>
}

/** 官方通道名映射（forge:‹family› → /forge-‹family›——官方通道名 /^\/[A-Za-z0-9._~-]+$/ 禁冒号） */
const OFFICIAL_RPC_CHANNELS = {
  projects: '/forge-projects',
  fs: '/forge-fs',
  bugs: '/forge-bugs',
  worktree: '/forge-worktree',
  settings: '/forge-settings',
  proposals: '/forge-proposals',
  features: '/forge-features',
} as const

/** forge:‹family›/‹endpoint› → { channel, endpoint }（官方缝路由投影；非 forge 族 = undefined） */
export function officialRouteOf(channel: string): { readonly channel: string; readonly endpoint: string } | undefined {
  const slash = channel.indexOf('/')
  if (slash <= 0) return undefined
  const family = channel.slice(0, slash)
  if (!family.startsWith('forge:')) return undefined
  const name = OFFICIAL_RPC_CHANNELS[family.slice('forge:'.length) as keyof typeof OFFICIAL_RPC_CHANNELS]
  return name === undefined ? undefined : { channel: name, endpoint: channel.slice(slash + 1) }
}

/** 官方 face 解析缝（apply 期安装——每调用现查不缓存，AGENTS 1.6 检测永不缓存同径） */
let officialRpcResolver: (() => OfficialRpcCallFace | undefined) | undefined
/** 降级诊断钩子（apply 期可选安装——缺席 console 兜底，client 束豁免面） */
let dualTransportDiag: ((line: string) => void) | undefined

/**
 * 安装官方 connection.rpc 解析缝（projectClient.apply 装配期调用一次）：
 * resolver 逐调用现查 ctx.connection（reflect 防御读取，缺席宿主 = undefined 退自家 channels face）。
 */
export function installOfficialRpcFace(
  resolver: () => OfficialRpcCallFace | undefined,
  onDiag?: (line: string) => void,
): void {
  officialRpcResolver = resolver
  if (onDiag !== undefined) dualTransportDiag = onDiag
}

/** ConnectionRpcResult → forge RpcResult 信封投影（value → data；ConnectionRpcFailure → RpcErrorPayload 形） */
function officialResultToEnvelope(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error(
      `dsh-forge project client: 官方缝响应形状非法——期望 ConnectionRpcResult 信封，实得 ${raw === null ? 'null' : typeof raw}`,
    )
  }
  const result = raw as {
    ok: boolean
    value?: unknown
    error?: { code?: unknown; message?: unknown; details?: unknown }
  }
  if (result.ok) return { ok: true, data: result.value }
  return {
    ok: false,
    error: {
      code: typeof result.error?.code === 'string' ? result.error.code : 'internal',
      message: typeof result.error?.message === 'string' ? result.error.message : 'official rpc failure',
      data: result.error?.details,
    },
  }
}

/**
 * 双宿主化传输（1.33——connection.rpc.call 优先 + 自家 channels face 兜底）：
 * 官方 face 逐调用现查（检测永不缓存）；官方路由缺席/非 forge 族通道 → 自家 preload 桥；
 * 两面皆缺席 = 通道不可用诚实降级（diag 留痕 + typed Error，不静默不炸壳）。
 */
function dualHostTransport(): ForgeTransport {
  return async (channel, payload) => {
    const official = officialRpcResolver?.()
    if (official !== undefined && typeof official.call === 'function') {
      const route = officialRouteOf(channel)
      if (route !== undefined) {
        return officialResultToEnvelope(await official.call(route.channel, route.endpoint, payload))
      }
    }
    const bridge = (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
    if (bridge !== undefined && typeof bridge.invoke === 'function') {
      return bridge.invoke(channel, payload)
    }
    const line =
      'dsh-forge project client: 双宿主传输均缺席（官方 connection.rpc.call 与 window.dshForge.invoke 缺席）——forge:* 通道不可用（诚实降级）'
    if (dualTransportDiag !== undefined) dualTransportDiag(line)
    else console.warn(`[forge-rpc-transport] ${line}`)
    throw new Error(line)
  }
}

async function invokeRpc<T>(transport: ForgeTransport, channel: string, payload?: unknown): Promise<T> {
  const raw = await transport(channel, payload)
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error(
      `dsh-forge project client: RPC 信封形状非法（channel=${channel}）——期望 contracts RpcResult 信封，实得 ${raw === null ? 'null' : typeof raw}`,
    )
  }
  const result = raw as RpcResult<T>
  if (result.ok) return result.data
  throw new RpcClientError(result.error)
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

/** forge:worktree/* 面方法集（worktree-picker/session-badge 消费切片——九通道，UI 直调） */
export interface ForgeWorktreeRpc {
  list(q: WorktreeListRequest): Promise<WorktreeListResult>
  create(q: WorktreeCreateRequest): Promise<WorktreeCreateResult>
  delete(q: WorktreeDeleteRequest): Promise<WorktreeDeleteResult>
  aheadBehind(q: WorktreeAheadBehindRequest): Promise<WorktreeAheadBehindResult>
  branches(q: WorktreeBranchesRequest): Promise<WorktreeBranchesResult>
  checks(q: WorktreeChecksRequest): Promise<WorktreeChecksResult>
  seal(q: WorktreeSealRequest): Promise<WorktreeSealResult>
  select(q: WorktreeSelectRequest): Promise<WorktreeSelectResult>
  selected(q: { readonly projectRoot: string }): Promise<{ readonly path?: string }>
  ensureWorkspace(q: WorktreeEnsureWorkspaceRequest): Promise<WorktreeEnsureWorkspaceResult>
}

/** forge:settings/* 面方法集（跨分支「不再提示」一票读写——worktree-picker 消费切片） */
export interface ForgeSettingsRpc {
  get(): Promise<ForgeSettings>
  set(input: SetForgeSettingsInput): Promise<void>
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
 * props 类型；测试替身按本形状给值。ForgeRpcClient 结构满足本切片）。
 */
export type WorktreeFacesRpc = Pick<ForgeRpcClient, 'worktree' | 'settings' | 'projects' | 'proposals' | 'features'>

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly bugs: ForgeBugsRpc
  readonly worktree: ForgeWorktreeRpc
  readonly settings: ForgeSettingsRpc
  readonly proposals: ForgeProposalFeaturesListRpc
  readonly features: ForgeFeaturesListRpc
}

export function createForgeRpcClient(transport: ForgeTransport): ForgeRpcClient {
  return {
    projects: {
      list: () => invokeRpc<ProjectSummary[]>(transport, PROJECTS_CHANNELS.list),
      register: (input) => invokeRpc<RegisterResult>(transport, PROJECTS_CHANNELS.register, input),
      deriveTaskStoreDir: (workspaceDir) =>
        invokeRpc<DeriveTaskStoreDirResult>(transport, PROJECTS_M2_CHANNELS.deriveTaskStoreDir, {
          workspaceDir,
        } satisfies DeriveTaskStoreDirRequest),
    },
    fs: {
      listDir: (dirPath) => invokeRpc<DirListing>(transport, FS_CHANNELS.listDir, { dirPath }),
    },
    bugs: {
      list: (q) => invokeRpc<BugCard[]>(transport, BUGS_CHANNELS.list, q),
    },
    worktree: {
      list: (q) => invokeRpc<WorktreeListResult>(transport, WORKTREE_CHANNELS.list, q),
      create: (q) => invokeRpc<WorktreeCreateResult>(transport, WORKTREE_CHANNELS.create, q),
      delete: (q) => invokeRpc<WorktreeDeleteResult>(transport, WORKTREE_CHANNELS.delete, q),
      aheadBehind: (q) => invokeRpc<WorktreeAheadBehindResult>(transport, WORKTREE_CHANNELS.aheadBehind, q),
      branches: (q) => invokeRpc<WorktreeBranchesResult>(transport, WORKTREE_CHANNELS.branches, q),
      checks: (q) => invokeRpc<WorktreeChecksResult>(transport, WORKTREE_CHANNELS.checks, q),
      seal: (q) => invokeRpc<WorktreeSealResult>(transport, WORKTREE_CHANNELS.seal, q),
      select: (q) => invokeRpc<WorktreeSelectResult>(transport, WORKTREE_CHANNELS.select, q),
      selected: (q) => invokeRpc<{ readonly path?: string }>(transport, WORKTREE_CHANNELS.selected, q),
      ensureWorkspace: (q) =>
        invokeRpc<WorktreeEnsureWorkspaceResult>(transport, WORKTREE_CHANNELS.ensureWorkspace, q),
    },
    settings: {
      get: () => invokeRpc<ForgeSettings>(transport, SETTINGS_CHANNELS.get),
      set: (input) => invokeRpc<void>(transport, SETTINGS_CHANNELS.set, input),
    },
    proposals: {
      list: (q) => invokeRpc<ProposalCard[]>(transport, PROPOSALS_CHANNELS.list, q),
    },
    features: {
      list: (q) => invokeRpc<FeatureCard[]>(transport, FEATURES_CHANNELS.list, q),
    },
  }
}

/** RPC client 构造器（缺省 = preload 真身；注入 = 测试面） */
export type RpcClientFactory = () => ForgeRpcClient

/** 缺省构造：双宿主化传输真身（官方缝优先 + preload 兜底；双缺席构造期不抛——调用期诚实降级） */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(dualHostTransport())
}
