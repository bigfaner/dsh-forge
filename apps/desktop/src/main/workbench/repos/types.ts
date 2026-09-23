// workbench/repos — owned-SoT repository layer (task 2.2) + derived-snapshot
// repository contracts (task 2.3).
//
// 行类型 ↔ Interface 1 DTO 的共享契约:docs/features/dsh-forge-m2/design/
// tech-design.md §Interfaces Interface 1(Project/RegisterProjectInput/
// ProjectPatch/SessionLink/TaskSummary/FeatureSummary/SyncStatus)与
// design/er-diagram.md 行级定义的桥接层。
// Storage rows stay snake_case as declared by store/schema-v1.sql; the DTO
// surface is the camelCase IPC contract — mapping happens only here.
//
// Hard Rule(任务 2.2):projects / app_state / session_links 三表只经本
// repos 层写入,任何调用方不得手写 SQL 直改。
// Hard Rule(任务 2.3):task_snapshot / feature_snapshot / sync_state 为派生
// 缓存(可整体重建)——字段只透传 forge 文件既有信息(sync_state 为运行
// 簿记),快照层不补写任何语义。

import type { DatabaseSyncLike } from '../store/db.ts'

/** 文档位置三分模型(er-diagram projects.doc_location_type)。 */
export type DocLocationType = 'in_repo' | 'external'

/** 挂接状态机(er-diagram session_links.status):事件驱动迁移,ended 不删行。 */
export type SessionLinkStatus = 'active' | 'ended'

/** 任务 7 态词表(forge 词表透传;schema-v1 task_snapshot.status CHECK)。 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'suspended' | 'skipped' | 'rejected'

/** 最近一笔变更来源(Interface 3 判定序产物;task_snapshot.source CHECK)。 */
export type ChangeSource = 'session' | 'terminal'

/**
 * dispatch 5 态词表(schema-v2.sql §4 dispatch.state CHECK 同源;任务 3.3):
 * starting(subagent 启动中,session 未回填)→ running(session 已建)→
 * awaiting(存在 pending 审批,⇔ 不变式)→ done/failed(终态,ended_at 置位)。
 */
export type DispatchState = 'starting' | 'running' | 'awaiting' | 'failed' | 'done'

/** approval_request 3 态词表(schema-v2.sql §5 state CHECK 同源;任务 3.3)。 */
export type ApprovalState = 'pending' | 'approved' | 'rejected'

/** forge manifest 词表(feature_snapshot.status 透传;'in-progress' 连字符原词)。 */
export type FeatureStatus = 'prd' | 'design' | 'tasks' | 'in-progress' | 'completed'

/** 文档类五枚(Interface 1 DocKind;feature_snapshot.doc_kinds JSON 元素)。 */
export type DocKind = 'manifest' | 'prd' | 'design' | 'ui' | 'tasks'

/** sync_state.status:快照健康度(派生缓存运行簿记,非任务域状态)。 */
export type SyncStateStatus = 'idle' | 'scanning' | 'error'

// ---------------------------------------------------------------------------
// Interface 1 DTOs(camelCase,IPC 面)
// ---------------------------------------------------------------------------

export interface Project {
  readonly id: string
  readonly displayName: string
  /** 绝对路径,注册时规范化(分隔符/尾斜杠统一)。 */
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  /** external 时非空且 ≠ codeRoot;in_repo 恒 null。 */
  readonly docLocationPath: string | null
  /** ISO 8601 UTC。 */
  readonly createdAt: string
  /** 激活迁移时间;单激活真值在 app_state。 */
  readonly lastActivatedAt: string | null
}

export interface RegisterProjectInput {
  readonly codeRoot: string
  readonly docLocationType: DocLocationType
  /** external 必填(缺省即违反行级 CHECK,由 SQL 兜底抛出)。 */
  readonly docLocationPath?: string | null
  /** 缺省 = code_root 目录名;仅注册表层字段,不改磁盘。 */
  readonly displayName?: string
}

/** rename = displayName;repoint = 后两项(成对提交,重扫后快照重建)。 */
export interface ProjectPatch {
  readonly displayName?: string
  readonly docLocationType?: DocLocationType
  readonly docLocationPath?: string | null
}

export interface SessionLink {
  readonly id: string
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
  readonly status: SessionLinkStatus
  /** ISO 8601 UTC(发起时间;重复登记语义 = 刷新)。 */
  readonly startedAt: string
  /** status='ended' 时非空(app 层维护)。 */
  readonly endedAt: string | null
}

export interface RecordSessionLinkInput {
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
}

// ---------------------------------------------------------------------------
// 派生快照 DTO(任务 2.3)——Interface 1 TaskSummary/FeatureSummary/SyncStatus
// 的仓储桥接形态(按 repos 惯例带 projectId)。Hard Rule:字段全部为 forge
// 文件透传(或运行簿记),无快照层补写语义。
// ---------------------------------------------------------------------------

export interface TaskSnapshot {
  readonly projectId: string
  readonly taskKey: string
  readonly featureSlug: string
  readonly title: string
  readonly status: TaskStatus
  /** 直接上游 blocker 的 task_key 列表(JSON 往返)。 */
  readonly blockers: string[]
  /** 任务执行 git 分支(执行痕迹;无则 null)。 */
  readonly branch: string | null
  readonly worktree: boolean
  /** 最近一笔变更来源;无则 null。 */
  readonly source: ChangeSource | null
  readonly updatedAt: string
}

export interface FeatureSnapshot {
  readonly projectId: string
  readonly featureSlug: string
  /** manifest 原词直通(含 'in-progress' 连字符形,不改写)。 */
  readonly status: FeatureStatus
  /** 实际存在的文档类(⊂ 五类;驱动 UF4 tab disabled)。 */
  readonly docKinds: DocKind[]
  /** 派生计数:与 task_snapshot 同项目同 feature 的任务集一致。 */
  readonly taskTotal: number
  readonly taskCompleted: number
  readonly updatedAt: string
}

export interface SyncState {
  readonly projectId: string
  /** 感知游标:最近成功扫描完成时点;从未成功扫描则 null。 */
  readonly lastScanAt: string | null
  readonly status: SyncStateStatus
  /** error 态原因(≤120 字符);非 error 态为 null。 */
  readonly error: string | null
}

// ---------------------------------------------------------------------------
// Storage rows(snake_case,schema-v1.sql 投影)
// ---------------------------------------------------------------------------

/** projects 表行(schema-v1.sql)。 */
export interface ProjectRow {
  readonly id: string
  readonly display_name: string
  readonly code_root: string
  readonly doc_location_type: DocLocationType
  readonly doc_location_path: string | null
  readonly created_at: string
  readonly last_activated_at: string | null
}

/** session_links 表行(schema-v1.sql)。 */
export interface SessionLinkRow {
  readonly id: string
  readonly project_id: string
  readonly task_key: string
  readonly session_id: string
  readonly status: SessionLinkStatus
  readonly started_at: string
  readonly ended_at: string | null
}

/** task_snapshot 表行(schema-v1.sql;派生缓存)。 */
export interface TaskSnapshotRow {
  readonly project_id: string
  readonly task_key: string
  readonly feature_slug: string
  readonly title: string
  readonly status: TaskStatus
  readonly blockers: string
  readonly branch: string | null
  readonly worktree: number
  readonly source: ChangeSource | null
  readonly updated_at: string
}

/** feature_snapshot 表行(schema-v1.sql;派生缓存)。 */
export interface FeatureSnapshotRow {
  readonly project_id: string
  readonly feature_slug: string
  readonly status: FeatureStatus
  readonly doc_kinds: string
  readonly task_total: number
  readonly task_completed: number
  readonly updated_at: string
}

/** sync_state 表行(schema-v1.sql;派生运行簿记)。 */
export interface SyncStateRow {
  readonly project_id: string
  readonly last_scan_at: string | null
  readonly status: SyncStateStatus
  readonly error: string | null
}

// ---------------------------------------------------------------------------
// DTO mappers(行 → DTO 的唯一通道)
// ---------------------------------------------------------------------------

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    displayName: row.display_name,
    codeRoot: row.code_root,
    docLocationType: row.doc_location_type,
    docLocationPath: row.doc_location_path,
    createdAt: row.created_at,
    lastActivatedAt: row.last_activated_at,
  }
}

export function toSessionLink(row: SessionLinkRow): SessionLink {
  return {
    id: row.id,
    projectId: row.project_id,
    taskKey: row.task_key,
    sessionId: row.session_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}

/**
 * 防御解码 JSON 字符串数组(blockers / doc_kinds):损坏 JSON 不炸读取路径,
 * 回退空数组——派生缓存可整体重建,读取面不放大存储损伤(对齐 app_state
 * 防御读惯例)。
 */
function decodeStringArray(encoded: string): string[] {
  try {
    const parsed: unknown = JSON.parse(encoded)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function toTaskSnapshot(row: TaskSnapshotRow): TaskSnapshot {
  return {
    projectId: row.project_id,
    taskKey: row.task_key,
    featureSlug: row.feature_slug,
    title: row.title,
    status: row.status,
    blockers: decodeStringArray(row.blockers),
    branch: row.branch,
    worktree: row.worktree === 1,
    source: row.source,
    updatedAt: row.updated_at,
  }
}

export function toFeatureSnapshot(row: FeatureSnapshotRow): FeatureSnapshot {
  return {
    projectId: row.project_id,
    featureSlug: row.feature_slug,
    status: row.status,
    docKinds: decodeStringArray(row.doc_kinds) as DocKind[],
    taskTotal: row.task_total,
    taskCompleted: row.task_completed,
    updatedAt: row.updated_at,
  }
}

export function toSyncState(row: SyncStateRow): SyncState {
  return {
    projectId: row.project_id,
    lastScanAt: row.last_scan_at,
    status: row.status,
    error: row.error,
  }
}

// ---------------------------------------------------------------------------
// Domain errors(IPC reject 序列化 `{ code, message }` 的主进程侧来源)
// ---------------------------------------------------------------------------

/** 本层错误码:tech-design §Error Types & Codes 中归属 repos 语义的部分。 */
export type WorkbenchRepoErrorCode =
  | 'ERR_PROJECT_EXISTS'
  | 'ERR_PROJECT_NOT_FOUND'
  | 'ERR_SESSION_LINK_NOT_FOUND'

/** repos 层域错误(`code` 对齐 tech-design 错误表;未知 id / UNIQUE 冲突)。 */
export class WorkbenchRepoError extends Error {
  constructor(
    readonly code: WorkbenchRepoErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'WorkbenchRepoError'
  }
}

/**
 * Whether a raw node:sqlite failure is a UNIQUE constraint rejection.
 * node:sqlite surfaces constraint failures as plain `Error`s — the stable
 * discriminator is the message (same match the store tests rely on).
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
}

/**
 * 快照写路径共用的项目存在性断言:统一 ERR_PROJECT_NOT_FOUND 口径(优于
 * 让 FK 约束以原始错误冒出;对齐 session-links 的前置校验惯例)。
 */
export function assertProjectExists(db: RepoDb, projectId: string): void {
  const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (row === undefined) {
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
  }
}

/** repos 函数的统一入参形态:一个已迁移的 workbench 库句柄。 */
export type RepoDb = DatabaseSyncLike
