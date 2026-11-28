// spec 22 动词 tool 定义组（plugin-spec 1.4 → plugin-spec-roadmaps 1.8——tools.md 总表
// 逐行：roadmap 5 + milestone 6 + spec 生命周期 6 + goal 1 + 复核 2 + 诊断 1 + M3 沿用
// replace_spec_goals = 22）。薄封装门锚：本目录全部文件只做入参防御收窄 + 服务面转发 +
// 双友好返回面投影；禁 import db/repositories 与 @dsh-forge/lib-db——机检
// tests/structure/thin-gate.test.ts 锁定；域逻辑单一事实源 = tool-service 组合根
//（cwd 派生 + 寻径适配）与 forgeSpecs 服务（M3 六动词透传）。
import type { ForgeSpecsService } from "../domain/specs/service.js";
import type { ForgeToolServices } from "../domain/specs/tool-service.js";
import type { DiagEventPayload } from "@dsh-forge/lib-diag";
import { createCreateSpecTool } from "./create-spec.js";
import { createListSpecsTool } from "./list-specs.js";
import { createQuerySpecTool } from "./query-spec.js";
import { createReplaceSpecGoalsTool, createUpdateSpecTool } from "./update-spec.js";
import { createTransitionSpecTool } from "./transition-spec.js";
import { createCreateRoadmapTool, createListRoadmapsTool, createQueryRoadmapTool, createTransitionRoadmapTool, createUpdateRoadmapTool } from "./roadmap-tools.js";
import { createCreateMilestoneTool, createListMilestonesTool, createMoveMilestoneTool, createQueryMilestoneTool, createTransitionMilestoneTool, createUpdateMilestoneTool } from "./milestone-tools.js";
import { createAcceptSpecTool, createFinalizeGoalTool, createReviewGoalTool, createReviewObjectiveTool, createSpecStatsTool } from "./goal-tools.js";
import type { SpecToolDefinition } from "./faces.js";

/** 22 tool 共享执行期依赖（装配面注入——M3 forgeSpecs 服务 + 1.8 组合根 + AC 投影现查缝） */
export interface SpecToolDeps {
  /** forgeSpecs 具名服务面（M3 六动词——域逻辑唯一事实源，cordis provide 产物同实例） */
  readonly specs: ForgeSpecsService;
  /** 1.8 工具组合根（roadmap/milestone/goal/review/stats 动词——cwd 派生 + 寻径单源） */
  readonly verbs: ForgeToolServices;
  /** AC 投影现查缝（task-loop forgeTasks.matchAcSettlements 窄面；缺席 = no-task-data 降级） */
  readonly acSettlementsOf?: () => import("./projection.js").AcSettlementsFace | undefined;
  /** 诊断发射缝（AC 投影缺席降级 / unmatched 非空埋点——query_spec 消费） */
  readonly onDiag?: (payload: Omit<DiagEventPayload, "process">) => void;
}

/** tool 定义组（键序 = FORGE_SPEC_TOOL_NAMES 列序——注册序单源） */
export interface SpecTools {
  // M3 六动词（createSpec/updateSpec 挂链扩展、transitionSpec 去 actor、querySpec include 化）
  readonly createSpec: SpecToolDefinition;
  readonly updateSpec: SpecToolDefinition;
  readonly replaceSpecGoals: SpecToolDefinition;
  readonly transitionSpec: SpecToolDefinition;
  readonly querySpec: SpecToolDefinition;
  readonly listSpecs: SpecToolDefinition;
  // Roadmap 族
  readonly createRoadmap: SpecToolDefinition;
  readonly updateRoadmap: SpecToolDefinition;
  readonly transitionRoadmap: SpecToolDefinition;
  readonly queryRoadmap: SpecToolDefinition;
  readonly listRoadmaps: SpecToolDefinition;
  // Milestone 族
  readonly createMilestone: SpecToolDefinition;
  readonly updateMilestone: SpecToolDefinition;
  readonly moveMilestone: SpecToolDefinition;
  readonly transitionMilestone: SpecToolDefinition;
  readonly queryMilestone: SpecToolDefinition;
  readonly listMilestones: SpecToolDefinition;
  // Spec 生命周期增量 / Goal 终审 / 复核 / 诊断
  readonly acceptSpec: SpecToolDefinition;
  readonly finalizeGoal: SpecToolDefinition;
  readonly reviewGoal: SpecToolDefinition;
  readonly reviewObjective: SpecToolDefinition;
  readonly specStats: SpecToolDefinition;
}

/** 注册面全集（22 动词——tools.md 总表逐行；注册名沿 M3 snake_case 基线一致性优先） */
export const FORGE_SPEC_TOOL_NAMES = [
  "create_spec",
  "update_spec",
  "replace_spec_goals",
  "transition_spec",
  "query_spec",
  "list_specs",
  "create_roadmap",
  "update_roadmap",
  "transition_roadmap",
  "query_roadmap",
  "list_roadmaps",
  "create_milestone",
  "update_milestone",
  "move_milestone",
  "transition_milestone",
  "query_milestone",
  "list_milestones",
  "accept_spec",
  "finalize_goal",
  "review_goal",
  "review_objective",
  "spec_stats",
] as const;

/** tool 定义组工厂（薄封装零域逻辑——域逻辑单一事实源在服务层/组合根） */
export function createSpecTools(deps: SpecToolDeps): SpecTools {
  const verbs = deps.verbs;
  return {
    createSpec: createCreateSpecTool(deps),
    updateSpec: createUpdateSpecTool(deps),
    replaceSpecGoals: createReplaceSpecGoalsTool(deps),
    transitionSpec: createTransitionSpecTool(deps),
    querySpec: createQuerySpecTool(verbs),
    listSpecs: createListSpecsTool(deps),
    createRoadmap: createCreateRoadmapTool(verbs),
    updateRoadmap: createUpdateRoadmapTool(verbs),
    transitionRoadmap: createTransitionRoadmapTool(verbs),
    queryRoadmap: createQueryRoadmapTool(verbs),
    listRoadmaps: createListRoadmapsTool(verbs),
    createMilestone: createCreateMilestoneTool(verbs),
    updateMilestone: createUpdateMilestoneTool(verbs),
    moveMilestone: createMoveMilestoneTool(verbs),
    transitionMilestone: createTransitionMilestoneTool(verbs),
    queryMilestone: createQueryMilestoneTool(verbs),
    listMilestones: createListMilestonesTool(verbs),
    acceptSpec: createAcceptSpecTool(verbs),
    finalizeGoal: createFinalizeGoalTool(verbs),
    reviewGoal: createReviewGoalTool(verbs),
    reviewObjective: createReviewObjectiveTool(verbs),
    specStats: createSpecStatsTool(verbs),
  };
}
