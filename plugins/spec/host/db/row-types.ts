// 行级类型（plugin-spec 1.3）——repo 行级门进出边界；蛇列/驼列互斥不出本目录。
// SpecStatus 值域单源 = domain/status-machines.ts SPEC_STATES（六态，与 DDL CHECK 对读锁定）。
import { SPEC_STATES } from "../domain/status-machines.js";
export type { SpecStatus, ObjectiveStatus, GoalStatus } from "../domain/status-machines.js";
import type { SpecStatus, ObjectiveStatus, GoalStatus } from "../domain/status-machines.js";

export const SPEC_STATUSES: readonly SpecStatus[] = Object.keys(SPEC_STATES.states) as readonly SpecStatus[];

export interface SpecRow {
  id: string;
  slug: string;
  title: string;
  specStatus: SpecStatus;
  /** tiers 交付档位（封闭四值多选 ui/api/pure-logic/docs；[] = 未声明） */
  tiers: string[];
  projectKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRow {
  id: string;
  specId: string;
  sortKey: number;
  title: string;
  brief: string | null;
  /** Goal 终审状态机现值（v2 goal_status 列——五态，写入面 = goal-advance/goal-finalize 两动词） */
  goalStatus: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AcRow {
  id: string;
  goalId: string;
  sortKey: number;
  criterion: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocRow {
  specId: string;
  relPath: string;
  createdAt: string;
  updatedAt: string;
}

export type TransitionActor = "plugin-tool" | "ui";

export interface TransitionRow {
  id: string;
  specId: string;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  note: string | null;
  actor: TransitionActor;
  createdAt: string;
}

// ── v2 目标域行类型（plugin-spec-roadmaps 1.4，entities.md §1–§5 对读）──

/** 四级统一台账/复核表实体判别（entities.md ck_spec_trans_kind/ck_spec_reviews_kind 快照）。 */
export type EntityKind = "spec" | "goal" | "milestone" | "roadmap";

/** AcEntry（entities.md §2 共用条目形状——DDL 只保 json_valid，结构归服务层 parseAcEntries）。 */
export interface AcEntry {
  id: string;
  criterion: string;
  address?: string;
}

export interface RoadmapRow {
  id: string;
  projectKey: string;
  slug: string;
  title: string;
  brief: string | null;
  acJson: AcEntry[];
  roadmapStatus: ObjectiveStatus;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneStatus = ObjectiveStatus;

/** insertMilestone 入参（seq 服务端链内 max+1 赋序——出参 MilestoneRow 携实落 seq）。 */
export type MilestoneInsert = Omit<MilestoneRow, "seq">;

export interface MilestoneRow {
  id: string;
  roadmapId: string;
  seq: number;
  title: string;
  brief: string | null;
  acJson: AcEntry[];
  milestoneStatus: ObjectiveStatus;
  createdAt: string;
  updatedAt: string;
}

/** 统一台账行（四级统一——entities.md §4；from/to 值域校验归应用层 per-kind 单点）。 */
export interface EntityTransitionRow {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  note: string | null;
  actor: TransitionActor;
  createdAt: string;
}

/** 统一复核报告行（四级统一——entities.md §5；append-only 一次成文）。 */
export interface ReviewRow {
  id: string;
  entityKind: EntityKind;
  entityId: string;
  verdict: "passed" | "failed";
  content: string;
  gapNote: string | null;
  actor: TransitionActor;
  createdAt: string;
}
