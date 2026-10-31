// settings/default-options-logic —— 配置 tab「默认 Agent 选项」纯逻辑（单测直测面）：
// Config 快照 section（defaultAgentOptions）⇄ 表单草稿 ⇄ 写径补丁（ConfigForm set/unset）。
// 空串 = 未配置占位语义：Provider/Model 占「继承父Agent」、Reasoning 占「默认」（= 不下发
// effort，落模型缺省档——proposal 微文案 D5）。提交 = 空串位剔除；全空 = unset 整字段
// （回退组合层，profile patch 不残留空壳条目）。

/** reasoning 四选（D5 微文案定稿）：空 = 默认（不下发 effort）。 */
export const REASONING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "默认" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];

const REASONING_VALUES = new Set(REASONING_OPTIONS.map((option) => option.value));

/** 表单草稿（三字段皆字符串；空串 = 未配置）。 */
export interface DefaultOptionsDraft {
  readonly provider: string;
  readonly model: string;
  readonly reasoning: string;
}

/** 全空草稿（未配置态）。 */
export const EMPTY_DRAFT: DefaultOptionsDraft = { provider: "", model: "", reasoning: "" };

/** unknown → 对象窄化（缺席/非对象 = undefined）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** Config 快照 section 的 defaultAgentOptions 字段 → 表单草稿（非法值归位空串）。 */
export function defaultOptionsDraftOf(section: unknown): DefaultOptionsDraft {
  const field = asRecord(asRecord(section)?.["defaultAgentOptions"]);
  const provider = field?.["provider"];
  const model = field?.["model"];
  const reasoning = field?.["reasoning"];
  return {
    provider: typeof provider === "string" ? provider : "",
    model: typeof model === "string" ? model : "",
    reasoning: typeof reasoning === "string" && REASONING_VALUES.has(reasoning) ? reasoning : "",
  };
}

/**
 * 草稿 → 写径补丁：空串位剔除（缺省 = 该层不生效）；全空 = undefined（调用面走
 * unset——字段整体回退组合层）。provider/model 遵循整组同给同缺的取用语义由消费链
 * （workerAgentOptionsOf）承担，写侧如实存用户所填。
 */
export function defaultOptionsPatchOf(draft: DefaultOptionsDraft): Record<string, string> | undefined {
  const patch: Record<string, string> = {};
  const provider = draft.provider.trim();
  const model = draft.model.trim();
  if (provider !== "") patch["provider"] = provider;
  if (model !== "") patch["model"] = model;
  if (draft.reasoning !== "") patch["reasoning"] = draft.reasoning;
  return Object.keys(patch).length === 0 ? undefined : patch;
}
