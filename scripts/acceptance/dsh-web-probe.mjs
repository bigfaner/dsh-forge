#!/usr/bin/env node
// 官方 dsh web 装配探针(ui-plugin-foundation 任务 3): 驱动第三方视角的
// 真实官方 web(loopback), 采集装配/撞键行为的可观察证据 —— console /
// pageerror / __DSH_BOOT__ roster / 插件 DOM 标记 / 会话内面板渲染。
//
// 与 live-ui-probe.mjs 的区别: 那里经 dsh-forge 壳(_electron); 这里是官方
// `dsh web`(npm launcher), 不经本仓任何壳代码 —— 可移植性证据的官方侧。
//
// 用法:
//   node scripts/acceptance/dsh-web-probe.mjs --url "http://127.0.0.1:PORT/?token=..." [--label S0] [--open-session] [--click-panel]
//   --click-panel  面板渲染后点击其按钮, 验证 点击 → store 更新 → 重渲染 活链路
//                  (任务 6: 两侧环境交互一致性证据的官方 web 侧)。
// 退出码: 0 = 探针完成(无论发现什么); 1 = 启动/等待 UI 失败。
import { chromium } from '@playwright/test'

const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const url = argOf('url')
const label = argOf('label') ?? 'probe'
const openSession = args.includes('--open-session')
const clickPanel = args.includes('--click-panel')
if (!url) {
  console.error('usage: dsh-web-probe.mjs --url <url> [--label S] [--open-session]')
  process.exit(1)
}

const events = []
let t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1)
const log = (kind, detail) => {
  events.push({ t: stamp(), kind, ...detail })
  console.log(`[${stamp()}s] ${kind} ${JSON.stringify(detail)}`)
}

// Windows 环境避免下载 headless shell: 优先系统 Edge/Chrome 频道, 回退默认。
async function launchBrowser() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel })
    } catch { /* try the next channel */ }
  }
  return chromium.launch()
}
const browser = await launchBrowser()
const page = await browser.newPage()
try {
  await runProbe()
} finally {
  await browser.close().catch(() => {})
}

async function runProbe() {
  page.on('console', (msg) => {
    const text = msg.text()
    if (text.startsWith('Download the React DevTools')) return
    log('console', { level: msg.type(), text: text.slice(0, 2000) })
  })
  page.on('pageerror', (error) => log('pageerror', { text: String(error).slice(0, 2000) }))
  page.on('requestfailed', (request) => log('requestfailed', {
    url: request.url().slice(0, 300),
    failure: request.failure()?.errorText ?? '',
  }))
  page.on('response', (response) => {
    if (response.status() >= 400) log('http>=400', { url: response.url().slice(0, 300), status: response.status() })
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  // 官方 web UI 挂载门槛: 等待应用根出现。
  await page.waitForSelector('#root, [data-dsh-app], body > div', { timeout: 60_000 })
  await page.waitForTimeout(3000)

  // --- boot graph roster(两锚证据: 插件条目出现在宿主推送的注册图) ------
  const boot = await page.evaluate(() => {
    const boot = globalThis.__DSH_BOOT__
    if (boot === undefined) return undefined
    const ids = [...(boot.entries ?? [])].map((e) => e?.id ?? e?.name).filter(Boolean)
    return { rev: boot.rev, count: ids.length, ids }
  })
  log('boot-graph', { boot })

  // --- 插件标记(空会话首屏) ------------------------------------------------
  log('plugin-markers', { phase: 'initial', markers: await pluginMarkers(page) })

  if (openSession) {
    // --- 打开一个历史会话(有完成 assistant 轮次的), assistant-actions 只在
    // 完成的 assistant 轮次尾渲染 —— 与任务 2 壳侧观察口径一致 -------------------
    const opened = await openHistoricalSession(page)
    log('open-session', { opened })
    await page.waitForTimeout(4000)
    log('plugin-markers', { phase: 'after-session-open', markers: await pluginMarkers(page) })
    // 面板文本(撞键观察: 谁在渲染、内容是什么)
    const panelTexts = await page.evaluate(() =>
      [...document.querySelectorAll('[data-dsh-forge-plugin]')].map((el) => ({
        plugin: el.getAttribute('data-dsh-forge-plugin'),
        text: (el.textContent ?? '').slice(0, 300),
      })))
    log('panel-texts', { panels: panelTexts })

    if (clickPanel) {
      // 任务 6 交互腿: 点击面板按钮 → store 席位更新 → 绑定选择器重渲染。
      const panel = page.locator('[data-dsh-forge-plugin]').first()
      if (await panel.count() === 0) {
        log('panel-click', { label, status: 'FAIL', reason: 'no panel to click' })
      } else {
        const textBefore = ((await panel.textContent()) ?? '').trim()
        await panel.locator('button').first().click()
        await page.waitForTimeout(800)
        const textAfter = ((await panel.textContent()) ?? '').trim()
        log('panel-click', {
          label,
          status: textAfter !== textBefore ? 'interaction-PASS' : 'interaction-FAIL',
          textBefore, textAfter,
        })
      }
    }
  }

  console.log(`\n=== dsh-web probe [${label}] complete: ${events.filter((e) => e.kind === 'pageerror').length} pageerrors, ${events.filter((e) => e.kind === 'console' && e.level === 'error').length} console-errors ===`)
}

async function pluginMarkers(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-dsh-forge-plugin]')].map((el) => el.getAttribute('data-dsh-forge-plugin')))
}

/** 打开左侧会话列表里的第一个历史会话; 返回点击目标描述。 */
async function openHistoricalSession(page) {
  return page.evaluate(() => {
    // dsh web 会话侧栏: 会话行 = div[class*="sessionRow"]; 第一行常是
    // 「新会话」占位(新建), 跳过它取第一个真实历史会话。
    const rows = [...document.querySelectorAll('div[class*="sessionRow"]')]
    const target = rows.find((row) => {
      const text = (row.textContent ?? '').trim()
      return text !== '' && !text.startsWith('新会话') && !text.startsWith('New')
    }) ?? rows[1]
    if (target === undefined) return { clicked: false, reason: 'no session row found', rows: rows.length }
    ;(target).click()
    // 只报行数与点击事实 —— 会话标题属用户隐私, 不进证据。
    return { clicked: true, tag: target.tagName, rows: rows.length }
  })
}
