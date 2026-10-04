// 壳文档服务（定位：基础）——自定义 scheme 服务 apps/web dist + 其余路由转发已认证
// webserver + Gateway WebSocket 握手改写。官方 desktop web-document 母本模式（0.2.0-rc.2
// apps/desktop/src/web-document.ts 同型，S2 清单 pin）：
//   - 壳文档/资产 = 应用资源（本 dist），不经 Host；index 注入就绪门脚本（异步注入表的门）
//   - 其余路由（plugins/… 批、api/… RPC）= 转发 Host（cookie 认证；连接层 HTTP 走文档相对
//     路由 → 本 scheme → 转发；跨页 origin 拒绝）
//   - ws://127.0.0.1/* 升级请求 = 页 origin 改写为 Host origin + 附 cookie（/api/remote.mux
//     相对 streamBaseUrl 直连 webserver，carrier.streamBaseUrl 提供基址）
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { hostRoot } from '../profile/paths.js'

/** 壳 scheme（standard/secure/fetch/stream 特权面——须 app ready 前注册） */
export const SHELL_SCHEME = 'dsh-forge'
/** 壳页 origin（转发与 ws 改写的对端校验值） */
export const SHELL_PAGE_ORIGIN = 'dsh-forge://app'
/** 主窗口载入 URL（壳 dist 根） */
export const SHELL_ENTRY_URL = `${SHELL_PAGE_ORIGIN}/`

/** 就绪门预建脚本（母本同款：异步注入表生效前建门，bootShell ??= 兜底同门） */
const BOOT_READY_MARKUP = '<script>globalThis.__DSH_BOOT_READY__ ??= Promise.withResolvers()</script>'

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** Electron protocol 面（测试注入 fake；真身由 main 传入） */
export interface ProtocolLike {
  registerSchemesAsPrivileged(schemes: { scheme: string; privileges: Record<string, boolean> }[]): void
  handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void
}

/** webRequest 面（ws 改写安装器；测试注入 fake） */
export interface WebRequestLike {
  onBeforeSendHeaders(
    filter: { urls: string[] },
    listener: (
      details: { url: string; webContentsId?: number; requestHeaders: Record<string, string> },
      callback: (change: { requestHeaders?: Record<string, string> } | { cancel?: boolean }) => void,
    ) => void,
  ): void
}

/**
 * 壳 dist 根解析：dev = workspace apps/web/dist（hostRoot 上溯）；DSH_FORGE_WEB_DIST 覆盖
 * （绝对或相对 hostRoot）；打包形态默认 = {resources}/web-dist（DSH_FORGE_RESOURCES_DIR
 * 置位时——4.1 extraResources 定形：assemble-installer-resources.mjs 物化 web-dist）。
 */
export function resolveWebDistDir(env: { DSH_FORGE_WEB_DIST?: string; DSH_FORGE_RESOURCES_DIR?: string }): string {
  if (env.DSH_FORGE_WEB_DIST !== undefined && env.DSH_FORGE_WEB_DIST !== '') {
    return resolveFromHost(env.DSH_FORGE_WEB_DIST)
  }
  if (env.DSH_FORGE_RESOURCES_DIR !== undefined && env.DSH_FORGE_RESOURCES_DIR !== '') {
    return join(resolveFromHost(env.DSH_FORGE_RESOURCES_DIR), 'web-dist')
  }
  return join(hostRoot(), '..', 'web', 'dist')
}

/** 相对路径锚 hostRoot（与 profile/paths.ts resolveFromHost 同语义；绝对值原样） */
function resolveFromHost(p: string): string {
  return isAbsolute(p) ? p : join(hostRoot(), p)
}

/**
 * 服务一项壳静态资产；index 就绪门脚本注入于 <head> 后（异步注入表未生效前的门预建）。
 * 仅 GET/HEAD；路径逃逸 403；缺席 404（母本语义）。
 */
export async function serveShellDocument(request: Request, root: string): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  const url = new URL(request.url)
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return new Response(null, { status: 400 })
  }
  const isIndex = pathname === '/' || pathname === '/index.html'
  const target = join(root, `.${isIndex ? '/index.html' : pathname}`)
  if (!target.startsWith(root + sep)) return new Response(null, { status: 403 })
  let body: Buffer
  try {
    body = await readFile(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  const ext = target.slice(target.lastIndexOf('.'))
  if (isIndex) {
    const html = body.toString().replace(/<head(?:\s[^>]*)?>/i, (open) => `${open}${BOOT_READY_MARKUP}`)
    return new Response(request.method === 'HEAD' ? null : html, {
      headers: { 'content-type': MIME['.html'] ?? 'text/html; charset=utf-8' },
    })
  }
  return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), {
    headers: { 'content-type': MIME[ext] ?? 'application/octet-stream' },
  })
}

/**
 * 以已认证 URL 换取 authority 绑定的浏览器 cookie（Host 令牌门：GET /?token=… → 303 + set-cookie）。
 * @param url - boot manifest.url（ctx.connection.authenticatedUrl 构造）
 * @param fetchImpl - fetch 注入面（默认全局；测试可换 fake）
 * @returns cookie 头值（name=value）
 */
export async function authenticateWebHost(
  url: string,
  fetchImpl: (input: string, init?: { redirect?: 'manual' }) => Promise<{ status: number; headers: { get(name: string): string | null } }> = fetch,
): Promise<string> {
  const response = await fetchImpl(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')
  if (response.status !== 303 || cookie === null) {
    throw new Error(`dsh-forge host: Host 认证交换失败（期望 303 + set-cookie，实得 ${String(response.status)}）`)
  }
  const end = cookie.indexOf(';')
  return end < 0 ? cookie : cookie.slice(0, end)
}

/** 转发时剥除的响应头（母本同款：cookie 归壳所有；其余为 Node fetch 连接层描述）。 */
const WITHHELD_RESPONSE_HEADERS = [
  'set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection',
  'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization',
]

/** Host 不可变缓存头路由（per-process revision——磁盘缓存只积压，母本改 no-store 同因）。 */
const PLUGIN_BUNDLE_PATH = /^\/plugins\//u

/**
 * 转发一项壳页请求到已认证 Host（流式保真 + 取消透传；非本页 origin 拒绝）。
 * @param request - 壳 origin 请求（plugins/…、api/… 等非资产路由）
 * @param host - 已认证 Host URL（目标 origin）
 * @param cookie - authenticateWebHost 换取的认证 cookie
 * @param pageOrigin - 壳页 origin（origin 校验白名单值；子资源无 origin 头放行）
 * @param fetchImpl - fetch 注入面（默认全局；须支持 body 流与 duplex half）
 */
export async function forwardToHost(
  request: Request,
  host: string,
  cookie: string,
  pageOrigin: string,
  fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  const source = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== pageOrigin) return new Response(null, { status: 403 })
  const target = new URL(host)
  target.pathname = source.pathname
  target.search = source.search
  const headers = new Headers(request.headers)
  for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name)
  headers.set('cookie', cookie)
  const response = await fetchImpl(target, {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    ...(request.body === null ? {} : { duplex: 'half' }),
    redirect: 'manual',
  })
  const outgoing = new Headers(response.headers)
  for (const name of WITHHELD_RESPONSE_HEADERS) outgoing.delete(name)
  if (PLUGIN_BUNDLE_PATH.test(source.pathname)) outgoing.set('cache-control', 'no-store')
  return new Response(response.body, { status: response.status, headers: outgoing })
}

/** Host 就绪面（未就绪 = 503，母本同语义） */
export interface HostRef {
  (): { url: string; cookie: string } | undefined
}

/**
 * 组装壳 scheme 处理器：资产路径（/、/index.html、/assets/、/forge-client.js、/brand/——
 * vite public 物化位（fix-38 书海背景静态双资产））服务 dist；其余全量转发 Host。
 * 失败归 e2e/控制台面（母本 reportFatal 的薄化——宿主日志承接）。
 */
export function createShellProtocolHandler(options: {
  distRoot: string
  host: HostRef
  pageOrigin?: string
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>
}): (request: Request) => Promise<Response> {
  const pageOrigin = options.pageOrigin ?? SHELL_PAGE_ORIGIN
  const fetchImpl = options.fetchImpl ?? fetch
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const isAsset = url.pathname === '/' || url.pathname === '/index.html'
      || url.pathname.startsWith('/assets/') || url.pathname === '/forge-client.js'
      || url.pathname.startsWith('/brand/')
    if (isAsset) return serveShellDocument(request, options.distRoot)
    const host = options.host()
    if (host === undefined) return new Response(null, { status: 503 })
    return forwardToHost(request, host.url, host.cookie, pageOrigin, fetchImpl)
  }
}

/**
 * 注册壳 scheme 特权面（须 app ready 前调用；standard/secure/fetch/stream——母本同集）。
 */
export function registerShellScheme(protocol: ProtocolLike): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: SHELL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
  }])
}

/**
 * ws 升级请求改写（纯函数）：仅当请求目标是 Host origin 时，页 origin → Host origin、
 * 附认证 cookie、sec-fetch-site 改 same-origin（Host 的 CSRF/信任栏仅认同源握手）。
 * 目标判定按请求 URL（Electron 44/Chromium 152 的 onBeforeSendHeaders 不携带 Host 头——
 * 4.2 e2e 实证：ws 握手 headers 无 Host，按头过滤恒不中致 401 重连环；URL 的 authority
 * 由网络栈落到真实 Host 头，比对等价且不缺席）。
 */
export function rewriteStreamHeaders(
  requestHeaders: Record<string, string>,
  requestUrl: string,
  host: { url: string; cookie: string },
): { requestHeaders: Record<string, string> } | undefined {
  const target = new URL(host.url)
  let source: URL
  try {
    source = new URL(requestUrl)
  } catch {
    return undefined
  }
  if (source.host !== target.host) return undefined
  return {
    requestHeaders: {
      ...requestHeaders,
      origin: target.origin,
      cookie: host.cookie,
      'sec-fetch-site': 'same-origin',
    },
  }
}

/**
 * 安装 ws 改写栏（ws://127.0.0.1/* 全量拦——目标 origin 过滤在改写函数内按请求 URL 完成）。
 * @param webRequest - session webRequest 面
 * @param host - Host 就绪面
 * @param ownsWebContentsId - 限定主窗口（他页 ws 不改写、不取消——callback({}) 同语义）
 */
export function installShellStreamRewrite(
  webRequest: WebRequestLike,
  host: HostRef,
  ownsWebContentsId: (webContentsId?: number) => boolean,
): void {
  webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    const ready = host()
    if (ready === undefined || !ownsWebContentsId(details.webContentsId)) {
      callback({})
      return
    }
    callback(rewriteStreamHeaders(details.requestHeaders, details.url, ready) ?? {})
  })
}
