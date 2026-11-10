// 「ISO 形状」断言口径单点（迁自 core src/testutil 同名件——lib/db 自含测试支撑件，
// 测试专用（非生产面，本目录不进任何生产 import 链）。
/** 可解析即真（不校验严格 ISO-8601 形状——命名按真实语义而非 ISO 缩写） */
export const isParseableDateStyle = (s: string): boolean => !Number.isNaN(Date.parse(s))
