// roadmap-service（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——Roadmap 服务域
// 写读单源：CRUD 动词（create/update/getBySlug/list）+ transitionRoadmap（roadmapMachine
// 边表驱动 + noteRequired 守卫）+ confirmRoadmapAchieved（human-only 验收确认——前置守卫 =
// 现值 awaiting_acceptance 且聚合派生达成）+ queryRoadmapAchievement（读面装配——聚合派生
// 纯函数 + 零承载 warns 经 emitDiag info 留痕不静默）。
// 达成 = 聚合派生查询期现算（零写点、零状态列）；达成态确认是 human-only 状态流转。
import { withTransaction } from "@dsh-forge/lib-db";
import { emitDiagOrFallback, type DiagEventPayload } from "@dsh-forge/lib-diag";
import type { AcEntry, MilestoneRow, ObjectiveStatus, RoadmapRow, TransitionActor } from "../../db/row-types.js";
import type { SpecDomainDb } from "../../db/connection.js";
import { roadmapMachine } from "../status-machines.js";
import { parseAcEntries } from "./ac-entries.js";
import { deriveMilestoneAchieved, deriveRoadmapAchievement, type MilestoneAggregate, type ZeroCarrierWarn } from "./completed-derivation.js";
import { SpecError } from "./errors.js";

type RoadmapDiagPayload = Omit<DiagEventPayload, "process">;

/** Roadmap 服务域动词依赖（SpecVerbDeps 同形注入——装配面/测试同径组合）。 */
export interface RoadmapVerbDeps {
  db: SpecDomainDb["db"];
  repos: Pick<SpecDomainDb["repos"], "roadmaps" | "milestones" | "transitions" | "specs">;
  generateId?: () => string;
  now?: () => string;
  onDiag?: (payload: RoadmapDiagPayload) => void;
}

export interface CreateRoadmapInput {
  readonly projectKey: string;
  readonly slug: string;
  readonly title: string;
  readonly brief?: string;
  /** 产品级 AC 清单（无 address——承载指向单源存 milestone 侧）；缺席 = 空 AC */
  readonly acEntries?: AcEntry[];
}

export interface UpdateRoadmapInput {
  readonly projectKey: string;
  readonly slug: string;
  readonly title?: string;
  readonly brief?: string;
  /** 全量替换 ac_json（结构校验同门）；undefined = 不动 */
  readonly acEntries?: AcEntry[];
}

export interface TransitionRoadmapInput {
  readonly roadmapId: string;
  readonly to: ObjectiveStatus;
  readonly note?: string;
  readonly actor: TransitionActor;
}

export interface ConfirmRoadmapAchievedInput {
  readonly roadmapId: string;
  readonly note?: string;
  readonly actor: TransitionActor;
}

/** queryRoadmapAchievement 出参 DTO（M5 看板数据面——perMilestone 下钻结构）。 */
export interface RoadmapAchievementDto {
  readonly roadmap: RoadmapRow;
  readonly completed: boolean;
  readonly perMilestone: ReadonlyArray<{
    readonly milestoneId: string;
    readonly seq: number;
    readonly title: string;
    readonly milestoneStatus: ObjectiveStatus;
    readonly specCount: number;
    readonly allCompleted: boolean;
  }>;
  readonly warns: readonly ZeroCarrierWarn[];
}

function emit(deps: RoadmapVerbDeps, payload: RoadmapDiagPayload): void {
  emitDiagOrFallback(deps.onDiag, payload);
}

function requireRoadmap(deps: RoadmapVerbDeps, roadmapId: string): RoadmapRow {
  const roadmap = deps.repos.roadmaps.findById(roadmapId);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${roadmapId}`, { roadmapId });
  }
  return roadmap;
}

function requireActor(actor: TransitionActor): void {
  if (actor !== "plugin-tool" && actor !== "ui") {
    throw new SpecError("ERR_SPEC_ACTOR_INVALID", `非法动作者通道：${actor}`, { actor });
  }
}

function assertTransitionAllowed(from: ObjectiveStatus, to: ObjectiveStatus): void {
  try {
    roadmapMachine.assertTransition(from, to);
  } catch {
    throw new SpecError("ERR_SPEC_ILLEGAL_TRANSITION", `非法 roadmap 状态流转：${from} → ${to}`, {
      fromStatus: from,
      toStatus: to,
    });
  }
}

/** noteRequired 守卫单点 = edgeMeta(...).noteRequired（status-machine.md §4 条目 7）。 */
function assertNoteSatisfied(from: ObjectiveStatus, to: ObjectiveStatus, note: string | undefined, roadmapId: string): void {
  if (roadmapMachine.edgeMeta(from, to)?.noteRequired === true && (!note || !note.trim())) {
    throw new SpecError("ERR_SPEC_REJECT_NOTE_REQUIRED", "roadmap 退回必须附理由（note 必填）", { roadmapId });
  }
}

/** 聚合派生读面单源：milestones seq 序圈行 → specsByMilestone 判定列 → 值对象装配。 */
function readMilestoneAggregates(
  deps: RoadmapVerbDeps,
  roadmapId: string,
): Array<{ row: MilestoneRow; specCount: number; allCompleted: boolean }> {
  return deps.repos.milestones.listByRoadmap(roadmapId).map((row) => {
    const specs = deps.repos.specs.specsByMilestone(row.id);
    return { row, specCount: specs.length, allCompleted: deriveMilestoneAchieved(specs) };
  });
}

function toPerMilestone(
  aggregates: ReadonlyArray<{ row: MilestoneRow; specCount: number; allCompleted: boolean }>,
): RoadmapAchievementDto["perMilestone"] {
  return aggregates.map((a) => ({
    milestoneId: a.row.id,
    seq: a.row.seq,
    title: a.row.title,
    milestoneStatus: a.row.milestoneStatus,
    specCount: a.specCount,
    allCompleted: a.allCompleted,
  }));
}

function toAggregateValueObjects(
  aggregates: ReadonlyArray<{ row: MilestoneRow; specCount: number; allCompleted: boolean }>,
): MilestoneAggregate[] {
  return aggregates.map((a) => ({
    specCount: a.specCount,
    allCompleted: a.allCompleted,
    addresses: a.row.acJson.map((e) => e.address).filter((ad): ad is string => ad !== undefined),
  }));
}

export function createRoadmap(deps: RoadmapVerbDeps, input: CreateRoadmapInput): RoadmapRow {
  const now = deps.now ?? (() => new Date().toISOString());
  if (deps.repos.roadmaps.getBySlug(input.projectKey, input.slug) !== undefined) {
    throw new SpecError("ERR_SPEC_DUPLICATE_SLUG", `roadmap slug 重复：${input.slug}`, { slug: input.slug });
  }
  const acJson = parseAcEntries(input.acEntries ?? [], { generateId: deps.generateId });
  const ts = now();
  const row: RoadmapRow = {
    id: (deps.generateId ?? (() => crypto.randomUUID()))(),
    projectKey: input.projectKey,
    slug: input.slug,
    title: input.title,
    brief: input.brief ?? null,
    acJson,
    roadmapStatus: "pending",
    createdAt: ts,
    updatedAt: ts,
  };
  deps.repos.roadmaps.insertRoadmap(row);
  return row;
}

export function updateRoadmap(deps: RoadmapVerbDeps, input: UpdateRoadmapInput): RoadmapRow {
  const now = deps.now ?? (() => new Date().toISOString());
  const roadmap = deps.repos.roadmaps.getBySlug(input.projectKey, input.slug);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${input.slug}`, { slug: input.slug });
  }
  const acJson = input.acEntries !== undefined
    ? parseAcEntries(input.acEntries, { generateId: deps.generateId })
    : undefined;
  const ts = now();
  return withTransaction(deps.db, () => {
    deps.repos.roadmaps.updateRoadmapFields(
      roadmap.id,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.brief !== undefined ? { brief: input.brief } : {}),
        ...(acJson !== undefined ? { acJson } : {}),
      },
      ts,
    );
    return deps.repos.roadmaps.findById(roadmap.id)!;
  });
}

/**
 * roadmap 状态流转（roadmapMachine 边表驱动）——单事务两写（现值 UPDATE + 统一台账
 * append）。机械边沿（开工/待验收）由 objective-lifecycle 链式收口驱动，本动词承接
 * 显式流转与验收退回（noteRequired 边守卫）。
 */
export function transitionRoadmap(deps: RoadmapVerbDeps, input: TransitionRoadmapInput): RoadmapRow {
  requireActor(input.actor);
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const roadmap = requireRoadmap(deps, input.roadmapId);
  assertTransitionAllowed(roadmap.roadmapStatus, input.to);
  assertNoteSatisfied(roadmap.roadmapStatus, input.to, input.note, roadmap.id);
  const ts = now();
  return withTransaction(deps.db, () => {
    deps.repos.roadmaps.updateStatus(roadmap.id, input.to, ts);
    deps.repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "roadmap",
      entityId: roadmap.id,
      fromStatus: roadmap.roadmapStatus,
      toStatus: input.to,
      note: input.note ?? null,
      actor: input.actor,
      createdAt: ts,
    });
    return deps.repos.roadmaps.findById(roadmap.id)!;
  });
}

/**
 * human-only 验收确认（awaiting_acceptance → completed）——前置守卫 = 现值待验收
 * （roadmapMachine 边 + edgeMeta humanOnly 数据源）且聚合派生达成；未达成确认拒
 * （ERR_SPEC_CONFIRM_NOT_ACHIEVED）。确认史入统一台账（entity_kind='roadmap'）。
 */
export function confirmRoadmapAchieved(deps: RoadmapVerbDeps, input: ConfirmRoadmapAchievedInput): RoadmapRow {
  requireActor(input.actor);
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? (() => crypto.randomUUID());
  const roadmap = requireRoadmap(deps, input.roadmapId);
  const humanOnlyEdge = roadmapMachine.canTransition(roadmap.roadmapStatus, "completed").ok
    && roadmapMachine.edgeMeta(roadmap.roadmapStatus, "completed")?.humanOnly === true;
  const aggregates = readMilestoneAggregates(deps, roadmap.id);
  const { completed } = deriveRoadmapAchievement(toAggregateValueObjects(aggregates), roadmap.acJson);
  if (!humanOnlyEdge || !completed) {
    throw new SpecError(
      "ERR_SPEC_CONFIRM_NOT_ACHIEVED",
      `roadmap 验收确认前置不满足（现值=${roadmap.roadmapStatus}，聚合派生达成=${completed}）：${roadmap.slug}`,
      { roadmapId: roadmap.id, fromStatus: roadmap.roadmapStatus, derived: completed },
    );
  }
  const ts = now();
  return withTransaction(deps.db, () => {
    deps.repos.roadmaps.updateStatus(roadmap.id, "completed", ts);
    deps.repos.transitions.appendTransition({
      id: generateId(),
      entityKind: "roadmap",
      entityId: roadmap.id,
      fromStatus: roadmap.roadmapStatus,
      toStatus: "completed",
      note: input.note ?? null,
      actor: input.actor,
      createdAt: ts,
    });
    return deps.repos.roadmaps.findById(roadmap.id)!;
  });
}

export function getRoadmapBySlug(deps: RoadmapVerbDeps, q: { projectKey: string; slug: string }): RoadmapRow | undefined {
  return deps.repos.roadmaps.getBySlug(q.projectKey, q.slug);
}

export function listRoadmaps(deps: RoadmapVerbDeps, projectKey: string): RoadmapRow[] {
  return deps.repos.roadmaps.listByProject(projectKey);
}

/**
 * 读面装配（IO 薄壳）：repo 两跳读（milestones 圈行 → specs partial 索引圈行取
 * spec_status）→ 聚合派生纯函数 → DTO；零承载 warns 经 emitDiag info
 *（event: 'spec-achievement-derive'）留痕不静默。
 */
export function queryRoadmapAchievement(deps: RoadmapVerbDeps, q: { projectKey: string; slug: string }): RoadmapAchievementDto {
  const roadmap = deps.repos.roadmaps.getBySlug(q.projectKey, q.slug);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${q.slug}`, { slug: q.slug });
  }
  const aggregates = readMilestoneAggregates(deps, roadmap.id);
  const { completed, warns } = deriveRoadmapAchievement(toAggregateValueObjects(aggregates), roadmap.acJson);
  if (warns.length > 0) {
    emit(deps, {
      event: "spec-achievement-derive",
      level: "info",
      message: `Roadmap 零承载 AC 条目：${warns.map((w) => w.acId).join(", ")}（${roadmap.slug}）`,
      projectId: roadmap.projectKey,
    });
  }
  return { roadmap, completed, perMilestone: toPerMilestone(aggregates), warns };
}
