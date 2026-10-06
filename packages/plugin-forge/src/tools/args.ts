// 参数防御收窄共享原语（定位：业务——knowledge「执行点自证」形制的六 tool 共用面）。
// 注册面不做 schema 前置校验（无 defineTool 包装）——各 tool parseXxxArgs 在执行点
// 自证类型与词表；本文件只提供无状态窄化原语，错误信息统一带 tool 可读上下文。
/** 对象根检查（一切 parseXxxArgs 第一步） */
export function requireArgsObject(args: unknown, tool: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null) throw new Error(`${tool}: arguments must be an object`)
  return args as Record<string, unknown>
}

/** 可选字符串参数（在场即须为 string；空串视为缺省——agent 常见空串噪声） */
export function optionalString(a: Record<string, unknown>, key: string, tool: string): string | undefined {
  const v = a[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string') throw new Error(`${tool}: ${key} must be a string`)
  return v === '' ? undefined : v
}

/** 必填非空字符串参数 */
export function requiredString(a: Record<string, unknown>, key: string, tool: string): string {
  const v = optionalString(a, key, tool)
  if (v === undefined) throw new Error(`${tool}: ${key} must be a non-empty string`)
  return v
}

/** 可选布尔参数 */
export function optionalBoolean(a: Record<string, unknown>, key: string, tool: string): boolean | undefined {
  const v = a[key]
  if (v === undefined) return undefined
  if (typeof v !== 'boolean') throw new Error(`${tool}: ${key} must be a boolean`)
  return v
}

/** 可选受限词表参数（枚举值在调用方词表内——schema 面无 enum，收窄落执行点） */
export function optionalEnum<T extends string>(
  a: Record<string, unknown>,
  key: string,
  vocabulary: readonly T[],
  tool: string,
): T | undefined {
  const v = a[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string' || !vocabulary.includes(v as T)) {
    throw new Error(`${tool}: ${key} must be one of [${vocabulary.join(', ')}]`)
  }
  return v as T
}

/** 必填受限词表参数 */
export function requiredEnum<T extends string>(
  a: Record<string, unknown>,
  key: string,
  vocabulary: readonly T[],
  tool: string,
): T {
  const v = optionalEnum(a, key, vocabulary, tool)
  if (v === undefined) throw new Error(`${tool}: ${key} must be one of [${vocabulary.join(', ')}]`)
  return v
}

/** 可选字符串数组参数（元素非空） */
export function optionalStringArray(a: Record<string, unknown>, key: string, tool: string): string[] | undefined {
  const v = a[key]
  if (v === undefined) return undefined
  if (!Array.isArray(v) || v.some((e) => typeof e !== 'string' || e === '')) {
    throw new Error(`${tool}: ${key} must be an array of non-empty strings`)
  }
  return v as string[]
}

/** 可选 0–1 小数参数（覆盖率口径——contracts coverage 小数） */
export function optionalFraction(a: Record<string, unknown>, key: string, tool: string): number | undefined {
  const v = a[key]
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new Error(`${tool}: ${key} must be a number between 0 and 1`)
  }
  return v
}

/**
 * 成对显式参数（本插件「两显式参」纪律的完整性检查：a_key 与 b_key 同给或同缺，
 * 禁半对——半对 = 拼接歧义的另一形态）。
 */
export function optionalPair(
  a: Record<string, unknown>,
  aKey: string,
  bKey: string,
  tool: string,
): { first: string; second: string } | undefined {
  const first = optionalString(a, aKey, tool)
  const second = optionalString(a, bKey, tool)
  if (first === undefined && second === undefined) return undefined
  if (first === undefined || second === undefined) {
    throw new Error(`${tool}: ${aKey} and ${bKey} must be given together (both or neither)`)
  }
  return { first, second }
}
