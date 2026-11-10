// forge RPC client 窄面（定位：装配——插件 bundle 内部面，inventory §2.4「RPC 数据源改
// 插件 bundle 内部面」）：add-project 流程与 Bug 台账 pane 的数据源单门。通道名仅出自
// contracts 常量（禁字面量）；传输真身 = preload 桥 window.dshForge.invoke（apps/web
// rpc/transport 同形镜像——web/host 零 import 彼此）；信封拆装：RpcOk → data 原样返回，
// RpcErr → 抛 RpcClientError（typed error 反序列化），形状非法 fail-loud。
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

/** 仅 preload 传输真身；缺席即装配断裂（host 未接 preload / 非 Electron 载体），fail-loud */
function preloadTransport(): ForgeTransport {
  const bridge = (globalThis as { dshForge?: DshForgeInvokeGlobal }).dshForge
  if (bridge === undefined || typeof bridge.invoke !== 'function') {
    throw new Error(
      'dsh-forge project client: window.dshForge.invoke 缺席——宿主 preload 未接 RPC 面（forge:* 通道常量 = @dsh-forge/contracts）',
    )
  }
  return (channel, payload) => bridge.invoke(channel, payload)
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

/** 缺省构造：preload 传输真身（缺席在构造期抛——由消费面错误归一收敛，不炸壳） */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
