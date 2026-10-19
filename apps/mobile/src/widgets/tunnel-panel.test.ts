// 隧道面板纯逻辑单测（1.31——输入前置校验 / 闸门文案分型）。
import { describe, expect, it } from 'vitest'
import { gateCopy, validateTunnelInput, type TunnelInput } from './tunnel-panel.ts'

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
