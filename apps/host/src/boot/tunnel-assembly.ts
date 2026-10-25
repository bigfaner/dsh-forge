// 隧道装配段（dsh-mobile-tunnel）：child.ts 隧道分支的装配面——TunnelManager 构建、
// 状态推送（sendTunnelState）、toggle（tab 重连/按需建立）与 fallback（显式换线）。
// bug ebadf4ad：装配 = 纯装配零副作用——隧道只在用户打开远程控制界面（互联网 tab ensure
// → tunnel-toggle）时按需建立，boot 不在后台自启（快速隧道闪断的自愈重试随之只在链路
// 真实在场时发生）。外部依赖面（下载/进程/stdout）经 TunnelDeps 注入（cloudflared.ts）。
import { TunnelManager, type TunnelDeps, type TunnelState } from '../tunnel/index.js'

export interface TunnelAssemblyOptions {
  /** 反代目标 = 本机配对面端口（/pair 缝所在桥接服务器） */
  localPort: number
  /** cloudflared 种子候选（官方 DSH Desktop 已下载二进制） */
  externalSeeds?: readonly string[]
  /** 诊断行出口（harness.log 既有链） */
  diag: (line: string) => void
  /** child → 主消息发送缝（tunnel 状态推送载体） */
  send: (message: unknown) => void
  /** 隧道 URL → 配对地址换签缝（`${tunnelUrl}/pair?token=` 形状——token 随 pair 轮换换新，
   *  由调用侧以闭包读当前 token，装配段不持 mutable 锚） */
  pairUrlOf: (tunnelUrl: string) => string
  deps: TunnelDeps
}

export interface TunnelAssemblyHandle {
  manager: TunnelManager
  /** fix-17 ②：tab 切换重连缝——无活动链路 = 按需建立；在线 = 重推当前状态（读数刷新面） */
  toggle(): void
  /** fix-18：显式换线缝——TunnelManager.fallback（停旧链起新链） */
  fallback(): void
  /** 读数重推缝（PIN 轮换重连/token 轮换定时器消费）：给态即推该态；缺省推当前态
   *  （无活动链路 = 零载荷撤除推送，与既有 sendTunnelState(undefined) 同语义） */
  refresh(state?: TunnelState): void
}

/** 隧道状态推送（run.ts 原位重建 manifest 隧道面：激活/换线即换新，关闭/失效即撤除；
 *  remainingTtlMs===0 = TunnelManager 自动兜底双链皆败的死亡 emit——意外关闭撤面事件携位，
 *  UI 一次性守卫据此自动重开隧道）。 */
function sendTunnelStateOf(
  send: TunnelAssemblyOptions['send'],
  pairUrlOf: TunnelAssemblyOptions['pairUrlOf'],
): (state: TunnelState | undefined) => void {
  return (state) => {
    if (state === undefined) {
      send({ type: 'tunnel' }) // 零载荷 = 关闭/失效撤除面
      return
    }
    if (state.remainingTtlMs === 0) {
      // fix-19 ⑦：意外死亡撤面事件携位（官方 :1188 unexpectedlyClosed 语义）
      send({
        type: 'tunnel',
        tunnelUrl: pairUrlOf(state.url),
        tunnelProvider: state.provider,
        unexpectedlyClosed: true,
      })
      return
    }
    send({
      type: 'tunnel',
      tunnelUrl: pairUrlOf(state.url),
      tunnelProvider: state.provider,
      ...(state.remainingTtlMs !== undefined
        ? { tunnelExpiresAt: Date.now() + state.remainingTtlMs }
        : {}),
    })
  }
}

/** 装配隧道段：零副作用（不建隧道、不派生子进程）——建立只经 toggle 按需触发。 */
export function assembleTunnel(options: TunnelAssemblyOptions): TunnelAssemblyHandle {
  const { deps, localPort, externalSeeds, diag, send, pairUrlOf } = options
  const sendTunnelState = sendTunnelStateOf(send, pairUrlOf)
  const manager = new TunnelManager(deps, {
    localPort,
    externalSeeds,
    diag: (line) => diag(line),
  })
  manager.onEvent(sendTunnelState)
  return {
    manager,
    toggle: () => {
      if (manager.state === undefined) {
        diag(`[pair-diag] tunnel toggle → start（当前无活动链路）`)
        void manager
          .start()
          .then((state) => {
            diag(`[pair-diag] tunnel toggle start ok（${state.provider}）`)
            sendTunnelState(state)
          })
          .catch((cause) => {
            diag(`[pair-diag] tunnel toggle start 失败（撤面）：${cause instanceof Error ? cause.message : String(cause)}`)
            sendTunnelState(undefined)
          })
        return
      }
      diag(`[pair-diag] tunnel toggle → 重推当前状态（读数刷新）`)
      sendTunnelState(manager.state)
    },
    fallback: () => {
      diag(`[pair-diag] tunnel fallback 触发（停当前链路起另一条）`)
      void manager
        .fallback()
        .then((state) => {
          diag(`[pair-diag] tunnel fallback 收敛（新链路建立）`)
          sendTunnelState(state)
        })
        .catch((cause) => {
          // bug cf0db7e5 CDP 回归实证竞态：fallback 的 startPinggy 捕获窗口内并发 ensure
          // 已建新链——仅当此刻确无活动链路才撤面；有则回推活面。
          const live = manager.state
          diag(`[pair-diag] tunnel fallback 失败（${cause instanceof Error ? cause.message : String(cause)}）——${live !== undefined ? '并发链路在场，回推活面' : '无活动链路，撤面'}`)
          sendTunnelState(live)
        })
    },
    refresh: (state) => {
      sendTunnelState(state ?? manager.state)
    },
  }
}
