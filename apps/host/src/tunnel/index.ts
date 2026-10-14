// 隧道管理器（链路编排面）：cloudflared 首选 → 失败/退出自动切 Pinggy 兜底；
// 显式 fallback() 换线；stop() 有界清理当前进程句柄（无孤儿——kill 调用可断言）。
// 外部依赖面（下载/进程/stdout）全经 TunnelDeps 注入（cloudflared.ts 定义），
// 契约测试以 fake 依赖面全绿。
import {
  ensureCloudflaredBinary,
  startCloudflaredTunnel,
  type TunnelDeps,
  type TunnelProcessHandle,
} from './cloudflared.js'
import { pinggyRemainingMs, startPinggyTunnel, PINGGY_TTL_MS } from './pinggy.js'

export type TunnelProvider = 'cloudflared' | 'pinggy'

export interface TunnelState {
  provider: TunnelProvider
  url: string
  /** pinggy 专属：免费层 TTL 剩余读数（ms）——cloudflared 无 TTL 语义 = undefined */
  remainingTtlMs?: number
}

export interface TunnelManagerOptions {
  /** 反代目标 = 本机配对面端口（/pair 缝所在桥接服务器；host webserver 恒不暴露） */
  localPort: number
  captureTimeoutMs?: number
}

export interface TunnelHandle {
  provider: TunnelProvider
  state: TunnelState
  process: TunnelProcessHandle
}

/** 链路事件订阅（换线/失效横幅消费面）；返回退订器 */
export type TunnelEventListener = (state: TunnelState) => void

export class TunnelManager {
  private handle: TunnelHandle | undefined
  private stopped = false
  private readonly listeners = new Set<TunnelEventListener>()
  private readonly captureTimeoutMs: number
  private readonly localPort: number

  constructor(
    private readonly deps: TunnelDeps,
    options: TunnelManagerOptions,
  ) {
    this.localPort = options.localPort
    this.captureTimeoutMs = options.captureTimeoutMs ?? 15_000
  }

  /** 当前链路状态（未启动/已停 = undefined） */
  get state(): TunnelState | undefined {
    return this.handle?.state
  }

  onEvent(listener: TunnelEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 启动链路：cloudflared 首选，任何失败（下载/校验/起进程/URL 捕获）→ Pinggy 兜底 */
  async start(): Promise<TunnelState> {
    if (this.stopped) throw new Error('隧道已停机——不可复用（重建管理器再启）')
    try {
      return await this.startCloudflared()
    } catch (error) {
      if (this.stopped) throw error
      return await this.startPinggy()
    }
  }

  /** 显式换线（官方 fallback 语义）：停当前链路 → 起另一条（cloudflared↔Pinggy） */
  async fallback(): Promise<TunnelState> {
    if (this.stopped) throw new Error('隧道已停机——不可换线')
    const currentProvider = this.handle?.provider
    await this.stopCurrent()
    return currentProvider === 'pinggy' ? await this.startCloudflared() : await this.startPinggy()
  }

  /** 停机清理：杀当前句柄，置 stopped 使后续退出事件不再触发自动兜底（无孤儿） */
  async stop(): Promise<void> {
    this.stopped = true
    await this.stopCurrent()
  }

  private async startCloudflared(): Promise<TunnelState> {
    const binaryPath = await ensureCloudflaredBinary(this.deps)
    const tunnel = await startCloudflaredTunnel(
      binaryPath,
      this.localPort,
      this.deps,
      this.captureTimeoutMs,
    )
    return await this.attach({ provider: 'cloudflared', state: { provider: 'cloudflared', url: tunnel.url }, process: tunnel.process })
  }

  private async startPinggy(): Promise<TunnelState> {
    const tunnel = await startPinggyTunnel(this.localPort, this.deps, this.captureTimeoutMs)
    const state: TunnelState = {
      provider: 'pinggy',
      url: tunnel.url,
      remainingTtlMs: pinggyRemainingMs(tunnel.startedAt, this.deps.now()),
    }
    return await this.attach({ provider: 'pinggy', state, process: tunnel.process })
  }

  /** 挂接当前句柄 + 自动兜底：链路进程意外退出（非停机）→ 自动切另一条 */
  private async attach(handle: TunnelHandle): Promise<TunnelState> {
    this.handle = handle
    this.emit(handle.state)
    handle.process.onExit(() => {
      void this.handleAutoFallback(handle)
    })
    return handle.state
  }

  private async handleAutoFallback(dead: TunnelHandle): Promise<void> {
    if (this.stopped || this.handle !== dead) return
    this.handle = undefined
    try {
      if (dead.provider === 'cloudflared') await this.startPinggy()
      else await this.startCloudflared()
    } catch {
      // 双链路皆不可用——保持停机态（state undefined），横幅消费面可见失效
      this.emit({ provider: dead.provider, url: dead.state.url, remainingTtlMs: 0 })
    }
  }

  private async stopCurrent(): Promise<void> {
    const current = this.handle
    this.handle = undefined
    if (current !== undefined) await current.process.kill()
  }

  private emit(state: TunnelState): void {
    for (const listener of this.listeners) {
      try {
        listener(state)
      } catch {
        // 订阅方异常隔离
      }
    }
  }
}

export { PINGGY_TTL_MS, pinggyRemainingMs }
export type { TunnelDeps, TunnelProcessHandle }
