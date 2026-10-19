// 加密 forge-stream 订阅单测（1.31——逐帧解密+验签 / LAN 明文直传 / bad 帧丢弃）。
import { createCipheriv, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createForgeStreamSource, decodeForgeStreamFrame, forgeStreamUrl, type ForgeStreamEvent } from './forge-stream-source.ts'
import { establishTunnelMaterial, type TunnelMaterial } from './tunnel-transport.ts'

const SALT = Buffer.from('dsh-forge-psk')
const PIN = '123456'
const SID = 'c3RyZWFtLXNpZA'
const EPOCH = 3
const PSK = randomBytes(32)

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
const HOST_SPKI_B64 = (HOST_KP.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).toString('base64')

function deviceKey(): Buffer {
  const comm = Buffer.from(hkdfSync('sha256', Buffer.concat([PSK, Buffer.from(PIN, 'utf8')]), SALT, 'forge-psk-v3', 32))
  return Buffer.from(hkdfSync('sha256', comm, Buffer.from(SID, 'utf8'), 'forge-psk-v3', 32))
}

let seqCounter = 0
function sealFrame(event: ForgeStreamEvent): string {
  const seq = seqCounter++
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deviceKey(), iv, { authTagLength: 16 })
  cipher.setAAD(Buffer.from(`forge-psk-v3|s2c|${SID}|${EPOCH}|${seq}`, 'utf8'))
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(event), 'utf8')), cipher.final(), cipher.getAuthTag()])
  const sig = sign(null, Buffer.concat([ct, iv, Buffer.from(`|${seq}`, 'ascii')]), HOST_KP.privateKey)
  return JSON.stringify({ v: 3, sid: SID, epoch: EPOCH, iv: iv.toString('base64'), seq, ct: ct.toString('base64'), sig: sig.toString('base64') })
}

async function material(): Promise<TunnelMaterial> {
  const result = await establishTunnelMaterial(
    { pskText: base32EncodeOf(PSK), pin: PIN, hostSpkiB64: HOST_SPKI_B64 },
    { sid: SID },
  )
  if (!result.ok) throw new Error('fixture 失败')
  return result.material
}

describe('forgeStreamUrl（sid/epoch 查询串注册）', () => {
  it('URL 携带 sid + epoch', () => {
    expect(forgeStreamUrl({ sid: 'a/b', epoch: 2 })).toBe('/remote/forge-stream?sid=a%2Fb&epoch=2')
  })
})

describe('decodeForgeStreamFrame', () => {
  it('加密帧：解密 + host 验签 → 镜像事件', async () => {
    const mat = await material()
    const frame = sealFrame({ type: 'approval/request', payload: { id: 'r1' }, at: 42 })
    expect(await decodeForgeStreamFrame(frame, mat)).toEqual({ type: 'approval/request', payload: { id: 'r1' }, at: 42 })
  })

  it('LAN 明文镜像直传（无材料）', async () => {
    const frame = JSON.stringify({ type: 'api-session/added', payload: 1, at: 7 })
    expect(await decodeForgeStreamFrame(frame, undefined)).toEqual({ type: 'api-session/added', payload: 1, at: 7 })
  })

  it('签名被篡改 / 信封畸形 / 非 JSON 帧 → null（fail-soft）', async () => {
    const mat = await material()
    const tampered = JSON.parse(sealFrame({ type: 'x', payload: null, at: 1 })) as Record<string, string>
    const raw = Buffer.from(tampered['sig']!, 'base64')
    raw[0] = raw[0]! ^ 0xff
    tampered['sig'] = raw.toString('base64')
    expect(await decodeForgeStreamFrame(JSON.stringify(tampered), mat)).toBeNull()
    expect(await decodeForgeStreamFrame('{"v":2}', mat)).toBeNull()
    expect(await decodeForgeStreamFrame('not-json', mat)).toBeNull()
  })
})

describe('createForgeStreamSource（订阅装配）', () => {
  it('帧派发 + close 传播', async () => {
    const mat = await material()
    const events: ForgeStreamEvent[] = []
    let closed = 0
    let handler: ((data: string) => void) | undefined
    const source = createForgeStreamSource(
      { sid: SID, epoch: EPOCH },
      { material: mat },
      { openSource: (url, handlers) => {
          expect(url).toContain('/remote/forge-stream?sid=')
          handler = handlers.onFrame
          return { close: () => { closed += 1 } }
        } },
      { onEvent: (event) => events.push(event), onError: () => {} },
    )
    handler?.(sealFrame({ type: 'forge/progress', payload: 9, at: 3 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events).toEqual([{ type: 'forge/progress', payload: 9, at: 3 }])
    source.close()
    expect(closed).toBe(1)
  })
})
