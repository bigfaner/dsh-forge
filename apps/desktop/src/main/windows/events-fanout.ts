// windows/events-fanout — 壳层事件按 webContents fan-out(任务 4.2;
// tech-design §Interfaces·Interface 5「事件推送按 webContents fan-out」+
// §Architecture Component Diagram「push(每窗 fan-out)」)。
//
// 泛化面(M1 单主窗推送 → 主窗 + detached 集):
//   - shell 推送(update-state / recovery-state / window-changed):本模块
//     逐存活 webContents 直发;无 detached 时行为与 M1 pushToRenderer 逐字
//     等价(同通道、同载荷、destroyed 静默丢)。
//   - workbench 事件批量通道:既有 createWorkbenchEventSubscriptions
//     (workbench/ipc/handlers.ts)本就是逐 webContents 订阅登记 + destroyed
//     自动退订 —— detached 窗经同一 subscribe-events 动词入册(同源
//     dsh-app://app/ 帧,sender 校验天然放行),零新增代码即泛化。
//   - carriage/WS 改写:逐 webContents 注册 —— WS 改写层的判定输入由
//     「主窗单 id」泛化为壳窗口 id 集(protocol/ws-header-rewrite.ts),壳
//     引导每请求从注册表现取(见 index.ts 接线);detached 窗内 verb/事件
//     链路因此可用。
//
// 本模块零 Electron 依赖(推送目标面经 seam 注入;测试注入假体)。

/** fan-out 推送目标最小面(webContents.send;DI 假体同构)。 */
export interface PushTarget {
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

export interface WindowPushFanoutDeps {
  /** 存活推送目标(生产 = 窗口注册表 liveWebContents;每推送现取)。 */
  readonly targets: () => readonly PushTarget[]
}

export interface WindowPushFanout {
  /** 向全部存活壳窗口推送(destroyed 目标静默跳过)。 */
  push(channel: string, payload: unknown): void
}

export function createWindowPushFanout(deps: WindowPushFanoutDeps): WindowPushFanout {
  return {
    push(channel, payload) {
      for (const target of deps.targets()) {
        if (target.isDestroyed()) continue
        target.send(channel, payload)
      }
    },
  }
}
