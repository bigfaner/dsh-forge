// readUnsettledChain——容器实现链未终态 I 卡清单只读读面（core forge/tasks/
// read-unsettled-chain.ts 直迁——plugin-task-loop 1.7 内联 + slug 容器化）。执行体 =
// phase-gate.ts readUnsettledChain（与 GATE_SQL 第②支同判据同执行体）——消费方零第二实现。
// 纯读：零状态效应、零事件；容器未命中 = 空清单（读面零 404 同口径）。
import type { TasksVerbDeps, ContainerRef } from "./types.js";
import { readUnsettledChain as readUnsettledChainRows } from "./phase-gate.js";

export interface ReadUnsettledChainInput {
  readonly projectKey: string;
  readonly source: ContainerRef;
}

export interface ReadUnsettledChainResult {
  readonly unsettled: readonly { slug: string; localId: string; taskStatus: string }[];
}

/** Interface 1 readUnsettledChain：容器限定链集合查询（纯读） */
export async function readUnsettledChain(deps: TasksVerbDeps, input: ReadUnsettledChainInput): Promise<ReadUnsettledChainResult> {
  const scope = { projectKey: input.projectKey, slug: input.source.slug };
  const hit = deps.db
    .prepare<unknown[], { n: number }>(`SELECT COUNT(*) AS n FROM task_tasks WHERE project_key = ? AND slug = ?`)
    .get(scope.projectKey, scope.slug);
  if ((hit?.n ?? 0) === 0) return { unsettled: [] };
  return { unsettled: readUnsettledChainRows(deps.db, scope) };
}
