// fix-6 配对令牌签发器单测（mobile-remote-approval）——官方 LanMobileBridge 协议锚
// （DSH Desktop 0.10.0 app.asar out/main/index.js：PAIRING_TTL_MS=5min、token =
// randomBytes(32) base64url、timingSafeEqual 恒时校验）。纯逻辑面：时钟注入替身驱动。
import { describe, expect, it } from 'vitest'
import {
  createPairingIssuer,
  createPinIssuer,
  PAIRING_FACES,
  PAIRING_TTL_MS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
  PIN_MAX_FAILURES,
  PIN_RATE_WINDOW_MS,
  PIN_TTL_MS,
} from './pairing.js'

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

describe('dsh-mobile-tunnel PIN 签发器（官方 /pair/verify 对齐：6 位·TTL 5min·失败限速）', () => {
  it('常量：PIN_TTL_MS = 整 5 分钟（单源 = PAIRING_TTL_MS，零抖动）', () => {
    expect(PIN_TTL_MS).toBe(PAIRING_TTL_MS)
    expect(PIN_TTL_MS).toBe(300_000)
    expect(PIN_LENGTH).toBe(6)
    expect(PIN_MAX_FAILURES).toBeGreaterThan(0)
    expect(PIN_RATE_WINDOW_MS).toBeGreaterThan(0)
    expect(PIN_LOCKOUT_MS).toBeGreaterThan(0)
  })

  it('常量：PAIRING_FACES = 隧道反代目标只含配对面（/pair + /pair/verify，单源）', () => {
    expect(PAIRING_FACES).toEqual(['/pair', '/pair/verify'])
  })

  it('签发：6 位数字字符集（官方 6 位 PIN），expiresAt = now + PIN_TTL_MS；重复读 = 同一 PIN', () => {
    let now = 1_000_000
    const issuer = createPinIssuer(() => now)
    const grant = issuer.current()
    expect(grant.pin).toMatch(/^[0-9]{6}$/)
    expect(grant.pin).toHaveLength(PIN_LENGTH)
    expect(grant.expiresAt).toBe(now + PIN_TTL_MS)
    expect(issuer.current().pin).toBe(grant.pin)
  })

  it('rotate() = 强制换签（新 PIN + 新到期时刻）', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    issuer.current()
    now = 1
    const rotated = issuer.rotate()
    expect(rotated.pin).toMatch(/^[0-9]{6}$/)
    expect(rotated.expiresAt).toBe(1 + PIN_TTL_MS)
    expect(issuer.current().pin).toBe(rotated.pin)
  })

  it('校验：正确 PIN = true；错误 PIN = false（timingSafeEqual 恒时）；异长度/非数字输入 = false 不抛', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    const { pin } = issuer.current()
    expect(issuer.verify(pin)).toBe(true)
    expect(issuer.verify('000000'.replace(/0/g, pin === '000000' ? '1' : '0'))).toBe(false)
    expect(issuer.verify('12345')).toBe(false)
    expect(issuer.verify('1234567')).toBe(false)
    expect(issuer.verify('')).toBe(false)
    expect(issuer.verify('abcdef')).toBe(false)
  })

  it('TTL：超时 PIN 失效（verify = false）；current() 惰性重签新 PIN', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    const first = issuer.current()
    now = first.expiresAt - 1
    expect(issuer.verify(first.pin)).toBe(true)
    now = first.expiresAt
    expect(issuer.verify(first.pin)).toBe(false)
    const second = issuer.current()
    expect(second.expiresAt).toBe(now + PIN_TTL_MS)
  })

  it('限速：窗口内连续失败计满阈值 → 锁定窗内正确 PIN 也拒绝（拒绝一段时间）；锁定到期恢复', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    const { pin } = issuer.current()
    for (let i = 0; i < PIN_MAX_FAILURES; i += 1) {
      expect(issuer.verify('999999' === pin ? '000000' : '999999')).toBe(false)
    }
    expect(issuer.verify(pin)).toBe(false) // 锁定窗内正确 PIN 也拒绝
    now = PIN_LOCKOUT_MS - 1
    expect(issuer.verify(pin)).toBe(false)
    now = PIN_LOCKOUT_MS
    const fresh = issuer.current() // 锁定到期即解禁（此刻旧 PIN 恰同刻 TTL 到期——惰性重签）
    expect(issuer.verify(fresh.pin)).toBe(true)
  })

  it('限速：失败滑出窗口后计数衰减（稀疏失败不触发锁定）', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    const wrong = '000000'
    const { pin } = issuer.current()
    const w = wrong === pin ? '111111' : wrong
    for (let i = 0; i < PIN_MAX_FAILURES - 1; i += 1) {
      expect(issuer.verify(w)).toBe(false)
      now += PIN_RATE_WINDOW_MS - 1 // 每次失败间隔近窗口期——旧失败陆续滑出
    }
    expect(issuer.verify(w)).toBe(false) // 计满前最后一次仍在窗口内→不锁（计数 ≤ 阈值-1 衰减后）
    now += 1
    expect(issuer.verify(pin)).toBe(true) // 未锁定：正确 PIN 通过
  })

  it('校验成功重置失败计数（通过后再新一轮失败才可能触发限速）', () => {
    let now = 0
    const issuer = createPinIssuer(() => now)
    const { pin } = issuer.current()
    const wrong = pin === '000000' ? '111111' : '000000'
    for (let i = 0; i < PIN_MAX_FAILURES - 1; i += 1) expect(issuer.verify(wrong)).toBe(false)
    expect(issuer.verify(pin)).toBe(true) // 成功清零
    for (let i = 0; i < PIN_MAX_FAILURES - 1; i += 1) expect(issuer.verify(wrong)).toBe(false)
    now += PIN_RATE_WINDOW_MS - 1
    expect(issuer.verify(pin)).toBe(true) // 未达阈值不锁
  })

  it('cold issuer：从未签发 verify = false 不抛', () => {
    const issuer = createPinIssuer(() => 0)
    expect(issuer.verify('123456')).toBe(false)
  })
})

// ── fix-26 durable PIN（长效密码机制——官方 /desktop/pin/consent 同语义） ──

describe('fix-26 durable PIN（setDurable 冻结/解冻——长效不轮换）', () => {
  it('setDurable(true)：当前 PIN 冻结——超 TTL verify 仍通过、rotate 零换签（长期生效不轮换）', () => {
    let now = 1_000
    const issuer = createPinIssuer(() => now)
    const before = issuer.current()
    const durable = issuer.setDurable(true)
    expect(durable.pin).toBe(before.pin)
    now += PIN_TTL_MS * 10
    expect(issuer.rotate().pin).toBe(before.pin) // 长效：rotate 零换签
    expect(issuer.current().pin).toBe(before.pin)
    expect(issuer.verify(before.pin)).toBe(true) // 无 TTL 失效
  })

  it('setDurable(false)：回临时 PIN——新签 5min TTL（旧 durable PIN 立即失效）', () => {
    let now = 1_000
    const issuer = createPinIssuer(() => now)
    const durable = issuer.setDurable(true)
    now += 1
    const temp = issuer.setDurable(false)
    expect(temp.pin).not.toBe(durable.pin)
    expect(temp.expiresAt).toBe(now + PIN_TTL_MS)
    expect(issuer.verify(durable.pin)).toBe(false)
    expect(issuer.verify(temp.pin)).toBe(true)
  })
})
