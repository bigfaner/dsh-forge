// workbench/projection — 投影域 barrel(任务 3.1 纯函数内核 + 期望快照仓储;
// 任务 3.2 对账 service;任务 3.4 生命周期 hook 接线)。分层:plan(diff/plan
// 的数据形态与组装)← diff(对账偏差分类)← expectation-repo
// (workspace_projection 读写);state-machine 独立裁决状态迁移;service
// (3.2)= 有状态编排(动词芯 + 对账重算 + push);lifecycle-hooks(3.4)=
// 生命周期动词 × 投影 push 的单一接线点。relay(3.3)消费本面。

export type { ProjectionState } from '../repos/types.ts'
export * from './plan.ts'
export * from './diff.ts'
export * from './expectation-repo.ts'
export * from './state-machine.ts'
export * from './service.ts'
export * from './lifecycle-hooks.ts'
