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

/**
 * M4 v3 证据三档落位(schema-v3 projects.docs_placement CHECK 同源):
 * repo-existing(仓内已有树)/ repo-new(仓内新建,懒物化)/ app(内核
 * docsRoot 派生)/ custom(仓外自定义,须显式授权);legacy = v3 迁移前
 * 值冻结(仅迁移回填不可归类行)。
 */
export type DocsPlacement = 'repo-existing' | 'repo-new' | 'app' | 'custom' | 'legacy'

/**
 * M4 v3 投影状态机(schema-v3 projects.projection_state CHECK 同源):
 * pending(待对账收数/未投影)→ healthy;上游操作失败/relay 不在场 →
 * degraded(可重试);对账 diff 检出 dsh 侧手改 → deviation(仅呈现)。
 */
export type ProjectionState = 'pending' | 'healthy' | 'degraded' | 'deviation'

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
  // —— M4 v3 增列(schema-v3 ALTER;迁移 DEFAULT 承载存量行,v2 注册/
  //    listProjects 动词按 tech-design §Interface 1 恒投影)——
  /** 归档位(归档 ≠ 删除:dsh 侧 workspace 保留,forge 侧归档分区)。 */
  readonly archived: boolean
  /** 注册序(= 投影「同名同序」的 forge 侧权威)。 */
  readonly sortOrder: number
  /** 投影状态机单值(3.x 对账接线前恒 'pending')。 */
  readonly projectionState: ProjectionState
  /** 证据三档落位 + custom(仓内落点永不继承)。 */
  readonly docsPlacement: DocsPlacement
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
  /** feature 级偏离标记(v2 增列;4.2 watcher 置位,内核合法推进清除,仅呈现)。 */
  readonly deviated: boolean
  /** 最近一次外部变更检出时戳(4.2;清除偏离时不抹 —— 审计痕迹)。 */
  readonly lastExternalAt: string | null
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

/**
 * projects 表行(schema-v1.sql 基底 + v3 增列:身份/归档/顺序/落位/投影;
 * v2 增列 data_authority 等由 M3 面 consumed,此处投影本域读写所需列)。
 */
export interface ProjectRow {
  readonly id: string
  readonly display_name: string
  readonly code_root: string
  readonly doc_location_type: DocLocationType
  readonly doc_location_path: string | null
  readonly created_at: string
  readonly last_activated_at: string | null
  // —— M4 v3 增列(schema-v3 ALTER ×10;DEFAULT 承载存量行)——
  /** 平台折叠比较键(win32 大写折叠;UNIQUE 落此列;NULL = 悬挂/回填失败)。 */
  readonly code_root_key: string | null
  /** (dev,ino) 物理仲裁位;仅仲裁不作键。 */
  readonly identity_dev: string | null
  readonly identity_ino: string | null
  /** realpath 失败(网络盘离线字符串回退)= 0。 */
  readonly identity_verified: number
  readonly archived: number
  readonly sort_order: number
  readonly docs_placement: DocsPlacement
  /** 仓外授权位(仅 custom = 1;BIZ-001/003 收窄)。 */
  readonly custom_authorized: number
  readonly projection_state: ProjectionState
  /** dsh WorkspaceId 信息位(投影成功后回填)。 */
  readonly workspace_id: string | null
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

/** feature_snapshot 表行(schema-v1.sql 基底 + v2 增列 deviated/last_external_at)。 */
export interface FeatureSnapshotRow {
  readonly project_id: string
  readonly feature_slug: string
  readonly status: FeatureStatus
  readonly doc_kinds: string
  readonly task_total: number
  readonly task_completed: number
  readonly updated_at: string
  readonly deviated: number
  readonly last_external_at: string | null
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
    // M4 v3 增列投影(tech-design §Interface 1 listProjects 扩展列)。
    archived: row.archived === 1,
    sortOrder: row.sort_order,
    projectionState: row.projection_state,
    docsPlacement: row.docs_placement,
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
    deviated: row.deviated === 1,
    lastExternalAt: row.last_external_at,
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
