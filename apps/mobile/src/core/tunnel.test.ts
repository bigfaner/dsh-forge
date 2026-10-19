// 模式探测 + sid/epoch 身份单测（1.31——tunnel-psk §2/§4.2.1）。
import { describe, expect, it } from 'vitest'
import {
  createSessionIdentity,
  detectTunnelMode,
  EPOCH_TTL_MS,
  hostnameMode,
  IDENTITY_KEYS,
  isIpLiteralHostname,
  TUNNEL_COPY,
  type KvStorage,
} from './tunnel.ts'

function memoryStorage(initial: Record<string, string> = {}): KvStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) }
}

describe('模式判定（R12 修正锚——URL 形态 + forge-stream 语义）', () => {
  it('IP 字面量 / localhost = LAN；域名 = 隧道候选', () => {
    expect(isIpLiteralHostname('192.168.1.7')).toBe(true)
    expect(isIpLiteralHostname('127.0.0.1:3000')).toBe(true)
    expect(isIpLiteralHostname('localhost')).toBe(true)
    expect(isIpLiteralHostname('[::1]:8080')).toBe(true)
    expect(isIpLiteralHostname('forge.example.com')).toBe(false)
    expect(hostnameMode('192.168.1.7')).toBe('lan')
    expect(hostnameMode('trycloudflare.com')).toBe('tunnel')
  })

  it('探测语义：200 = ok；401 = gated（PSK 门在）；异常/其余 = unreachable', async () => {
    expect(await detectTunnelMode({ hostname: 'f.example.com', probe: async () => 200 })).toEqual({ mode: 'tunnel', probe: 'ok' })
    expect(await detectTunnelMode({ hostname: 'f.example.com', probe: async () => 401 })).toEqual({ mode: 'tunnel', probe: 'gated' })
    expect(await detectTunnelMode({ hostname: 'f.example.com', probe: async () => 500 })).toEqual({ mode: 'tunnel', probe: 'unreachable' })
    expect(await detectTunnelMode({ hostname: 'f.example.com', probe: async () => { throw new Error('x') } })).toEqual({ mode: 'tunnel', probe: 'unreachable' })
  })

  it('LAN 形态不探测（模式切换判定零网络开销）', async () => {
    let probed = 0
    const verdict = await detectTunnelMode({ hostname: '10.0.0.2', probe: () => { probed += 1; return Promise.resolve(200) } })
    expect(verdict).toEqual({ mode: 'lan', probe: null })
    expect(probed).toBe(0)
  })
})

describe('sid/epoch 身份（持久化 + TTL 重同步）', () => {
  it('sid 随机生成持久化；页面会话开始 epoch 自增', () => {
    const storage = memoryStorage()
    let tick = 1000
    const identity = createSessionIdentity({ storage, randomBytes: (n) => new Uint8Array(Array.from({ length: n }, (_, i) => i)), now: () => tick })
    const first = identity.beginSession()
    expect(first).toEqual({ sid: identity.sid, epoch: 0 })
    expect(storage.data.get(IDENTITY_KEYS.sid)).toBe(identity.sid)
    tick += 60_000
    expect(identity.beginSession().epoch).toBe(1)
  })

  it('epoch 长期静默（TTL 超限）后重连 = 归零重同步', () => {
    const storage = memoryStorage({ [IDENTITY_KEYS.sid]: 'sid-x', [IDENTITY_KEYS.epoch]: '9', [IDENTITY_KEYS.touchedAt]: '1000' })
    const identity = createSessionIdentity({ storage, randomBytes: () => new Uint8Array(16), now: () => 1000 + EPOCH_TTL_MS + 1 })
    expect(identity.beginSession().epoch).toBe(0)
  })

  it('TTL 窗口内重连保持自增（不误重置）', () => {
    const storage = memoryStorage({ [IDENTITY_KEYS.sid]: 'sid-x', [IDENTITY_KEYS.epoch]: '4', [IDENTITY_KEYS.touchedAt]: '1000' })
    const identity = createSessionIdentity({ storage, randomBytes: () => new Uint8Array(16), now: () => 1000 + EPOCH_TTL_MS })
    expect(identity.beginSession().epoch).toBe(5)
  })

  it('坏落盘形状 fail-soft 回零', () => {
    const storage = memoryStorage({ [IDENTITY_KEYS.epoch]: 'nope' })
    const identity = createSessionIdentity({ storage, randomBytes: () => new Uint8Array(16), now: () => 1 })
    expect(identity.beginSession().epoch).toBe(0)
  })
})

describe('隧道 UX 文案（降级/断线分型 + 只读闸门 + 轮换引导）', () => {
  it('degraded 按模式分型；rotation 引导非裸断连', () => {
    expect(TUNNEL_COPY.degraded).toContain('隧道模式（降级）')
    expect(TUNNEL_COPY.offline).toBe('连接已断开')
    expect(TUNNEL_COPY.readonlyGate).toContain('只读')
    expect(TUNNEL_COPY.rotation).toContain('桌面端确认新密钥')
    expect(TUNNEL_COPY.ed25519Floor).toContain('Ed25519')
  })
})
