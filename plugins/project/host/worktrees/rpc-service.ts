// forge:worktree/* 域兼容出口（plugin-project 1.13 单体拆解）。本体按职责分件（依赖单向）：
//   service（编排 + resolve 缓存与失效）/ git-client（git 与外部事实触点）/
//   seal（封存判定快照）/ send-guard（发送拦截，R5 现查承载）/ healing（list 顺带 healing）/
//   bind-events（session/created 留痕前台触发）——见各件头注。
// 本文件仅 re-export 兼容面（host-assembly 与既有测试 import 面零改动）；新消费面按域直指各件。
export {
  createWorktreeRpcService,
  invalidateResolveCaches,
  WORKTREE_RPC_METHODS,
  type GitWorktreeServiceFace,
  type LiveSessionFace,
  type SessionControllerFace,
  type SessionPersistenceFace,
  type WorkspaceEntityFace,
  type WorkspaceRegistryFace,
  type WorktreeRpcService,
  type WorktreeServiceContext,
  type WorktreeServiceDeps,
} from './service.js'
export { defaultEnsureDirAcl, type AclRunner } from './git-client.js'
