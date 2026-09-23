// workbench/dispatch/dispatch-service — 编排域动词服务(任务 3.3)。
//
// tech-design §Interface 1 编排段的服务实现(dispatchTasks/redispatch/
// getDispatches/listApprovals/decideApproval + host 半身回调面),装配律与
// task/prefs/stages 服务同型:
//
//   - dispatchTasks:可派发集校验(状态允许 + 依赖终态,claim 语境悬空依赖
//     vacuously satisfied)+ checkStageArtifacts 消费(缺失且未
//     acknowledgeMissing → blocked:artifacts-missing 联合返回,warn 不阻断
//     的 acknowledge 面;AC-1)→ 预合成契约查(内容非空 + prompt_hash =
//     sha256(注入串)定型;seam 缺省 = 契约拒绝 ERR_SYSTEM_PROMPT_CONTRACT,
//     spike③ 三查的内核侧两查)→ 同批多任务单 batch_id 聚合、每任务独立
//     行(并行互不共享,AC-1)→ launch-port(host 回调,缺省行留 starting;
//     成功回填 session_id → running,失败 → failed + 原因;Hard Rule:内核
//     不持会话创建权);
//   - redispatch:failed 行的重走检查再入(新行保留审计轨迹;UI 二次确认);
//   - 审批:receiveApproval(host 事件入列:插 pending + dispatch → awaiting
//     同事务,⇔ 不变式进入边;3.5 approval-bridge 接线面)+ decideApproval
//     (显式决策,decided_by/decided_at 审计;重复 → ERR_APPROVAL_DECIDED,
//     失效 → ERR_APPROVAL_NOT_FOUND;最后 pending 决策 → awaiting → running,
//     ⇔ 不变式离开边);
//   - host 回调:notifySessionStarted(session_id 回填)/notifyLaunchFailed
//     (failed+error)/notifyDispatchEnded(done/failed;awaiting 终局守卫 =
//     零 pending)—— 内核事务落库(AC-2),非法边拒绝;
//   - 事件:dispatch_updated/approval_received 经注入 onEvents 单批直发
//     (迁移/偏好面同款;verb 完成一批,批推通道 ≤500ms 语义由 sink 承载)。
//
// 权限界:dispatch 是编排发起(人 = 编排发起,操作主体模型 M3 定形)且消费
// task 权威行 —— 仅 data_authority='sqlite' 项目(files → ERR_TASK_NOT_
// AUTHORITATIVE,迁移/走 CLI 提示,双形态纪律)。

import { createHash, randomUUID } from 'node:crypto'
import type { WorkbenchEvent } from '../indexer/diff.ts'
import type { DispatchState } from '../repos/types.ts'
import type { DispatchTasksInput, DispatchTasksResult, DecideApprovalInput, MissingItem, StageArtifactsReport } from '../ipc/types.ts'
import type { RepoDb } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { getUnmetDeps } from '../tasks/deps.ts'
import { TaskIndex } from '../tasks/model.ts'
import {
  assertBoardTaskKey,
  getProjectTaskAuthority,
  getTask,
  listTasksByFeature,
  localIdOfTaskKey,
  TaskDomainError,
  type AuthoritativeTask,
} from '../tasks/task-repo.ts'
import {
  DispatchDomainError,
  getDispatchById,
  insertDispatch,
  listDispatches,
  updateDispatchState,
  validateDispatchTransition,
  withDispatchTx,
  type DispatchRecord,
  type DispatchStatePatch,
} from './dispatch-repo.ts'
import {
  countPendingApprovals,
  decideApprovalRow,
  insertApprovalRequest,
  listApprovals as listApprovalRows,
  type ApprovalRecord,
} from './approval-repo.ts'
import type { DispatchLaunchInput, DispatchLaunchPort } from './launch-port.ts'
import type { PresynthInjection } from './presynth/assemble.ts'

/** 审批入列入参(host approval-bridge(3.5)→ 内核;非 IPC 动词面)。 */
export interface ReceiveApprovalInput {
  readonly dispatchId: string
  /** 来源 subagent 会话;缺省用 dispatch 行回填值(schema NOT NULL)。 */
  readonly sessionId?: string
  /** 请求正文 + 类别(任意 JSON 值,原样落 payload_json)。 */
  readonly payload: unknown
}

/** 服务依赖缝(db + 检查/预合成/启动注入 + 事件端;装配缺省见 services.ts)。 */
export interface DispatchVerbDeps {
  readonly db: RepoDb
  /** 派发前产物齐全性检查(3.2 stages 服务注入;确定性清单,缺失 = 警告)。 */
  readonly checkArtifacts: (projectId: string, featureSlug: string) => StageArtifactsReport
  /**
   * 预合成 seam(3.4 引擎接线):入参 = 权威任务行,返回 = 完整注入内容串
   * (组合首条消息,spike③ 口径;内核不解释);hash = sha256(该串)随行
   * 落库。PresynthInjection 形态(3.4 引擎)额外携带预铸 sessionId —— 随
   * dispatch 行落库(spike③ §4:hash 与 launch 解耦)+ 透传 launch-port
   * (3.5 create({sessionId}) 幂等 adopt)。缺省 = 无预合成 → 派发前契约
   * 拒绝(ERR_SYSTEM_PROMPT_CONTRACT:预合成内容非空)。
   */
  readonly composePrompt?: (task: AuthoritativeTask) => string | PresynthInjection
  /** host 启动回调(3.5 dispatch-launch 接线);缺省 = 行留 starting。 */
  readonly launchPort?: DispatchLaunchPort
  /** 事件批直发端(动词完成批;迁移/偏好面 onEvent 同款形态)。 */
  readonly onEvents?: (events: readonly WorkbenchEvent[]) => void
}

/** 本模块装配产物:五个编排动词 + host 回调面(动词并入 WorkbenchVerbServices)。 */
export interface DispatchVerbService {
  dispatchTasks(input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult>
  redispatch(dispatchId: string, actor: string): Promise<DispatchTasksResult>
  getDispatches(projectId: string): DispatchRecord[]
  listApprovals(projectId: string): ApprovalRecord[]
  decideApproval(input: DecideApprovalInput, actor: string): ApprovalRecord
  // —— host 半身回调面(3.5 接线;非 IPC 动词)——
  /** 审批事件入列:插 pending + dispatch → awaiting(同事务,⇔ 进入边)。 */
  receiveApproval(input: ReceiveApprovalInput): ApprovalRecord
  /** session_id 回填 + starting → running(幂等:同 session 重复回填 no-op)。 */
  notifySessionStarted(dispatchId: string, sessionId: string): DispatchRecord
  /** launch 失败:starting → failed + 原因(ERR_DISPATCH_LAUNCH_FAILED 呈现口径)。 */
  notifyLaunchFailed(dispatchId: string, error: string): DispatchRecord
  /** 执行终局:running/awaiting → done/failed(awaiting 须先清零 pending)。 */
  notifyDispatchEnded(dispatchId: string, result: 'done' | 'failed', error?: string): DispatchRecord
}

/** 可派发状态集:pending(就绪)/ blocked(依赖终态后的解锁面)。 */
const DISPATCHABLE_STATUSES: ReadonlySet<string> = new Set(['pending', 'blocked'])

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function dispatchUpdatedEvent(row: DispatchRecord): WorkbenchEvent {
  return { type: 'dispatch_updated', projectId: row.projectId, dispatchId: row.id, taskKey: row.taskKey, state: row.state }
}

function approvalReceivedEvent(approval: ApprovalRecord): WorkbenchEvent {
  return { type: 'approval_received', projectId: approval.projectId, approvalId: approval.id, taskKey: approval.taskKey }
}

export function createDispatchVerbService(deps: DispatchVerbDeps): DispatchVerbService {
  const { db } = deps
  const emit = (events: readonly WorkbenchEvent[]): void => {
    if (events.length > 0) deps.onEvents?.(events)
  }

  /** 项目存在 + sqlite 权威断言(编排发起的权限界;files → 迁移/CLI 提示)。 */
  const requireSqliteAuthority = (projectId: string): void => {
    const authority = getProjectTaskAuthority(db, projectId)
    if (authority === null) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    if (authority !== 'sqlite') {
      throw new TaskDomainError(
        'ERR_TASK_NOT_AUTHORITATIVE',
        `project ${projectId} is not sqlite-authoritative yet (data_authority='${authority}'); dispatch consumes authoritative task rows — migrate the project first, or use the forge CLI (dual-form discipline)`,
      )
    }
  }

  /**
   * 项目 codeRoot(dispatch-launch 的 create cwd;任务 3.5)。权威断言已证
   * 行存在,缺失 = 存储损伤 → 显式错误(不静默空 cwd)。
   */
  const requireProjectCodeRoot = (projectId: string): string => {
    const row = db
      .prepare('SELECT code_root FROM projects WHERE id = ?')
      .get(projectId) as { readonly code_root?: unknown } | undefined
    if (row === undefined || typeof row.code_root !== 'string' || row.code_root === '') {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} carries no readable code_root (storage damage) — cannot mint a launch payload`)
    }
    return row.code_root
  }

  /** 同 feature 命名空间依赖索引(task-service buildFeatureIndex 同型)。 */
  const buildFeatureIndex = (projectId: string, featureSlug: string): TaskIndex =>
    new TaskIndex(
      listTasksByFeature(db, projectId, featureSlug).map((task) => {
        const localId = localIdOfTaskKey(task.taskKey)
        return [
          localId,
          {
            id: localId,
            title: task.title,
            status: task.status,
            dependencies: task.blockers,
            type: task.taskType ?? undefined,
          },
        ] as const
      }),
    )

  /** 状态允许断言(AC-1:终态/在跑/挂起任务集 → 阻止 + 提示)。 */
  const requireDispatchableStatus = (task: AuthoritativeTask): void => {
    if (DISPATCHABLE_STATUSES.has(task.status)) return
    const hint =
      task.status === 'completed'
        ? 'already completed — create a subtask if re-work is needed'
        : task.status === 'in_progress'
          ? 'in_progress — already being executed (one executor per task)'
          : task.status === 'suspended'
            ? 'suspended — resume it (task transition) before dispatching'
            : `${task.status} — reopen it before dispatching`
    throw new TaskDomainError(
      'ERR_TASK_STATE_INVALID',
      `task ${task.taskKey} is not dispatchable: ${hint}`,
    )
  }

  /** 依赖终态断言(claim 语境:已解析依赖须终态,悬空 vacuously satisfied)。 */
  const requireDepsTerminal = (task: AuthoritativeTask): void => {
    const index = buildFeatureIndex(task.projectId, task.featureSlug)
    const localId = localIdOfTaskKey(task.taskKey)
    const rawUnmet = getUnmetDeps(index, localId, task.blockers) ?? []
    const unmet = rawUnmet.filter(id => index.byId(id) !== undefined)
    if (unmet.length > 0) {
      throw new TaskDomainError(
        'ERR_TASK_DEPS_UNSATISFIED',
        `task ${task.taskKey} has unmet dependencies (terminal-state precondition): ${unmet.join(', ')}`,
      )
    }
  }

  /** 行读取;缺失 → ERR_DISPATCH_NOT_FOUND。 */
  const requireDispatch = (dispatchId: string): DispatchRecord => {
    const row = getDispatchById(db, dispatchId)
    if (row === null) {
      throw new DispatchDomainError('ERR_DISPATCH_NOT_FOUND', `dispatch ${dispatchId} not found`)
    }
    return row
  }

  /**
   * 单行迁移落库(校验 + 写同事务;AC-2 的内核事务路径)。allowedFrom =
   * 回调契约允许的来源态集(竞态下的第二道校验);终局边守卫:awaiting →
   * done/failed 须同 dispatch pending 清零(⇔ 不变式离开边的强制点 ——
   * 未经决策的 pending 不随终局静默失效,Hard Rule 无默认决策)。
   */
  const applyTransition = (
    dispatchId: string,
    allowedFrom: readonly DispatchState[],
    patch: DispatchStatePatch,
  ): DispatchRecord =>
    withDispatchTx(db, () => {
      const row = requireDispatch(dispatchId)
      if (!allowedFrom.includes(row.state)) {
        throw new DispatchDomainError(
          'ERR_DISPATCH_STATE_INVALID',
          `dispatch ${dispatchId} is ${row.state}, expected ${allowedFrom.join('|')} for this transition`,
        )
      }
      const rejection = validateDispatchTransition(row.state, patch.to)
      if (rejection !== null) throw rejection
      if (row.state === 'awaiting' && (patch.to === 'done' || patch.to === 'failed')) {
        const pending = countPendingApprovals(db, dispatchId)
        if (pending > 0) {
          throw new DispatchDomainError(
            'ERR_DISPATCH_STATE_INVALID',
            `dispatch ${dispatchId} still has ${String(pending)} pending approval(s) — decide them before ending the dispatch (no implicit decisions)`,
          )
        }
      }
      return updateDispatchState(db, dispatchId, patch)
    })

  /**
   * 派发核(dispatchTasks / redispatch 共用):前置校验(权威/存在/可派发/
   * 依赖)→ 产物检查(acknowledgeMissing 表达)→ 预合成契约查 → 同批
   * batch_id 落行 → launch 回调 → 结果回填。事件随行收集,动词完成单批
   * 直发(批量通道)。
   */
  const runDispatchBatch = async (
    projectId: string,
    taskKeys: readonly string[],
    actor: string,
    acknowledgeMissing: boolean,
  ): Promise<DispatchTasksResult> => {
    // —— 前置校验(全批原子:任一拒绝零写入)——
    requireSqliteAuthority(projectId)
    const projectCodeRoot = requireProjectCodeRoot(projectId)
    const tasks: AuthoritativeTask[] = []
    for (const taskKey of taskKeys) {
      assertBoardTaskKey(taskKey)
      const task = getTask(db, projectId, taskKey)
      if (task === null) {
        throw new TaskDomainError('ERR_TASK_NOT_FOUND', `task ${taskKey} not found in project ${projectId}`)
      }
      tasks.push(task)
    }
    for (const task of tasks) {
      requireDispatchableStatus(task)
      requireDepsTerminal(task)
    }

    // —— checkStageArtifacts 消费(缺失且未确认 → blocked 联合返回,零落行)——
    const missing: MissingItem[] = []
    for (const featureSlug of new Set(tasks.map(task => task.featureSlug))) {
      missing.push(...deps.checkArtifacts(projectId, featureSlug).missing)
    }
    if (missing.length > 0 && !acknowledgeMissing) {
      return { blocked: 'artifacts-missing', missing }
    }

    // —— 预合成契约查(内容非空 + hash 定型;seam 缺省 = 契约拒绝)——
    // PresynthInjection 形态(3.4 引擎)携带预铸 sessionId:随行落库 + 透传
    // launch-port(spike③ §4 落库时机);string 形态(测试缝/旧装配)保持
    // sessionId 空值语义(launch 回填路径不变)。
    const prompts = tasks.map((task) => {
      const product = deps.composePrompt?.(task)
      const message = typeof product === 'string' ? product : product?.message
      if (typeof message !== 'string' || message === '') {
        throw new DispatchDomainError(
          'ERR_SYSTEM_PROMPT_CONTRACT',
          `dispatch for task ${task.taskKey} has no presynthesized injection content (pre-synthesis engine not wired or produced empty output) — refusing to dispatch`,
        )
      }
      const sessionId = typeof product === 'object' && product !== null ? product.sessionId : null
      if (sessionId === '') {
        throw new DispatchDomainError(
          'ERR_SYSTEM_PROMPT_CONTRACT',
          `dispatch for task ${task.taskKey} carries an empty pre-minted session id — the injection hash would not be auditable against the session`,
        )
      }
      return { message, sessionId }
    })

    // —— 同批落行(单事务;每任务独立行,batch_id 聚合;prompt_hash =
    // sha256(组合首条消息),预铸 sessionId 随行落库)——
    const batchId = randomUUID()
    const dispatchedAt = new Date().toISOString()
    let rows: DispatchRecord[] = withDispatchTx(db, () =>
      tasks.map((task, i) =>
        insertDispatch(db, {
          projectId,
          featureSlug: task.featureSlug,
          taskKey: task.taskKey,
          batchId,
          promptHash: sha256Hex(prompts[i]?.message ?? ''),
          sessionId: prompts[i]?.sessionId ?? null,
          actor,
          dispatchedAt,
        }),
      ),
    )
    const events: WorkbenchEvent[] = rows.map(dispatchUpdatedEvent)

    // —— host 启动回调(缺省 = 行留 starting,3.5 接线;行序 = 任务序对齐)——
    const port = deps.launchPort
    if (port !== undefined) {
      const outcomes = await Promise.all(
        rows.map(async (row, i) => {
          const input: DispatchLaunchInput = {
            dispatchId: row.id,
            batchId: row.batchId,
            projectId: row.projectId,
            featureSlug: row.featureSlug,
            taskKey: row.taskKey,
            taskType: tasks[i]?.taskType ?? null,
            prompt: prompts[i]?.message ?? '',
            promptHash: row.promptHash,
            sessionId: prompts[i]?.sessionId ?? null,
          }
          try {
            return { row, outcome: await port.launch(input) }
          } catch (error) {
            // host 抛错 = launch 失败降级链(failed 态 + 原因),动词不拒。
            return { row, outcome: { ok: false as const, error: `launch port threw: ${String(error)}` } }
          }
        }),
      )
      const finalRows: DispatchRecord[] = []
      for (const { row, outcome } of outcomes) {
        const final =
          outcome.ok
            ? applyTransition(row.id, ['starting'], { to: 'running', sessionId: outcome.sessionId, at: new Date().toISOString() })
            : applyTransition(row.id, ['starting'], { to: 'failed', error: outcome.error, at: new Date().toISOString() })
        finalRows.push(final)
        events.push(dispatchUpdatedEvent(final))
      }
      rows = finalRows
    }

    emit(events)
    // —— launch payload 随行(任务 3.5):预合成组合首条消息不落库(仅
    // prompt_hash),经派发应答交 renderer relay → host dispatch-launch
    // (M2 promptText 过 renderer 先例;getDispatches 不回流 prompt)。——
    return {
      dispatched: rows.map((row, i) => ({
        ...row,
        launch: {
          prompt: prompts[i]?.message ?? '',
          promptHash: row.promptHash,
          sessionId: row.sessionId,
          cwd: projectCodeRoot,
          taskType: tasks[i]?.taskType ?? null,
        },
      })),
    }
  }

  return {
    async dispatchTasks(input: DispatchTasksInput, actor: string): Promise<DispatchTasksResult> {
      if (actor === '') {
        throw new Error('dispatchTasks: actor must be a non-empty string (audit discipline)')
      }
      if (!Array.isArray(input.taskKeys) || input.taskKeys.length === 0) {
        throw new Error('dispatchTasks: taskKeys must be a non-empty array of board addresses')
      }
      if (new Set(input.taskKeys).size !== input.taskKeys.length) {
        throw new Error('dispatchTasks: taskKeys must be distinct (one dispatch row per task per batch)')
      }
      return runDispatchBatch(input.projectId, [...input.taskKeys], actor, input.acknowledgeMissing === true)
    },

    async redispatch(dispatchId: string, actor: string): Promise<DispatchTasksResult> {
      if (actor === '') {
        throw new Error('redispatch: actor must be a non-empty string (audit discipline)')
      }
      const row = requireDispatch(dispatchId)
      if (row.state !== 'failed') {
        throw new DispatchDomainError(
          'ERR_DISPATCH_STATE_INVALID',
          `dispatch ${dispatchId} is ${row.state} — only failed dispatches can be redispatched (failure-recovery path; the original row stays as the audit trail)`,
        )
      }
      // 重走检查(二次确认在 UI):产物缺失 → blocked 联合返回,不落行。
      return runDispatchBatch(row.projectId, [row.taskKey], actor, false)
    },

    getDispatches(projectId: string): DispatchRecord[] {
      if (getProjectTaskAuthority(db, projectId) === null) {
        throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
      }
      return listDispatches(db, projectId)
    },

    listApprovals(projectId: string): ApprovalRecord[] {
      if (getProjectTaskAuthority(db, projectId) === null) {
        throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
      }
      return listApprovalRows(db, projectId)
    },

    decideApproval(input: DecideApprovalInput, actor: string): ApprovalRecord {
      if (actor === '') {
        throw new Error('decideApproval: actor must be a non-empty string (audit discipline)')
      }
      const events: WorkbenchEvent[] = []
      const decided = withDispatchTx(db, () => {
        // 决策落库(仅 pending;缺失 → ERR_APPROVAL_NOT_FOUND,重复 →
        // ERR_APPROVAL_DECIDED)+ ⇔ 离开边同事务:最后一条 pending 决策后
        // awaiting → running(decideApprovalRow 的 changes 判定与决策审计)。
        const updated = decideApprovalRow(db, input.approvalId, input.approve, actor, new Date().toISOString())
        if (countPendingApprovals(db, updated.dispatchId) === 0) {
          const dispatch = getDispatchById(db, updated.dispatchId)
          if (dispatch !== null && dispatch.state === 'awaiting') {
            const rejection = validateDispatchTransition('awaiting', 'running')
            if (rejection !== null) throw rejection
            const final = updateDispatchState(db, dispatch.id, { to: 'running', at: new Date().toISOString() })
            events.push(dispatchUpdatedEvent(final))
          }
        }
        return updated
      })
      emit(events)
      return decided
    },

    receiveApproval(input: ReceiveApprovalInput): ApprovalRecord {
      const events: WorkbenchEvent[] = []
      const approval = withDispatchTx(db, () => {
        const dispatch = requireDispatch(input.dispatchId)
        const sessionId = input.sessionId ?? dispatch.sessionId
        if (sessionId === null || sessionId === '') {
          throw new Error(`receiveApproval: dispatch ${input.dispatchId} has no backfilled session_id and none was supplied — an approval must carry its source session`)
        }
        if (dispatch.state !== 'running' && dispatch.state !== 'awaiting') {
          throw new DispatchDomainError(
            'ERR_DISPATCH_STATE_INVALID',
            `dispatch ${input.dispatchId} is ${dispatch.state} — approvals can only arrive from a running dispatch (session backfill precedes prompt injection; nothing is dropped silently)`,
          )
        }
        // ⇔ 进入边:首条 pending 插入与 running → awaiting 同事务(已有
        // pending 时状态保持 awaiting,仅入列新条目)。
        if (dispatch.state === 'running') {
          const rejection = validateDispatchTransition('running', 'awaiting')
          if (rejection !== null) throw rejection
          updateDispatchState(db, dispatch.id, { to: 'awaiting', at: new Date().toISOString() })
          const moved = getDispatchById(db, dispatch.id)
          if (moved !== null) events.push(dispatchUpdatedEvent(moved))
        }
        const created = insertApprovalRequest(db, {
          dispatchId: dispatch.id,
          projectId: dispatch.projectId,
          taskKey: dispatch.taskKey,
          sessionId,
          payload: input.payload,
          createdAt: new Date().toISOString(),
        })
        events.push(approvalReceivedEvent(created))
        return created
      })
      emit(events)
      return approval
    },

    notifySessionStarted(dispatchId: string, sessionId: string): DispatchRecord {
      if (sessionId === '') {
        throw new Error('notifySessionStarted: sessionId must be a non-empty string')
      }
      // 幂等面:caller-minted adopt 的重复回填(同 session)no-op 不产事件。
      const existing = requireDispatch(dispatchId)
      if (existing.state === 'running' && existing.sessionId === sessionId) return existing
      const updated = applyTransition(dispatchId, ['starting'], { to: 'running', sessionId, at: new Date().toISOString() })
      emit([dispatchUpdatedEvent(updated)])
      return updated
    },

    notifyLaunchFailed(dispatchId: string, error: string): DispatchRecord {
      const updated = applyTransition(dispatchId, ['starting'], { to: 'failed', error, at: new Date().toISOString() })
      emit([dispatchUpdatedEvent(updated)])
      return updated
    },

    notifyDispatchEnded(dispatchId: string, result: 'done' | 'failed', error?: string): DispatchRecord {
      const updated = applyTransition(dispatchId, ['running', 'awaiting'], {
        to: result,
        ...(error === undefined ? {} : { error }),
        at: new Date().toISOString(),
      })
      emit([dispatchUpdatedEvent(updated)])
      return updated
    },
  }
}
