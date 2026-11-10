// forge RPC client 窄面（定位：装配——插件 bundle 内部面，inventory §2.4「RPC 数据源改
// 插件 bundle 内部面」）：add-project 流程与 Bug 台账 pane 的数据源单门。通道名仅出自
// contracts 常量（禁字面量）；传输真身 = preload 桥 window.dshForge.invoke（apps/web
// rpc/transport 同形镜像——web/host 零 import 彼此）；信封拆装：RpcOk → data 原样返回，
// RpcErr → 抛 RpcClientError（typed error 反序列化），形状非法 fail-loud。
import {
  BUGS_CHANNELS,
  FS_CHANNELS,
  PROJECTS_CHANNELS,
  PROJECTS_M2_CHANNELS,
  type BugCard,
  type DeriveTaskStoreDirRequest,
  type DeriveTaskStoreDirResult,
  type DirListing,
  type ListBugsQuery,
  type ProjectSummary,
  type RegisterProjectInput,
  type RegisterResult,
  type RpcErrorPayload,
  type RpcResult,
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

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
  readonly fs: ForgeFsRpc
  readonly bugs: ForgeBugsRpc
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
  }
}

/** RPC client 构造器（缺省 = preload 真身；注入 = 测试面） */
export type RpcClientFactory = () => ForgeRpcClient

/** 缺省构造：preload 传输真身（缺席在构造期抛——由消费面错误归一收敛，不炸壳） */
export function preloadRpcClientFactory(): ForgeRpcClient {
  return createForgeRpcClient(preloadTransport())
}
