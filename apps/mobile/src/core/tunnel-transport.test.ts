// 隧道传输拦截器单测（1.31——代理信封封装 / 注册帧 / 401 归一 / host 应答解封）。
// host 侧应答与验签用 node:crypto 复刻（互操作向量）。
import { createCipheriv, createDecipheriv, createHash, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  establishTunnelMaterial,
  createTunnelTransport,
  rotationGuidance,
  type TunnelMaterial,
} from './tunnel-transport.ts'

const SALT = Buffer.from('dsh-forge-psk')
const PIN = '123456'
const SID = 'c2lkLW1vYmlsZQ'
const PSK = randomBytes(32)
const PSK_DISPLAY = base32EncodeOf(PSK)

function base32EncodeOf(bytes: Buffer): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += A[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31]
  return out
}

const HOST_KP = generateKeyPairSync('ed25519')
const HOST_SPKI = HOST_KP.publicKey.export({ format: 'der', type: 'spki' }) as Buffer
const HOST_SPKI_B64 = HOST_SPKI.toString('base64')

function hostDeviceKey(): Buffer {
  const comm = Buffer.from(hkdfSync('sha256', Buffer.concat([PSK, Buffer.from(PIN, 'utf8')]), SALT, 'forge-psk-v3', 32))
  return Buffer.from(hkdfSync('sha256', comm, Buffer.from(SID, 'utf8'), 'forge-psk-v3', 32))
}

function hostSealS2C(envelope: unknown, epoch: number, seq: number): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', hostDeviceKey(), iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(`forge-psk-v3|s2c|${SID}|${epoch}|${seq}`, 'utf8'))
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(envelope), 'utf8')), cipher.final(), cipher.getAuthTag()])
  const sig = sign(null, Buffer.concat([ct, iv, Buffer.from(`|${seq}`, 'ascii')]), HOST_KP.privateKey)
  return JSON.stringify({ v: 3, sid: SID, epoch, iv: iv.toString('base64'), seq, ct: ct.toString('base64'), sig: sig.toString('base64') })
}

async function material(): Promise<TunnelMaterial> {
  const result = await establishTunnelMaterial(
    { pskText: PSK_DISPLAY, pin: PIN, hostSpkiB64: HOST_SPKI_B64 },
    { sid: SID, expectedChecksum: createHash('sha256').update(PSK).digest('hex').slice(0, 4) },
  )
  if (!result.ok) throw new Error(`fixture 失败：${result.reason}`)
  return result.material
}

describe('establishTunnelMaterial（激活链）', () => {
  it('校验段不符拒绝；非法 PSK 拒绝；成功产出材料 + keyId', async () => {
    const bad = await establishTunnelMaterial({ pskText: PSK_DISPLAY, pin: PIN, hostSpkiB64: HOST_SPKI_B64 }, { sid: SID, expectedChecksum: '0000' })
    expect(bad).toMatchObject({ ok: false, reason: 'checksum' })
    const malformed = await establishTunnelMaterial({ pskText: '@@@', pin: PIN, hostSpkiB64: HOST_SPKI_B64 }, { sid: SID })
    expect(malformed).toMatchObject({ ok: false })
    const ok = await establishTunnelMaterial({ pskText: PSK_DISPLAY, pin: PIN, hostSpkiB64: HOST_SPKI_B64 }, { sid: SID })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.hostKeyId).toBe(createHash('sha256').update(HOST_SPKI).digest('hex').slice(0, 16))
  })
})

describe('createTunnelTransport（代理信封封装）', () => {
  it('首帧 = 注册帧（dpk 携带）；内层密文 host 复刻可解 + dpk 签名可验', async () => {
    const mat = await material()
    const transport = createTunnelTransport(mat, { sid: SID, epoch: 1 }, {
      post: async (_path, body) => {
        const env = JSON.parse(body) as { seq: number; dpk?: string; sig: string; ct: string; iv: string }
        expect(typeof env.dpk).toBe('string')
        // host 复刻：AEAD 解封 → 内层 {channel,payload}
        const raw = Buffer.from(env.ct, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', hostDeviceKey(), Buffer.from(env.iv, 'base64'), { authTagLength: 16 })
        decipher.setAAD(Buffer.from(`forge-psk-v3|c2s|${SID}|1|${env.seq}`, 'utf8'))
        decipher.setAuthTag(raw.subarray(raw.length - 16))
        const inner = JSON.parse(Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString('utf8')) as { channel?: string }
        expect(inner.channel).toBe('forge:proxy/session-page')
        // dpk 签名核（sigMaterial = ct‖iv‖|seq）
        const sigOk = verify(
          null,
          Buffer.concat([Buffer.from(env.ct, 'base64'), Buffer.from(env.iv, 'base64'), Buffer.from(`|${env.seq}`, 'ascii')]),
          createPublicKey({ key: Buffer.from(env.dpk ?? '', 'base64'), format: 'der', type: 'spki' }),
          Buffer.from(env.sig, 'base64'),
        )
        expect(sigOk).toBe(true)
        return { status: 200, text: hostSealS2C({ ok: true, data: { echo: 1 } }, 1, env.seq) }
      },
    })
    const result = await transport.post('/remote/__rpc', { channel: 'forge:proxy/session-page', payload: {} })
    expect(result).toMatchObject({ status: 200, json: { ok: true, data: { echo: 1 } } })
  })

  it('注册成功后后续帧仅 sig（dpk 撤下）；seq 单调递增', async () => {
    const mat = await material()
    const seqs: number[] = []
    const dpks: number[] = []
    let call = 0
    const transport = createTunnelTransport(mat, { sid: SID, epoch: 2 }, {
      post: async (_path, body) => {
        const env = JSON.parse(body) as { seq: number; dpk?: string }
        seqs.push(env.seq)
        if (env.dpk !== undefined) dpks.push(1)
        return { status: 200, text: hostSealS2C({ ok: true, data: call++ }, 2, env.seq + 100) }
      },
    })
    await transport.post('/remote/__rpc', { channel: 'a', payload: 1 })
    await transport.post('/remote/__rpc', { channel: 'a', payload: 2 })
    expect(seqs).toEqual([0, 1])
    expect(dpks).toHaveLength(1)
  })

  it('401 = rotation 引导回调 + disconnected 信封映射（既有断线文案路径）', async () => {
    const mat = await material()
    let rotation = 0
    const transport = createTunnelTransport(mat, { sid: SID, epoch: 1 }, {
      post: async () => ({ status: 401, text: '' }),
      onUnauthorized: () => { rotation += 1 },
    })
    const result = await transport.post('/remote/__rpc', { channel: 'a', payload: {} })
    expect(rotation).toBe(1)
    expect(result.json).toEqual({ ok: false, error: { code: 'disconnected', reason: 'unauthorized' } })
    expect(rotationGuidance()).toContain('桌面端')
  })

  it('host 应答签名被篡改 → 拒绝（host-sig-invalid）', async () => {
    const mat = await material()
    const tampering = createTunnelTransport(mat, { sid: SID, epoch: 1 }, {
      post: async (_path, body) => {
        const env = JSON.parse(body) as { seq: number }
        const reply = JSON.parse(hostSealS2C({ ok: true, data: 1 }, 1, env.seq)) as Record<string, string>
        const raw = Buffer.from(reply['sig']!, 'base64')
        raw[0] = raw[0]! ^ 0xff
        reply['sig'] = raw.toString('base64')
        return { status: 200, text: JSON.stringify(reply) }
      },
    })
    await expect(tampering.post('/remote/__rpc', { channel: 'a', payload: {} })).rejects.toThrow('host-sig-invalid')
  })

  it('应答信封结构畸形 / 响应非 JSON → 协议错', async () => {
    const mat = await material()
    const shape = createTunnelTransport(mat, { sid: SID, epoch: 1 }, { post: async () => ({ status: 200, text: '{"broken":true}' }) })
    await expect(shape.post('/remote/__rpc', { channel: 'a', payload: {} })).rejects.toThrow('envelope-shape')
    const raw = createTunnelTransport(mat, { sid: SID, epoch: 1 }, { post: async () => ({ status: 200, text: 'not-json' }) })
    await expect(raw.post('/remote/__rpc', { channel: 'a', payload: {} })).rejects.toThrow('envelope-json')
  })

  it('非 __rpc 路径拒绝（隧道唯一数据通道）', async () => {
    const mat = await material()
    const transport = createTunnelTransport(mat, { sid: SID, epoch: 1 }, { post: async () => ({ status: 200, text: '' }) })
    await expect(transport.post('/api/rpc', {})).rejects.toThrow('/remote/__rpc')
  })
})

// 签名层互操作 sanity（dpk SPKI 可被 node 验签）
describe('设备签名互操作', () => {
  it('mobile dpk（SPKI DER base64）可被 node:crypto 验签 mobile 签名', async () => {
    const mat = await material()
    const { signDevice, sigMaterial } = await import('./psk-crypto.ts')
    const sig = await signDevice(mat.devicePrivate, sigMaterial(new Uint8Array([1]), new Uint8Array([2]), 1))
    const ok = verify(null, Buffer.concat([Buffer.from([1]), Buffer.from([2]), Buffer.from('|1', 'ascii')]), createPublicKey({ key: Buffer.from(mat.deviceSpkiB64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(sig))
    expect(ok).toBe(true)
  })
})
