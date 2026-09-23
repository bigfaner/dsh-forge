// host/dispatch-launch/rpc — dispatch-launch 的 cordis rpc 面(任务 3.5)。
//
// TypertRemoteService(service key + wire namespace = `dispatchLaunch`),单方法:
//   - launch @Remote('launch') — 同批 N 行派发的启动请求批(内核 dispatchTasks
//     应答携带的 launch payload,renderer relay 原样转交;3.9/e2e 消费面)。
//     每请求先登记派发会话(registry —— approval-bridge 认领过滤的数据源,
//     sessionId 预铸先于 create),再走 launch 核 N 次独立 create;结果按
//     请求序对齐返回(内核 failed/running 态的回填面 = relay 侧 notify 动词,
//     不在本面)。
// 装饰器语法封闭在此(工作区测试 transform 不降级标准装饰器;单测经 tsc 产物
// 加载 —— session-launch-rpc / forge-tools rpc 先例);逻辑在 launch.ts。

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createDispatchLaunchCore, type DispatchLaunchDeps, type DispatchLaunchOutcome, type DispatchLaunchRequest } from './launch'
import type { DispatchSessionRegistry } from './registry'

/** 批量启动的 wire 入参(与请求序对齐的结果)。 */
export interface DispatchLaunchRpcInput {
  readonly launches: readonly DispatchLaunchRequest[]
}

/** 批量启动的 wire 结果(results[i] 对应 launches[i])。 */
export interface DispatchLaunchRpcResult {
  readonly results: readonly DispatchLaunchOutcome[]
}

/**
 * dispatch-launch rpc 面(构造后 `ctx.remote.dispatchLaunch.launch` 经 SRC
 * 发现可路由;client 侧 mount 归 3.9/e2e)。
 */
export class DispatchLaunchService extends TypertRemoteService {
  private readonly core: ReturnType<typeof createDispatchLaunchCore>
  private readonly registry: DispatchSessionRegistry

  constructor(ctx: Context, registry: DispatchSessionRegistry, deps?: DispatchLaunchDeps) {
    super(ctx, 'dispatchLaunch')
    this.core = createDispatchLaunchCore(deps ?? { getSessionChannel: () => undefined })
    this.registry = registry
  }

  @Remote('launch')
  launch(input: DispatchLaunchRpcInput): Promise<DispatchLaunchRpcResult> {
    // 认领登记先于 create(sessionId 预铸已知;审批最早在会话跑起后到达)。
    for (const request of input.launches) {
      if (typeof request.sessionId === 'string' && request.sessionId !== '') {
        this.registry.register(request.sessionId, {
          dispatchId: request.dispatchId,
          batchId: request.batchId,
          projectId: request.projectId,
          taskKey: request.taskKey,
        })
      }
    }
    return this.core.launchBatch([...input.launches]).then(results => ({ results }))
  }
}
