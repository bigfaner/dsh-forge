// notify · 叙述通道面（S4 纯模块；decisions #17/#28）。主会话注入的两条通道：
// notice（上游 agent.inject——零模型回合，不唤醒会话）与 followup（上游 agent.followup——
// 完整消息开新回合）。本模块以结构化最小面消费（faces.ts 同纪律——真实现结构兼容，
// 运行期由装配方注入；零上游 import）。fail-soft 包装 = SC7「叙述通道注入失败循环照常
// 结束」的机械落点：主会话删除/关闭等注入故障静默降级（异常不外抛不影响调用方），
// 循环正确性只依赖宿主事件。
//
// 通道分流归属（decisions #28）：notice = 常规进行事件（样例 ①-⑫）；followup = 终局
// 事件（样例 ⑬-⑰，每循环 1–2 条）。路由表见 templates.ts SCENARIOS。

/** 主会话叙述通道（装配方把上游 agent.inject/agent.followup 适配到本双方法面） */
export interface NarrationChannel {
  /** 常规事件注入（notice 形态——零模型回合；headline = 预构建场景单行摘要，缺席 = 折叠位回退整段截断） */
  notice(sessionId: string, text: string, headline?: string): Promise<void>
  /** 终局事件注入（完整消息——主会话新回合并唤醒） */
  followup(sessionId: string, text: string): Promise<void>
}

/** fail-soft 包装：注入任何故障（同步抛出/拒绝）静默降级；空 sessionId 直接跳过 */
export function failSoftNarrationChannel(inner: NarrationChannel): NarrationChannel {
  return {
    async notice(sessionId: string, text: string, headline?: string): Promise<void> {
      if (sessionId === '') return
      try {
        await inner.notice(sessionId, text, headline)
      } catch {
        // 静默降级（SC7——叙述缺席不拖垮循环；仅看板+问询仍可达）
      }
    },
    async followup(sessionId: string, text: string): Promise<void> {
      if (sessionId === '') return
      try {
        await inner.followup(sessionId, text)
      } catch {
        // 静默降级（同上）
      }
    },
  }
}
