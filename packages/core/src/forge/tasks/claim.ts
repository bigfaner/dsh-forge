// claimTask——任务域派发动词（任务 2.4；tech-design §Interface 1「动词内聚不变量」claimTask 行 +
// db-schema §4 动词矩阵 claimTask 行 + §6-35⑧ 就绪选择 + C1 幂等重入 + 交互一派发链）。
// 定位：业务（forge/tasks 子域）。import 边：→ forge/workspace/（共享句柄/事件）与同域
// errors/phase-deriver/query/state-machine + prompt/（2.2 产物合成调用点）；四域互禁 import
// 彼此（Hard Rule）。actor 由通道推断（Interface 1 路由约定）：claimTask = tool 专属动词
// （Interface 7——claim 不上 RPC），claim 记录 actor 恒 'plugin-tool'。
//
// 单事务全成全败（Hard Rule）：目标解析（显式 taskRef / 盲选）→ 守卫（依赖全 ∈ {completed,
// skipped}——rejected 不满足）→ dispatchPrompt 合成（领取瞬间取数：BLOCKERS 快照 +
// PHASE_SUMMARY 相位机注入）→ 转移（pending/blocked → in_progress，agent 面矩阵先验）或
// 幂等重入（in_progress 无状态转移，C1）→ claim 记录（dispatch_digest——全文不入库 §6-11）→
// links upsert-ignore（claim = 唯一写源）→ 相位重算；闭包尾部（提交后）emitTasksChanged。
// 一律 prepared statements（Hard Rule）。
//
// 并发与重入域（tech-design Interface 1 裁决）：就绪选择仅扫 pending 池（Hard Rule）；
// in_progress 幂等重入仅限显式 taskRef 或 links 已含本会话——无 taskRef 的盲选不领
// in_progress（双 dispatcher 并发不双派发）；无就绪任务 → { task: null, … } Z1 出口信号
// （run-tasks 循环等待/收工判据——纯读零写入，不发射事件）。
//
// 就绪选择（§6-35⑧ 用户裁决「沿一条分支执行，遇阻塞换支」）：分支延续优先（最近满足任务
// 的就绪直接后继——执行上下文局部性）→ priority（P0 > P1 > P2 > 缺省）→ 创建序。
// PHASE_SUMMARY（老 forge PhaseDetect 平移）：领取任务为首个进入新相位者（currentPhase >
// 该 feature 已完成业务任务的最大相位 且 > 1）时注入上一相位摘要路径（仓规
// docs/features/<slug>/tasks/records/{N-1}.summary.md，正斜杠）；文件在场性核验属 dsh 执行
// 侧（core 无工作区根路径——模板已指示读取，缺席 = 执行器软失）。
import type Database from 'better-sqlite3'
import type {
  ClaimTaskInput,
  ClaimTaskResult,
  ContainerRef,
  TaskPriority,
  TaskPrerequisiteSummary,
} from '@dsh-forge/contracts'
import { withTransaction } from '../../db/transaction.js'
import { readPhaseInput, type TasksVerbDeps } from './add.js'
import { DependenciesUnmetError } from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { composeDispatchPrompt } from './prompt/compose.js'
import { dispatchDigest } from './prompt/digest.js'
import {
  TASK_COLUMNS,
  resolvePhaseGuardFeature,
  resolveTaskById,
  resolveTaskRef,
  toTaskSnapshot,
  type TaskStorageRow,
} from './query.js'
import { SATISFYING_TASK_STATUSES, assertTransitionAllowed } from './state-machine.js'

export type { TasksVerbDeps }

/** id 直查（内部水化面——命中已由查询构造保证，未命中 = 漂移不可达） */
function taskById(db: Database.Database, taskId: string): TaskStorageRow | undefined {
  return db.prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(taskId)
}

/** 就绪判定谓词（SQL 片段——守卫与就绪集共用同判定；满足 = 读时 JOIN 终态派生，§6-5） */
const READY_PREDICATE = `NOT EXISTS (
  SELECT 1 FROM task_edges e JOIN tasks p ON p.id = e.prerequisite_id
  WHERE e.task_id = t.id AND p.task_status NOT IN ('completed', 'skipped'))`

/** priority 线性序（P0 > P1 > P2 > 缺省——就绪选择第二键；NULL 排末位） */
const PRIORITY_RANK = `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`

/** Z1 出口（无就绪任务——纯读零变更；dispatchPrompt/digest 空串、reclaimed=false） */
function noReadyExit(): ClaimTaskResult {
  return { task: null, dispatchPrompt: '', digest: '', reclaimed: false }
}

/**
 * 盲选重入解析（C1）：本会话 links 已挂接的 in_progress 任务（最新挂接优先——恢复「本会话
 * 最近派发的活」）；缺席 → undefined（盲选不领他会话 in_progress——双 dispatcher 不双派发）。
 */
function latestInProgressBySession(db: Database.Database, sessionId: string): TaskStorageRow | undefined {
  const linked = db
    .prepare<unknown[], { task_id: string }>(
      `SELECT task_id FROM task_session_links WHERE session_id = ? ORDER BY id DESC`,
    )
    .all(sessionId)
  for (const { task_id } of linked) {
    const row = taskById(db, task_id)
    if (row?.task_status === 'in_progress') return row // 最新挂接优先（恢复本会话最近派发的活）
  }
  return undefined
}

/**
 * 就绪选择（§6-35⑧）：①分支延续——范围内最近满足任务（completed/skipped，updated_at 最新）
 * 的就绪 pending 直接后继；②无延续 → 全局就绪 pending 池按 priority → 创建序。
 * 仅扫 pending 池（Hard Rule）；scope = 容器限定（M3 2.4：source_kind + slug 双列判别——
 * 成链撞键下 kind 可分；slug 列 ≡ 容器 slug 不变量）。缺席容器 → 就绪池恒空 → Z1 出口。
 */
function selectReadyTask(db: Database.Database, source: ContainerRef | undefined): TaskStorageRow | undefined {
  const scope = source === undefined ? '' : ` AND t.source_kind = ? AND t.slug = ?`
  const scopeArgs = source === undefined ? [] : [source.kind, source.slug]

  // ① 分支延续锚点：最近满足任务（同 scope——边为同 feature 约束，后继天然在 scope 内）
  const anchor = db
    .prepare<unknown[], { id: string }>(
      `SELECT id FROM tasks t WHERE t.task_status IN ('completed', 'skipped')${scope}
       ORDER BY t.updated_at DESC, t.id DESC LIMIT 1`,
    )
    .get(...scopeArgs)
  if (anchor !== undefined) {
    const successor = db
      .prepare<unknown[], { id: string }>(
        `SELECT t.id FROM task_edges e JOIN tasks t ON t.id = e.task_id
         WHERE e.prerequisite_id = ? AND t.task_status = 'pending' AND ${READY_PREDICATE}
         ORDER BY ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
      )
      .get(anchor.id)
    if (successor !== undefined) return taskById(db, successor.id)
  }

  // ② 全局就绪池：priority → 创建序
  const ready = db
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM tasks t WHERE t.task_status = 'pending'${scope} AND ${READY_PREDICATE}
       ORDER BY ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
    )
    .get(...scopeArgs)
  return ready === undefined ? undefined : taskById(db, ready.id)
}

/** 前置快照（守卫判定 + BLOCKERS 注入同源——领取瞬间取数） */
function readPrerequisiteSnapshot(db: Database.Database, taskId: string): TaskPrerequisiteSummary[] {
  return db
    .prepare<unknown[], TaskPrerequisiteSummary>(
      `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
       FROM task_edges e JOIN tasks t ON t.id = e.prerequisite_id
       WHERE e.task_id = ? ORDER BY t.slug, t.local_id`,
    )
    .all(taskId)
}

/**
 * claim 守卫（依赖终态守卫——SC7 单测锚）：前置全 ∈ 满足集 {completed, skipped} 才放行；
 * 未满足 → ERR_DEPENDENCIES_UNMET（data 带未满足清单——自然键 + 当前状态）。
 * 适用一切 claim 路径（含幂等重入——前置回归即拒，dispatcher 须重规划）。
 */
function assertDependenciesMet(prereqs: readonly TaskPrerequisiteSummary[]): void {
  const unmet = prereqs.filter(
    (p) => !(SATISFYING_TASK_STATUSES as readonly string[]).includes(p.taskStatus),
  )
  if (unmet.length > 0) throw new DependenciesUnmetError({ unmet })
}

/** 业务任务判定（老 forge IsBusinessTask 平移：仅严格数值 localId——1.gate/fix-N/disc-N 不计） */
const BUSINESS_LOCAL_ID = /^\d+(?:\.\d+)?$/

/** localId → 相位号（"2.1" → 2；非数值前缀 → null——fix-N/disc-N 相位无关） */
function phaseOf(localId: string): number | null {
  const m = /^(\d+)(?:\.|$)/.exec(localId)
  return m === null ? null : Number(m[1])
}

/**
 * PHASE_SUMMARY 路径推导（老 forge PhaseDetect 的 DB 侧平移）：领取任务为首个进入新相位者
 * （currentPhase > 该 feature 已完成业务任务最大相位 且 currentPhase > 1）→ 上一相位摘要
 * 路径（仓规 {N-1}.summary.md）。核心无工作区根路径不做文件在场性核验（执行器软失）。
 */
function derivePhaseSummary(db: Database.Database, row: TaskStorageRow): string | undefined {
  const currentPhase = phaseOf(row.local_id)
  if (currentPhase === null || currentPhase <= 1) return undefined
  if (row.source_kind !== 'feature') return undefined // 律四：proposal 容器无相位域
  const statuses = db
    .prepare<unknown[], { local_id: string; task_status: string }>(
      `SELECT local_id, task_status FROM tasks WHERE source_kind = 'feature' AND source_id = ?`,
    )
    .all(row.source_id)
  let maxCompleted = 0
  for (const t of statuses) {
    if (t.task_status !== 'completed' || !BUSINESS_LOCAL_ID.test(t.local_id)) continue
    const phase = phaseOf(t.local_id)
    if (phase !== null) maxCompleted = Math.max(maxCompleted, phase)
  }
  if (currentPhase <= maxCompleted) return undefined
  return `docs/features/${row.slug}/tasks/records/${currentPhase - 1}.summary.md`
}

/** Interface 1 claimTask：守卫 + 就绪选择 + dispatchPrompt 合成 + links + 幂等重入（详见文件头） */
export async function claimTask(deps: TasksVerbDeps, input: ClaimTaskInput): Promise<ClaimTaskResult> {
  const db = deps.store.ensureOpen(input.projectId)
  const now = new Date().toISOString()

  const result = withTransaction(db, (): ClaimTaskResult => {
    // ① 目标解析：显式 taskRef（agent 自然键 UNIQUE 查捞）；盲选 = 本会话 in_progress 重入 → 就绪选择
    //    （M3 2.4：容器限定盲选双轨落地——source_kind + slug 判别，proposal 容器限定照常）
    let row: TaskStorageRow | undefined
    if (input.taskRef !== undefined) {
      row = resolveTaskRef(db, input.projectId, input.taskRef)
    } else {
      row = latestInProgressBySession(db, input.sessionId) ?? selectReadyTask(db, input.source)
    }
    if (row === undefined) return noReadyExit() // Z1 出口（纯读零变更，不发射事件）

    // ② 守卫（一切路径——含重入：前置回归即拒）
    const prereqs = readPrerequisiteSnapshot(db, row.id)
    assertDependenciesMet(prereqs)

    // ③ dispatchPrompt 合成（领取瞬间取数——BLOCKERS 快照 + PHASE_SUMMARY 相位机注入 +
    //    fix 源标记谱系水化；M2 task_file 列砍除——taskFile 缺席省行）
    const sourceRow = row.source_task_id === null ? undefined : taskById(db, row.source_task_id)
    const sourceRef = sourceRow === undefined ? undefined : { slug: sourceRow.slug, localId: sourceRow.local_id }
    const dispatchPrompt = composeDispatchPrompt({
      slug: row.slug,
      localId: row.local_id,
      // M3 2.4：SOURCE 容器语境行（任务带容器出厂——Interface 1；slug ≡ 容器 slug 不变量
      // 使行内 slug 直取任务行 slug）
      source: { kind: row.source_kind, slug: row.slug },
      taskType: row.task_type,
      priority: (row.priority as TaskPriority | null) ?? undefined,
      coverage: row.coverage ?? undefined,
      phaseSummary: derivePhaseSummary(db, row),
      blockers: prereqs.length > 0 ? prereqs : undefined,
      // main_session 砍除（M3 裁决⑦）：标记行不再有 main-session 分支（1.2 schema 直改伴随）
      breaking: row.breaking === 1,
      sourceTask: sourceRef,
    })
    const digest = dispatchDigest(dispatchPrompt)

    // ④ 转移（pending/blocked → in_progress）或幂等重入（in_progress 无状态转移，C1）
    const reclaimed = row.task_status === 'in_progress'
    if (!reclaimed) {
      // agent 面矩阵先验（pending/blocked → in_progress 合法；终态/挂起态拒绝）
      assertTransitionAllowed(row.task_status, 'in_progress', 'agent')

      // 写前相位增量断言（受影响 feature——漂移即整体回滚，承重防护；律四：proposal 容器
      // 无相位域 → 守卫与重算整体跳过——resolvePhaseGuardFeature 单源判别）
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

      db.prepare(`UPDATE tasks SET task_status = 'in_progress', updated_at = ? WHERE id = ?`).run(now, row.id)

      // 相位重算（§6-29 触发器清单含 claimTask——pending 池入活跃集 → in-progress）
      if (feature !== undefined) {
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
    }

    // ⑤ claim 记录（digest 落库——全文不入库 §6-11；重入 from/to 空——无状态效应，同 add 形制）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, dispatch_digest, actor, session_id,
         created_at, updated_at)
       VALUES (?, 'claim', ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(row.id, reclaimed ? null : row.task_status, reclaimed ? null : 'in_progress', digest, input.sessionId, now, now)

    // ⑥ links upsert-ignore（claim = 唯一写源；同任务同会话幂等，跨会话重试自然累积）
    db.prepare(
      `INSERT OR IGNORE INTO task_session_links (task_id, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(row.id, input.sessionId, now, now)

    // ⑦ 快照（fresh claim 写后重读——taskStatus/updatedAt 新值；重入行原样）
    return {
      task: toTaskSnapshot(reclaimed ? row : resolveTaskById(db, input.projectId, row.id)),
      dispatchPrompt,
      digest,
      reclaimed,
    }
  })

  // 事务提交后 emitTasksChanged（四域写后事件——Z1 出口纯读不发射）
  if (result.task !== null) deps.events.emitTasksChanged(input.projectId)
  return result
}
