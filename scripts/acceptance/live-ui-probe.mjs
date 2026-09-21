#!/usr/bin/env node
// 真实例 UI 探针(诊断 + 验收基座): 以默认 profile 启动真实壳 —— 真 vendored
// host 子进程 + 真 web dist —— 即用户实际所见状态, 驱动真实 UI 并采集渲染侧
// 证据: console / pageerror / 网络失败 / WS 生命周期 / DOM 快照。
//
// 与 e2e fixture 栈(apps/desktop/e2e/helpers/fixture-app.ts)的区别: 那里是
// 假宿主 HTTP 服务器, 证明不了真 RPC/UI 行为; 本探针跑在真实链路上。
//
// 用法(须在 apps/desktop 下运行, 让 _electron 解析到 electron 二进制):
//   cd apps/desktop
//   node ../../scripts/acceptance/live-ui-probe.mjs [--click-new-session]
// 退出码: 0 = 探针完成(无论发现什么); 1 = 启动/等待 UI 失败。
import { _electron } from '@playwright/test'

const clickNewSession = process.argv.includes('--click-new-session')
const repoRoot = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const mainPath = `${repoRoot}/apps/desktop/dist/main.cjs`

/** One console/network/ws event, tagged so the report can slice pre/post click. */
const events = []
let t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1)
const log = (kind, detail) => { events.push({ t: stamp(), kind, ...detail }); console.log(`[${stamp()}s] ${kind} ${JSON.stringify(detail)}`) }

// 冷启动计时口径(ui-plugin-foundation 任务 2): 主进程拉起(_electron.launch
// 调用点)→ firstWindow / dsh-app 文档就绪 / UI ready 三个锚点, 归档用
// launch→ui-ready(与探针既有的 UI 挂载门槛同口径)。
const launchStart = Date.now()
const coldStart = { firstWindowMs: undefined, urlMs: undefined, uiReadyMs: undefined }

const app = await _electron.launch({ args: [mainPath] })
try {
  await runProbe(app)
} finally {
  await app.close().catch(() => {})
}

async function runProbe(app) {
const page = await app.firstWindow()
coldStart.firstWindowMs = Date.now() - launchStart
log('cold-start', { anchor: 'firstWindow', ms: coldStart.firstWindowMs })

page.on('console', msg => {
  const text = msg.text()
  // Chromium 内部噪音过滤
  if (text.startsWith('Download the React DevTools')) return
  log('console', { level: msg.type(), text })
})
page.on('pageerror', error => log('pageerror', { text: String(error) }))
page.on('requestfailed', request => log('requestfailed', {
  url: request.url(), method: request.method(),
  failure: request.failure()?.errorText ?? '',
}))
page.on('response', response => {
  if (response.status() >= 400) log('http>=400', { url: response.url(), status: response.status() })
})
page.on('websocket', ws => {
  log('ws-open', { url: ws.url() })
  ws.on('close', () => log('ws-close', { url: ws.url() }))
  ws.on('socketerror', error => log('ws-error', { url: ws.url(), error: String(error) }))
})

// --- 等待真实 UI 挂载(宿主启动 ~4-8s + 水合) --------------------------------
await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 })
coldStart.urlMs = Date.now() - launchStart
log('url', { href: page.url() })
const newSessionButton = page.getByRole('button', { name: '新建会话' })
  .or(page.getByRole('button', { name: 'New Session' }))
await newSessionButton.first().waitFor({ state: 'visible', timeout: 60_000 })
coldStart.uiReadyMs = Date.now() - launchStart
log('ui-ready', { button: '新会话 visible', coldStartMs: coldStart.uiReadyMs })

/** DOM + 传输层快照: 全部按钮的可访问名 + 内省 __DSH_TRANSPORT__。 */
async function snapshot(label) {
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '').filter(s => s !== ''))
  const transport = await page.evaluate(() => {
    const t = globalThis.__DSH_TRANSPORT__
    return t === undefined ? undefined : { ownsHost: t.ownsHost, streamBaseUrl: t.streamBaseUrl }
  })
  const bodyText = await page.evaluate(() => document.body.innerText)
  // 产品配置驱动装配的插件面板标记(任务 2 增删腿的行为证据)。
  const pluginPanels = await page.evaluate(() =>
    [...document.querySelectorAll('[data-dsh-forge-plugin]')].map(el => el.getAttribute('data-dsh-forge-plugin')))
  log('snapshot', {
    label,
    transport,
    buttons,
    pluginPanels,
    bodyExcerpt: bodyText.replaceAll('\n', ' | ').slice(0, 600),
  })
}

await snapshot('boot')

if (clickNewSession) {
  t0 = Date.now()
  events.length = 0
  await newSessionButton.first().click()
  log('action', { click: '新会话' })
  await page.waitForTimeout(3_000)
  await snapshot('after-new-session-click')
}

console.log(`\n=== cold-start: launch→firstWindow=${String(coldStart.firstWindowMs)}ms launch→url=${String(coldStart.urlMs)}ms launch→ui-ready=${String(coldStart.uiReadyMs)}ms ===`)
console.log('\n=== probe complete ===')
}
