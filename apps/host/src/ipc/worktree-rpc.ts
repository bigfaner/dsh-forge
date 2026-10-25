// forge:worktree/* 通道族（worktree-branch-management fix-2——装配缺口承接）。
// worktree-domain-migration 1.1 后本文件收敛为纯 wiring：域本体（createWorktreeRpcService
// + 6 Faces + 缓存/工具 + interceptSessionSends）已核迁 packages/plugins/git-worktree
// （rpc-service.ts / session-send-wrap.ts），此处仅 re-export 消费面 + main 侧通道注册。
//   · registerWorktreeChannels（main 侧 ipc 注册——m2-wiring 单行编排位）；
//   · 域符号 re-export（host 既有消费面 run.ts/child.ts/bindings.ts 零改动承载）。
import {
  WORKTREE_CHANNELS,
  type WorktreeAheadBehindRequest,
  type WorktreeBranchesRequest,
  type WorktreeChecksRequest,
  type WorktreeCreateRequest,
  type WorktreeDeleteRequest,
  type WorktreeListRequest,
  type WorktreeSealRequest,
  type WorktreeSelectRequest,
  type WorktreeResolveRequest,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'
import type { WorktreeRpcService } from '@dsh-forge/git-worktree'

export type {
  AclRunner,
  GitWorktreeServiceFace,
  LiveSessionFace,
  SessionControllerFace,
  SessionPersistenceFace,
  WorkspaceEntityFace,
  WorkspaceRegistryFace,
  WorktreeRpcService,
} from '@dsh-forge/git-worktree'
export {
  createWorktreeRpcService,
  defaultEnsureDirAcl,
  interceptSessionSends,
  invalidateResolveCaches,
  WORKTREE_RPC_METHODS,
} from '@dsh-forge/git-worktree'

/** forge:worktree/* 通道注册（负载映射 = contracts dto/worktree.ts，键键对应） */
export function registerWorktreeChannels(ipc: ForgeIpc, service: WorktreeRpcService): void {
  ipc.register(WORKTREE_CHANNELS.list, rpcEnvelope((q: WorktreeListRequest) => service.list(q)))
  ipc.register(WORKTREE_CHANNELS.create, rpcEnvelope((q: WorktreeCreateRequest) => service.create(q)))
  ipc.register(WORKTREE_CHANNELS.delete, rpcEnvelope((q: WorktreeDeleteRequest) => service.remove(q)))
  ipc.register(WORKTREE_CHANNELS.aheadBehind, rpcEnvelope((q: WorktreeAheadBehindRequest) => service.aheadBehind(q)))
  ipc.register(WORKTREE_CHANNELS.branches, rpcEnvelope((q: WorktreeBranchesRequest) => service.branches(q)))
  ipc.register(WORKTREE_CHANNELS.checks, rpcEnvelope((q: WorktreeChecksRequest) => service.checks(q)))
  ipc.register(WORKTREE_CHANNELS.seal, rpcEnvelope((q: WorktreeSealRequest) => service.seal(q)))
  ipc.register(WORKTREE_CHANNELS.select, rpcEnvelope((q: WorktreeSelectRequest) => service.select(q)))
  ipc.register(WORKTREE_CHANNELS.selected, rpcEnvelope((q: { projectRoot: string }) => service.selected(q)))
  ipc.register(WORKTREE_CHANNELS.resolve, rpcEnvelope((q: WorktreeResolveRequest) => service.resolve(q)))
}
