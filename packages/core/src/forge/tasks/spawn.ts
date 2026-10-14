// recordSpawn——spawn 审计动词（执行会话事实诞生即入库；⟞ 打开链库侧单源的写入侧）。
// 定位：dispatchTask 复合动词的内部审计径（plugin-forge spawnClaimed 成功即调）——
// 零状态效应（不转移、不重算相位、不写 links），仅 task_records append 一行
// verb='spawn' / session_id = worker 子会话 id。此前执行会话首次落库在 submit——
// 进行中任务无执行会话行，UI 只能账本父反查启发式解析（进行中 worker 同父多子时错乱，
// bug 661bce2b）。claim 幂等重入再派发时旧行保留（append-only），执行会话解析取最新行。
import type { RecordSpawnInput } from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import type { TasksVerbDeps } from './add.js'
import { resolveTaskById } from './query.js'

/** Interface 1 recordSpawn：任务行解析（未命中 ERR_TASK_NOT_FOUND——resolveTaskById 单一拒绝面）
 *  + spawn 记录单事务落库 */
export async function recordSpawn(deps: TasksVerbDeps, input: RecordSpawnInput): Promise<void> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()
  withTransaction(db, () => {
    const row = resolveTaskById(db, input.projectId, input.taskId)
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, session_id, created_at, updated_at)
       VALUES (?, 'spawn', NULL, NULL, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, input.sessionId, now, now)
  })
  // 写后事件（sessionLinks/taskDetail 时间线刷新——四域写后事件 tasks 侧同口径）
  deps.events.emitTasksChanged(input.projectId)
}
