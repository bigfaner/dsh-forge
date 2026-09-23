// workbench/dispatch/approval-repo — 审批请求仓储(任务 3.3)。
//
// approval_request 表(schema-v2.sql §5)= 审批审计 SoT:宿主 subagent 审批
// 事件经 approval-bridge(任务 3.5 接线)入列(pending),人在工作台经
// decideApproval 显式决策(Hard Rule T5:仅显式动词决策,无默认自动批准;
// decided_by/decided_at 审计)。本模块是表的唯一写入口(SAVEPOINT 事务,
// dispatch-repo 同款);「awaiting ⇔ 同 dispatch pending 审批」不变式的
// 编排点在 dispatch-service(插入/决策与 dispatch 状态迁移同事务)。
//
// payload_json = 请求正文 + 类别(工作区写入等),调用方供任意 JSON 值;
// 读取面防御解码(损坏行视同 null,不放大存储损伤 —— repos 惯例)。

import { randomUUID } from 'node:crypto'
import type { ApprovalState, RepoDb } from '../repos/types.ts'

/** approval 域错误码(tech-design §Error Types & Codes:ERR_APPROVAL_* 原词)。 */
export type ApprovalErrorCode = 'ERR_APPROVAL_NOT_FOUND' | 'ERR_APPROVAL_DECIDED'

/** approval 域错误(条目失效 / 已决;code 经 IPC 错误封装原码透传)。 */
export class ApprovalDomainError extends Error {
  constructor(
    readonly code: ApprovalErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApprovalDomainError'
  }
}

/** approval_request 表行(schema-v2.sql snake_case 投影)。 */
export interface ApprovalRow {
  readonly id: string
  readonly dispatch_id: string
  readonly project_id: string
  readonly task_key: string
  readonly session_id: string
  readonly payload_json: string
  readonly state: ApprovalState
  readonly created_at: string
  readonly decided_at: string | null
  readonly decided_by: string | null
}

/**
 * approval 行的 DTO(camelCase;Interface 1 ApprovalRow 的仓储侧来源形态;
 * payload = payload_json 防御解码值,呈现面直接可消费)。
 */
export interface ApprovalRecord {
  readonly id: string
  readonly dispatchId: string
  readonly projectId: string
  readonly taskKey: string
  readonly sessionId: string
  readonly payload: unknown
  readonly state: ApprovalState
  readonly createdAt: string
  readonly decidedAt: string | null
  readonly decidedBy: string | null
}

export function toApprovalRecord(row: ApprovalRow): ApprovalRecord {
  let payload: unknown = null
  try {
    payload = JSON.parse(row.payload_json) as unknown
  } catch {
    payload = null // 损坏行呈现空载荷,不放大存储损伤
  }
  return {
    id: row.id,
    dispatchId: row.dispatch_id,
    projectId: row.project_id,
    taskKey: row.task_key,
    sessionId: row.session_id,
    payload,
    state: row.state,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  }
}

// ---------------------------------------------------------------------------
// 行级 CRUD(唯一写入口)
// ---------------------------------------------------------------------------

/** 插入入参(新审批恒 pending;project/task 从 dispatch 行带出)。 */
export interface InsertApprovalInput {
  readonly dispatchId: string
  readonly projectId: string
  readonly taskKey: string
  /** 来源 subagent 会话(schema NOT NULL;dispatch 回填值或事件携带)。 */
  readonly sessionId: string
  /** 请求正文 + 类别(任意 JSON 值,原样序列化落库)。 */
  readonly payload: unknown
  readonly createdAt: string
}

/** 新审批行(id 内铸 uuid;state='pending',decided 两列为空)。 */
export function insertApprovalRequest(db: RepoDb, input: InsertApprovalInput): ApprovalRecord {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO approval_request (id, dispatch_id, project_id, task_key, session_id, payload_json, state, created_at, decided_at, decided_by)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL)`,
  ).run(
    id,
    input.dispatchId,
    input.projectId,
    input.taskKey,
    input.sessionId,
    JSON.stringify(input.payload ?? null),
    input.createdAt,
  )
  const record = getApprovalById(db, id)
  if (record === null) {
    // Defensive only: the row was just written by the statement above.
    throw new Error('approval row vanished right after insert')
  }
  return record
}

/** 按 id 取单行;不存在 → null。 */
export function getApprovalById(db: RepoDb, approvalId: string): ApprovalRecord | null {
  const row = db
    .prepare('SELECT * FROM approval_request WHERE id = ?')
    .get(approvalId) as ApprovalRow | undefined
  return row === undefined ? null : toApprovalRecord(row)
}

/**
 * 项目审批全量(审批 dock 数据源):pending 前(created_at 倒序),已决
 * 在后(created_at 倒序)—— 到达序呈现,决策态一目了然。
 */
export function listApprovals(db: RepoDb, projectId: string): ApprovalRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM approval_request WHERE project_id = ?
       ORDER BY CASE state WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id`,
    )
    .all(projectId) as ApprovalRow[]
  return rows.map(toApprovalRecord)
}

/** 同 dispatch 的 pending 审批计数(⇔ 不变式的守卫判据)。 */
export function countPendingApprovals(db: RepoDb, dispatchId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM approval_request WHERE dispatch_id = ? AND state = 'pending'")
    .get(dispatchId) as { readonly n: number }
  return Number(row.n)
}

/**
 * 决策落库(仅 pending 行可决):置 state/decided_at/decided_by。
 * 行缺失 → ERR_APPROVAL_NOT_FOUND;非 pending → ERR_APPROVAL_DECIDED
 * (重复决策拒绝,AC-3)。返回更新后行。
 */
export function decideApprovalRow(
  db: RepoDb,
  approvalId: string,
  approve: boolean,
  decidedBy: string,
  decidedAt: string,
): ApprovalRecord {
  const changes = db
    .prepare(
      `UPDATE approval_request SET state = ?, decided_at = ?, decided_by = ?
       WHERE id = ? AND state = 'pending'`,
    )
    .run(approve ? 'approved' : 'rejected', decidedAt, decidedBy, approvalId)
  if (Number(changes.changes) === 0) {
    const existing = getApprovalById(db, approvalId)
    if (existing === null) {
      throw new ApprovalDomainError('ERR_APPROVAL_NOT_FOUND', `approval ${approvalId} not found (it may belong to a removed dispatch)`)
    }
    throw new ApprovalDomainError(
      'ERR_APPROVAL_DECIDED',
      `approval ${approvalId} was already decided (${existing.state} by ${existing.decidedBy ?? 'unknown'} at ${existing.decidedAt ?? 'unknown'})`,
    )
  }
  const updated = getApprovalById(db, approvalId)
  if (updated === null) {
    // Defensive only: the row was just matched by the UPDATE above.
    throw new Error(`approval ${approvalId} vanished right after update`)
  }
  return updated
}
