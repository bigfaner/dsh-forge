// panel/summon-logic —— 召唤对话纯逻辑面（HR 招聘对话，已批原型 app.js hrSend
// 语义移植）：开场指引、建档请求 → update 路由载荷派生（key/岗位/简介/工具白名单/
// 技能/人设草稿）、回执与错误文案。零副作用零 DOM。

import type { ExpertDraft } from "./detail-logic.js";

/** 简介字数上限（update 路由 zod 门同值——超长派生截断兜底）。 */
const DESCRIPTION_LIMIT = 120;

/** 开场指引（原型 openHr 首条 hr 消息逐位）。 */
export const OPENING_GUIDE: { readonly from: "hr"; readonly text: string; readonly ref: string } = {
  from: "hr",
  text: "你好，我是 HR，负责专家的招聘与管理。",
  ref: "试试：「招募一个数据库迁移专家，工具只留读写与检索」",
};

/** 建档占位文案（原型「正在建档…」）。 */
export function thinkingText(): string {
  return "正在建档…";
}

/** 建档回执文案（原型回执逐位：岗位名 + 英文标识 chip + 联动刷新注记）。 */
export function receiptText(title: string, key: string): string {
  return `已建档 ${title}（${key}）：人设与工具白名单按你的要求起草，详情卡片可继续编辑。`;
}

/** 回执 ref 引导行。 */
export const RECEIPT_REF = "面板列表已刷新 · 档案正本已落专家目录";

/** 建档失败文案（错误原因透出，控制器不崩）。 */
export function errorText(reason: string): string {
  return `建档失败：${reason}`;
}

/** key 生成（update 路由 kebab-case 门 ^[a-z][a-z0-9-]*$；时间基 + 单调序保证唯一）。 */
let lastStamp = 0;
function nextKey(now: () => number): string {
  const stamp = now();
  lastStamp = stamp > lastStamp ? stamp : lastStamp + 1;
  return `expert-${lastStamp.toString(36)}`;
}

/** 岗位派生（原型 hrSend 正则同型：「招募一个 XX（专家/师）?」→「XX专家」，兜底「新入职」）。 */
export function recruitTitle(text: string): string {
  const match = text.match(/招募一个(.+?)(?:专家|师)?(?:[，,。].*)?$/);
  const core = match?.[1]?.trim();
  return core !== undefined && core !== "" ? `${core}专家` : "新入职";
}

/** 工具白名单派生（原型同型：「读写」→ read+edit，其余 read+grep）。 */
export function recruitTools(text: string): readonly string[] {
  return /读写/.test(text) ? ["read", "edit"] : ["read", "grep"];
}

/**
 * 建档请求派生：用户消息 → update 路由 upsert 载荷（key 由时间基生成保唯一；
 * 简介超 120 字截断兜底；技能按原型落 new 标记；人设为 HR 起草占位——详情 Dialog
 * 可继续编辑）。now 注入（测试确定性）。
 */
export function deriveRecruit(
  text: string,
  now: () => number = Date.now,
): { readonly key: string; readonly title: string; readonly tools: readonly string[]; readonly draft: ExpertDraft } {
  const title = recruitTitle(text);
  const tools = recruitTools(text);
  const fullDescription = `Newly onboarded by HR: ${text}`;
  const description =
    fullDescription.length > DESCRIPTION_LIMIT
      ? fullDescription.slice(0, DESCRIPTION_LIMIT)
      : fullDescription;
  return {
    key: nextKey(now),
    title,
    tools: [...tools],
    draft: {
      title,
      description,
      personaMd: `（HR 按你的要求起草的人设，可在详情 Dialog 编辑）依对话需求执行：${text}`,
      tools: [...tools],
      skills: ["new"],
    },
  };
}
