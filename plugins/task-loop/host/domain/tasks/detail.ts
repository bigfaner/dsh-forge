// taskDetail——任务域读面详情法（core forge/tasks/detail.ts 直迁——plugin-task-loop 1.7 内联
// + v1 列面适配：task_records note/payload 列面；文档注册面随 features/proposals 域退役，
// refs 降级为锚点提取（resolved=false 置灰诚实呈现））。
// 载荷构成：TaskCard 全量 + records 时间线 / waitingOnMe / sessions 双源分型 / actualFiles
// （submit 记录 payload files 级联 → commit git 查找 → 双缺省 []）/ allowedTransitions /
// refs（声明锚点提取——docs 域退役后注册面空，命中恒置灰）。
import type Database from "better-sqlite3";
import { taskFilesUnion } from "./files.js";
import { listCommitFiles, type GitExecFile } from "./git-lookup.js";
import { hydrateTaskCards } from "./list.js";
import { readTaskRecords, readTaskSessions, resolveTaskById, toTaskSnapshot } from "./query.js";
import { transitionTargets } from "./state-machine.js";
import type { ContainerRef, SessionTaskLinkCard, TaskCard, TaskPrerequisiteSummary, TaskRecordEntry, TasksVerbDeps } from "./types.js";

/** 详情读装配依赖 */
export interface TasksDetailDeps {
  readonly db: Database.Database;
  /** 项目检出根（git 只读查找 cwd——装配层注入） */
  readonly resolveWsPath: (projectKey: string) => string;
  /** git 只读执行注入（缺席 = 生产 execFile） */
  readonly git?: { readonly execFile?: GitExecFile };
}

/** submit 记录 payload/commit 级联读（新 → 旧） */
const SUBMIT_PAYLOAD_SQL = `SELECT payload_json, note FROM task_records
  WHERE task_id = ? AND verb = 'submit' ORDER BY created_at DESC, id DESC`;

/** 声明锚点 token（正斜杠相对路径 + 文件扩展名——≥1 段分隔） */
const DOC_ANCHOR_RE = /[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+/g;

/** brief + context 值声明锚点提取（首现序去重——brief 先于 context，context 按键序） */
export function extractDocAnchors(row: { brief: string | null; context_json: string | null }): string[] {
  const texts: string[] = [];
  if (row.brief !== null) texts.push(row.brief);
  if (row.context_json !== null) {
    let context: unknown;
    try {
      context = JSON.parse(row.context_json) as unknown;
    } catch {
      context = undefined;
    }
    if (context !== null && typeof context === "object") {
      for (const key of Object.keys(context as Record<string, unknown>).sort()) {
        const value = (context as Record<string, unknown>)[key];
        if (typeof value === "string") texts.push(value);
      }
    }
  }
  const seen = new Set<string>();
  const anchors: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(DOC_ANCHOR_RE)) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        anchors.push(match[0]);
      }
    }
  }
  return anchors;
}

/** refs 水化：docs 域注册面退役——锚点提取保留，命中恒置灰（resolved=false，title 缺席） */
function resolveDocRefs(row: { brief: string | null; context_json: string | null }): TaskDocRef[] {
  return extractDocAnchors(row).map((docRel) => ({
    docRel,
    resolved: false,
    title: undefined,
  }));
}

export interface TaskDocRef {
  readonly docRel: string;
  readonly resolved: boolean;
  readonly title?: string;
}

/** actualFiles 级联（submit 记录新 → 旧：payload files → commit 查找；双缺省 []） */
async function resolveActualFiles(deps: TasksDetailDeps, db: Database.Database, projectKey: string, taskId: string): Promise<string[]> {
  const submits = db
    .prepare<unknown[], { payload_json: string | null; note: string | null }>(SUBMIT_PAYLOAD_SQL)
    .all(taskId);
  for (const s of submits) {
    if (s.payload_json !== null) {
      let payload: unknown;
      try {
        payload = JSON.parse(s.payload_json) as unknown;
      } catch {
        payload = undefined;
      }
      if (typeof payload === "object" && payload !== null) {
        const p = payload as { files?: unknown; filesCreated?: unknown; filesModified?: unknown };
        const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((f) => typeof f === "string");
        const flat = isStrArr(p.files) ? p.files : undefined;
        if (flat !== undefined) return flat;
        if (isStrArr(p.filesCreated) || isStrArr(p.filesModified)) {
          return taskFilesUnion({
            created: isStrArr(p.filesCreated) ? p.filesCreated : undefined,
            modified: isStrArr(p.filesModified) ? p.filesModified : undefined,
          });
        }
      }
    }
    // commit_hash 暂无域内列（settlements.commit_hash 归模块②读面）——载荷缺席即双缺省 []
    void s.note;
  }
  return [];
}

export interface TaskDetailQuery {
  readonly projectKey: string;
  readonly taskId: string;
}

export interface TaskDetail extends TaskCard {
  readonly container: ContainerRef;
  readonly brief?: string;
  readonly scope?: Record<string, readonly string[]>;
  readonly context?: Readonly<Record<string, string>>;
  readonly acceptanceCriteria?: readonly string[];
  readonly coverageThreshold?: number;
  readonly complexity: string;
  readonly breaking: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly records: readonly TaskRecordEntry[];
  readonly waitingOnMe: readonly TaskPrerequisiteSummary[];
  readonly sessions: readonly SessionTaskLinkCard[];
  readonly actualFiles: readonly string[];
  readonly allowedTransitions: readonly string[];
  readonly refs: readonly TaskDocRef[];
}

/** Interface 1 taskDetail：全量水化（恒 taskId——resolveTaskById 未命中 ERR_TASK_NOT_FOUND） */
export async function taskDetail(deps: TasksDetailDeps, q: TaskDetailQuery): Promise<TaskDetail> {
  const db = deps.db;
  const row = resolveTaskById(db, q.projectKey, q.taskId);
  const snapshot = toTaskSnapshot(row);
  const card = hydrateTaskCards(db, [row])[0];
  if (card === undefined) {
    throw new Error(`TaskCard 水化缺席（不可达——单行恒单卡）：${row.id}`);
  }
  const waitingOnMe = db
    .prepare<unknown[], TaskPrerequisiteSummary>(
      `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
       FROM task_edges e JOIN task_tasks t ON t.id = e.task_id
       WHERE e.prerequisite_id = ? ORDER BY t.slug, t.local_id`,
    )
    .all(row.id);
  return {
    ...card,
    container: { slug: row.slug },
    ...(snapshot.brief !== undefined ? { brief: snapshot.brief } : {}),
    ...(snapshot.scope !== undefined ? { scope: snapshot.scope as Record<string, readonly string[]> } : {}),
    ...(snapshot.context !== undefined ? { context: snapshot.context } : {}),
    ...(snapshot.acceptanceCriteria !== undefined ? { acceptanceCriteria: snapshot.acceptanceCriteria } : {}),
    ...(snapshot.coverageThreshold !== undefined ? { coverageThreshold: snapshot.coverageThreshold } : {}),
    complexity: snapshot.complexity,
    breaking: snapshot.breaking,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    records: readTaskRecords(db, row.id),
    waitingOnMe,
    sessions: readTaskSessions(db, row),
    actualFiles: await resolveActualFiles(deps, db, q.projectKey, row.id),
    allowedTransitions: transitionTargets(row.task_status, "human"),
    refs: resolveDocRefs(row),
  };
}

export type { TasksVerbDeps };
export { listCommitFiles };
