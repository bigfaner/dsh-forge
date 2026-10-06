// queryTask——任务域读动词（任务 2.3；tech-design §Interface 1 queryTask 签名 + 身份解析约定：
// agent 面 TaskRef = { slug; localId } 两显式参，服务内 UNIQUE(slug, local_id) 查捞 → taskId
// 后走 id 路径；未命中 ERR_TASK_NOT_FOUND）。定位：业务（forge/tasks 子域）——只读 prepared
// statements，零事务零事件（写后事件归写动词）。include 四节（prerequisites/waitingOnMe/
// records/sessions）按门控呈现：缺席 = 仅 task 节（Interface 1「四节按 include 门控」）。
//
// sessions = links ∪ records.session_id 双源分型（SC6③ 双数据源——link = 派发会话挂接 /
// record = 执行会话挂接，同会话双侧参与则两卡并存——分型呈现不做合并解释，§6-24④ 诚实审计）。
import type Database from 'better-sqlite3'
import type {
  QueryTaskInput,
  QueryTaskResult,
  SessionTaskLinkCard,
  TaskActor,
  TaskGateReport,
  TaskPrerequisiteSummary,
  TaskRecordEntry,
  TaskRecordVerb,
  TaskSnapshot,
  TaskStatus,
  TaskType,
} from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { TaskNotFoundError } from './errors.js'

/** 读动词装配依赖（与 add.ts TasksVerbDeps 同形——service.ts 装配面结构传入） */
export interface TasksQueryDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
}

/** tasks 行存储形状（snake_case → TaskSnapshot 映射唯一落点；2.4/2.5 写动词同域复用） */
export interface TaskStorageRow {
  id: string
  slug: string
  local_id: string
  title: string
  task_type: TaskType
  task_status: TaskStatus
  task_desc: string | null
  priority: string | null
  estimated_time: string | null
  vars_json: string | null
  source_task_id: string | null
  blocked_reason: string | null
  main_session: number
  breaking: number
  coverage: number | null
  complexity: string
  surface_key: string | null
  surface_type: string | null
  feature_id: string
  created_at: string
  updated_at: string
}

/** task_records 行存储形状（append-only 审计行 → TaskRecordEntry） */
interface TaskRecordStorageRow {
  verb: TaskRecordVerb
  from_status: TaskStatus | null
  to_status: TaskStatus | null
  reason: string | null
  summary: string | null
  files_json: string | null
  gate_json: string | null
  commit_hash: string | null
  dispatch_digest: string | null
  actor: TaskActor
  session_id: string | null
  created_at: string
}

export const TASK_COLUMNS = `id, slug, local_id, title, task_type, task_status, task_desc, priority, estimated_time,
  vars_json, source_task_id, blocked_reason, main_session, breaking, coverage, complexity,
  surface_key, surface_type, feature_id, created_at, updated_at`

/**
 * tasks 行 → TaskSnapshot（INTEGER 0/1 → boolean；*_json → 解码形；NULL → 键缺席）。
 * 缺省可选字段必须「键缺席」而非「键在场值 undefined」——agent tool 输出面（dsh harness
 * snapshotJsonValue）对显式 undefined 属性值判 not lossless JSON 拒绝整个工具结果
 * （5.4 dogfood 实证：claimTask 三连拒）。RPC/JSON 序列化面两形态等价。
 */
export function toTaskSnapshot(row: TaskStorageRow): TaskSnapshot {
  return {
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    featureId: row.feature_id,
    title: row.title,
    taskType: row.task_type,
    taskStatus: row.task_status,
    ...(row.task_desc !== null ? { taskDesc: row.task_desc } : {}),
    ...(row.priority !== null ? { priority: row.priority as TaskSnapshot['priority'] } : {}),
    ...(row.estimated_time !== null ? { estimatedTime: row.estimated_time } : {}),
    ...(row.vars_json !== null ? { vars: JSON.parse(row.vars_json) as Record<string, string> } : {}),
    ...(row.source_task_id !== null ? { sourceTaskId: row.source_task_id } : {}),
    ...(row.blocked_reason !== null ? { blockedReason: row.blocked_reason } : {}),
    mainSession: row.main_session === 1,
    breaking: row.breaking === 1,
    ...(row.coverage !== null ? { coverage: row.coverage } : {}),
    complexity: row.complexity as TaskSnapshot['complexity'],
    ...(row.surface_key !== null ? { surfaceKey: row.surface_key } : {}),
    ...(row.surface_type !== null ? { surfaceType: row.surface_type } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * task_records 行 → TaskRecordEntry（files/gate JSON 解码；缺省键缺席——lossless 同
 * toTaskSnapshot 口径）——2.6 detail 复用导出。
 */
export function toTaskRecordEntry(row: TaskRecordStorageRow): TaskRecordEntry {
  return {
    verb: row.verb,
    ...(row.from_status !== null ? { fromStatus: row.from_status } : {}),
    ...(row.to_status !== null ? { toStatus: row.to_status } : {}),
    ...(row.reason !== null ? { reason: row.reason } : {}),
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.files_json !== null ? { files: JSON.parse(row.files_json) as string[] } : {}),
    ...(row.gate_json !== null ? { gate: JSON.parse(row.gate_json) as TaskGateReport } : {}),
    ...(row.commit_hash !== null ? { commitHash: row.commit_hash } : {}),
    ...(row.dispatch_digest !== null ? { digest: row.dispatch_digest } : {}),
    actor: row.actor,
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    createdAt: row.created_at,
  }
}

/** 身份双轨解析（TaskRef → taskId）：UNIQUE(slug, local_id) 查捞，未命中 ERR_TASK_NOT_FOUND */
export function resolveTaskRef(
  db: Database.Database,
  projectId: string,
  taskRef: { slug: string; localId: string },
): TaskStorageRow {
  const row = db
    .prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE slug = ? AND local_id = ?`)
    .get(taskRef.slug, taskRef.localId)
  if (row === undefined) {
    throw new TaskNotFoundError({ projectId, taskRef })
  }
  return row
}

/** 身份双轨解析（taskId → 行）：id 代理主键直查（UI/RPC 面——transitionTask 2.5），未命中 ERR_TASK_NOT_FOUND（data.taskId 附载） */
export function resolveTaskById(db: Database.Database, projectId: string, taskId: string): TaskStorageRow {
  const row = db.prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(taskId)
  if (row === undefined) {
    throw new TaskNotFoundError({ projectId, taskId })
  }
  return row
}

/** Interface 1 queryTask：身份解析 + include 四节门控读 */
export async function queryTask(deps: TasksQueryDeps, input: QueryTaskInput): Promise<QueryTaskResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const row = resolveTaskRef(db, input.projectId, input.taskRef)
  const result: QueryTaskResult = { task: toTaskSnapshot(row) }
  const include = input.include ?? {}

  if (include.prerequisites === true) {
    result.prerequisites = db
      .prepare<unknown[], TaskPrerequisiteSummary>(
        `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
         FROM task_edges e JOIN tasks t ON t.id = e.prerequisite_id
         WHERE e.task_id = ? ORDER BY t.slug, t.local_id`,
      )
      .all(row.id)
  }

  if (include.waitingOnMe === true) {
    result.waitingOnMe = db
      .prepare<unknown[], TaskPrerequisiteSummary>(
        `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
         FROM task_edges e JOIN tasks t ON t.id = e.task_id
         WHERE e.prerequisite_id = ? ORDER BY t.slug, t.local_id`,
      )
      .all(row.id)
  }

  if (include.records === true) {
    result.records = readTaskRecords(db, row.id)
  }

  if (include.sessions === true) {
    result.sessions = readTaskSessions(db, row)
  }

  return result
}

/**
 * 记录时间线读（verb/from→to/reason/summary/gate/commit/digest——自增序）。
 * 2.6 导出：queryTask include.records 与 taskDetail.records 同源单份（EQP 锚 ② =
 * RECORDS_BY_TASK_SQL 命中 idx_records_task——list.test 断言）。
 */
export const RECORDS_BY_TASK_SQL = `SELECT verb, from_status, to_status, reason, summary, files_json, gate_json,
  commit_hash, dispatch_digest, actor, session_id, created_at
FROM task_records WHERE task_id = ? ORDER BY id`

/** 记录时间线读（行 → TaskRecordEntry 映射含 JSON 解码） */
export function readTaskRecords(db: Database.Database, taskId: string): TaskRecordEntry[] {
  return db
    .prepare<unknown[], TaskRecordStorageRow>(RECORDS_BY_TASK_SQL)
    .all(taskId)
    .map(toTaskRecordEntry)
}

/**
 * 挂接会话双源分型读（单任务面）：links（派发会话——claim upsert-ignore 写）∪
 * records.session_id（执行会话——submit/transition 记录），同会话双侧参与两卡并存。
 * 2.6 导出：queryTask include.sessions 与 taskDetail.sessions 同源单份（§6-24④ 诚实审计）。
 */
export function readTaskSessions(db: Database.Database, row: TaskStorageRow): SessionTaskLinkCard[] {
  const base = db.prepare<unknown[], { session_id: string }>(
    `SELECT session_id FROM task_session_links WHERE task_id = ? ORDER BY id`,
  )
  const cards: SessionTaskLinkCard[] = base.all(row.id).map((l) => ({
    taskId: row.id,
    slug: row.slug,
    localId: row.local_id,
    title: row.title,
    taskStatus: row.task_status,
    sessionId: l.session_id,
    source: 'link' as const,
  }))
  const recordSessions = db.prepare<unknown[], { session_id: string }>(
    `SELECT session_id FROM task_records
     WHERE task_id = ? AND session_id IS NOT NULL GROUP BY session_id ORDER BY MIN(id)`,
  )
  for (const r of recordSessions.all(row.id)) {
    cards.push({
      taskId: row.id,
      slug: row.slug,
      localId: row.local_id,
      title: row.title,
      taskStatus: row.task_status,
      sessionId: r.session_id,
      source: 'record' as const,
    })
  }
  return cards
}
