// PSK v3 host 侧单测（1.11——四族 + 强制位生效域）：
//   ① 生成/派生族：CSPRNG 生成 + base32 分组 + 校验段；HKDF 双因子（PSK‖PIN）+ per-device 子密钥；
//   ② AEAD 族：seal/open 往返；AAD 绑定（direction/sid/epoch/seq 任一失配即拒）；篡改即拒；
//   ③ 重放水位族：(sid,epoch) 独立高水位（同 seq 拒、递增过、跨设备/跨 epoch 互不误杀）、TTL 清理、持久化往返；
//   ④ 签名族：Ed25519 sign/verify 往返、篡改/错钥拒、静态签名头可验。
//   ⑤ 生效域判定：isPskEnforcedHost（A3——非 loopback/非 IP 字面量 = 隧道域）。
//   ⑥ 统一 401：恒定体 + 固定长度填充（唯一 owner 响应面）。
import { describe, expect, it } from 'vitest'
import {
  PSK_VERSION,
  ReplayWatermark,
  aadOf,
  base32Of,
  deriveCommKey,
  deriveDeviceKey,
  generatePsk,
  generateSigningKeyPair,
  isPskEnforcedHost,
  openFrame,
  parseEnvelope,
  sealFrame,
  signPayload,
  sigMaterial,
  staticSignatureHeaders,
  verifyPayload,
  writeConstant401,
} from './psk.js'
import type { FakeRes } from './remote-http-rpc.js'

describe('① 生成/派生族', () => {
  it('生成 = 256-bit CSPRNG + base32 分组展示 + 校验段（每次不同）', () => {
    const a = generatePsk()
    const b = generatePsk()
    expect(a.raw).toHaveLength(32)
    // 32 bytes = 256 bit → 52 base32 字符（5 字符分组 + 尾段）
    expect(a.display.replace(/-/g, '')).toMatch(/^[A-Z2-7]{52}$/)
    expect(a.display.split('-').slice(0, -1).every((g) => g.length === 5)).toBe(true)
    expect(a.checksum).toHaveLength(4)
    expect(a.display).not.toBe(b.display)
    expect(a.checksum).toBe(a.checksum.toLowerCase())
  })

  it('base32 编码已知向量（RFC 4648 无 padding——单字节 = 双字符）', () => {
    expect(base32Of(Buffer.alloc(0))).toBe('')
    expect(base32Of(Buffer.from([0]))).toBe('AA')
    expect(base32Of(Buffer.from([0xff]))).toBe('74')
  })

  it('双因子派生：PIN 变化 / PSK 变化 → 密钥全变（同输入确定）', () => {
    const psk = generatePsk().raw
    const salt = Buffer.from('dsh-forge-psk')
    const k1 = deriveCommKey(psk, '123456', salt)
    expect(deriveCommKey(psk, '123456', salt)).toEqual(k1)
    expect(deriveCommKey(psk, '654321', salt)).not.toEqual(k1) // PIN 入 KDF（v3 双因子）
    expect(deriveCommKey(generatePsk().raw, '123456', salt)).not.toEqual(k1)
  })

  it('per-device 子密钥：同通信密钥下不同 sid → 不同子密钥', () => {
    const comm = deriveCommKey(generatePsk().raw, '123456', Buffer.from('s'))
    expect(deriveDeviceKey(comm, 'sid-A')).not.toEqual(deriveDeviceKey(comm, 'sid-B'))
    expect(deriveDeviceKey(comm, 'sid-A')).toEqual(deriveDeviceKey(comm, 'sid-A'))
  })
})

describe('② AEAD 族', () => {
  const key = deriveDeviceKey(deriveCommKey(generatePsk().raw, '123456', Buffer.from('s')), 'sid-1')

  it('seal/open 往返；同 seq 同明文密文不同（随机 IV）', () => {
    const plain = Buffer.from(JSON.stringify({ channel: 'forge:proxy/session-list', payload: {} }))
    const f1 = sealFrame(key, 'c2s', 'sid-1', 1, 7, plain)
    const f2 = sealFrame(key, 'c2s', 'sid-1', 1, 7, plain)
    expect(f1.ct).not.toEqual(f2.ct)
    expect(openFrame(key, 'c2s', 'sid-1', 1, 7, f1.iv, f1.ct)).toEqual(plain)
  })

  it('AAD 绑定：direction/sid/epoch/seq 任一失配即拒（防反射/乱序/跨设备）', () => {
    const { iv, ct } = sealFrame(key, 'c2s', 'sid-1', 1, 7, Buffer.from('x'))
    expect(() => openFrame(key, 's2c', 'sid-1', 1, 7, iv, ct)).toThrow() // direction
    expect(() => openFrame(key, 'c2s', 'sid-2', 1, 7, iv, ct)).toThrow() // sid
    expect(() => openFrame(key, 'c2s', 'sid-1', 2, 7, iv, ct)).toThrow() // epoch
    expect(() => openFrame(key, 'c2s', 'sid-1', 1, 8, iv, ct)).toThrow() // seq
  })

  it('密文篡改（单比特翻转）即拒（GCM tag）', () => {
    const { iv, ct } = sealFrame(key, 'c2s', 'sid-1', 1, 7, Buffer.from('secret body'))
    const tampered = Buffer.from(ct)
    tampered[0] = (tampered[0] ?? 0) ^ 1
    expect(() => openFrame(key, 'c2s', 'sid-1', 1, 7, iv, tampered)).toThrow()
  })

  it('信封结构判定：v 仅升不降（降版本/缺字段/类型不符 = undefined）', () => {
    expect(parseEnvelope({ v: 3, sid: 's', epoch: 1, iv: 'a', seq: 1, ct: 'b' })).toMatchObject({ v: PSK_VERSION })
    expect(parseEnvelope({ v: 2, sid: 's', epoch: 1, iv: 'a', seq: 1, ct: 'b' })).toBeUndefined()
    expect(parseEnvelope({ v: 3, sid: '', epoch: 1, iv: 'a', seq: 1, ct: 'b' })).toBeUndefined()
    expect(parseEnvelope({ v: 3, sid: 's', epoch: 1.5, iv: 'a', seq: 1, ct: 'b' })).toBeUndefined()
    expect(parseEnvelope({ v: 3, sid: 's', epoch: 1, iv: 'a', seq: -1, ct: 'b' })).toBeUndefined()
    expect(parseEnvelope({ v: 3, epoch: 1, iv: 'a', seq: 1, ct: 'b' })).toBeUndefined()
    expect(parseEnvelope('nope')).toBeUndefined()
  })

  it('AAD 形状钉：前缀 + direction + sid + epoch + seq（跨端互操作锚）', () => {
    expect(aadOf('c2s', 'sid-1', 3, 42).toString('utf8')).toBe('forge-psk-v3|c2s|sid-1|3|42')
  })
})

describe('③ 重放水位族', () => {
  it('(sid,epoch) 独立高水位：递增过、同 seq 拒；跨设备/跨 epoch 互不误杀', () => {
    const wm = new ReplayWatermark()
    expect(wm.admit('A', 1, 5, 1000)).toBe(true)
    expect(wm.admit('A', 1, 5, 1001)).toBe(false) // 重放
    expect(wm.admit('A', 1, 4, 1002)).toBe(false) // 乱序旧帧
    expect(wm.admit('A', 1, 6, 1003)).toBe(true)
    expect(wm.admit('B', 1, 1, 1004)).toBe(true) // 多设备独立（v2/C2）
    expect(wm.admit('A', 2, 1, 1005)).toBe(true) // 新 epoch 从零起算
  })

  it('epoch TTL 清理：陈旧记录/发送序号一并移除（设备重连天然重同步）', () => {
    const wm = new ReplayWatermark()
    wm.admit('A', 1, 9, 1000)
    expect(wm.nextSendSeq('A', 1)).toBe(1)
    expect(wm.sweep(1000 + 24 * 60 * 60 * 1000 + 1)).toBe(1)
    expect(wm.admit('A', 1, 9, 2000)).toBe(true) // 清理后旧 seq 重新可入（新窗口）
    expect(wm.toJSON().records).toHaveLength(1)
  })

  it('持久化往返：load 恢复高水位（host 重启防重放窗——v2/H1）', () => {
    const wm = new ReplayWatermark()
    wm.admit('A', 1, 9, 1000)
    const wm2 = new ReplayWatermark()
    wm2.load(wm.toJSON())
    expect(wm2.admit('A', 1, 9, 1001)).toBe(false) // 重启后重放仍拒
    expect(wm2.admit('A', 1, 10, 1002)).toBe(true)
  })

  it('s2c 发送序号单调（同 (sid,epoch) 递增，独立于 c2s 水位）', () => {
    const wm = new ReplayWatermark()
    expect(wm.nextSendSeq('A', 1)).toBe(1)
    expect(wm.nextSendSeq('A', 1)).toBe(2)
    expect(wm.nextSendSeq('B', 1)).toBe(1)
  })
})

describe('④ 签名族', () => {
  it('Ed25519 sign/verify 往返；篡改/错钥拒', () => {
    const kp = generateSigningKeyPair()
    const { iv, ct } = sealFrame(Buffer.alloc(32), 's2c', 's', 1, 1, Buffer.from('x'))
    const material = sigMaterial(ct, iv, 1)
    const sig = signPayload(kp, material)
    expect(verifyPayload(kp.publicDer, material, sig)).toBe(true)
    expect(verifyPayload(kp.publicDer, sigMaterial(ct, iv, 2), sig)).toBe(false)
    expect(verifyPayload(generateSigningKeyPair().publicDer, material, sig)).toBe(false)
  })

  it('静态签名头：X-Forge-Sig 覆盖 path‖body 且可验；keyId = 公钥指纹前 16 hex', () => {
    const kp = generateSigningKeyPair()
    const signing = { spki: kp.publicDer.toString('base64'), pkcs8: kp.secret.export({ format: 'der', type: 'pkcs8' }).toString('base64') }
    const body = Buffer.from('<html>mobile dist</html>')
    const headers = staticSignatureHeaders(signing, '/index.html', body)
    expect(headers['x-forge-key-id']).toBe(kp.keyId)
    expect(verifyPayload(kp.publicDer, Buffer.concat([Buffer.from('/index.html'), body]), Buffer.from(headers['x-forge-sig'], 'base64'))).toBe(true)
    expect(verifyPayload(kp.publicDer, Buffer.concat([Buffer.from('/other.html'), body]), Buffer.from(headers['x-forge-sig'], 'base64'))).toBe(false)
  })
})

describe('⑤ 强制位生效域（A3 裁决）', () => {
  it('隧道域名 = 强制；IP 字面量/回环 = LAN 旧门维持；Host 缺席 = fail closed', () => {
    expect(isPskEnforcedHost('forge-mobile.example.com:8786')).toBe(true)
    expect(isPskEnforcedHost('trycloudflare.com')).toBe(true)
    expect(isPskEnforcedHost('192.168.1.7:3000')).toBe(false)
    expect(isPskEnforcedHost('127.0.0.1:3000')).toBe(false)
    expect(isPskEnforcedHost('localhost')).toBe(false)
    expect(isPskEnforcedHost('[::1]:3000')).toBe(false)
    expect(isPskEnforcedHost(undefined)).toBe(true)
    expect(isPskEnforcedHost('')).toBe(true)
  })
})

describe('⑥ 统一 401（唯一 owner 响应面）', () => {
  it('恒定 401 + 填充至固定目标长度', () => {
    const res = fakeRes()
    writeConstant401(res)
    expect(res.status).toBe(401)
    expect(res.body).toHaveLength(4096)
  })

  it('bug f6b9a233：拒绝体全不透明——零 JSON 结构零明文语义（状态码 401 即全部对外语义）', () => {
    const res = fakeRes()
    writeConstant401(res)
    expect(res.body.startsWith('{')).toBe(false)
    expect(() => JSON.parse(res.body)).toThrow()
    expect(res.body).not.toContain('unauthorized')
  })
})

function fakeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    body: '',
    writeHead(code) {
      res.status = code
    },
    end(text) {
      res.body = text ?? ''
    },
  }
  return res
}
