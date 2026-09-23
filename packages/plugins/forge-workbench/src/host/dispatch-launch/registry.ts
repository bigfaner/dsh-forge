// host/dispatch-launch/registry — 派发会话登记表(任务 3.5)。
//
// spike-2 §1.2/§4-1 的过滤面数据源:approval-bridge 对 `approval/request`
// waterfall 的认领判定 = `request.agent.id` ∈ dispatch 会话集合(ACP 桥
// ownedRecord 同型归属过滤);本表 = 该集合的 host 进程内实现 —— sessionId
// (与 dispatch.session_id 同键,spike-2 §1.4「同键直接 join,无映射层」)
// → 派发绑定。dispatch-launch 在收到启动请求时即登记(sessionId 预铸先于
// create,审批最早也只能在会话跑起来后到达)。
//
// 边界与降级(注释钉定,非断言面):表是 host 进程内存态 —— 宿主重启后旧
// 派发会话不在集合内,其审批事件按「非本集」委派 next()(上游会话内面板
// 承接,行为零改动),不丢审批、不误认领。

/** 一条派发会话的归属绑定(approval-bridge 认领判定 + receiveApproval 入参来源)。 */
export interface DispatchSessionBinding {
  readonly dispatchId: string
  readonly batchId: string
  readonly projectId: string
  readonly taskKey: string
}

/** 登记表面(注入消费;测试可换假体)。 */
export interface DispatchSessionRegistry {
  register(sessionId: string, binding: DispatchSessionBinding): void
  lookup(sessionId: string): DispatchSessionBinding | null
}

/** 进程内 Map 实现(重复 register 同 id = 覆盖,幂等)。 */
export function createDispatchSessionRegistry(): DispatchSessionRegistry {
  const table = new Map<string, DispatchSessionBinding>()
  return {
    register(sessionId: string, binding: DispatchSessionBinding): void {
      table.set(sessionId, binding)
    },
    lookup(sessionId: string): DispatchSessionBinding | null {
      return table.get(sessionId) ?? null
    },
  }
}
