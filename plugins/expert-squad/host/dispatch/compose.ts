// dispatch/compose —— 组装内核（fix-1 agentPreset 通道重设计）：档案字段 →
// SubagentActivationSpec 组装半。单点共用：通道一 delegate_expert 工具直接调
// 内核派发；通道二使用方经服务键 `experts` 取档案后按《取用 API 契约》自行等价
// 组装。fail-loud 语义单点化在 ExpertsService.get：不存在 → ExpertNotFoundError、
// 禁用 → ExpertDisabledError（消息含键名），本内核原样上抛不降级。
//
// 官方正本核销（dsh-subagent 0.2.2-rc.1 README:63-65 Child presets 段）：
// in-process spawn 接受独立 agentPreset——persona（prompt sections）与工具白名单
// （tools 组合）的承载面 = @deepseek-ai/dsh-agent-preset 行（agent-preset-registry
// README），经 host/preset-rows.ts 装载期批量预注册 + 增删同步；rc.1
// SubagentStartRequest 字段集（cwd/agentPreset/label/prompt/parent/signal/
// agentOptions/outputSchema/maxDepth）已无 persona/toolFilter。故本内核产出：
// - agentPreset = 档案键原样（本插件预注册的 preset 行 id——用户裁定 2026-11-24 移除 expert- 前缀）；
// - model → agentOptions（缺省不携带键，回落使用方默认派发模型）；
// - task → prompt 单 text 块。
// 白名单平台求交语义（resolveToolAllow）原位保留：消费方迁往 preset 行构造期
// （ExpertPresetSync），派发路径不再求交。
//
// 类型面：ExpertSubagentRequest = startActivation request 组装半结构子面；
// parent/signal/delivery 等 3 面（派发上下文/结算策略）由下游通道一调用方补齐，
// 不在档案映射内。

import { intersectToolNames } from "@dsh-forge/contracts";
import type { ExpertsService } from "../registry.js";
import { ExpertToolError } from "../tools.js";
import { EXCLUDED_EXPERT_TOOL_NAMES } from "../../shared/constants.js";

// 求交族单源 re-export（bug a5b12254 集中化——contracts tool-projection.ts；本包
// 薄壳化：排除集/ExpertToolError 包域差异经 intersectToolNames 参数注入，行为等价）。

// 人设全文合成单源（contracts subagent-assemble.ts）由消费方 preset-rows.ts
// 直取 contracts——本模块不再转发。

/** 官方 ContentBlock 的文本块子面（prompt 载荷）。 */
export interface TextContentBlock {
  readonly type: "text";
  readonly text: string;
}

/** 专家 preset 行 id = 档案键原样（用户裁定 2026-11-24：移除 expert- 前缀；
 *  行 id 与档案键同字。撞名面 = agentPresets 全局表，与官方/他插件 preset
 *  重名时 register fail-loud → presetSync diag warn 跳过该专家，不阻载）。 */

/**
 * startActivation request 组装半结构子面：本内核产出的全部字段。下游通道一
 * delegate_expert 补 parent/signal/delivery 后即完整官方请求；通道二使用方等价组装。
 */
export interface ExpertSubagentRequest {
  /** 本插件预注册的专家 preset 行 id（persona + 工具白名单承载面）= 档案键。 */
  readonly agentPreset: string;
  /** 派发 provider+model 偏好（档案两字段成对在场才携带——官方语义：同给同缺，任一缺席整组省略回落继承）。 */
  readonly agentOptions?: { readonly provider: string; readonly model: string };
  /** 子会话首条用户消息 = 任务全文（单 text 块）。 */
  readonly prompt: readonly [TextContentBlock];
}

/** knownTools 探针面：可同步可异步（bug e3b045dc——探针接全模式并集面，
 *  unionAcrossPresets 异步取 preset scope 租约）；返回 undefined 或空数组均
 *  fail-soft：白名单不裁剪原样承载。 */
export type KnownToolsProbe = () =>
  | readonly string[]
  | undefined
  | Promise<readonly string[] | undefined>;

/** 工厂：绑定取用服务的 compose(key, task)。 */
export function createExpertComposer(
  experts: ExpertsService,
): (key: string, task: string) => Promise<ExpertSubagentRequest> {
  return async (key, task) => {
    const entry = experts.get(key); // 不存在/禁用在此 fail-loud（AD1）
    return {
      agentPreset: key,
      ...(entry.provider !== undefined && entry.model !== undefined
        ? { agentOptions: { provider: entry.provider, model: entry.model } }
        : {}),
      prompt: [{ type: "text", text: task }],
    };
  };
}

/**
 * 白名单平台求交（薄壳——bug a5b12254 集中化：求交核心单源 contracts
 * intersectToolNames，本包注入排除集与 ExpertToolError 空集异常，行为等价）。
 * 消费方 = host/preset-rows.ts（preset 行 expert-restrict 段构造期求交）。
 * - 排除集（bug c19eb719，EXCLUDED_EXPERT_TOOL_NAMES 单点）：档案写了管理/取数 7 枚
 *   → fail-soft 剔除（同未知名口径，不炸；list_experts/delegate_expert 保留）；
 * - 未知名且属 shell 候选族 → 解析为候选中在场的同族者（档案写 pwsh 落 Mac 得 bash）；
 * - 其余未知名 → fail-soft 剔除（restrict() 对未知名硬抛错，逐字透传会让跨机档案
 *   必然拆 preset 行装载）；
 * - 已知名原样保留、顺序不变；子域投影（缺金丝雀）不可信 → 不裁剪。
 * 抛错面：解析后为空集（全未知 = 档案配置错误）→ ExpertToolError fail-loud。
 */
export function resolveToolAllow(
  rawAllow: readonly string[],
  known?: readonly string[],
): string[] {
  return intersectToolNames(rawAllow, known, {
    excluded: EXCLUDED_EXPERT_TOOL_NAMES,
    emptyError: (message) => new ExpertToolError(message),
  });
}
