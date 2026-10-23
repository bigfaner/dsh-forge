/**
 * PSK 隧道传输拦截器（mobile-ui/1.31——tunnel-psk v3 §5 mobile 侧唯一咽喉封装）。
 *
 * · 代理信封封装：`POST /remote/__rpc` 体 {channel,payload} → AEAD 信封
 *   {v,sid,epoch,iv,seq,ct,sig[,dpk]}——外层零明文语义字段；
 * · 首联注册：第一帧携带设备 Ed25519 公钥（dpk）+ 签名（host bindDevicePub 绑定 sid；
 *   注册帧仅 AEAD + dpk 签名信任）；此后请求仅 sig；
 * · 应答解封：host s2c 信封 → 设备钥解密 + host 公钥逐帧验签（sigMaterial）→ 明文 RPC 结果；
 * · 401 归一：轮换期引导（TUNNEL_COPY.rotation——非裸断连）+ disconnected 信封映射
 *   （createRemoteRpc 既有断线文案路径保持）；
 * · 隧道 + 无 PSK = 只读闸门（本模块不构造传输——装配面回落 RO 路径）。
 */

import {
  bytesToBase64,
  deriveCommBits,
  deriveDeviceBits,
  generateDeviceKeyPair,
  importAeadKey,
  importHostPublicKey,
  keyIdOf,
  openFrame,
  parseEnvelope,
  parsePskInput,
  pskChecksum,
  sealFrame,
  sigMaterial,
  signDevice,
  verifyHost,
  type PskDirection,
} from './psk-crypto.ts'
import { REMOTE_RPC_PATH } from './rpc.ts'
import { TUNNEL_COPY } from './tunnel.ts'

const textEncoder = new TextEncoder()

/** 隧道传输密钥材料（内存态——明文/钥不落 storage；页面会话经设置面重建）。 */
export interface TunnelMaterial {
  /** 设备子密钥 AEAD 钥（non-extractable） */
  readonly aead: CryptoKey
  readonly devicePrivate: CryptoKey
  readonly deviceSpkiB64: string
  /** host 签名公钥（静态验签根——s2c 逐帧验证） */
  readonly hostPublic: CryptoKey
  readonly hostKeyId: string
}

export interface TunnelSession {
  readonly sid: string
  readonly epoch: number
}

export type UnauthorizedKind = 'rotation'

export interface TunnelPostResult {
  readonly status: number
  readonly json: unknown
}

export interface TunnelTransport {
  readonly session: TunnelSession
  post(path: string, body: unknown): Promise<TunnelPostResult>
}

export interface TunnelTransportDeps {
  /** 明文 HTTP POST（信封 JSON 字符串——路径固定 /remote/__rpc）。 */
  readonly post: (path: string, body: string) => Promise<{ readonly status: number; readonly text: string }>
  /** 轮换期 401 引导回调（宽限期 UX——覆盖层文案切换挂点）。 */
  readonly onUnauthorized?: (kind: UnauthorizedKind) => void
  readonly onProtocolError?: (reason: string) => void
}

/** seq 计数起点（(sid,epoch) 内单调；每页面会话从 0 起——host 水位按帧准入）。 */
const SEQ_START = 0

/**
 * 隧道传输构造：材料 + 会话身份 → 信封化 RemoteRpcDeps.post 兼容面。
 * 只读闸门语义由装配面保证：无材料不进入本构造。
 */
export function createTunnelTransport(
  material: TunnelMaterial,
  session: TunnelSession,
  deps: TunnelTransportDeps,
): TunnelTransport {
  let seq = SEQ_START
  let registered = false
  return {
    session,
    async post(path, body) {
      if (path !== REMOTE_RPC_PATH) throw new Error(`tunnel transport 仅服务 ${REMOTE_RPC_PATH}（收到 ${path}）`)
      const plain = textEncoder.encode(JSON.stringify(body))
      const sealed = await sealFrame(material.aead, 'c2s' satisfies PskDirection, session.sid, session.epoch, seq, plain)
      const signature = await signDevice(material.devicePrivate, sigMaterialOf(sealed.ct, sealed.iv, seq))
      const envelope: Record<string, unknown> = {
        v: 3,
        sid: session.sid,
        epoch: session.epoch,
        iv: sealed.iv,
        seq,
        ct: sealed.ct,
        sig: bytesToBase64(signature),
      }
      if (!registered) envelope['dpk'] = material.deviceSpkiB64
      seq += 1
      let response: { status: number; text: string }
      try {
        response = await deps.post(REMOTE_RPC_PATH, JSON.stringify(envelope))
      } catch (cause) {
        deps.onProtocolError?.(`network:${String(cause)}`)
        throw cause
      }
      if (response.status === 401) {
        deps.onUnauthorized?.('rotation')
        return {
          status: 401,
          json: { ok: false, error: { code: 'disconnected', reason: 'unauthorized' } },
        }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(response.text) as unknown
      } catch {
        deps.onProtocolError?.('envelope-json')
        throw new Error('envelope-json')
      }
      const replyEnvelope = parseEnvelope(parsed)
      if (replyEnvelope === undefined) {
        deps.onProtocolError?.('envelope-shape')
        throw new Error('envelope-shape')
      }
      const replyPlain = await openFrame(
        material.aead,
        's2c' satisfies PskDirection,
        replyEnvelope.sid,
        replyEnvelope.epoch,
        replyEnvelope.seq,
        replyEnvelope.iv,
        replyEnvelope.ct,
      )
      if (replyEnvelope.sig === undefined) {
        deps.onProtocolError?.('host-sig-missing')
        throw new Error('host-sig-missing')
      }
      const sigOk = await verifyHost(
        material.hostPublic,
        sigMaterial(base64ToBytes(replyEnvelope.ct), base64ToBytes(replyEnvelope.iv), replyEnvelope.seq),
        base64ToBytes(replyEnvelope.sig),
      )
      if (!sigOk) {
        deps.onProtocolError?.('host-sig-invalid')
        throw new Error('host-sig-invalid')
      }
      registered = true
      let inner: unknown
      try {
        inner = JSON.parse(new TextDecoder().decode(replyPlain)) as unknown
      } catch {
        deps.onProtocolError?.('reply-json')
        throw new Error('reply-json')
      }
      return { status: response.status, json: inner }
    },
  }
}

function sigMaterialOf(ctB64: string, ivB64: string, seq: number): Uint8Array {
  return sigMaterial(base64ToBytes(ctB64), base64ToBytes(ivB64), seq)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** 轮换期引导文案出口（覆盖层/闸门消费）。 */
export function rotationGuidance(): string {
  return TUNNEL_COPY.rotation
}

// ---------------------------------------------------------------------------
// 设置面激活链（校验段 → HKDF 派生 → non-extractable 导入 → 材料聚合）
// ---------------------------------------------------------------------------

export interface ActivateInput {
  readonly pskText: string
  readonly pin: string
  readonly hostSpkiB64: string
}

export type ActivateResult =
  | { readonly ok: true; readonly material: TunnelMaterial; readonly hostKeyId: string }
  | { readonly ok: false; readonly reason: string }

export interface ActivateDeps {
  /** 期望校验段（host 带外同窗告知；缺席 = 跳过本地校验段核对）。 */
  readonly expectedChecksum?: string
  readonly sid: string
}

/**
 * 激活链：PSK 输入解析 → 校验段本地核对 → HKDF 双因子派生 → 设备子密钥 AEAD
 * non-extractable 导入 → 设备钥对生成 → host 公钥导入/指纹推导。任一步失败 = 拒绝
 * 激活（只读闸门保持）；成功后调用方负责明文串即时清除（输入框 value 置空）。
 */
export async function establishTunnelMaterial(input: ActivateInput, deps: ActivateDeps): Promise<ActivateResult> {
  const parsed = parsePskInput(input.pskText)
  if (!parsed.ok) return { ok: false, reason: `psk:${parsed.reason}` }
  const checksum = await pskChecksum(parsed.raw)
  if (deps.expectedChecksum !== undefined && checksum !== deps.expectedChecksum) {
    return { ok: false, reason: 'checksum' }
  }
  const comm = await deriveCommBits(parsed.raw, input.pin)
  const deviceBits = await deriveDeviceBits(comm, deps.sid)
  const aead = await importAeadKey(deviceBits)
  const pair = await generateDeviceKeyPair()
  const hostPublic = await importHostPublicKey(input.hostSpkiB64)
  const hostKeyId = await keyIdOf(input.hostSpkiB64)
  return {
    ok: true,
    hostKeyId,
    material: {
      aead,
      devicePrivate: pair.privateKey,
      deviceSpkiB64: pair.publicSpkiB64,
      hostPublic,
      hostKeyId,
    },
  }
}
