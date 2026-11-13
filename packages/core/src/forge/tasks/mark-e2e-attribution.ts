// markE2eAttribution——E2E 归因卡生成侧标记动词（loop-phase-gate §2.9——CE-6 方案 A 写入径）。
// 定位：业务（forge/tasks 子域）。归因卡生成点（plugin-forge issueAttributionCard）在 addTask
// 返回后调用——后置 UPDATE tasks.e2e_attribution = 1（生成侧机械事实单点写；标记不经 addTask
// 参数暴露——contracts AddTaskInput 硬约束）。零状态效应（不转移、不重算相位、不写 records）；
// 未命中 fail-loud（resolveTaskRef 单一拒绝面 ERR_TASK_NOT_FOUND——归因卡无标记等于无豁免）；
// 幂等重写无害（UPDATE 恒置 1）。
import type { MarkE2eAttributionInput } from '@dsh-forge/contracts'
import type { TasksVerbDeps } from './add.js'
import { resolveTaskRef } from './query.js'

/** Interface 1 markE2eAttribution：行解析（未命中 ERR_TASK_NOT_FOUND）+ 标记列后置 UPDATE */
export async function markE2eAttribution(deps: TasksVerbDeps, input: MarkE2eAttributionInput): Promise<void> {
  const db = deps.store.ensureOpen(input.projectId)
  const row = resolveTaskRef(db, input.projectId, { slug: input.slug, localId: input.localId })
  db.prepare(`UPDATE tasks SET e2e_attribution = 1 WHERE id = ?`).run(row.id)
  // 写后事件（sessionLinks/taskDetail 时间线刷新——四域写后事件 tasks 侧同口径）
  deps.events.emitTasksChanged(input.projectId)
}
