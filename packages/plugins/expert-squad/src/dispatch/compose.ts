// dispatch/compose —— 组装内核（tech-design §5 / §4 AD4）：档案字段 →
// SubagentStartRequest（组装半）。单点共用：通道一 delegate_expert 工具直接调
// 内核派发；通道二使用方经服务键 `experts` 取档案后按《取用 API 契约》自行等价
// 组装。fail-loud 语义单点化在 ExpertsService.get：不存在 → ExpertNotFoundError、
// 禁用 → ExpertDisabledError（消息含键名），本内核原样上抛不降级。
//
// 组装映射（契约 §6 伪代码同构）：
// - persona = 人设全文合成：身份头（name/title/简介）+ 人设 Markdown 原文——
//   经 SubagentStartRequest.persona 落子会话 scoped `deployment:persona-prefix`
//   前缀段（官方机械组合，使用方自有规范经 systemPrompt.section 独立成段）；
// - tools → toolFilter（allow 白名单形态；派发时点与全局注册名求交——shell 同族
//   名跨平台解析、未知名 fail-soft 剔除、空集 fail-loud，见 resolveToolAllow）；
//   过滤语义归创建窗口 scoped tools.restrict fail-closed；
// - model → agentOptions.model（缺省不携带键，回落使用方默认派发模型）；
//   仅 in-process provider 落地 toolFilter（契约 §5.3），派发面由调用方钉死。
//
// 类型面：ExpertSubagentRequest = 官方 SubagentStartRequest 的组装半结构子面
// （官方源码核销 @deepseek-ai/dsh-subagent lib/types/types.d.ts：prompt 为
// ContentBlock[]、toolFilter 为 ToolRestriction、agentOptions 为部分覆盖面）；
// parent/signal 等 2 面（派发上下文）由下游通道一调用方补齐，不在档案映射内。

import { intersectToolNames } from "@dsh-forge/contracts";
import type { ExpertEntry, ExpertsService } from "../registry.js";
import { EXCLUDED_EXPERT_TOOL_NAMES, ExpertToolError } from "../tools.js";

// 求交族单源 re-export（bug a5b12254 集中化——contracts tool-projection.ts；本包
// 薄壳化：排除集/ExpertToolError 包域差异经 intersectToolNames 参数注入，行为等价）。
export { PROBE_CANARY_TOOL, probeIsSubdomain, SHELL_TOOL_CANDIDATES } from "@dsh-forge/contracts";

/** 官方 ContentBlock 的文本块子面（prompt 载荷）。 */
export interface TextContentBlock {
  readonly type: "text";
  readonly text: string;
}

/**
 * SubagentStartRequest 组装半结构子面：本内核产出的全部字段。下游通道一
 * delegate_expert 补 parent/signal 后即完整官方请求；通道二使用方等价组装。
 */
export interface ExpertSubagentRequest {
  /** 人设全文（合成：身份头 + 人设原文）——子会话 persona 前缀段。 */
  readonly persona: string;
  /** 工具白名单（allow 形态）——创建窗口 fail-closed。 */
  readonly toolFilter: { readonly allow: readonly string[] };
  /** 派发 provider+model 偏好（档案两字段成对在场才携带——官方语义：同给同缺，任一缺席整组省略回落继承）。 */
  readonly agentOptions?: { readonly provider: string; readonly model: string };
  /** 子会话首条用户消息 = 任务全文（单 text 块）。 */
  readonly prompt: readonly [TextContentBlock];
}

/** 人设全文合成：身份头（键/岗位/简介）+ 人设 Markdown 原文。 */
export function composePersonaText(entry: ExpertEntry): string {
  return [
    `# ${entry.title}（${entry.name}）`,
    "",
    entry.description,
    "",
    entry.personaMd.trimEnd(),
    "",
  ].join("\n");
}

/** knownTools 探针面：可同步可异步（bug e3b045dc——探针接全模式并集面，
 *  unionAcrossPresets 异步取 preset scope 租约）；返回 undefined 或空数组均
 *  fail-soft：白名单不裁剪原样承载，见 compose.resolveToolAllow。 */
export type KnownToolsProbe = () =>
  | readonly string[]
  | undefined
  | Promise<readonly string[] | undefined>;

/** 工厂：绑定取用服务的 compose(key, task)。knownTools = 注册名现查面
 *  （每派发现调、禁 memoize；探针缺席或返回空 = 不裁剪，白名单原样承载）。 */
export function createExpertComposer(
  experts: ExpertsService,
  knownTools?: KnownToolsProbe,
): (key: string, task: string) => Promise<ExpertSubagentRequest> {
  return async (key, task) => {
    const entry = experts.get(key); // 不存在/禁用在此 fail-loud（AD1）
    const persona = composePersonaText(entry);
    const known = await knownTools?.(); // 并集探针异步取数（bug e3b045dc）
    return {
      persona,
      toolFilter: { allow: resolveToolAllow(entry.tools, known) },
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
 * - 排除集（bug c19eb719，EXCLUDED_EXPERT_TOOL_NAMES 单点）：档案写了管理/取数 7 枚
 *   → fail-soft 剔除（同未知名口径，不炸；list_experts/delegate_expert 保留）；
 * - 未知名且属 shell 候选族 → 解析为候选中在场的同族者（档案写 pwsh 落 Mac 得 bash）；
 * - 其余未知名 → fail-soft 剔除（同 dsh-graph g-473「缺则静默剔除，不炸 restrict」先例；
 *   dsh-tools restrict() 对未知名硬抛错，逐字透传会让跨机档案必然拆委派）；
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
