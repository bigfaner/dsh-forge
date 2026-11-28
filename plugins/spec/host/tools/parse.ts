// spec tool 入参解析共享面（plugin-spec 1.4——goals 全集/tiers 词表防御收窄；
// 原语单源 lib/api tools/args，本文件只做 spec 域形状组装）。
import { requiredString, optionalString, ToolArgsError } from "@dsh-forge/lib-api/tools/args";

/** Goal 输入形状（域 GoalInput 同形——tools 层零 import 域类型的入参镜像禁令不含此面：
 *  tools → domain 单向依赖合法，但入参经防御收窄后组装，域类型由服务层签名承接） */
export interface ParsedGoalInput {
  title: string;
  brief?: string;
  acs: string[];
}

/**
 * goals 全集解析（createSpec / replaceSpecGoals 共用）：数组根 + 逐 goal
 * {title 必填, brief 可选, acs 非空字符串数组必填}；形状非法即抛（fail-loud——
 * 服务层校验门只管语义，形状防御在执行点自证）。
 */
export function parseGoals(args: Record<string, unknown>, tool: string): ParsedGoalInput[] {
  const raw = args["goals"];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ToolArgsError(`${tool}: goals must be a non-empty array of {title, acs[]}`)
  }
  return raw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new ToolArgsError(`${tool}: goals[${i}] must be an object`)
    }
    const g = entry as Record<string, unknown>;
    const title = requiredString(g, "title", tool);
    const acsRaw = g["acs"];
    if (!Array.isArray(acsRaw) || acsRaw.some((c) => typeof c !== "string" || c === "")) {
      throw new ToolArgsError(`${tool}: goals[${i}].acs must be an array of non-empty strings`)
    }
    const brief = optionalString(g, "brief", tool);
    return {
      title,
      ...(brief !== undefined ? { brief } : {}),
      acs: acsRaw as string[],
    };
  });
}
