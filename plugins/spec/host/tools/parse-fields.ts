// tool 入参解析共享面（plugin-spec-roadmaps 1.8——原语单源 lib/api tools/args，本文件只做
// spec 域形状组装：可选字符串键 / 可选字符串数组键 / ac_json 原样数组透传——结构校验
// 单点在服务层 parseAcEntries，工具面只做数组形防御收窄）。
import { optionalString, requireArgsObject, ToolArgsError } from "@dsh-forge/lib-api/tools/args";

/** 必填正整数（goal_seq 寻径形——0/负数/非整数/非 number 拒）。 */
export function requiredPositiveInteger(a: Record<string, unknown>, key: string): number {
  const raw = a[key];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new ToolArgsError(`${key}: must be a positive integer`);
  }
  return raw;
}

/** 可选非空字符串字段（取值即收窄——空串视为缺省）。 */
export function optionalStringField(a: Record<string, unknown>, key: string): string | undefined {
  return optionalString(a, key, key);
}

/** 可选字符串数组字段（include 形——元素须非空字符串）。 */
export function optionalStringArrayField(a: Record<string, unknown>, key: string): string[] | undefined {
  const raw = requireArgsObject(a, key)[key];
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || v === "")) {
    throw new ToolArgsError(`${key}: must be an array of non-empty strings`);
  }
  return raw as string[];
}

/** ac_json 原样数组透传（条目结构校验单点 = 服务层 parseAcEntries——typed Error 直达失败面）。 */
export function optionalAcEntries(a: Record<string, unknown>, tool: string): unknown[] | undefined {
  const raw = a["ac_json"];
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new ToolArgsError(`${tool}: ac_json must be an array of {criterion, id?, address?}`);
  }
  return raw;
}
