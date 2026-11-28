// milestone-service（plugin-spec-roadmaps 1.7，code-design §1 模块ⓐ）——Milestone 服务域
// CRUD + 寻径：createMilestone（ac address 指向校验 → objective-lifecycle 写点单源委托）、
// updateMilestone（同门结构校验）、getMilestone（父 roadmap slug + seq 寻径）、
// listMilestones（uq 前缀 seq 序）。
// moveMilestone / transitionMilestone = objective-lifecycle（1.6 写点单源）薄重导出——
// 互斥锚/锚点守卫/两步原子性/链式边沿零重复实现。
import { withTransaction } from "@dsh-forge/lib-db";
import type { SpecDomainDb } from "../../db/connection.js";
import type { AcEntry, MilestoneRow, TransitionActor } from "../../db/row-types.js";
import { assertAddressesKnown, parseAcEntries } from "./ac-entries.js";
import { SpecError } from "./errors.js";
import {
  createMilestone as createMilestoneWrite,
  transitionMilestone,
  moveMilestone,
  type TransitionMilestoneInput,
  type MoveMilestoneInput,
  type MoveMilestoneResult,
  type ObjectiveWrite,
} from "./objective-lifecycle.js";

export { moveMilestone, transitionMilestone };
export type { MoveMilestoneInput, MoveMilestoneResult, ObjectiveWrite, TransitionMilestoneInput };

/** Milestone 服务域动词依赖（RoadmapVerbDeps 同形注入——装配面/测试同径组合）。 */
export interface MilestoneVerbDeps {
  db: SpecDomainDb["db"];
  repos: Pick<SpecDomainDb["repos"], "roadmaps" | "milestones" | "transitions" | "specs">;
  generateId?: () => string;
  now?: () => string;
}

export interface CreateMilestoneInput {
  readonly roadmapId: string;
  readonly title: string;
  readonly brief?: string;
  /** 模块级 AC 清单（address 柔性指回 roadmap AC 条目 id——指向存在性事务前重读校验） */
  readonly acEntries?: AcEntry[];
}

export interface UpdateMilestoneInput {
  readonly milestoneId: string;
  readonly title?: string;
  readonly brief?: string;
  /** 全量替换 ac_json（结构 + address 指向校验同门）；undefined = 不动 */
  readonly acEntries?: AcEntry[];
}

export interface ConfirmMilestoneAchievedInput {
  readonly milestoneId: string;
  readonly note?: string;
  readonly actor: TransitionActor;
}

function requireRoadmap(deps: MilestoneVerbDeps, roadmapId: string) {
  const roadmap = deps.repos.roadmaps.findById(roadmapId);
  if (roadmap === undefined) {
    throw new SpecError("ERR_SPEC_ROADMAP_UNKNOWN", `roadmap 缺席：${roadmapId}`, { roadmapId });
  }
  return roadmap;
}

function requireMilestone(deps: MilestoneVerbDeps, milestoneId: string): MilestoneRow {
  const milestone = deps.repos.milestones.findById(milestoneId);
  if (milestone === undefined) {
    throw new SpecError("ERR_SPEC_MILESTONE_UNKNOWN", `milestone 缺席：${milestoneId}`, { milestoneId });
  }
  return milestone;
}

/** ac_json 校验单门（结构 parseAcEntries + address 指向事务内重读父行断言）。 */
function parseValidatedAcEntries(
  deps: MilestoneVerbDeps,
  roadmapId: string,
  raw: AcEntry[] | undefined,
): AcEntry[] | undefined {
  if (raw === undefined) return undefined;
  const roadmap = requireRoadmap(deps, roadmapId); // 事务内重读父行（防 TOCTOU 先例形态）
  const entries = parseAcEntries(raw, { allowAddress: true, generateId: deps.generateId });
  assertAddressesKnown(roadmap.acJson.map((e) => e.id), entries);
  return entries;
}

export function createMilestone(deps: MilestoneVerbDeps, input: CreateMilestoneInput): MilestoneRow {
  const acEntries = parseValidatedAcEntries(deps, input.roadmapId, input.acEntries);
  // 写点单源委托（1.6 objective-lifecycle：seq 赋序 + 边沿链式收口零重复）
  return createMilestoneWrite(deps, {
    roadmapId: input.roadmapId,
    title: input.title,
    brief: input.brief,
    acEntries,
  });
}

export function updateMilestone(deps: MilestoneVerbDeps, input: UpdateMilestoneInput): MilestoneRow {
  const now = deps.now ?? (() => new Date().toISOString());
  const milestone = requireMilestone(deps, input.milestoneId);
  const acJson = parseValidatedAcEntries(deps, milestone.roadmapId, input.acEntries);
  return withTransaction(deps.db, () => {
    deps.repos.milestones.updateFields(
      milestone.id,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.brief !== undefined ? { brief: input.brief } : {}),
        ...(acJson !== undefined ? { acJson } : {}),
      },
      now(),
    );
    return deps.repos.milestones.findById(milestone.id)!;
  });
}

/** 寻径 = 父 roadmap slug + seq（entities.md §2——milestone 无 slug，seq 重排后位置漂移可接受）。 */
export function getMilestone(
  deps: MilestoneVerbDeps,
  q: { projectKey: string; roadmapSlug: string; seq: number },
): MilestoneRow | undefined {
  const roadmap = deps.repos.roadmaps.getBySlug(q.projectKey, q.roadmapSlug);
  if (roadmap === undefined) return undefined;
  return deps.repos.milestones.listByRoadmap(roadmap.id).find((m) => m.seq === q.seq);
}

export function listMilestones(deps: MilestoneVerbDeps, roadmapId: string): MilestoneRow[] {
  return deps.repos.milestones.listByRoadmap(roadmapId);
}
