// workbench/dispatch/launch-port — subagent 启动的 host 回调接口(任务 3.3)。
//
// Hard Rule(任务 3.3 / tech-design §Architecture 裁决):内核不持会话创建权
// —— dispatch 逻辑入内核,subagent 启动(sessionController create/prompt,
// M2 先例)归 host 半身(任务 3.5 的 dispatch-launch 接线本端口)。本模块
// 只声明接缝形态:内核在 dispatch 行落库(starting)后经 launch() 把预合成
// 注入内容交给 host,host 创建 subagent 并回传 sessionId;内核对该字符串
// 不透明传输(仅保证完整交付,tech-design §Interface 3)。
//
// 结果驱动(tech-design §Interface 3 降级链):
//   - ok + sessionId → 内核事务回填 session_id 并迁移 starting → running;
//   - ok:false + error → 内核落 failed 态 + 原因(ERR_DISPATCH_LAUNCH_FAILED
//     呈现口径:「派发 failed 态 + 原因 + 重派发」,不弹模态);
//   - 未接线(3.3 缺省)→ 行留 starting(host 侧归 3.5,非错误)。
//
// 预合成内容非空 / prompt_hash 已定型的契约检查(③ 查的内核侧两查)在
// dispatch-service 派发前完成;通道可解析查(① 查)归 host 侧(3.5)。

/** 内核 → host 的单次启动入参(一行 dispatch 的完整传输面)。 */
export interface DispatchLaunchInput {
  readonly dispatchId: string
  readonly batchId: string
  readonly projectId: string
  readonly featureSlug: string
  /** 看板限定地址 `<featureSlug>/<localId>`。 */
  readonly taskKey: string
  /** 任务类型(预合成协议选择键);未落 = null。 */
  readonly taskType: string | null
  /** 预合成注入内容(3.4 引擎产物 = 组合首条消息;内核不解释,只透传)。 */
  readonly prompt: string
  /** 注入内容 sha256(与 dispatch 行 prompt_hash 同值,SC3 断言锚点)。 */
  readonly promptHash: string
  /**
   * 预铸 sessionId(spike③ §4:3.4 引擎 compose 时铸造并随 dispatch 行
   * 落库 —— prompt_hash 是其函数)。3.5 dispatch-launch 以同 id 走
   * create({sessionId}) 幂等 adopt,再 prompt 投递注入内容。null = 无预
   * 铸形态(3.3 语义,host 自铸)。
   */
  readonly sessionId: string | null
}

/** 单次启动结果:成功回传 sessionId;失败携带原因(failed 态落库面)。 */
export type DispatchLaunchOutcome =
  | { readonly ok: true; readonly sessionId: string }
  | { readonly ok: false; readonly error: string }

/**
 * host 回调接口(任务 3.5 接线:packages/plugins/forge-workbench host 半身
 * 的 dispatch-launch 实现)。允许同步或异步(会话创建 ≤3s 启动预算)。
 */
export interface DispatchLaunchPort {
  launch(input: DispatchLaunchInput): Promise<DispatchLaunchOutcome> | DispatchLaunchOutcome
}
