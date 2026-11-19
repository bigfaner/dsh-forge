// assertMilestoneLinkable 判定三分支单测（plugin-spec-roadmaps 1.13，code-design §2 测试锚）
// ——deps 桩查询面（零 db）：缺席拒 / 跨 project 拒 / 可挂链通过。
import { describe, expect, it } from "vitest";
import {
  assertMilestoneLinkable,
  type MilestoneLinkQuery,
} from "../../host/domain/specs/milestone-link.js";
import { isSpecError, SpecError } from "../../host/domain/specs/errors.js";
import type { MilestoneRow, RoadmapRow } from "../../host/db/row-types.js";

const MILESTONE: MilestoneRow = {
  id: "ms-1",
  roadmapId: "rm-1",
  seq: 1,
  title: "里程碑一",
  brief: null,
  acJson: [],
  milestoneStatus: "pending",
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
};

const ROADMAP: RoadmapRow = {
  id: "rm-1",
  projectKey: "demo",
  slug: "demo-roadmap",
  title: "路线图",
  brief: null,
  acJson: [],
  roadmapStatus: "in_progress",
  createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
};

function stubQuery(overrides: {
  milestone?: MilestoneRow | undefined;
  roadmap?: RoadmapRow | undefined;
} = {}): MilestoneLinkQuery {
  return {
    milestones: { findById: (id) => (overrides.milestone === undefined && id === MILESTONE.id ? MILESTONE : overrides.milestone ?? undefined) },
    roadmaps: { findById: () => overrides.roadmap ?? ROADMAP },
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(isSpecError(e)).toBe(true);
    return (e as SpecError).code;
  }
  throw new Error("expected SpecError");
}

describe("assertMilestoneLinkable 三分支", () => {
  it("milestone 缺席 → ERR_SPEC_MILESTONE_UNKNOWN", () => {
    expect(codeOf(() => assertMilestoneLinkable(stubQuery({ milestone: undefined }), "demo", "ms-nope"))).toBe(
      "ERR_SPEC_MILESTONE_UNKNOWN",
    );
  });

  it("milestone 在场但跨 project（roadmap.project_key ≠ 本 spec 归属键）→ ERR_SPEC_MILESTONE_PROJECT_MISMATCH", () => {
    const foreign: RoadmapRow = { ...ROADMAP, projectKey: "other" };
    expect(codeOf(() => assertMilestoneLinkable(stubQuery({ roadmap: foreign }), "demo", MILESTONE.id))).toBe(
      "ERR_SPEC_MILESTONE_PROJECT_MISMATCH",
    );
  });

  it("同 project → 通过，返回 milestone 行（可挂链）", () => {
    expect(assertMilestoneLinkable(stubQuery(), "demo", MILESTONE.id)).toEqual(MILESTONE);
  });
});
