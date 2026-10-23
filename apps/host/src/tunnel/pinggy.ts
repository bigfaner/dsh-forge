// 隧道管理器·Pinggy SSH 反向隧道兜底（官方锚 main.js :761-765 / :891-893）。
// 机械：`ssh -p 22 free.pinggy.io` 出站反向连接（零入站端口），stdout 捕获
// `*.pinggy(-free)?.link / pinggy.online` URL；免费层 60 分钟 TTL（PINGGY_TTL_MS），
// 提供「约 N 分钟后失效」读数。
import type { TunnelDeps, TunnelProcessHandle } from './cloudflared.js'

export const PINGGY_HOST = 'free.pinggy.io'
export const PINGGY_PORT = 22
/** Pinggy 免费层 TTL（官方 PINGGY_TTL_MS 同语义） */
export const PINGGY_TTL_MS = 60 * 60 * 1_000

/** pinggy 公网 URL 捕获正则（官方锚 :891-893 形态） */
export const PINGGY_URL_RE = /https?:\/\/[a-z0-9-]+\.(?:pinggy(?:-free)?\.link|pinggy\.online)/i

/** ssh 反向隧道 argv（-R 0:127.0.0.1:<port> = 边缘随机公网端口反代本机配对面） */
export function pinggySshArgs(localPort: number): string[] {
  return [
    '-p', String(PINGGY_PORT),
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-R', `0:127.0.0.1:${String(localPort)}`,
    PINGGY_HOST,
  ]
}

/** TTL 剩余读数（下限 0——「约 N 分钟后失效」横幅消费） */
export function pinggyRemainingMs(startedAt: number, now: number): number {
  return Math.max(0, PINGGY_TTL_MS - (now - startedAt))
}

export interface PinggyTunnel {
  url: string
  process: TunnelProcessHandle
  startedAt: number
}

/**
 * 起 Pinggy SSH 反向隧道并捕获公网 URL。ssh 无密钥交互假定免费层匿名可用
 * （官方同款）；URL 捕获失败（含 ssh 提前退出/窗口超时）→ 抛错由链路层结算。
 */
export async function startPinggyTunnel(
  localPort: number,
  deps: TunnelDeps,
  captureTimeoutMs = 15_000,
): Promise<PinggyTunnel> {
  const proc = deps.spawn('ssh', pinggySshArgs(localPort))
  const startedAt = deps.now()
  return await new Promise<PinggyTunnel>((resolve, reject) => {
    let settled = false
    let firstErrorLine: string | undefined // stderr/stdout 首个非 URL 非空行（失败原因取证）
    const cleanup = (): void => {
      clearTimeout(timer)
      proc.onLine(noop)
      proc.onExit(noop)
    }
    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const timer = setTimeout(() => {
      settle(() => reject(new Error(`pinggy URL 捕获超时（${String(captureTimeoutMs)}ms 内无 pinggy URL）`)))
    }, captureTimeoutMs)
    proc.onLine((line) => {
      const url = PINGGY_URL_RE.exec(line)?.[0]
      if (url !== undefined) settle(() => resolve({ url, process: proc, startedAt }))
      else if (firstErrorLine === undefined && line.trim() !== '') firstErrorLine = line
    })
    proc.onExit((code) => {
      settle(() =>
        reject(
          new Error(
            `ssh 提前退出（code=${String(code)}）${firstErrorLine !== undefined ? `：${firstErrorLine}` : ''}——pinggy 兜底不可用`,
          ),
        ),
      )
    })
    function noop(): void {}
  })
}
