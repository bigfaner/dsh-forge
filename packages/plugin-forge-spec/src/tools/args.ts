// 参数防御收窄共享原语（定位：业务——plugin-forge args.ts 同型裁剪：本插件三 tool
// 参数全为 string（含受控词表），无数组/分数/成对面——原语只留 string 族）。
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
