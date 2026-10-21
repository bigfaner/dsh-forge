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
  /**
   * 结算投递（3b④ settlement 形态——dispatch-loop-hardening 1.11）：持久 user message
   * （source {kind:'dispatch-loop-settled'}）三径投递——空闲→followup / 运行中→steer /
   * 会话失活→不投死信 + 必达告警（降级为任意会话凭 slug 认领处置）。缺席 = 回退 followup
   * （既有装配/测试桩向后兼容——narrator 面回落，不破坏 #28 分流）。
   */
  settle?(sessionId: string, text: string): Promise<void>
}

/** fail-soft 包装：注入任何故障（同步抛出/拒绝）静默降级；空 sessionId 直接跳过。
 *  settle 恒在场（回退链内置——包装产物对结算径无缺席形态） */
export function failSoftNarrationChannel(
  inner: NarrationChannel,
): NarrationChannel & { settle(sessionId: string, text: string): Promise<void> } {
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
    async settle(sessionId: string, text: string): Promise<void> {
      if (sessionId === '') return
      // 结算径回退链：装配面未接 settle（旧装配/测试桩）→ followup（#28 终局通道原径）；
      // 已接 → fail-soft 同纪律（投递故障静默——必达告警由装配面在不可达时自担）
      try {
        const settle = inner.settle
        if (typeof settle === 'function') await settle(sessionId, text)
        else await inner.followup(sessionId, text)
      } catch {
        // 静默降级（SC7 同径——结算缺席不拖垮循环收口）
      }
    },
  }
}
