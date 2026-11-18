// 四域状态机实例常量（status-machine.md §3/§7）——边表即唯一真源：
// *_STATES 常量既装机又被契约测试遍历（tests/domain/status-machines.spec.ts），
// DDL CHECK 枚举对读锚 = entities.md §3（goal 五态 / spec 六态快照锁定）。
import { defineStateMachine } from "@dsh-forge/lib-status-machine";
import type { StateMachine, StateMachineConfig } from "@dsh-forge/lib-status-machine";

/** Goal 终审状态机值域（五态——entities.md §3 ck_spec_goals_status CHECK 快照）。 */
export type GoalStatus =
  | "pending"
  | "in_progress"
  | "auto_reviewing"
  | "awaiting_confirmation"
  | "completed";

/** Spec 状态机值域（六态——entities.md §3 ck_spec_specs_status CHECK 快照）。 */
export type SpecStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "in_progress"
  | "awaiting_acceptance"
  | "completed";

/** Objective（milestone/roadmap 共享）状态机值域（四态——单侧演化时再拆独立类型，演进位）。 */
export type ObjectiveStatus = "pending" | "in_progress" | "awaiting_acceptance" | "completed";

export const GOAL_STATES = {
  initial: "pending",
  states: {
    pending: { targets: ["in_progress"] },
    in_progress: { targets: ["auto_reviewing"] },
    auto_reviewing: { targets: ["awaiting_confirmation", "in_progress"] },
    awaiting_confirmation: {
      targets: ["in_progress", "completed"],
      edges: {
        completed: { humanOnly: true },
        in_progress: { noteRequired: true },
      },
    },
    completed: { targets: [] },
  },
} as const satisfies StateMachineConfig<GoalStatus>;

export const SPEC_STATES = {
  initial: "draft",
  states: {
    draft: { targets: ["awaiting_approval"] },
    awaiting_approval: {
      targets: ["approved", "draft"],
      edges: { draft: { noteRequired: true } },
    },
    approved: { targets: ["in_progress"] },
    in_progress: { targets: ["awaiting_acceptance"] },
    awaiting_acceptance: {
      targets: ["completed", "in_progress"],
      edges: {
        completed: { humanOnly: true },
        in_progress: { noteRequired: true },
      },
    },
    completed: { targets: [] },
  },
} as const satisfies StateMachineConfig<SpecStatus>;

// milestone / roadmap 分开实例（用户裁决 2026-11）——当前边表同构，未来演化各自独立。
export const MILESTONE_STATES = {
  initial: "pending",
  states: {
    pending: { targets: ["in_progress"] },
    in_progress: { targets: ["awaiting_acceptance"] },
    awaiting_acceptance: {
      targets: ["completed", "in_progress"],
      edges: {
        completed: { humanOnly: true },
        in_progress: { noteRequired: true },
      },
    },
    completed: { targets: [] },
  },
} as const satisfies StateMachineConfig<ObjectiveStatus>;

export const ROADMAP_STATES = {
  initial: "pending",
  states: {
    pending: { targets: ["in_progress"] },
    in_progress: { targets: ["awaiting_acceptance"] },
    awaiting_acceptance: {
      targets: ["completed", "in_progress"],
      edges: {
        completed: { humanOnly: true },
        in_progress: { noteRequired: true },
      },
    },
    completed: { targets: [] },
  },
} as const satisfies StateMachineConfig<ObjectiveStatus>;

export const goalMachine: StateMachine<GoalStatus> = defineStateMachine(GOAL_STATES);
export const specMachine: StateMachine<SpecStatus> = defineStateMachine(SPEC_STATES);
export const milestoneMachine: StateMachine<ObjectiveStatus> = defineStateMachine(MILESTONE_STATES);
export const roadmapMachine: StateMachine<ObjectiveStatus> = defineStateMachine(ROADMAP_STATES);

/** Objective 四态词表（工具 schema/收窄共用——DDL CHECK 值域同源）。 */
export const OBJECTIVE_STATUSES: readonly ObjectiveStatus[] = Object.keys(MILESTONE_STATES.states) as readonly ObjectiveStatus[];
