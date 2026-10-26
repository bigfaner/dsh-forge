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
}

/** 简介字数上限（ui-design F2：≈ 3 行 × 46 全角字 = 120，与 update 路由 zod 门同值）。 */
export const DESCRIPTION_MAX = 120;

/** 工具白名单候选清单（multi-select 下拉勾选项；原型固定清单同源）。 */
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
  };
}

/** 裸 {{ 命中（人设注入模板占位符非法——原型 saveDialog 同口径）。 */
export function hasBareMustache(text: string): boolean {
  return text.includes("{{");
}

/** 保存校验门：返回字段级错误（空对象 = 通过）。 */
export function validateDraft(draft: ExpertDraft): {
  title?: string;
  personaMd?: string;
} {
  if (draft.title.trim() === "") return { title: "岗位不能为空" };
  if (hasBareMustache(draft.personaMd)) {
    return { personaMd: "人设含裸 {{ ——不被允许" };
  }
  return {};
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

// ---- 人设 Markdown 分块（查看态渲染决策面） ---------------------------------

/** 行内片段（加粗 / 行内代码 / 纯文本）。 */
export interface MdInline {
  readonly t: "text" | "b" | "code";
  readonly v: string;
}

/** 块级行（标题 / 列表项 / 段落）。 */
export interface MdBlock {
  readonly kind: "heading" | "li" | "para";
  readonly inline: readonly MdInline[];
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

/** 人设 Markdown → 块级行序列（标题/列表符剥离 + 行内解析；空行丢弃）。 */
export function personaBlocks(personaMd: string): readonly MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const rawLine of personaMd.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") continue;
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push({ kind: "heading", inline: mdInline(line.replace(/^#{1,6}\s+/, "")) });
    } else if (/^[-*]\s+/.test(line)) {
      blocks.push({ kind: "li", inline: mdInline(line.replace(/^[-*]\s+/, "")) });
    } else {
      blocks.push({ kind: "para", inline: mdInline(line) });
    }
  }
  return blocks;
}
