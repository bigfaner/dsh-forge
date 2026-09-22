// workbench/repos — owned-SoT repository layer (task 2.2).
//
// 行类型 ↔ Interface 1 DTO 的共享契约:docs/features/dsh-forge-m2/design/
// tech-design.md §Interfaces Interface 1(Project/RegisterProjectInput/
// ProjectPatch/SessionLink)与 design/er-diagram.md 行级定义的桥接层。
// Storage rows stay snake_case as declared by store/schema-v1.sql; the DTO
// surface is the camelCase IPC contract — mapping happens only here.
//
// Hard Rule(任务 2.2):projects / app_state / session_links 三表只经本
// repos 层写入,任何调用方不得手写 SQL 直改。

import type { DatabaseSyncLike } from '../store/db.ts'

/** 文档位置三分模型(er-diagram projects.doc_location_type)。 */
export type DocLocationType = 'in_repo' | 'external'

/** 挂接状态机(er-diagram session_links.status):事件驱动迁移,ended 不删行。 */
export type SessionLinkStatus = 'active' | 'ended'

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

/** repos 函数的统一入参形态:一个已迁移的 workbench 库句柄。 */
export type RepoDb = DatabaseSyncLike
