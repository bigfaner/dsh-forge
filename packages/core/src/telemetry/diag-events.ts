// 诊断事件域发射面——lib 公共包归拢（plugin-project 1.2 双源归一）后的兼容面：
// 本体（emitDiag / DiagEmitFace / console 兜底按级分流，与 git-worktree diag-fallback
// 同逻辑单源）已迁 lib/diag，本文件仅 re-export（core 内部既有 import 面零改动）。
// DIAG_EVENT / DiagLevel / DiagProcess / DiagEventPayload 单源仍经 @dsh-forge/lib-api
// （bug 5f7d7ebd——归并 lib/api 在后续任务）。core 不依赖 cordis 编译期包（既有设计
// 决策——ctx 以结构化最小面消费）不变；cordis Events 接口的类型化扩充（declare module）
// 仍留 host 侧（唯一 augmentation 点）。
export {
  DIAG_EVENT,
  diagConsoleFallback,
  emitDiag,
  emitDiagOrFallback,
  type DiagEmitFace,
  type DiagEventPayload,
  type DiagLevel,
  type DiagProcess,
} from '@dsh-forge/lib-diag'
