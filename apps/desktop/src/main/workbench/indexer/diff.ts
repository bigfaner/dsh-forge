// workbench/indexer/diff — 快照 diff 分类(属性级 / 结构性)与事件形态
// (任务 2.5)。
//
// 分类口径(tech-design §Interface 3 + Interface 1 WorkbenchEvent):
//   - 属性级:既有任务的内容字段变化(状态/标题/blockers/feature 归属/
//     branch/worktree)→ upsert(updatedAt 前移)+ changeKind 'attribute';
//   - 结构性:任务集变化 —— 新增任务 / 任务消失(文件删除、移相位改名)
//     → upsert / 行删除 + changeKind 'structural';删除不留孤儿行。
// 比较仅覆盖语义字段:updatedAt 与 source 不参与比较(它们是变更的产物,
// 不是变更的判据)。
//
// 纯函数层:不触 db、不触 fs —— 分类单测无需库与 fixture(库级端到端在
// scan 集成用例覆盖)。

import type { ChangeSource, DocKind, FeatureStatus, TaskSnapshot, FeatureSnapshot, SyncState } from '../repos/types.ts'

/**
 * Interface 1 WorkbenchEvent(indexer 产出的变更事件;2.6 watcher 经
 * `dsh-forge:workbench-events` 批量推送,2.7 落 IPC 面)。
 */
export type WorkbenchEvent =
  | {
    readonly type: 'task_updated'
    readonly projectId: string
    readonly taskKey: string
    readonly source: ChangeSource | null
    readonly changeKind: 'attribute' | 'structural'
  }
  | { readonly type: 'feature_updated'; readonly projectId: string; readonly featureSlug: string }
  | { readonly type: 'sync'; readonly projectId: string; readonly sync: SyncStatusPayload }
  // M3 v2(任务 1.4;tech-design §Interface 1 事件扩展):迁移相位完成信号。
  // 每相位(backup/ingest/verify/switch/archive,失败另加 rollback)完成即
  // 推送一条;终态对话框与进度呈现由消费面(1.7)组装,本事件只承载相位
  // 与结果,不承载对拍报告全文(可回查面 = migration_event.detail_json)。
  | {
    readonly type: 'migration_progress'
    readonly projectId: string
    readonly phase: MigrationPhase
    readonly result: MigrationPhaseResult
  }
  // M3 v2(任务 1.5;tech-design §Interface 1 事件扩展):偏离检出信号,
  // 仅呈现不阻断(PRD G8/Story 8)。项目级形态 = 已迁移项目 index.json
  // 外部复现/变更被重摄入 watcher 检出(Interface 4 第 7 步);feature 级
  // 形态(featureSlug 载荷,manifest 外部跨阶段)归 4.2 扩展本联合。
  | {
    readonly type: 'deviation_detected'
    readonly projectId: string
  }
  // M3 v2(任务 3.1;tech-design §Interface 1 事件扩展):偏好写完成信号
  // prefs_updated { scope }(载荷扩为 scope + scopeId —— 消费面按地址过滤
  // 刷新,编辑面归 5.x)。仅实际变更发(setPrefs 空批/幂等清除 no-op 不发)。
  | {
    readonly type: 'prefs_updated'
    readonly scope: 'global' | 'project' | 'feature'
    readonly scopeId: string
  }

// —— M3 v2 事件词表(任务 1.4 起;tech-design §Interface 1 事件扩展)——

/**
 * migration_event 相位词表(schema-v2.sql §9 CHECK 同源;迁移/回收审计)。
 * reingest 相 = 外部写回收(Interface 4 第 7 步,任务 1.5:migration/
 * reingest-watcher 每次实际回收 ok/fail 各留一行)。
 */
export type MigrationPhase = 'backup' | 'ingest' | 'verify' | 'switch' | 'archive' | 'rollback' | 'reingest'

/** 相位结果词表(migration_event.result CHECK 同源)。 */
export type MigrationPhaseResult = 'ok' | 'fail'

/** Interface 1 SyncStatus(事件载荷形态;repos SyncState 的 DTO 投影)。 */
export interface SyncStatusPayload {
  readonly state: 'idle' | 'scanning' | 'error'
  readonly lastScanAt: string | null
  readonly error?: string
}

export function toSyncStatusPayload(state: SyncState): SyncStatusPayload {
  return state.error === null
    ? { state: state.status, lastScanAt: state.lastScanAt }
    : { state: state.status, lastScanAt: state.lastScanAt, error: state.error }
}

/** diff 侧的任务行入参(ParsedTask 的可比投影;source 由扫描层判定后注入)。 */
export interface IncomingTaskRow {
  readonly taskKey: string
  readonly featureSlug: string
  readonly title: string
  readonly status: string
  readonly blockers: readonly string[]
  readonly branch: string | null
  readonly worktree: boolean
}

/** 任务 diff 产物。 */
export interface TaskDiffResult {
  /** 需要 upsert 的行(新增 + 内容变化)。 */
  readonly upserts: IncomingTaskRow[]
  /** 每个 upsert 行的事件类别(新增 → structural;变更 → attribute)。 */
  readonly changeKinds: ReadonlyMap<string, 'attribute' | 'structural'>
  /** 结构性删除的 task_key 集(既有快照有、本轮解析无)。 */
  readonly deletedKeys: readonly string[]
}

function sameTaskContent(previous: TaskSnapshot, incoming: IncomingTaskRow): boolean {
  return (
    previous.featureSlug === incoming.featureSlug &&
    previous.title === incoming.title &&
    previous.status === incoming.status &&
    JSON.stringify(previous.blockers) === JSON.stringify(incoming.blockers) &&
    previous.branch === incoming.branch &&
    previous.worktree === incoming.worktree
  )
}

/**
 * 任务集 diff:previous = 库内快照(全量),incoming = 本轮解析任务行
 * (tasks=null 的 feature 不进 incoming —— 其既有行由调用方整体排除在
 * previous 之外,避免误判结构性删除)。
 */
export function diffTasks(previous: readonly TaskSnapshot[], incoming: readonly IncomingTaskRow[]): TaskDiffResult {
  const previousByKey = new Map(previous.map(row => [row.taskKey, row]))
  const upserts: IncomingTaskRow[] = []
  const changeKinds = new Map<string, 'attribute' | 'structural'>()
  for (const row of incoming) {
    const existing = previousByKey.get(row.taskKey)
    if (existing === undefined) {
      upserts.push(row)
      changeKinds.set(row.taskKey, 'structural')
    } else if (!sameTaskContent(existing, row)) {
      upserts.push(row)
      changeKinds.set(row.taskKey, 'attribute')
    }
  }
  const incomingKeys = new Set(incoming.map(row => row.taskKey))
  const deletedKeys = [...previousByKey.keys()].filter(key => !incomingKeys.has(key))
  return { upserts, changeKinds, deletedKeys }
}

/** diff 侧的 feature 行入参(计数为本轮解析集的投影值)。 */
export interface IncomingFeatureRow {
  readonly featureSlug: string
  readonly status: FeatureStatus
  readonly docKinds: readonly DocKind[]
  readonly taskTotal: number
  readonly taskCompleted: number
}

/** feature diff 产物:待 upsert 行(全部可写 feature —— 计数随写随算)、事件键。 */
export interface FeatureDiffResult {
  /** 发生实际变化的 featureSlug(新增/内容变化/计数变化)。 */
  readonly changedSlugs: readonly string[]
  /** 结构性删除的 slug(目录消失;manifest 损坏的 feature 不在此列)。 */
  readonly deletedSlugs: readonly string[]
}

function sameFeatureContent(previous: FeatureSnapshot, incoming: IncomingFeatureRow): boolean {
  return (
    previous.status === incoming.status &&
    JSON.stringify(previous.docKinds) === JSON.stringify(incoming.docKinds) &&
    previous.taskTotal === incoming.taskTotal &&
    previous.taskCompleted === incoming.taskCompleted
  )
}

/**
 * feature 集 diff。presentSlugs = 本轮实际看到的 feature 目录(含 manifest
 * 损坏者 —— 目录在即不删行);incoming = manifest 完好的可写行。
 */
export function diffFeatures(
  previous: readonly FeatureSnapshot[],
  incoming: readonly IncomingFeatureRow[],
  presentSlugs: readonly string[],
): FeatureDiffResult {
  const previousBySlug = new Map(previous.map(row => [row.featureSlug, row]))
  const changedSlugs: string[] = []
  for (const row of incoming) {
    const existing = previousBySlug.get(row.featureSlug)
    if (existing === undefined || !sameFeatureContent(existing, row)) changedSlugs.push(row.featureSlug)
  }
  const present = new Set(presentSlugs)
  const deletedSlugs = [...previousBySlug.keys()].filter(slug => !present.has(slug))
  return { changedSlugs, deletedSlugs }
}

/**
 * 依赖树可重建性检查(AC1):blockers 为同 feature 命名空间的本地上游 key,
 * 解析规则 = `<所属 feature>/<blocker>` 是否存在于本轮任务键集。悬空引用
 * 不改写、不丢弃 —— 原词保留在快照 blockers 内,此处显式标记供树视图与
 * 统计消费。
 */
export interface DanglingBlocker {
  readonly taskKey: string
  readonly blocker: string
}

export function findDanglingBlockers(tasks: readonly IncomingTaskRow[]): DanglingBlocker[] {
  const keySet = new Set(tasks.map(row => row.taskKey))
  const dangling: DanglingBlocker[] = []
  for (const row of tasks) {
    for (const blocker of row.blockers) {
      if (!keySet.has(`${row.featureSlug}/${blocker}`)) {
        dangling.push({ taskKey: row.taskKey, blocker })
      }
    }
  }
  return dangling
}
