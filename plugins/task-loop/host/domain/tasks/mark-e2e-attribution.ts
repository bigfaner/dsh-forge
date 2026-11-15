// markE2eAttribution——E2E 归因卡生成侧标记动词（core forge/tasks/mark-e2e-attribution.ts
// 直迁——plugin-task-loop 1.7 内联）。v1 列面适配：task_tasks 无 e2e_attribution 列（退役列
// 不建——goal AC），标记写点随列退役；动词面保留 = 行解析 fail-loud（归因卡无标记等于无豁免
// 的单一拒绝面 ERR_TASK_NOT_FOUND）+ 写后事件（消费面刷新）。幂等重调用无害。
import type { TasksVerbDeps, ContainerRef } from "./types.js";
import { resolveTaskRef } from "./query.js";

export interface MarkE2eAttributionInput {
  readonly projectKey: string;
  readonly slug: string;
  readonly localId: string;
}

/** Interface 1 markE2eAttribution：行解析（未命中 ERR_TASK_NOT_FOUND）+ 事件刷新 */
export async function markE2eAttribution(deps: TasksVerbDeps, input: MarkE2eAttributionInput): Promise<void> {
  const row = resolveTaskRef(deps.db, input.projectKey, { slug: input.slug, localId: input.localId });
  void row;
  // 写后事件（sessionLinks/taskDetail 时间线刷新——写后事件口径）
  deps.events.emitTasksChanged(input.projectKey);
}

export type { ContainerRef };
