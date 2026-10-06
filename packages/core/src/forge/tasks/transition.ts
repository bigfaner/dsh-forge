// transitionTask——任务域人工转移面（任务 2.5；tech-design §Interface 1 L110-112 + §Interface 10
// 「提前校验 + 所见即所得」+ db-schema §3.1 人类通道 + §6-26 逃生通道裁决）。定位：业务
// （forge/tasks 子域）。import 边：→ forge/workspace/（共享句柄/事件）与同域 errors/
// state-machine/phase-deriver/query（行形状与身份解析单源）；四域互禁 import 彼此。
//
// 人类通道语义（§6-26）：from≠to 任意转移（七态 − 当前态——human 面目标集）+ reason 必带
// （ERR_REASON_REQUIRED）；UI 专属（actor='ui' 由通道推断——RPC 人类面恒定，输入面不收）；
// 不进 plugin tool 面（3.2 审计锚——SC7 代码审计无 transitionTask tool 注册）。
//
// 单事务全成全败（Hard Rule）：行解析 → reason 校验 → 提前校验（assertTransitionAllowed
// 单源——UI 菜单与服务端同一纯函数零漂移）→ 写前相位增量断言 → 转移 UPDATE → transition
// 记录 → 恢复钩子（→completed/skipped 同挂——C3 与 submitTask 钩子同族，2.4 复用本导出）→
// 相位重算；闭包尾部（提交后）emitTasksChanged。一律 prepared statements。
import type Database from 'better-sqlite3'
import type { FeatureStatus, TaskRef, TaskSnapshot, TaskStatus, TransitionTaskInput } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { readPhaseInput, type TasksVerbDeps } from './add.js'
import { ReasonRequiredError } from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { resolveTaskById, toTaskSnapshot } from './query.js'
import { assertTransitionAllowed, SATISFYING_TASK_STATUSES } from './state-machine.js'

export type { TasksVerbDeps }

/** 恢复钩子反查行（idx_edges_prerequisite 物理加速——§6-19 机制统一） */
interface WaiterEdgeRow {
  readonly task_id: string
}

/** 恢复候选行（blocked 后继——slug/localId 承载 TaskRef 返回） */
interface WaiterTaskRow {
  readonly id: string
  readonly slug: string
  readonly local_id: string
  readonly task_status: TaskStatus
}

/**
 * 恢复钩子（C3：与 submitTask 钩子同族——2.4 submit.ts 复用本导出，单一实现）。
 * 语义（db-schema §4「(submit 钩子)」行 + §6-5/§6-19）：反查 idx_edges_prerequisite 取
 * 后继 → 后继 blocked 且前置**全** ∈ 满足集 {completed, skipped} → blocked→pending +
 * auto-restore 记录（actor='core'）；**边不删**（满足 = 读时派生）；非 blocked 后继不动。
 * 调用方保证：事务内执行 + 满足集终态已落库（本钩子只反查不改判定集）。
 */
export function runRestoreHook(
  db: Database.Database,
  input: { satisfiedTaskId: string; now: string },
): TaskRef[] {
  const waiterIds = db
    .prepare<unknown[], WaiterEdgeRow>(`SELECT task_id FROM task_edges WHERE prerequisite_id = ? ORDER BY task_id`)
    .all(input.satisfiedTaskId)
  if (waiterIds.length === 0) return []

  const waiterById = db.prepare<unknown[], WaiterTaskRow>(
    `SELECT id, slug, local_id, task_status FROM tasks WHERE id = ?`,
  )
  const statusById = db.prepare<unknown[], { task_status: TaskStatus }>(`SELECT task_status FROM tasks WHERE id = ?`)
  const prereqIdsOf = db.prepare<unknown[], { prerequisite_id: string }>(
    `SELECT prerequisite_id FROM task_edges WHERE task_id = ?`,
  )
  const restoreWaiter = db.prepare(`UPDATE tasks SET task_status = 'pending', updated_at = ? WHERE id = ?`)
  const insertAutoRestore = db.prepare(
    `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
     VALUES (?, 'auto-restore', 'blocked', 'pending', 'core', ?, ?)`,
  )

  const restored: TaskRef[] = []
  for (const { task_id: waiterId } of waiterIds) {
    const waiter = waiterById.get(waiterId)
    if (waiter === undefined || waiter.task_status !== 'blocked') continue // 只动 blocked（pending/in_progress 不需恢复）
    const prereqs = prereqIdsOf.all(waiterId)
    const allSatisfied = prereqs.every((p) => {
      const status = statusById.get(p.prerequisite_id)?.task_status
      return status !== undefined && (SATISFYING_TASK_STATUSES as readonly string[]).includes(status)
    })
    if (!allSatisfied) continue // 前置全满足才恢复（§6-4 满足集——rejected 不满足）
    restoreWaiter.run(input.now, waiterId)
    insertAutoRestore.run(waiterId, input.now, input.now)
    restored.push({ slug: waiter.slug, localId: waiter.local_id })
  }
  return restored
}

/** Interface 1 transitionTask：人工纠偏面（提前校验 + reason 必带 + 终态恢复钩子 + 相位重算） */
export async function transitionTask(deps: TasksVerbDeps, input: TransitionTaskInput): Promise<TaskSnapshot> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const snapshot = withTransaction(db, (): TaskSnapshot => {
    // ① 行解析（UI/RPC 面 id 直查——身份双轨 id 侧）
    const row = resolveTaskById(db, input.projectId, input.taskId)

    // ② reason 必带（400 先于转移校验——输入面校验前置；与 transitionFeature 同序）
    if (input.reason.trim() === '') {
      throw new ReasonRequiredError({ verb: 'transitionTask' })
    }

    // ③ 提前校验（Interface 10）：toStatus ∈ transitionTargets(current,'human')——与 UI 菜单
    //    （taskDetail.allowedTransitions）同一纯函数，零漂移；to === current 同路拒绝
    assertTransitionAllowed(row.task_status, input.toStatus, 'human')

    // ④ 写前相位增量断言（受影响 feature——漂移即整体回滚，承重防护）
    const feature = db
      .prepare<unknown[], { id: string; slug: string; feature_status: FeatureStatus }>(
        `SELECT id, slug, feature_status FROM features WHERE id = ?`,
      )
      .get(row.feature_id)
    if (feature === undefined) {
      // FK 保证不可达（tasks.feature_id REFERENCES features——开库 foreign_key_check 兜底）——
      // 数据漂移防御面：fail-loud 整体回滚（与 addTask sourceAncestry 环防御同口径）
      throw new Error(`feature 行缺席（FK 漂移）：${row.feature_id}`)
    }
    const before = readPhaseInput(db, row.feature_id)
    assertPhaseInvariant({
      featureStatus: feature.feature_status,
      docKinds: before.docKinds,
      taskStatuses: before.taskStatuses,
      featureSlug: feature.slug,
    })

    // ⑤ 转移 + transition 记录（actor='ui'——通道推断；reason 审计列必带）
    db.prepare(`UPDATE tasks SET task_status = ?, updated_at = ? WHERE id = ?`).run(input.toStatus, now, row.id)
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, actor, created_at, updated_at)
       VALUES (?, 'transition', ?, ?, ?, 'ui', ?, ?)`,
    ).run(row.id, row.task_status, input.toStatus, input.reason, now, now)

    // ⑥ 恢复钩子（C3）：→completed/skipped 同挂（满足集双终态；rejected 不满足不触发）
    if ((SATISFYING_TASK_STATUSES as readonly string[]).includes(input.toStatus)) {
      runRestoreHook(db, { satisfiedTaskId: row.id, now })
    }

    // ⑦ 相位重算（§6-29 触发器清单含 transitionTask——人类 skip/reject 改变任务分布；
    //    恢复钩子同事务同 feature——同 feature 边服务不变量下单一受影响 feature）
    const after = readPhaseInput(db, row.feature_id)
    const derived = deriveFeaturePhase({
      current: feature.feature_status,
      docKinds: after.docKinds,
      taskStatuses: after.taskStatuses,
    })
    if (derived !== feature.feature_status) {
      db.prepare(`UPDATE features SET feature_status = ?, updated_at = ? WHERE id = ?`).run(
        derived,
        now,
        row.feature_id,
      )
    }

    // ⑧ 快照（写后重读——taskStatus/updatedAt 新值）
    return toTaskSnapshot(resolveTaskById(db, input.projectId, input.taskId))
  })

  // 事务提交后 emitTasksChanged（四域写后事件——单写闭包单事件，恢复钩子内聚不另发）
  deps.events.emitTasksChanged(input.projectId)
  return snapshot
}
