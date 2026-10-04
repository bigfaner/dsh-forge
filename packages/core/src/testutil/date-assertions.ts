// 「ISO 形状」断言口径单点（fix-35 收编：db.test 与 forge project-service.test 两份 ISO
// 助手同名失真——实际语义 = Date.parse 可解析（宽松），严格格式断言另用 toMatch 正则）。
// 定位：测试专用支撑件（非生产面，本目录不进任何生产 import 图）。

/** 可解析即真（不校验严格 ISO-8601 形状——命名按真实语义而非 ISO 缩写） */
export const isParseableDateStyle = (s: string): boolean => !Number.isNaN(Date.parse(s))
