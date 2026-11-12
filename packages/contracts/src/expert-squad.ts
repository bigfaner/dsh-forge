// expert-squad 跨插件契约常量（定义真源——plugins/expert-squad 经 shared/constants.ts
// re-export 转发位消费；task-loop 对检 import 锚随 task-loop 子提案落位）。

/** experts 具名服务键（cordis ctx.experts 正门——消费点现查永不缓存，AGENTS 1.6）。 */
export const EXPERTS_SERVICE_KEY = "experts" as const;

/**
 * 候选/白名单排除集（bug c19eb719 最终口径）：expert-squad 管理/取数 7 枚工具不进 Dialog
 * 候选面与专家白名单（管理面归属 HR 主会话；候选面已对齐 list_tools/list_skills 应答，
 * 专家再挂取数工具属自指冗余）。**list_experts 与 delegate_expert 保留**——专家互查/
 * 互派是合法用法。单点定义：candidates 读口（index.ts）与 compose 白名单
 * （resolveToolAllow）两消费面共用。
 */
export const EXCLUDED_EXPERT_TOOL_NAMES = [
  "list_tools",
  "list_skills",
  "recruit_expert",
  "update_expert",
  "rename_expert",
  "enable_expert",
  "disable_expert",
] as const;

export type ExcludedExpertToolName = (typeof EXCLUDED_EXPERT_TOOL_NAMES)[number];
