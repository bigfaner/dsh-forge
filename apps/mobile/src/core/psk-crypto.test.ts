// PSK v3 mobile 密码核单测（1.31）：解析/校验段/双因子派生/AEAD/Ed25519/信封——
// node:crypto 复刻 host 侧（apps/host/src/boot/psk.ts）做跨端互操作向量核验。
import { createCipheriv, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  aadOf,
  base32Decode,
  bytesToBase64,
  deriveCommBits,
  deriveDeviceBits,
  importAeadKey,
  isEd25519Supported,
  keyIdOf,
  normalizePskText,
  openFrame,
  parseEnvelope,
  parsePskInput,
  pskChecksum,
  sealFrame,
  sigMaterial,
  signDevice,
  verifyHost,
} from './psk-crypto.ts'

// ── host 侧复刻（node:crypto——互操作锚）────────────────────────────
const SALT = Buffer.from('dsh-forge-psk')
const INFO = 'forge-psk-v3'

function hostComm(psk: Buffer, pin: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.concat([psk, Buffer.from(pin, 'utf8')]), SALT, INFO, 32))
}
function hostDevice(comm: Buffer, sid: string): Buffer {
  return Buffer.from(hkdfSync('sha256', comm, Buffer.from(sid, 'utf8'), INFO, 32))
}
function hostAad(direction: string, sid: string, epoch: number, seq: number): Buffer {
  return Buffer.from(`${INFO}|${direction}|${sid}|${epoch}|${seq}`, 'utf8')
}
function hostSeal(key: Buffer, direction: string, sid: string, epoch: number, seq: number, plain: Buffer): { iv: Buffer; ct: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  cipher.setAAD(hostAad(direction, sid, epoch, seq))
  return { iv, ct: Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]) }
}
function hostOpen(key: Buffer, direction: string, sid: string, epoch: number, seq: number, iv: Buffer, ct: Buffer): Buffer {
  const tag = ct.subarray(ct.length - 16)
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAAD(hostAad(direction, sid, epoch, seq))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()])
}
function hostSigMaterial(ct: Buffer, iv: Buffer, seq: number): Buffer {
  return Buffer.concat([ct, iv, Buffer.from(`|${seq}`, 'ascii')])
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Encode(bytes: Buffer): string {
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

const PSK = randomBytes(32)
const PSK_DISPLAY = (base32Encode(PSK).match(/.{1,5}/g) ?? []).join('-')
const PIN = '123456'
const SID = 'dGVzdC1zaWQ'

describe('PSK 展示输入解析 / 校验段', () => {
  it('展示分组（连字符+小写）归一解码回 32 字节原钥', () => {
    const parsed = parsePskInput(PSK_DISPLAY.toLowerCase())
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(Buffer.from(parsed.raw).toString('hex')).toBe(PSK.toString('hex'))
    expect(normalizePskText('abcd efgh-ijkl')).toBe('ABCDEFGH-IJKL'.replace('-', ''))
  })

  it('非法字符 / 非法长度拒绝', () => {
    expect(parsePskInput('not-base32!!')).toMatchObject({ ok: false })
    expect(parsePskInput('AAAA')).toMatchObject({ ok: false, reason: 'length' })
    expect(parsePskInput('')).toMatchObject({ ok: false, reason: 'empty' })
    expect(base32Decode('AAAA####')).toBeNull()
  })

  it('校验段 = SHA-256(raw) hex 前 4（与 host generatePsk 同源）', async () => {
    expect(await pskChecksum(PSK)).toBe(createHash('sha256').update(PSK).digest('hex').slice(0, 4))
  })
})

describe('双因子派生（v3——PIN 入 KDF）', () => {
  it('mobile WebCrypto 派生 = host node:crypto 派生（逐字节互操作）', async () => {
    const mobile = await deriveCommBits(PSK, PIN)
    expect(Buffer.from(mobile).toString('hex')).toBe(hostComm(PSK, PIN).toString('hex'))
  })

  it('PIN/PSK 任一变化 → 密钥全变（双因子）', async () => {
    const k1 = await deriveCommBits(PSK, PIN)
    expect(Buffer.from(await deriveCommBits(PSK, '654321')).equals(Buffer.from(k1))).toBe(false)
    expect(Buffer.from(await deriveCommBits(randomBytes(32), PIN)).equals(Buffer.from(k1))).toBe(false)
  })

  it('设备子密钥 = HKDF(comm, sid)（与 host deriveDeviceKey 一致）', async () => {
    const comm = await deriveCommBits(PSK, PIN)
    const mobile = await deriveDeviceBits(comm, SID)
    expect(Buffer.from(mobile).toString('hex')).toBe(hostDevice(hostComm(PSK, PIN), SID).toString('hex'))
  })
})

describe('AEAD 信封（AES-256-GCM 互操作）', () => {
  it('mobile 加密 → host 解密（AAD = forge-psk-v3|c2s|sid|epoch|seq）', async () => {
    const aead = await importAeadKey(await deriveDeviceBits(await deriveCommBits(PSK, PIN), SID))
    const sealed = await sealFrame(aead, 'c2s', SID, 2, 7, new TextEncoder().encode('{"channel":"x"}'))
    const plain = hostOpen(hostDevice(hostComm(PSK, PIN), SID), 'c2s', SID, 2, 7, Buffer.from(sealed.iv, 'base64'), Buffer.from(sealed.ct, 'base64'))
    expect(plain.toString('utf8')).toBe('{"channel":"x"}')
  })

  it('host 加密 → mobile 解密；AAD 方向失配拒（防反射）', async () => {
    const deviceBits = hostDevice(hostComm(PSK, PIN), SID)
    const { iv, ct } = hostSeal(deviceBits, 's2c', SID, 1, 3, Buffer.from('reply'))
    const aead = await importAeadKey(await deriveDeviceBits(await deriveCommBits(PSK, PIN), SID))
    expect(new TextDecoder().decode(await openFrame(aead, 's2c', SID, 1, 3, iv.toString('base64'), ct.toString('base64')))).toBe('reply')
    await expect(openFrame(aead, 'c2s', SID, 1, 3, iv.toString('base64'), ct.toString('base64'))).rejects.toThrow()
  })

  it('密文篡改 / seq 换位拒（GCM tag + AAD）', async () => {
    const aead = await importAeadKey(await deriveDeviceBits(await deriveCommBits(PSK, PIN), SID))
    const sealed = await sealFrame(aead, 's2c', SID, 1, 3, new TextEncoder().encode('data'))
    const raw = Buffer.from(sealed.ct, 'base64')
    raw[0] = raw[0]! ^ 0xff
    await expect(openFrame(aead, 's2c', SID, 1, 3, sealed.iv, bytesToBase64(raw))).rejects.toThrow()
    await expect(openFrame(aead, 's2c', SID, 1, 4, sealed.iv, sealed.ct)).rejects.toThrow()
  })

  it('签名材料 = ct‖iv‖|seq（与 host sigMaterial 逐字节一致）', () => {
    const ct = Buffer.from([1, 2, 3])
    const iv = Buffer.from([4, 5, 6])
    expect(Buffer.from(sigMaterial(new Uint8Array(ct), new Uint8Array(iv), 42))).toEqual(hostSigMaterial(ct, iv, 42))
  })
})

describe('Ed25519 签名层 / 能力检测', () => {
  it('mobile 设备签名 → host 公钥（dpk SPKI）可验；篡改拒', async () => {
    const { generateDeviceKeyPair } = await import('./psk-crypto.ts')
    const pair = await generateDeviceKeyPair()
    const material = sigMaterial(new Uint8Array([9, 9]), new Uint8Array([1]), 5)
    const sig = await signDevice(pair.privateKey, material)
    const spki = Buffer.from(pair.publicSpkiB64, 'base64')
    expect(verify(null, material, createPublicKeyFrom(spki), Buffer.from(sig))).toBe(true)
    expect(verify(null, sigMaterial(new Uint8Array([9, 9]), new Uint8Array([1]), 6), createPublicKeyFrom(spki), Buffer.from(sig))).toBe(false)
  })

  it('host 签名 → mobile host 公钥验签；keyId = sha256(SPKI) hex 前 16', async () => {
    const kp = generateKeyPairSync('ed25519')
    const spki = kp.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
    const spkiB64 = spki.toString('base64')
    const material = hostSigMaterial(Buffer.from([1]), Buffer.from([2]), 8)
    const sig = sign(null, material, kp.privateKey)
    const hostPublic = await import('./psk-crypto.ts').then((m) => m.importHostPublicKey(spkiB64))
    expect(await verifyHost(hostPublic, new Uint8Array(material), new Uint8Array(sig))).toBe(true)
    expect(await keyIdOf(spkiB64)).toBe(createHash('sha256').update(spki).digest('hex').slice(0, 16))
  })

  it('能力检测：node ≥22 WebCrypto Ed25519 在场 = true', async () => {
    expect(await isEd25519Supported()).toBe(true)
  })
})

// node:crypto 公钥导入 helper（测试局部）
function createPublicKeyFrom(spki: Buffer): ReturnType<typeof createPublicKey> {
  return createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

describe('信封解析（与 host parseEnvelope 同判）', () => {
  const valid = { v: 3, sid: 's', epoch: 1, iv: 'a', seq: 1, ct: 'b', sig: 'c' }
  it('合法信封收敛；降版本/缺字段/坏类型拒', () => {
    expect(parseEnvelope(valid)).toMatchObject({ v: 3, sid: 's' })
    expect(parseEnvelope({ ...valid, v: 2 })).toBeUndefined()
    expect(parseEnvelope({ ...valid, seq: -1 })).toBeUndefined()
    expect(parseEnvelope({ ...valid, iv: 1 })).toBeUndefined()
    expect(parseEnvelope({ ...valid, sig: 1 })).toBeUndefined()
    expect(parseEnvelope(null)).toBeUndefined()
    expect(parseEnvelope({ ...valid, dpk: 'd' })).toMatchObject({ dpk: 'd' })
  })

  it('aadOf 与 host 逐字节一致', () => {
    expect(Buffer.from(aadOf('c2s', 'sid-1', 3, 42)).toString('utf8')).toBe('forge-psk-v3|c2s|sid-1|3|42')
  })
})
