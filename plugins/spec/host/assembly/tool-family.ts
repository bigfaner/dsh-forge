// host/assembly · tool-family.ts —— 单装工具族装配（plugin-spec 1.4 → 1.8）：
// 22 动词 tool 定义组装 + AC 投影现查缝绑定 + 1.8 工具组合根接线。定位 = 装配缝合零域
// 逻辑：M3 六动词消费 forgeSpecs 服务（域逻辑单一事实源）；1.8 十六动词消费 tool-service
// 组合根（cwd 派生 + 寻径单源——roadmapSlug + milestoneId / specSlug + goalSeq）；投影缝
// 按 AGENTS 1.6 每次调用期现查（task-loop forgeTasks 缺席/劣形 = undefined → no-task-data
// 降级，不缓存）。
import { FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import type { DiagLevel } from "@dsh-forge/lib-diag";
import type { SpecAssembly } from "./default-assembly.js";
import type { AcSettlementsFace } from "../tools/projection.js";
import { createForgeToolServices } from "../domain/specs/tool-service.js";
import { createSpecTools, type SpecToolDeps } from "../tools/index.js";
import type { SpecToolDefinition } from "../tools/faces.js";

/** 装配入参（域服务装配产物 + 插件 ctx 结构化消费面 + 诊断线） */
export interface ToolFamilyAssemblyInput {
  readonly services: SpecAssembly;
  readonly ctx: unknown;
  readonly diag: (line: string, level?: DiagLevel) => void;
}

/**
 * AC 投影现查缝绑定（AGENTS 1.6——检测永不缓存，每次 querySpec/spec_stats 调用期求值）：
 * reflect.get(FORGE_TASKS_SERVICE_KEY) 具名服务防御读取 → matchAcSettlements 窄面；
 * 缺席/劣形/抛错 = undefined（no-task-data 降级——缺席留痕由投影态承担）。
 */
export function acSettlementsFaceOf(ctx: unknown): () => AcSettlementsFace | undefined {
  return () => {
    try {
      const svc = (ctx as { reflect?: { get?(name: string): unknown } }).reflect?.get?.(FORGE_TASKS_SERVICE_KEY) as
        | { matchAcSettlements?: unknown }
        | undefined;
      if (svc === undefined || svc === null || typeof svc.matchAcSettlements !== "function") return undefined;
      const face = svc as unknown as AcSettlementsFace;
      return face;
    } catch {
      return undefined;
    }
  };
}

/**
 * 单装工具族装配：22 动词 tool 定义（tools.md 总表逐行——M3 六 + roadmap 5 + milestone 6
 * + acceptSpec/finalizeGoal + 复核 2 + spec_stats）。
 * projectKey 路由 = exec 会话 cwd → 服务层 deriveProjectKey 派生（tool 面 cwd 缺席 =
 * ERR_SPEC_PROJECT_KEY_DERIVATION typed 拒绝自解释）。
 */
export function assembleSpecToolFamily(input: ToolFamilyAssemblyInput): { readonly tools: readonly SpecToolDefinition[] } {
  const verbs = createForgeToolServices({
    db: input.services.db.db,
    repos: input.services.db.repos,
    specs: input.services.specs,
    acSettlementsOf: acSettlementsFaceOf(input.ctx),
    // 诊断缝：payload 形态 → 行形态（diagConsoleLine 同构——[event] message 按级分流）
    onDiag: (payload) => input.diag(`[${payload.event}] ${payload.message}`, payload.level),
  });
  const verbDeps: SpecToolDeps = {
    specs: input.services.specs,
    verbs,
    acSettlementsOf: acSettlementsFaceOf(input.ctx),
    onDiag: (payload) => input.diag(`[${payload.event}] ${payload.message}`, payload.level),
  };
  const tools = createSpecTools(verbDeps);
  const list = [
    tools.createSpec,
    tools.updateSpec,
    tools.replaceSpecGoals,
    tools.transitionSpec,
    tools.querySpec,
    tools.listSpecs,
    tools.createRoadmap,
    tools.updateRoadmap,
    tools.transitionRoadmap,
    tools.queryRoadmap,
    tools.listRoadmaps,
    tools.createMilestone,
    tools.updateMilestone,
    tools.moveMilestone,
    tools.transitionMilestone,
    tools.queryMilestone,
    tools.listMilestones,
    tools.acceptSpec,
    tools.finalizeGoal,
    tools.reviewGoal,
    tools.reviewObjective,
    tools.specStats,
  ];
  input.diag(`[spec] 单装工具族装配完成：${String(list.length)} 员（M3 六 + roadmap 5 + milestone 6 + accept/finalize + review 2 + stats）`, "info");
  return { tools: list };
}
