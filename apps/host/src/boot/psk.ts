// PSK v3 host 侧密码核（tunnel-psk.md v3.1——1.11）：
//   · 强制位生效域判定 isTunnelHost（A3 裁决：Host 非 loopback/非 IP 字面量 = 隧道域；
//     LAN/回环维持旧门——桌面 fetch 兜底面不受影响）；
//   · 密钥生成（CSPRNG 256-bit + base32 分组展示 + 校验段）；
//   · 双因子派生 HKDF-SHA256(ikm=PSK‖PIN, salt, info="forge-psk-v3") + per-device 子密钥；
//   · AEAD 单原语 AES-256-GCM（AAD = "forge-psk-v3" ‖ direction ‖ sid ‖ epoch ‖ seq）；
//   · 信封格式 v3（v/sid/epoch/iv/seq/ct/sig[/dpk]——外层零明文语义字段，v 仅升不降）；
//   · 重放水位（(sid,epoch) 独立高水位 + epoch TTL 清理——多设备互不误杀，重启持久化外置）；
//   · Ed25519 签名层（s2c host 钥 / c2s 设备钥注册绑定——独立于 AEAD 的失效域）；
//   · 统一 401 恒定体 + 填充（抗时序/状态码分型——唯一 owner 供 __rpc 入口拦截器消费）。
// 纯 Node crypto，零 IO——fake 可测主战场。
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign as edSign,
  verify as edVerify,
  generateKeyPairSync,
  createPublicKey,
  type KeyObject,
} from 'node:crypto'
import type { RpcResFace } from './remote-http-rpc.js'

/** 算法版本（仅升不降） */
export const PSK_VERSION = 3
/** KDF info 常量（tunnel-psk §4） */
export const PSK_HKDF_INFO = 'forge-psk-v3'
/** AAD 域分隔 direction 值 */
export type PskDirection = 'c2s' | 's2c'
/** 信封固定填充目标（响应体/401 体恒定长度——抗密文体积画像） */
export const PSK_PAD_TARGET = 4096

/** 信封 v3（tunnel-psk §4——外层除 v/sid/epoch/iv/seq/ct/sig/dpk 外零语义字段） */
export interface PskEnvelope {
  readonly v: number
  readonly sid: string
  readonly epoch: number
  readonly iv: string
  readonly seq: number
  readonly ct: string
  readonly sig?: string
  /** 设备 Ed25519 公钥（SPKI DER base64）——仅注册帧携带（未绑定 sid 时） */
  readonly dpk?: string
}

// ── 强制位生效域（A3 裁决）─────────────────────────────────────────────

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/
const IPV6_LITERAL = /^\[[0-9a-fA-F:]+\]$/

/**
 * PSK 强制位生效域判定（A3 裁决）：Host（去端口）非 loopback 且非 IP 字面量 = 隧道域
 * （PSK 强制）；LAN/回环（含任意 IP 字面量 Host）= 旧门维持（桌面 fetch 兜底面不受影响）。
 * Host 缺席 = 保守判隧道（fail closed——PSK 配置在场时无 Host 头请求不降级）。
 * 与 bridge.isTunnelHost（fix-16 配对 302 权威面——非 LAN 本身即隧道）刻意分离：两判据
 * 服务不同缝（pairRedirect/PIN 门 vs PSK 生效域），不共用单源。
 */
export function isPskEnforcedHost(hostHeader: string | undefined): boolean {
  if (typeof hostHeader !== 'string' || hostHeader.trim() === '') return true
  const hostname = hostHeader.trim().replace(/:\d+$/, '').toLowerCase()
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') return false
  if (hostname === '127.0.0.1' || hostname.startsWith('127.')) return false
  if (IPV4_LITERAL.test(hostname)) return false
  if (IPV6_LITERAL.test(hostname)) return false
  return true
}

// ── 密钥生成 / 编码 ──────────────────────────────────────────────────

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** bytes → base32（RFC 4648，无 padding） */
export function base32Of(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

/** 生成 PSK：32 字节 CSPRNG + base32 分组展示（5 字符 ×8 组）+ 校验段（SHA-256 hex 前 4 字符） */
export function generatePsk(): { raw: Buffer; display: string; checksum: string } {
  const raw = randomBytes(32)
  const encoded = base32Of(raw)
  const display = (encoded.match(/.{1,5}/g) ?? []).join('-')
  const checksum = createHash('sha256').update(raw).digest('hex').slice(0, 4)
  return { raw, display, checksum }
}

// ── 派生（v3/PIN 双因子）─────────────────────────────────────────────

/** 通信密钥 = HKDF-SHA256(ikm = PSK‖PIN, salt, info="forge-psk-v3") */
export function deriveCommKey(psk: Buffer, pin: string, salt: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.concat([psk, Buffer.from(pin, 'utf8')]), salt, PSK_HKDF_INFO, 32))
}

/** per-device 子密钥 = HKDF(通信密钥, sid)——多设备互不误杀 */
export function deriveDeviceKey(commKey: Buffer, sid: string): Buffer {
  return Buffer.from(hkdfSync('sha256', commKey, Buffer.from(sid, 'utf8'), PSK_HKDF_INFO, 32))
}

/** AAD = "forge-psk-v3" ‖ direction ‖ sid ‖ epoch ‖ seq（防乱序/反射/跨设备） */
export function aadOf(direction: PskDirection, sid: string, epoch: number, seq: number): Buffer {
  return Buffer.concat([
    Buffer.from(PSK_HKDF_INFO, 'ascii'),
    Buffer.from(`|${direction}|${sid}|${epoch}|${seq}`, 'utf8'),
  ])
}

// ── AEAD 信封 ────────────────────────────────────────────────────────

/** 加密一帧：AES-256-GCM，随机 96-bit IV；返回信封体（sig 由调用方签名层补） */
export function sealFrame(
  key: Buffer,
  direction: PskDirection,
  sid: string,
  epoch: number,
  seq: number,
  plaintext: Buffer,
): { iv: Buffer; ct: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  cipher.setAAD(aadOf(direction, sid, epoch, seq))
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { iv, ct }
}

/** 解密一帧：tag/AAD 任一失配即抛（防篡改/防反射——失败统一 401 由拦截器归一） */
export function openFrame(
  key: Buffer,
  direction: PskDirection,
  sid: string,
  epoch: number,
  seq: number,
  iv: Buffer,
  ct: Buffer,
): Buffer {
  if (ct.length < 16) throw new Error('ciphertext too short')
  const tag = ct.subarray(ct.length - 16)
  const body = ct.subarray(0, ct.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAAD(aadOf(direction, sid, epoch, seq))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()])
}

/** 信封全文签名材料 = ct ‖ iv ‖ seq（tunnel-psk §4.2） */
export function sigMaterial(ct: Buffer, iv: Buffer, seq: number): Buffer {
  return Buffer.concat([ct, iv, Buffer.from(`|${seq}`, 'ascii')])
}

// ── Ed25519 签名层（独立失效域）─────────────────────────────────────

export interface SigningKeyPair {
  readonly secret: KeyObject
  readonly publicDer: Buffer
  /** keyId = sha256(SPKI DER) 前 16 hex（X-Forge-Key-Id 消费） */
  readonly keyId: string
}

export function generateSigningKeyPair(): SigningKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  return { secret: privateKey, publicDer, keyId: createHash('sha256').update(publicDer).digest('hex').slice(0, 16) }
}

export function signPayload(kp: SigningKeyPair, material: Buffer): Buffer {
  return edSign(null, material, kp.secret)
}

export function verifyPayload(publicDer: Buffer, material: Buffer, signature: Buffer): boolean {
  try {
    return edVerify(null, material, createPublicKey({ key: publicDer, format: 'der', type: 'spki' }), signature)
  } catch {
    return false
  }
}

/** 静态资源签名头（v3.1/§4.5——X-Forge-Sig 覆盖 path‖body；X-Forge-Key-Id = host 公钥指纹） */
export function staticSignatureHeaders(
  signing: { readonly spki: string; readonly pkcs8: string },
  path: string,
  body: Buffer | string,
): { readonly 'x-forge-sig': string; readonly 'x-forge-key-id': string } {
  const secret = createPrivateKey({ key: Buffer.from(signing.pkcs8, 'base64'), format: 'der', type: 'pkcs8' })
  const material = Buffer.concat([Buffer.from(path, 'utf8'), typeof body === 'string' ? Buffer.from(body, 'utf8') : body])
  const sig = edSign(null, material, secret)
  const keyId = createHash('sha256').update(Buffer.from(signing.spki, 'base64')).digest('hex').slice(0, 16)
  return { 'x-forge-sig': sig.toString('base64'), 'x-forge-key-id': keyId }
}

// ── 重放水位（(sid,epoch) 独立高水位 + epoch TTL 清理）───────────────

const EPOCH_TTL_MS = 24 * 60 * 60 * 1000

export interface WatermarkRecord {
  readonly sid: string
  readonly epoch: number
  /** 该 (sid,epoch) 已见的最高 c2s seq */
  highWater: number
  /** 最近活跃时刻（TTL 清理锚） */
  readonly touchedAt: number
}

/** 高水位账本（持久化经 toJSON/load 外置——host 重启防重放窗由调用方落 userData） */
export class ReplayWatermark {
  private readonly records = new Map<string, WatermarkRecord>()
  private readonly sendSeqs = new Map<string, number>()

  /** c2s 准入判定：seq > 高水位 = 消费并推进（true）；否则拒绝（重放/乱序旧帧） */
  admit(sid: string, epoch: number, seq: number, now: number): boolean {
    const k = `${sid}#${epoch}`
    const rec = this.records.get(k)
    if (rec === undefined) {
      this.records.set(k, { sid, epoch, highWater: seq, touchedAt: now })
      return true
    }
    if (seq <= rec.highWater) return false
    rec.highWater = seq
    return true
  }

  /** s2c 发送序号分配（同 (sid,epoch) 单调递增） */
  nextSendSeq(sid: string, epoch: number): number {
    const k = `${sid}#${epoch}`
    const next = (this.sendSeqs.get(k) ?? 0) + 1
    this.sendSeqs.set(k, next)
    return next
  }

  /** epoch 陈旧记录清理（设备长期静默后重连 = 新 epoch 从零起算，天然重同步） */
  sweep(now: number): number {
    let removed = 0
    for (const [k, rec] of this.records) {
      if (now - rec.touchedAt > EPOCH_TTL_MS) {
        this.records.delete(k)
        this.sendSeqs.delete(k)
        removed++
      }
    }
    return removed
  }

  /** 导出持久化切片（c2s 水位——s2c 序号无需持久化：重放防御只看接收方向） */
  toJSON(): { records: Array<{ sid: string; epoch: number; highWater: number; touchedAt: number }> } {
    return { records: [...this.records.values()].map((r) => ({ ...r })) }
  }

  load(data: { records?: Array<{ sid: string; epoch: number; highWater: number; touchedAt: number }> } | undefined): void {
    for (const r of data?.records ?? []) {
      if (typeof r.sid === 'string' && typeof r.epoch === 'number' && typeof r.highWater === 'number') {
        this.records.set(`${r.sid}#${r.epoch}`, { ...r, touchedAt: r.touchedAt ?? Date.now() })
      }
    }
  }
}

// ── 统一 401（唯一 owner——恒定体 + 填充）────────────────────────────

const CONSTANT_401_BODY = JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'unauthorized' } })

/** 统一 401 响应：恒定状态码 + 恒定语义体 + 随机填充至固定长度（抗时序/体积分型） */
export function writeConstant401(res: RpcResFace): void {
  const pad = PSK_PAD_TARGET - Buffer.byteLength(CONSTANT_401_BODY, 'utf8')
  const body =
    pad > 1
      ? CONSTANT_401_BODY + ' ' + randomBytes(pad).toString('base64').slice(0, pad - 1)
      : CONSTANT_401_BODY
  res.writeHead(401, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

// ── 信封解析（结构面——密钥层失败归拦截器统一 401）───────────────────

/** 信封结构判定（不触密钥——畸形/降版本一律拒） */
export function parseEnvelope(raw: unknown): PskEnvelope | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const e = raw as Record<string, unknown>
  if (e['v'] !== PSK_VERSION) return undefined // 仅升不降：无多版本并存回退
  for (const k of ['sid', 'epoch', 'iv', 'seq', 'ct'] as const) {
    const v = e[k]
    if (typeof v !== 'string' && typeof v !== 'number') return undefined
  }
  if (typeof e['sid'] !== 'string' || e['sid'] === '') return undefined
  if (typeof e['epoch'] !== 'number' || !Number.isInteger(e['epoch']) || e['epoch'] < 0) return undefined
  if (typeof e['seq'] !== 'number' || !Number.isInteger(e['seq']) || e['seq'] < 0) return undefined
  if (typeof e['iv'] !== 'string' || typeof e['ct'] !== 'string') return undefined
  if (e['sig'] !== undefined && typeof e['sig'] !== 'string') return undefined
  if (e['dpk'] !== undefined && typeof e['dpk'] !== 'string') return undefined
  return { v: PSK_VERSION, sid: e['sid'], epoch: e['epoch'], seq: e['seq'], iv: e['iv'], ct: e['ct'], ...(typeof e['sig'] === 'string' ? { sig: e['sig'] } : {}), ...(typeof e['dpk'] === 'string' ? { dpk: e['dpk'] } : {}) }
}
