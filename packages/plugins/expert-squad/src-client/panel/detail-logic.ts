// panel/detail-logic —— 详情 Dialog 纯逻辑面（ui-design F2）：草稿构造、保存校验门
// （空岗位字段级报错 / 人设裸 {{ 拒绝）、multi-select 增删逻辑、技能候选汇总、人设
// Markdown 分块（标题/加粗/行内代码/列表——原型近似渲染语义）。零副作用零 DOM。

import type { ExpertView } from "./filter.js";

/** 编辑草稿（F2 编辑态字段集；name 英文标识不可改——键正本不入草稿）。 */
export interface ExpertDraft {
  readonly title: string;
  readonly description: string;
  readonly personaMd: string;
  readonly tools: readonly string[];
  readonly skills: readonly string[];
  /** 派发路由 provider（草稿态恒字符串——空串 = 未填/已清空，成对语义见 validateDraft）。 */
  readonly provider: string;
  /** 派发路由 model（同 provider 成对语义）。 */
  readonly model: string;
  /** 推理档位（""= 默认不下发 effort；low|medium|high——reasoning 四选下拉，D5 微文案）。 */
  readonly reasoning: string;
}

/**
 * experts.<实例ID> 条目写径补丁（experts 配置映射单条目的覆写面——保存 = Agent 选项
 * 与工具写条目，内容字段不混写）。agentOptions.provider/model 整组同给同缺（消费链
 * 成对语义）；reasoning 独立位；tools 整组替换（清空 = 键归缺 = 回退档案值）。
 */
export interface ExpertsEntryPatch {
  /**
   * 来源级禁用位（bug 950b845c：Dialog 启停写径——true = 禁用，false = 启用且位摘除
   * 「键归缺」；undefined = 本补丁不触碰该位，装配侧保留 prior）。对所有工作区生效。
   */
  readonly disabled?: boolean;
  readonly agentOptions?: {
    readonly provider?: string;
    readonly model?: string;
    readonly reasoning?: string;
  };
  readonly tools?: readonly string[];
  readonly skills?: readonly string[];
}

/**
 * 字段归属矩阵（bug 7ca12bc8 规格正本）：
 * - 配置半 = {provider, model, reasoning, tools, skills}（+disabled 位）——写
 *   experts.<实例ID> 条目，永不触碰档案，不影响来源；
 * - 内容半 = {title, description, personaMd}——写档案（内置专家 update 升级 user
 *   层副本、来源翻「用户」）；
 * - 不可写：name（身份键）/ instanceId / origin / enabled（enabled 走配置半 disabled 位）。
 */
export const CONFIG_HALF_FIELDS = ["provider", "model", "reasoning", "tools", "skills"] as const;
export const CONTENT_HALF_FIELDS = ["title", "description", "personaMd"] as const;

/**
 * 内容差异检测（bug 7ca12bc8 save 分流前置门）：内容半字段 draft vs 档案现值逐字段
 * 比对（字符串 trim 归一）。全等 = false → 纯路由保存跳过 update（来源保持内置）；
 * 任一不等 = true → update 档案径照常。
 */
export function isContentDirty(draft: ExpertDraft, expert: ExpertView): boolean {
  return (
    draft.title.trim() !== expert.title.trim() ||
    draft.description.trim() !== expert.description.trim() ||
    draft.personaMd.trim() !== expert.personaMd.trim()
  );
}

/** update 路由载荷（provider/model 归一后形态——空串归缺键，frontmatter 无键回落继承；reasoning 不入档案载荷——写 experts 条目）。 */
export type ExpertWireDraft = Omit<ExpertDraft, "provider" | "model" | "reasoning"> & {
  readonly provider?: string;
  readonly model?: string;
};

/** 简介字数上限（ui-design F2：≈ 3 行 × 46 全角字 = 120，与 update 路由 zod 门同值）。 */
export const DESCRIPTION_MAX = 120;

/**
 * 工具白名单候选兜底清单（1.78：主源 = 宿主 ToolRuntime 目录透出（candidates 读口
 * tools 字段，含插件追加工具）；本清单降级为目录缺席时的兜底——旧宿主/官方目录面
 * 缺席场景维持可用）。
 */
export const TOOL_CANDIDATES: readonly string[] = ["read", "edit", "bash", "grep", "web", "skill"];

/**
 * multi-select 下拉菜单纵向封顶（px）——单点对齐正本：styles.ts .dswf-msel-menu
 * max-height 与 placement 视口封顶（mselMenuPlacement maxHeight 扣减）同源此常量。
 */
export const MSEL_MENU_MAX_PX = 220;

/** 草稿构造（数组深拷贝——编辑操作不污染原档案）。 */
export function draftOf(expert: ExpertView): ExpertDraft {
  return {
    title: expert.title,
    description: expert.description,
    personaMd: expert.personaMd,
    tools: [...expert.tools],
    skills: [...expert.skills],
    provider: expert.provider ?? "",
    model: expert.model ?? "",
    reasoning: expert.reasoning ?? "",
  };
}

/** 裸 {{ 命中（人设注入模板占位符非法——原型 saveDialog 同口径）。 */
export function hasBareMustache(text: string): boolean {
  return text.includes("{{");
}

/** 成对校验提示文案（provider/model 官方语义：同给同缺，任一缺席整组省略回落父 Agent）。 */
export const PAIR_ERROR = "provider 与 model 须成对填写（或同时清空继承父Agent）";

/** 保存校验门：返回字段级错误（空对象 = 通过）。 */
export function validateDraft(draft: ExpertDraft): {
  title?: string;
  personaMd?: string;
  provider?: string;
  model?: string;
} {
  if (draft.title.trim() === "") return { title: "岗位不能为空" };
  if (hasBareMustache(draft.personaMd)) {
    return { personaMd: "人设含裸 {{ ——不被允许" };
  }
  // provider/model 成对校验：只填其一 → 错误落已填字段；同给同缺通过。
  const hasProvider = draft.provider.trim() !== "";
  const hasModel = draft.model.trim() !== "";
  if (hasProvider !== hasModel) {
    return hasProvider ? { provider: PAIR_ERROR } : { model: PAIR_ERROR };
  }
  return {};
}

/** 草稿 → update 路由载荷：provider/model trim 后空串归缺键（不落半组、清空即回落继承）。 */
export function wireDraft(draft: ExpertDraft): ExpertWireDraft {
  return {
    title: draft.title,
    description: draft.description,
    personaMd: draft.personaMd,
    tools: draft.tools,
    skills: draft.skills,
    ...(draft.provider.trim() !== "" ? { provider: draft.provider.trim() } : {}),
    ...(draft.model.trim() !== "" ? { model: draft.model.trim() } : {}),
  };
}

/**
 * 草稿 → 档案内容载荷（experts 写缝在场时的 update 路由载荷）：内容半 = {title,
 * description, personaMd}；tools/skills 属配置半（字段归属矩阵，bug 7ca12bc8）——
 * 永不触碰档案，透传档案现值（zod 门 min(1) 满足 + 档案不被覆写——覆写语义归
 * experts 条目）；provider/model/reasoning 不进档案载荷（路由归 experts 条目）。
 */
export function archiveContentWireOf(draft: ExpertDraft, expert: ExpertView): ExpertWireDraft {
  return {
    title: draft.title,
    description: draft.description,
    personaMd: draft.personaMd,
    tools: expert.tools,
    skills: expert.skills,
  };
}

/**
 * 草稿 → experts.<实例ID> 条目补丁（保存写径的配置半 = 字段归属矩阵：provider/model/
 * reasoning/tools/skills）：provider/model 成对在场才落组（成对语义同 validateDraft 门）；
 * reasoning 非「默认」才落位；tools/skills 非空才落键——逐项清空 = 键归缺 = 回退档案值/
 * 不下发（无「清除覆盖」按钮的回退语义承载）。
 */
export function expertsEntryOf(draft: ExpertDraft): ExpertsEntryPatch {
  const provider = draft.provider.trim();
  const model = draft.model.trim();
  const paired = provider !== "" && model !== "";
  const agentOptions = {
    ...(paired ? { provider, model } : {}),
    ...(draft.reasoning !== "" ? { reasoning: draft.reasoning } : {}),
  };
  const hasAgentOptions = Object.keys(agentOptions).length > 0;
  return {
    ...(hasAgentOptions ? { agentOptions } : {}),
    ...(draft.tools.length > 0 ? { tools: [...draft.tools] } : {}),
    ...(draft.skills.length > 0 ? { skills: [...draft.skills] } : {}),
  };
}

/** multi-select 勾选/取消（保序）。 */
export function toggleInList(list: readonly string[], value: string): readonly string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** 技能新增（去空去重）。 */
export function addSkill(list: readonly string[], value: string): readonly string[] {
  const v = value.trim();
  if (v === "" || list.includes(v)) return list;
  return [...list, v];
}

/** 全目录技能候选汇总（去重保序——multi-select 技能下拉勾选项）。 */
export function unionSkills(entries: readonly ExpertView[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    for (const skill of entry.skills) {
      if (!seen.has(skill)) {
        seen.add(skill);
        out.push(skill);
      }
    }
  }
  return out;
}

/**
 * 工具候选裁定（1.78）：目录字段在场 = 官方 ToolRuntime 目录透出（含插件追加工具，
 * 保序去重）；缺席 = 兜底清单（TOOL_CANDIDATES——旧宿主/目录缺席场景）。
 */
export function toolCandidatesOf(
  catalogTools: readonly string[] | undefined,
): readonly string[] {
  if (catalogTools === undefined) return TOOL_CANDIDATES;
  return Array.from(new Set(catalogTools));
}

/**
 * 技能候选裁定（1.78）：目录字段在场 = 官方 skill 目录名为主源（并集既有档案技能
 * ——已保存的历史技能值保持下拉可选，不为零的向后兼容加法）；缺席 = 并集语义回退
 * （unionSkills——目录缺席注记）。
 */
export function skillCandidatesOf(
  catalogSkills: readonly string[] | undefined,
  entries: readonly ExpertView[],
): readonly string[] {
  const union = unionSkills(entries);
  if (catalogSkills === undefined) return union;
  const seen = new Set<string>(catalogSkills);
  const out = [...catalogSkills];
  for (const skill of union) {
    if (!seen.has(skill)) {
      seen.add(skill);
      out.push(skill);
    }
  }
  return out;
}

// ---- 人设 Markdown 分块（查看态渲染决策面） ---------------------------------

/** 行内片段（加粗 / 行内代码 / 纯文本）。 */
export interface MdInline {
  readonly t: "text" | "b" | "code";
  readonly v: string;
}

/** 块级行（标题 / 列表项 / 段落 / 围栏代码块 / GFM 管道表格）。 */
export interface MdBlock {
  readonly kind: "heading" | "li" | "para" | "code" | "table";
  readonly inline?: readonly MdInline[];
  /** code 块专有：infostring 语言 + 围栏体原文（bug b29f77e7）。 */
  readonly lang?: string;
  readonly source?: string;
  /** table 块专有：表头单元格与数据行（单元格均经行内解析）。 */
  readonly header?: readonly (readonly MdInline[])[];
  readonly rows?: readonly (readonly (readonly MdInline[])[])[];
}

/** 行内解析：**加粗** 与 `行内代码` 切分（保序；未闭合定界符按纯文本）。 */
export function mdInline(text: string): readonly MdInline[] {
  const out: MdInline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > last) out.push({ t: "text", v: text.slice(last, match.index) });
    out.push(
      match[1] !== undefined
        ? { t: "b", v: match[1] }
        : { t: "code", v: match[2] ?? "" },
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ t: "text", v: text.slice(last) });
  return out;
}

/** 表格行拆列（trim 首尾管道与单元格空白；单元格内不做管道转义——人设表格简单形态）。 */
function splitTableRow(line: string): readonly string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((cell) => cell.trim());
}

/** 分隔行判据（GFM：| --- | :---: | 形态）。 */
function isTableSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|\s*$/.test(line.trim());
}

/** 人设 Markdown → 块级行序列（标题/列表符剥离 + 行内解析 + 围栏代码块 + GFM 管道
 *  表格；空行丢弃）。围栏（```lang … ```）体原样成 code 块、不做行内解析；未闭合
 *  围栏兜底到文末（bug b29f77e7——查看态围栏按官方 .md-code-block 结构渲染，mermaid
 *  fence 由 md-mermaid 全局 DOM 增强器出图）。表格 = 首行 `|…|` + 次行分隔行，表体
 *  吞并后续连续管道行。 */
export function personaBlocks(personaMd: string): readonly MdBlock[] {
  const blocks: MdBlock[] = [];
  let fence: { lang: string; lines: string[] } | undefined;
  const lines = personaMd.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (fence !== undefined) {
      if (/^```\s*$/.test(line)) {
        blocks.push({ kind: "code", lang: fence.lang, source: fence.lines.join("\n") });
        fence = undefined;
      } else {
        fence.lines.push(line);
      }
      continue;
    }
    const fenceOpen = /^```(\S*)\s*$/.exec(line);
    if (fenceOpen !== null) {
      fence = { lang: fenceOpen[1] ?? "", lines: [] };
      continue;
    }
    if (line.trim() === "") continue;
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: "heading", inline: mdInline(line.replace(/^#{1,6}\s+/, "")) });
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({ kind: "li", inline: mdInline(line.replace(/^[-*]\s+/, "")) });
    } else if (
      /^\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1]!)
    ) {
      const header = splitTableRow(line).map(mdInline);
      i += 2; // 跳过表头 + 分隔行
      const rows: (readonly (readonly MdInline[])[])[] = [];
      for (; i < lines.length && /^\|.*\|\s*$/.test(lines[i]!.trim()); i++) {
        rows.push(splitTableRow(lines[i]!).map(mdInline));
      }
      i -= 1; // 外层 for 会再 +1
      blocks.push({ kind: "table", header, rows });
    } else {
      blocks.push({ kind: "para", inline: mdInline(line) });
    }
  }
  if (fence !== undefined) {
    blocks.push({ kind: "code", lang: fence.lang, source: fence.lines.join("\n") });
  }
  return blocks;
}
