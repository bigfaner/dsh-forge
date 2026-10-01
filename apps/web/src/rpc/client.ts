// forge RPC client（定位：基础——通道契约消费方，2.4 forge:projects/* 五通道）。
// 通道名仅出自 contracts 常量（禁字面量）；负载形状 = dto/rpc.ts 请求/响应映射；
// 信封拆装：RpcOk → data 原样返回；RpcErr → 抛 RpcClientError（typed error 反序列化）；
// 形状非法 fail-loud（不静默捏造结果）。3.5 knowledge 通道同型扩展（只增面不改建制）。
import {
  PROJECTS_CHANNELS,
  type GetProjectRequest,
  type Project,
  type ProjectPatch,
  type ProjectSummary,
  type RegisterProjectInput,
  type RegisterResult,
  type ReconcileReport,
  type RpcResult,
  type UpdateProjectRequest,
} from '@dsh-forge/contracts'
import { RpcClientError } from './errors.js'
import type { ForgeTransport } from './transport.js'

async function invokeRpc<T>(transport: ForgeTransport, channel: string, payload?: unknown): Promise<T> {
  const raw = await transport(channel, payload)
  if (raw === null || typeof raw !== 'object' || !('ok' in raw)) {
    throw new Error(
      `dsh-forge web: RPC 信封形状非法（channel=${channel}）——期望 contracts RpcResult 信封，实得 ${raw === null ? 'null' : typeof raw}`,
    )
  }
  const result = raw as RpcResult<T>
  if (result.ok) return result.data
  throw new RpcClientError(result.error)
}

/** forge:projects/* 面方法集（Interface 1 服务面的通道同构镜像） */
export interface ForgeProjectsRpc {
  register(input: RegisterProjectInput): Promise<RegisterResult>
  list(): Promise<ProjectSummary[]>
  get(id: string): Promise<Project | null>
  update(id: string, patch: ProjectPatch): Promise<Project>
  reconcile(): Promise<ReconcileReport>
}

/** forge RPC client（transport 注入：preloadTransport() 真身 / 测试替身） */
export interface ForgeRpcClient {
  readonly projects: ForgeProjectsRpc
}

export function createForgeRpcClient(transport: ForgeTransport): ForgeRpcClient {
  return {
    projects: {
      register: (input) => invokeRpc(transport, PROJECTS_CHANNELS.register, input),
      list: () => invokeRpc<ProjectSummary[]>(transport, PROJECTS_CHANNELS.list),
      get: (id) =>
        invokeRpc<Project | null>(transport, PROJECTS_CHANNELS.get, { id } satisfies GetProjectRequest),
      update: (id, patch) =>
        invokeRpc<Project>(transport, PROJECTS_CHANNELS.update, {
          id,
          patch,
        } satisfies UpdateProjectRequest),
      reconcile: () => invokeRpc<ReconcileReport>(transport, PROJECTS_CHANNELS.reconcile),
    },
  }
}
