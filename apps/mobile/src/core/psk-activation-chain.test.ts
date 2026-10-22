/**
 * 1.107 手机激活链端到端自证（桌面半边 → 手机半边，单测级 mock）：
 *   host rotatePsk 落盘 → 桌面三件套读数（pskTrioOf：display/checksum/spki）→
 *   手机 establishTunnelMaterial（校验段核对 → HKDF → 材料聚合）→ 信封化 c2s 帧 →
 *   host admitPskRequest 准入（dpk 注册绑定 + 水位）→ s2c 回包解封 + host 公钥验签。
 * 轮换宽限期语义（tunnel-psk v3.1）：轮换后旧 display 派生帧 ≤5min 只验不密——准入通过；
 *   新 display 帧同窗准入；宽限期尽（now 推进）旧帧拒绝。纯 Node crypto + WebCrypto，零 IO 网络。
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  admitPskRequest,
  loadPskPersist,
  pskTrioOf,
  rotatePsk,
  type PskGateDeps,
} from '../../../../apps/host/src/boot/psk-gate.ts'
import { ReplayWatermark } from '../../../../apps/host/src/boot/psk.ts'
import {
  establishTunnelMaterial,
  type TunnelMaterial,
} from './tunnel-transport.ts'
import {
  base64ToBytes,
  openFrame,
  sealFrame,
  sigMaterial,
  signDevice,
  verifyHost,
} from './psk-crypto.ts'

const PIN = '123456'
const SID = 'device-sid-1'

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** 桌面读数 + PIN → 手机激活材料（激活链半边——独立函数复用于各用例） */
async function activate(trio: { display: string; checksum: string; spki: string }, sid = SID) {
  return establishTunnelMaterial(
    { pskText: trio.display, pin: PIN, hostSpkiB64: trio.spki },
    { sid, expectedChecksum: trio.checksum },
  )
}

/** 激活材料 → 信封化 c2s 帧（注册帧携 dpk + 签名——createTunnelTransport 首联同形） */
async function sealRegistrationFrame(
  material: TunnelMaterial,
  seq: number,
  epoch = 0,
): Promise<string> {
  const sealed = await sealFrame(material.aead, 'c2s', SID, epoch, seq, textBytes(JSON.stringify({ channel: 'forge:remote/progress', payload: {} })))
  const signature = await signDevice(material.devicePrivate, sigMaterial(base64ToBytes(sealed.ct), base64ToBytes(sealed.iv), seq))
  return JSON.stringify({
    v: 3,
    sid: SID,
    epoch,
    iv: sealed.iv,
    seq,
    ct: sealed.ct,
    sig: Buffer.from(signature).toString('base64'),
    dpk: material.deviceSpkiB64,
  })
}

function gateDeps(file: string, now: number): PskGateDeps {
  return {
    load: () => loadPskPersist(file),
    pin: () => PIN,
    watermarks: new ReplayWatermark(),
    now: () => now,
  }
}

describe('1.107 激活链端到端（桌面三件套 → 手机材料 → host 准入）', () => {
  it('桌面上行三件套激活 → 注册帧准入 → s2c 回包解封 + host 公钥验签全通', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-chain-')), 'remote-psk.json')
    const first = rotatePsk(file, undefined, 1000)
    const trio = pskTrioOf(first.shape)
    expect(trio.display).toMatch(/^([A-Z2-7]{5}-)+[A-Z2-7]{1,5}$/)
    expect(trio.checksum).toMatch(/^[0-9a-f]{4}$/)
    const activated = await activate(trio)
    if (!activated.ok) throw new Error(`激活失败：${activated.reason}`)
    expect(activated.material.hostKeyId).toHaveLength(16)
    // 注册帧（dpk + 签名）→ host 准入
    const envelope = await sealRegistrationFrame(activated.material, 0)
    const verdict = admitPskRequest(gateDeps(file, 1000), envelope, () => true)
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.channel).toBe('forge:remote/progress')
    // s2c 回包：设备钥解封 + host 公钥（桌面展示的 SPKI）逐帧验签
    const reply = JSON.parse(String(verdict.reply({ tasks: [] }))) as {
      iv: string
      ct: string
      seq: number
      sig: string
    }
    const plain = await openFrame(activated.material.aead, 's2c', SID, 0, reply.seq, reply.iv, reply.ct)
    expect(JSON.parse(new TextDecoder().decode(plain))).toEqual({ ok: true, data: { tasks: [] } })
    const sigOk = await verifyHost(
      activated.material.hostPublic,
      sigMaterial(base64ToBytes(reply.ct), base64ToBytes(reply.iv), reply.seq),
      base64ToBytes(reply.sig),
    )
    expect(sigOk).toBe(true)
  })

  it('校验段不符 / 畸形 PSK = 激活拒绝（只读闸门保持）', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-chain-')), 'remote-psk.json')
    const trio = pskTrioOf(rotatePsk(file, undefined, 1000).shape)
    const badChecksum = await establishTunnelMaterial(
      { pskText: trio.display, pin: PIN, hostSpkiB64: trio.spki },
      { sid: SID, expectedChecksum: '0000' },
    )
    expect(badChecksum.ok).toBe(false)
    const malformed = await establishTunnelMaterial(
      { pskText: '@@@', pin: PIN, hostSpkiB64: trio.spki },
      { sid: SID },
    )
    expect(malformed.ok).toBe(false)
  })

  it('轮换宽限期语义（v3.1）：旧 display 帧宽限期内准入、新 display 帧同窗准入、宽限期尽旧帧拒绝', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'psk-chain-')), 'remote-psk.json')
    const first = rotatePsk(file, undefined, 1000)
    const oldTrio = pskTrioOf(first.shape)
    const oldMaterial = await activate(oldTrio)
    if (!oldMaterial.ok) throw new Error(`旧钥激活失败：${oldMaterial.reason}`)
    // 轮换（rotatePsk 再生成——旧钥入 ≤5min 宽限窗）
    const second = rotatePsk(file, first.shape, 2000)
    const newTrio = pskTrioOf(second.shape)
    expect(newTrio.display).not.toBe(oldTrio.display)
    const newMaterial = await activate(newTrio)
    if (!newMaterial.ok) throw new Error(`新钥激活失败：${newMaterial.reason}`)
    // 宽限期内：旧钥注册帧准入（只验不密）
    const oldFrame = await sealRegistrationFrame(oldMaterial.material, 0)
    expect(admitPskRequest(gateDeps(file, 2000 + 1000), oldFrame, () => true).ok).toBe(true)
    // 宽限期内：新钥注册帧准入
    const newFrame = await sealRegistrationFrame(newMaterial.material, 0)
    expect(admitPskRequest(gateDeps(file, 2000 + 1000), newFrame, () => true).ok).toBe(true)
    // 宽限期尽（>5min）：旧钥帧拒绝（统一 401 归一 ok:false）
    const lateFrame = await sealRegistrationFrame(oldMaterial.material, 1)
    expect(admitPskRequest(gateDeps(file, 2000 + 5 * 60 * 1000 + 1), lateFrame, () => true).ok).toBe(false)
  })
})
