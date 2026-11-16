// spec 六动词 tool 定义组（plugin-spec 1.4——薄封装门锚：本目录全部文件只做
// 入参防御收窄 + 服务面转发 + 双友好返回面投影；禁 import db/repositories 与
// @dsh-forge/lib-db——机检 tests/structure/thin-gate.test.ts 锁定）。
import type { ForgeSpecsService } from "../domain/specs/service.js";
import { createCreateSpecTool } from "./create-spec.js";
import { createListSpecsTool } from "./list-specs.js";
import { createQuerySpecTool } from "./query-spec.js";
import type { AcSettlementsFace } from "./projection.js";
import { createReplaceSpecGoalsTool, createUpdateSpecTool } from "./update-spec.js";
import { createTransitionSpecTool } from "./transition-spec.js";
import type { SpecToolDefinition } from "./faces.js";

/** 六 tool 共享执行期依赖（装配面注入——域服务单实例 + AC 投影现查缝） */
export interface SpecToolDeps {
  /** forgeSpecs 具名服务面（域逻辑唯一事实源——cordis provide 产物同实例） */
  readonly specs: ForgeSpecsService;
  /** AC 投影现查缝（task-loop forgeTasks.matchAcSettlements 窄面；缺席 = no-task-data 降级） */
  readonly acSettlementsOf?: () => AcSettlementsFace | undefined;
}

/** tool 定义组（键序 = FORGE_SPEC_TOOL_NAMES 列序——注册序单源） */
export interface SpecTools {
  readonly createSpec: SpecToolDefinition;
  readonly updateSpec: SpecToolDefinition;
  readonly replaceSpecGoals: SpecToolDefinition;
  readonly transitionSpec: SpecToolDefinition;
  readonly querySpec: SpecToolDefinition;
  readonly listSpecs: SpecToolDefinition;
}

/** 注册面全集（六动词：批量建 1 + 调整 2 + 状态流转 1 + 查询 2） */
export const FORGE_SPEC_TOOL_NAMES = [
  "create_spec",
  "update_spec",
  "replace_spec_goals",
  "transition_spec",
  "query_spec",
  "list_specs",
] as const;

export type ForgeSpecToolName = (typeof FORGE_SPEC_TOOL_NAMES)[number];

/** tool 定义组工厂（薄封装零域逻辑——域逻辑单一事实源在 forgeSpecs 服务层） */
export function createSpecTools(deps: SpecToolDeps): SpecTools {
  return {
    createSpec: createCreateSpecTool(deps),
    updateSpec: createUpdateSpecTool(deps),
    replaceSpecGoals: createReplaceSpecGoalsTool(deps),
    transitionSpec: createTransitionSpecTool(deps),
    querySpec: createQuerySpecTool(deps),
    listSpecs: createListSpecsTool(deps),
  };
}
