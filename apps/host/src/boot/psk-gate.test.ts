// 1.107 连接密钥读数/ensure 面（pskTrioOf + ensurePskPersist——桌面展示三件套与装配期单源）。
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensurePskPersist, loadPskPersist, pskTrioOf, rotatePsk } from './psk-gate.js'

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
