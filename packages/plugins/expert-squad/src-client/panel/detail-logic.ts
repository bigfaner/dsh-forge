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
}

/** update 路由载荷（provider/model 归一后形态——空串归缺键，frontmatter 无键回落继承）。 */
export type ExpertWireDraft = Omit<ExpertDraft, "provider" | "model"> & {
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
  };
}

/** 裸 {{ 命中（人设注入模板占位符非法——原型 saveDialog 同口径）。 */
export function hasBareMustache(text: string): boolean {
  return text.includes("{{");
}

/** 成对校验提示文案（provider/model 官方语义：同给同缺，任一缺席整组省略回落继承）。 */
export const PAIR_ERROR = "provider 与 model 须成对填写（或同时清空回落继承）";

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

/** 块级行（标题 / 列表项 / 段落 / 围栏代码块）。 */
export interface MdBlock {
  readonly kind: "heading" | "li" | "para" | "code";
  readonly inline?: readonly MdInline[];
  /** code 块专有：infostring 语言 + 围栏体原文（bug b29f77e7）。 */
  readonly lang?: string;
  readonly source?: string;
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

/** 人设 Markdown → 块级行序列（标题/列表符剥离 + 行内解析 + 围栏代码块；空行丢弃）。
 *  围栏（```lang … ```）体原样成 code 块、不做行内解析；未闭合围栏兜底到文末
 *  （bug b29f77e7——查看态围栏按官方 .md-code-block 结构渲染，mermaid fence 由
 *  md-mermaid 全局 DOM 增强器出图）。 */
export function personaBlocks(personaMd: string): readonly MdBlock[] {
  const blocks: MdBlock[] = [];
  let fence: { lang: string; lines: string[] } | undefined;
  for (const rawLine of personaMd.split("\n")) {
    const line = rawLine.trimEnd();
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
    } else {
      blocks.push({ kind: "para", inline: mdInline(line) });
    }
  }
  if (fence !== undefined) {
    blocks.push({ kind: "code", lang: fence.lang, source: fence.lines.join("\n") });
  }
  return blocks;
}
