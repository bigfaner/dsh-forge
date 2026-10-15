// fix-6 配对令牌签发器（mobile-remote-approval——官方 /pair 协议缝的纯逻辑面）。
// 官方锚（DSH Desktop 0.10.0 app.asar out/main/index.js）：PAIRING_TTL_MS=5min（:1230）、
// token = randomBytes(32) base64url（:1504）、timingSafeEqual 恒时校验（:2054）、
// reload 轮换（:1313-1315）。npm 零可复用组件（路线 B 裁决 2026-10-14）——产品胶水实现
// 逐位对照官方语义。纯模块（时钟注入可测），child.ts 消费。
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** 官方 PAIRING_TTL_MS 同值：配对令牌 TTL = 整 5 分钟（零抖动）。 */
export const PAIRING_TTL_MS = 5 * 60 * 1000

// dsh-mobile-tunnel PIN 层（官方 /pair/verify 锚 :1199-1215/:1231-1234 同语义：6 位数字
// PIN、PIN_TTL_MS 5min、失败限速）。仅 PIN——长效密码属提案排除项。
/** 官方 6 位 PIN 位数（数字字符集 0-9）。 */
export const PIN_LENGTH = 6
/** PIN TTL 常量单源：与配对令牌同刻度 = PAIRING_TTL_MS（官方 PIN_TTL_MS 同值 5min）。 */
export const PIN_TTL_MS = PAIRING_TTL_MS
/** 限速：滑窗（PIN_RATE_WINDOW_MS）内失败计数达阈值 → 锁定 PIN_LOCKOUT_MS。 */
export const PIN_MAX_FAILURES = 5
export const PIN_RATE_WINDOW_MS = 60 * 1000
export const PIN_LOCKOUT_MS = 5 * 60 * 1000
/** 隧道反代目标单源：host webserver 经隧道只暴露配对面（其余路径恒不暴露公网）。 */
export const PAIRING_FACES: readonly string[] = ['/pair', '/pair/verify']

/** 一次 PIN 签发：6 位数字 PIN + 到期时刻（epoch ms）。 */
export interface PinGrant {
  readonly pin: string
  readonly expiresAt: number
}

/**
 * fix-28 PIN 输入页（官方 renderPairingPinPage :1198 同位）：/pair 对隧道 Host 的 token
 * 校验通过后呈此页（不直接 302 落地——公网 URL 持有者还须 PIN 第二因子）。表单 POST
 * /pair/verify（既有 PIN 校验/TTL/限速语义全归 pinIssuer）；凭据零嵌入（纯静态页）。
 */
export function renderPairingPinPage(): string {
  return [
    '<!doctype html>',
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>输入 PIN 完成配对</title></head>',
    '<body><h1>输入 PIN 完成配对</h1>',
    '<p>请输入桌面端显示的 6 位 PIN。</p>',
    '<form action="/pair/verify" method="post">',
    '<input name="pin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required>',
    '<button type="submit">验证</button>',
    '</form></body></html>',
  ].join('')
}

/**
 * fix-28 bug cad43954：/pair/verify PIN 提交解析单源（query 优先 → JSON body →
 * urlencoded 表单体——renderPairingPinPage 原生 form POST 即 urlencoded）。Root cause:
 * 处理器只吃 query/JSON，表单 urlencoded 体解析不到 pin → 正确 PIN 恒 403。
 * 畸形 body = 空串不抛（fail-soft，走 verify false 面）。
 */
export function pinOfSubmission(queryPin: string, rawBody: string): string {
  if (queryPin !== '') return queryPin
  const body = rawBody.trim()
  if (body === '') return ''
  if (body.startsWith('{')) {
    try {
      const raw = (JSON.parse(body) as Record<string, unknown> | null)?.['pin']
      return typeof raw === 'string' ? raw : ''
    } catch {
      return ''
    }
  }
  try {
    return new URLSearchParams(body).get('pin') ?? ''
  } catch {
    return ''
  }
}

export interface PinIssuer {
  /** 当前 PIN（缺席或已到期 = 惰性重签新 PIN——超时自动换签；durable 态 = 冻结签发）。 */
  current(): PinGrant
  /** 强制换签（durable 态 = 零换签原样返回——长效不轮换）。 */
  rotate(): PinGrant
  /**
   * fix-26 长效开关（官方 POST /desktop/pin/consent 同语义）：true = 当前 PIN 冻结为长效
   * （expiresAt 远期、rotate 零换签——长期生效不轮换）；false = 解除长效并新签临时 PIN
   * （5min TTL——旧长效 PIN 立即失效）。
   */
  setDurable(durable: boolean): PinGrant
  /**
   * 恒时校验：未锁定、当前 PIN 在场未到期且逐位相等才 true。成功清空失败计数；
   * 失败计入滑窗，窗内计满阈值即锁定（锁定窗内正确 PIN 也拒绝）。
   */
  verify(pin: string): boolean
}

/**
 * 6 位 PIN 签发器（时钟注入可测）。pin = randomInt(0,10) 逐位均匀取样（无模偏差）。
 */
export function createPinIssuer(now: () => number = Date.now): PinIssuer {
  let grant: PinGrant | undefined
  let durable = false
  let failures: number[] = []
  let lockUntil = 0
  const issue = (): PinGrant => {
    let pin = ''
    for (let i = 0; i < PIN_LENGTH; i += 1) pin += String(randomInt(0, 10))
    grant = { pin, expiresAt: now() + PIN_TTL_MS }
    return grant
  }
  return {
    current(): PinGrant {
      const at = now()
      if (grant === undefined || grant.expiresAt <= at) return issue()
      return grant
    },
    rotate(): PinGrant {
      if (durable && grant !== undefined) return grant // fix-26：长效不轮换
      return issue()
    },
    setDurable(next: boolean): PinGrant {
      durable = next
      if (!next) return issue() // 解除长效 → 回临时 PIN（旧长效立即失效）
      grant = { pin: (grant ?? issue()).pin, expiresAt: Number.MAX_SAFE_INTEGER } // 冻结当前 PIN
      return grant
    },
    verify(pin: string): boolean {
      const at = now()
      const cur = grant
      if (lockUntil > at) return false
      if (cur === undefined || cur.expiresAt <= at) return false
      const a = Buffer.from(typeof pin === 'string' ? pin : '', 'utf8')
      const b = Buffer.from(cur.pin, 'utf8')
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        failures = failures.filter((t) => t > at - PIN_RATE_WINDOW_MS)
        failures.push(at)
        if (failures.length >= PIN_MAX_FAILURES) {
          lockUntil = at + PIN_LOCKOUT_MS
          failures = []
        }
        return false
      }
      failures = []
      lockUntil = 0
      return true
    },
  }
}

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
