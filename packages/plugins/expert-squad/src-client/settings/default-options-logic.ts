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

/** 草稿逐字段等值（三字段皆字符串标量——浅比较即全等）。 */
export function defaultOptionsDraftEquals(a: DefaultOptionsDraft, b: DefaultOptionsDraft): boolean {
  return a.provider === b.provider && a.model === b.model && a.reasoning === b.reasoning;
}

/**
 * 快照换代时的草稿收敛裁决（bug 9577a867 伴生面——连击编辑竞态）：快照换代可能只是
 * 本面板自己上一次写折叠回读（revision bump 早于下一次 blur 提交）——无脑采纳会把用户
 * 在输字段抹掉（实测：provider blur 提交折叠 → 重同步抹掉已输入的 model → model blur
 * 提交旧草稿 → patch 缺 model）。裁决：未脏（无在输编辑）→ 采纳快照；脏且快照投影与
 * 草稿不同 → 保留本地草稿（在输值优先，下一次提交如实整组写入）；脏但已一致 → 归零脏标。
 */
export function draftFoldOnRevision(
  current: DefaultOptionsDraft,
  incoming: DefaultOptionsDraft,
  dirty: boolean,
): { draft: DefaultOptionsDraft; dirty: boolean } {
  if (!dirty) return { draft: incoming, dirty: false };
  if (defaultOptionsDraftEquals(current, incoming)) return { draft: incoming, dirty: false };
  return { draft: current, dirty: true };
}
