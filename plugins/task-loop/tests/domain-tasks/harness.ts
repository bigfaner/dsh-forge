// 任务域测试共享夹具（core forge/tasks/harness.ts 随迁——v1 schema 直写种行助手 +
// openDomainDb :memory: 装配 + 事件 spy）。本文件不进任何生产 import 图（testutil 同口径）。
import { openDomainDb } from "../../host/db/connection.js";
import type { TaskEvents, TasksVerbDeps } from "../../host/domain/tasks/types.js";

export type DomainDb = ReturnType<typeof openDomainDb>;

export interface EventSpy extends TaskEvents {
  readonly emitted: string[];
}

export interface TasksHarness {
  readonly projectKey: string;
  readonly domain: DomainDb;
  readonly db: DomainDb["db"];
  readonly events: EventSpy;
  readonly verbDeps: TasksVerbDeps;
  dispose(): void;
}

const PROJECT_CWD = "Z:\\ws\\domain-tasks";

/** 起夹具：:memory: 域库 + project_key 派生 + events spy + verbDeps */
export function createTasksHarness(): TasksHarness {
  const domain = openDomainDb(".", { file: ":memory:" });
  const projectKey = domain.projectKeyOf(PROJECT_CWD);
  const emitted: string[] = [];
  const events: EventSpy = {
    emitted,
    emitTasksChanged(pk: string): void {
      emitted.push(pk);
    },
  };
  const verbDeps: TasksVerbDeps = { db: domain.db, events };
  return {
    projectKey,
    domain,
    db: domain.db,
    events,
    verbDeps,
    dispose(): void {
      domain.db.close();
    },
  };
}

const NOW = "2026-01-01T00:00:00.000Z";

/** 种 task 行（v1 列面直写——受控初值：状态/类型/谱系） */
export function seedTask(
  h: TasksHarness,
  slug: string,
  localId: string,
  o: {
    status?: string;
    type?: string;
    fixOfTaskId?: string | null;
    createdAt?: string;
    priority?: string | null;
    brief?: string | null;
    contextJson?: string | null;
  } = {},
): string {
  const id = `t-${slug}-${localId}`.replace(/[^\w-]/g, "_");
  const ts = o.createdAt ?? NOW;
  h.db
    .prepare(
      `INSERT INTO task_tasks (id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
         estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity,
         project_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?, 0, NULL, 'medium', ?, ?, ?)`,
    )
    .run(
      id,
      slug,
      localId,
      `任务 ${localId}`,
      o.type ?? "coding-feature",
      o.status ?? "pending",
      o.brief ?? null,
      o.priority ?? null,
      o.contextJson ?? null,
      o.fixOfTaskId ?? null,
      h.projectKey,
      ts,
      ts,
    );
  return id;
}

/** 种边行（task_id=等待方 ← prerequisite_id=前置方） */
export function seedEdge(h: TasksHarness, waiterId: string, prerequisiteId: string, origin = "manual"): void {
  h.db
    .prepare(
      `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(waiterId, prerequisiteId, origin, NOW, NOW);
}

/** 种挂接行（task_session_links） */
export function seedLink(h: TasksHarness, taskId: string, sessionId: string): void {
  h.db
    .prepare(`INSERT INTO task_session_links (task_id, session_id, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(taskId, sessionId, NOW, NOW);
}

/** 种 record 行（v1 列面——note/payload_json/dispatch_digest/loop_sourced） */
export function seedRecord(
  h: TasksHarness,
  taskId: string,
  o: {
    verb?: string;
    from?: string;
    to?: string;
    note?: string;
    digest?: string;
    loopSourced?: boolean;
    actor?: string;
    sessionId?: string;
    createdAt?: string;
  } = {},
): void {
  const ts = o.createdAt ?? NOW;
  h.db
    .prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, note, payload_json, dispatch_digest,
         loop_sourced, actor, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      taskId,
      o.verb ?? "add",
      o.from ?? null,
      o.to ?? null,
      o.note ?? null,
      o.digest ?? null,
      o.loopSourced === true ? 1 : 0,
      o.actor ?? "plugin-tool",
      o.sessionId ?? null,
      ts,
      ts,
    );
}

/** 计行助手（表行数——batch 校验零落库断言） */
export function countRows(h: TasksHarness, table: string, slug?: string): number {
  const row = (
    slug === undefined
      ? h.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      : h.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE slug = ?`)
  ).get(...(slug === undefined ? [] : [slug])) as { n: number };
  return row.n;
}
