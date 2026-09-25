// workbench/tasks/model — 任务索引纯逻辑模型 + ID 自然序工具(任务 1.2)。
// 移植基准唯一 = forge-cli Go 源,逐函数核对(任务 Hard Rules):
//   - pkg/types/status.go   → 7 态 + isTerminalStatus
//   - pkg/task/types.go     → ID 后缀方言 + isBusinessTask
//   - pkg/task/id_utils.go  → parseSegment / compareVersionIds
//   - pkg/task/index.go     → TaskIndex 查询面(byId 的 key 优先语义)
// 纯逻辑层:不触 db、不触 fs、不触 IPC(对拍器可独立运行)。

/** 任务生命周期状态(7 态;er-diagram 不变式:迁移仅经状态机合法边)。 */
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'suspended'
  | 'skipped'
  | 'rejected'

export const ALL_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'suspended',
  'skipped',
  'rejected',
]

/** 终态(completed/skipped/rejected)——不再有常规迁移。 */
export function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'skipped' || status === 'rejected'
}

// —— ID 后缀方言(pkg/task/types.go)——

export const ID_SUFFIX_GATE = '.gate'
export const ID_SUFFIX_SUMMARY = '.summary'
export const ID_SUFFIX_WILDCARD = '.x'
const ID_PREFIX_TEST_PIPELINE = 'T-'

/** 业务任务 = 非 gate/summary/非自动测试管线(T- 前缀)。 */
export function isBusinessTask(id: string): boolean {
  if (id.startsWith(ID_PREFIX_TEST_PIPELINE)) return false
  if (id.endsWith(ID_SUFFIX_GATE)) return false
  if (id.endsWith(ID_SUFFIX_SUMMARY)) return false
  return true
}

// —— 自然序比较(pkg/task/id_utils.go)——

/** Go strconv.Atoi 语义:可选符号 + 纯数字(无空白/下划线)。 */
const NUMERIC_SEGMENT = /^[+-]?\d+$/

/**
 * 解析 ID 的第 i 段:数值段返回 [数值, true];字母段返回
 * [词表序, false](gate=1 < summary=2,其余=0);越界段返回 [-1, true]
 * (缺失段排在一切之前)。与 Go ParseSegment 逐行为对齐。
 */
export function parseSegment(parts: readonly string[], i: number): readonly [number, boolean] {
  if (i >= parts.length) return [-1, true]
  const segment = parts[i] as string
  if (NUMERIC_SEGMENT.test(segment)) return [Number(segment), true]
  switch (segment) {
    case 'gate': return [1, false]
    case 'summary': return [2, false]
    default: return [0, false]
  }
}

/** a 是否应排在 b 前(自然序:数值段按数值、数值先于字母、gate 先于 summary)。 */
export function compareVersionIds(a: string, b: string): boolean {
  const partsA = a.split('.')
  const partsB = b.split('.')
  const maxLen = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < maxLen; i++) {
    const [na, aIsNum] = parseSegment(partsA, i)
    const [nb, bIsNum] = parseSegment(partsB, i)
    if (aIsNum !== bIsNum) return aIsNum
    if (na !== nb) return na < nb
  }
  return false
}

/** Array.sort 适配器:把布尔比较子升格为三态比较子。 */
export function byNaturalId(a: string, b: string): number {
  if (compareVersionIds(a, b)) return -1
  if (compareVersionIds(b, a)) return 1
  return 0
}

// —— 任务/索引模型(pkg/task/types.go Task + pkg/task/index.go 查询面)——

/** 纯逻辑层消费的 Task 投影(字段名 = index.json JSON tag,原词保真)。 */
export interface Task {
  readonly id: string
  readonly title?: string
  readonly priority?: string
  readonly dependencies?: readonly string[]
  readonly status: string
  readonly type?: string
  readonly sourceTaskID?: string
}

/**
 * 任务索引:tasks 以 map key(slug,如 `1.2-statemachine-deps-port`)持有,
 * ID(`1.2`)经 byId 解析 —— key 优先、ID 兜底扫描,与 Go TaskIndex.ByID
 * 语义逐行一致(M2 方言:依赖存裸 ID 而键为 slug)。
 */
export class TaskIndex {
  private readonly tasks: Map<string, Task>

  constructor(entries: readonly (readonly [string, Task])[] = []) {
    this.tasks = new Map(entries)
  }

  /** Go ByID:先按 map key 命中,再按 Task.ID 线性扫描;未命中返回 undefined。 */
  byId(id: string): Task | undefined {
    const byKey = this.tasks.get(id)
    if (byKey !== undefined) return byKey
    for (const t of this.tasks.values()) {
      if (t.id === id) return t
    }
    return undefined
  }

  /** Go SetTask:按 key 插入或替换。 */
  setTask(key: string, t: Task): void {
    this.tasks.set(key, t)
  }

  /** Go TasksMap:只读迭代视图。 */
  tasksMap(): ReadonlyMap<string, Task> {
    return this.tasks
  }

  /** Go TaskCount。 */
  get taskCount(): number {
    return this.tasks.size
  }
}

/** index.json 快照(或等价 JSON 结构)→ TaskIndex;字段原词保真,不改写。 */
export function parseTaskIndexSnapshot(snapshot: { tasks?: Record<string, unknown> }): TaskIndex {
  const entries = Object.entries(snapshot.tasks ?? {}).map(
    ([key, raw]) => [key, raw] as const,
  )
  return new TaskIndex(entries as readonly (readonly [string, Task])[])
}
