// queryTask——任务域读动词（core forge/tasks/query.ts 直迁——plugin-task-loop 1.7 内联 +
// v1 schema 列面适配）。定位：任务域只读 prepared statements，零事务零事件（写后事件归写动词）。
// 身份解析：agent 面 TaskRef = { slug; localId } 两显式参 + project_key 归属谓词（共享单库
// ——uq_task_tasks_project_slug_local 查捞），未命中 ERR_TASK_NOT_FOUND。
// include 四节（prerequisites/waitingOnMe/records/sessions）按门控呈现。
// 容器语义 slug 化退役面：hydrateTaskContainer 双轨水化退役（无容器主表——容器摘要 =
// slug 本身）；resolvePhaseGuardFeature 随相位域一并退役（新线零 features 表）。
import type Database from "@dsh-forge/lib-db";
import {
  taskFilesUnion,
} from "./files.js";
import {
  TaskNotFoundError,
} from "./errors.js";
import {
  createSettlementRepo,
  parseAcResults,
} from "../../db/repositories/settlement-repo.js";
import type {
  SessionTaskLinkCard,
  TaskAcResult,
  TaskActor,
  TaskPrerequisiteSummary,
  TaskRecordEntry,
  TaskRef,
  TaskSnapshot,
  TaskStatus,
  TaskType,
  TasksVerbDeps,
} from "./types.js";

/** task_tasks 行存储形状（v1 19 列 snake_case → TaskSnapshot 映射唯一落点；写动词同域复用） */
export interface TaskStorageRow {
  id: string;
  slug: string;
  local_id: string;
  title: string;
  task_type: TaskType;
  task_status: TaskStatus;
  brief: string | null;
  ac_json: string | null;
  priority: string | null;
  estimated_time: string | null;
  scope_json: string | null;
  context_json: string | null;
  fix_of_task_id: string | null;
  breaking: number;
  coverage_threshold: number | null;
  complexity: string;
  project_key: string;
  created_at: string;
  updated_at: string;
}

/** task_records 行存储形状（v1 列面——note/payload_json 融合形） */
export interface TaskRecordStorageRow {
  verb: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus | null;
  note: string | null;
  payload_json: string | null;
  dispatch_digest: string | null;
  loop_sourced: number;
  actor: TaskActor;
  session_id: string | null;
  created_at: string;
}

export const TASK_COLUMNS = `id, slug, local_id, title, task_type, task_status, brief, ac_json, priority,
  estimated_time, scope_json, context_json, fix_of_task_id, breaking, coverage_threshold, complexity,
  project_key, created_at, updated_at`;

/**
 * tasks 行 → TaskSnapshot（INTEGER 0/1 → boolean；*_json → 解码形；NULL → 键缺席——
 * agent tool 输出面 lossless JSON：显式 undefined 属性值拒绝整个工具结果，缺省可选字段
 * 必须「键缺席」）。
 */
export function toTaskSnapshot(row: TaskStorageRow): TaskSnapshot {
  return {
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    title: row.title,
    taskType: row.task_type,
    taskStatus: row.task_status,
    ...(row.brief !== null ? { brief: row.brief } : {}),
    ...(row.priority !== null ? { priority: row.priority as TaskSnapshot["priority"] } : {}),
    ...(row.estimated_time !== null ? { estimatedTime: row.estimated_time } : {}),
    ...(row.scope_json !== null ? { scope: parseScopeJson(row.scope_json) } : {}),
    ...(row.context_json !== null
      ? { context: JSON.parse(row.context_json) as Record<string, string> }
      : {}),
    ...(row.ac_json !== null ? { acceptanceCriteria: JSON.parse(row.ac_json) as string[] } : {}),
    ...(row.fix_of_task_id !== null ? { fixOfTaskId: row.fix_of_task_id } : {}),
    breaking: row.breaking === 1,
    ...(row.coverage_threshold !== null ? { coverageThreshold: row.coverage_threshold } : {}),
    complexity: row.complexity as TaskSnapshot["complexity"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** scope_json 解码（畸形负载 → 键缺席——降级不炸读面，decodeRecordFiles 同口径） */
function parseScopeJson(raw: string): TaskSnapshot["scope"] | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) return parsed as TaskSnapshot["scope"];
  } catch {
    // 畸形 scope_json 不拖垮读面
  }
  return undefined;
}

/** 容器摘要（slug 化终态——无容器主表，容器 = slug 本身；zero 水化查询）。 */
export function taskContainerSummary(row: TaskStorageRow): { slug: string } {
  return { slug: row.slug };
}

/**
 * task_records 行 → TaskRecordEntry（note/payload JSON 解码；缺省键缺席——lossless 同
 * toTaskSnapshot 口径）。append-only 读面排序锚 = created_at（id 仅 tiebreaker——机检门）。
 */
export function toTaskRecordEntry(row: TaskRecordStorageRow): TaskRecordEntry {
  const payload = row.payload_json !== null ? safeJsonObject(row.payload_json) : undefined;
  return {
    verb: row.verb,
    ...(row.from_status !== null ? { fromStatus: row.from_status } : {}),
    ...(row.to_status !== null ? { toStatus: row.to_status } : {}),
    ...(row.note !== null ? { note: row.note } : {}),
    ...(payload !== undefined ? { payload } : {}),
    loopSourced: row.loop_sourced === 1,
    ...(row.dispatch_digest !== null ? { digest: row.dispatch_digest } : {}),
    actor: row.actor,
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    createdAt: row.created_at,
  };
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** payload_json → 对象形解码（畸形/非对象负载 = undefined——键缺席，lossless 口径同上）；
 *  JSON.parse 产物按构造即 JSON 值域（TaskRecordJsonValue 封闭——cast 为诚实断言非越界） */
function safeJsonObject(raw: string): Record<string, import("./types.js").TaskRecordJsonValue> | undefined {
  const parsed = safeJsonParse(raw);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, import("./types.js").TaskRecordJsonValue>)
    : undefined;
}

/**
 * files 两形制归一解码（历史行旧扁平 string[] / 新行 {created, modified}）：
 * 对象形 → filesCreated/filesModified + files = 平铺并集（taskFilesUnion 单源）；数组形 → files。
 * 畸形负载 → {}（键全缺席——降级不炸读面）。
 */
export function decodeRecordFiles(raw: string): {
  files?: string[];
  filesCreated?: string[];
  filesModified?: string[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
  if (Array.isArray(parsed) && parsed.every((f) => typeof f === "string")) {
    return { files: parsed as string[] };
  }
  if (typeof parsed === "object" && parsed !== null) {
    const p = parsed as { created?: unknown; modified?: unknown };
    const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((f) => typeof f === "string");
    const created = isStrArr(p.created) ? p.created : undefined;
    const modified = isStrArr(p.modified) ? p.modified : undefined;
    if (created === undefined && modified === undefined) return {};
    return {
      files: taskFilesUnion({ created, modified }),
      ...(created !== undefined ? { filesCreated: created } : {}),
      ...(modified !== undefined ? { filesModified: modified } : {}),
    };
  }
  return {};
}

/** 身份解析（TaskRef → 行）：project_key + slug + local_id 三键查捞，未命中 ERR_TASK_NOT_FOUND */
export function resolveTaskRef(
  db: Database.Database,
  projectKey: string,
  taskRef: TaskRef,
): TaskStorageRow {
  const row = db
    .prepare<unknown[], TaskStorageRow>(
      `SELECT ${TASK_COLUMNS} FROM task_tasks WHERE project_key = ? AND slug = ? AND local_id = ?`,
    )
    .get(projectKey, taskRef.slug, taskRef.localId);
  if (row === undefined) {
    throw new TaskNotFoundError({ projectKey, taskRef });
  }
  return row;
}

/** 身份解析（taskId → 行）：id 代理主键直查，未命中 ERR_TASK_NOT_FOUND（data.taskId 附载） */
export function resolveTaskById(db: Database.Database, projectKey: string, taskId: string): TaskStorageRow {
  const row = db
    .prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM task_tasks WHERE id = ? AND project_key = ?`)
    .get(taskId, projectKey);
  if (row === undefined) {
    throw new TaskNotFoundError({ projectKey, taskId });
  }
  return row;
}

/** isFixTask——fix 判别单源谓词（圆桌处方 5）；实现单点在 fix-predicate.ts（db 层运行时消费不形成 domain⇄db 环），此处 re-export 保持四消费点 import 面不变 */
export { isFixTask } from "./fix-predicate.js";

/** 启动对账全域键枚举（task_tasks 去重 project_key，升序稳定——读面 DAO 单点，调用方零裸 SQL） */
export function listDistinctProjectKeys(db: Database.Database): string[] {
  return db
    .prepare<unknown[], { k: string }>(`SELECT DISTINCT project_key AS k FROM task_tasks ORDER BY project_key`)
    .all()
    .map((row) => row.k);
}

/** Interface 1 queryTask 出参（include 四节门控——缺席键缺席） */
export interface QueryTaskResult {
  task: TaskSnapshot;
  container: { slug: string };
  prerequisites?: TaskPrerequisiteSummary[];
  waitingOnMe?: TaskPrerequisiteSummary[];
  records?: TaskRecordEntry[];
  sessions?: SessionTaskLinkCard[];
  /**
   * 最新结算的逐条 AC 状态（plugin-task-loop/1.18-b 判例——读面缺口补齐）：有结算史即带出
   * （seq/result/acResults/createdAt），主会话核验 AC 逐条完成状态不再需要直查库。
   */
  latestSettlement?: {
    seq: number;
    result: "success" | "blocked";
    acResults: TaskAcResult[];
    createdAt: string;
  };
}

/** Interface 1 queryTask：身份解析 + 容器摘要 + include 四节门控读 */
export async function queryTask(deps: TasksVerbDeps, input: {
  projectKey: string;
  taskRef: TaskRef;
  include?: { prerequisites?: boolean; waitingOnMe?: boolean; records?: boolean; sessions?: boolean };
}): Promise<QueryTaskResult> {
  const db = deps.db;
  const row = resolveTaskRef(db, input.projectKey, input.taskRef);
  const result: QueryTaskResult = { task: toTaskSnapshot(row), container: taskContainerSummary(row) };
  const include = input.include ?? {};

  if (include.prerequisites === true) {
    result.prerequisites = db
      .prepare<unknown[], TaskPrerequisiteSummary>(
        `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
         FROM task_edges e JOIN task_tasks t ON t.id = e.prerequisite_id
         WHERE e.task_id = ? ORDER BY t.slug, t.local_id`,
      )
      .all(row.id);
  }

  if (include.waitingOnMe === true) {
    result.waitingOnMe = db
      .prepare<unknown[], TaskPrerequisiteSummary>(
        `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
         FROM task_edges e JOIN task_tasks t ON t.id = e.task_id
         WHERE e.prerequisite_id = ? ORDER BY t.slug, t.local_id`,
      )
      .all(row.id);
  }

  if (include.records === true) {
    result.records = readTaskRecords(db, row.id);
  }

  if (include.sessions === true) {
    result.sessions = readTaskSessions(db, row);
  }

  // 最新结算逐条 AC 状态（1.18-b 判例——恒带出，无结算史键缺席）
  const settlements = createSettlementRepo(db).listByTask(row.id);
  const latest = settlements[settlements.length - 1];
  if (latest !== undefined) {
    result.latestSettlement = {
      seq: latest.seq,
      result: latest.result,
      acResults: parseAcResults(latest.ac_results_json ?? "[]"),
      createdAt: latest.created_at,
    };
  }

  return result;
}

/**
 * 记录时间线读（verb/from→to/note/payload/digest——append-only 排序锚 created_at，
 * id 仅 tiebreaker）。2.6 导出：queryTask include.records 与 taskDetail.records 同源单份。
 */
export const RECORDS_BY_TASK_SQL = `SELECT verb, from_status, to_status, note, payload_json,
  dispatch_digest, loop_sourced, actor, session_id, created_at
FROM task_records WHERE task_id = ? ORDER BY created_at, id`;

/** 记录时间线读（行 → TaskRecordEntry 映射含 JSON 解码） */
export function readTaskRecords(db: Database.Database, taskId: string): TaskRecordEntry[] {
  return db
    .prepare<unknown[], TaskRecordStorageRow>(RECORDS_BY_TASK_SQL)
    .all(taskId)
    .map(toTaskRecordEntry);
}

/**
 * 挂接会话双源分型读（单任务面）：links（派发会话——claim upsert-ignore 写）∪
 * records.session_id（执行会话——submit/transition 记录），同会话双侧参与两卡并存。
 */
export function readTaskSessions(db: Database.Database, row: TaskStorageRow): SessionTaskLinkCard[] {
  const base = db.prepare<unknown[], { session_id: string }>(
    `SELECT session_id FROM task_session_links WHERE task_id = ? ORDER BY created_at, id`,
  );
  const cards: SessionTaskLinkCard[] = base.all(row.id).map((l) => ({
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    title: row.title,
    taskStatus: row.task_status,
    sessionId: l.session_id,
    source: "link" as const,
  }));
  const recordSessions = db.prepare<unknown[], { session_id: string }>(
    `SELECT session_id FROM task_records
     WHERE task_id = ? AND session_id IS NOT NULL GROUP BY session_id ORDER BY MIN(created_at), MIN(id)`,
  );
  for (const r of recordSessions.all(row.id)) {
    cards.push({
      taskId: row.id,
      slug: row.slug,
      localId: row.local_id,
      title: row.title,
      taskStatus: row.task_status,
      sessionId: r.session_id,
      source: "record" as const,
    });
  }
  return cards;
}
