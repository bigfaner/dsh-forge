// unblockTask——任务域 blocked→pending 出口薄壳动词（blocked-verdict-restore-primitive 1.3——
// 主会话判定阻塞原因消失，回队列走正常 claim；submitTask 双出口直达的 pending 侧承载面）。
// 定位：业务（forge/tasks 子域）。import 边：→ forge/workspace/（共享句柄/事件）与同域
// errors/phase-deriver/query/state-machine（与 submit.ts/transition.ts 同族单源）；四域互禁
// import 彼此（Hard Rule）。actor 由通道推断：unblockTask = tool 专属动词（Interface 7 同族），
// 审计行 actor 恒 'plugin-tool'。
//
// 单事务全成全败（Hard Rule）：行解析 → reason 必带（ERR_REASON_REQUIRED——复用 ReasonRequiredError
// 同族，verb='unblockTask'，先于转移校验与 transitionTask/submitTask 同序）→ agent 面矩阵先验
// （blocked→pending 唯一入口格——非 blocked 卡调用即 ERR_INVALID_TRANSITION 矩阵硬门；不接受
// gate/AC 负载——非结算语义，入口类型即无此字段）→ 写前相位增量断言 → 转移 UPDATE →
// 'unblock' 审计行（复用 submit 记录管道语义：reason 列承载裁决理由，零 summary/gate/ac 负载）；
// **不挂恢复钩子**（pending ∉ 满足集 {completed, skipped}——runRestoreHook 判定集结构性不命中）
// → 相位重算；闭包尾部（提交后）emitTasksChanged。一律 prepared statements。
import type { TaskRef } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { readPhaseInput, type TasksVerbDeps } from './add.js'
import { ReasonRequiredError } from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { resolvePhaseGuardFeature, resolveTaskRef } from './query.js'
import { assertTransitionAllowed } from './state-machine.js'

export type { TasksVerbDeps }

/** unblockTask 出参（submit 瘦身出参同形——零 restored：pending 不挂恢复钩子） */
export interface UnblockTaskResult {
  readonly taskId: string
  readonly status: 'pending'
}

/** unblockTask 入参（薄壳——仅 reason 一个裁决负载；零 gate/AC 结算面） */
export interface UnblockTaskInput {
  readonly projectId: string
  readonly taskRef: TaskRef
  /** 解除阻塞缘由（审计落 reason 列——必带，缺席/空白拒绝） */
  readonly reason?: string
  /** 发起会话（审计归因——可缺省落 NULL） */
  readonly sessionId?: string
}

/**
 * Interface 1 unblockTask：blocked→pending 出口（转移 + 'unblock' 审计行 + 相位重算；
 * 不挂恢复钩子——pending ∉ 满足集，理由留档见文件头）。
 */
export async function unblockTask(deps: TasksVerbDeps, input: UnblockTaskInput): Promise<UnblockTaskResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const snapshot = withTransaction(db, (): UnblockTaskResult => {
    // ① 行解析（agent 面 TaskRef UNIQUE(slug, local_id) 查捞——身份双轨自然键侧，submit 同源）
    const row = resolveTaskRef(db, input.projectId, input.taskRef)

    // ② reason 必带（先于转移校验——transitionTask/submitTask 输入面校验同序）
    if ((input.reason ?? '').trim() === '') {
      throw new ReasonRequiredError({ verb: 'unblockTask' })
    }

    // ③ agent 面矩阵先验（blocked→pending 唯一入口格——pending/in_progress/终态卡调用即拒）
    assertTransitionAllowed(row.task_status, 'pending', 'agent')

    // ④ 写前相位增量断言（受影响 feature——漂移即整体回滚；律四：proposal 容器无相位域跳过）
    const feature = resolvePhaseGuardFeature(db, row)
    if (feature !== undefined) {
      const before = readPhaseInput(db, feature.id)
      assertPhaseInvariant({
        featureStatus: feature.feature_status,
        docKinds: before.docKinds,
        taskStatuses: before.taskStatuses,
        featureSlug: feature.slug,
      })
    }

    // ⑤ 转移 + 'unblock' 审计行（复用 submit 记录管道语义——reason 落 append-only 记录为审计单源；
    //    blocked_reason 列不在写面，与 transitionTask/submitTask 同裁决）
    const toStatus = 'pending' as const
    db.prepare(`UPDATE tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(toStatus, now, row.id)
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, summary, actor, session_id, created_at, updated_at)
       VALUES (?, 'unblock', ?, ?, ?, NULL, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, row.task_status, toStatus, input.reason, input.sessionId ?? null, now, now)

    // ⑥ 恢复钩子：不挂——pending ∉ SATISFYING_TASK_STATUSES {completed, skipped}，结构性不触发（留档）

    // ⑦ 相位重算（§6-29 触发器清单同族——blocked→pending 改变活跃集分布：blocked ∈ 活跃，
    //    pending 非活跃非终态 → 相位可能回退 in-progress→tasks，快照诚实）
    if (feature !== undefined) {
      const after = readPhaseInput(db, feature.id)
      const derived = deriveFeaturePhase({
        current: feature.feature_status,
        docKinds: after.docKinds,
        taskStatuses: after.taskStatuses,
      })
      if (derived !== feature.feature_status) {
        db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
          derived,
          now,
          feature.id,
        )
      }
    }

    // ⑧ 出参（submit 瘦身出参同形——零 restored：pending 不挂恢复钩子）
    return { taskId: row.id, status: 'pending' }
  })

  // 事务提交后 emitTasksChanged（四域写后事件——单写闭包单事件）
  deps.events.emitTasksChanged(input.projectId)
  return snapshot
}
