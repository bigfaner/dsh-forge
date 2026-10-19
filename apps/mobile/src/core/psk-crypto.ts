/**
 * PSK v3 mobile 侧密码核（tunnel-psk.md v3.1——mobile-ui/1.31）。
 *
 * 与 host 侧 apps/host/src/boot/psk.ts 逐位互操作（跨端契约锚）：
 *   · 展示密钥 = base32（RFC 4648 无 padding）5 字符分组 + 校验段（SHA-256 hex 前 4 字符）；
 *   · 通信密钥 = HKDF-SHA256(ikm = PSK‖PIN, salt = "dsh-forge-psk", info = "forge-psk-v3")；
 *   · 每设备子密钥 = HKDF(通信密钥, salt = sid)；
 *   · AEAD = AES-256-GCM（AAD = "forge-psk-v3"|direction|sid|epoch|seq；ct = 密文‖tag）；
 *   · 签名材料 = ct‖iv‖"|seq"；Ed25519（SPKI DER base64 / keyId = sha256(SPKI) hex 前 16）；
 *   · 信封 v3 = {v, sid, epoch, iv, seq, ct, sig?, dpk?}——外层零明文语义字段。
 *
 * 浏览器红线：AEAD 钥 importKey extractable:false（XSS 窃钥消解）；明文串不落 storage；
 * Ed25519 需 Chrome/Edge 113+、Safari 17+、Firefox 129+——isEd25519Supported 能力检测。
 * 全部 IO 经 WebCrypto（globalThis.crypto.subtle）——vitest node ≥22 原生可测。
 */

export const PSK_VERSION = 3
/** KDF info（与 host psk.ts PSK_HKDF_INFO 互锚） */
export const PSK_HKDF_INFO = 'forge-psk-v3'
/** KDF salt（与 host psk-gate.ts PSK_SALT 互锚——utf8 字节） */
export const PSK_SALT_TEXT = 'dsh-forge-psk'
/** PSK raw 字节数（host randomBytes(32)） */
export const PSK_RAW_BYTES = 32

export type PskDirection = 'c2s' | 's2c'

/** 信封 v3（与 host parseEnvelope 同形——外层除 v/sid/epoch/iv/seq/ct/sig/dpk 外零语义字段） */
export interface PskEnvelope {
  readonly v: number
  readonly sid: string
  readonly epoch: number
  readonly iv: string
  readonly seq: number
  readonly ct: string
  readonly sig?: string
  /** 设备 Ed25519 公钥（SPKI DER base64）——仅注册帧携带 */
  readonly dpk?: string
}

const textEncoder = new TextEncoder()
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

// ── base64 / hex 编码（零依赖）──────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index] ?? 0)
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

// ── PSK 展示输入解析 / 校验段 ───────────────────────────────────────

/** 展示输入归一：去空白/连字符 + 大写（手抄容错）。 */
export function normalizePskText(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase()
}

/** RFC 4648 base32 解码（无 padding）；字母表外字符 / 非法长度 → null。 */
export function base32Decode(text: string): Uint8Array | null {
  if (text === '') return null
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) return null
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export type PskParseResult = { readonly ok: true; readonly raw: Uint8Array } | { readonly ok: false; readonly reason: string }

/** 设置面输入解析：归一 → base32 解码 → 32 字节门。 */
export function parsePskInput(input: string): PskParseResult {
  const normalized = normalizePskText(input)
  if (normalized === '') return { ok: false, reason: 'empty' }
  const raw = base32Decode(normalized)
  if (raw === null) return { ok: false, reason: 'charset' }
  if (raw.length !== PSK_RAW_BYTES) return { ok: false, reason: 'length' }
  return { ok: true, raw }
}

/** 校验段 = SHA-256(raw) hex 前 4 字符（与 host generatePsk 同源）。 */
export async function pskChecksum(raw: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', raw as BufferSource)
  return bytesToHex(new Uint8Array(digest)).slice(0, 4)
}

// ── 派生（v3/PIN 双因子）────────────────────────────────────────────

async function hkdfBits(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** 通信密钥 = HKDF-SHA256(ikm = PSK‖PIN, salt, info)——双因子（v3）。 */
export async function deriveCommBits(psk: Uint8Array, pin: string): Promise<Uint8Array> {
  const ikm = new Uint8Array(psk.length + textEncoder.encode(pin).length)
  ikm.set(psk, 0)
  ikm.set(textEncoder.encode(pin), psk.length)
  return hkdfBits(ikm, textEncoder.encode(PSK_SALT_TEXT), textEncoder.encode(PSK_HKDF_INFO))
}

/** 每设备子密钥 = HKDF(通信密钥, salt = sid)——多设备互不误杀。 */
export async function deriveDeviceBits(commBits: Uint8Array, sid: string): Promise<Uint8Array> {
  return hkdfBits(commBits, textEncoder.encode(sid), textEncoder.encode(PSK_HKDF_INFO))
}

/** AEAD 钥导入：non-extractable（XSS 窃钥红线——明文字节自此不落 storage/DOM）。 */
export async function importAeadKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'aes-gcm', false, ['encrypt', 'decrypt'])
}

// ── AEAD 信封 ────────────────────────────────────────────────────────

/** AAD = "forge-psk-v3"|direction|sid|epoch|seq（与 host aadOf 逐字节互锚）。 */
export function aadOf(direction: PskDirection, sid: string, epoch: number, seq: number): Uint8Array {
  return textEncoder.encode(`${PSK_HKDF_INFO}|${direction}|${sid}|${epoch}|${seq}`)
}

export interface SealedFrame {
  readonly iv: string
  readonly ct: string
}

/** 加密一帧：随机 96-bit IV；WebCrypto GCM 输出 = 密文‖tag（与 host sealFrame 同形）。 */
export async function sealFrame(
  key: CryptoKey,
  direction: PskDirection,
  sid: string,
  epoch: number,
  seq: number,
  plaintext: Uint8Array,
): Promise<SealedFrame> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'aes-gcm', iv: iv as BufferSource, additionalData: aadOf(direction, sid, epoch, seq) as BufferSource, tagLength: 128 },
      key,
      plaintext as BufferSource,
    ),
  )
  return { iv: bytesToBase64(iv), ct: bytesToBase64(ct) }
}

/** 解密一帧：tag/AAD 任一失配即 reject（防篡改/防反射）。 */
export async function openFrame(
  key: CryptoKey,
  direction: PskDirection,
  sid: string,
  epoch: number,
  seq: number,
  ivB64: string,
  ctB64: string,
): Promise<Uint8Array> {
  const plain = await crypto.subtle.decrypt(
    {
      name: 'aes-gcm',
      iv: base64ToBytes(ivB64) as BufferSource,
      additionalData: aadOf(direction, sid, epoch, seq) as BufferSource,
      tagLength: 128,
    },
    key,
    base64ToBytes(ctB64) as BufferSource,
  )
  return new Uint8Array(plain)
}

/** 信封全文签名材料 = ct‖iv‖"|seq"（与 host sigMaterial 逐字节互锚）。 */
export function sigMaterial(ct: Uint8Array, iv: Uint8Array, seq: number): Uint8Array {
  const tail = textEncoder.encode(`|${seq}`)
  const out = new Uint8Array(ct.length + iv.length + tail.length)
  out.set(ct, 0)
  out.set(iv, ct.length)
  out.set(tail, ct.length + iv.length)
  return out
}

// ── Ed25519 签名层（独立失效域）─────────────────────────────────────

/** Ed25519 能力检测（浏览器下限注记：Chrome/Edge 113+、Safari 17+、Firefox 129+）。 */
export async function isEd25519Supported(): Promise<boolean> {
  try {
    if (typeof crypto === 'undefined' || crypto.subtle === undefined) return false
    await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify'])
    return true
  } catch {
    return false
  }
}

export interface DeviceKeyPair {
  /** SPKI DER base64（注册帧 dpk——host bindDevicePub 消费） */
  readonly publicSpkiB64: string
  readonly privateKey: CryptoKey
}

/** 设备签名钥对：私钥 non-extractable；公钥导出 SPKI（首联注册帧提交 host 绑定 sid）。 */
export async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify'])
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey))
  return { publicSpkiB64: bytesToBase64(spki), privateKey: pair.privateKey }
}

export async function signDevice(privateKey: CryptoKey, material: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, material as BufferSource))
}

/** host 签名公钥导入（SPKI DER base64——设置面带外录入的静态验签根）。 */
export async function importHostPublicKey(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBytes(spkiB64) as BufferSource, 'Ed25519', true, ['verify'])
}

export async function verifyHost(publicKey: CryptoKey, material: Uint8Array, signature: Uint8Array): Promise<boolean> {
  try {
    return await crypto.subtle.verify('Ed25519', publicKey, signature as BufferSource, material as BufferSource)
  } catch {
    return false
  }
}

/** keyId = sha256(SPKI DER) hex 前 16（与 X-Forge-Key-Id / host keyId 同源）。 */
export async function keyIdOf(spkiB64: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(spkiB64) as BufferSource)
  return bytesToHex(new Uint8Array(digest)).slice(0, 16)
}

// ── 信封解析（与 host parseEnvelope 同判）───────────────────────────

/** 信封结构判定（不触密钥——畸形/降版本一律拒）。 */
export function parseEnvelope(raw: unknown): PskEnvelope | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const e = raw as Record<string, unknown>
  if (e['v'] !== PSK_VERSION) return undefined
  for (const k of ['sid', 'epoch', 'iv', 'seq', 'ct'] as const) {
    const value = e[k]
    if (typeof value !== 'string' && typeof value !== 'number') return undefined
  }
  if (typeof e['sid'] !== 'string' || e['sid'] === '') return undefined
  if (typeof e['epoch'] !== 'number' || !Number.isInteger(e['epoch']) || e['epoch'] < 0) return undefined
  if (typeof e['seq'] !== 'number' || !Number.isInteger(e['seq']) || e['seq'] < 0) return undefined
  if (typeof e['iv'] !== 'string' || typeof e['ct'] !== 'string') return undefined
  if (e['sig'] !== undefined && typeof e['sig'] !== 'string') return undefined
  if (e['dpk'] !== undefined && typeof e['dpk'] !== 'string') return undefined
  return {
    v: PSK_VERSION,
    sid: e['sid'],
    epoch: e['epoch'],
    seq: e['seq'],
    iv: e['iv'],
    ct: e['ct'],
    ...(typeof e['sig'] === 'string' ? { sig: e['sig'] } : {}),
    ...(typeof e['dpk'] === 'string' ? { dpk: e['dpk'] } : {}),
  }
}
