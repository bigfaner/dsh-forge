// goal-advance（plugin-spec-roadmaps 1.5，code-design §3 模块Ⓒ）——Goal 终审状态机
// 自动推进/回退写点：判定与写点分离。
//   · decideAdvance = 纯函数判定表（零 db，六分支平铺 if-return：start/advance/revert/hold×3）；
//   · advanceGoalsIfDue = 写点动词（投影事务外预筛 → 单事务内重读现值幂等边沿检测 →
//     逐 goal 两写 → Spec 级链式收口（Goals 全 completed ∧ spec in_progress → 同事务
//     awaiting_acceptance 两写）→ C4 竞窗机械自愈（revert 尾追加：spec awaiting_acceptance
//     ∧ Goals 非全 completed → 同事务 spec 回拉 in_progress））。
// 幂等性 = 现值读锚自带：goal_status 已流转且投影无回退 → decideAdvance 恒 hold；
// 事务外读仅做预筛，判定真源在事务内重读（并发双入由 sqlite 单写者 + 事务串行化兜底）。
// 失败语义（复审 C1）：推进事务失败 → emitDiag warn 留痕、动词返回 []——查询主体照常，
// 幂等边沿下次触发自然重试，零补偿机制。
import { withTransaction } from "@dsh-forge/lib-db";
import { emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";
import type { SpecDomainDb } from "../../db/connection.js";
import type { GoalRow, SpecRow } from "../../db/row-types.js";
import { goalMachine, type GoalStatus } from "../status-machines.js";
import { SpecError } from "./errors.js";
import { projectAcsStates, type AcProjectionRow, type AcSettlementsFace } from "../../tools/projection.js";

/** 诊断发射缝载荷（process 进程位由装配桥接层补齐——emitDiagOrFallback 同构）。 */
type GoalDiagPayload = Omit<DiagEventPayload, "process">;

/** 推进决策值域（判定表出参——四值封闭）。 */
export type AdvanceDecision = "start" | "advance" | "revert" | "hold";

/**
 * Goal 级 AC 投影聚面（decideAdvance 判定输入值对象——由逐 AC 投影行聚合，零 IO）：
 * 任一行 no-task-data 即整 goal 无据不判（code-design §3 分支 6「任一投影」口径）。
 */
export interface GoalAcProjection {
  /** AC 条目数（零 AC = 结构性无判据，hold） */
  readonly acCount: number;
  /** 任一 AC 投影为 no-task-data（任一投影无据即整 goal 无据不判） */
  readonly anyNoTaskData: boolean;
  /** 活动信号：任一 met/unmet/unmatched */
  readonly hasActivity: boolean;
  /** 全 met（零 AC 恒 false——零 AC 走独立 hold 分支） */
  readonly allMet: boolean;
  /** 任一 unmet / unmatched（回退信号） */
  readonly anyUnmetOrUnmatched: boolean;
}

/** 投影行清单 → Goal 级聚面（纯映射——advanceGoalsIfDue 与测试共用单源）。 */
export function projectGoalAcs(rows: readonly AcProjectionRow[]): GoalAcProjection {
  const acCount = rows.length;
  const anyNoTaskData = rows.some((r) => r.state === "no-task-data");
  const hasActivity = rows.some((r) => r.state === "met" || r.state === "unmet" || r.unmatched === true);
  const allMet = acCount > 0 && rows.every((r) => r.state === "met");
  const anyUnmetOrUnmatched = rows.some((r) => r.state === "unmet" || r.unmatched === true);
  return { acCount, anyNoTaskData, hasActivity, allMet, anyUnmetOrUnmatched };
}

/**
 * 判定纯函数（六分支全平铺——code-design §3 判定表直译，判定一眼可枚举）：
 *   ① completed 终态 → hold（人类写入域，机械永不触碰）
 *   ② 零 AC ∧ 非 completed → hold（零 AC 不触发）
 *   ③ 任一投影 no-task-data → hold（无据不判）
 *   ④ pending ∧ 活动信号 → start（开工 in_progress，台账 from='pending'）
 *   ⑤ in_progress ∧ 全 met → advance（推进 auto_reviewing）
 *   ⑥ auto_reviewing | awaiting_confirmation ∧ 存在 unmet/unmatched → revert（回退 in_progress）
 *   ⑦ 其余组合 → hold
 */
export function decideAdvance(current: GoalStatus, projection: GoalAcProjection): AdvanceDecision {
  if (current === "completed") return "hold";
  if (projection.acCount === 0) return "hold";
  if (projection.anyNoTaskData) return "hold";
  if (current === "pending" && projection.hasActivity) return "start";
  if (current === "in_progress" && projection.allMet) return "advance";
  if ((current === "auto_reviewing" || current === "awaiting_confirmation") && projection.anyUnmetOrUnmatched) {
    return "revert";
  }
  return "hold";
}

/** 决策 → 目标态（三决策全部落在 goalMachine 合法边上——边表契约测试锁定）。 */
function targetOf(decision: Exclude<AdvanceDecision, "hold">): GoalStatus {
  return decision === "advance" ? "auto_reviewing" : "in_progress";
}

/** Goal 推进动词共享依赖（三动词同形注入——装配面/测试同径组合）。 */
export interface GoalVerbDeps {
  db: SpecDomainDb["db"];
  repos: SpecDomainDb["repos"];
  generateId?: () => string;
  now?: () => string;
  /** 诊断发射缝（emitDiagOrFallback 语义——缝缺席 console 按级兜底） */
  onDiag?: (payload: GoalDiagPayload) => void;
  /** AC 投影现查缝（task-loop forgeTasks.matchAcSettlements 窄面；缺席 = no-task-data 降级） */
  acSettlementsOf?: () => AcSettlementsFace | undefined;
}

/** 单 goal 推进结果（出参——提交后才产生，事务失败零出参）。 */
export interface AdvancedGoal {
  readonly goalId: string;
  readonly from: GoalStatus;
  readonly to: GoalStatus;
  readonly decision: Exclude<AdvanceDecision, "hold">;
}

export interface AdvanceGoalsInput {
  readonly projectKey: string;
  readonly specSlug: string;
  /** 诊断 sessionId 级可得字段（调用会话在场即携带） */
  readonly sessionId?: string;
}

/** diag 事件名（AGENTS §7——功能域前缀 spec-goal）。 */
const DIAG_EVENT_ADVANCED = "spec-goal-advanced";
const DIAG_EVENT_REVERTED = "spec-goal-reverted";

/**
 * 写点动词：读 spec/goals 现值 → 投影现算（事务外预筛，同一次调用共享一次 settlements
 * 现查）→ 单事务内重读现值逐 goal 判定 + 两写 → Spec 链式收口 / C4 竞窗自愈 → 提交后
 * emitDiag + 返回推进清单。spec 不存在 = typed 拒绝（调用方 querySpec 先行定位）。
 */
export async function advanceGoalsIfDue(deps: GoalVerbDeps, input: AdvanceGoalsInput): Promise<AdvancedGoal[]> {
  const { db, repos } = deps;
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date().toISOString());
  const spec = repos.specs.getBySlug(input.projectKey, input.specSlug);
  if (spec === undefined) {
    throw new SpecError("ERR_SPEC_NOT_FOUND", `spec 不存在：${input.specSlug}`, { slug: input.specSlug });
  }

  // ①② 投影现算（事务外预筛——全 goal 共享一次 matchAcSettlements 现查；缝缺席/抛错 = 全 AC 无据降级）
  const goals = repos.specs.listGoalsBySpec(spec.id);
  const allCriteria = goals.flatMap((g) => repos.specs.listAcsByGoal(g.id).map((a) => a.criterion));
  let aggregate: Awaited<ReturnType<AcSettlementsFace["matchAcSettlements"]>> | undefined;
  try {
    const face = deps.acSettlementsOf?.();
    aggregate = face === undefined ? undefined : await face.matchAcSettlements(input.projectKey, allCriteria);
  } catch {
    aggregate = undefined;
  }
  const projectionByCriterion = new Map(
    projectAcsStates(allCriteria, aggregate).map((row) => [row.criterion, row]),
  );

  // ③ 预筛（hold 过滤——事务内仍按重读现值终判）
  const candidates = goals.map((goal) => {
    const rows = repos.specs
      .listAcsByGoal(goal.id)
      .map((a) => projectionByCriterion.get(a.criterion))
      .filter((r): r is AcProjectionRow => r !== undefined);
    return { goal, projection: projectGoalAcs(rows) };
  }).filter(({ goal, projection }) => decideAdvance(goal.goalStatus, projection) !== "hold");
  if (candidates.length === 0) return [];

  // ④⑤ 单事务两写（事务内重读现值——幂等边沿检测真源）
  let applied: AdvancedGoal[] = [];
  let specWrite: { from: SpecRow["specStatus"]; to: SpecRow["specStatus"]; note: string | null; kind: "chain" | "self-heal" } | undefined;
  try {
    ({ applied, specWrite } = withTransaction(db, () => {
      const ts = now();
      const fresh = new Map(repos.specs.listGoalsBySpec(spec.id).map((g) => [g.id, g.goalStatus]));
      const writes: AdvancedGoal[] = [];
      for (const { goal, projection } of candidates) {
        const current = fresh.get(goal.id);
        if (current === undefined) continue;
        const decision = decideAdvance(current, projection);
        if (decision === "hold") continue;
        const to = targetOf(decision);
        // 合法边兜底查（判定表与边表同源锁定——非法即 hold 不写）
        if (!goalMachine.canTransition(current, to).ok) continue;
        repos.specs.updateGoalStatus(goal.id, to, ts);
        repos.transitions.appendTransition({
          id: generateId(),
          entityKind: "goal",
          entityId: goal.id,
          fromStatus: current,
          toStatus: to,
          note: null,
          actor: "plugin-tool",
          createdAt: ts,
        });
        fresh.set(goal.id, to);
        writes.push({ goalId: goal.id, from: current, to, decision });
      }

      // Spec 级链式收口（机械段二）/ C4 竞窗机械自愈（revert 尾追加）——同事务原子
      const statusesNow = [...fresh.values()];
      const allCompleted = statusesNow.length > 0 && statusesNow.every((s) => s === "completed");
      const anyReverted = writes.some((w) => w.decision === "revert");
      const specNow = repos.specs.getBySlug(input.projectKey, input.specSlug);
      if (specNow !== undefined && allCompleted && specNow.specStatus === "in_progress") {
        repos.specs.updateStatus(specNow.id, "awaiting_acceptance", ts);
        repos.transitions.appendTransition({
          id: generateId(),
          entityKind: "spec",
          entityId: specNow.id,
          fromStatus: specNow.specStatus,
          toStatus: "awaiting_acceptance",
          note: null,
          actor: "plugin-tool",
          createdAt: ts,
        });
        specWrite = { from: specNow.specStatus, to: "awaiting_acceptance", note: null, kind: "chain" };
      } else if (specNow !== undefined && anyReverted && !allCompleted && specNow.specStatus === "awaiting_acceptance") {
        repos.specs.updateStatus(specNow.id, "in_progress", ts);
        repos.transitions.appendTransition({
          id: generateId(),
          entityKind: "spec",
          entityId: specNow.id,
          fromStatus: specNow.specStatus,
          toStatus: "in_progress",
          note: "auto: goal reverted",
          actor: "plugin-tool",
          createdAt: ts,
        });
        specWrite = { from: specNow.specStatus, to: "in_progress", note: "auto: goal reverted", kind: "self-heal" };
      }
      return { applied: writes, specWrite };
    }));
  } catch (cause) {
    // 失败语义（复审 C1）：查询主体照常——推进失败 emitDiag warn 留痕，幂等边沿下次重触发
    const message = cause instanceof Error ? cause.message : String(cause);
    emitDiagOrFallback(deps.onDiag, {
      event: DIAG_EVENT_ADVANCED,
      level: "warn",
      message: `Goal 推进事务失败（幂等边沿——下次触发自然重试，零补偿）：spec=${input.specSlug} ${message}`,
      projectId: input.projectKey,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });
    return [];
  }

  if (applied.length === 0) return [];

  // ⑥ 提交后 emitDiag（推进/回退分事件留痕）
  for (const w of applied) {
    const reverted = w.decision === "revert";
    emitDiagOrFallback(deps.onDiag, {
      event: reverted ? DIAG_EVENT_REVERTED : DIAG_EVENT_ADVANCED,
      level: "info",
      message: `Goal ${reverted ? "回退" : "推进"}：goal=${w.goalId} ${w.from} → ${w.to}（${w.decision}）spec=${input.specSlug}`,
      projectId: input.projectKey,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });
  }
  if (specWrite !== undefined) {
    emitDiagOrFallback(deps.onDiag, {
      event: specWrite.kind === "self-heal" ? DIAG_EVENT_REVERTED : DIAG_EVENT_ADVANCED,
      level: "info",
      message:
        specWrite.kind === "self-heal"
          ? `Spec 竞窗机械自愈回拉：spec=${input.specSlug} ${specWrite.from} → ${specWrite.to}（note=${specWrite.note}）`
          : `Spec 链式收口（Goals 全 completed）：spec=${input.specSlug} ${specWrite.from} → ${specWrite.to}`,
      projectId: input.projectKey,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    });
  }
  return applied;
}

/** Goal 现值定位单源（finalize/review 共用——goal 归属 spec 断言 + typed 未命中）。 */
export function locateGoal(repos: GoalVerbDeps["repos"], spec: SpecRow, goalId: string): GoalRow {
  const goal = repos.specs.listGoalsBySpec(spec.id).find((g) => g.id === goalId);
  if (goal === undefined) {
    throw new SpecError("ERR_SPEC_GOAL_NOT_FOUND", `goal 不存在或不属于该 spec：${goalId}`, {
      goalId,
      slug: spec.slug,
    });
  }
  return goal;
}
