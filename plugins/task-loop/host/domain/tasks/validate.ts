// validateFeatureTasks——单容器子图只读校验（core forge/tasks/validate.ts 直迁——
// plugin-task-loop 1.7 内联 + 容器语义 slug 化改造）。纯读零事务零事件。
// slug 化退役面：① 相位族中「推导不动点」「容器命中」两检查随 features/proposals 表退役
// 摘除（无容器主表可命中校验）；「slug 列 ≡ 容器 slug」由子图锚定（project_key+slug 查捞）
// 构造性成立；「同容器边约束」保留（判据 = 两端行同 project_key+slug——JOIN 判别）。
// 保留检查：① 同容器边约束 / ② cycle / ③ liveness / ④ record-chain / ⑤ topology。
// 子图口径：该容器全部 tasks（project_key+slug 归属）/ edges（等待方 ∈ 子图）/ records。
import type Database from "better-sqlite3";
import type { Violation } from "@dsh-forge/contracts";
import { CycleDetectedError } from "./errors.js";
import { SATISFYING_TASK_STATUSES } from "./state-machine.js";
import type { TaskStatus, TaskType, TasksVerbDeps } from "./types.js";

/** 校验装配依赖（只读动词——零事件面） */
export interface ValidateDeps {
  readonly db: Database.Database;
}

/** 子图任务行（最小定位形状） */
interface SubTaskRow {
  readonly id: string;
  readonly slug: string;
  readonly local_id: string;
  readonly project_key: string;
  readonly task_status: TaskStatus;
  readonly task_type: TaskType;
}

/** 子图边行 */
interface SubEdgeRow {
  readonly task_id: string;
  readonly prerequisite_id: string;
}

/** liveness 解锁路径判据：pending/in_progress = 有望满足；+interrupted（adopt 可恢复） */
const RESOLVABLE_PREREQ_STATUSES: readonly TaskStatus[] = ["pending", "in_progress", "interrupted"];

/** 数值 localId 主段（'2.5' → 2；非数值 → null——⑤ 豁免面） */
function localIdMajor(localId: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(localId);
  return m === null ? null : Number(m[1]);
}

/** DFS 三色 */
const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

export interface ValidateContainerTasksInput {
  readonly projectKey: string;
  readonly slug: string;
}

export interface ValidateReport {
  readonly violations: Violation[];
  readonly checked: { readonly slug: string; readonly tasks: number };
}

/** Interface 1 validateContainerTasks：单容器子图四类检查（只读——违规清单 + checked 计数） */
export function validateFeatureTasks(deps: ValidateDeps, input: ValidateContainerTasksInput): ValidateReport {
  const db = deps.db;

  // 子图行集（创建序确定性——违规清单稳定）
  const tasks = db
    .prepare<unknown[], SubTaskRow>(
      `SELECT id, slug, local_id, project_key, task_status, task_type FROM task_tasks
       WHERE project_key = ? AND slug = ? ORDER BY created_at, id`,
    )
    .all(input.projectKey, input.slug);
  const edges = db
    .prepare<unknown[], SubEdgeRow>(
      `SELECT e.task_id, e.prerequisite_id FROM task_edges e
       JOIN task_tasks t ON t.id = e.task_id
       WHERE t.project_key = ? AND t.slug = ? ORDER BY e.task_id, e.prerequisite_id`,
    )
    .all(input.projectKey, input.slug);
  const verbsByTask = new Map<string, Set<string>>();
  for (const r of db
    .prepare<unknown[], { task_id: string; verb: string }>(
      `SELECT r.task_id, r.verb FROM task_records r JOIN task_tasks t ON t.id = r.task_id
       WHERE t.project_key = ? AND t.slug = ?`,
    )
    .all(input.projectKey, input.slug)) {
    const set = verbsByTask.get(r.task_id);
    if (set === undefined) verbsByTask.set(r.task_id, new Set([r.verb]));
    else set.add(r.verb);
  }

  const byId = new Map<string, SubTaskRow>(tasks.map((t) => [t.id, t]));
  const foreignById = new Map<string, SubTaskRow>();
  const foreignStmt = db.prepare<unknown[], SubTaskRow>(
    `SELECT id, slug, local_id, project_key, task_status, task_type FROM task_tasks WHERE id = ?`,
  );
  /** 前置行水化（子图内直取；越界行按需查捞并缓存——FK 保证在场） */
  const prereqRow = (id: string): SubTaskRow | undefined => {
    const internal = byId.get(id);
    if (internal !== undefined) return internal;
    let row = foreignById.get(id);
    if (row === undefined) {
      row = foreignStmt.get(id) ?? undefined;
      if (row !== undefined) foreignById.set(id, row);
    }
    return row;
  };
  const natural = (row: { slug: string; local_id: string }): string => `${row.slug}/${row.local_id}`;
  const ref = (row: { slug: string; local_id: string }): { slug: string; localId: string } => ({
    slug: row.slug,
    localId: row.local_id,
  });

  const violations: Violation[] = [];

  // ── ① 同容器边约束（task_edges 两端行同 project_key+slug——服务不变量；越界行单独回报，
  //     不入 ②⑤ 图遍历节点集）

  const internalEdges: SubEdgeRow[] = [];
  for (const e of edges) {
    if (byId.has(e.prerequisite_id)) {
      internalEdges.push(e);
      continue;
    }
    const waiter = byId.get(e.task_id);
    const foreign = prereqRow(e.prerequisite_id);
    if (
      foreign !== undefined &&
      foreign.project_key === input.projectKey &&
      foreign.slug === input.slug
    ) {
      continue; // 同容器边合法
    }
    violations.push({
      kind: "phase-invariant",
      message:
        `跨容器边（同容器边服务不变量——task_edges 两端行须同 project_key+slug）：${waiter !== undefined ? natural(waiter) : e.task_id} ← ` +
        `${foreign !== undefined ? natural(foreign) : e.prerequisite_id}`,
      ...(waiter !== undefined ? { taskRef: ref(waiter) } : {}),
    });
  }

  // ── ② 无环复核（三色 DFS——写时增量校验的批量对照；每回边一报，路径首尾相接） ──

  const adjacency = new Map<string, string[]>();
  for (const e of internalEdges) {
    const list = adjacency.get(e.task_id);
    if (list === undefined) adjacency.set(e.task_id, [e.prerequisite_id]);
    else list.push(e.prerequisite_id);
  }
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const dfs = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === WHITE) dfs(next);
      else if (c === GRAY) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start), next]);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };
  for (const t of tasks) {
    if ((color.get(t.id) ?? WHITE) === WHITE) dfs(t.id);
  }
  for (const cycle of cycles) {
    const keys = cycle.map((id) => natural(byId.get(id) ?? { slug: "?", local_id: id }));
    const anchor = byId.get(cycle[0] as string);
    violations.push({
      kind: "cycle",
      message: new CycleDetectedError({ cycle: keys }).message,
      ...(anchor !== undefined ? { taskRef: ref(anchor) } : {}),
    });
  }

  // ── ③ liveness 三判据（blocked 任务的孤儿/过期/死锁诊断） ──

  const prereqsOf = new Map<string, string[]>();
  for (const e of edges) {
    const list = prereqsOf.get(e.task_id);
    if (list === undefined) prereqsOf.set(e.task_id, [e.prerequisite_id]);
    else list.push(e.prerequisite_id);
  }
  for (const t of tasks) {
    if (t.task_status !== "blocked") continue;
    const prereqIds = prereqsOf.get(t.id) ?? [];
    if (prereqIds.length === 0) {
      violations.push({
        kind: "liveness",
        message: `blocked 且无前置依赖（orphaned）——阻塞依据缺失：${natural(t)}`,
        taskRef: ref(t),
      });
      continue;
    }
    const statuses = prereqIds.map((id) => prereqRow(id)?.task_status);
    const allSatisfied = statuses.every(
      (s) => s !== undefined && (SATISFYING_TASK_STATUSES as readonly string[]).includes(s),
    );
    if (allSatisfied) {
      violations.push({
        kind: "liveness",
        message: `blocked 但前置全满足（stale——可经 unblockTask 解除或 submitTask 直达结算收口；恢复钩子漏接为常见成因）：${natural(t)}`,
        taskRef: ref(t),
      });
      continue;
    }
    const hasResolvable = statuses.some(
      (s) => s !== undefined && (RESOLVABLE_PREREQ_STATUSES as readonly string[]).includes(s),
    );
    if (!hasResolvable) {
      violations.push({
        kind: "liveness",
        message: `blocked 无解锁路径（deadlock——未满足前置均非 pending/in_progress/interrupted；前置侧死结）：${natural(t)}`,
        taskRef: ref(t),
      });
    }
  }

  // ── ④ 记录链完整性（append-only 审计链——状态与动词史的对应） ──

  for (const t of tasks) {
    const verbs = verbsByTask.get(t.id);
    if (t.task_status === "in_progress" && !(verbs?.has("claim") === true)) {
      violations.push({
        kind: "record-chain",
        message: `in_progress 无 claim 记录（记录链完整性）：${natural(t)}`,
        taskRef: ref(t),
      });
    }
    if (t.task_status === "completed" && !(verbs?.has("submit") === true)) {
      violations.push({
        kind: "record-chain",
        message: `completed 无 submit 记录（记录链完整性）：${natural(t)}`,
        taskRef: ref(t),
      });
    }
  }

  // ── ⑤ 拓扑可分层（数值主段 N≥2 须有更早阶段直接前置） ──

  for (const t of tasks) {
    const major = localIdMajor(t.local_id);
    if (major === null || major < 2) continue;
    const hasEarlierPhaseDep = (prereqsOf.get(t.id) ?? []).some((id) => {
      const depMajor = localIdMajor(prereqRow(id)?.local_id ?? "");
      return depMajor !== null && depMajor >= 1 && depMajor < major;
    });
    if (!hasEarlierPhaseDep) {
      violations.push({
        kind: "topology",
        message: `第 ${major} 阶任务无对更早阶段的直接依赖（拓扑可分层性——claimed too early）：${natural(t)}`,
        taskRef: ref(t),
      });
    }
  }

  return { violations, checked: { slug: input.slug, tasks: tasks.length } };
}

export type { TasksVerbDeps };
