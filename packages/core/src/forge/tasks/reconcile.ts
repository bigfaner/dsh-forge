// reconcileInterrupted——任务域启动对账动词（S3·run-tasks-host-command；implementation-blueprint
// §2/图 D：进程重启 → 插件装配 → 本动词状态真化）。定位：业务（forge/tasks 子域）。import 边：
// → forge/workspace/（共享句柄/事件）与同域 errors/phase-deriver/query/state-machine；四域互禁
// import 彼此（Hard Rule）。actor='core'（三值词汇既设——core 驱动的非通道动词，非 tool 非 UI）。
//
// 三重收敛判据（proposal.md S3 / SC3 / R6）：
//   ① status = 'in_progress'
//   ② 最新 claim 记录（task_records，append-only——id 最大 claim 行）带循环来源标记
//     （loop_sourced = 1，TASK_RECORD_LOOP_SOURCED contracts 单点定义）
//   ③ 进程内循环登记表空（registryEmpty 入参——插件装配时点恒真：重启即空；活循环在场 =
//     false 短路零写入，防真化活循环在飞任务）
// 三者齐备 → status='interrupted' + transition 记录（reason=进程重启）。
//
// 缓切隔离（R6）：skill 会话路线 claim 记录无标记 → 谓词不命中 → 幂等重入语义不变
// （links 两路线同形——均挂真实会话 id，GUI jump 天然工作）。
//
// 单事务全成全败（Hard Rule）：行集解析 → 逐行转移先验（agent 面矩阵新边）+ 写前相位增量
// 断言（interrupted ∈ 活跃判定集——in_progress → interrupted 推导不动点；漂移即整体回滚）→
// 转移 UPDATE + transition 记录 → 受影响 feature 相位重算（律四：proposal 容器无相位域跳过）；
// 闭包尾部（提交后）emitTasksChanged（零命中 = 纯读零写入不发射）。一律 prepared statements
// （Hard Rule）。
import type { FeatureStatus } from '@dsh-forge/contracts'
import type {
  ReconcileInterruptedInput,
  ReconcileInterruptedResult,
  TaskRef,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { readPhaseInput, type TasksVerbDeps } from './add.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { TASK_COLUMNS, resolvePhaseGuardFeature, type TaskStorageRow } from './query.js'
import { assertTransitionAllowed } from './state-machine.js'

export type { TasksVerbDeps }

/** 对账命中行解析（in_progress ∧ 最新 claim 行 loop_sourced=1；无 claim 行 = NULL 不命中——
 *  record-chain 不变量下不可达，防御面照旧）。中断序：updated_at 升序 + id 升序决胜
 *  （「最早中断优先」——循环逐个恢复的取数序同源）。 */
const RECONCILE_TARGETS_SQL = `SELECT ${TASK_COLUMNS} FROM tasks t
 WHERE t.task_status = 'in_progress'
   AND (SELECT r.loop_sourced FROM task_records r
        WHERE r.task_id = t.id AND r.verb = 'claim'
        ORDER BY r.id DESC LIMIT 1) = 1
 ORDER BY t.updated_at, t.id`

/** 相位守卫目标（resolvePhaseGuardFeature 返回形状——touchedFeatures 集合载体） */
interface PhaseGuardFeature {
  readonly id: string
  readonly slug: string
  readonly feature_status: FeatureStatus
}

/**
 * Interface 1 reconcileInterrupted：三重收敛判据状态真化（详见文件头）。
 * 返回 reconciled = 被真化 interrupted 的任务自然键（中断序）；零命中/registryEmpty=false
 * = 空报告零写入（幂等——重复调用收敛）。
 */
export async function reconcileInterrupted(
  deps: TasksVerbDeps,
  input: ReconcileInterruptedInput,
): Promise<ReconcileInterruptedResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  // 判据③ 短路：登记表非空 = 有活循环可能持有在飞任务——不对账（零写入零事件）
  if (!input.registryEmpty) return { reconciled: [] }

  const result = withTransaction(db, (): ReconcileInterruptedResult => {
    const rows = db.prepare<unknown[], TaskStorageRow>(RECONCILE_TARGETS_SQL).all()
    if (rows.length === 0) return { reconciled: [] }

    const flip = db.prepare(`UPDATE tasks SET task_status = 'interrupted', updated_at = ? WHERE id = ?`)
    const insertRecord = db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, reason, actor, created_at, updated_at)
       VALUES (?, 'transition', 'in_progress', 'interrupted', '进程重启', 'core', ?, ?)`,
    )

    const reconciled: TaskRef[] = []
    const touchedFeatures = new Map<string, PhaseGuardFeature>()
    for (const row of rows) {
      // 转移先验（agent 面——in_progress → interrupted 矩阵边；非法格拒绝同 claim/transition 口径）
      assertTransitionAllowed(row.task_status, 'interrupted', 'agent')

      // 写前相位增量断言（受影响 feature——漂移即整体回滚；律四：proposal 容器无相位域跳过）
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

      flip.run(now, row.id)
      insertRecord.run(row.id, now, now)
      reconciled.push({ slug: row.slug, localId: row.local_id })
      if (feature !== undefined) touchedFeatures.set(feature.id, feature)
    }

    // 相位重算（受影响 feature——interrupted ∈ 活跃判定集，推导不动点理论恒真；重算保持
    // 写动词闭包统一纪律，漂移即红）
    for (const feature of touchedFeatures.values()) {
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

    return { reconciled }
  })

  // 事务提交后 emitTasksChanged（写动词闭包尾部——零命中纯读不发射）
  if (result.reconciled.length > 0) deps.events.emitTasksChanged(input.projectId)
  return result
}
