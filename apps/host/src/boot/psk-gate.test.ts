// 1.107 连接密钥读数/ensure 面（pskTrioOf + ensurePskPersist——桌面展示三件套与装配期单源）。
import { generateSigningKeyPair, signPayload, sigMaterial, sealFrame, deriveCommKey, deriveDeviceKey, ReplayWatermark } from './psk.js'
import { randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PSK_SALT, admitPskRequest, ensurePskPersist, loadPskPersist, pskTrioOf, rotatePsk, type DevicePubStore, type PskGateDeps } from './psk-gate.js'

describe('pskTrioOf（桌面展示三件套——读数即显口径）', () => {
  it('持久化形状 → 分组 display + 4 位校验段 + SPKI base64（与 rotatePsk 返回读数同源）', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-trio-')), 'remote-psk.json')
    const rotated = rotatePsk(file, undefined, 1000)
    const trio = pskTrioOf(rotated.shape)
    expect(trio.display).toBe(rotated.display)
    expect(trio.checksum).toBe(rotated.checksum)
    expect(trio.spki).toBe(rotated.shape.signing.spki)
    expect(trio.display).toMatch(/^([A-Z2-7]{5}-)+[A-Z2-7]{1,5}$/)
  })
})

describe('ensurePskPersist（装配期单源——无持久化生成落盘 / 有持久化原样加载）', () => {
  it('缺席 → 生成并落盘（load 回读一致；幂等二次 ensure 零换钥）', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-ensure-')), 'remote-psk.json')
    expect(loadPskPersist(file)).toBeUndefined()
    const first = ensurePskPersist(file)
    expect(loadPskPersist(file)).toEqual(first)
    const second = ensurePskPersist(file)
    expect(second).toEqual(first)
  })

  it('生成形状完备（v3 + psk + signing 双钥）——pskTrioOf 可直接消费', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-ensure-')), 'remote-psk.json')
    const shape = ensurePskPersist(file)
    const trio = pskTrioOf(shape)
    expect(trio.display).toMatch(/-/)
    expect(shape.signing.pkcs8).not.toBe('')
  })
})

describe('devicePubs 持久化（远程准入 sig 验签跨 host 重启）', () => {
  const KP = generateSigningKeyPair()
  const PSK_RAW = randomBytes(32)
  const PIN = '123456'
  const depsWith = (store: DevicePubStore | undefined, watermarks: ReplayWatermark): PskGateDeps => ({
    load: () => ({ v: 3, psk: PSK_RAW.toString('base64'), signing: { spki: KP.publicDer.toString('base64'), pkcs8: KP.secret.export({ format: 'der', type: 'pkcs8' }).toString('base64') } }),
    pin: () => PIN,
    watermarks,
    now: () => 1_000_000,
    devicePubs: store,
  })
  const seal = (sid: string, epoch: number, seq: number, withDpk: boolean): string => {
    const comm = deriveCommKey(PSK_RAW, PIN, PSK_SALT)
    const dk = deriveDeviceKey(comm, sid)
    const { iv, ct } = sealFrame(dk, 'c2s', sid, epoch, seq, Buffer.from(JSON.stringify({ channel: 'forge:proxy/projects-grouped', payload: {} }), 'utf8'))
    // 官方口径：sig 覆盖 raw ct‖iv‖seq（与宿主验签 sigMaterial 同源——base64 材料是测试桩自伤）
    const sig = signPayload(KP, sigMaterial(ct, iv, seq))
    return JSON.stringify({ v: 3, sid, epoch, iv: iv.toString('base64'), seq, ct: ct.toString('base64'), sig: sig.toString('base64'), ...(withDpk ? { dpk: KP.publicDer.toString('base64') } : {}) })
  }

  it('bug 1792cc7a：dpk 注册帧绑定入持久 store；host 重启（新 watermarks + 同 store）后 sig-only 帧仍准入', () => {
    const store = new Map<string, Buffer>()
    const deps1 = depsWith(store, new ReplayWatermark())
    const r1 = admitPskRequest(deps1, seal('dev-x', 0, 1, true), () => true)
    expect(r1.ok).toBe(true)
    expect(store.has('dev-x')).toBe(true)
    // 模拟 host 重启：新 watermarks 实例 + 同持久 store——sig-only 帧（无 dpk）仍验签
    const r2 = admitPskRequest(depsWith(store, new ReplayWatermark()), seal('dev-x', 0, 2, false), () => true)
    expect(r2.ok).toBe(true)
  })

  it('bug 1792cc7a 对照：store 缺席（进程内存缝）= 重启后未绑定 sid 的 sig-only 帧拒（旧行为佐证根因）', () => {
    const deps1 = depsWith(undefined, new ReplayWatermark())
    expect(admitPskRequest(deps1, seal('dev-y', 0, 1, true), () => true).ok).toBe(true)
    // 全新 sid（模拟 host 重启后另一设备/清表）：无绑定 → sig-only 拒
    const deps2 = depsWith(undefined, new ReplayWatermark())
    expect(admitPskRequest(deps2, seal('dev-z', 0, 2, false), () => true).ok).toBe(false)
  })
})
