// objective-lifecycle（plugin-spec-roadmaps 1.6，code-design §3c 模块⒞-3）——Objective
// 机械边沿推进的写点动词族（milestone/roadmap 四态状态机自动段）：边沿判定链入既有写点
// 动词事务尾，全链原子收口零轮询（不建独立推进动词——§3c 事务归属总结）。
//   · createMilestone：seq 服务端赋序（首位 seq=1 创建即 in_progress 并写台账行——不变量
//     I7/C2 收口）+ C5 roadmap 终态守卫（repo 单点）+ roadmap 开工边沿（首个 milestone）。
//   · transitionMilestone：human 验收确认两写（现值守卫 milestoneMachine）+ 边沿一
//    （前序全 completed → 后继 pending 开工）+ 边沿三（全 milestones completed → roadmap
//     awaiting_acceptance）——同事务尾追加判。
//   · moveMilestone：单里程碑移动 + 服务层展开全量排列两步法 + C1 重排重判（重排致某
//     pending milestone 前序全 completed → 同事务开工——零活性延迟）。
// 机械写点 actor = 'plugin-tool'（I7 纪律：状态变化必有台账行）。
import { withTransaction } from "@dsh-forge/lib-db";
import { emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";
import type { SpecDomainDb } from "../../db/connection.js";
import type { AcEntry, MilestoneRow, ObjectiveStatus, RoadmapRow, TransitionActor } from "../../db/row-types.js";
import { milestoneMachine } from "../status-machines.js";
import { SpecError } from "./errors.js";
import { decideObjectiveEdge } from "./objective-edge.js";

type ObjectiveDiagPayload = Omit<DiagEventPayload, "process">;

export interface ObjectiveVerbDeps {
  db: SpecDomainDb["db"];
  repos: Pick<SpecDomainDb["repos"], "roadmaps" | "milestones" | "transitions" | "specs">;
  generateId?: () => string;
  now?: () => string;
  onDiag?: (payload: ObjectiveDiagPayload) => void;
}

export interface ObjectiveWrite {
  readonly entityId: string;
  readonly kind: "milestone" | "roadmap";
  readonly from: ObjectiveStatus;
  readonly to: ObjectiveStatus;
}

export interface CreateMilestoneInput {
  readonly roadmapId: string;
  readonly title: string;
  readonly brief?: string;
  readonly acEntries?: AcEntry[];
}

export interface TransitionMilestoneInput {
  readonly milestoneId: string;
  readonly to: ObjectiveStatus;
  readonly note?: string;
  readonly actor: TransitionActor;
}

export interface MoveMilestoneInput {
  readonly roadmapId: string;
  readonly milestoneId: string;
  readonly anchor: { before?: string; after?: string };
}

export interface MoveMilestoneResult {
  readonly assignments: ReadonlyArray<{ id: string; seq: number }>;
  readonly startedWrites: readonly ObjectiveWrite[];
}

function emit(deps: ObjectiveVerbDeps, payload: ObjectiveDiagPayload): void {
  emitDiagOrFallback(deps.onDiag, payload);
}

function appendEdge(
  deps: ObjectiveVerbDeps,
  idOf: () => string,
  ts: string,
  write: { kind: ObjectiveWrite["kind"]; entityId: string; from: ObjectiveStatus; to: ObjectiveStatus; actor: TransitionActor; note?: string | null },
): ObjectiveWrite {
  deps.repos.transitions.appendTransition({
    id: idOf(),
    entityKind: write.kind,
    entityId: write.entityId,
    fromStatus: write.from,
    toStatus: write.to,
    note: write.note ?? null,
    actor: write.actor,
    createdAt: ts,
  });
  return { entityId: write.entityId, kind: write.kind, from: write.from, to: write.to };
}

function requireRoadmap(deps: ObjectiveVerbDeps, roadmapId: string): RoadmapRow {
  const roadmap = deps.repos.roadmaps.findById(roadmapId);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${roadmapId}`, { roadmapId });
  }
  return roadmap;
}

function requireMilestone(deps: ObjectiveVerbDeps, milestoneId: string): MilestoneRow {
  const milestone = deps.repos.milestones.findById(milestoneId);
  if (milestone === undefined) {
    throw new SpecError("ERR_SPEC_MILESTONE_UNKNOWN", `milestone 缺席：${milestoneId}`, { milestoneId });
  }
  return milestone;
}

/** C1/C5 共用：roadmap 内 seq 序 milestone 清单（uq 前缀 seq 序）。 */
function listOrdered(deps: ObjectiveVerbDeps, roadmapId: string): MilestoneRow[] {
  return deps.repos.milestones.listByRoadmap(roadmapId);
}

/** 边沿一判定 + 开工两写（前序全 completed 的 pending milestone——机械 actor）。 */
function startIfDue(
  deps: ObjectiveVerbDeps,
  milestone: MilestoneRow,
  predecessors: readonly MilestoneRow[],
  ts: string,
  actor: TransitionActor,
  writes: ObjectiveWrite[],
): void {
  // 零前序（重排后 seq 首位）视为前序全 completed（vacuous true——C1 重排重判同径）
  const predecessorsAllCompleted = predecessors.every((m) => m.milestoneStatus === "completed");
  if (decideObjectiveEdge(milestone.milestoneStatus, { family: "milestone-start", predecessorsAllCompleted }) !== "advance") return;
  deps.repos.milestones.updateStatus(milestone.id, "in_progress", ts);
  writes.push(appendEdge(deps, deps.generateId ?? (() => crypto.randomUUID()), ts, {
    kind: "milestone",
    entityId: milestone.id,
    from: milestone.milestoneStatus,
    to: "in_progress",
    actor,
  }));
}

/**
 * 创建 milestone（seq 链内 max+1 赋序）：C5 roadmap 终态守卫（repo 单点——completed 拒）；
 * 首位 seq=1 创建即开工（pending → in_progress 两写，I7 台账行）；事务尾 roadmap 开工
 * 边沿（pending → in_progress 两写）。
 */
export function createMilestone(deps: ObjectiveVerbDeps, input: CreateMilestoneInput): MilestoneRow {
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  requireRoadmap(deps, input.roadmapId);
  const ts = now();
  let milestoneWrite: ObjectiveWrite | undefined;
  let roadmapWrite: ObjectiveWrite | undefined;
  const milestone = withTransaction(deps.db, () => {
    const inserted = deps.repos.milestones.insertMilestone({
      id: generateId(),
      roadmapId: input.roadmapId,
      title: input.title,
      brief: input.brief ?? null,
      acJson: input.acEntries ?? [],
      milestoneStatus: "pending",
      createdAt: ts,
      updatedAt: ts,
    });
    // C2/I7：seq 首位（无前序）创建即 in_progress——台账行 from='pending' actor='plugin-tool'
    if (
      inserted.seq === 1 &&
      decideObjectiveEdge("pending", { family: "milestone-start", predecessorsAllCompleted: true }) === "advance"
    ) {
      deps.repos.milestones.updateStatus(inserted.id, "in_progress", ts);
      milestoneWrite = appendEdge(deps, generateId, ts, {
        kind: "milestone",
        entityId: inserted.id,
        from: "pending",
        to: "in_progress",
        actor: "plugin-tool",
      });
    }
    // roadmap 开工边沿：首个 milestone 创建时 pending → in_progress 两写
    const roadmap = deps.repos.roadmaps.findById(input.roadmapId);
    if (roadmap !== undefined && decideObjectiveEdge(roadmap.roadmapStatus, { family: "roadmap-start" }) === "advance") {
      deps.repos.roadmaps.updateStatus(roadmap.id, "in_progress", ts);
      roadmapWrite = appendEdge(deps, generateId, ts, {
        kind: "roadmap",
        entityId: roadmap.id,
        from: roadmap.roadmapStatus,
        to: "in_progress",
        actor: "plugin-tool",
      });
    }
    return { ...inserted, milestoneStatus: deps.repos.milestones.findById(inserted.id)?.milestoneStatus ?? inserted.milestoneStatus };
  });
  if (milestoneWrite !== undefined) {
    emit(deps, {
      event: "spec-objective-advanced",
      level: "info",
      message: `Milestone 首位创建即开工：milestone=${milestone.id} pending → in_progress`,
      projectId: milestone.roadmapId,
    });
  }
  if (roadmapWrite !== undefined) {
    emit(deps, {
      event: "spec-objective-advanced",
      level: "info",
      message: `Roadmap 开工（首个 milestone 创建）：roadmap=${input.roadmapId} pending → in_progress`,
      projectId: input.roadmapId,
    });
  }
  return milestone;
}

/**
 * milestone 人类验收确认（awaiting_acceptance → completed）/ 退回（→ in_progress，note
 * 必填）——单事务两写；事务尾链入边沿一（后继 pending 开工）与边沿三（roadmap 待验收）。
 */
export function transitionMilestone(deps: ObjectiveVerbDeps, input: TransitionMilestoneInput): { milestone: MilestoneRow; edgeWrites: readonly ObjectiveWrite[] } {
  if (input.actor !== "plugin-tool" && input.actor !== "ui") {
    throw new SpecError("ERR_SPEC_ACTOR_INVALID", `非法动作者通道：${input.actor}`, { actor: input.actor });
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const milestone = requireMilestone(deps, input.milestoneId);
  try {
    milestoneMachine.assertTransition(milestone.milestoneStatus, input.to);
  } catch {
    throw new SpecError(
      "ERR_SPEC_ILLEGAL_TRANSITION",
      `非法 milestone 状态流转：${milestone.milestoneStatus} → ${input.to}`,
      { fromStatus: milestone.milestoneStatus, toStatus: input.to },
    );
  }
  if (milestoneMachine.edgeMeta(milestone.milestoneStatus, input.to)?.noteRequired === true && (!input.note || !input.note.trim())) {
    throw new SpecError("ERR_SPEC_REJECT_NOTE_REQUIRED", "milestone 退回必须附理由（note 必填）", {
      milestoneId: milestone.id,
    });
  }
  const ts = now();
  const edgeWrites = withTransaction(deps.db, () => {
    const writes: ObjectiveWrite[] = [];
    deps.repos.milestones.updateStatus(milestone.id, input.to, ts);
    deps.repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "milestone",
      entityId: milestone.id,
      fromStatus: milestone.milestoneStatus,
      toStatus: input.to,
      note: input.note ?? null,
      actor: input.actor,
      createdAt: ts,
    });
    if (input.to !== "completed") return writes;
    const ordered = listOrdered(deps, milestone.roadmapId);
    // 边沿一：本 milestone 转 completed → 后继 pending（前序全 completed）同事务开工
    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      if (m === undefined || m.id === milestone.id) continue;
      const fresh = deps.repos.milestones.findById(m.id);
      if (fresh === undefined) continue;
      startIfDue(deps, fresh, ordered.slice(0, i).map((p) => deps.repos.milestones.findById(p.id) ?? p), ts, input.actor, writes);
    }
    // 边沿三：全 milestones completed ∧ roadmap in_progress → roadmap awaiting_acceptance 两写
    const statusesNow = ordered.map((m) => deps.repos.milestones.findById(m.id)?.milestoneStatus ?? m.milestoneStatus);
    const roadmap = deps.repos.roadmaps.findById(milestone.roadmapId);
    if (roadmap !== undefined) {
      const allCompleted = statusesNow.length > 0 && statusesNow.every((s) => s === "completed");
      if (decideObjectiveEdge(roadmap.roadmapStatus, { family: "roadmap-accept", milestonesAllCompleted: allCompleted }) === "advance") {
        deps.repos.roadmaps.updateStatus(roadmap.id, "awaiting_acceptance", ts);
        writes.push(appendEdge(deps, generateId, ts, {
          kind: "roadmap",
          entityId: roadmap.id,
          from: roadmap.roadmapStatus,
          to: "awaiting_acceptance",
          actor: input.actor,
        }));
      }
    }
    return writes;
  });
  for (const w of edgeWrites) {
    emit(deps, {
      event: "spec-objective-advanced",
      level: "info",
      message: `Objective 链式收口：${w.kind}=${w.entityId} ${w.from} → ${w.to}`,
      projectId: milestone.roadmapId,
    });
  }
  return { milestone: deps.repos.milestones.findById(milestone.id) ?? milestone, edgeWrites };
}

/**
 * 单里程碑移动：锚点校验（互斥单锚 + 锚点属本 roadmap 且非自身）→ 服务层展开全量排列 →
 * 负值区两步同事务重排（repo 单点）→ C1 重排重判（重排致 pending 前序全 completed →
 * 同事务开工，零活性延迟）。
 */
export function moveMilestone(deps: ObjectiveVerbDeps, input: MoveMilestoneInput): MoveMilestoneResult {
  const now = deps.now ?? (() => new Date().toISOString());
  requireRoadmap(deps, input.roadmapId);
  const moved = requireMilestone(deps, input.milestoneId);
  if (moved.roadmapId !== input.roadmapId) {
    throw new SpecError("ERR_SPEC_MILESTONE_UNKNOWN", `milestone 不属于该 roadmap：${input.milestoneId}`, {
      milestoneId: input.milestoneId,
      roadmapId: input.roadmapId,
    });
  }
  const anchorKind = (input.anchor.before !== undefined ? 1 : 0) + (input.anchor.after !== undefined ? 1 : 0);
  if (anchorKind !== 1) {
    throw new SpecError("ERR_SPEC_MOVE_ANCHOR_INVALID", "锚点必须且只能给 before/after 之一", { anchor: input.anchor });
  }
  const anchorId = input.anchor.before ?? input.anchor.after;
  if (anchorId === input.milestoneId) {
    throw new SpecError("ERR_SPEC_MOVE_ANCHOR_INVALID", "锚点不得为移动目标自身", { anchorId });
  }
  const ordered = listOrdered(deps, input.roadmapId);
  const others = ordered.filter((m) => m.id !== input.milestoneId);
  const anchorIndex = others.findIndex((m) => m.id === anchorId);
  if (anchorIndex < 0) {
    throw new SpecError("ERR_SPEC_MOVE_ANCHOR_INVALID", `锚点 milestone 缺席于该 roadmap：${anchorId}`, { anchorId });
  }
  const insertAt = input.anchor.before !== undefined ? anchorIndex : anchorIndex + 1;
  const ordering = [...others.slice(0, insertAt), moved, ...others.slice(insertAt)];
  const assignments = ordering.map((m, i) => ({ id: m.id, seq: i + 1 }));
  const ts = now();
  const startedWrites = withTransaction(deps.db, () => {
    const writes: ObjectiveWrite[] = [];
    deps.repos.milestones.reassignSeq(input.roadmapId, assignments, ts);
    // C1 重排重判：按新 seq 序逐 pending 判前序全 completed → 同事务开工
    for (let i = 0; i < ordering.length; i++) {
      const m = deps.repos.milestones.findById(ordering[i]?.id ?? "");
      if (m === undefined) continue;
      const predecessors = ordering.slice(0, i).map((p) => deps.repos.milestones.findById(p.id) ?? p);
      startIfDue(deps, m, predecessors, ts, "plugin-tool", writes);
    }
    return writes;
  });
  for (const w of startedWrites) {
    emit(deps, {
      event: "spec-objective-advanced",
      level: "info",
      message: `moveMilestone 重排重判开工：milestone=${w.entityId} ${w.from} → ${w.to}`,
      projectId: input.roadmapId,
    });
  }
  return { assignments, startedWrites };
}
