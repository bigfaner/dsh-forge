// workbench/dispatch/dispatch-repo — 派发编排仓储 + 5 态状态机(任务 3.3)。
//
// dispatch 表(schema-v2.sql §4)= 编排域 SoT(每任务每次执行一行,并行 =
// N 行互不共享;ended_at IS NULL = 在跑,迁移守卫(1.4)判据)。本模块是
// 它的唯一写入口(SAVEPOINT 内核事务路径,task-repo withTaskTx 先例),
// 并承载 5 态合法边表(AC-2 的裁决面):
//
//   starting → running   session 回填 / launch ok
//   starting → failed    launch 失败(host 回调 failed+error)
//   running  → awaiting  首条 pending 审批入列(⇔ 不变式的进入边)
//   running  → done      执行完成(host 回调 ended)
//   running  → failed    执行失败(host 回调 ended)
//   awaiting → running   最后一条 pending 审批决策(⇔ 不变式的离开边)
//   awaiting → done/failed  终局(守卫:同 dispatch 无 pending,否则拒绝)
//
// done/failed 为终态(该行不再迁移;重派发 = 新行,审计轨迹保留)。
// 「awaiting ⇔ 存在同 dispatch pending 审批」不变式(AC-4)的强制点在
// dispatch-service(进入边随审批插入同事务、终局边前置守卫);本模块提供
// 纯边裁决 + 行级 CRUD,不查 approval_request(域间单向依赖:service 编排)。
//
// ended_at 纪律:终态(done/failed)必置 ended_at;非终态恒 NULL(SQL 无
// CHECK,由本模块写入路径强制 —— 守卫判据 ended_at IS NULL 的语义前提)。

import { randomUUID } from 'node:crypto'
import type { DispatchState, RepoDb } from '../repos/types.ts'

/**
 * dispatch 域错误码(tech-design §Error Types & Codes 编排段 + 词表惯例
 * 扩展,注释钉定):ERR_SYSTEM_PROMPT_CONTRACT = 设计错误表原词(spike③
 * 契约三查的内核侧:预合成内容非空);ERR_DISPATCH_NOT_FOUND /
 * ERR_DISPATCH_STATE_INVALID = dispatch 行地址空间与状态机的 ERR_* 惯例
 * 对应(表内无既有码可复用,任务 3.3 扩词表)。
 */
export type DispatchErrorCode =
  | 'ERR_DISPATCH_NOT_FOUND'
  | 'ERR_DISPATCH_STATE_INVALID'
  | 'ERR_SYSTEM_PROMPT_CONTRACT'

/** dispatch 域错误(状态机拒绝 / 行缺失;code 经 IPC 错误封装原码透传)。 */
export class DispatchDomainError extends Error {
  constructor(
    readonly code: DispatchErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DispatchDomainError'
  }
}

/** dispatch 表行(schema-v2.sql snake_case 投影)。 */
export interface DispatchRow {
  readonly id: string
  readonly batch_id: string
  readonly project_id: string
  readonly feature_slug: string
  readonly task_key: string
  readonly state: DispatchState
  readonly session_id: string | null
  readonly prompt_hash: string
  readonly actor: string
  readonly dispatched_at: string
  readonly ended_at: string | null
  readonly error: string | null
}

/**
 * dispatch 行的 DTO(camelCase;Interface 1 DispatchRow 的仓储侧来源形态)。
 * 行形态 → DTO 映射只发生在本层(repos 惯例)。
 */
export interface DispatchRecord {
  readonly id: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  readonly state: DispatchState
  readonly sessionId: string | null
  readonly promptHash: string
  readonly actor: string
  readonly dispatchedAt: string
  readonly endedAt: string | null
  readonly error: string | null
}

export function toDispatchRecord(row: DispatchRow): DispatchRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    projectId: row.project_id,
    featureSlug: row.feature_slug,
    taskKey: row.task_key,
    state: row.state,
    sessionId: row.session_id,
    promptHash: row.prompt_hash,
    actor: row.actor,
    dispatchedAt: row.dispatched_at,
    endedAt: row.ended_at,
    error: row.error,
  }
}

// ---------------------------------------------------------------------------
// 5 态合法边表(AC-2;纯函数,迁移裁决唯一权威)
// ---------------------------------------------------------------------------

/** 合法边集合(from → to);终态 done/failed 无出边。 */
const DISPATCH_EDGES: ReadonlySet<string> = new Set([
  'starting->running',
  'starting->failed',
  'running->awaiting',
  'running->done',
  'running->failed',
  'awaiting->running',
  'awaiting->done',
  'awaiting->failed',
])

/** 终态判定(该行不再迁移;重派发 = 新行)。 */
export function isDispatchTerminal(state: DispatchState): boolean {
  return state === 'done' || state === 'failed'
}

/**
 * 边裁决:合法 → null;非法 → ERR_DISPATCH_STATE_INVALID(消息含 from/to
 * 与守卫提示;awaiting 终局守卫的语义检查在 service 面,此处只裁边形态)。
 */
export function validateDispatchTransition(from: DispatchState, to: DispatchState): DispatchDomainError | null {
  if (from === to) {
    return new DispatchDomainError(
      'ERR_DISPATCH_STATE_INVALID',
      `dispatch transition ${from} -> ${to} is a no-op on a state machine with explicit edges (use a legal edge or skip the write)`,
    )
  }
  if (!DISPATCH_EDGES.has(`${from}->${to}`)) {
    return new DispatchDomainError(
      'ERR_DISPATCH_STATE_INVALID',
      `invalid dispatch transition ${from} -> ${to} (legal edges: starting->running|failed, running->awaiting|done|failed, awaiting->running|done|failed; done/failed are terminal — redispatch creates a new row)`,
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// 事务(SAVEPOINT 承载,嵌套安全;task-repo withTaskTx 同款)
// ---------------------------------------------------------------------------

/**
 * dispatch/approval 域写路径统一事务语义:校验 + 写入同事务(读-改-写
 * 原子);失败整体回滚,零部分写入;嵌套于外层事务时安全降级为子事务。
 */
export function withDispatchTx<T>(db: RepoDb, run: () => T): T {
  db.exec('SAVEPOINT dsh_forge_dispatch_tx')
  try {
    const result = run()
    db.exec('RELEASE dsh_forge_dispatch_tx')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK TO dsh_forge_dispatch_tx')
      db.exec('RELEASE dsh_forge_dispatch_tx')
    } catch {
      // The connection may already be unusable; prefer rethrowing the original error.
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// 行级 CRUD(唯一写入口)
// ---------------------------------------------------------------------------

/** 插入入参(新派发行恒 starting;ended/error 由后续迁移落)。 */
export interface InsertDispatchInput {
  readonly projectId: string
  readonly featureSlug: string
  readonly taskKey: string
  /** 同批多任务聚合 id(动词层铸造,单次 dispatchTasks 一个)。 */
  readonly batchId: string
  readonly promptHash: string
  /**
   * 预铸 sessionId(spike③ §4:3.4 引擎 compose 时 caller-minted,hash 与
   * launch 解耦);null = 无预铸形态(3.3 语义,launch 成功后回填)。
   */
  readonly sessionId: string | null
  readonly actor: string
  readonly dispatchedAt: string
}

/** 新派发行(id 内铸 uuid;state='starting',ended/error 空)。 */
export function insertDispatch(db: RepoDb, input: InsertDispatchInput): DispatchRecord {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO dispatch (id, batch_id, project_id, feature_slug, task_key, state, session_id, prompt_hash, actor, dispatched_at, ended_at, error)
     VALUES (?, ?, ?, ?, ?, 'starting', ?, ?, ?, ?, NULL, NULL)`,
  ).run(
    id,
    input.batchId,
    input.projectId,
    input.featureSlug,
    input.taskKey,
    input.sessionId,
    input.promptHash,
    input.actor,
    input.dispatchedAt,
  )
  const record = getDispatchById(db, id)
  if (record === null) {
    // Defensive only: the row was just written by the statement above.
    throw new Error('dispatch row vanished right after insert')
  }
  return record
}

/** 按 id 取单行;不存在 → null。 */
export function getDispatchById(db: RepoDb, dispatchId: string): DispatchRecord | null {
  const row = db.prepare('SELECT * FROM dispatch WHERE id = ?').get(dispatchId) as DispatchRow | undefined
  return row === undefined ? null : toDispatchRecord(row)
}

/** 项目派发全量(看板编排面板;批内 dispatched_at 同值,倒序 + id 兜底)。 */
export function listDispatches(db: RepoDb, projectId: string): DispatchRecord[] {
  const rows = db
    .prepare('SELECT * FROM dispatch WHERE project_id = ? ORDER BY dispatched_at DESC, id')
    .all(projectId) as DispatchRow[]
  return rows.map(toDispatchRecord)
}

/** 状态迁移写(经边裁决后的唯一落库语句)。 */
export interface DispatchStatePatch {
  /** 迁移目标态(非终态同样走此面:running/awaiting)。 */
  readonly to: DispatchState
  /** session_id 回填(starting → running);无 → 不动。 */
  readonly sessionId?: string
  /** 失败原因(→ failed);无 → 不动。 */
  readonly error?: string
  /** 迁移时刻(终态行 ended_at 同值落库)。 */
  readonly at: string
}

/**
 * 状态迁移落库:更新 state(+ session/error 按入参),终态置 ended_at、
 * 非终态恒清 NULL(守卫判据语义)。行不存在 → ERR_DISPATCH_NOT_FOUND;
 * 边裁决由调用面(service)前置,本语句不重复裁决(单写入口纪律:边表
 * 裁决与落库同事务即可,service 是编排点)。
 */
export function updateDispatchState(db: RepoDb, dispatchId: string, patch: DispatchStatePatch): DispatchRecord {
  const terminal = isDispatchTerminal(patch.to)
  const endedAt = terminal ? patch.at : null
  const changes = db
    .prepare(
      `UPDATE dispatch SET
         state = ?,
         ended_at = ?,
         error = CASE WHEN ? IS NOT NULL THEN ? ELSE error END,
         session_id = CASE WHEN ? IS NOT NULL THEN ? ELSE session_id END
       WHERE id = ?`,
    )
    .run(
      patch.to,
      endedAt,
      patch.error ?? null,
      patch.error ?? null,
      patch.sessionId ?? null,
      patch.sessionId ?? null,
      dispatchId,
    )
  if (Number(changes.changes) !== 1) {
    throw new DispatchDomainError('ERR_DISPATCH_NOT_FOUND', `dispatch ${dispatchId} not found`)
  }
  const updated = getDispatchById(db, dispatchId)
  if (updated === null) {
    // Defensive only: the row was just matched by the UPDATE above.
    throw new Error(`dispatch ${dispatchId} vanished right after update`)
  }
  return updated
}
