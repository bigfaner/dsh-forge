// 四域边表逐格契约测试（status-machine.md §5——边表即测试矩阵）：
// 每域全 |states|² 组合逐格断言（合法 ok:true / 非法 ILLEGAL_EDGE）；
// GOAL/SPEC_STATES 值域 ↔ entities.md §3 CHECK 枚举清单快照对读（DDL 扩值即契约红）。
import { describe, expect, it } from "vitest";
import type { TransitionCheck } from "@dsh-forge/lib-status-machine";
import {
  GOAL_STATES,
  MILESTONE_STATES,
  ROADMAP_STATES,
  SPEC_STATES,
  goalMachine,
  milestoneMachine,
  roadmapMachine,
  specMachine,
} from "../../host/domain/status-machines.js";

type AnyStates = { initial: string; states: Record<string, { targets: readonly string[] }> };

const DOMAINS: Array<{
  name: string;
  states: AnyStates;
  machine: { canTransition(from: string, to: string): TransitionCheck };
}> = [
  { name: "goal", states: GOAL_STATES as unknown as AnyStates, machine: goalMachine },
  { name: "spec", states: SPEC_STATES as unknown as AnyStates, machine: specMachine },
  { name: "milestone", states: MILESTONE_STATES as unknown as AnyStates, machine: milestoneMachine },
  { name: "roadmap", states: ROADMAP_STATES as unknown as AnyStates, machine: roadmapMachine },
];

describe("四域状态机边表逐格契约（全 |states|² 组合）", () => {
  for (const { name, states, machine } of DOMAINS) {
    describe(`${name} 域`, () => {
      it("值域封闭：states 键即全部合法状态", () => {
        expect(Object.keys(states.states).length).toBeGreaterThan(0);
        expect(Object.prototype.hasOwnProperty.call(states.states, states.initial)).toBe(true);
      });

      for (const from of Object.keys(states.states)) {
        for (const to of Object.keys(states.states)) {
          it(`${from} -> ${to}`, () => {
            const check = machine.canTransition(from, to);
            if (states.states[from].targets.includes(to)) {
              expect(check).toMatchObject({ ok: true });
            } else {
              // 非法格：普通源态 ILLEGAL_EDGE；终态源（targets 空，§1 TransitionCheck 语义）TERMINAL_SOURCE。
              const expected = states.states[from].targets.length === 0 ? "TERMINAL_SOURCE" : "ILLEGAL_EDGE";
              expect(check).toMatchObject({ ok: false, reason: expected });
            }
          });
        }
      }
    });
  }
});

describe("边元数据契约（humanOnly / noteRequired）", () => {
  it("goal：awaiting_confirmation→completed humanOnly、→in_progress noteRequired", () => {
    expect(goalMachine.edgeMeta("awaiting_confirmation", "completed")).toEqual({ humanOnly: true });
    expect(goalMachine.edgeMeta("awaiting_confirmation", "in_progress")).toEqual({ noteRequired: true });
  });

  it("spec：awaiting_acceptance→completed humanOnly、→in_progress noteRequired、awaiting_approval→draft noteRequired", () => {
    expect(specMachine.edgeMeta("awaiting_acceptance", "completed")).toEqual({ humanOnly: true });
    expect(specMachine.edgeMeta("awaiting_acceptance", "in_progress")).toEqual({ noteRequired: true });
    expect(specMachine.edgeMeta("awaiting_approval", "draft")).toEqual({ noteRequired: true });
  });

  it("milestone/roadmap：awaiting_acceptance→completed humanOnly、→in_progress noteRequired（同构各持）", () => {
    for (const machine of [milestoneMachine, roadmapMachine]) {
      expect(machine.edgeMeta("awaiting_acceptance", "completed")).toEqual({ humanOnly: true });
      expect(machine.edgeMeta("awaiting_acceptance", "in_progress")).toEqual({ noteRequired: true });
    }
  });

  it("无元数据的合法边 edgeMeta 为 undefined", () => {
    expect(goalMachine.edgeMeta("pending", "in_progress")).toBeUndefined();
    expect(specMachine.edgeMeta("approved", "in_progress")).toBeUndefined();
  });
});

describe("值域 ↔ entities.md §3 CHECK 枚举清单快照对读（DDL 扩值即契约红）", () => {
  it("goal_status 五态 == ck_spec_goals_status CHECK 快照", () => {
    expect(Object.keys(GOAL_STATES.states)).toEqual([
      "pending",
      "in_progress",
      "auto_reviewing",
      "awaiting_confirmation",
      "completed",
    ]);
  });

  it("spec_status 六态 == ck_spec_specs_status CHECK 快照", () => {
    expect(Object.keys(SPEC_STATES.states)).toEqual([
      "draft",
      "awaiting_approval",
      "approved",
      "in_progress",
      "awaiting_acceptance",
      "completed",
    ]);
  });

  it("milestone/roadmap 四态各持独立实例（分开演化）", () => {
    expect(Object.keys(MILESTONE_STATES.states)).toEqual(["pending", "in_progress", "awaiting_acceptance", "completed"]);
    expect(Object.keys(ROADMAP_STATES.states)).toEqual(["pending", "in_progress", "awaiting_acceptance", "completed"]);
    expect(MILESTONE_STATES).not.toBe(ROADMAP_STATES);
  });
});
