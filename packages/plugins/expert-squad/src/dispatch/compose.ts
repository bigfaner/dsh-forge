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
// - tools → toolFilter（allow 白名单形态，原样不二次过滤——过滤语义归创建窗口
//   scoped tools.restrict fail-closed）；
// - model → agentOptions.model（缺省不携带键，回落使用方默认派发模型）；
//   仅 in-process provider 落地 toolFilter（契约 §5.3），派发面由调用方钉死。
//
// 类型面：ExpertSubagentRequest = 官方 SubagentStartRequest 的组装半结构子面
// （官方源码核销 @deepseek-ai/dsh-subagent lib/types/types.d.ts：prompt 为
// ContentBlock[]、toolFilter 为 ToolRestriction、agentOptions 为部分覆盖面）；
// parent/signal 等 2 面（派发上下文）由下游通道一调用方补齐，不在档案映射内。

import type { ExpertEntry, ExpertsService } from "../registry.js";

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
  /** 派发模型偏好（档案 model 在场才携带）。 */
  readonly agentOptions?: { readonly model: string };
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

/** 工厂：绑定取用服务的 compose(key, task)。 */
export function createExpertComposer(
  experts: ExpertsService,
): (key: string, task: string) => ExpertSubagentRequest {
  return (key, task) => {
    const entry = experts.get(key); // 不存在/禁用在此 fail-loud（AD1）
    const persona = composePersonaText(entry);
    return {
      persona,
      toolFilter: { allow: [...entry.tools] },
      ...(entry.model !== undefined ? { agentOptions: { model: entry.model } } : {}),
      prompt: [{ type: "text", text: task }],
    };
  };
}
