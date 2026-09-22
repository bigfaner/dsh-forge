#!/usr/bin/env node
// 真实例 UI 探针(诊断 + 验收基座): 以默认 profile 启动真实壳 —— 真 vendored
// host 子进程 + 真 web dist —— 即用户实际所见状态, 驱动真实 UI 并采集渲染侧
// 证据: console / pageerror / 网络失败 / WS 生命周期 / DOM 快照。
//
// 与 e2e fixture 栈(apps/desktop/e2e/helpers/fixture-app.ts)的区别: 那里是
// 假宿主 HTTP 服务器, 证明不了真 RPC/UI 行为; 本探针跑在真实链路上。
//
// ui-plugin-foundation 任务 6 扩展 —— 壳内装配证据采集(SC1 第二环境 + 打包腿):
//   --plugin-leg          打开一个历史会话, 采集 boot roster 中的产品插件条目、
//                         [data-dsh-forge-plugin] 面板 DOM 文本, 对面板元素截图
//                         (只截插件面板本身 —— 会话内容属用户数据, 不进证据),
//                         点击面板按钮验证 点击 → store 更新 → 重渲染 活链路。
//   --label <name>        证据标签(截图文件名与摘要前缀)。
//   --executable <path>   探测打包产物 exe(dist:dir 的 win-unpacked/dsh-forge.exe)
//                         而非 apps/desktop/dist/main.cjs。
//   --offline-proxy       给应用挂 --proxy-server=http://127.0.0.1:9(死代理):
//                         一切外部 HTTP 失败 = 离线模拟; dsh-app:// 自定义协议
//                         不走代理, 壳内链路应照常装配(离线自足 NFR 实证)。
//   --artifacts-dir <dir> 截图归档目录(默认 docs/features/ui-plugin-foundation/artifacts)。
//
// 用法(须在 apps/desktop 下运行, 让 _electron 解析到 electron 二进制):
//   cd apps/desktop
//   node ../../scripts/acceptance/live-ui-probe.mjs [--click-new-session] [--plugin-leg]
// 退出码: 0 = 探针完成(无论发现什么); 1 = 启动/等待 UI 失败。
import { _electron } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const clickNewSession = args.includes('--click-new-session')
const pluginLeg = args.includes('--plugin-leg')
const label = argOf('label') ?? 'probe'
const executable = argOf('executable')
const offlineProxy = args.includes('--offline-proxy')
const artifactsDir = argOf('artifacts-dir')
  ?? join(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'docs', 'features', 'ui-plugin-foundation', 'artifacts')

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

const launchOptions = executable === undefined
  ? { args: [mainPath] }
  : { executablePath: executable, args: [] }
if (offlineProxy) launchOptions.args.push('--proxy-server=http://127.0.0.1:9')
const app = await _electron.launch(launchOptions)
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
async function snapshot(labelText) {
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
    label: labelText,
    transport,
    buttons,
    pluginPanels,
    bodyExcerpt: bodyText.replaceAll('\n', ' | ').slice(0, 600),
  })
}

// --- boot roster(装配证据: 产品插件进入宿主推送的注册图) ----------------------
const bootRoster = await page.evaluate(() => {
  const boot = globalThis.__DSH_BOOT__
  if (boot === undefined) return undefined
  const ids = [...(boot.entries ?? [])].map((e) => e?.id ?? e?.name).filter(Boolean)
  return { rev: boot.rev, count: ids.length, productPlugins: ids.filter((id) => String(id).startsWith('@dsh-forge/')) }
})
log('boot-roster', { boot: bootRoster })

await snapshot('boot')

// --- 任务 6 插件腿: 历史会话 → 面板渲染 → 截图 → 点击交互 ----------------------
if (pluginLeg) {
  t0 = Date.now()
  events.length = 0
  // 会话列表水合晚于 ui-ready(WS 就绪后加载), 轮询等待真实历史会话行出现。
  let opened = { clicked: false, reason: 'session rows never hydrated', rows: 0 }
  for (let attempt = 0; attempt < 30 && !opened.clicked; attempt++) {
    opened = await page.evaluate(() => {
      // 与官方 dsh web 同款侧栏启发式(上游同一 SPA): 会话行 div[class*="sessionRow"],
      // 第一行常是「新会话」占位, 跳过取第一个真实历史会话; 只报点击事实, 不报标题。
      const rows = [...document.querySelectorAll('div[class*="sessionRow"]')]
      const target = rows.find((row) => {
        const text = (row.textContent ?? '').trim()
        return text !== '' && !text.startsWith('新会话') && !text.startsWith('New')
      }) ?? rows[1]
      if (target === undefined || rows.length === 0) return { clicked: false, reason: 'no session row yet', rows: rows.length }
      ;(target).click()
      return { clicked: true, rows: rows.length }
    })
    if (!opened.clicked) await page.waitForTimeout(1000)
  }
  log('open-session', { opened })
  await page.waitForTimeout(4000)

  const panel = page.locator('[data-dsh-forge-plugin]').first()
  let panelSeen = false
  try {
    await panel.waitFor({ state: 'visible', timeout: 15_000 })
    panelSeen = true
  } catch { /* logged below as leg FAIL evidence */ }
  if (!panelSeen) {
    log('plugin-leg', { label, status: 'FAIL', reason: 'no [data-dsh-forge-plugin] panel rendered on the opened session turn tail' })
  } else {
    const marker = await panel.getAttribute('data-dsh-forge-plugin')
    const textBefore = (await panel.textContent() ?? '').trim()
    log('plugin-leg', { label, status: 'panel-visible', marker, panelText: textBefore })

    // 截图只取面板元素本身(隐私口径: 会话内容不进证据)。
    mkdirSync(artifactsDir, { recursive: true })
    const shotBefore = join(artifactsDir, `${label}-panel-before-click.png`)
    await panel.screenshot({ path: shotBefore })
    log('screenshot', { file: shotBefore })

    // 点击 → store 席位更新 → 绑定选择器重渲染(活链路, 非静态注入)。
    const button = panel.locator('button').first()
    await button.click()
    await page.waitForTimeout(800)
    const textAfter = (await panel.textContent() ?? '').trim()
    const shotAfter = join(artifactsDir, `${label}-panel-after-click.png`)
    await panel.screenshot({ path: shotAfter })
    const interactionPass = textAfter !== textBefore
    log('plugin-leg', {
      label,
      status: interactionPass ? 'interaction-PASS' : 'interaction-FAIL',
      textBefore, textAfter,
      screenshot: shotAfter,
    })
  }
}

if (clickNewSession) {
  t0 = Date.now()
  events.length = 0
  await newSessionButton.first().click()
  log('action', { click: '新会话' })
  await page.waitForTimeout(3_000)
  await snapshot('after-new-session-click')
}

console.log(`\n=== cold-start: launch→firstWindow=${String(coldStart.firstWindowMs)}ms launch→url=${String(coldStart.urlMs)}ms launch→ui-ready=${String(coldStart.uiReadyMs)}ms ===`)
console.log(`\n=== probe [${label}] complete: ${events.filter((e) => e.kind === 'pageerror').length} pageerrors, ${events.filter((e) => e.kind === 'console' && e.level === 'error').length} console-errors ===`)
}
