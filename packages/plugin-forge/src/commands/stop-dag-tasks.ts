// commands · /stop-dag-tasks 指令 handler（S2——run-tasks-host-command decisions #20）：
// 无参直停同一会话（ownerSessionId = 敲指令会话）启动的活循环——取消 in-flight + 收口
// 叙述 + 循环终态全归驱动器 stop 面（in-flight 真化 interrupted + ⑰ stopped-by-command
// followup 经 S4 模块）；本 handler 只做会话作用域透传与回执。本会话无活循环 = no-op
// 文本「本会话没有派发任务」，不附归属、不误停其它会话循环（跨会话隔离判定在驱动器
// registry.byOwner——driver 层另有 pin）。
import type { LoopDriver } from '../loop/index.js'
import type { ForgeCommandInvocation, ForgeCommandResult } from '../faces.js'

/** 指令名（无 input 描述符——无参指令，composer 不展示占位） */
export const STOP_DAG_TASKS_NAME = 'stop-dag-tasks'

/** 本会话无活循环的 no-op 回执（decisions #20 逐字口径——零归属信息） */
export const NO_ACTIVE_LOOP_TEXT = '本会话没有派发任务'

export interface StopDagTasksDeps {
  readonly driver: LoopDriver
}

/** handler（ForgeCommandDefinition.handler 形状——UI command plane 直执行，零模型消息） */
export function createStopDagTasksHandler(
  deps: StopDagTasksDeps,
): (invocation: ForgeCommandInvocation) => Promise<ForgeCommandResult> {
  return async ({ agent }: ForgeCommandInvocation): Promise<ForgeCommandResult> => {
    // 停止即打断（bug a098e20c——回执被在途 owner 模型轮压住）：owner 会话模型轮在途时
    // 先以官方 Agent.cancel 打断（keepInbox: true——queued/steering 输入按 CancelOptions
    // 语义保留），在途轮让渡后 stop 收口与回执才落在重试窗口内；官方 cancel 对空闲 agent
    // 是 no-op，故仅在 status==='running' 且 cancel 面在场时触发（结构化子面 fail-soft）。
    // Root cause: stop 受理与回执时序排在在途模型轮之后——在途轮不先让渡，回执出不了窗口。
    if (agent.cancel !== undefined && agent.status === 'running') {
      try {
        agent.cancel({ kind: 'user' }, { keepInbox: true })
      } catch (cause) {
        console.warn(`forge stop-dag-tasks: interrupt in-flight turn failed (fail-soft, stop continues): ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    // 停止作用域键 = 敲指令会话（decisions #20）——驱动器按归属拒绝他会话循环
    const record = deps.driver.activeOf(agent.session.id)
    const result = await deps.driver.stop({ ownerSessionId: agent.session.id })
    if (!result.ok) {
      return { kind: 'success', text: NO_ACTIVE_LOOP_TEXT }
    }
    const slug = record?.source.slug
    const inflight = result.hadInFlight ? '，正在执行的任务已暂停，下次派发会继续' : ''
    return { kind: 'success', text: `已停止${slug !== undefined ? `任务源 ${slug} 的` : ''}派发循环${inflight}` }
  }
}
