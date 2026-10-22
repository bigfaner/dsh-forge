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
  /** cloudflared 种子候选（官方 DSH Desktop 已下载二进制——校验一致则拷贝进产品缓存，非运行期引用） */
  externalSeeds?: readonly string[]
  /** 诊断行出口（harness.log 链——死亡原因/重试失败/双链皆败撤面原因可观测）；缺省 = 静默 */
  diag?: (line: string) => void
}

export interface TunnelHandle {
  provider: TunnelProvider
  state: TunnelState
  process: TunnelProcessHandle
}

/** 链路事件订阅（换线/失效横幅消费面）；返回退订器 */
export type TunnelEventListener = (state: TunnelState) => void

/** 同链路意外死亡后的退避重试上限（原始 + ≤2 次重试）与节奏（1s/4s 指数退避） */
const RETRY_LIMIT = 2
const RETRY_BACKOFF_MS = [1_000, 4_000] as const
/** diag 行内输出截断上界（末行 stderr 取证——防异常超长行刷爆日志） */
const DEATH_LINE_MAX = 200

/** 意外死亡原因行（exit code + 末行输出——快速隧道闪断取证面） */
function deathReason(provider: TunnelProvider, code: number | null, lastLine: string | undefined): string {
  const tail =
    lastLine !== undefined
      ? `，末行输出：${lastLine.length > DEATH_LINE_MAX ? `${lastLine.slice(0, DEATH_LINE_MAX)}…` : lastLine}`
      : ''
  return `${provider} 进程意外退出（code=${String(code)}${tail}）`
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export class TunnelManager {
  private handle: TunnelHandle | undefined
  private stopped = false
  private readonly listeners = new Set<TunnelEventListener>()
  private readonly captureTimeoutMs: number
  private readonly localPort: number
  private readonly externalSeeds: readonly string[]
  private readonly diagLine: (line: string) => void
  /** 各 provider 最近一次失败原因（重试/撤面诊断取证面） */
  private readonly lastFailure = new Map<TunnelProvider, string>()
  /** 编排互斥门（bug f0550585：start/fallback/stop/自愈串行化——捕获窗内并发编排交错
   *  = 句柄孤儿 + 面发散；后到编排等在门上，以收敛后的句柄态为基准执行） */
  private gate: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly deps: TunnelDeps,
    options: TunnelManagerOptions,
  ) {
    this.localPort = options.localPort
    this.captureTimeoutMs = options.captureTimeoutMs ?? 15_000
    this.externalSeeds = options.externalSeeds ?? []
    this.diagLine = options.diag ?? (() => {})
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

  /** 编排互斥入口（前序编排收敛（含失败）后才放行后到——串行不吞错） */
  private gated<T>(op: () => Promise<T>): Promise<T> {
    const run = this.gate.then(op, op)
    this.gate = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** 启动链路：cloudflared 首选，任何失败（下载/校验/起进程/URL 捕获）→ Pinggy 兜底 */
  start(): Promise<TunnelState> {
    if (this.stopped) return Promise.reject(new Error('隧道已停机——不可复用（重建管理器再启）'))
    return this.gated(async () => {
      try {
        return await this.startCloudflared()
      } catch (error) {
        if (this.stopped) throw error
        return await this.startPinggy()
      }
    })
  }

  /** 显式换线（官方 fallback 语义）：停当前链路 → 起另一条（cloudflared↔Pinggy） */
  fallback(): Promise<TunnelState> {
    if (this.stopped) return Promise.reject(new Error('隧道已停机——不可换线'))
    return this.gated(async () => {
      const currentProvider = this.handle?.provider
      await this.stopCurrent()
      return currentProvider === 'pinggy' ? await this.startCloudflared() : await this.startPinggy()
    })
  }

  /** 停机清理：杀当前句柄，置 stopped 使后续退出事件不再触发自动兜底（无孤儿） */
  stop(): Promise<void> {
    this.stopped = true
    return this.gated(async () => {
      await this.stopCurrent()
    })
  }

  private async startCloudflared(): Promise<TunnelState> {
    const binaryPath = await ensureCloudflaredBinary(this.deps, process.platform, process.arch, this.externalSeeds)
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

  /**
   * 挂接当前句柄 + 韧性状态机：链路进程意外退出（非停机）→ 同链路退避重试（≤2 次，
   * 1s/4s）→ 仍败切另一 provider 兜底。attach 期追踪末行输出——死亡原因（exit code +
   * 末行 stderr）落诊断。
   */
  private async attach(handle: TunnelHandle): Promise<TunnelState> {
    this.handle = handle
    this.emit(handle.state)
    let lastLine: string | undefined
    handle.process.onLine((line) => {
      if (line.trim() !== '') lastLine = line
    })
    handle.process.onExit((code) => {
      this.lastDeath = deathReason(handle.provider, code, lastLine)
      void this.handleAutoFallback(handle)
    })
    return handle.state
  }

  private lastDeath: string | undefined

  private async handleAutoFallback(dead: TunnelHandle): Promise<void> {
    if (this.stopped || this.handle !== dead) return
    await this.gated(async () => {
      if (this.stopped || this.handle !== dead) return // 排队期间态已收敛（stop/换线先行）——弃过期自愈
      this.handle = undefined
    if (this.lastDeath !== undefined) this.diagLine(`[tunnel-diag] ${this.lastDeath}`)
    const same = (): Promise<TunnelState> =>
      dead.provider === 'cloudflared' ? this.startCloudflared() : this.startPinggy()
    const otherProvider: TunnelProvider = dead.provider === 'cloudflared' ? 'pinggy' : 'cloudflared'
    const other = (): Promise<TunnelState> =>
      otherProvider === 'cloudflared' ? this.startCloudflared() : this.startPinggy()
    // 同链路退避重试（≤2 次，1s/4s——快速隧道闪断自愈）；stopped 即弃（无复活竞态）
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      if (this.stopped) return
      await this.deps.sleep(RETRY_BACKOFF_MS[attempt - 1] ?? 4_000)
      if (this.stopped) return
      try {
        await same()
        return
      } catch (cause) {
        const message = causeMessage(cause)
        this.lastFailure.set(dead.provider, message)
        this.diagLine(`[tunnel-diag] ${dead.provider} 重试失败（${String(attempt)}/${String(RETRY_LIMIT)}）：${message}`)
      }
    }
    // 双链兜底前复查 stopped（stop() 同步置位即生效——退避/重试窗内停机不派生 ssh）
    if (this.stopped) return
    try {
      await other()
    } catch (cause) {
      this.lastFailure.set(otherProvider, causeMessage(cause))
      // 双链路皆败撤面前：最后一次各链失败原因均落诊断行（fix-19 ⑦ 死亡 emit 消费面不变）
      this.diagLine(
        `[tunnel-diag] 双链路皆败撤面：${dead.provider} 最后失败=${this.lastFailure.get(dead.provider) ?? '未知'}；` +
          `${otherProvider} 最后失败=${this.lastFailure.get(otherProvider) ?? '未知'}`,
      )
      this.emit({ provider: dead.provider, url: dead.state.url, remainingTtlMs: 0 })
    }
    })
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
