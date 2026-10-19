/**
 * 静态资源验签（mobile-ui/1.31——tunnel-psk v3.1 §4.5 mobile 侧验证分层）。
 *
 * · host 侧契约：/remote/ 静态响应统一附 `X-Forge-Sig: base64(Ed25519.sign(sk, path‖body))`
 *   + `X-Forge-Key-Id`（= sha256(SPKI) hex 前 16，对应 mobile 手中 host 公钥）；
 * · 动态资源红线：fetch → 验签 → 再 import/eval（组合脚本被篡改 = PSK 加密层运行在
 *   被污染代码里——PSK 完整性的根）；
 * · 入口 HTML 首访信任 = LAN 首激活建立受信基线（entryHash + hostKeyId 持久化；
 *   隧道直连首访且无基线 = 显式残余风险——unverified 状态提示面）。
 */

import { keyIdOf, verifyHost } from './psk-crypto.ts'

export interface KvStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface StaticSigHeaders {
  readonly 'x-forge-sig'?: string
  readonly 'x-forge-key-id'?: string
}

const textEncoder = new TextEncoder()

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** 静态资源验签：keyId 匹配 + path‖body Ed25519 验签（签名头缺席 = false）。 */
export async function verifyStaticResource(
  hostPublic: CryptoKey,
  hostKeyId: string,
  path: string,
  body: Uint8Array,
  headers: StaticSigHeaders,
): Promise<boolean> {
  if (headers['x-forge-sig'] === undefined || headers['x-forge-key-id'] === undefined) return false
  if (headers['x-forge-key-id'] !== hostKeyId) return false
  const material = new Uint8Array(textEncoder.encode(path).length + body.length)
  material.set(textEncoder.encode(path), 0)
  material.set(body, textEncoder.encode(path).length)
  return verifyHost(hostPublic, material, base64ToBytes(headers['x-forge-sig']))
}

// ── 动态脚本安全加载（fetch → 验签 → import）────────────────────────

export interface VerifiedScriptDeps {
  fetch(path: string): Promise<{ readonly status: number; readonly text: string; readonly headers: StaticSigHeaders }>
  /** 验签通过后的执行缝（装配注 blob import / 组合脚本 eval；单测捕获）。 */
  readonly importSource: (code: string) => unknown
}

export type VerifiedScriptResult =
  | { readonly ok: true; readonly imported: unknown }
  | { readonly ok: false; readonly reason: 'status' | 'unverified' }

/** 动态资源加载唯一通道：非 200 = status；验签失败 = unverified（拒绝执行）。 */
export async function loadVerifiedScript(
  path: string,
  hostPublic: CryptoKey,
  hostKeyId: string,
  deps: VerifiedScriptDeps,
): Promise<VerifiedScriptResult> {
  const response = await deps.fetch(path)
  if (response.status !== 200) return { ok: false, reason: 'status' }
  const verified = await verifyStaticResource(
    hostPublic,
    hostKeyId,
    path,
    textEncoder.encode(response.text),
    response.headers,
  )
  if (!verified) return { ok: false, reason: 'unverified' }
  return { ok: true, imported: deps.importSource(response.text) }
}

// ── 入口 HTML 受信基线（LAN 首激活建立）────────────────────────────

export interface TrustBaseline {
  readonly entryHash: string
  readonly hostKeyId: string
}

const BASELINE_KEY = 'forge.psk.trustBaseline'

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  let out = ''
  for (const byte of new Uint8Array(digest)) out += byte.toString(16).padStart(2, '0')
  return out
}

/** LAN 首激活：缓存入口 hash + host 公钥指纹（同窗完成 = 基线建立）。 */
export async function recordTrustBaseline(storage: KvStorage, entryHtml: string, hostSpkiB64: string): Promise<TrustBaseline> {
  const baseline: TrustBaseline = { entryHash: await sha256Hex(textEncoder.encode(entryHtml)), hostKeyId: await keyIdOf(hostSpkiB64) }
  storage.set(BASELINE_KEY, JSON.stringify(baseline))
  return baseline
}

export function readTrustBaseline(storage: KvStorage): TrustBaseline | undefined {
  const raw = storage.get(BASELINE_KEY)
  if (raw === null) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<TrustBaseline> | null
    if (parsed === null || typeof parsed.entryHash !== 'string' || typeof parsed.hostKeyId !== 'string') return undefined
    return { entryHash: parsed.entryHash, hostKeyId: parsed.hostKeyId }
  } catch {
    return undefined
  }
}

export type EntryTrust = 'trusted' | 'unverified'

/**
 * 入口信任态：基线在场且 entryHash+keyId 双匹配 = trusted；否则 unverified
 * （首访无基线 / host 轮换后 entry 变更——显式残余风险提示面驱动）。
 */
export function entryTrustState(storage: KvStorage, entryHash: string, hostKeyId: string): EntryTrust {
  const baseline = readTrustBaseline(storage)
  if (baseline === undefined) return 'unverified'
  return baseline.entryHash === entryHash && baseline.hostKeyId === hostKeyId ? 'trusted' : 'unverified'
}
