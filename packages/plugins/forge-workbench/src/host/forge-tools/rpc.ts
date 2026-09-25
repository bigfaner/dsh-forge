// host/forge-tools/rpc — ForgeToolBridge 的 cordis rpc 面(任务 2.1;T2 桥)。
//
// TypertRemoteService(service key + wire namespace = `forgeToolBridge`),两方法:
//   - calls  @Remote({ mode: 'stream' })  — client 订阅面:每次 open 独立调用
//     一次(sessionController follow/control 同型流先例),逐帧吐桥调用;
//   - answer @Remote('answer')            — client 单向应答面:按 callId 终局。
// 机制依据 spike-1 §2 跳 2'(字面 host 发起 rpc 面封闭;SRC 发现 =
// TypertRemoteService.typertRemote binding,与 M2 ForgeBridge 同型;`signal`
// 尾参 = transport cancellation,gateway SRC 解析自动识别)。零新端口/零新
// 依赖/动词封闭保持。本文件是薄壳 —— 逻辑在 bridge-core.ts(decorator-free);
// decorator 语法封闭在此(工作区测试 transform 不降级标准装饰器,单测经
// tsc 产物加载,4.1 先例)。

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ForgeToolBridgeAnswer, ForgeToolBridgeCall, ToolBridgeCore,
} from './bridge-core'

/** 桥 rpc 面(构造后 `ctx.remote.forgeToolBridge.*` 经 SRC 发现可路由)。 */
export class ForgeToolBridgeService extends TypertRemoteService {
  private readonly core: ToolBridgeCore

  constructor(ctx: Context, core: ToolBridgeCore) {
    super(ctx, 'forgeToolBridge')
    this.core = core
  }

  /** client 订阅流:注册 waiter → backlog 重放 → 持续吐帧(见 bridge-core)。 */
  @Remote({ mode: 'stream' })
  calls(signal: AbortSignal): AsyncIterable<ForgeToolBridgeCall> {
    return this.core.attach(signal)
  }

  /** client 单向应答:过期/未知 callId 幂等忽略(answer 原样 ack)。 */
  @Remote('answer')
  answer(answer: ForgeToolBridgeAnswer): Promise<{ ok: true; ignored?: boolean }> {
    return Promise.resolve(this.core.settleFromClient(answer))
  }
}
