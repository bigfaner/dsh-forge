// workbench/tasks/task-repo — 权威任务表仓储(任务 1.3)。
//
// task 表(schema-v2.sql §3)= 迁移后任务的权威 SoT(er-diagram §task);
// 本模块是它的唯一写入口(Hard Rule:SQLite 单写者纪律 —— task 表只经
// 本仓储的内核事务路径写入,禁任何旁路写)。1.2 的纯逻辑层
// (statemachine/deps/model)在 task-service 里与本仓储接线后即成为
// 「唯一写入口」的合法边裁决者。
//
// 方言钉定(TECH-data-kernel-003 + schema-v2.sql 头注):
//   - task_key = 看板限定地址 `<featureSlug>/<localId>`,localId 含
//     `5.gate` 等相位键与 `T-*`/`disc-*` 字母键 —— 校验 = 单 `/` 分隔 +
//     两段非空 + 禁路径分隔/控制字符(弃裸 ID 数字正则,M2 已证裸 ID
//     假设不成立;tech-design §Interface 2 权限界口径);
//   - feature_slug = 冗余列承 v1 方言,与 task_key 前缀一致(er-diagram
//     不变式,由写入路径强制);
//   - blockers = 同 feature 命名空间的本地 key 原词(JSON 往返,悬空引用
//     原样保留显式标记、不改写 —— v1 findDanglingBlockers 先例)。
//
// 行形态(snake_case)→ DTO(camelCase)的映射只发生在本层(repos 惯例);
// 7 态词表由 SQL CHECK 原样拒绝越界值(动态键集不入 SQL 的对称面)。

import {
  isUniqueViolation,
  WorkbenchRepoError,
  type RepoDb,
  type TaskStatus,
} from '../repos/types.ts'

/** 读路由开关(tech-design §Interface 1 Authority;projects.data_authority 列)。 */
export type TaskAuthority = 'files' | 'sqlite'

/**
 * task 域错误码(tech-design §Error Types & Codes 的 task 段 +
 * ERR_TASK_EXISTS = M2 ERR_PROJECT_EXISTS 惯例在 task 域的对应:
 * 显式 taskKey 重复注册)。`code` 经 IPC 错误封装原码透传(handlers.ts
 * toWorkbenchIpcError 的域错误通道)。
 */
export type TaskErrorCode =
  | 'ERR_TASK_NOT_FOUND'
  | 'ERR_TASK_STATE_INVALID'
  | 'ERR_TASK_DEPS_UNSATISFIED'
  | 'ERR_TASK_NOT_AUTHORITATIVE'
  | 'ERR_TASK_EXISTS'
  | 'ERR_TASK_KEY_INVALID'

/** task 域错误(唯一写入口的拒绝形态;非法迁移/依赖前置/权限界/键形态)。 */
export class TaskDomainError extends Error {
  constructor(
    readonly code: TaskErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TaskDomainError'
  }
}

// ---------------------------------------------------------------------------
// task_key 看板限定地址校验(tech-design §Interface 2:单 `/` + 两段非空 +
// 禁路径分隔/控制字符;不做数字形态假设)
// ---------------------------------------------------------------------------

/** 段内禁字符:路径分隔符(`/` 由 split 承担,此查 `\\`)+ C0/DEL 控制字符。 */
function isAddressSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false // 控制字符(C0 + DEL)
    if (ch === '/' || ch === '\\') return false // 路径分隔
  }
  return true
}

/**
 * 看板限定地址形态判定:恰好一个 `/` 分隔 + 两段均非空且无路径分隔/控制
 * 字符。裸单段(`1.3`,无 `/`)与多段(`a/b/c`)均拒绝 —— 数字母正则被
 * 显式弃用(localId 允许 `5.gate`/`T-review-doc`/`disc-1`/`1.2-slug`)。
 */
export function isBoardTaskKey(taskKey: string): boolean {
  const parts = taskKey.split('/')
  if (parts.length !== 2) return false
  return isAddressSegment(parts[0] as string) && isAddressSegment(parts[1] as string)
}

/** 断言形态合法,非法 → ERR_TASK_KEY_INVALID(携带原词,便于调用方定位)。 */
export function assertBoardTaskKey(taskKey: string): void {
  if (!isBoardTaskKey(taskKey)) {
    throw new TaskDomainError(
      'ERR_TASK_KEY_INVALID',
      `task key ${JSON.stringify(taskKey)} is not a board address '<featureSlug>/<localId>' (exactly one '/', two non-empty segments, no path separators or control characters)`,
    )
  }
}

/** feature_slug 段形态(地址前缀段同规则;tech-design §Interface 1)。 */
export function assertFeatureSlugSegment(featureSlug: string): void {
  if (!isAddressSegment(featureSlug)) {
    throw new TaskDomainError(
      'ERR_TASK_KEY_INVALID',
      `feature slug ${JSON.stringify(featureSlug)} must be a non-empty single address segment (no '/', no path separators or control characters)`,
    )
  }
}

/** 本地上游 key 段形态(blockers 原词约束:同 feature 命名空间本地 key)。 */
export function assertLocalKeySegment(localKey: string): void {
  if (!isAddressSegment(localKey)) {
    throw new TaskDomainError(
      'ERR_TASK_KEY_INVALID',
      `blocker key ${JSON.stringify(localKey)} must be a non-empty local key in the feature namespace (no '/', no path separators or control characters)`,
    )
  }
}

/** 限定地址 → 本地 localId(段形式已由校验保证;兜底取 `/` 后段)。 */
export function localIdOfTaskKey(taskKey: string): string {
  return taskKey.slice(taskKey.indexOf('/') + 1)
}

// ---------------------------------------------------------------------------
// 行形态与 DTO 映射(repos 惯例:snake_case 行 ↔ camelCase DTO)
// ---------------------------------------------------------------------------

/** task 表行(schema-v2.sql snake_case 投影;blockers 为 JSON 编码串)。 */
export interface TaskRow {
  readonly project_id: string
  readonly task_key: string
  readonly feature_slug: string
  readonly title: string
  readonly status: TaskStatus
  readonly blockers: string
  readonly branch: string | null
  readonly worktree: number
  readonly task_type: string | null
  readonly desc_path: string | null
  readonly updated_by: string
  readonly updated_at: string
}

/**
 * task 权威行的 DTO(Interface 1 TaskSummary 的仓储侧来源形态)。
 * updatedBy = actor 审计列(session:<id>|external|kernel;v1 快照 source
 * 判定序的权威化演进,er-diagram §task)。
 */
export interface AuthoritativeTask {
  readonly projectId: string
  readonly taskKey: string
  readonly featureSlug: string
  readonly title: string
  readonly status: TaskStatus
  /** 直接上游 blocker 的本地 key 原词(悬空引用显式保留,不改写)。 */
  readonly blockers: string[]
  readonly branch: string | null
  readonly worktree: boolean
  readonly taskType: string | null
  /** 描述 md 相对文档根(features/)路径;未落 = null。 */
  readonly descPath: string | null
  readonly updatedBy: string
  readonly updatedAt: string
}

/** 防御解码 JSON 字符串数组(blockers;对齐 repos/types decodeStringArray 惯例)。 */
function decodeBlockers(encoded: string): string[] {
  try {
    const parsed: unknown = JSON.parse(encoded)
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function toAuthoritativeTask(row: TaskRow): AuthoritativeTask {
  return {
    projectId: row.project_id,
    taskKey: row.task_key,
    featureSlug: row.feature_slug,
    title: row.title,
    status: row.status,
    blockers: decodeBlockers(row.blockers),
    branch: row.branch,
    worktree: row.worktree === 1,
    taskType: row.task_type,
    descPath: row.desc_path,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

// ---------------------------------------------------------------------------
// 读路由开关(projects.data_authority;只读 —— 置位仅随迁移事务,任务 1.4)
// ---------------------------------------------------------------------------

/** 读项目的任务权威通道;项目不存在 → null(调用方映射 ERR_PROJECT_NOT_FOUND)。 */
export function getProjectTaskAuthority(db: RepoDb, projectId: string): TaskAuthority | null {
  const row = db
    .prepare('SELECT data_authority FROM projects WHERE id = ?')
    .get(projectId) as { readonly data_authority: TaskAuthority } | undefined
  return row === undefined ? null : row.data_authority
}

// ---------------------------------------------------------------------------
// 写入面(唯一写入口;SAVEPOINT 承载的内核事务路径,嵌套安全)
// ---------------------------------------------------------------------------

/** 插入入参(动词 taskAdd 与迁移摄入(1.4)共用的行级写形态)。 */
export interface InsertTaskInput {
  readonly projectId: string
  readonly taskKey: string
  readonly featureSlug: string
  readonly title: string
  readonly status: TaskStatus
  readonly blockers: readonly string[]
  readonly taskType: string | null
  readonly descPath: string | null
  readonly updatedBy: string
  readonly updatedAt: string
}

/**
 * 动词级内核事务(SAVEPOINT 承载):task 表写路径的统一事务语义 ——
 * 校验 + 写入同事务(读-改-写原子);独立调用即自持事务,嵌套于迁移
 * 大事务(1.4 摄入)内时安全降级为子事务;失败整体回滚,零部分写入。
 */
export function withTaskTx<T>(db: RepoDb, run: () => T): T {
  db.exec('SAVEPOINT dsh_forge_task_tx')
  try {
    const result = run()
    db.exec('RELEASE dsh_forge_task_tx')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK TO dsh_forge_task_tx')
      db.exec('RELEASE dsh_forge_task_tx')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

/** 复合主键读:按 (project_id, task_key) 取单行;不存在 → null。 */
export function getTask(db: RepoDb, projectId: string, taskKey: string): AuthoritativeTask | null {
  const row = db
    .prepare('SELECT * FROM task WHERE project_id = ? AND task_key = ?')
    .get(projectId, taskKey) as TaskRow | undefined
  return row === undefined ? null : toAuthoritativeTask(row)
}

/** 项目任务全量(看板/查询;排序同 task_snapshot 惯例:updated_at 倒序 + task_key 兜底)。 */
export function listTasks(db: RepoDb, projectId: string): AuthoritativeTask[] {
  const rows = db
    .prepare('SELECT * FROM task WHERE project_id = ? ORDER BY updated_at DESC, task_key')
    .all(projectId) as TaskRow[]
  return rows.map(toAuthoritativeTask)
}

/** 按 feature 聚合查询(命中 idx_task_feature;依赖解析索引的同源读取)。 */
export function listTasksByFeature(db: RepoDb, projectId: string, featureSlug: string): AuthoritativeTask[] {
  const rows = db
    .prepare('SELECT * FROM task WHERE project_id = ? AND feature_slug = ? ORDER BY updated_at DESC, task_key')
    .all(projectId, featureSlug) as TaskRow[]
  return rows.map(toAuthoritativeTask)
}

/**
 * 插入权威行(taskAdd / 迁移摄入共用)。UNIQUE(project_id, task_key)
 * 冲突 → ERR_TASK_EXISTS(M2 registerProject 的 ERR_PROJECT_EXISTS 同款
 * 映射惯例);词表越界由 SQL CHECK 原样拒绝(单语句原子)。
 */
export function insertTask(db: RepoDb, input: InsertTaskInput): AuthoritativeTask {
  try {
    db.prepare(
      `INSERT INTO task
        (project_id, task_key, feature_slug, title, status, blockers, branch, worktree, task_type, desc_path, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, ?)`,
    ).run(
      input.projectId,
      input.taskKey,
      input.featureSlug,
      input.title,
      input.status,
      JSON.stringify(input.blockers),
      input.taskType,
      input.descPath,
      input.updatedBy,
      input.updatedAt,
    )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new TaskDomainError('ERR_TASK_EXISTS', `task ${input.taskKey} already exists in project ${input.projectId}`)
    }
    throw error
  }
  const inserted = getTask(db, input.projectId, input.taskKey)
  if (inserted === null) {
    // Defensive only: the row was just written by the statement above.
    throw new Error(`task ${input.taskKey} vanished right after insert`)
  }
  return inserted
}

/**
 * 按 feature 整组删除权威行(重摄入(1.5)的整 feature 替换面:先删后插,
 * 同一外部写重复回收零重复行/零残留)。返回删除行数(诊断/审计用)。
 */
export function deleteTasksByFeature(db: RepoDb, projectId: string, featureSlug: string): number {
  const changes = db
    .prepare('DELETE FROM task WHERE project_id = ? AND feature_slug = ?')
    .run(projectId, featureSlug)
  return Number(changes.changes)
}

/**
 * 状态迁移写(动词经状态机校验后的唯一落库语句):更新 status +
 * updated_by(actor 审计)+ updated_at。行不存在 → ERR_TASK_NOT_FOUND
 * (changes=0 判定,不静默)。其余字段不动(blockers/title 等非迁移面)。
 */
export function updateTaskStatus(
  db: RepoDb,
  projectId: string,
  taskKey: string,
  status: TaskStatus,
  updatedBy: string,
  updatedAt: string,
): AuthoritativeTask {
  const changes = db
    .prepare('UPDATE task SET status = ?, updated_by = ?, updated_at = ? WHERE project_id = ? AND task_key = ?')
    .run(status, updatedBy, updatedAt, projectId, taskKey)
  if (Number(changes.changes) !== 1) {
    throw new TaskDomainError('ERR_TASK_NOT_FOUND', `task ${taskKey} not found in project ${projectId}`)
  }
  const updated = getTask(db, projectId, taskKey)
  if (updated === null) {
    // Defensive only: the row was just matched by the UPDATE above.
    throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `task ${taskKey} vanished right after update`)
  }
  return updated
}

// ---------------------------------------------------------------------------
// 自动 ID 合成(forge-cli pkg/task/add.go generateAutoID 逐行对齐)
// ---------------------------------------------------------------------------

/**
 * 前缀自增 ID:`<prefix>-<maxN+1>`(Go generateAutoID:扫描 map key 的
 * `<prefix>-` 前缀,数字后缀取 max)。默认前缀 `disc`( discretionary
 * add 的 forge 惯例)—— 本仓 taskAdd 无显式 taskKey 时的同款语义。
 */
export function generateAutoTaskId(prefix: string, localIds: readonly string[]): string {
  const prefixWithDash = `${prefix}-`
  let maxN = 0
  for (const localId of localIds) {
    if (!localId.startsWith(prefixWithDash)) continue
    const numStr = localId.slice(prefixWithDash.length)
    if (!/^\d+$/.test(numStr)) continue
    const n = Number(numStr)
    if (n > maxN) maxN = n
  }
  return `${prefix}-${String(maxN + 1)}`
}
