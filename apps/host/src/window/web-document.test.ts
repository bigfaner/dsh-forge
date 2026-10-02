// window/web-document 单测 —— 壳文档服务母本语义 pin（静态服务 + 就绪门注入 + 转发 + ws 改写）。
// fetch 面注入 fake；文件面用临时目录真实读写。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authenticateWebHost, createShellProtocolHandler, forwardToHost, installShellStreamRewrite,
  registerShellScheme, resolveWebDistDir, rewriteStreamHeaders, serveShellDocument,
  SHELL_ENTRY_URL, SHELL_PAGE_ORIGIN, SHELL_SCHEME, type WebRequestLike,
} from './web-document.js'

const distDirs: string[] = []
afterEach(() => {
  for (const dir of distDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function distOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-forge-webdoc-'))
  distDirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    const target = join(dir, name)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

describe('serveShellDocument（静态资产 + 就绪门注入）', () => {
  it('index 注入就绪门脚本（??= 幂等形态）；资产按扩展名出 MIME', async () => {
    const root = distOf({
      'index.html': '<!doctype html><html><head><title>t</title></head><body><div id="root"></div></body></html>',
      'assets/app.js': 'console.log(1)',
    })
    const index = await serveShellDocument(new Request('dsh-forge://app/'), root)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toContain('text/html')
    expect(await index.text()).toContain('globalThis.__DSH_BOOT_READY__')
    const asset = await serveShellDocument(new Request('dsh-forge://app/assets/app.js'), root)
    expect(asset.headers.get('content-type')).toContain('text/javascript')
    expect(await asset.text()).toBe('console.log(1)')
  })
  it('缺席 404；逃逸 403；非 GET/HEAD 405', async () => {
    const root = distOf({ 'index.html': '<html><head></head><body></body></html>' })
    expect((await serveShellDocument(new Request('dsh-forge://app/missing.js'), root)).status).toBe(404)
    expect((await serveShellDocument(new Request(`dsh-forge://app/..%2F..%2Fetc%2Fpasswd`), root)).status).toBe(403)
    expect((await serveShellDocument(new Request('dsh-forge://app/', { method: 'POST' }), root)).status).toBe(405)
  })
})

describe('authenticateWebHost（认证 URL → cookie）', () => {
  it('303 + set-cookie 取首段（属性段剥除）', async () => {
    const cookie = await authenticateWebHost('http://127.0.0.1:19500/?token=v1.x', async () => ({
      status: 303,
      headers: { get: () => 'dsh-session=v1.abc; Path=/; Max-Age=2592000' },
    }))
    expect(cookie).toBe('dsh-session=v1.abc')
  })
  it('非 303 / 无 cookie 即拒（fail-loud）', async () => {
    await expect(authenticateWebHost('http://h/', async () => ({ status: 200, headers: { get: () => null } })))
      .rejects.toThrow(/认证交换失败/)
  })
})

describe('forwardToHost（转发：origin 校验 + 头改写 + 流保真）', () => {
  const hostUrl = 'http://127.0.0.1:19500/'
  it('跨页 origin 403；本页 origin/无 origin 放行', async () => {
    const calls: string[] = []
    const fake = async (input: string | URL): Promise<Response> => {
      calls.push(String(input))
      return new Response('{}', { headers: { 'content-type': 'application/json' } })
    }
    const evil = await forwardToHost(new Request('dsh-forge://app/api/x', { headers: { origin: 'https://evil' } }), hostUrl, 'c', SHELL_PAGE_ORIGIN, fake)
    expect(evil.status).toBe(403)
    expect(calls).toHaveLength(0)
    const ok = await forwardToHost(new Request('dsh-forge://app/api/session/list', { method: 'POST', headers: { origin: SHELL_PAGE_ORIGIN } }), hostUrl, 'k=v', SHELL_PAGE_ORIGIN, fake)
    expect(ok.status).toBe(200)
    expect(calls[0]).toContain('http://127.0.0.1:19500/api/session/list')
  })
  it('改写请求头（host/origin/cookie/sec-fetch-site 剥除，cookie 重设）并扣留连接层响应头', async () => {
    let seen = { url: '', headers: null as unknown as Headers }
    const fake = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      seen = { url: String(input), headers: init?.headers as Headers }
      return new Response('[]', {
        headers: { 'content-type': 'application/json', 'set-cookie': 'leak=y', 'content-length': '2', 'transfer-encoding': 'chunked' },
      })
    }
    const res = await forwardToHost(
      new Request('dsh-forge://app/plugins/x/client.js?rev=r1', { headers: { origin: SHELL_PAGE_ORIGIN, cookie: 'page=y' } }),
      hostUrl, 'host-cookie=1', SHELL_PAGE_ORIGIN, fake,
    )
    expect(seen.headers.get('cookie')).toBe('host-cookie=1')
    expect(seen.headers.get('origin')).toBeNull()
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('cache-control')).toBe('no-store') // /plugins/ → no-store（母本同因）
    expect(seen.url).toBe('http://127.0.0.1:19500/plugins/x/client.js?rev=r1')
  })
})

describe('rewriteStreamHeaders / installShellStreamRewrite（ws 握手改写）', () => {
  it('目标 = Host origin（按请求 URL——Chromium ws 握手无 Host 头）时改写 origin/cookie/sec-fetch-site；他 origin 不动', () => {
    const rewritten = rewriteStreamHeaders(
      { Origin: SHELL_PAGE_ORIGIN },
      'ws://127.0.0.1:19500/api/remote.mux',
      { url: 'http://127.0.0.1:19500/', cookie: 'k=v' },
    )
    expect(rewritten?.requestHeaders.origin).toBe('http://127.0.0.1:19500')
    expect(rewritten?.requestHeaders.cookie).toBe('k=v')
    expect(rewritten?.requestHeaders['sec-fetch-site']).toBe('same-origin')
    // 非 Host origin（他端口）与非法 URL 不动
    expect(
      rewriteStreamHeaders({}, 'ws://127.0.0.1:19999/api/remote.mux', { url: 'http://127.0.0.1:19500/', cookie: 'k=v' }),
    ).toBeUndefined()
    expect(rewriteStreamHeaders({}, 'not a url', { url: 'http://127.0.0.1:19500/', cookie: 'k=v' })).toBeUndefined()
  })
  it('安装器：Host 未就绪或非主窗口 → 空改写透传', () => {
    const seen: unknown[] = []
    const webRequest: WebRequestLike = {
      onBeforeSendHeaders(_filter, listener) {
        listener({ url: 'ws://127.0.0.1:19500/api/remote.mux', webContentsId: 7, requestHeaders: { Origin: SHELL_PAGE_ORIGIN } }, (change) => {
          seen.push(change)
        })
      },
    }
    installShellStreamRewrite(webRequest, () => undefined, () => true)
    expect(seen[0]).toEqual({})
    installShellStreamRewrite(webRequest, () => ({ url: 'http://127.0.0.1:19500/', cookie: 'k=v' }), () => false)
    expect(seen[1]).toEqual({})
    installShellStreamRewrite(webRequest, () => ({ url: 'http://127.0.0.1:19500/', cookie: 'k=v' }), () => true)
    expect((seen[2] as { requestHeaders: Record<string, string> }).requestHeaders.cookie).toBe('k=v')
  })
})

describe('scheme 注册与处理器路由', () => {
  it('registerShellScheme 特权集 = 母本同集（standard/secure/fetch/cors/stream）', () => {
    const schemes: { scheme: string; privileges: Record<string, boolean> }[] = []
    registerShellScheme({
      registerSchemesAsPrivileged: (list) => {
        schemes.push(...list)
      },
      handle: () => {},
    })
    expect(schemes).toEqual([{
      scheme: SHELL_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true },
    }])
    expect(SHELL_ENTRY_URL).toBe('dsh-forge://app/')
  })
  it('资产路径服务 dist；其余转发；Host 未就绪 503', async () => {
    const root = distOf({ 'index.html': '<html><head></head><body></body></html>', 'forge-client.js': '/*c*/' })
    const handler = createShellProtocolHandler({ distRoot: root, host: () => undefined })
    expect((await handler(new Request(SHELL_ENTRY_URL))).status).toBe(200)
    expect((await handler(new Request('dsh-forge://app/forge-client.js'))).status).toBe(200)
    expect((await handler(new Request('dsh-forge://app/api/session/list'))).status).toBe(503)
    const forwarded = createShellProtocolHandler({
      distRoot: root,
      host: () => ({ url: 'http://127.0.0.1:19500/', cookie: 'k=v' }),
      fetchImpl: async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
    })
    expect((await forwarded(new Request('dsh-forge://app/api/session/list', { method: 'POST', headers: { origin: SHELL_PAGE_ORIGIN } }))).status).toBe(200)
  })
})

describe('resolveWebDistDir', () => {
  it('默认 = hostRoot 上溯 apps/web/dist；DSH_FORGE_WEB_DIST 覆盖（相对锚 hostRoot）', () => {
    const def = resolveWebDistDir({})
    expect(def.replace(/\\/g, '/')).toMatch(/apps[/]web[/]dist$/)
    expect(resolveWebDistDir({ DSH_FORGE_WEB_DIST: 'x/y' }).replace(/\\/g, '/')).toMatch(/apps[/]host[/]x[/]y$/)
  })

  it('4.1 打包形态：DSH_FORGE_RESOURCES_DIR 置位 → {resources}/web-dist（extraResources 物化位）', () => {
    // 绝对 resources 根直取（win32 join 拼接绝对路径会产出废路径——实测坑）
    const abs = resolveWebDistDir({ DSH_FORGE_RESOURCES_DIR: 'X:/install/resources' })
    expect(abs.replace(/\\/g, '/')).toBe('X:/install/resources/web-dist')
    // 相对锚 hostRoot（与 profile/paths resolveFromHost 同语义）
    expect(resolveWebDistDir({ DSH_FORGE_RESOURCES_DIR: 'rel/res' }).replace(/\\/g, '/')).toMatch(
      /apps[/]host[/]rel[/]res[/]web-dist$/,
    )
  })

  it('DSH_FORGE_WEB_DIST 显式覆盖仍最优先（调试口径，压过 resources 默认）', () => {
    const over = resolveWebDistDir({ DSH_FORGE_WEB_DIST: 'x/y', DSH_FORGE_RESOURCES_DIR: 'X:/res' })
    expect(over.replace(/\\/g, '/')).toMatch(/apps[/]host[/]x[/]y$/)
  })
})
