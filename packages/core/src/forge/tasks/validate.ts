// validateFeatureTasks——单 feature 子图只读校验（任务 2.5；tech-design §Interface 1 L114-118 +
// Overview「三层校验职责」第二层 + PRD §178 五类口径 + db-schema §4 validateFeatureTasks 行 +
// §6-8 liveness 三判据）。定位：业务（forge/tasks 子域），纯读零事务零事件（写后事件归写动词）。
//
// Hard Rule：一次只校验一个 feature（动词面恒单 feature——「批量」语义归调用方流程层，
// 发现面 post-ingestion 对新入库 feature 逐个送校即增量集语义的流程层落点）。
//
// 五类检查（ViolationKind 封闭词汇——contracts G1 pin；违规含定位信息 taskRef）：
// ① phase-invariant：推导不动点（feature_status ≡ derive(feature_documents, tasks)——
//   archived 唯一豁免）**族**含两项服务不变量（AC 口径同列本类）：slug 列 ≡ feature slug、
//   同 feature 边约束（写时增量断言的批量对照面——比 GENERATED 列更强，连 features 表漂移亦可抓）；
// ② cycle：边集无环复核（写时增量校验 §6-14 的批量对照——历史漂移环由此抓，完整路径首尾相接）；
// ③ liveness：orphaned（blocked 无前置）/ stale（blocked 前置全满足——钩子漏恢复）/
//   deadlock（未满足前置均非 pending/in_progress——无解锁路径；rejected 为死锁信号 §6-4）；
// ④ record-chain：in_progress 必有 claim 记录 / completed 必有 submit 记录（append-only 审计链）；
// ⑤ topology：拓扑可分层性（老 forge validatePhaseOrder「claimed too early」新形态——数值
//   localId 主段 N≥2 的任务须存在更早阶段的直接前置；fix-N/disc-N 非数值 localId 豁免，
//   对拍 IsBusinessTask 面；M3 DAG 视图同层并行认领的分层前提诊断）。
//
// 子图口径：该 feature 全部 tasks（M3 1.2 垫片：source_kind='feature' AND source_id 归属）/
// edges（等待方 ∈ 子图）/ records（任务 ∈ 子图）；links 无独立不变量（纯关联事实，唯一写源
// claim 的 upsert-ignore 幂等行）——不全库复检（2026-10-06 用户裁决：大仓不扫，写时增量断言
// 承重漂移防护）。
//
// 同步核心（非 async）：better-sqlite3 天然同步；发现面 post-ingestion 挂点为同步回调
// （fail-soft try/catch 包装），异步 Promise 的逃逸拒绝会绕过记账——装配层（index.ts）直调
// 本同步核心；服务面（service.ts）以 async 签名包装满足 Interface 1 契约。
import type {
  DocKind,
  FeatureStatus,
  TaskRef,
  TaskStatus,
  TaskType,
  ValidateFeatureTasksInput,
  ValidateReport,
  Violation,
} from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { CycleDetectedError, TasksFeatureNotFoundError } from './errors.js'
import { deriveFeaturePhase, PhaseInvariantViolationError } from './phase-deriver.js'
import { SATISFYING_TASK_STATUSES } from './state-machine.js'

/** 校验装配依赖（只读动词——零事件面；service.ts 装配面结构传入） */
export interface ValidateDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen） */
  readonly store: ForgeWorkspaceStore
}

/** 子图任务行（最小定位形状——校验面消费） */
interface SubTaskRow {
  readonly id: string
  readonly slug: string
  readonly local_id: string
  readonly task_status: TaskStatus
  readonly task_type: TaskType
}

/** 子图边行（等待方 ∈ 子图；prerequisite 可能越界——①c 判据面） */
interface SubEdgeRow {
  readonly task_id: string
  readonly prerequisite_id: string
}

/** 越界前置行水化（跨 feature 边命名与拓扑主段判据共用） */
interface ForeignTaskRow {
  readonly id: string
  readonly slug: string
  readonly local_id: string
  readonly task_status: TaskStatus
}

/** liveness 解锁路径判据（老 forge validateLiveness 平移：pending/in_progress = 有望满足） */
const RESOLVABLE_PREREQ_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress']

/** 数值 localId 主段（'2.5' → 2；非数值（fix-N/disc-N 等）→ null——⑤ 豁免面） */
function localIdMajor(localId: string): number | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(localId)
  return m === null ? null : Number(m[1])
}

/** DFS 三色（② 无环复核）：WHITE 未访 / GRAY 在栈 / BLACK 已毕 */
const WHITE = 0
const GRAY = 1
const BLACK = 2

/** Interface 1 validateFeatureTasks：单 feature 子图五类检查（只读——违规清单 + checked 计数） */
export function validateFeatureTasks(deps: ValidateDeps, input: ValidateFeatureTasksInput): ValidateReport {
  const db = deps.store.ensureOpen(input.projectId)

  // 子图锚定：featureSlug → feature 行（未命中 404——送校方 fail-soft 承接）
  const feature = db
    .prepare<unknown[], { id: string; slug: string; feature_status: FeatureStatus }>(
      `SELECT id, slug, feature_status FROM features WHERE slug = ?`,
    )
    .get(input.featureSlug)
  if (feature === undefined) {
    throw new TasksFeatureNotFoundError({ projectId: input.projectId, featureSlug: input.featureSlug })
  }

  // 子图行集（创建序确定性——违规清单稳定；M3 1.2 垫片：feature 容器 = source 双列特例）
  const tasks = db
    .prepare<unknown[], SubTaskRow>(
      `SELECT id, slug, local_id, task_status, task_type FROM tasks
       WHERE source_kind = 'feature' AND source_id = ? ORDER BY created_at, id`,
    )
    .all(feature.id)
  const edges = db
    .prepare<unknown[], SubEdgeRow>(
      `SELECT e.task_id, e.prerequisite_id FROM task_edges e
       JOIN tasks t ON t.id = e.task_id
       WHERE t.source_kind = 'feature' AND t.source_id = ? ORDER BY e.task_id, e.prerequisite_id`,
    )
    .all(feature.id)
  const verbsByTask = new Map<string, Set<string>>()
  for (const r of db
    .prepare<unknown[], { task_id: string; verb: string }>(
      `SELECT r.task_id, r.verb FROM task_records r JOIN tasks t ON t.id = r.task_id
       WHERE t.source_kind = 'feature' AND t.source_id = ?`,
    )
    .all(feature.id)) {
    const set = verbsByTask.get(r.task_id)
    if (set === undefined) verbsByTask.set(r.task_id, new Set([r.verb]))
    else set.add(r.verb)
  }

  const byId = new Map<string, SubTaskRow>(tasks.map((t) => [t.id, t]))
  const foreignById = new Map<string, ForeignTaskRow>()
  const foreignStmt = db.prepare<unknown[], ForeignTaskRow>(
    `SELECT id, slug, local_id, task_status FROM tasks WHERE id = ?`,
  )
  /** 前置行水化（子图内直取；越界行按需查捞并缓存——FK 保证在场） */
  const prereqRow = (id: string): ForeignTaskRow | undefined => {
    const internal = byId.get(id)
    if (internal !== undefined) return internal
    let row = foreignById.get(id)
    if (row === undefined) {
      row = foreignStmt.get(id) ?? undefined
      if (row !== undefined) foreignById.set(id, row)
    }
    return row
  }
  const natural = (row: { slug: string; local_id: string }): string => `${row.slug}/${row.local_id}`
  const ref = (row: { slug: string; local_id: string }): TaskRef => ({ slug: row.slug, localId: row.local_id })

  const violations: Violation[] = []

  // ── ① 相位派生不变量族（含 slug 列 ≡ feature slug、同 feature 边约束服务不变量） ──

  // ①a 推导不动点（archived 唯一豁免——人类收纳决策，推导机永不覆盖）：同源结论经
  //    PhaseInvariantViolationError 文案（与写事务内增量断言同一拒绝面措辞）
  const docKinds = db
    .prepare<unknown[], { doc_kind: DocKind }>(`SELECT doc_kind FROM feature_documents WHERE feature_id = ?`)
    .all(feature.id)
    .map((r) => r.doc_kind)
  const taskStatuses = tasks.map((t) => t.task_status)
  if (feature.feature_status !== 'archived') {
    const expected = deriveFeaturePhase({ current: feature.feature_status, docKinds, taskStatuses })
    if (expected !== feature.feature_status) {
      violations.push({
        kind: 'phase-invariant',
        message: new PhaseInvariantViolationError(
          { featureStatus: feature.feature_status, docKinds, taskStatuses, featureSlug: feature.slug },
          expected,
        ).message,
      })
    }
  }

  // ①b slug 列 ≡ feature slug（服务不变量——id 关联裁决后连 features 表漂移亦可抓）
  for (const t of tasks) {
    if (t.slug !== feature.slug) {
      violations.push({
        kind: 'phase-invariant',
        message: `slug 列 ≢ feature slug（服务不变量）：tasks.slug='${t.slug}' ≢ features.slug='${feature.slug}'（任务 ${natural(t)}）`,
        taskRef: ref(t),
      })
    }
  }

  // ①c 同 feature 边约束（DB CHECK 退役后的服务不变量面——er-diagram 差异清单 #9）；
  //     越界边不入 ②⑤ 图遍历节点集（结构破损边不参与环/分层判定，单独回报）
  const internalEdges: SubEdgeRow[] = []
  for (const e of edges) {
    if (byId.has(e.prerequisite_id)) {
      internalEdges.push(e)
      continue
    }
    const waiter = byId.get(e.task_id)
    const foreign = prereqRow(e.prerequisite_id)
    violations.push({
      kind: 'phase-invariant',
      message:
        `跨 feature 边（同 feature 边约束服务不变量）：${waiter !== undefined ? natural(waiter) : e.task_id} ← ` +
        `${foreign !== undefined ? natural(foreign) : e.prerequisite_id}`,
      taskRef: waiter !== undefined ? ref(waiter) : undefined,
    })
  }

  // ── ② 无环复核（三色 DFS——写时增量校验 §6-14 的批量对照；每回边一报，路径首尾相接） ──

  const adjacency = new Map<string, string[]>()
  for (const e of internalEdges) {
    const list = adjacency.get(e.task_id)
    if (list === undefined) adjacency.set(e.task_id, [e.prerequisite_id])
    else list.push(e.prerequisite_id)
  }
  const color = new Map<string, number>()
  const stack: string[] = []
  const cycles: string[][] = []
  const dfs = (id: string): void => {
    color.set(id, GRAY)
    stack.push(id)
    for (const next of adjacency.get(id) ?? []) {
      const c = color.get(next) ?? WHITE
      if (c === WHITE) dfs(next)
      else if (c === GRAY) {
        const start = stack.indexOf(next)
        cycles.push([...stack.slice(start), next]) // 回边闭环（首尾同节点）
      }
    }
    stack.pop()
    color.set(id, BLACK)
  }
  for (const t of tasks) {
    if ((color.get(t.id) ?? WHITE) === WHITE) dfs(t.id)
  }
  for (const cycle of cycles) {
    const keys = cycle.map((id) => natural(byId.get(id) ?? { slug: '?', local_id: id }))
    const anchor = byId.get(cycle[0] as string)
    violations.push({
      kind: 'cycle',
      message: new CycleDetectedError({ cycle: keys }).message, // 与 addTask 拒绝面同源措辞
      taskRef: anchor !== undefined ? ref(anchor) : undefined,
    })
  }

  // ── ③ liveness 三判据（§6-8——blocked 任务的孤儿/过期/死锁诊断；含越界前置的真实状态） ──

  const prereqsOf = new Map<string, string[]>()
  for (const e of edges) {
    const list = prereqsOf.get(e.task_id)
    if (list === undefined) prereqsOf.set(e.task_id, [e.prerequisite_id])
    else list.push(e.prerequisite_id)
  }
  for (const t of tasks) {
    if (t.task_status !== 'blocked') continue
    const prereqIds = prereqsOf.get(t.id) ?? []
    if (prereqIds.length === 0) {
      violations.push({
        kind: 'liveness',
        message: `blocked 且无前置依赖（orphaned）——阻塞依据缺失：${natural(t)}`,
        taskRef: ref(t),
      })
      continue
    }
    const statuses = prereqIds.map((id) => prereqRow(id)?.task_status)
    const allSatisfied = statuses.every(
      (s) => s !== undefined && (SATISFYING_TASK_STATUSES as readonly string[]).includes(s),
    )
    if (allSatisfied) {
      violations.push({
        kind: 'liveness',
        message: `blocked 但前置全满足（stale——应恢复为 pending，恢复钩子漏接面）：${natural(t)}`,
        taskRef: ref(t),
      })
      continue
    }
    const hasResolvable = statuses.some(
      (s) => s !== undefined && (RESOLVABLE_PREREQ_STATUSES as readonly string[]).includes(s),
    )
    if (!hasResolvable) {
      violations.push({
        kind: 'liveness',
        message: `blocked 无解锁路径（deadlock——未满足前置均非 pending/in_progress）：${natural(t)}`,
        taskRef: ref(t),
      })
    }
  }

  // ── ④ 记录链完整性（append-only 审计链——状态与动词史的对应） ──

  for (const t of tasks) {
    const verbs = verbsByTask.get(t.id)
    if (t.task_status === 'in_progress' && !(verbs?.has('claim') === true)) {
      violations.push({
        kind: 'record-chain',
        message: `in_progress 无 claim 记录（记录链完整性）：${natural(t)}`,
        taskRef: ref(t),
      })
    }
    if (t.task_status === 'completed' && !(verbs?.has('submit') === true)) {
      violations.push({
        kind: 'record-chain',
        message: `completed 无 submit 记录（记录链完整性）：${natural(t)}`,
        taskRef: ref(t),
      })
    }
  }

  // ── ⑤ 拓扑可分层（phase order 新形态——数值主段 N≥2 须有更早阶段直接前置） ──

  for (const t of tasks) {
    const major = localIdMajor(t.local_id)
    if (major === null || major < 2) continue // 非数值豁免 / 第 1 阶无更早阶段
    const hasEarlierPhaseDep = (prereqsOf.get(t.id) ?? []).some((id) => {
      const depMajor = localIdMajor(prereqRow(id)?.local_id ?? '')
      return depMajor !== null && depMajor >= 1 && depMajor < major
    })
    if (!hasEarlierPhaseDep) {
      violations.push({
        kind: 'topology',
        message: `第 ${major} 阶任务无对更早阶段的直接依赖（拓扑可分层性——claimed too early）：${natural(t)}`,
        taskRef: ref(t),
      })
    }
  }

  return { violations, checked: { featureSlug: feature.slug, tasks: tasks.length } }
}
