// 跨域零语义小件（定位：基础）——forge 业务域消费的最小助手单源（知识域消费面已随
// knowledge-stage1-foundation 1.8 退役）。fix-35 收编：errMessage/errorMessage/内联三元 单 util。
// lib 公共包归拢（plugin-project 1.2）：自 packages/core/src/util.ts git mv 迁入，core 留 re-export 兼容面。

/** unknown 错误的消息面（Error 取 message，其余 String 化——记账/包装/降级日志统一口径） */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
