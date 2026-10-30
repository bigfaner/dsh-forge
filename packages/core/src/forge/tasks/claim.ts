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
// 并发与重入域（tech-design Interface 1 裁决）：就绪选择仅扫 pending 池（Hard Rule——S3 恢复
// 径不经本函数：adopt 定向领取按 TaskRef 直查，就绪选择代码零改动）；in_progress 幂等重入
// 仅限显式 taskRef、adopt 或 links 已含本会话——无 taskRef/adopt 的盲选不领 in_progress
// （双 dispatcher 并发不双派发）；无就绪任务 → { task: null, … } Z1 出口信号
// （run-tasks 循环等待/收工判据——纯读零写入，不发射事件）。
// S3（run-tasks-host-command）：adopt 定向领取（忽略 links——接管 in_progress/interrupted，
// interrupted → in_progress 经矩阵新边）+ loopSourced 循环来源标记（claim 记录持久痕迹）。
//
// 就绪选择（§6-35⑧ 用户裁决「沿一条分支执行，遇阻塞换支」）：分支延续优先（最近满足任务
// 的就绪直接后继——执行上下文局部性）→ fix 优先键（block_source 挂接的 fix-N 前缀——仅
// 同轮就绪集内比较，不跨轮饿死）→ priority（P0 > P1 > P2 > 缺省）→ 创建序。
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
import { DependenciesUnmetError, InvalidTransitionError, TaskNotFoundError } from './errors.js'
import { assertPhaseInvariant, deriveFeaturePhase } from './phase-deriver.js'
import { composeDispatchPrompt } from './prompt/compose.js'
import { assertNoBareInterpolation, composePersona, composePersonaWithProfile } from './prompt/persona.js'
import type { TaskType } from '@dsh-forge/contracts'
import { dispatchDigest } from './prompt/digest.js'
import {
  TASK_COLUMNS,
  resolvePhaseGuardFeature,
  resolveTaskById,
  resolveTaskRef,
  toTaskSnapshot,
  type TaskStorageRow,
} from './query.js'
import {
  SATISFYING_TASK_STATUSES,
  assertTransitionAllowed,
  transitionTargets,
} from './state-machine.js'

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

/** fix 优先键（改进 2——block_source 挂接的 fix-N 前缀任务；仅同轮就绪集内排序，不跨轮饿死：
 *  每轮 claim 从 pending 池移除一行，fix 只在与普通任务同轮就绪时赢，普通任务下轮照常领出） */
const FIX_FIRST = `(CASE WHEN t.local_id LIKE 'fix-%' THEN 0 ELSE 1 END)`

/** Z1 出口（无就绪任务——纯读零变更；dispatchPrompt/digest 空串、reclaimed=false） */
function noReadyExit(): ClaimTaskResult {
  return { task: null, dispatchPrompt: '', persona: '', digest: '', reclaimed: false }
}

/**
 * 盲选重入解析（C1）：本会话 links 已挂接的 in_progress 任务（最新挂接优先——恢复「本会话
 * 最近派发的活」）；缺席 → undefined（盲选不领他会话 in_progress——双 dispatcher 不双派发）。
 * scope 感知（M3 2.4 接线）：source 在场 = 容器限定派发——仅回领同容器（source_kind + slug
 * 匹配）挂接行；本会话在全池时代领过的他容器 in_progress 不被回领（跨容器活不被 scoped
 * 派发劫持）。source 缺席 = 重入语义零变化（全库缺省）。
 */
function latestInProgressBySession(
  db: Database.Database,
  sessionId: string,
  source: ContainerRef | undefined,
): TaskStorageRow | undefined {
  const linked = db
    .prepare<unknown[], { task_id: string }>(
      `SELECT task_id FROM task_session_links WHERE session_id = ? ORDER BY id DESC`,
    )
    .all(sessionId)
  for (const { task_id } of linked) {
    const row = taskById(db, task_id)
    if (row?.task_status !== 'in_progress') continue // 最新挂接优先（恢复本会话最近派发的活）
    if (source !== undefined && (row.source_kind !== source.kind || row.slug !== source.slug)) {
      continue // scoped 派发：跳过他容器挂接行
    }
    return row
  }
  return undefined
}

/**
 * 就绪选择（§6-35⑧）：①分支延续——范围内最近满足任务（completed/skipped，updated_at 最新）
 * 的就绪 pending 直接后继（多后继时 fix 优先）；②无延续 → 全局就绪 pending 池按
 * fix 优先 → priority → 创建序。
 * 仅扫 pending 池（Hard Rule）；scope = 容器限定（M3 2.4：source_kind + slug 双列判别——
 * 成链撞键下 kind 可分；slug 列 ≡ 容器 slug 不变量）。scope 缺席 = 全库就绪池
 * （contracts ClaimTaskInput 缺省语义）；命中容器无就绪任务 → Z1 出口。
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
         ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
      )
      .get(anchor.id)
    if (successor !== undefined) return taskById(db, successor.id)
  }

  // ② 全局就绪池：priority → 创建序
  const ready = db
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM tasks t WHERE t.task_status = 'pending'${scope} AND ${READY_PREDICATE}
       ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
    )
    .get(...scopeArgs)
  if (ready !== undefined) return taskById(db, ready.id)

  // ③ gate 弹性兜底（task-pause-primitive §2.2-2）：blocked 的 gate 卡且前置全 ∈ 满足集
  //    （READY_PREDICATE 同判定）→ 进就绪池；领取时以 'core' actor 补 blocked→pending 转移。
  //    普通（非 gate）blocked 卡不进——就绪池语义单一（用户裁决永久特判）。
  const gate = db
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM tasks t WHERE t.task_status = 'blocked' AND t.task_type = 'gate'${scope} AND ${READY_PREDICATE}
       ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
    )
    .get(...scopeArgs)
  return gate === undefined ? undefined : taskById(db, gate.id)
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

  // 事务外纯读段：目标解析 + 守卫 + 组装 + 档案取用（bug 46f106c5——档案取用是纯读、
  // 不依赖事务内一致性；异步挂起不得落在 BEGIN IMMEDIATE 之后的窗口内，否则任何并发写
  // 动词在此单连接上 BEGIN 即抛「cannot start a transaction within a transaction」）。
  // Root cause: better-sqlite3 单连接无互斥面，事务窗口跨 await 即向并发暴露未闭合事务。
  // ① 目标解析：adopt 定向领取（S3——循环恢复径：按 TaskRef 直查接管既有 in_progress/
    //    interrupted，忽略 session links——重启后主会话新 id 天然无 links，直查即接管）；
    //    显式 taskRef（agent 自然键 UNIQUE 查捞）；盲选 = 本会话 in_progress 重入 → 就绪选择
    //    （M3 2.4：容器限定盲选双轨落地——source_kind + slug 判别，proposal 容器限定照常；
    //    重入同承 scope——他容器挂接行跳过，scoped 派发不劫持全池时代的跨容器活）
    let gateElastic = false
    let row: TaskStorageRow | undefined
    if (input.adopt !== undefined) {
      row = resolveTaskRef(db, input.projectId, input.adopt)
    } else if (input.taskRef !== undefined) {
      row = resolveTaskRef(db, input.projectId, input.taskRef)
    } else {
      row = latestInProgressBySession(db, input.sessionId, input.source) ?? selectReadyTask(db, input.source)
      // 盲选仅 gate 弹性池可达 blocked（pending 池全为 pending）——命中即弹性领取
      gateElastic = row?.task_status === 'blocked'
    }
    if (row === undefined) return noReadyExit() // Z1 出口（纯读零变更，不发射事件）

    // ①½ 循环独占守卫（S1c——可选，外部 claim 传入；宿主循环自身的 loopSourced claim 不
    //    携带）：目标解析命中即判，位于一切写入之前。拒绝径 = 守卫抛错 → 单事务整体回滚
    //    （转移/claim 记录/links 零状态残留）；守卫的分类与指引归提供方（plugin 独占面）。
    input.exclusivityGuard?.({
      sourceKind: row.source_kind,
      slug: row.slug,
      localId: row.local_id,
      taskStatus: row.task_status,
    })

    // ①¾ gate 弹性补转移（task-pause-primitive §2.2-2）：以 'core' actor 补 blocked→pending
    //    转移（auto-restore 审计落时间线——复用恢复钩子既有词汇），随后按 pending 正常 claim。
    if (gateElastic) {
      db.prepare(
        `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
         VALUES (?, 'auto-restore', 'blocked', 'pending', 'core', ?, ?)`,
      ).run(row!.id, now, now)
      db.prepare(`UPDATE tasks SET task_status = 'pending', updated_at = ? WHERE id = ?`).run(now, row!.id)
      row = { ...row!, task_status: 'pending', updated_at: now }
    }

    // ② 守卫（一切路径——含重入：前置回归即拒）
    const prereqs = readPrerequisiteSnapshot(db, row.id)
    assertDependenciesMet(prereqs)

    // ③ dispatchPrompt 合成（领取瞬间取数——BLOCKERS 快照 + PHASE_SUMMARY 相位机注入 +
    //    fix 源标记谱系水化 + 任务规格内嵌（5.3：TITLE/GOAL/ACCEPTANCE_CRITERIA——S2b
    //    DESCRIPTION 键更名 GOAL；worker 收窄面禁 queryTask 且 M3 task_file 列砍除，
    //    本合成 = 任务定义唯一到达面）+
    //    VARS 行（vars_json 解码——SKIP_EVAL_GATE/fix 链上下文的唯一送达面）；
    //    M2 task_file 列砍除——taskFile 缺席省行）
    const sourceRow = row.source_task_id === null ? undefined : taskById(db, row.source_task_id)
    const sourceRef = sourceRow === undefined ? undefined : { slug: sourceRow.slug, localId: sourceRow.local_id }
    // worker-exec-evidence-replay 1.3 + disc 效度戳：续跑指针领取瞬间探测（证据位 resume.md
    // 在盘 → EVIDENCE 行——重入派发 brief 自动携带；效度戳机械比对：一致 = 复用、漂移 =
    // stale 规则段强制重跑；缺席 = 首跑零行）
    const evidenceState = deps.resolveEvidencePointer?.(input.projectId, row.slug, row.local_id, input.checkoutRoot)
    const dispatchPrompt = composeDispatchPrompt({
      slug: row.slug,
      localId: row.local_id,
      // M3 2.4：SOURCE 容器语境行（任务带容器出厂——Interface 1；slug ≡ 容器 slug 不变量
      // 使行内 slug 直取任务行 slug）
      source: { kind: row.source_kind, slug: row.slug },
      title: row.title,
      ...(row.task_desc !== null ? { goal: row.task_desc } : {}),
      ...(row.ac_json !== null ? { acceptanceCriteria: JSON.parse(row.ac_json) as readonly string[] } : {}),
      ...(row.vars_json !== null ? { vars: JSON.parse(row.vars_json) as Record<string, string> } : {}),
      taskType: row.task_type,
      // prompt-input 面（合成 dispatch prompt 文本——非 tool JSON 返回）：`?? undefined`
      // 留任无害（提案 tool-row-lossless-json-fix 处置口径）；tool 返回面由 dispatch-task.ts
      // 返回映射处条件展开重映射，不透传本对象。
      priority: (row.priority as TaskPriority | null) ?? undefined,
      coverage: row.coverage ?? undefined,
      phaseSummary: derivePhaseSummary(db, row),
      blockers: prereqs.length > 0 ? prereqs : undefined,
      // main_session 砍除（M3 裁决⑦）：标记行不再有 main-session 分支（1.2 schema 直改伴随）
      breaking: row.breaking === 1,
      sourceTask: sourceRef,
      ...(evidenceState !== undefined
        ? { evidencePointer: evidenceState.pointer, evidenceStale: evidenceState.stale }
        : {}),
      // 改进7（e2e 取证债）：红灯基线清单随简报递达——调用方（循环入场基线门）领取瞬间传入
      ...(input.e2eBaselineRedCases !== undefined ? { e2eBaselineRedCases: input.e2eBaselineRedCases } : {}),
    })
    const digest = dispatchDigest(dispatchPrompt)

    // ③b worker persona 合成（expert-squad-forge 1.3 两段组装——档案人格段 + 程序段；
    //     经 SubagentStartRequest.persona 落子会话 system 面。合成同在领取瞬间，与简报同源）。
    //     档案取用经注入面（键解析 = settings experts.mapping 覆盖 → 随包预设映射——
    //     plugin-forge 1.2/1.13 装配；预设缺键且无覆盖 = undefined，未用类型不阻断）：缺失/
    //     禁用档案 fail-loud 抛错（消息含专家键名）→ 一切写入之前抛出，任务留 pending、
    //     无空 persona；取用面缺席或返回 undefined（experts 未装配 / 未用类型）= 形态兼容，
    //     persona 仅程序段。
    //     追加轮：任务目录锚点节（容器目录树/logs 锚点——绝对路径唯一承载处；检出根唯一权威
    //     = worker 会话 cwd；persona 纪律句只指称 `forge.project_logs_dir` 变量）非空追加尾部；缺席依赖 = 形态兼容。
    const complexity = (row.complexity ?? 'medium') as Parameters<typeof composePersona>[1]
    // expert-squad-forge-2 纳入 4：claim 变量路由——任务变量 expert 携带专家键时优先于
    // 类型映射与 settings 覆盖取档（键 = 程序派生单点注入面，非用户手填）；键指向不存在/
    // 禁用档案 = 取用面 fail-loud 抛错（消息含键名）→ 一切写入之前中断，任务留 pending。
    // FAIL-2 修正（expert-squad-forge-2 fix-4）：本段抛错时附带任务身份锚（data.taskRef）——
    // 循环驱动器据此把错误转交处置阶梯而非整循环异常终止。
    let personaWithAnchors: string
    try {
      const claimVars = row.vars_json !== null ? (JSON.parse(row.vars_json) as Record<string, string>) : undefined
      const expertKey = typeof claimVars?.expert === 'string' && claimVars.expert !== '' ? claimVars.expert : undefined
      const profile = await deps.resolveExpertProfile?.(row.task_type, expertKey)
      const persona =
        profile === undefined
          ? composePersona(row.task_type as TaskType, complexity)
          : composePersonaWithProfile(profile, row.task_type as TaskType, complexity)
      const workerContext = deps.resolveWorkerContext?.(input.projectId, { kind: row.source_kind, slug: row.slug }, row.local_id)
      personaWithAnchors = workerContext !== undefined && workerContext !== '' ? `${persona}\n\n${workerContext}` : persona
      // 追加轮尾部拼接后的最终全文防护（expert-squad-forge 1.10——锚点节文本同为渲染产物，
      // 同受上游严格插值约束；拼接后不再复核 = 防护缺口）
      assertNoBareInterpolation(personaWithAnchors, 'claim:personaWithAnchors')
    } catch (cause) {
      throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), {
        data: { phase: 'claim-persona', taskRef: { slug: row.slug, localId: row.local_id }, taskTitle: row.title },
      })
    }

  // ── 事务段（纯同步写窗口：转移 + claim 记录 + links + 快照。窗口内零 await——
  //    better-sqlite3 单连接上同步执行不向并发暴露未闭合事务）。
  const result = withTransaction(db, (): ClaimTaskResult => {
    // ④ 转移（pending/blocked → in_progress）或幂等重入（in_progress 无状态转移，C1）
    // Root cause（bug 21764a56）：row 是事务外快照（档案取用 await 窗口内他会话可完成同任务
    // claim）——判定与 UPDATE 必须基于事务体内重读的当前态；漂移入 in_progress（他会话并发
    // 领走）即拒绝，不产生重复 claim 记录/双会话链接。adopt 径例外（S3 接管语义——忽略 links
    // 定向恢复，状态漂移不改变接管意图）；无漂移的快照即 in_progress 重入（显式 taskRef /
    // adopt / links 已含本会话——目标解析面已限定）不受波及。
    const current = taskById(db, row.id)
    if (current === undefined) {
      throw new TaskNotFoundError({ projectId: input.projectId, taskId: row.id })
    }
    const drifted = current.task_status !== row.task_status
    const reclaimed = current.task_status === 'in_progress'
    if (!reclaimed) {
      // agent 面矩阵先验（pending/blocked → in_progress 合法；终态/挂起态拒绝——基于重读态）
      assertTransitionAllowed(current.task_status, 'in_progress', 'agent')

      // 写前相位增量断言（受影响 feature——漂移即整体回滚，承重防护；律四：proposal 容器
      // 无相位域 → 守卫与重算整体跳过——resolvePhaseGuardFeature 单源判别）
      const feature = resolvePhaseGuardFeature(db, current)
      if (feature !== undefined) {
        const before = readPhaseInput(db, feature.id)
        assertPhaseInvariant({
          featureStatus: feature.feature_status,
          docKinds: before.docKinds,
          taskStatuses: before.taskStatuses,
          featureSlug: feature.slug,
        })
      }

      const changed = db
        .prepare(`UPDATE tasks SET task_status = 'in_progress', updated_at = ? WHERE id = ? AND task_status = ?`)
        .run(now, current.id, current.task_status)
      if (changed.changes === 0) {
        // 条件 UPDATE 防线：快照态被并发改写即拒（同事务同步窗口内理论不可达——纵深防御）
        throw new InvalidTransitionError({
          current: current.task_status,
          to: 'in_progress',
          face: 'agent',
          allowed: transitionTargets(current.task_status, 'agent'),
        })
      }

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
    } else if (drifted && input.adopt === undefined) {
      // 快照漂移入 in_progress：他会话并发领走（TOCTOU）——非 adopt 径拒绝（幂等重入授权
      // 不足：本会话无 links、无显式接管语义）
      throw new InvalidTransitionError({
        current: 'in_progress',
        to: 'in_progress',
        face: 'agent',
        allowed: transitionTargets('in_progress', 'agent'),
      })
    }

    // ⑤ claim 记录（digest 落库——全文不入库 §6-11；重入 from/to 空——无状态效应，同 add 形制；
    //    S3 loop_sourced = 循环来源标记持久痕迹（TASK_RECORD_LOOP_SOURCED 单点定义——
    //    仅 reconcileInterrupted 消费，其余读面零感知）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, dispatch_digest, loop_sourced, actor, session_id,
         created_at, updated_at)
       VALUES (?, 'claim', ?, ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(
      row.id,
      reclaimed ? null : current.task_status,
      reclaimed ? null : 'in_progress',
      digest,
      input.loopSourced === true ? 1 : 0,
      input.sessionId,
      now,
      now,
    )

    // ⑥ links upsert-ignore（claim = 唯一写源；同任务同会话幂等，跨会话重试自然累积）
    db.prepare(
      `INSERT OR IGNORE INTO task_session_links (task_id, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(row.id, input.sessionId, now, now)

    // ⑦ 快照（fresh claim 写后重读——taskStatus/updatedAt 新值；重入行原样）
    return {
      task: toTaskSnapshot(reclaimed ? current : resolveTaskById(db, input.projectId, row.id)),
      dispatchPrompt,
      persona: personaWithAnchors,
      digest,
      reclaimed,
    }
  })

  // 事务提交后 emitTasksChanged（四域写后事件——Z1 出口纯读不发射）
  if (result.task !== null) deps.events.emitTasksChanged(input.projectId)
  return result
}
