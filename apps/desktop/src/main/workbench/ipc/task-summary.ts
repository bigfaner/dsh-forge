// workbench/ipc/task-summary — TaskSummary DTO 映射器(任务 1.3 抽出)。
//
// task_snapshot 行 → TaskSummary 的映射原为 services.ts 私有函数(M2 任务
// 2.7);M3 读路由双分支(files → task_snapshot / sqlite → task 权威表)
// 需要在 services.ts 与 tasks/task-service.ts 两侧共用同一 DTO 口径,故
// 抽出为独立模块(零循环依赖:两侧均为纯函数消费)。字段权威 =
// tech-design §Interface 1 TaskSummary;M3 增量 = 可选 `updatedBy`
// (权威通道的 actor 审计列投影,files 分支缺省不携带)。

import type { TaskSnapshot } from '../repos/types.ts'
import type { AuthoritativeTask } from '../tasks/task-repo.ts'
import type { ChangeSource } from '../repos/types.ts'
import type { TaskSummary } from './types.ts'

/** task_snapshot 行 → TaskSummary(M2 行为不变:剥离 projectId,无 updatedBy)。 */
export function toTaskSummary(snapshot: TaskSnapshot): TaskSummary {
  return {
    key: snapshot.taskKey,
    title: snapshot.title,
    status: snapshot.status,
    featureSlug: snapshot.featureSlug,
    blockers: [...snapshot.blockers],
    branch: snapshot.branch,
    worktree: snapshot.worktree,
    source: snapshot.source,
    updatedAt: snapshot.updatedAt,
  }
}

/**
 * updated_by → v1 source 词表的逆向投影(权威化演进的读面):
 * session:\<id\> → session;external → terminal(「终端」来源收敛为外部
 * 通道的 M3 语义);kernel/派发者 → null。
 */
export function actorSourceOf(actor: string): ChangeSource | null {
  if (actor.startsWith('session:')) return 'session'
  if (actor === 'external') return 'terminal'
  return null
}

/** 权威 task 行 → TaskSummary(sqlite 读路由分支;携带 updatedBy 审计投影)。 */
export function toTaskSummaryFromAuthoritative(task: AuthoritativeTask): TaskSummary {
  return {
    key: task.taskKey,
    title: task.title,
    status: task.status,
    featureSlug: task.featureSlug,
    blockers: [...task.blockers],
    branch: task.branch,
    worktree: task.worktree,
    source: actorSourceOf(task.updatedBy),
    updatedAt: task.updatedAt,
    updatedBy: task.updatedBy,
  }
}
