// updateTask——任务域主 agent 修改动词（main-agent-task-tools 1.1；提案 §Solution①）。
// 定位：业务（forge/tasks 子域）。import 边：→ forge/workspace/（共享句柄/事件）与同域
// errors/add/query；四域互禁 import 彼此（Hard Rule），不触 project-service。
//
// 定位口径同 queryTask/submitTask：TaskRef = slug + localId（UNIQUE(slug, local_id) 查捞），
// 返回更新后快照（同 transitionTask 返回口径）。
//
// 宽字段面 partial 语义：title/type/priority/estimated_time/complexity/task_desc/
// acceptance_criteria/vars/depends_on 给定即改、未给不动。
//
// 状态门（统一判据：无 worker 持有 ∧ 未落结算审计）：pending/blocked/suspended 可改；
// in_progress/interrupted（简报已被 worker 消费——改写致重入不一致）与 completed/skipped/
// rejected（已落结算——改写 = 历史失真）拒 → ERR_TASK_LOCKED。门校验与写入同事务
// （单事务全成全败——与 claimTask 串行化，提案 Risk 1）。
//
// depends_on 改写护栏（仅整体改写径）：仅作用于 manual 边——任务持 fix-chain/autoconfig 派生出
// 边即拒（ERR_TASK_EDGE_ORIGIN_LOCKED，链机械持有）；改写 = 删旧 manual 边 → 复用 addTask 增量
// 环校验（findPathThroughOutEdges 单源——§6-14 可达性 DFS）→ 插新 manual 边，引环即拒
// 整体回滚（删除随事务回滚零残留）。depends_on_append 增量白通道（loop-phase-gate §2.6/提案④）：
// 无锁边护栏、零删除、INSERT OR IGNORE 幂等插 manual 边、增量环校验与恢复钩子两径共用；
// 与 dependsOn 互斥（并存 = 输入契约拒绝）。
//
// 审计：task_records append verb='updateTask' 行（actor='plugin-tool'——tool 专属动词，
// 通道即 actor，同 addTask 口径）。blocked 卡 depends_on 改写后同事务补跑恢复判定
// （restoreBlockedWaiter——提案 task-pause-primitive §2.2-1），前置全满足即恢复 pending。
// 闭包尾部（提交后）emitTasksChanged。一律 prepared
// statements（Hard Rule）。任务状态不改 → 相位域不变（相位推导机输入 = docKinds +
// taskStatuses），守卫与重算整体跳过。
import type { TaskSnapshot, TaskStatus, UpdateTaskInput } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { TasksVerbDeps } from './add.js'
import { findPathThroughOutEdges, naturalKeysByIds } from './add.js'
import { CycleDetectedError, EdgeOriginLockedError, TaskLockedError, TaskNotFoundError } from './errors.js'
import { resolveTaskRef, toTaskSnapshot } from './query.js'
import { restoreBlockedWaiter } from './transition.js'

/** 可改状态门（提案裁决：pending/blocked/suspended——无 worker 持有 ∧ 未落结算审计） */
const UPDATABLE_TASK_STATUSES: readonly TaskStatus[] = ['pending', 'blocked', 'suspended']

/** 同容器边解析的行键面（依赖前置定位最小形状——addTask TaskKeyRow 同族窄投影） */
interface DepKeyRow {
  id: string
  slug: string
  local_id: string
  source_kind: 'feature' | 'proposal'
  source_id: string
}

/** Interface 1 updateTask：宽字段 partial 改写 + 状态门 + dependsOn 护栏/环校验 + updateTask 审计 */
export async function updateTask(deps: TasksVerbDeps, input: UpdateTaskInput): Promise<TaskSnapshot> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const snapshot = withTransaction(db, (): TaskSnapshot => {
    // ① 行解析（agent 面 TaskRef 查捞——身份双轨自然键侧；未命中 ERR_TASK_NOT_FOUND）
    const row = resolveTaskRef(db, input.projectId, input.taskRef)

    // ② 状态门（同事务内、任何写入前——与 claimTask 串行化）：六锁定态拒
    if (!(UPDATABLE_TASK_STATUSES as readonly string[]).includes(row.task_status)) {
      throw new TaskLockedError({
        projectId: input.projectId,
        taskRef: input.taskRef,
        taskStatus: row.task_status,
      })
    }

    // ③ 依赖段（两径分派——loop-phase-gate §2.6 白通道）：
    //    - dependsOn：整体置换语义（删旧 manual 边 → 增量环校验 → 插新 manual 边）——语义逐字节不变；
    //    - dependsOnAppend：manual 边增量追加（提案④白通道）——无锁边护栏（派生边不动，锁的本意
    //      「防改写破坏链机械」不受损）、零删除、INSERT OR IGNORE 幂等插边、增量环校验共用、
    //      blocked 恢复钩子同跑；
    //    - 两参并存 → 输入契约拒绝（语义歧义——一次调用一个意图）；两者皆缺席 → 依赖段整体跳过。
    if (input.dependsOn !== undefined && input.dependsOnAppend !== undefined) {
      throw new Error(
        'dependsOn 与 dependsOnAppend 并存：一次调用一个意图（整体置换 vs 增量追加语义歧义——输入契约违例）',
      )
    }
    const appendList = input.dependsOnAppend
    if (input.dependsOn !== undefined || appendList !== undefined) {
      const dependsOnList = input.dependsOn ?? (appendList as string[])
      // ③-a 护栏（仅整体改写径）：仅 manual 边可改写——fix-chain/autoconfig 派生出边在场即拒
      //      （链机械持有）；append 径跳过该护栏——既有派生边不动
      if (appendList === undefined) {
        const outEdges = db
          .prepare<unknown[], { origin: 'manual' | 'fix-chain' | 'autoconfig' }>(
            `SELECT origin FROM task_edges WHERE task_id = ?`,
          )
          .all(row.id)
        const lockedOrigins = outEdges
          .map((e) => e.origin)
          .filter((o): o is 'fix-chain' | 'autoconfig' => o !== 'manual')
        if (lockedOrigins.length > 0) {
          throw new EdgeOriginLockedError({
            projectId: input.projectId,
            taskRef: input.taskRef,
            origins: lockedOrigins,
          })
        }
      }

      // ③-b 前置解析（同容器归属——task_edges 两端 source_id 相等服务不变量，撞键按未命中口径；
      //      两径共用同段解析与 TaskNotFoundError 口径）
      const depends: DepKeyRow[] = []
      for (const localId of dependsOnList) {
        const dep = db
          .prepare<unknown[], DepKeyRow>(
            `SELECT id, slug, local_id, source_kind, source_id FROM tasks WHERE slug = ? AND local_id = ?`,
          )
          .get(row.slug, localId)
        if (dep === undefined || dep.source_kind !== row.source_kind || dep.source_id !== row.source_id) {
          // 未命中 / 命中他容器同键 = 同容器边服务不变量不满足——按未命中口径（addTask ④ 同规）
          throw new TaskNotFoundError({
            projectId: input.projectId,
            taskRef: { slug: row.slug, localId },
            featureSlug: row.slug,
          })
        }
        depends.push(dep)
      }

      // ③-c 删旧 manual 边（仅整体改写径执行——护栏已过，本任务全部出边均 manual；append 径零删除）
      if (appendList === undefined) {
        db.prepare(`DELETE FROM task_edges WHERE task_id = ? AND origin = 'manual'`).run(row.id)
      }

      // ③-d 增量环校验（§6-14 复用 addTask 单源——自各 D 沿既有出边可达性 DFS 找本任务，两径共用：
      //      改写径删除后校验 = 改写后拓扑精确判定；append 径对既有拓扑增量判定——新边 (T←D) 成环
      //      ⟺ D 经既有出边可达 T；命中即 ERR_CYCLE_DETECTED 回报完整环路径）
      for (const d of depends) {
        const hopPath = d.id === row.id ? [d.id] : findPathThroughOutEdges(db, d.id, row.id)
        if (hopPath !== null) {
          const keys = naturalKeysByIds(db, [row.id, ...hopPath])
          const rowKey = keys.get(row.id) ?? `${row.slug}/${row.local_id}`
          throw new CycleDetectedError({ cycle: [rowKey, ...hopPath.map((id) => keys.get(id) ?? id)] })
        }
      }

      // ③-e 插 manual 边：改写径 = 显式 INSERT（PK 冲突 = 防御面——③-c 已删旧，正常改写零冲突、
      //      报错口径保持）；append 径 = INSERT OR IGNORE（同边重复追加 = 幂等成功，与 fix-chain
      //      边幂等口径 addTask ⑩ 对齐）
      const insertEdge = db.prepare(
        appendList === undefined
          ? `INSERT INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
             VALUES (?, ?, 'manual', ?, ?)`
          : `INSERT OR IGNORE INTO task_edges (task_id, prerequisite_id, origin, created_at, updated_at)
             VALUES (?, ?, 'manual', ?, ?)`,
      )
      for (const dep of depends) {
        insertEdge.run(row.id, dep.id, now, now)
      }

      // ③-f 恢复钩子补跑（提案 task-pause-primitive §2.2-1；两径同跑——append 径 blocked 卡补边后
      //      前置全满足即恢复，restoreBlockedWaiter 单源）：同事务判定——前置全满足则立即恢复
      //      pending（auto-restore 记录 actor='core' 落时间线）；前置仍有未满足项则原样保持
      //      blocked（不报错）。非 blocked 卡不动（pending 本就可领取、suspended 归 resume 序管辖）。
      if (row.task_status === 'blocked') {
        restoreBlockedWaiter(db, row.id, now)
      }
    }

    // ④ 宽字段 partial UPDATE（给定即改、未给不动；updated_at 单点刷新）
    const sets: string[] = []
    const args: unknown[] = []
    if (input.title !== undefined) {
      sets.push('title = ?')
      args.push(input.title)
    }
    if (input.type !== undefined) {
      sets.push('task_type = ?')
      args.push(input.type)
    }
    if (input.priority !== undefined) {
      sets.push('priority = ?')
      args.push(input.priority)
    }
    if (input.estimatedTime !== undefined) {
      sets.push('estimated_time = ?')
      args.push(input.estimatedTime)
    }
    if (input.complexity !== undefined) {
      sets.push('complexity = ?')
      args.push(input.complexity)
    }
    if (input.taskDesc !== undefined) {
      sets.push('task_desc = ?')
      args.push(input.taskDesc)
    }
    if (input.acceptanceCriteria !== undefined) {
      sets.push('ac_json = ?')
      args.push(JSON.stringify(input.acceptanceCriteria))
    }
    if (input.vars !== undefined) {
      sets.push('vars_json = ?')
      args.push(JSON.stringify(input.vars))
    }
    sets.push('updated_at = ?')
    args.push(now, row.id)
    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...args)

    // ⑤ 审计行：updateTask（actor='plugin-tool'——tool 专属动词，通道即 actor；无 from/to）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, actor, created_at, updated_at)
       VALUES (?, 'updateTask', 'plugin-tool', ?, ?)`,
    ).run(row.id, now, now)

    // ⑥ 快照（写后重读——updatedAt 等新值）
    return toTaskSnapshot(resolveTaskRef(db, input.projectId, input.taskRef))
  })

  // 事务提交后 emitTasksChanged（四域写后事件——单写闭包单事件）
  deps.events.emitTasksChanged(input.projectId)
  return snapshot
}
