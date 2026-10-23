/**
 * 加密 forge-stream SSE 订阅（mobile-ui/1.31——tunnel-psk v3 §4.1 推送恢复腿）。
 *
 * `GET /remote/forge-stream?sid=&epoch=`（隧道域 = 逐帧 AEAD + host Ed25519 逐帧签名；
 * LAN/回环 = 明文镜像）。mobile 侧：每帧信封解析 → 设备子密钥 s2c 解密 → host 公钥
 * 验签（sigMaterial）→ ForgeStreamEvent 派发；解密/验签失败帧静默丢弃（fail-soft 计数）。
 * 与 page 轮询兜底混合（视图层既有轮询面不动——推送为主路径、轮询兜底语义保持）。
 */

import { base64ToBytes, openFrame, parseEnvelope, sigMaterial, verifyHost, type PskEnvelope } from './psk-crypto.ts'
import type { TunnelMaterial, TunnelSession } from './tunnel-transport.ts'

/** 镜像事件（与 host forge-stream.ts ForgeStreamEvent 同形） */
export interface ForgeStreamEvent {
  readonly type: string
  readonly payload: unknown
  readonly at: number
}

export interface ForgeStreamSource {
  close(): void
}

export interface ForgeStreamDeps {
  /** SSE 源（EventSource 注入——单测 fake）。 */
  openSource(
    url: string,
    handlers: {
      onFrame(data: string): void
      onError(): void
    },
  ): { close(): void }
}

export interface ForgeStreamSink {
  onEvent(event: ForgeStreamEvent): void
  onError(): void
}

const FORGE_STREAM_PATH = '/remote/forge-stream'

/** 订阅 URL：sid/epoch 查询串注册（host createStreamSealer 消费）。 */
export function forgeStreamUrl(session: TunnelSession): string {
  return `${FORGE_STREAM_PATH}?sid=${encodeURIComponent(session.sid)}&epoch=${encodeURIComponent(String(session.epoch))}`
}

export interface ForgeStreamOpen {
  /** material 缺席 = LAN 明文镜像直传（旧门语义）。 */
  readonly material: TunnelMaterial | undefined
}

/** 帧载荷 → 会话 id（bug 6f2c0a57 根治面）：host api-session/* 帧的 payload 是裸
 *  sessionId 字符串（subscribeOfficialEvents 官方载荷原样透传）；{sessionId} 对象形
 *  为防御双形兜底。main.ts onEvent 据此触发 scheduleRefresh——旧对象取形恒 undefined
 *  = logCache 永不刷新，chat 静止到刷新页面。 */
export function frameSessionIdOf(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload === '' ? undefined : payload
  if (typeof payload === 'object' && payload !== null) {
    const sessionId = (payload as { sessionId?: unknown }).sessionId
    if (typeof sessionId === 'string' && sessionId !== '') return sessionId
  }
  return undefined
}

/** 单帧解码：信封解密+验签（隧道）或明文 JSON（LAN）→ ForgeStreamEvent；失败 = null。 */
export async function decodeForgeStreamFrame(data: string, material: TunnelMaterial | undefined): Promise<ForgeStreamEvent | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(data) as unknown
  } catch {
    return null
  }
  if (material === undefined) {
    const event = parsed as Partial<ForgeStreamEvent> | null
    if (event === null || typeof event.type !== 'string' || typeof event.at !== 'number') return null
    return { type: event.type, payload: event.payload, at: event.at }
  }
  const envelope: PskEnvelope | undefined = parseEnvelope(parsed)
  if (envelope === undefined || envelope.sig === undefined) return null
  try {
    const plain = await openFrame(material.aead, 's2c', envelope.sid, envelope.epoch, envelope.seq, envelope.iv, envelope.ct)
    const sigOk = await verifyHost(
      material.hostPublic,
      sigMaterial(base64ToBytes(envelope.ct), base64ToBytes(envelope.iv), envelope.seq),
      base64ToBytes(envelope.sig),
    )
    if (!sigOk) return null
    const event = JSON.parse(new TextDecoder().decode(plain)) as Partial<ForgeStreamEvent> | null
    if (event === null || typeof event.type !== 'string' || typeof event.at !== 'number') return null
    return { type: event.type, payload: event.payload, at: event.at }
  } catch {
    return null
  }
}

/** 订阅装配：帧解码派发；bad 帧 = fail-soft 忽略（错误路径只认 onError）。 */
export function createForgeStreamSource(
  session: TunnelSession,
  open: ForgeStreamOpen,
  deps: ForgeStreamDeps,
  sink: ForgeStreamSink,
): ForgeStreamSource {
  const source = deps.openSource(forgeStreamUrl(session), {
    onFrame: (data) => {
      void decodeForgeStreamFrame(data, open.material).then((event) => {
        if (event !== null) sink.onEvent(event)
      })
    },
    onError: () => sink.onError(),
  })
  return { close: () => source.close() }
}
