// host/assembly · tool-family.ts —— 单装工具族装配（plugin-spec 1.4）：
// 六动词 tool 定义组装 + AC 投影现查缝绑定。定位 = 装配缝合零域逻辑：工具薄封装消费
// 本插件 forgeSpecs 服务（域逻辑单一事实源）；投影缝按 AGENTS 1.6 每次调用期现查
//（task-loop forgeTasks 缺席/劣形 = undefined → no-task-data 降级，不缓存）。
import { FORGE_TASKS_SERVICE_KEY } from "../../shared/contract-constants.js";
import type { SpecAssembly } from "./default-assembly.js";
import type { AcSettlementsFace } from "../tools/projection.js";
import { createSpecTools, type SpecToolDeps } from "../tools/index.js";
import type { SpecToolDefinition } from "../tools/faces.js";

/** 装配入参（域服务装配产物 + 插件 ctx 结构化消费面 + 诊断线） */
export interface ToolFamilyAssemblyInput {
  readonly services: SpecAssembly;
  readonly ctx: unknown;
  readonly diag: (line: string, level?: "info" | "warn" | "error") => void;
}

/**
 * AC 投影现查缝绑定（AGENTS 1.6——检测永不缓存，每个 querySpec 调用期求值）：
 * reflect.get(FORGE_TASKS_SERVICE_KEY) 具名服务防御读取 → matchAcSettlements 窄面；
 * 缺席/劣形/抛错 = undefined（no-task-data 降级——缺席留痕由 querySpec 降级投影态承担）。
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
 * 单装工具族装配：六动词 tool 定义（批量建 1 + 调整 2 + 状态流转 1 + 查询 2）。
 * projectKey 路由 = exec 会话 cwd → 服务层 deriveProjectKey 派生（tool 面 cwd 缺席 =
 * ERR_SPEC_PROJECT_KEY_DERIVATION typed 拒绝自解释）。
 */
export function assembleSpecToolFamily(input: ToolFamilyAssemblyInput): { readonly tools: readonly SpecToolDefinition[] } {
  const verbDeps: SpecToolDeps = {
    specs: input.services.specs,
    acSettlementsOf: acSettlementsFaceOf(input.ctx),
  };
  const tools = createSpecTools(verbDeps);
  const list = [
    tools.createSpec,
    tools.updateSpec,
    tools.replaceSpecGoals,
    tools.transitionSpec,
    tools.querySpec,
    tools.listSpecs,
  ];
  input.diag(`[spec] 单装工具族装配完成：${String(list.length)} 员（create/update/replace_goals/transition/query/list）`, "info");
  return { tools: list };
}
