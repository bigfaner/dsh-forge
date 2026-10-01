// `__DSH_TRANSPORT__` carrier（定位：基础）——dsh 面 RPC 通路声明（G1 契约面清单第 2 项）。
// ownsHost: true —— 页面排他拥有宿主（desktop 形态；连接层据此判 isLoopback，特权面可达）；
// streamBaseUrl —— Gateway WebSocket 基址（/api/remote.mux 相对它解析；HTTP RPC 走文档相对
// 路由，由宿主自定义 scheme 转发到 webserver）。形状镜像 @deepseek-ai/dsh-client-connection
// 的 ClientTransportHooks 切片（ownsHost/streamBaseUrl）——本包不引该 host 侧依赖，结构同型。

/** carrier 形状（ClientTransportHooks 的 ownsHost/streamBaseUrl 切片） */
export interface TransportCarrier {
  readonly ownsHost: boolean
  readonly streamBaseUrl: string
}

interface TransportGlobal {
  __DSH_TRANSPORT__?: TransportCarrier
}

/** 由已认证 web 面 URL 推导 carrier：streamBaseUrl = URL origin（官方 desktop 同式）。 */
export function transportCarrierFor(url: string): TransportCarrier {
  return { ownsHost: true, streamBaseUrl: new URL(url).origin }
}

/** 装 carrier（幂等重装以最新为准；须在 applyIndexInjections 之前——官方行按表序消费）。 */
export function installTransportCarrier(carrier: TransportCarrier): void {
  ;(globalThis as TransportGlobal).__DSH_TRANSPORT__ = carrier
}
