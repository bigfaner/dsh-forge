// 1.32 /api 非回环拦截（connection/request waterfall 硬化）——纯逻辑面。
//
// 背景：mobile-remote-approval fix-3 remoteExpose 使 webserver 行覆写 0.0.0.0 后，/api 面
// LAN 可达（明文 HTTP + 官方围栏自动信任 IP 字面量 Host）——配对设备可获完整桌面级会话
// 控制权。官方安全模型按回环设计（README「No server-wide TLS, authentication…」+「dsh web
// --host 0.0.0.0 remains unsupported」），remoteExpose 是产品自开的缝，加固义务自担。
//
// 拦截插槽核销（官方 dsh-client-connection README「Browser authentication and request
// trust」节 + lib/types/index.d.ts）：`connection/request` waterfall 事件 = 官方多听者插槽，
// 时序 = 官方 admit（围栏 + 会话认证）之后、body 传输之前——桌面安装锁同缝先例。多听者
// 语义下 next() 放行即交回后续监听者/共享 API 桥，桌面 /api 零影响。
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 恒定拒绝体（无错误 oracle——所有拒绝形态同一字节串）。 */
export const API_LOOPBACK_GUARD_BODY = 'Forbidden'

/**
 * 回环 Host 判定（纯函数）：
 * - Host 头缺席/空（HTTP/1.0 直连等）→ fail-open 归 true——畸形 Host 由官方围栏 403 承担，
 *   本面只对明确非回环的 Host 收紧（桌面请求恒携合法回环 Host，零影响）。
 * - WHATWG 归一：`localhost` / `*.localhost` / `127.0.0.0/8` / `::1`（含 `[::1]:port` 形态）
 *   为回环；畸形 Host → false（fail-closed——/api 收紧面从严）。
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined || host === '') return true
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (hostname === '[::1]' || hostname === '::1') return true
  const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (octets !== null) return Number(octets[1]) === 127
  return false
}

/** /api 面判定：pathname 恰为 `/api` 或以其为前缀目录（`/api/…`；`/api-evil` 不算）。 */
export function isApiPath(url: string): boolean {
  let pathname: string
  try {
    pathname = new URL(url, 'http://guard.invalid').pathname
  } catch {
    return false
  }
  return pathname === '/api' || pathname.startsWith('/api/')
}

/** 拦截判定（纯函数）：非回环 Host × /api 面 → true。 */
export function shouldBlockApiRequest(host: string | undefined, url: string): boolean {
  return !isLoopbackHost(host) && isApiPath(url)
}

/**
 * connection/request waterfall 监听器（装配面——child.ts 经 ctx.on 注册）：
 * 非回环 /api → 恒定 403（writeHead + end，零 next()）；回环/非 /api → next() 放行
 * （官方共享 API 桥，桌面零影响）。onReject 诊断回调只落 harness.log，不出响应面。
 */
export function apiLoopbackGuardListener(
  onReject?: (line: string) => void,
): (request: IncomingMessage, response: ServerResponse, next: () => Promise<void>) => Promise<void> {
  return async (request, response, next) => {
    if (!shouldBlockApiRequest(request.headers.host, request.url ?? '/')) {
      await next()
      return
    }
    onReject?.(`[api-guard] 非回环 /api 拒绝 host=${JSON.stringify(request.headers.host ?? '')}`)
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(API_LOOPBACK_GUARD_BODY)
  }
}
