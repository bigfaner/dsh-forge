// fix-6 配对令牌签发器单测（mobile-remote-approval）——官方 LanMobileBridge 协议锚
// （DSH Desktop 0.10.0 app.asar out/main/index.js：PAIRING_TTL_MS=5min、token =
// randomBytes(32) base64url、timingSafeEqual 恒时校验）。纯逻辑面：时钟注入替身驱动。
import { describe, expect, it } from 'vitest'
import { createPairingIssuer, PAIRING_TTL_MS } from './pairing.js'

describe('fix-6 配对令牌签发器（官方 /pair 协议对齐）', () => {
  it('常量：TTL = 整 5 分钟（300_000ms——官方 PAIRING_TTL_MS 同值，零抖动）', () => {
    expect(PAIRING_TTL_MS).toBe(300_000)
  })

  it('签发：token = randomBytes(32) base64url（43 字符 URL 安全字符集），expiresAt = now + TTL', () => {
    let now = 1_000_000
    const issuer = createPairingIssuer(() => now)
    const grant = issuer.current()
    expect(grant.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(grant.expiresAt).toBe(1_000_000 + PAIRING_TTL_MS)
  })

  it('TTL 内重复读 = 同一令牌（零抖动重签）；到期后读 = 新令牌（惰性轮换——官方 reload 轮换同刻度）', () => {
    let now = 0
    const issuer = createPairingIssuer(() => now)
    const first = issuer.current()
    now = PAIRING_TTL_MS - 1
    expect(issuer.current().token).toBe(first.token)
    now = PAIRING_TTL_MS
    const second = issuer.current()
    expect(second.token).not.toBe(first.token)
    expect(second.expiresAt).toBe(now + PAIRING_TTL_MS)
  })

  it('rotate() = 强制轮换（到期前定时器驱动换签——QR 倒计时到期面消费）', () => {
    let now = 0
    const issuer = createPairingIssuer(() => now)
    const first = issuer.current()
    const rotated = issuer.rotate()
    expect(rotated.token).not.toBe(first.token)
    expect(rotated.expiresAt).toBe(now + PAIRING_TTL_MS)
    expect(issuer.current().token).toBe(rotated.token)
  })

  it('verify：当前未过期令牌 = true；错误令牌 = false；过期令牌 = false（timingSafeEqual 恒时比较）', () => {
    let now = 0
    const issuer = createPairingIssuer(() => now)
    const grant = issuer.current()
    expect(issuer.verify(grant.token)).toBe(true)
    expect(issuer.verify('A'.repeat(43))).toBe(false)
    now = grant.expiresAt
    expect(issuer.verify(grant.token)).toBe(false)
  })

  it('verify：异长度输入 = false（长度守卫前置——timingSafeEqual 前不比较异长缓冲）', () => {
    const issuer = createPairingIssuer(() => 0)
    const grant = issuer.current()
    expect(issuer.verify('')).toBe(false)
    expect(issuer.verify(grant.token.slice(0, 42))).toBe(false)
    expect(issuer.verify(grant.token + 'x')).toBe(false)
  })

  it('verify：从未签发（cold issuer）= false（不炸不抛）', () => {
    const issuer = createPairingIssuer(() => 0)
    expect(issuer.verify('A'.repeat(43))).toBe(false)
  })
})
