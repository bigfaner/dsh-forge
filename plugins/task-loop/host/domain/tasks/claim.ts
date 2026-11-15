// claimTask——任务域派发动词（core forge/tasks/claim.ts 直迁——plugin-task-loop 1.7 内联 +
// 容器语义 slug 化改造）。定位：任务域。actor 由通道推断：claimTask = tool 专属动词，
// claim 记录 actor 恒 'plugin-tool'。
//
// slug 化改造面：
//   · 容器限定 = project_key + slug 双列（source_kind 判别词退役）；
//   · exclusivityGuard 目标投影（registry LoopSourceRef 键面）slug 化：{ slug, localId,
//     taskStatus }——sourceKind 判别词退役；
//   · PHASE_SUMMARY 相位机注入随 features 表退役摘除（数据源已断——code-design §简报差量）；
//   · resolveWorkerContext 注入面 source 形 → slug 单键。
//
// 单事务全成全败（Hard Rule）：目标解析（显式 taskRef / 盲选）→ 守卫（依赖全 ∈ {completed,
// skipped}）→ dispatchPrompt 合成（领取瞬间取数：BLOCKERS 快照）→ 转移（pending/blocked →
// in_progress，agent 面矩阵先验）或幂等重入 → claim 记录（dispatch_digest）→ links
// upsert-ignore；闭包尾部（提交后）emitTasksChanged。就绪选择仅扫 pending 池（Hard Rule）；
// 无就绪任务 → { task: null } Z1 出口信号（纯读零写入，不发射事件）。
import type Database from "better-sqlite3";
import type { TaskStatus } from "@dsh-forge/contracts";
import { VALIDATION_TASK_TYPES } from "@dsh-forge/contracts";
import { withTransaction } from "@dsh-forge/lib-db";
import { DependenciesUnmetError, InvalidTransitionError, TaskNotFoundError } from "./errors.js";
import { GATE_SQL, assertContainerChainSettled } from "./phase-gate.js";
import { composeDispatchPrompt } from "./prompt/compose.js";
import { assertNoBareInterpolation, composePersona, composePersonaWithProfile } from "./prompt/persona.js";
import { dispatchDigest } from "./prompt/digest.js";
import {
  TASK_COLUMNS,
  resolveTaskById,
  resolveTaskRef,
  toTaskSnapshot,
  type TaskStorageRow,
} from "./query.js";
import {
  SATISFYING_TASK_STATUSES,
  assertTransitionAllowed,
  transitionTargets,
} from "./state-machine.js";
import type {
  ContainerRef,
  TaskPrerequisiteSummary,
  TaskPriority,
  TaskRef,
  TasksVerbDeps,
  TestBaselineBrief,
} from "./types.js";

export type { TasksVerbDeps };

/** id 直查（内部水化面——命中已由查询构造保证，未命中 = 漂移不可达） */
function taskById(db: Database.Database, taskId: string): TaskStorageRow | undefined {
  return db.prepare<unknown[], TaskStorageRow>(`SELECT ${TASK_COLUMNS} FROM task_tasks WHERE id = ?`).get(taskId);
}

/** 分支①排除验证类（validation 族出局延续优先，落②全局池竞争——词表生成片段） */
const BRANCH1_EXCLUDE_VALIDATION = `t.task_type NOT IN (${VALIDATION_TASK_TYPES.map((t) => `'${t}'`).join(", ")})`;

/** 就绪判定谓词（守卫与就绪集共用同判定）+ 容器实现链阶段门 GATE_SQL */
const READY_PREDICATE = `NOT EXISTS (
  SELECT 1 FROM task_edges e JOIN task_tasks p ON p.id = e.prerequisite_id
  WHERE e.task_id = t.id AND p.task_status NOT IN ('completed', 'skipped'))
AND ${GATE_SQL("t")}`;

/** priority 线性序（P0 > P1 > P2 > 缺省——NULL 排末位） */
const PRIORITY_RANK = `CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`;

/** fix 优先键（block_source 挂接的 fix 任务——isFixTask 单源谓词 SQL 面 = fix_of_task_id IS NOT NULL） */
const FIX_FIRST = `(CASE WHEN t.fix_of_task_id IS NOT NULL THEN 0 ELSE 1 END)`;

/** Z1 出口（无就绪任务——纯读零变更；dispatchPrompt/persona 空串、reclaimed=false） */
function noReadyExit(): ClaimTaskResult {
  return { task: null, dispatchPrompt: "", persona: "", digest: "", reclaimed: false };
}

/** claim 入参（slug 化终态——source 容器限定单键 slug） */
export interface ClaimTaskInput {
  readonly projectKey: string;
  readonly sessionId: string;
  /** 盲选容器限定（缺席 = 全库就绪池；在场 = 仅该容器——slug 单键） */
  readonly source?: ContainerRef;
  /** 显式自然键领取 */
  readonly taskRef?: TaskRef;
  /** adopt 定向领取（循环恢复径——接管既有 in_progress/interrupted，忽略 links） */
  readonly adopt?: TaskRef;
  /** 循环来源标记（claim 记录持久痕迹） */
  readonly loopSourced?: boolean;
  /** 效度比对检出根（缺席 = 机制惰性不判） */
  readonly checkoutRoot?: string;
  /** 循环独占守卫（S1c——registry LoopSourceRef slug 化键面：{ slug, localId, taskStatus }） */
  readonly exclusivityGuard?: (target: {
    readonly slug: string;
    readonly localId: string;
    readonly taskStatus: TaskStatus;
  }) => void;
  /** e2e 红灯基线清单（循环入场基线门——领取瞬间传入） */
  readonly e2eBaselineRedCases?: readonly string[];
  /** 测试基线两形态载荷（驱动器 claim 时现查合成） */
  readonly testBaseline?: TestBaselineBrief;
}

export interface ClaimTaskResult {
  readonly task: ReturnType<typeof toTaskSnapshot> | null;
  readonly dispatchPrompt: string;
  readonly persona: string;
  readonly digest: string;
  readonly reclaimed: boolean;
  readonly expertKey?: string;
}

/**
 * 盲选重入解析（C1）：本会话 links 已挂接的 in_progress 任务（最新挂接优先）；缺席 →
 * undefined（盲选不领他会话 in_progress——双 dispatcher 不双派发）。source 在场 = 容器限定
 * （project_key + slug 双列）——仅回领同容器挂接行。
 */
function latestInProgressBySession(
  db: Database.Database,
  projectKey: string,
  sessionId: string,
  source: ContainerRef | undefined,
): TaskStorageRow | undefined {
  const linked = db
    .prepare<unknown[], { task_id: string }>(
      `SELECT task_id FROM task_session_links WHERE session_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(sessionId);
  for (const { task_id } of linked) {
    const row = taskById(db, task_id);
    if (row?.task_status !== "in_progress") continue;
    if (row.project_key !== projectKey) continue;
    if (source !== undefined && row.slug !== source.slug) continue;
    return row;
  }
  return undefined;
}

/**
 * 就绪选择：①分支延续——范围内最近满足任务的就绪 pending 直接后继（多后继时 fix 优先）；
 * ②无延续 → 就绪 pending 池按 fix 优先 → priority → 创建序；③ gate 弹性兜底（blocked 的
 * gate 卡且前置全满足 → 进就绪池，领取时以 'core' actor 补 blocked→pending 转移）。
 * 仅扫 pending 池（Hard Rule）；scope = project_key + slug 容器限定；缺席 = 全库。
 */
function selectReadyTask(db: Database.Database, projectKey: string, source: ContainerRef | undefined): TaskStorageRow | undefined {
  const scope = source === undefined ? "" : ` AND t.slug = ?`;
  const scopeArgs = source === undefined ? [] : [source.slug];

  // ① 分支延续锚点：最近满足任务（同 scope）
  const anchor = db
    .prepare<unknown[], { id: string }>(
      `SELECT id FROM task_tasks t WHERE t.project_key = ? AND t.task_status IN ('completed', 'skipped')${scope}
       ORDER BY t.updated_at DESC, t.id DESC LIMIT 1`,
    )
    .get(projectKey, ...scopeArgs);
  if (anchor !== undefined) {
    const successor = db
      .prepare<unknown[], { id: string }>(
        `SELECT t.id FROM task_edges e JOIN task_tasks t ON t.id = e.task_id
         WHERE e.prerequisite_id = ? AND t.task_status = 'pending'
           AND ${BRANCH1_EXCLUDE_VALIDATION} AND ${READY_PREDICATE}
         ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
      )
      .get(anchor.id);
    if (successor !== undefined) return taskById(db, successor.id);
  }

  // ② 就绪池：fix 优先 → priority → 创建序
  const ready = db
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM task_tasks t WHERE t.project_key = ? AND t.task_status = 'pending'${scope} AND ${READY_PREDICATE}
       ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
    )
    .get(projectKey, ...scopeArgs);
  if (ready !== undefined) return taskById(db, ready.id);

  // ③ gate 弹性兜底（普通 blocked 卡不进——就绪池语义单一）
  const gate = db
    .prepare<unknown[], { id: string }>(
      `SELECT t.id FROM task_tasks t WHERE t.project_key = ? AND t.task_status = 'blocked' AND t.task_type = 'gate'${scope} AND ${READY_PREDICATE}
       ORDER BY ${FIX_FIRST}, ${PRIORITY_RANK}, t.created_at, t.id LIMIT 1`,
    )
    .get(projectKey, ...scopeArgs);
  return gate === undefined ? undefined : taskById(db, gate.id);
}

/** 前置快照（守卫判定 + BLOCKERS 注入同源——领取瞬间取数） */
function readPrerequisiteSnapshot(db: Database.Database, taskId: string): TaskPrerequisiteSummary[] {
  return db
    .prepare<unknown[], TaskPrerequisiteSummary>(
      `SELECT t.slug AS slug, t.local_id AS localId, t.task_status AS taskStatus
       FROM task_edges e JOIN task_tasks t ON t.id = e.prerequisite_id
       WHERE e.task_id = ? ORDER BY t.slug, t.local_id`,
    )
    .all(taskId);
}

/**
 * claim 守卫（依赖终态守卫）：前置全 ∈ {completed, skipped} 才放行；未满足 →
 * ERR_DEPENDENCIES_UNMET。适用一切 claim 路径（含幂等重入）。
 */
function assertDependenciesMet(prereqs: readonly TaskPrerequisiteSummary[]): void {
  const unmet = prereqs.filter((p) => !(SATISFYING_TASK_STATUSES as readonly string[]).includes(p.taskStatus));
  if (unmet.length > 0) throw new DependenciesUnmetError({ unmet });
}

/** Interface 1 claimTask：守卫 + 就绪选择 + dispatchPrompt 合成 + links + 幂等重入 */
export async function claimTask(deps: TasksVerbDeps, input: ClaimTaskInput): Promise<ClaimTaskResult> {
  const db = deps.db;
  const now = new Date().toISOString();

  // 事务外纯读段（档案取用纯读不落事务窗口：单连接 BEGIN IMMEDIATE 之前完成——bug 46f106c5）。
  // ① 目标解析：adopt 定向领取 / 显式 taskRef / 盲选 = 本会话 in_progress 重入 → 就绪选择
  let gateElastic = false;
  let row: TaskStorageRow | undefined;
  if (input.adopt !== undefined) {
    row = resolveTaskRef(db, input.projectKey, input.adopt);
  } else if (input.taskRef !== undefined) {
    row = resolveTaskRef(db, input.projectKey, input.taskRef);
  } else {
    row = latestInProgressBySession(db, input.projectKey, input.sessionId, input.source) ?? selectReadyTask(db, input.projectKey, input.source);
    gateElastic = row?.task_status === "blocked";
  }
  if (row === undefined) return noReadyExit(); // Z1 出口（纯读零变更，不发射事件）
  const target: TaskStorageRow = row;

  // ①¼ fresh-claim 容器阶段门守卫（门作用域 = pending→in_progress 转移时点；adopt 径与
  //    幂等重入径豁免）。事务外纯读段快照判定。
  if (target.task_status === "pending") {
    assertContainerChainSettled(db, input.projectKey, target);
  }

  // ①½ 循环独占守卫（S1c——slug 化键面；宿主循环自身的 loopSourced claim 不携带）：
  //    目标解析命中即判，位于一切写入之前。守卫抛错 = 整体拒绝零状态残留。
  input.exclusivityGuard?.({
    slug: target.slug,
    localId: target.local_id,
    taskStatus: target.task_status,
  });

  // ①¾ gate 弹性补转移（blocked→pending，'core' actor 审计）
  let claimedRow: TaskStorageRow = target;
  if (gateElastic) {
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, actor, created_at, updated_at)
       VALUES (?, 'auto-restore', 'blocked', 'pending', 'core', ?, ?)`,
    ).run(target.id, now, now);
    db.prepare(`UPDATE task_tasks SET task_status = 'pending', updated_at = ? WHERE id = ?`).run(now, target.id);
    claimedRow = { ...target, task_status: "pending", updated_at: now };
  }

  // ② 守卫（一切路径——含重入：前置回归即拒）
  const prereqs = readPrerequisiteSnapshot(db, target.id);
  assertDependenciesMet(prereqs);

  // ③ dispatchPrompt 合成（领取瞬间取数——BLOCKERS 快照 + 任务规格内嵌 + CONTEXT 行；
  //    PHASE_SUMMARY 行随相位机退役摘除）
  const sourceRow = target.fix_of_task_id === null ? undefined : taskById(db, target.fix_of_task_id);
  const sourceRef = sourceRow === undefined ? undefined : { slug: sourceRow.slug, localId: sourceRow.local_id };
  const evidenceState = deps.resolveEvidencePointer?.(input.projectKey, target.slug, target.local_id, input.checkoutRoot);
  const dispatchPrompt = composeDispatchPrompt({
    slug: target.slug,
    localId: target.local_id,
    title: target.title,
    ...(target.brief !== null ? { brief: target.brief } : {}),
    ...(target.ac_json !== null ? { acceptanceCriteria: JSON.parse(target.ac_json) as readonly string[] } : {}),
    ...(target.scope_json !== null ? { scope: safeParseScope(target.scope_json) } : {}),
    ...(target.context_json !== null ? { context: JSON.parse(target.context_json) as Record<string, string> } : {}),
    taskType: target.task_type,
    priority: (target.priority as TaskPriority | null) ?? undefined,
    coverage: target.coverage_threshold ?? undefined,
    blockers: prereqs.length > 0 ? prereqs : undefined,
    breaking: target.breaking === 1,
    sourceTask: sourceRef,
    ...(evidenceState !== undefined
      ? { evidencePointer: evidenceState.pointer, evidenceStale: evidenceState.stale }
      : {}),
    ...(input.e2eBaselineRedCases !== undefined ? { e2eBaselineRedCases: input.e2eBaselineRedCases } : {}),
    ...(input.testBaseline !== undefined ? { testBaseline: input.testBaseline } : {}),
  });
  const digest = dispatchDigest(dispatchPrompt);

  // ③b worker persona 合成（档案人格段 + 程序段；档案 fail-loud 抛错带任务身份锚 data.taskRef）
  const complexity = (target.complexity ?? "medium") as Parameters<typeof composePersona>[1];
  let personaWithAnchors: string;
  let resolvedExpertKey: string | undefined;
  try {
    const claimContext = target.context_json !== null ? (JSON.parse(target.context_json) as Record<string, string>) : undefined;
    const expertKey = typeof claimContext?.expert === "string" && claimContext.expert !== "" ? claimContext.expert : undefined;
    const profile = await deps.resolveExpertProfile?.(target.task_type, expertKey);
    resolvedExpertKey = expertKey ?? profile?.expertKey;
    const persona =
      profile === undefined
        ? composePersona(target.task_type, complexity)
        : composePersonaWithProfile(profile, target.task_type, complexity);
    const workerContext = deps.resolveWorkerContext?.(input.projectKey, { slug: target.slug }, target.local_id);
    personaWithAnchors = workerContext !== undefined && workerContext !== "" ? `${persona}\n\n${workerContext}` : persona;
    assertNoBareInterpolation(personaWithAnchors, "claim:personaWithAnchors");
  } catch (cause) {
    throw Object.assign(cause instanceof Error ? cause : new Error(String(cause)), {
      data: { phase: "claim-persona", taskRef: { slug: target.slug, localId: target.local_id }, taskTitle: target.title },
    });
  }

  // ── 事务段（纯同步写窗口：转移 + claim 记录 + links + 快照；窗口内零 await）
  const result = withTransaction(db, (): ClaimTaskResult => {
    // ④ 转移或幂等重入（判定与 UPDATE 基于事务体内重读的当前态——TOCTOU 防线）
    const current = taskById(db, claimedRow.id);
    if (current === undefined) {
      throw new TaskNotFoundError({ projectKey: input.projectKey, taskId: claimedRow.id });
    }
    const drifted = current.task_status !== claimedRow.task_status;
    const reclaimed = current.task_status === "in_progress";
    if (!reclaimed) {
      assertTransitionAllowed(current.task_status, "in_progress", "agent");
      const changed = db
        .prepare(`UPDATE task_tasks SET task_status = 'in_progress', updated_at = ? WHERE id = ? AND task_status = ?`)
        .run(now, current.id, current.task_status);
      if (changed.changes === 0) {
        throw new InvalidTransitionError({
          current: current.task_status,
          to: "in_progress",
          face: "agent",
          allowed: transitionTargets(current.task_status, "agent"),
        });
      }
    } else if (drifted && input.adopt === undefined) {
      // 快照漂移入 in_progress：他会话并发领走（TOCTOU）——非 adopt 径拒绝
      throw new InvalidTransitionError({
        current: "in_progress",
        to: "in_progress",
        face: "agent",
        allowed: transitionTargets("in_progress", "agent"),
      });
    }

    // ⑤ claim 记录（digest 落库——全文不入库；loop_sourced 循环来源标记）
    db.prepare(
      `INSERT INTO task_records (task_id, verb, from_status, to_status, dispatch_digest, loop_sourced, actor, session_id,
         created_at, updated_at)
       VALUES (?, 'claim', ?, ?, ?, ?, 'plugin-tool', ?, ?, ?)`,
    ).run(
      claimedRow.id,
      reclaimed ? null : current.task_status,
      reclaimed ? null : "in_progress",
      digest,
      input.loopSourced === true ? 1 : 0,
      input.sessionId,
      now,
      now,
    );

    // ⑥ links upsert-ignore（claim = 唯一写源）
    db.prepare(
      `INSERT OR IGNORE INTO task_session_links (task_id, session_id, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(claimedRow.id, input.sessionId, now, now);

    // ⑦ 快照（fresh claim 写后重读；重入行原样）
    return {
      task: toTaskSnapshot(reclaimed ? current : resolveTaskById(db, input.projectKey, claimedRow.id)),
      dispatchPrompt,
      persona: personaWithAnchors,
      digest,
      reclaimed,
      ...(resolvedExpertKey !== undefined ? { expertKey: resolvedExpertKey } : {}),
    };
  });

  if (result.task !== null) deps.events.emitTasksChanged(input.projectKey);
  return result;
}

function safeParseScope(raw: string): Record<string, readonly string[]> | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, readonly string[]>;
  } catch {
    // 畸形 scope_json → 键缺席
  }
  return undefined;
}
