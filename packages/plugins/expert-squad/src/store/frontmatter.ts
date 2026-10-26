// store/frontmatter —— 专家档案 .md 解析与注册期校验（tech-design §8 数据模型）。
// 单文件 fail-loud：任何不合法 → { ok: false, reason }（reason 含文件路径与原因），
// 由上层（scan/registry）跳过该文件、其余专家不受影响（§9 FMEA 首行）。
// 校验：必填 name/title/description/tools；禁裸 {{（persona {{…}} 插值语义互洽，
// 见 review-tech-report §组装内核）；同层撞名拒绝；name 建档后不可改。

import matter from "gray-matter";

/** 专家档案解析产物（§7 ExpertRecord 的档案半——origin/enabled 由 registry 层附加）。 */
export interface ExpertRecord {
  /** 英文键正本，唯一，建档后不可改 */
  name: string;
  /** 简介（选人依据） */
  title: string;
  description: string;
  /** 人设 Markdown 原文（frontmatter 块之后，不拼接） */
  personaMd: string;
  /** 工具白名单 → 使用方映射 toolFilter */
  tools: string[];
  skills: string[];
  /** 可选，派发模型偏好 */
  model?: string;
}

export type ExpertParseResult =
  | { ok: true; record: ExpertRecord }
  | { ok: false; reason: string };

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** 禁裸 {{ ——档案文本任何位置出现裸 `{{` 即拒绝（与 persona 严格 `{{…}}` 插值语义冲突）。 */
function containsBareMustache(s: string): boolean {
  return s.includes("{{");
}

// Root cause (bug b29f77e7): 模型/脚本写入档案时常把换行写成字面 `\n` 转义序列——
// 解析层归一为真实换行，视图渲染/编辑 textarea/persona 注入三面同源生效（编辑保存
// 后归一结果固化落盘）。无字面 \n 的档案零变化。
function normalizeEscapedNewlines(s: string): string {
  return s.includes("\\n") ? s.replaceAll("\\n", "\n") : s;
}

/** 解析 + 校验一份专家档案全文。失败 reason 恒含 filePath 与具体原因。 */
export function parseExpertFile(filePath: string, content: string): ExpertParseResult {
  let data: Record<string, unknown>;
  let personaMd: string;
  try {
    const parsed = matter(content);
    data = parsed.data;
    personaMd = parsed.content.trim();
  } catch (cause) {
    return {
      ok: false,
      reason: `${filePath}: frontmatter YAML 解析失败——${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }

  if (containsBareMustache(content)) {
    return { ok: false, reason: `${filePath}: 含裸 {{ ——与 persona {{…}} 插值语义冲突，不被允许` };
  }

  const name = data.name;
  const title = data.title;
  const description = data.description;
  if (typeof name !== "string" || name.trim() === "") {
    return { ok: false, reason: `${filePath}: 必填字段 name 缺失或为空` };
  }
  if (typeof title !== "string" || title.trim() === "") {
    return { ok: false, reason: `${filePath}: 必填字段 title 缺失或为空` };
  }
  if (typeof description !== "string" || description.trim() === "") {
    return { ok: false, reason: `${filePath}: 必填字段 description 缺失或为空` };
  }

  const tools = data.tools;
  if (!isStringArray(tools) || tools.length === 0) {
    return { ok: false, reason: `${filePath}: 必填字段 tools 缺失、为空或非字符串数组` };
  }

  if (data.skills !== undefined && !isStringArray(data.skills)) {
    return { ok: false, reason: `${filePath}: 字段 skills 非字符串数组` };
  }
  if (data.model !== undefined && typeof data.model !== "string") {
    return { ok: false, reason: `${filePath}: 字段 model 非字符串` };
  }
  if (personaMd === "") {
    return { ok: false, reason: `${filePath}: 正文人设 Markdown 缺失` };
  }

  return {
    ok: true,
    record: {
      name,
      title,
      description: normalizeEscapedNewlines(description),
      personaMd: normalizeEscapedNewlines(personaMd),
      tools,
      skills: data.skills ?? [],
      ...(data.model !== undefined ? { model: data.model } : {}),
    },
  };
}

/**
 * 同层撞名检测（tech-design §8：同层同键拒绝写入；跨层同键 = 遮蔽，归 scan 层处理）。
 * 返回撞名描述（含键与冲突双方路径）；无撞名 → null。
 */
export function detectSameLayerDuplicate(
  entries: readonly { name: string; filePath: string }[],
): string | null {
  const seen = new Map<string, string>();
  for (const { name, filePath } of entries) {
    const first = seen.get(name);
    if (first !== undefined) {
      return `同层撞名：专家键 ${name} 同时由 ${first} 与 ${filePath} 提供——同层同键拒绝写入`;
    }
    seen.set(name, filePath);
  }
  return null;
}

/**
 * 注册期 update 校验：内容照常解析校验，外加 name 不可改约束——
 * 与建档键不一致 → 拒绝（错误含旧键/新键/路径）。
 */
export function validateExpertUpdate(
  existingName: string,
  filePath: string,
  content: string,
): ExpertParseResult {
  const r = parseExpertFile(filePath, content);
  if (!r.ok) return r;
  if (r.record.name !== existingName) {
    return {
      ok: false,
      reason: `${filePath}: name 建档后不可改——建档键 ${existingName}，更新内容为 ${r.record.name}`,
    };
  }
  return r;
}
