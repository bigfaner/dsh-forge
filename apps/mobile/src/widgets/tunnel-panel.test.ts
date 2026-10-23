// 隧道面板纯逻辑单测（1.31——输入前置校验 / 闸门文案分型 / 方案 A 非密材料缓存）。
import { describe, expect, it } from 'vitest'
import {
  clearCachedField,
  gateCopy,
  loadCachedField,
  saveCachedField,
  tunnelCacheKey,
  validateTunnelInput,
  type TunnelCacheStore,
  type TunnelInput,
} from './tunnel-panel.ts'

const VALID: TunnelInput = { psk: 'ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-23456-23456-23457', pin: '123456', hostKey: 'A'.repeat(48) }

describe('validateTunnelInput（同步前置校验）', () => {
  it('三字段齐全通过', () => {
    expect(validateTunnelInput(VALID)).toEqual({ ok: true })
  })

  it('PSK/PIN/host 公钥缺席各归其因', () => {
    expect(validateTunnelInput({ ...VALID, psk: '' })).toMatchObject({ ok: false, reason: 'psk-empty' })
    expect(validateTunnelInput({ ...VALID, pin: ' ' })).toMatchObject({ ok: false, reason: 'pin-empty' })
    expect(validateTunnelInput({ ...VALID, hostKey: 'short' })).toMatchObject({ ok: false, reason: 'host-key' })
  })
})

describe('gateCopy（覆盖层/闸门文案分型）', () => {
  it('degraded 按隧道/LAN 分型；其余取固定文案', () => {
    expect(gateCopy('degraded', true)).toContain('隧道模式（降级）')
    expect(gateCopy('degraded', false)).toBe('连接不稳定，正在重连…')
    expect(gateCopy('offline', true)).toBe('连接已断开')
    expect(gateCopy('readonly', true)).toContain('只读')
    expect(gateCopy('rotation', true)).toContain('桌面端确认新密钥')
  })
})

describe('方案 A 非密材料缓存（SPKI/PIN 预填——PSK 恒不落 storage）', () => {
  function memStore(): TunnelCacheStore & { data: Map<string, string> } {
    const data = new Map<string, string>()
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
  }

  it('键按配对域隔离（pin/hostKey 分字段）', () => {
    expect(tunnelCacheKey('h1', 'pin')).toBe('dshf.mobile.tunnel.pin.h1')
    expect(tunnelCacheKey('h1', 'hostKey')).not.toBe(tunnelCacheKey('h2', 'hostKey'))
  })

  it('写读往返；重置清除；空值/缺席 = undefined', () => {
    const store = memStore()
    saveCachedField(store, tunnelCacheKey('h1', 'pin'), '654321')
    expect(loadCachedField(store, tunnelCacheKey('h1', 'pin'))).toBe('654321')
    clearCachedField(store, tunnelCacheKey('h1', 'pin'))
    expect(loadCachedField(store, tunnelCacheKey('h1', 'pin'))).toBeUndefined()
    expect(loadCachedField(store, tunnelCacheKey('h1', 'hostKey'))).toBeUndefined()
    store.data.set(tunnelCacheKey('h1', 'hostKey'), '')
    expect(loadCachedField(store, tunnelCacheKey('h1', 'hostKey'))).toBeUndefined()
  })

  it('存储缺席/抛错 = 静默降级（读写清零异常不外抛）', () => {
    expect(loadCachedField(null, 'k')).toBeUndefined()
    expect(() => saveCachedField(null, 'k', 'v')).not.toThrow()
    expect(() => clearCachedField(null, 'k')).not.toThrow()
    const boom: TunnelCacheStore = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(loadCachedField(boom, 'k')).toBeUndefined()
    expect(() => saveCachedField(boom, 'k', 'v')).not.toThrow()
    expect(() => clearCachedField(boom, 'k')).not.toThrow()
  })
})
