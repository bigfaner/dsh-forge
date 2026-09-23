// workbench/tasks/deps — 依赖解析(任务 1.2)。
// 移植基准唯一 = forge-cli pkg/task/deps.go,逐函数核对:
//   ResolveWildcardDep / satisfiedStatuses / IsDepSatisfied / GetUnmetDeps。
// 权威语义(Go 源 + TestCheckTransitionDeps_RejectedDoesNotSatisfy):
// 仅 completed/skipped 满足依赖;rejected 不满足(任务 AC-2 括注与 Go 冲突,
// 按 Hard Rule 以 Go 为准 —— 对拍 baseline 已锁定该行为)。

import { ID_SUFFIX_WILDCARD, isBusinessTask, type TaskIndex } from './model.ts'

/** 通配依赖解析结果(matches 空数组 = 通配无匹配,不是悬空)。 */
export interface WildcardResolution {
  readonly matches: readonly string[]
  readonly isWildcard: boolean
}

/**
 * 解析单条依赖:以 `.x` 结尾 = 通配(`1.x` → 前缀 `1.` 下的全部业务任务,
 * 排除 gate/summary/T- 管线);否则按精确依赖原样返回。Go 语义:通配匹配
 * 基于 Task.ID 前缀;匹配顺序 = 索引迭代顺序(Go map 无序,TS 为插入序)。
 */
export function resolveWildcardDep(index: TaskIndex, dep: string): WildcardResolution {
  if (!dep.endsWith(ID_SUFFIX_WILDCARD)) {
    return { matches: [dep], isWildcard: false }
  }
  const prefix = dep.slice(0, -ID_SUFFIX_WILDCARD.length)
  const prefixWithDot = `${prefix}.`
  const matches: string[] = []
  for (const t of index.tasksMap().values()) {
    if (t.id.startsWith(prefixWithDot) && isBusinessTask(t.id)) matches.push(t.id)
  }
  return { matches, isWildcard: true }
}

/** 满足依赖检查的状态集(Go satisfiedStatuses:completed + skipped,无 rejected)。 */
const SATISFIED_STATUSES = new Set(['completed', 'skipped'])

/** 给定状态是否满足依赖。 */
export function isDepSatisfied(status: string): boolean {
  return SATISFIED_STATUSES.has(status)
}

function appendUnmet(unmet: string[] | null, id: string): string[] {
  if (unmet === null) return [id]
  unmet.push(id)
  return unmet
}

/**
 * 返回未满足的具体依赖 ID(Go GetUnmetDeps):
 *   - 通配依赖展开为匹配的业务任务,展开序 = 索引迭代序(Go 无序;
 *     对拍比较按多重集归一);
 *   - selfID 从通配展开中排除(防自依赖);
 *   - 精确依赖在索引中不存在 = 未满足(悬空原词上报,不改写);
 *   - 无未满足时返回 null(对应 Go nil slice)。
 */
export function getUnmetDeps(index: TaskIndex, selfId: string, deps: readonly string[] | undefined): string[] | null {
  let unmet: string[] | null = null
  for (const dep of deps ?? []) {
    const { matches, isWildcard } = resolveWildcardDep(index, dep)
    if (isWildcard) {
      for (const matchId of matches) {
        if (matchId === selfId) continue
        const t = index.byId(matchId)
        if (t === undefined || !isDepSatisfied(t.status)) unmet = appendUnmet(unmet, matchId)
      }
    } else {
      const t = index.byId(dep)
      if (t === undefined || !isDepSatisfied(t.status)) unmet = appendUnmet(unmet, dep)
    }
  }
  return unmet
}
