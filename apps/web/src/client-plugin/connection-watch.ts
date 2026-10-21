// 断连终态横幅编排（问题①——renderer 侧无限重连的诚实终态呈现）。
// 官方 @deepseek-ai/dsh-client-connection 把连接状态机 provide 为具名服务 ctx.connection
//（rpc-host.d.ts Context 正门声明），state = { getSnapshot, subscribe }（useSyncExternalStore
// 同形）；重连 loop 设计上无次数上限无放弃终态（client.js:1020-1108，backoff cap ~10s/次）
// ——官方机械不改（§1.1 只插孔），产品层订阅状态叠加终态判定：
//   · connecting 持续 ≥ 阈值（缺省 60s ≈ 6+ 次退避失败）→ onShow（幂等，一次）；
//   · connected → onHide（自动撤除）；
//   · disconnected = 官方网络停转态（等网络恢复）——「请重启」建议不适用，零触发且计时复位；
//   · undefined（服务缺席/未启动）= 零注入 fail-soft。
// 呈现面归装配层薄胶水（onShow/onHide 回调——DOM 横幅按仓库惯例归实机走查，本模块零 DOM）。
export interface ConnectionStateFace {
  getSnapshot(): string | undefined
  subscribe(listener: () => void): () => void
}

export interface ConnectionWatchDeps {
  /** 时钟注入（单测；缺省 Date.now） */
  readonly now?: () => number
  /** connecting 卡死升级阈值（毫秒；缺省 60s） */
  readonly thresholdMs?: number
  /** 终态呈现（幂等语义由本模块保证——单次升级恰一次回调） */
  readonly onShow?: () => void
  /** 撤除（connected 到达 / 状态面失效） */
  readonly onHide?: () => void
}

/** 断连横幅订阅编排（返回 disposer——撤订阅 + 复位；重复调用幂等） */
export function installConnectionWatch(
  state: ConnectionStateFace | undefined,
  deps: ConnectionWatchDeps = {},
): () => void {
  if (state === undefined) return () => {} // 服务缺席 fail-soft（官方版本漂移容忍）
  const now = deps.now ?? Date.now
  const thresholdMs = deps.thresholdMs ?? 60_000
  let connectingSince: number | undefined
  let shown = false
  let disposed = false
  const evaluate = (): void => {
    if (disposed) return
    const snapshot = state.getSnapshot()
    if (snapshot !== 'connecting') {
      // connected = 撤除；disconnected/undefined = 网络停转态不触发（建议不适用），计时复位
      const wasShown = shown
      connectingSince = undefined
      shown = false
      if (wasShown) deps.onHide?.()
      return
    }
    if (connectingSince === undefined) {
      connectingSince = now()
      return
    }
    if (!shown && now() - connectingSince >= thresholdMs) {
      shown = true
      deps.onShow?.()
    }
  }
  evaluate() // 装载即判一次（订阅前快照不丢）
  const unsubscribe = state.subscribe(evaluate)
  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    if (shown) deps.onHide?.()
  }
}
