// workbench/tasks/toposort — 拓扑排序(任务 1.2)。
// 移植基准唯一 = forge-cli pkg/task/toposort.go,逐函数核对:
//   TopologicalSort(Kahn + 自然序最小堆)/ expandDeps / setToSortedSlice
//   / idQueue(push 上浮 / pop 下沉,与 Go 堆行为逐行一致)。
// 确定性:ordered/cycles/missing 均为确定性输出(Go 侧亦然),对拍按
// 严格序断言;expandDeps 对通配自引用保留边(供 Kahn 检出环),与
// getUnmetDeps 的自排除语义相反 —— 两者都是 Go 原语义。

import { resolveWildcardDep } from './deps.ts'
import { byNaturalId, type TaskIndex } from './model.ts'

/** 拓扑排序产物:ordered(依赖在前)/ cycles(环成员)/ missing(悬空依赖,原词)。 */
export interface TopologicalSortResult {
  readonly ordered: readonly string[]
  readonly cycles: readonly string[]
  readonly missing: readonly string[]
}

/**
 * 对索引内任务做拓扑排序(Kahn 算法)。同级任务按自然 ID 排序保证确定性;
 * 通配依赖(`1.x`)先经 resolveWildcardDep 展开再建邻接表;输入不被修改。
 */
export function topologicalSort(idx: TaskIndex): TopologicalSortResult {
  const tasks = idx.tasksMap()
  if (tasks.size === 0) {
    return { ordered: [], cycles: [], missing: [] }
  }

  // 以 Task.ID 为规范键(map key 可能与 ID 不同)
  const allIds: string[] = []
  for (const t of tasks.values()) allIds.push(t.id)

  // 邻接表 + 入度:adjacency[a] = [b, c] 表示 a 必须先于 b、c
  const adjacency = new Map<string, string[]>()
  const inDegree = new Map<string, number>()
  for (const id of allIds) inDegree.set(id, 0)

  // 汇总全部悬空依赖(跨任务去重)
  const missingSet = new Set<string>()

  for (const id of allIds) {
    const t = idx.byId(id)
    if (t === undefined) continue // 不可达:allIds 来自索引自身
    const expanded = expandDeps(idx, t.dependencies ?? [], id, missingSet)
    for (const dep of expanded) {
      const list = adjacency.get(dep)
      if (list === undefined) adjacency.set(dep, [id])
      else list.push(id)
      inDegree.set(id, (inDegree.get(id) ?? 0) + 1)
    }
  }

  const missing = missingSet.size > 0 ? setToSortedSlice(missingSet) : []

  // Kahn + 自然序最小堆(确定性输出)
  const queue = new IdQueue()
  for (const id of allIds) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id)
  }

  const ordered: string[] = []
  while (queue.len() > 0) {
    const node = queue.pop()
    ordered.push(node)
    for (const neighbor of adjacency.get(node) ?? []) {
      const next = (inDegree.get(neighbor) ?? 0) - 1
      inDegree.set(neighbor, next)
      if (next === 0) queue.push(neighbor)
    }
  }

  // 入度仍 > 0 的节点 = 环成员(自然序输出)
  const cycles = allIds.filter(id => (inDegree.get(id) ?? 0) > 0)
  if (cycles.length > 0) cycles.sort(byNaturalId)

  return { ordered, cycles, missing }
}

/**
 * 展开单任务依赖表:解析通配、识别悬空,返回去重后的具体任务 ID。
 * Go expandDeps 语义:通配自引用保留为边(Kahn 检出环);精确依赖命中
 * 自身同样保留为边;悬空(不存在且非自身)记入 missingSet 后跳过。
 */
function expandDeps(idx: TaskIndex, deps: readonly string[], selfId: string, missingSet: Set<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const dep of deps) {
    const { matches, isWildcard } = resolveWildcardDep(idx, dep)
    if (isWildcard) {
      for (const matchId of matches) {
        // 通配自引用:保留为边,使 Kahn 检出环
        if (!seen.has(matchId)) {
          seen.add(matchId)
          result.push(matchId)
        }
      }
    } else {
      // 精确依赖:查存在性
      if (idx.byId(dep) === undefined) {
        // 引用不存在的 ID:非自身才计入悬空
        if (dep !== selfId) missingSet.add(dep)
        continue
      }
      // 自引用:保留为边,使 Kahn 检出环(入度永不归零)
      if (!seen.has(dep)) {
        seen.add(dep)
        result.push(dep)
      }
    }
  }
  return result
}

/** 字符串集合 → 自然序切片。 */
function setToSortedSlice(s: ReadonlySet<string>): string[] {
  return [...s].sort(byNaturalId)
}

/** 自然序最小堆(Go idQueue:push 上浮 / pop 下沉逐行对齐)。 */
class IdQueue {
  private readonly items: string[] = []

  push(id: string): void {
    this.items.push(id)
    // 上浮维护堆序
    let i = this.items.length - 1
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2)
      if (byNaturalId(this.items[i] as string, this.items[parent] as string) < 0) {
        const tmp = this.items[i] as string
        this.items[i] = this.items[parent] as string
        this.items[parent] = tmp
        i = parent
      } else {
        break
      }
    }
  }

  pop(): string {
    if (this.items.length === 0) return ''
    const top = this.items[0] as string
    const last = this.items.length - 1
    this.items[0] = this.items[last] as string
    this.items.length = last
    // 下沉
    let i = 0
    for (;;) {
      const left = 2 * i + 1
      const right = 2 * i + 2
      let smallest = i
      if (left < this.items.length && byNaturalId(this.items[left] as string, this.items[smallest] as string) < 0) {
        smallest = left
      }
      if (right < this.items.length && byNaturalId(this.items[right] as string, this.items[smallest] as string) < 0) {
        smallest = right
      }
      if (smallest === i) break
      const tmp = this.items[i] as string
      this.items[i] = this.items[smallest] as string
      this.items[smallest] = tmp
      i = smallest
    }
    return top
  }

  len(): number {
    return this.items.length
  }
}
