// dsh web 宿主 boot token 认证门支撑（ledger 192d4631 测试侧收敛——stale probe 退役）。
//
// 认证形态实锚（031-webloop curl 精查，task_logs/plugin-forge-combo/1.16/）：
// - 无 token `GET /` → 401（boot token 认证门——旧就绪探针 fetch('/') 恒假红根因）；
// - 带 token `GET /?token=…` → 303 + Set-Cookie（会话下发）；
// - `/node_modules/**` 静态面走 cookie 会话语义（token query 直取 → 404）。
// 故取证形态 = ①宿主 boot stdout 提取 token URL（`dsh web: http://…?token=…` 行，
// AGENTS 1.8 boot token 既有语义）→ ②token 换 cookie 会话 → ③会话 GET / ok = 上线，
// 后续静态面取件一律携 Cookie 头。
// fetch 实现可注入（单测反例自证——不依赖真机宿主）。

/** boot stdout 中宿主上线行（dsh web URL + token）匹配形状 */
const BOOT_URL_LINE = /dsh web: (https?:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9._~-]+))/gu

/**
 * 自宿主 boot stdout 提取 boot token（指定端口定向——多实例/陈旧行容错）。
 * 行缺席（宿主未上线/旧代宿主）或端口不匹配 → undefined（调用侧不上线，不假绿）。
 */
export function extractBootToken(stdout: string, port: number): string | undefined {
  for (const m of stdout.matchAll(BOOT_URL_LINE)) {
    if (Number(m[2]) === port) return m[3]
  }
  return undefined
}

/** token 换取的 cookie 会话（静态面取件凭证） */
export interface WebAuthSession {
  readonly cookie: string
  /** token query 首取状态码（实锚形态 303 + Set-Cookie） */
  readonly tokenStatus: number
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>; redirect?: 'manual' | 'follow' }) => Promise<{
  ok: boolean
  status: number
  headers: { getSetCookie?: () => readonly string[] }
}>

/**
 * token → cookie 会话建立（`GET /?token=…` redirect:manual——收 Set-Cookie 为会话凭证，
 * 不跟进 303）。零 Set-Cookie / 请求失败 → undefined（调用侧 fail-loud，不假绿）。
 */
export async function establishWebAuthSession(base: string, token: string, doFetch: FetchLike = fetch as FetchLike): Promise<WebAuthSession | undefined> {
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await doFetch(`${base}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  } catch {
    return undefined
  }
  const raw = res.headers.getSetCookie?.() ?? []
  const cookie = raw
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter((c) => c.includes('='))
    .join('; ')
  if (cookie === '') return undefined
  return { cookie, tokenStatus: res.status }
}

/** cookie 会话 GET / ok = web 宿主上线（认证形态就绪判据——192d4631 新锚） */
export async function sessionReady(base: string, cookie: string, doFetch: FetchLike = fetch as FetchLike): Promise<boolean> {
  try {
    const res = await doFetch(`${base}/`, { headers: { cookie }, redirect: 'manual' })
    return res.ok
  } catch {
    return false
  }
}
