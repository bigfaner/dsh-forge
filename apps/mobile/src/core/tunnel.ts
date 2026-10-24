/**
 * 隧道模式探测 + 设备会话身份（sid/epoch）（mobile-ui/1.31——tunnel-psk v3 §2/§4.2.1）。
 *
 * 探测锚点（R12 修正——不再用 /api 探测）：
 *   · location.hostname IP 字面量（含 localhost/回环）= LAN；域名形态 = 隧道候选；
 *   · `GET /remote/forge-stream` 响应语义：200/401 均为通道可达（401 = PSK 门在），
 *     网络异常 = 不可达。
 *
 * sid/epoch 纪律（v2/C2 + H1）：每设备/每标签页随机 sid（128-bit，持久化）；
 * epoch 页面刷新/重连自增；epoch 长期静默（TTL 超限）后重连 = 从零起算（与 host
 * 水位 TTL 清理同参数——天然重同步，无需「再生成」）。
 */

export type TunnelMode = 'lan' | 'tunnel'

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/
const IPV6_LITERAL = /^\[[0-9a-fA-F:]+\]$/

/** Host（去端口）IP 字面量/localhost 判定（与 host isPskEnforcedHost 判据同族）。 */
export function isIpLiteralHostname(hostname: string): boolean {
  const name = hostname.trim().replace(/:\d+$/, '').toLowerCase()
  if (name === '') return false
  if (name === 'localhost' || name === '::1' || name === '[::1]') return true
  if (name === '127.0.0.1' || name.startsWith('127.')) return true
  return IPV4_LITERAL.test(name) || IPV6_LITERAL.test(name)
}

/** URL 形态判定：IP 字面量 = LAN；其余（含空）= 隧道候选（保守判隧道）。 */
export function hostnameMode(hostname: string): TunnelMode {
  return isIpLiteralHostname(hostname) ? 'lan' : 'tunnel'
}

export type ForgeStreamProbe = 'ok' | 'gated' | 'unreachable'

export interface ModeVerdict {
  readonly mode: TunnelMode
  /** 仅隧道候选有意义：200 = ok / 401 = gated（PSK 门在）/ 其余 = unreachable。 */
  readonly probe: ForgeStreamProbe | null
}

export interface ModeProbeDeps {
  readonly hostname: string
  /** GET /remote/forge-stream 探测（status 语义；异常 = unreachable）。 */
  readonly probe: () => Promise<number>
}

/** 模式探测：URL 形态优先分型 + forge-stream 响应语义收敛。 */
export async function detectTunnelMode(deps: ModeProbeDeps): Promise<ModeVerdict> {
  if (hostnameMode(deps.hostname) === 'lan') return { mode: 'lan', probe: null }
  try {
    const status = await deps.probe()
    if (status === 200) return { mode: 'tunnel', probe: 'ok' }
    if (status === 401) return { mode: 'tunnel', probe: 'gated' }
    return { mode: 'tunnel', probe: 'unreachable' }
  } catch {
    return { mode: 'tunnel', probe: 'unreachable' }
  }
}

// ---------------------------------------------------------------------------
// 设备会话身份（sid/epoch）
// ---------------------------------------------------------------------------

export interface KvStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

/** epoch TTL（与 host psk.ts EPOCH_TTL_MS 同参数——两端同时清理，重连自然重同步）。 */
export const EPOCH_TTL_MS = 24 * 60 * 60 * 1000

export const IDENTITY_KEYS = {
  sid: 'forge.psk.sid',
  epoch: 'forge.psk.epoch',
  touchedAt: 'forge.psk.epochAt',
} as const

export interface SessionIdentity {
  readonly sid: string
  /** 当前 epoch（beginSession 后有效）。 */
  currentEpoch(): number
  /** 页面会话开始：epoch 自增（长期静默后归零重同步），并触达 TTL 锚。 */
  beginSession(): { readonly sid: string; readonly epoch: number }
}

export interface IdentityDeps {
  readonly storage: KvStorage
  /** 128-bit 随机源（注入——单测确定性）。 */
  readonly randomBytes: (length: number) => Uint8Array
  readonly now: () => number
}

export function createSessionIdentity(deps: IdentityDeps): SessionIdentity {
  let sid = deps.storage.get(IDENTITY_KEYS.sid)
  if (sid === null || sid === '') {
    sid = bytesToBase64Url(deps.randomBytes(16))
    deps.storage.set(IDENTITY_KEYS.sid, sid)
  }
  const readEpoch = (): number => {
    const raw = deps.storage.get(IDENTITY_KEYS.epoch)
    const parsed = raw === null ? Number.NaN : Number(raw)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
  }
  let epoch = readEpoch()
  return {
    sid,
    currentEpoch: () => epoch,
    beginSession() {
      const touchedRaw = deps.storage.get(IDENTITY_KEYS.touchedAt)
      const touched = touchedRaw === null ? Number.NaN : Number(touchedRaw)
      const stale = !Number.isFinite(touched) || deps.now() - touched > EPOCH_TTL_MS
      epoch = stale ? 0 : readEpoch() + 1
      deps.storage.set(IDENTITY_KEYS.epoch, String(epoch))
      deps.storage.set(IDENTITY_KEYS.touchedAt, String(deps.now()))
      return { sid, epoch }
    },
  }
}

/** sid 载体：URL/base64 安全字母（base64url，无 padding）。 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 浏览器随机源（装配用）。 */
export function browserRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

// ---------------------------------------------------------------------------
// 隧道 UX 文案（覆盖层区分「隧道模式（降级）」/「断线」；只读闸门；轮换引导）
// ---------------------------------------------------------------------------

export const TUNNEL_COPY = {
  /** degraded 覆盖层（隧道态） */
  degraded: '隧道模式（降级），正在重连…',
  /** degraded 覆盖层（LAN 态） */
  degradedLan: '连接不稳定，正在重连…',
  offline: '连接已断开',
  pairing: '会话已过期，请重新配对',
  /** 隧道 + 无 PSK = 只读闸门 */
  readonlyGate: '隧道模式 · 只读——请在设置中录入连接密钥',
  /** 轮换期 401 引导（宽限期语义——非裸断连） */
  rotation: '连接密钥可能已轮换，请在桌面端确认新密钥',
  /** 浏览器能力下限注记 */
  ed25519Floor: '当前浏览器不支持 WebCrypto Ed25519（需 Chrome/Edge 113+、Safari 17+、Firefox 129+），签名验证不可用',
} as const
