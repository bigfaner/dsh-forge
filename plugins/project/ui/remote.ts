// ui/remote.ts —— forge:* 八族 Typert client 贡献（plugin-project 1.38——UI 数据通路正典
// 化：官方 ctx.remote.<ns> 第一等通道，弃 forge:* 自造通道主路径）。形态 = 官方 typert
// generator 产物 rc.2 线手写同构（dsh-api-job-controller lib/typert.remote-client.js 实证：
// 纯字面量 { package, descriptors }，无 createTypertRemoteInfo——rc.2 runtime 无 generator
// 依赖，零 zod 工厂外露）。wire 名单源 = host 半方法签名（gateway SRC 发现路径按形参名
// 解码——plugins/project/host/assembly/typert-remotes.ts 单一事实源，两表测试 pin 锁定）。
//
// codec 诚实性说明：strict codec 的 create() 按边界契约做结构校验（本面自含轻量校验器，
// 不引 zod——官方 client 安装面只强制 codec.mode==='strict'，不调用 create；rc.2 生成物
// 的 zod 工厂在 client 半同样不执行，schema 语义归宿主 SRC JSON 安全校验）。
import type {
  InvocationDescriptor,
  InvocationParameterDescriptor,
  RemoteResult,
  RemoteStreamHandle,
  TypertCodec,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  BugCard,
  DirListing,
  FeatureCard,
  ListBugsQuery,
  ListFeaturesQuery,
  ListProposalsQuery,
  ProposalCard,
  ProjectSummary,
  RegisterProjectInput,
  RegisterResult,
  WorktreeAheadBehindRequest,
  WorktreeAheadBehindResult,
  WorktreeBranchesRequest,
  WorktreeBranchesResult,
  WorktreeChecksRequest,
  WorktreeChecksResult,
  WorktreeCreateRequest,
  WorktreeCreateResult,
  WorktreeDeleteRequest,
  WorktreeDeleteResult,
  WorktreeEnsureWorkspaceRequest,
  WorktreeEnsureWorkspaceResult,
  WorktreeListRequest,
  WorktreeListResult,
  WorktreeSelectRequest,
  WorktreeSelectResult,
  WorktreeSealRequest,
  WorktreeSealResult,
} from '@dsh-forge/contracts'

// ── 轻量 strict codec（结构校验收口——零 zod 依赖，形态同 rc.2 生成物字段表）──

type Check = (value: unknown) => boolean

const isRecord: Check = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const isArray: Check = Array.isArray
const isString: Check = (value) => typeof value === 'string'
const isAnything: Check = () => true

function strictCodec(typeSymbol: string, check: Check): TypertCodec {
  return {
    mode: 'strict',
    typeSymbol,
    create: () => ({
      parse: (value: unknown) => {
        if (!check(value)) throw new Error(`dsh-forge project client: forge remote ${typeSymbol} payload shape invalid`)
        return value
      },
    }),
  }
}

function jsonParam(name: string, typeSymbol: string, check: Check, acceptsUndefined?: true): InvocationParameterDescriptor {
  return acceptsUndefined === true
    ? { name, wire: name, source: 'json', acceptsUndefined: true, codec: strictCodec(typeSymbol, check) }
    : { name, wire: name, source: 'json', codec: strictCodec(typeSymbol, check) }
}

/** descriptor 行工厂（全方法 cancellation = signal 尾参——host 半签名同径） */
function remoteMethod(descriptor: Omit<InvocationDescriptor, 'cancellation'> & { readonly mode?: 'stream' }): InvocationDescriptor {
  return { ...descriptor, cancellation: { parameter: 'signal' } }
}

// ── namespace 面类型（ctx.remote.<ns> 消费面——official ForgePanelController mount 同型）──

/** forgeProjects namespace 消费面 */
export interface ForgeProjectsNamespace {
  list(): Promise<RemoteResult<ProjectSummary[]>>
  register(input: RegisterProjectInput): Promise<RemoteResult<RegisterResult>>
  deriveTaskStoreDir(workspaceDir: string): Promise<RemoteResult<never>>
}
/** forgeFs namespace 消费面 */
export interface ForgeFsNamespace {
  listDir(dirPath?: string): Promise<RemoteResult<DirListing>>
}
/** forgeBugs namespace 消费面 */
export interface ForgeBugsNamespace {
  list(query: ListBugsQuery): Promise<RemoteResult<BugCard[]>>
}
/** forgeWorktree namespace 消费面（followSeal = mode:'stream' 封存态推流——AC②） */
export interface ForgeWorktreeNamespace {
  list(query: WorktreeListRequest): Promise<RemoteResult<WorktreeListResult>>
  create(query: WorktreeCreateRequest): Promise<RemoteResult<WorktreeCreateResult>>
  delete(query: WorktreeDeleteRequest): Promise<RemoteResult<WorktreeDeleteResult>>
  aheadBehind(query: WorktreeAheadBehindRequest): Promise<RemoteResult<WorktreeAheadBehindResult>>
  branches(query: WorktreeBranchesRequest): Promise<RemoteResult<WorktreeBranchesResult>>
  checks(query: WorktreeChecksRequest): Promise<RemoteResult<WorktreeChecksResult>>
  seal(query: WorktreeSealRequest): Promise<RemoteResult<WorktreeSealResult>>
  followSeal(query: WorktreeSealRequest): RemoteStreamHandle<WorktreeSealResult, never>
  select(query: WorktreeSelectRequest): Promise<RemoteResult<WorktreeSelectResult>>
  selected(query: { readonly projectRoot: string }): Promise<RemoteResult<{ readonly path?: string }>>
  ensureWorkspace(query: WorktreeEnsureWorkspaceRequest): Promise<RemoteResult<WorktreeEnsureWorkspaceResult>>
}
/** forgeProposals namespace 消费面 */
export interface ForgeProposalsNamespace {
  list(query: ListProposalsQuery): Promise<RemoteResult<ProposalCard[]>>
}
/** forgeFeatures namespace 消费面 */
export interface ForgeFeaturesNamespace {
  list(query: ListFeaturesQuery): Promise<RemoteResult<FeatureCard[]>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    forgeProjects: ForgeProjectsNamespace
    forgeFs: ForgeFsNamespace
    forgeBugs: ForgeBugsNamespace
    forgeWorktree: ForgeWorktreeNamespace
    forgeProposals: ForgeProposalsNamespace
    forgeFeatures: ForgeFeaturesNamespace
  }
}

// ── descriptor 表（wire 名 = host 半形参名；implementation = exportName 别名的域实现名）──

const WORKTREE_LIST_SHAPE = 'WorktreeListRequest'
const WORKTREE_RESULT_SHAPES = 'WorktreeRpcResult'

/** forgeWorktree 一元方法 descriptor 行（九法同构——query 单参 + signal 尾参） */
function worktreeUnary(method: string, implementation?: string): InvocationDescriptor {
  return remoteMethod({
    id: `@dsh-forge/project#forgeWorktree/${method}`,
    service: 'forgeWorktreeController',
    namespace: 'forgeWorktree',
    method,
    ...(implementation !== undefined ? { implementation } : {}),
    invocation: { kind: 'direct' },
    parameters: [jsonParam('query', WORKTREE_LIST_SHAPE, isRecord)],
    result: strictCodec(`${WORKTREE_RESULT_SHAPES}/${method}`, isAnything),
  })
}

/** forgeProposals/forgeFeatures list descriptor 行 */
function domainList(namespace: 'forgeProposals' | 'forgeFeatures', service: string): InvocationDescriptor {
  return remoteMethod({
    id: `@dsh-forge/project#${namespace}/list`,
    service,
    namespace,
    method: 'list',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('query', `${namespace}.ListQuery`, isRecord)],
    result: strictCodec(`${namespace}.ListResult`, isArray),
  })
}

/** forge:* 六族贡献描述符（client $mount 挂载——官方 gateway client installMethods 消费） */
export const FORGE_REMOTE_DESCRIPTORS: readonly InvocationDescriptor[] = [
  remoteMethod({
    id: '@dsh-forge/project#forgeProjects/list',
    service: 'forgeProjectsController',
    namespace: 'forgeProjects',
    method: 'list',
    invocation: { kind: 'direct' },
    parameters: [],
    result: strictCodec('forgeProjects.ListResult', isArray),
  }),
  remoteMethod({
    id: '@dsh-forge/project#forgeProjects/register',
    service: 'forgeProjectsController',
    namespace: 'forgeProjects',
    method: 'register',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('input', 'RegisterProjectInput', isRecord)],
    result: strictCodec('forgeProjects.RegisterResult', isAnything),
  }),
  remoteMethod({
    id: '@dsh-forge/project#forgeProjects/deriveTaskStoreDir',
    service: 'forgeProjectsController',
    namespace: 'forgeProjects',
    method: 'deriveTaskStoreDir',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('workspaceDir', 'string', isString)],
    result: strictCodec('forgeProjects.DeriveTaskStoreDirResult', isAnything),
  }),
  remoteMethod({
    id: '@dsh-forge/project#forgeFs/listDir',
    service: 'forgeFsController',
    namespace: 'forgeFs',
    method: 'listDir',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('dirPath', 'string', isString, true)],
    result: strictCodec('forgeFs.DirListing', isRecord),
  }),
  remoteMethod({
    id: '@dsh-forge/project#forgeBugs/list',
    service: 'forgeBugsController',
    namespace: 'forgeBugs',
    method: 'list',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('query', 'ListBugsQuery', isRecord)],
    result: strictCodec('forgeBugs.ListResult', isArray),
  }),
  worktreeUnary('list'),
  worktreeUnary('create'),
  worktreeUnary('delete', 'remove'),
  worktreeUnary('aheadBehind'),
  worktreeUnary('branches'),
  worktreeUnary('checks'),
  remoteMethod({
    id: '@dsh-forge/project#forgeWorktree/seal',
    service: 'forgeWorktreeController',
    namespace: 'forgeWorktree',
    method: 'seal',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('query', 'WorktreeSealRequest', isRecord)],
    result: strictCodec('forgeWorktree.SealResult', isAnything),
  }),
  remoteMethod({
    id: '@dsh-forge/project#forgeWorktree/followSeal',
    service: 'forgeWorktreeController',
    namespace: 'forgeWorktree',
    method: 'followSeal',
    mode: 'stream',
    invocation: { kind: 'direct' },
    parameters: [jsonParam('query', 'WorktreeSealRequest', isRecord)],
    result: strictCodec('forgeWorktree.SealFrame', isAnything),
  }),
  worktreeUnary('select'),
  worktreeUnary('selected'),
  worktreeUnary('ensureWorkspace'),
  domainList('forgeProposals', 'forgeProposalsController'),
  domainList('forgeFeatures', 'forgeFeaturesController'),
]

/** client 贡献本体（apply 期 ctx.remote.$mount 挂载——调用方 fiber 撤销级联） */
export const FORGE_REMOTE_CONTRIBUTION: TypertRemoteContribution = {
  package: '@dsh-forge/project',
  descriptors: FORGE_REMOTE_DESCRIPTORS,
}
