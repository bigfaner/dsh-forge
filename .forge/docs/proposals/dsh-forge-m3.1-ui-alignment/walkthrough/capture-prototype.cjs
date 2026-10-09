/* M3.1 对照走查归档 · 原型目标形态截图（D7–D9、D11 四面 · 亮/暗双主题）
 * 口径与 harness 同 prototype/shots-m31.cjs（playwright + 本仓 node_modules；chromium
 * 优先 ms-playwright 固定路径，回退系统 Chrome/Edge）。零断言——只产出 PNG 走查素材。
 * 复现：node capture-prototype.cjs（产物落 ./shots/，约 8 张）。 */
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/@playwright/test'))
const EXE_CANDIDATES = (() => {
  const pw = 'C:/Users/panda/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'
  const ok = fs.existsSync(pw) && fs.existsSync(pw.replace('chrome.exe', 'icudtl.dat'))
  return ok ? [pw] : ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter((p) => fs.existsSync(p))
})()
const URL = 'file:///' + path.join(__dirname, '..', 'prototype', 'index.html').replace(/\\/g, '/')
const OUT = path.join(__dirname, 'shots')
const errors = []
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name) })

/* 单趟走查动线（对照 README 审阅动线收窄为四面）：
 * 会话(s1 带召回种子) → 知识召回 tab → 新会话 hero 相位(+项目选择弹层·仅亮色趟)
 * → 知识库面板 → 右栏 dock 展开（零页签 = chipless 开始页底板）。 */
async function pass(p, mode, withPickerMenu) {
  // 0) 归位：dock 收起 + 会话视图 + 激活带召回种子的会话（树首行 = s1）
  if ((await p.locator('#rb-wrap.is-collapsed').count()) === 0) {
    await p.locator('#rb-corner-expand').click(); await p.waitForTimeout(250)
  }
  await p.locator('.sess-row').first().click(); await p.waitForTimeout(250)

  // D7 知识召回 tab（knrec-panel：统计头 pill + 分组卡行 + verb 胶囊）
  await p.locator('.conv-tab[data-view="kn"]').click(); await p.waitForTimeout(300)
  await shot(p, `proto-d7-recall-${mode}.png`)

  // D8 hero 相位（问候语靠顶 + 鲸绘书海沉底 + 输入卡浮层 + 项目选择 pill）
  //（新会话钮定位 = #sb-new-btn——rail 内同名 data-act 为隐藏克隆，first() 不可见）
  await p.locator('#sb-new-btn').click(); await p.waitForTimeout(300)
  await shot(p, `proto-d8-hero-${mode}.png`)
  if (withPickerMenu) {
    await p.locator('[data-act="hero-project-menu"]').click(); await p.waitForTimeout(250)
    await shot(p, 'proto-d8-hero-picker-menu.png')
    await p.keyboard.press('Escape'); await p.waitForTimeout(150)
  }
  await p.locator('.sess-row').first().click(); await p.waitForTimeout(250)

  // D9 知识库面板（knview：范围 pill + 检索 + 域轨 + 卡片网格）
  await p.locator('[data-act="open-kb-panel"]').first().click(); await p.waitForTimeout(350)
  await shot(p, `proto-d9-knowledge-${mode}.png`)
  await p.locator('.sess-row').first().click(); await p.waitForTimeout(250) // 退出知识模式

  // D11 dock 开始页（零页签展开 = chipless 开始页底板 rb-start）
  await p.locator('#rb-corner-expand').click(); await p.waitForTimeout(300)
  await shot(p, `proto-d11-dock-start-${mode}.png`)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let b = null
  for (const exe of EXE_CANDIDATES) { try { b = await chromium.launch({ executablePath: exe }); break } catch (_) {} }
  if (!b) b = await chromium.launch({})
  const p = await (await b.newContext({ viewport: { width: 1680, height: 980 } })).newPage()
  p.on('pageerror', (e) => errors.push(String(e)))
  await p.goto(URL)
  await p.waitForTimeout(400)
  await pass(p, 'light', true)
  await p.locator('[data-act="theme-toggle"]').first().click(); await p.waitForTimeout(250)
  await pass(p, 'dark', false)
  console.log('DONE shots -> ' + OUT + (errors.length ? ' PAGEERRORS:\n' + errors.join('\n') : ' (zero page errors)'))
  await b.close()
  process.exit(errors.length ? 1 : 0)
})()
