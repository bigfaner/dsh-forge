// client/projection/workspace-channel — 上游 workspace remote 写面的结构
// 鸭类型声明(任务 3.3;tech-design §Interfaces·Interface 2)。
//
// T3 裁决的落点:client relay 直调上游 `workspaceController` remote 动词 ——
// 本插件不依赖 vendored api-* 包(dispatch-launch channel.ts 先例/M2 4.1
// CliEnv 先例),在此重声明 relay 所需的四个动词结构面;声明形状以 vendored
// `packages/api/workspace-controller/src/types.ts`(c36ba648)为准,上游签名
// 是这些形状的超集,ctx 缝上的 cast 是健全的 —— 契约漂移防护 = 声明与
// vendored types.ts 的编译期形状对齐,漂移经 vendored 升级显式适配,无 any
// 穿透。vendored 事实(与 tech-design 草图的差异,以 vendored 为准):
//   - create 只收 { path }(无 title 参)—— ensure op 的 title 收敛由 relay
//     的 create-后条件 rename 承载(relay.ts);
//   - delete 非幂等拒绝:目标缺席 → 'workspace/not-found'(幂等语义 = relay
//     把该码折为成功);
//   - insertBefore 应答完整注册表序 { workspaceIds }。
//
// 解析缝:生成远端命名空间经 cordis 服务键 `remote.workspace` 暴露
// (vendored workspace-controller/client inject ['remote', 'remote.workspace'];
// dispatch-relay 的 `remote.dispatchLaunch` 同款),逐调用守卫解析 —— 键下
// 非服务值/四动词任一缺席 → undefined(降级,不散落 throw)。

import type { Context as ClientContext } from '@deepseek-ai/cordis'

/** One upstream verb failure (RemoteFailure 的结构子集:code + message)。 */
export interface WorkspaceOpFailure {
  readonly code: string
  readonly message: string
}

/**
 * One upstream verb's result(RemoteResult 的结构孪生:业务失败经判别联合
 * 返回而非 reject —— 错误码精确可读,零字符串解析)。
 */
export type WorkspaceOpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WorkspaceOpFailure }

/** One durable Workspace row(WorkspaceView 的结构子集;relay 消费三列)。 */
export interface WorkspaceRow {
  readonly workspaceId: string
  /** Canonical host directory path. */
  readonly path: string
  /** User-visible title. */
  readonly title: string
}

/** create 应答值(vendored WorkspaceCreateValue 结构孪生)。 */
export interface WorkspaceCreateValue {
  readonly workspace: WorkspaceRow
  /** true = 本次新建;false = 同 path 幂等收养既有行。 */
  readonly created: boolean
}

/**
 * The upstream workspace remote write face the projection relay consumes
 * (duck-typed structural declaration; the vendored service's signatures are
 * supersets of these shapes — vendored types.ts is the compile-time
 * authority, drift adapts explicitly through a vendored upgrade).
 */
export interface WorkspaceChannel {
  /** Create or idempotently resolve one Workspace over an existing directory. */
  create(request: { readonly path: string }): Promise<WorkspaceOpResult<WorkspaceCreateValue>>
  /** Rename one Workspace to a unique non-blank title. */
  rename(request: { readonly workspaceId: string; readonly title: string })
  : Promise<WorkspaceOpResult<{ readonly workspace: WorkspaceRow }>>
  /** Remove one Workspace registration (files and Sessions retained). */
  delete(request: { readonly workspaceId: string }): Promise<WorkspaceOpResult<{ readonly deleted: true }>>
  /** Move one Workspace within the registry order; omitted anchor appends. */
  insertBefore(request: {
    readonly workspaceId: string
    readonly beforeWorkspaceId?: string
  }): Promise<WorkspaceOpResult<{ readonly workspaceIds: readonly string[] }>>
}

/** The upstream remote namespace's cordis service key (gateway-mounted). */
export const WORKSPACE_REMOTE_KEY = 'remote.workspace'

/**
 * Resolve the workspace channel from a client context, PER CALL (the gateway
 * mounts the namespace services during boot — presence at execution time is
 * what matters; the dispatch-relay namespaceOf discipline). Face check
 * tolerates non-service values under the key (absence degrades to undefined,
 * never a scatter of throws).
 */
export function workspaceChannelOf(ctx: ClientContext): WorkspaceChannel | undefined {
  let candidate: unknown
  try {
    candidate = ctx.get(WORKSPACE_REMOTE_KEY, false)
  } catch {
    return undefined
  }
  if (candidate === null || typeof candidate !== 'object') return undefined
  const face = candidate as Partial<Record<keyof WorkspaceChannel, unknown>>
  return typeof face.create === 'function'
    && typeof face.rename === 'function'
    && typeof face.delete === 'function'
    && typeof face.insertBefore === 'function'
    ? candidate as WorkspaceChannel
    : undefined
}
