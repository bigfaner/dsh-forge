// host/dispatch-launch/channel — 宿主 sessionController 通道解析(任务 6.1
// 自 M2 session-launch 迁入;session-launch 随 ForgeBridge 退役删除)。
//
// 结构鸭类型面(M2 4.2 先例延续):host 半身与上游服务同进程同一 cordis
// 应用,通道 = ctx 上的 `sessionController` 行(web-app bundle 注册);本包
// 不依赖 vendored 类型,重声明 create/prompt 结构面 —— vendored 服务的签名
// 是这些形状的超集,ctx 缝上的 cast 是健全的。per-call 解析(装载序容错:
// web-app bundle 行可能晚于本插件注册),面检查容忍键下非服务值(降级为
// undefined → 契约①查失败,而非散落 throw)。
//
// 消费方:dispatch-launch(唯一 M3 会话创建持有者)+ session-channel-stub
// (e2e 通道缝,DSH_FORGE_SESSION_STUB_DIR)。

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'

/**
 * The upstream `sessionController`'s structural face the launch needs
 * (re-declared here — no runtime import — mirroring the M2 4.1 CliEnv
 * precedent; the vendored service's create/prompt signatures are supersets
 * of these shapes, so the cast at the ctx seam is sound).
 */
export interface SessionChannel {
  create(request: { readonly sessionId?: string; readonly cwd?: string }): Promise<{ readonly sessionId: string }>
  prompt(request: {
    readonly requestId: string
    readonly sessionId: string
    readonly mode: 'queue'
    readonly content: readonly { readonly type: 'text'; readonly text: string }[]
  }): Promise<{ readonly accepted: true }>
}

/** The upstream host service key the session channel resolves through (vendored session-controller Context merge). */
const SESSION_CONTROLLER_KEY = 'sessionController'

/**
 * 每腿通道上限(缺省;进程内腿为 ms 级 —— 防挂死护栏,非 ≤3s UX 预算)。
 * M2 session-launch 同值迁入(任务 6.1)。
 */
export const SESSION_CHANNEL_TIMEOUT_MS = 10_000

/**
 * The deterministic prompt requestId: stable for the same (session, message)
 * pair, so replays of one launch never double-post the first user message —
 * the upstream `hasPromptRequest` short-circuit deduplicates on it
 * (M2 spike-1 §2.1 验证;任务 6.1 自 session-launch 迁入)。Fresh sessions
 * mint fresh ids, so distinct launches stay distinct.
 */
export function deriveLaunchRequestId(sessionId: string, message: string): string {
  const digest = createHash('sha256').update(sessionId).update('\u0000').update(message).digest('hex')
  return `forge-launch-${digest.slice(0, 32)}`
}

/**
 * Resolve the session channel from a host context, PER CALL (the web-app
 * bundle's sessionController row may register after this plugin — presence
 * at launch time is what matters, not at plugin load). Structural
 * duck-typing keeps this package free of a vendored type dependency.
 */
export function sessionChannelOf(ctx: Context): SessionChannel | undefined {
  const candidate: unknown = (ctx as unknown as Record<string, unknown>)[SESSION_CONTROLLER_KEY]
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const face = candidate as Partial<SessionChannel>
  return typeof face.create === 'function' && typeof face.prompt === 'function'
    ? candidate as SessionChannel
    : undefined
}
