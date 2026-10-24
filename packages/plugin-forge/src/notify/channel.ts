// notify · 叙述通道面（S4 纯模块；decisions #17/#28 → loop-event-delivery 接口收窄）。
// 本模块以结构化最小面消费（faces.ts 同纪律——真实现结构兼容，运行期由装配方注入；
// 零上游 import）。fail-soft 包装 = SC7「叙述通道注入失败循环照常结束」的机械落点：
// 主会话删除/关闭等注入故障静默降级（异常不外抛不影响调用方），循环正确性只依赖宿主事件。
//
// 接口收窄（loop-event-delivery §接口收窄）：notice/followup/settle 三方法收敛为 send
// 统一单出口——官方 agent.send(message, target, wakeup) 一等把手（InboxTarget
// 'next-turn'|'next-step'，承重口径 = 'next-step'（官方合法值——bug 8d1a18bd 真机定罪
// 非法 'nextStep' 零落库）：claim 时 next-step 队列整批并取）。
// 唤醒与否只以 wakeup 参数区分（场景表路由：⑩⑬⑭⑮⑯⑰ true，其余 false）；消息形态
// （source.kind 铸造：forge-dispatch / forge-loop / dispatch-loop-settled）由 form 载体
// 声明，faces.ts 适配层单点兑现。
import type { ForgeLoopNarrationMeta } from '../forge-loop-source.js'

/** 消息形态（source.kind 铸造判别——GUI 折叠消息面条目按 kind 分流） */
export type NarrationForm = 'notice' | 'followup' | 'settle'

/** send 调用选项（缺席 = form notice + wakeup false——写入不唤醒） */
export interface NarrationSendOptions {
  /** 唤醒径（场景表路由单源——narrator 按 SCENARIOS 通道列换算：followup → true） */
  readonly wakeup?: boolean
  /** 消息形态（source.kind 铸造判别；缺省 notice） */
  readonly form?: NarrationForm
  /** 预构建场景单行摘要（折叠位；缺席 = 折叠位回退整段截断） */
  readonly headline?: string
  /** 循环叙述上下文（1.18 AD-4——forge-loop source 结构化字段） */
  readonly loop?: ForgeLoopNarrationMeta
}

/**
 * 主会话叙述通道（send 单出口——装配方把上游 agent.send 适配到本面；旧 notice/followup/
 * settle 三方法已收敛消失）。统一 target='next-step'：积压消息在下次 claim 整批并取
 * （dsh-agent-loop claim 语义，probe-1 实证），不逐条 drain 烧多回合。
 */
export interface NarrationChannel {
  /** 统一投递出口（wakeup=false 持久留痕不唤醒；wakeup=true 即时唤醒主 agent） */
  send(sessionId: string, text: string, options?: NarrationSendOptions): Promise<void>
}

/** fail-soft 包装：注入任何故障（同步抛出/拒绝）静默降级；空 sessionId 直接跳过 */
export function failSoftNarrationChannel(inner: NarrationChannel): NarrationChannel {
  return {
    async send(sessionId: string, text: string, options?: NarrationSendOptions): Promise<void> {
      if (sessionId === '') return
      try {
        await inner.send(sessionId, text, options)
      } catch {
        // 静默降级（SC7——叙述缺席不拖垮循环；仅看板+问询仍可达）
      }
    },
  }
}
