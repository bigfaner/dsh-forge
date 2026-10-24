// 加密 forge-stream SSE 单测（1.11——tunnel-psk §4.1 推送镜像）：帧化核（订阅→逐帧推送→
// 心跳→teardown 退订）、隧道域逐帧加密往返（host 签名可验）、明文镜像（LAN 旧门）。
import { describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { PSK_VERSION, ReplayWatermark, deriveCommKey, deriveDeviceKey, generateSigningKeyPair, openFrame, sigMaterial, verifyPayload } from './psk.js'
import { PSK_SALT, createStreamSealer, type PskGateDeps, type PskPersistShape } from './psk-gate.js'
import { createForgeStreamHandler, isForgeStreamRequest, subscribeOfficialEvents, type ForgeStreamEvent, type ForgeStreamRes } from './forge-stream.js'

describe('isForgeStreamRequest', () => {
  it('GET /remote/forge-stream 命中；POST/静态路径不命中', () => {
    expect(isForgeStreamRequest('GET', '/remote/forge-stream')).toBe(true)
    expect(isForgeStreamRequest('GET', '/remote/forge-stream?sid=A&epoch=1')).toBe(true)
    expect(isForgeStreamRequest('POST', '/remote/forge-stream')).toBe(false)
    expect(isForgeStreamRequest('GET', '/remote/index.html')).toBe(false)
  })
})

function fakeRes() {
  const res: ForgeStreamRes & { frames: string[]; closed: boolean; closeTrigger: () => void } = {
    frames: [],
    closed: false,
    writeHead: () => res,
    write: (chunk: string) => {
      res.frames.push(chunk)
      return true
    },
    on: (_event, cb) => {
      res.closeTrigger = cb
      return res
    },
    closeTrigger: () => {},
  }
  return res
}

describe('帧化核（createForgeStreamHandler）', () => {
  it('订阅镜像逐帧 `event: frame` 推送；res close = 退订 + 心跳销毁（teardown 纪律）', async () => {
    vi.useFakeTimers()
    const emitted: ForgeStreamEvent[] = []
    let off = 0
    const res = fakeRes()
    createForgeStreamHandler({
      subscribe: (push) => {
        emitted.push({ type: 'api-session/added', payload: { sessionId: 's-1' }, at: 1 })
        push(emitted[0]!)
        return () => {
          off++
        }
      },
      seal: (event) => JSON.stringify(event),
      diag: () => {},
      heartbeatMs: 15_000,
    })({}, res)
    expect(res.frames.some((f) => f.includes('api-session/added'))).toBe(true)
    // 心跳注释行（判活）
    await vi.advanceTimersByTimeAsync(16_000)
    expect(res.frames.some((f) => f.startsWith(': ping'))).toBe(true)
    // teardown：退订被调 + 心跳停
    res.closeTrigger()
    const frameCount = res.frames.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(off).toBe(1)
    expect(res.frames.length).toBe(frameCount)
    vi.useRealTimers()
  })

  it('write 抛错 = 关帧 + diag 留痕（不向断链写）', () => {
    const lines: string[] = []
    const res = fakeRes()
    res.write = () => {
      throw new Error('EPIPE')
    }
    createForgeStreamHandler({
      subscribe: (push) => {
        expect(() => push({ type: 'forge/progress', payload: {}, at: 1 })).not.toThrow()
        return () => {}
      },
      seal: (event) => JSON.stringify(event),
      diag: (l) => lines.push(l),
    })({}, res)
    expect(lines.some((l) => l.includes('frame write fail'))).toBe(true)
  })
})

describe('subscribeOfficialEvents（官方事件订阅装配）', () => {
  it('目录名逐一注册；事件载荷镜像为 ForgeStreamEvent；退订聚合一并调用', () => {
    const handlers = new Map<string, (payload: unknown) => void>()
    const offs: number[] = []
    const seen: ForgeStreamEvent[] = []
    const off = subscribeOfficialEvents(
      (name, handler) => {
        handlers.set(name, handler)
        return () => {
          offs.push(1)
        }
      },
      (event) => seen.push(event),
      () => {},
    )
    expect(handlers.has('api-session/added')).toBe(true)
    expect(handlers.has('approval/request')).toBe(true)
    expect(handlers.has('forge/progress')).toBe(true)
    handlers.get('api-session/status')!({ sessionId: 's-1', running: true })
    expect(seen).toEqual([{ type: 'api-session/status', payload: { sessionId: 's-1', running: true }, at: seen[0]!.at }])
    off()
    expect(offs.length).toBeGreaterThan(0)
  })

  it('事件名缺席（ctx.on 抛）= 零订阅 fail-soft + diag 留痕', () => {
    const lines: string[] = []
    const off = subscribeOfficialEvents(
      () => {
        throw new Error('unknown event')
      },
      () => {},
      (l) => lines.push(l),
    )
    expect(() => off()).not.toThrow()
    expect(lines.length).toBeGreaterThan(0)
  })
})

describe('隧道域逐帧加密（createStreamSealer）', () => {
  const KP = generateSigningKeyPair()
  const PSK_RAW = randomBytes(32)
  const deps: PskGateDeps = {
    load: () =>
      ({
        v: 3,
        psk: PSK_RAW.toString('base64'),
        signing: { spki: KP.publicDer.toString('base64'), pkcs8: KP.secret.export({ format: 'der', type: 'pkcs8' }).toString('base64') },
      }) satisfies PskPersistShape,
    pin: () => '123456',
    watermarks: new ReplayWatermark(),
    now: () => 1,
  }

  it('帧 = PSK v3 信封（逐帧 AEAD + host Ed25519 签名可验；seq 单调）', () => {
    const sealer = createStreamSealer(deps, 'device-A', 1)
    expect(sealer).toBeDefined()
    const e1 = JSON.parse(sealer!({ type: 'approval/request', payload: { requestId: 'r1' }, at: 1 })!) as { v: number; sid: string; seq: number; iv: string; ct: string; sig: string }
    const e2 = JSON.parse(sealer!({ type: 'forge/progress', payload: {}, at: 2 })!) as { seq: number }
    expect(e1.v).toBe(PSK_VERSION)
    expect(e1.sid).toBe('device-A')
    expect(e2.seq).toBe(e1.seq + 1)
    // 解密往返 + 签名核
    const comm = deriveCommKey(PSK_RAW, '123456', PSK_SALT)
    const dk = deriveDeviceKey(comm, 'device-A')
    const iv = Buffer.from(e1.iv, 'base64')
    const ct = Buffer.from(e1.ct, 'base64')
    expect(verifyPayload(KP.publicDer, sigMaterial(ct, iv, e1.seq), Buffer.from(e1.sig, 'base64'))).toBe(true)
    const plain = JSON.parse(openFrame(dk, 's2c', 'device-A', 1, e1.seq, iv, ct).toString('utf8')) as { type: string }
    expect(plain.type).toBe('approval/request')
  })

  it('PSK 未配置 = sealer 缺席（隧道域 401 由装配面收口）', () => {
    expect(createStreamSealer({ ...deps, load: () => undefined }, 'A', 1)).toBeUndefined()
  })
})
