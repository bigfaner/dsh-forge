// mobile-ui connection 探针（R9 证伪续作——一次性验证脚本，证据落 .forge/docs/probes/）
// 钉死三件事：
//   ① /remote/ index 经 renderIndex 后携带官方注入行（__ModuleLoader__ facade + __DSH_BOOT__ 图）
//   ② 手机页上下文内可取用官方 client-connection 模块（ModuleLoader require 面）
//   ③ installConnection（缺省 web transport，同 origin fetch + cookie）→ session.list 单呼绿
// 零真实模型调用（只读 RPC）——不需要凭据门。mux/$events 留给探针 v2。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { closeApp, launchHost, ROOT } from '../support/launch.js'
import { writeDogfoodOverlay } from '../support/dogfood.js'

const EVIDENCE_DIR = join(ROOT, '.forge', 'docs', 'probes', 'mobile-connection-probe')

test('mobile-ui connection 探针：/remote/ 注入行 → client 模块取用 → session.list 单呼', async () => {
  test.setTimeout(300_000)
  const userData = mkdtempOf('dsh-forge-e2e-conn-probe-ud-')
  const overlay = writeDogfoodOverlay()
  writeFileSync(join(userData, 'forge-settings.json'), JSON.stringify({ remoteApproval: { enabled: true } }), 'utf8')
  let app: ElectronApplication | undefined
  const evidence: Record<string, unknown> = {}
  try {
    ;({ app } = await launchHost({
      userData,
      overlay,
      env: { DSH_FORGE_TEST_BRIDGE: '1' },
      timeouts: { firstWindow: 120_000, bootReady: 180_000, loaderLive: 120_000, workbenchVisible: 120_000 },
    }))
    const pairUrl = await app!
      .context()
      .pages()[0]!
      .evaluate(async () => {
        const forge = (globalThis as { dshForge?: { getBootManifest(): Promise<{ remotePairUrl?: string }> } }).dshForge
        if (forge === undefined) throw new Error('dshForge preload 面缺席')
        return (await forge.getBootManifest()).remotePairUrl
      })
    expect(pairUrl, 'boot manifest 携官方配对地址').toBeTruthy()

    // ── 配对链（record.spec 同径：302 → 302 → 303；官方 dsh-auth cookie 落 jar） ──
    // 回环 origin：/pair authority 尊重 Host 头（fix-16）——jar 以 loopback Host 走配对链
    // 铸 loopback authority 的官方 cookie；chromium 页面导航同 origin（宿主进程树内
    // chromium 对 LAN IP 直连可能被环境代理/防火墙劫持——jar 通而导航挂起实证）。
    const pairUrlObj = new URL(pairUrl as string)
    const base = `http://127.0.0.1:${pairUrlObj.port}`
    evidence.pairOrigin = base
    const loopPairUrl = `${base}/pair?token=${pairUrlObj.searchParams.get('token') ?? ''}`
    const jar = app!.context().request
    // 每跳 location 强制回环：redirect target 可能按 LAN origin 构造（authenticatedUrl 绑
    // authority）——mint 的 cookie authority 与后续请求 Host 必须一致（isAuthenticated 对
    // payload.authority 严格比对）。
    const toLoopback = (url: string): string => {
      const u = new URL(url, base)
      return `${base}${u.pathname}${u.search}`
    }
    const pairRes = await jar.get(loopPairUrl, { maxRedirects: 0 })
    expect(pairRes.status(), '/pair 校验通过 = 302').toBe(302)
    const exchangeRes = await jar.get(toLoopback(pairRes.headers()['location'] as string), { maxRedirects: 0 })
    expect(exchangeRes.status()).toBe(302)
    const authRes = await jar.get(toLoopback(exchangeRes.headers()['location'] as string), { maxRedirects: 0 })
    expect(authRes.status(), 'BrowserAuth 兑现 = 303').toBe(303)
    // cookie 手工入域：Playwright APIRequestContext 对 303 终态的 set-cookie 不落共享 jar
    // （jarCookies 仅 dswf 实证）——捕获 set-cookie 后 addCookies + 显式 Cookie 头双落。
    const setCookie = authRes.headers()['set-cookie'] ?? ''
    const m = /^([^=;\s]+)=([^;]*)/.exec(setCookie)
    expect(m, '303 携 dsh-auth set-cookie').toBeTruthy()
    const authCookie = { name: m![1]!, value: m![2]!, url: `${base}/` }
    await app!.context().addCookies([authCookie])
    const cookieHeader = `${authCookie.name}=${authCookie.value}`
    const jarHeaders = { cookie: cookieHeader }
    evidence.loopbackCookieDiag = {
      authSetCookie: setCookie.replace(/=[^;]{6}[^;]*/, '=***'),
      cookieName: authCookie.name,
    }
    console.log('[probe-diag]', JSON.stringify(evidence.loopbackCookieDiag))
    const rootWithCookie = await jar.get(`${base}/`, { headers: jarHeaders, maxRedirects: 0 })
    console.log('[probe-diag] root-with-cookie:', rootWithCookie.status())

    // ── ① /remote/ index 注入行 ──
    const remoteRes = await jar.get(`${base}/remote/`, { headers: jarHeaders })
    expect(remoteRes.status(), '/remote/ 经配对 cookie 可达').toBe(200)
    const html = await remoteRes.text()
    const injectedRows: Record<string, unknown> = {
      moduleLoaderFacade: html.includes('__ModuleLoader__'),
      bootGraph: html.includes('__DSH_BOOT__'),
      scriptTags: (html.match(/<script[^>]*src=/g) ?? []).length,
      comboUrls: (html.match(/plugins\/\?\?[^"']+/g) ?? []).slice(0, 5),
    }
    evidence.injectedRows = injectedRows
    expect(injectedRows.moduleLoaderFacade, 'renderIndex 注入 ModuleLoader facade').toBe(true)
    expect(injectedRows.bootGraph, 'renderIndex 注入 __DSH_BOOT__ 图').toBe(true)

    // ── ②③ 手机页上下文：模块取用 + installConnection + session.list 单呼 ──
    // （Electron context.newPage 不受支持；firstWindow 句柄不跟随跨 origin 导航——
    //   正道 = electronApp.evaluate 开新 BrowserWindow（390×844 手机视口），window 事件接页）
    const windowReady = app!.waitForEvent('window')
    await app!.evaluate(({ BrowserWindow }, url) => {
      const win = new BrowserWindow({ show: false, width: 390, height: 844 })
      void win.loadURL(url)
    }, `${base}/remote/`)
    const page = await windowReady
    const netLog: string[] = []
    page.on('request', (r) => netLog.push(`→ ${r.method()} ${r.url()}`))
    page.on('response', (r) => netLog.push(`← ${r.status()} ${r.url()}`))
    page.on('requestfailed', (r) => netLog.push(`✗ ${r.failure()?.errorText ?? 'failed'} ${r.url()}`))
    page.on('framenavigated', (f) => netLog.push(`⇄ nav ${f.url()}`))
    page.on('console', (msg) => netLog.push(`[console:${msg.type()}] ${msg.text().slice(0, 200)}`))
    page.on('pageerror', (err) => netLog.push(`[pageerror] ${String(err).slice(0, 200)}`))
    evidence.netLog = netLog
    // （loadURL 已随窗口启动——不再 goto 重复导航；load 事件可能因子资源长尾不触发，
    //   以 ModuleLoader facade 就绪为页面可用门，超时即打印网络日志取证）
    await page
      .waitForFunction(() => (globalThis as Record<string, unknown>)['__ModuleLoader__'] !== undefined, undefined, {
        timeout: 60_000,
      })
      .catch(() => console.log('[probe-diag] ModuleLoader 未就绪 netLog:', JSON.stringify(netLog, null, 1)))
    // 页内路由诊断：组合脚本的 302 弹回与官方根路由实际状态
    try {
      const routeDiag = await page.evaluate(async () => {
        const probe = async (url: string): Promise<unknown> => {
          try {
            const res = await fetch(url, { redirect: 'manual' })
            return { status: res.status, type: res.type, location: res.headers.get('location')?.slice(0, 60) }
          } catch (e) {
            return { error: String(e).slice(0, 120) }
          }
        }
        return {
          mountedCombo: await probe('/remote/plugins/??@deepseek-ai/dsh-client-modules/client.js'),
          rootCombo: await probe('/plugins/??@deepseek-ai/dsh-client-modules/client.js'),
          apiUnclaimedPost: await probe('/api/zzz-unclaimed'),
          sessionListGet: await probe('/api/session/list'),
          url: location.href,
          readyState: document.readyState,
          facadeType: typeof (globalThis as Record<string, unknown>)['__ModuleLoader__'],
          scripts: Array.from(document.querySelectorAll('script[src]')).map((s) =>
            (s as HTMLScriptElement).getAttribute('src')?.slice(0, 80),
          ),
        }
      })
    console.log('[probe-diag] routeDiag:', JSON.stringify(routeDiag))
      evidence.routeDiag = routeDiag
    } catch (e) {
      console.log('[probe-diag] routeDiag 失败（页面上下文不在场）:', String(e).slice(0, 150))
    }
    // node 侧组合路由直查（绕开 chromium 事件面）：302 后官方 /plugins 是否可达
    try {
      const comboRes = await jar.get(
        `${base}/plugins/??@deepseek-ai/dsh-client-modules/client.js&rev=ebfdae2e8e2c`,
        { headers: jarHeaders, maxRedirects: 0 },
      )
      const comboText = await comboRes.text()
      console.log(
        '[probe-diag] comboViaNode:',
        JSON.stringify({ status: comboRes.status(), type: comboRes.headers()['content-type'], head: comboText.slice(0, 80) }),
      )
    } catch (e) {
      console.log('[probe-diag] comboViaNode 失败:', String(e).slice(0, 120))
    }
    // node 侧 POST 判别：官方信封形状（client-request / server-response）
    const envelope = (method: string, payload: unknown): string =>
      JSON.stringify({ type: 'client-request', rpcId: `probe-${Math.random().toString(36).slice(2, 8)}`, method, payload })
    for (const [path, body] of [
      ['/api/session/list', envelope('session/list', { args: {} })],
      ['/api/commands/list', envelope('commands/list', { args: {} })],
      ['/api/workspaces/list', envelope('workspaces/list', { args: {} })],
    ] as const) {
      try {
        const res = await jar.post(`${base}${path}`, { headers: { ...jarHeaders, 'content-type': 'application/json' }, data: body, maxRedirects: 0 })
        const text = await res.text()
        console.log('[probe-diag] postDiag', path, JSON.stringify({ status: res.status(), body: text.slice(0, 300) }))
      } catch (e) {
        console.log('[probe-diag] postDiag 失败', path, String(e).slice(0, 120))
      }
    }
    await page
      .waitForFunction(() => (globalThis as Record<string, unknown>)['__ModuleLoader__'] !== undefined, undefined, {
        timeout: 60_000,
      })
      .catch(() => undefined)
    const probeResult = await page.evaluate(
      () =>
        new Promise<Record<string, unknown>>((resolve, reject) => {
          const deadline = setTimeout(() => reject(new Error('探针页内链 120s 超时')), 120_000)
          const finish = (r: Record<string, unknown>) => {
            clearTimeout(deadline)
            resolve(r)
          }
          void (async () => {
            const g = globalThis as Record<string, unknown>
            const loader = g['__ModuleLoader__'] as
              | {
                  require?: ((id: string) => unknown) & { async?: (id: string) => Promise<unknown> }
                  create?: () => unknown
                }
              | undefined
            if (loader === undefined) throw new Error('__ModuleLoader__ facade 缺席')
            const out: Record<string, unknown> = { facadeKeys: Object.keys(loader) }
            // 模块取用：pendingQueue factory 直取 → sync/async require 兜底
            let conn: Record<string, unknown> | undefined
            // 应用组合按需加载（boot 只预载不执行）——手动补加载组合脚本：queue 模式下
            // 各包 factory 经 facade.load 入 pendingQueue，随后直取物化（无需 shell boot）。
            const boot = g['__DSH_BOOT__'] as
              | { batches?: Array<{ phase?: string; url?: string }> }
              | undefined
            const combos = (boot?.batches ?? []).filter((b) => b.phase === 'application' && b.url !== undefined)
            out.comboCount = combos.length
            await Promise.all(
              combos.map(
                (b) =>
                  new Promise<void>((resolve, reject) => {
                    const s = document.createElement('script')
                    s.src = b.url as string
                    s.onload = () => resolve()
                    s.onerror = () => reject(new Error(`combo 加载失败: ${String(b.url).slice(0, 80)}`))
                    document.head.appendChild(s)
                  }),
              ),
            )
            const queue = (
              loader as { pendingQueue?: Array<{ id: string; factory: (require: unknown) => unknown }> }
            ).pendingQueue
            const reg = queue?.find((r) => r.id === '@deepseek-ai/dsh-client-connection')
            if (reg !== undefined) {
              const requireStub = (): never => {
                throw new Error('connection client factory requested an external (bundle not self-contained)')
              }
              ;(requireStub as { async?: () => Promise<never> }).async = () => Promise.reject(new Error('no chunks'))
              conn = reg.factory(requireStub) as Record<string, unknown>
              out.requirePath = `queue-factory(queueLen=${queue?.length ?? 0})`
            }
            if (conn === undefined) {
              const req = loader.require as ((id: string) => unknown) & { async?: (id: string) => Promise<unknown> }
              if (req !== undefined) {
                try {
                  conn = req('@deepseek-ai/dsh-client-connection') as Record<string, unknown>
                  out.requirePath = 'sync'
                } catch {
                  conn = (await req.async?.('@deepseek-ai/dsh-client-connection')) as Record<string, unknown>
                  out.requirePath = 'async'
                }
              }
            }
            if (conn === undefined)
              throw new Error(
                `client-connection 模块取用失败（queueIds=${JSON.stringify((queue ?? []).map((r) => r.id).slice(0, 8))}）`,
              )
            out.clientExports = Object.keys(conn as object)
            // installConnection：fake ctx 捕获 handle（client 半只消费 ctx.provide）
            const ctx = {
              provide: (id: string, handle: unknown) => {
                out.providedId = id
                ;(g as { __connHandle?: unknown })['__connHandle'] = handle
              },
            }
            ;(conn as { installConnection: (ctx: unknown, opts?: unknown) => void }).installConnection(ctx)
            const handle = (g as { __connHandle?: Record<string, unknown> })['__connHandle']
            if (handle === undefined) throw new Error('installConnection 未提供 connection handle')
            out.handleKeys = Object.keys(handle)
            // session.list 单呼（官方形状：connection.rpc.call('/api', endpoint, {args}, signal)）
            const rpc = handle['rpc'] as {
              call: (channel: string, endpoint: string, body: unknown, signal: AbortSignal) => Promise<unknown>
            }
            const attempts: Array<{ endpoint?: string; args?: unknown; result?: unknown; error?: string }> = []
            for (const [endpoint, body] of [
              ['session/list', { args: {} }],
            ] as const) {
              try {
                const result = await rpc.call('/api', endpoint, body, new AbortController().signal)
                attempts.push({ endpoint, args: body, result })
                if (result !== undefined && result !== null) break
              } catch (error) {
                attempts.push({ endpoint, args: body, error: String(error).slice(0, 300) })
              }
            }
            out.sessionListAttempts = attempts
            finish(out)
          })().catch((error) => {
            clearTimeout(deadline)
            reject(error instanceof Error ? error : new Error(String(error)))
          })
        }),
    )
    evidence.pageProbe = probeResult

    // 单呼传输面验收：官方信封往返到达（result 在场 = 传输+认领+信封全通；信封内
    // ok:false 属业务/描述符层——_request 上下文归官方 typert client 运行时注入，
    // 手搓 payload 到不了是预期结论，不是传输失败）。
    const attempts = probeResult['sessionListAttempts'] as Array<{ result?: unknown; error?: string }>
    expect(
      attempts.some((a) => a.result !== undefined),
      `session/list 信封往返（attempts=${JSON.stringify(attempts).slice(0, 500)}）`,
    ).toBe(true)

    mkdirSync(EVIDENCE_DIR, { recursive: true })
    writeFileSync(join(EVIDENCE_DIR, 'probe-result.json'), JSON.stringify(evidence, null, 2), 'utf8')
  } finally {
    if (app !== undefined) await closeApp(app)
    await rmDirBestEffort(userData)
  }
})

function mkdtempOf(prefix: string): string {
  // E2E_USER_DATA_ROOT：宿主派生会话内 %TEMP% 对 chromium 锁文件写入被拒——落 workspace 可写路径
  const base = process.env.E2E_USER_DATA_ROOT ?? tmpdir()
  return mkdtempSync(join(base, prefix))
}

async function rmDirBestEffort(dir: string): Promise<void> {
  rmSync(dir, { recursive: true, force: true })
}
