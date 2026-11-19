// @dsh-forge/project · host/assembly/channels.ts —— forge:worktree/* 通道注册
//（plugin-project 1.17 批二自 apps/host/src/ipc/worktree-rpc.ts 迁入——通道键映射属
// 插件域装配缝，AGENTS 1.3 插件可移植性；信封机制（typed error → RpcResult 序列化）
// 留宿主，经 envelope 依赖缝注入——零反向依赖）。键单源 = @dsh-forge/contracts
// WORKTREE_CHANNELS，键键对应 contracts dto/worktree.ts 负载映射。
import {
  WORKTREE_CHANNELS,
  type WorktreeAheadBehindRequest,
  type WorktreeBranchesRequest,
  type WorktreeChecksRequest,
  type WorktreeCreateRequest,
  type WorktreeDeleteRequest,
  type WorktreeEnsureWorkspaceRequest,
  type WorktreeListRequest,
  type WorktreeSealRequest,
  type WorktreeSelectRequest,
  type WorktreeResolveRequest,
} from '@dsh-forge/contracts'
import type { WorktreeRpcService } from '../worktrees/rpc-service.js'

/** 宿主 ipc 注册窄面（方法式声明——结构兼容真 ForgeIpc.allowlist 门面） */
export interface WorktreeChannelRegistrar {
  register(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
}

/** RPC 信封缝（宿主 rpcEnvelope——handler → RpcResult 信封 + 诊断埋点；宿主装配期注入） */
export type WorktreeRpcEnvelope = <Req, Res>(
  handler: (payload: Req) => Promise<Res> | Res,
) => (event: unknown, ...args: unknown[]) => unknown

/**
 * forge:worktree/* 通道注册（负载映射 = contracts dto/worktree.ts，键键对应）。
 * envelope 由宿主注入（apps/host ipc/rpc-envelope.ts——信封机制属宿主 IPC 面）。
 */
export function registerWorktreeChannels(
  ipc: WorktreeChannelRegistrar,
  service: WorktreeRpcService,
  envelope: WorktreeRpcEnvelope,
): void {
  ipc.register(WORKTREE_CHANNELS.list, envelope((q: WorktreeListRequest) => service.list(q)))
  ipc.register(WORKTREE_CHANNELS.create, envelope((q: WorktreeCreateRequest) => service.create(q)))
  ipc.register(WORKTREE_CHANNELS.delete, envelope((q: WorktreeDeleteRequest) => service.remove(q)))
  ipc.register(WORKTREE_CHANNELS.aheadBehind, envelope((q: WorktreeAheadBehindRequest) => service.aheadBehind(q)))
  ipc.register(WORKTREE_CHANNELS.branches, envelope((q: WorktreeBranchesRequest) => service.branches(q)))
  ipc.register(WORKTREE_CHANNELS.checks, envelope((q: WorktreeChecksRequest) => service.checks(q)))
  ipc.register(WORKTREE_CHANNELS.seal, envelope((q: WorktreeSealRequest) => service.seal(q)))
  ipc.register(WORKTREE_CHANNELS.select, envelope((q: WorktreeSelectRequest) => service.select(q)))
  ipc.register(WORKTREE_CHANNELS.selected, envelope((q: { projectRoot: string }) => service.selected(q)))
  ipc.register(WORKTREE_CHANNELS.resolve, envelope((q: WorktreeResolveRequest) => service.resolve(q)))
  ipc.register(
    WORKTREE_CHANNELS.ensureWorkspace,
    envelope((q: WorktreeEnsureWorkspaceRequest) => service.ensureWorkspace(q)),
  )
}
