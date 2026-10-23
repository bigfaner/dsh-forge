// PSK v3 host 侧持久化 + 准入门（tunnel-psk.md §3/§5——1.11）：
//   · 存储 = dsh-home 根 remote-psk.json（0600——remote-pin.json 同型缝）；明文落盘禁止的
//     承诺经 wrap/unwrap 缝承载（Electron safeStorage 在主进程可达，boot child 以
//     ELECTRON_RUN_AS_NODE 运行无 safeStorage——默认恒等 wrap + 0600 文件边界，
//     safeStorage 升级 = 装配期注入 wrap/unwrap 单点，不改本模块逻辑）。
//   · 轮换 = 再生成即旧钥失效 + ≤5min 宽限期双钥并行验证（旧钥只验证不加密——v2/H3 手工
//     分发两端切换必然不同步）；PIN 变更 = 通信密钥重派生即旧密文自动作废（无宽限）。
//   · 门 = __rpc 入口拦截器唯一 401 owner 的判定核：隧道域 + PSK 配置在场 ⇒ 无有效信封
//     一律 401（明文零降级路径）；LAN/回环不入本门（A3 生效域裁决）。
import { createHash, createPrivateKey, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  PSK_VERSION,
  ReplayWatermark,
  base32Of,
  deriveCommKey,
  deriveDeviceKey,
  generateSigningKeyPair,
  openFrame,
  parseEnvelope,
  sealFrame,
  signPayload,
  sigMaterial,
  verifyPayload,
  type PskDirection,
  type PskEnvelope,
  type SigningKeyPair,
} from './psk.js'

const GRACE_MS = 5 * 60 * 1000

/** 落盘形状（psk 为 raw base64——wrap 缝升级后为 safeStorage 密文 base64） */
export interface PskPersistShape {
  readonly v: 3
  readonly psk: string
  /** 宽限期内的上一代 PSK（旧方向只验证不加密） */
  readonly previous?: { readonly psk: string; readonly graceUntil: number }
  /** host Ed25519 签名钥（SPKI/PKCS8 DER base64） */
  readonly signing: { readonly spki: string; readonly pkcs8: string }
}

/** wrap/unwrap 缝（默认恒等——safeStorage 升级装配期单点注入） */
export type WrapSeam = (plain: Buffer) => Buffer

/** 存储缺位/IO 失败/版本不符 = 门未配置（fail-soft 旧门语义——装配面显形由 diag 留痕） */
export function loadPskPersist(file: string): PskPersistShape | undefined {
  try {
    if (!existsSync(file)) return undefined
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>)['v'] !== PSK_VERSION) return undefined
    const shape = parsed as PskPersistShape
    if (typeof shape.psk !== 'string' || typeof shape.signing?.spki !== 'string' || typeof shape.signing?.pkcs8 !== 'string') return undefined
    return shape
  } catch {
    return undefined
  }
}

export function savePskPersist(file: string, shape: PskPersistShape): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(shape, null, 2), { mode: 0o600 })
}

/** 展示口径（与 psk.generatePsk 同源——base32 5 字符分组） */
function displayOf(raw: Buffer): string {
  return (base32Of(raw).match(/.{1,5}/g) ?? []).join('-')
}

function checksumOf(raw: Buffer): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 4)
}

/** 生成并落盘新 PSK（再生成 = 撤销旧钥；旧钥入宽限窗 ≤5min） */
export function rotatePsk(file: string, existing: PskPersistShape | undefined, now: number): { shape: PskPersistShape; display: string; checksum: string } {
  const raw = randomBytes(32)
  const shape: PskPersistShape = {
    v: 3,
    psk: raw.toString('base64'),
    ...(existing !== undefined ? { previous: { psk: existing.psk, graceUntil: now + GRACE_MS } } : {}),
    ...(existing !== undefined ? { signing: existing.signing } : { signing: signingOfNew() }),
  }
  savePskPersist(file, shape)
  return { shape, display: displayOf(raw), checksum: checksumOf(raw) }
}

function signingOfNew(): PskPersistShape['signing'] {
  const kp = generateSigningKeyPair()
  return {
    spki: kp.publicDer.toString('base64'),
    pkcs8: kp.secret.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
  }
}

// ── 桌面读数面（1.107 带外秘钥展示——读数即显，桌面零缓存零落 storage）─────────

/** 桌面展示三件套（PSK 分组展示 + 校验段 + host 公钥 SPKI base64） */
export interface PskTrio {
  readonly display: string
  readonly checksum: string
  readonly spki: string
}

/** 持久化形状 → 展示三件套（与 generatePsk 同源口径——base32 5 字符分组 + 校验段） */
export function pskTrioOf(shape: PskPersistShape): PskTrio {
  const raw = Buffer.from(shape.psk, 'base64')
  return { display: displayOf(raw), checksum: checksumOf(raw), spki: shape.signing.spki }
}

/** 装配期 ensure 单源：无持久化 → 生成并落盘（新钥 + 新签名钥对）；有 → 原样加载 */
export function ensurePskPersist(file: string): PskPersistShape {
  const existing = loadPskPersist(file)
  if (existing !== undefined) return existing
  return rotatePsk(file, undefined, Date.now()).shape
}

// ── 准入门（唯一 401 owner 判定核）───────────────────────────────────

export interface PskGateDeps {
  /** 存储读法（缺席 = 门未配置 → 旧门语义，过渡期） */
  readonly load: () => PskPersistShape | undefined
  /** 当前 PIN（v3 双因子——KDF ikm 第二因子；轮换即重派生） */
  readonly pin: () => string
  /** 水位账本（持久化外置——调用方 boot 装载/落盘） */
  readonly watermarks: ReplayWatermark
  readonly now: () => number
  /** unwrap 缝（默认恒等） */
  readonly unwrap?: WrapSeam
  /** bug 1792cc7a：设备公钥绑定持久 store（host 重启后长命 Tab sig-only 帧验签依赖；
   *  缺席 = 进程内存表——重启即失，跨重启 sig-only 帧全拒） */
  readonly devicePubs?: DevicePubStore
}

/** 设备公钥绑定 store（sid → Ed25519 SPKI der；持久化由装配缝承担） */
export interface DevicePubStore {
  get(sid: string): Buffer | undefined
  set(sid: string, publicDer: Buffer): void
}

export type AdmitVerdict =
  | {
      readonly ok: true
      readonly sid: string
      readonly epoch: number
      readonly channel: string
      readonly payload: unknown
      /** s2c 应答封帧（信封 JSON 字符串——host Ed25519 逐帧签名） */
      readonly reply: (data: unknown) => string
      readonly replyError: (message: string) => string
    }
  | { readonly ok: false; readonly reason: string }

/** KDF salt（跨端互操作锚——tunnel-psk §4 salt=pairingId 的固定配对身份实现） */
export const PSK_SALT = Buffer.from('dsh-forge-psk', 'utf8')

/**
 * 隧道域 __rpc 信封准入：解封 → 签名核 → 水位 → 分发明文。
 * 全部失败路径（畸形/版本/解密/水位/未知通道）一律 ok:false → 拦截器统一 401（唯一 owner）。
 */
export function admitPskRequest(deps: PskGateDeps, rawBody: string, channelAdmitted: (channel: string) => boolean): AdmitVerdict {
  const shape = deps.load()
  if (shape === undefined) return { ok: false, reason: 'psk-gate 未配置' }
  let envelopeJson: unknown
  try {
    envelopeJson = JSON.parse(rawBody)
  } catch {
    return { ok: false, reason: 'body 非 JSON' }
  }
  const env = parseEnvelope(envelopeJson)
  if (env === undefined) return { ok: false, reason: 'envelope 形状非法' }
  const unwrap = deps.unwrap ?? ((b: Buffer) => b)
  const current = unwrap(Buffer.from(shape.psk, 'base64'))
  const keys: Buffer[] = [deriveCommKey(current, deps.pin(), PSK_SALT)]
  if (shape.previous !== undefined && shape.previous.graceUntil > deps.now()) {
    keys.push(deriveCommKey(unwrap(Buffer.from(shape.previous.psk, 'base64')), deps.pin(), PSK_SALT))
  }
  let plain: Buffer | undefined
  let deviceKey: Buffer | undefined
  for (const comm of keys) {
    const dk = deriveDeviceKey(comm, env.sid)
    try {
      plain = openFrame(dk, 'c2s' satisfies PskDirection, env.sid, env.epoch, env.seq, Buffer.from(env.iv, 'base64'), Buffer.from(env.ct, 'base64'))
      deviceKey = dk
      break
    } catch {
      // 换宽限钥重试
    }
  }
  if (plain === undefined || deviceKey === undefined) return { ok: false, reason: 'AEAD 解封失败（PSK/PIN/sid 不匹配）' }
  // 设备签名层（注册后强制——PSK 泄露后 c2s 仍防伪造的独立失效域；注册帧仅 AEAD 信任）。
  // bug 1792cc7a：绑定查找/落定经 deps.devicePubs 持久 store（host 重启不清）——长命 Tab
  // sig-only 帧跨重启仍验签；缺席缝 = 进程内存表（旧行为）。
  if (env.sig !== undefined || env.dpk !== undefined) {
    if (!verifyDeviceSignature(deps, env)) return { ok: false, reason: verifyFailReason(deps, env) }
  }
  // 水位（签名核后推进——重复帧同 seq 二次准入被高水位拒）
  if (!deps.watermarks.admit(env.sid, env.epoch, env.seq, deps.now())) return { ok: false, reason: '重放（seq ≤ 高水位）' }
  let inner: unknown
  try {
    inner = JSON.parse(plain.toString('utf8'))
  } catch {
    return { ok: false, reason: '解封后非 JSON' }
  }
  const channel = typeof (inner as Record<string, unknown> | null)?.['channel'] === 'string'
    ? (inner as Record<string, unknown>)['channel'] as string
    : ''
  // 未知通道 = 同一 401 归一（防通道枚举分型）
  if (!channelAdmitted(channel)) return { ok: false, reason: '通道不在受限 allowlist' }
  const epoch = env.epoch
  const sid = env.sid
  const dk = deviceKey
  const reply = (data: unknown): string => sealReply(deps, shape, dk, sid, epoch, { ok: true, data })
  const replyError = (message: string): string => sealReply(deps, shape, dk, sid, epoch, { ok: false, error: { message } })
  return { ok: true, sid, epoch, channel, payload: (inner as Record<string, unknown>)?.['payload'], reply, replyError }
}

/** 设备签名核（sig 覆盖 ct‖iv‖seq；dpk 仅未绑定 sid 的注册帧允许携带）。绑定读写经
 *  deps.devicePubs 持久 store（缺席 = 进程内存表旧行为）。 */
function verifyDeviceSignature(deps: PskGateDeps, env: PskEnvelope): boolean {
  if (env.sig === undefined) return false
  const publicDer = env.dpk !== undefined ? Buffer.from(env.dpk, 'base64') : deps.devicePubs?.get(env.sid)
  if (publicDer === undefined) return false
  const material = sigMaterial(Buffer.from(env.ct, 'base64'), Buffer.from(env.iv, 'base64'), env.seq)
  const ok = verifyPayload(publicDer, material, Buffer.from(env.sig, 'base64'))
  if (!ok) console.log('[verify-dbg]', { dpkLen: env.dpk?.length, sigLen: env.sig?.length, materialLen: material.length, pubLen: publicDer.length })
  if (!ok) return false
  if (env.dpk !== undefined) deps.devicePubs?.set(env.sid, publicDer)
  return true
}

/** sid → 设备公钥绑定表（进程内默认表——deps.devicePubs 缺席时的旧行为缝） */
const legacyDevicePubs = new Map<string, Buffer>()

/** 验签失败归因（诊断面——未绑定 sid = 需 dpk 注册帧 / 已绑定 = 签名不匹配） */
function verifyFailReason(deps: PskGateDeps, env: PskEnvelope): string {
  return deps.devicePubs?.get(env.sid) !== undefined ? '设备签名不匹配' : 'sid 未绑定设备公钥（需 dpk 注册帧）'
}

/** s2c 应答封帧（host Ed25519 逐帧签名——v3/§4.2） */
function sealReply(deps: PskGateDeps, shape: PskPersistShape, deviceKey: Buffer, sid: string, epoch: number, body: unknown): string {
  const seq = deps.watermarks.nextSendSeq(sid, epoch)
  const { iv, ct } = sealFrame(deviceKey, 's2c', sid, epoch, seq, Buffer.from(JSON.stringify(body), 'utf8'))
  const signing = hostSigningOf(shape)
  const sig = signing !== undefined ? signPayload(signing, sigMaterial(ct, iv, seq)).toString('base64') : undefined
  const envelope: PskEnvelope = {
    v: PSK_VERSION,
    sid,
    epoch,
    iv: iv.toString('base64'),
    seq,
    ct: ct.toString('base64'),
    ...(sig !== undefined ? { sig } : {}),
  }
  return JSON.stringify(envelope)
}

function hostSigningOf(shape: PskPersistShape): SigningKeyPair | undefined {
  try {
    return {
      secret: createPrivateKey({ key: Buffer.from(shape.signing.pkcs8, 'base64'), format: 'der', type: 'pkcs8' }),
      publicDer: Buffer.from(shape.signing.spki, 'base64'),
      keyId: createHash('sha256').update(Buffer.from(shape.signing.spki, 'base64')).digest('hex').slice(0, 16),
    }
  } catch {
    return undefined
  }
}

/** host 签名公钥验签面（forge-stream 逐帧/静态签名测试消费） */
export function verifyWithSpki(publicDer: Buffer, material: Buffer, signature: Buffer): boolean {
  return verifyPayload(publicDer, material, signature)
}

// ── 水位持久化（v2/H1——host 重启防重放窗；userData 文件 0600）────────

/** 装载水位账本（文件缺席/畸形 = 空账本——最坏情况重启重放窗，门语义不变） */
export function loadWatermarks(file: string): ReplayWatermark {
  const wm = new ReplayWatermark()
  try {
    if (existsSync(file)) wm.load(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    // 空账本降级
  }
  return wm
}

export function saveWatermarks(file: string, wm: ReplayWatermark): void {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(wm.toJSON()), { mode: 0o600 })
  } catch {
    // 持久化失败不阻门——内存账本仍生效（重启窗口可接受）
  }
}

/** forge-stream s2c 封帧缝（隧道域推送——comm 级密钥 + host 签名 + 连接单调 seq） */
export function createStreamSealer(deps: PskGateDeps, sid: string, epoch: number): ((event: unknown) => string) | undefined {
  const shape = deps.load()
  if (shape === undefined) return undefined
  const unwrap = deps.unwrap ?? ((b: Buffer) => b)
  const comm = deriveCommKey(unwrap(Buffer.from(shape.psk, 'base64')), deps.pin(), PSK_SALT)
  const deviceKey = deriveDeviceKey(comm, sid)
  const signing = hostSigningOf(shape)
  return (event: unknown): string => {
    const seq = deps.watermarks.nextSendSeq(sid, epoch)
    const { iv, ct } = sealFrame(deviceKey, 's2c', sid, epoch, seq, Buffer.from(JSON.stringify(event), 'utf8'))
    const sig = signing !== undefined ? signPayload(signing, sigMaterial(ct, iv, seq)).toString('base64') : undefined
    const envelope: PskEnvelope = {
      v: PSK_VERSION,
      sid,
      epoch,
      iv: iv.toString('base64'),
      seq,
      ct: ct.toString('base64'),
      ...(sig !== undefined ? { sig } : {}),
    }
    return JSON.stringify(envelope)
  }
}
