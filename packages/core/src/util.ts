// 跨域零语义小件（定位：基础）——forge/knowledge 两业务域同构消费的最小助手单源
// （依赖铁律③ 同级业务互禁 forge ↔ knowledge，共享件只能落在域外基础层——与 db/ 同层，
// 但不属库语义，独立成文件）。fix-35 收编：errMessage/errorMessage/内联三元 ×6 单 util。

/** unknown 错误的消息面（Error 取 message，其余 String 化——记账/包装/降级日志统一口径） */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
