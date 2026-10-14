// fix-6 配对令牌签发器（mobile-remote-approval——官方 /pair 协议缝的纯逻辑面）。
// 官方锚（DSH Desktop 0.10.0 app.asar out/main/index.js）：PAIRING_TTL_MS=5min（:1230）、
// token = randomBytes(32) base64url（:1504）、timingSafeEqual 恒时校验（:2054）、
// reload 轮换（:1313-1315）。npm 零可复用组件（路线 B 裁决 2026-10-14）——产品胶水实现
// 逐位对照官方语义。纯模块（时钟注入可测），child.ts 消费。
import { randomBytes, timingSafeEqual } from 'node:crypto'

/** 官方 PAIRING_TTL_MS 同值：配对令牌 TTL = 整 5 分钟（零抖动）。 */
export const PAIRING_TTL_MS = 5 * 60 * 1000

/** 一次配对签发：token（base64url 43 字符）+ 到期时刻（epoch ms——桌面倒计时单源）。 */
export interface PairingGrant {
  readonly token: string
  readonly expiresAt: number
}

export interface PairingIssuer {
  /** 当前签发（缺席或已到期 = 惰性签发/轮换——官方 reload 轮换同刻度）。 */
  current(): PairingGrant
  /** 强制轮换（child 定时器每 TTL 驱动一次——桌面 QR 到期重取前换签）。 */
  rotate(): PairingGrant
  /**
   * 恒时校验（timingSafeEqual——官方 :2054 同语义）：当前签发在场、未到期且逐位相等
   * 才 true。异长度输入长度守卫前置（timingSafeEqual 前不比较异长缓冲）；畸形 = false 不抛。
   */
  verify(token: string): boolean
}

/**
 * 配对令牌签发器（时钟注入可测）。token = randomBytes(32).toString('base64url')
 * （32 字节 → 43 字符 URL 安全字符集，官方 :1504 同构）；expiresAt = 签发时刻 + TTL。
 */
export function createPairingIssuer(now: () => number = Date.now): PairingIssuer {
  let grant: PairingGrant | undefined
  const issue = (): PairingGrant => {
    grant = { token: randomBytes(32).toString('base64url'), expiresAt: now() + PAIRING_TTL_MS }
    return grant
  }
  return {
    current(): PairingGrant {
      const at = now()
      if (grant === undefined || grant.expiresAt <= at) return issue()
      return grant
    },
    rotate: issue,
    verify(token: string): boolean {
      const cur = grant
      if (cur === undefined || typeof token !== 'string' || cur.expiresAt <= now()) return false
      const a = Buffer.from(token, 'utf8')
      const b = Buffer.from(cur.token, 'utf8')
      return a.length === b.length && timingSafeEqual(a, b)
    },
  }
}
