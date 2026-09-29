// workbench/projection — 投影域 barrel(任务 3.1;纯函数内核 + 期望快照
// 仓储)。分层:plan(diff/plan 的数据形态与组装)← diff(对账偏差分类)
// ← expectation-repo(workspace_projection 读写);state-machine 独立裁决
// 状态迁移。动词接线(3.2)/relay(3.3)/生命周期 hook(3.4)消费本面。

export type { ProjectionState } from '../repos/types.ts'
export * from './plan.ts'
export * from './diff.ts'
export * from './expectation-repo.ts'
export * from './state-machine.ts'
