/* M3.1 D32 走查素材 · 文字面钢笔形光标资产预览（裁决 #24——任务 1.21 形更替）
 * 资产直读 apps/web/src/styles/wco.css 的四条 data-URI SVG（零拷贝——预览即出货原件）：
 *   ① 分隔线 handle（col-resize 形）亮/暗——1.17 交付面零波及回归对照；
 *   ② 会话消息文字（钢笔形——本地 Windows 墨迹钢笔风格：斜向笔身 + 笔尖，热点 = 笔尖 5 19）亮/暗。
 * 口径（诚实声明，沿袭 1.17 [D32-cursor.md](./D32-cursor.md)）：OS 硬件光标不进 Chromium 截图面
 * （光标平面在页面合成之外）——本素材 = 资产在亮/暗底上的放大对照 + 表面 mock（实测观感归
 * SC-8 实机走查，见 D32-cursor-pen.md「实机走查清单」）。playwright + 本仓 node_modules；
 * chromium 优先 ms-playwright 固定路径，回退系统 Chrome/Edge。零断言——只产出 PNG 走查素材。
 * 复现：node capture-d32-pen-cursor.cjs（产物落 ./shots/d32-pen-cursor-assets-{light,dark}.png）。 */
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/@playwright/test'))
const EXE_CANDIDATES = (() => {
  const pw = 'C:/Users/panda/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'
  const ok = fs.existsSync(pw) && fs.existsSync(pw.replace('chrome.exe', 'icudtl.dat'))
  return ok ? [pw] : ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter((p) => fs.existsSync(p))
})()
const WCO = path.resolve(__dirname, '../../../../../apps/web/src/styles/wco.css')
const OUT = path.join(__dirname, 'shots')

const css = fs.readFileSync(WCO, 'utf8')
const uris = [...css.matchAll(/cursor: url\("data:image\/svg\+xml,([^"]+)"\)/g)].map((m) => 'data:image/svg+xml,' + m[1])
if (uris.length !== 4) throw new Error('wco.css D32 色图光标应恰四条（两表面 × 亮/暗），实得 ' + uris.length)
const [handleLight, handleDark, penLight, penDark] = uris

const page = (mode, handleUri, penUri, bg, card, border, text) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0}
  .ctx{width:1040px;box-sizing:border-box;padding:26px 30px;font:13px/1.6 'Microsoft YaHei',sans-serif;background:${bg};color:${text}}
  h2{margin:0 0 4px;font-size:16px}
  .note{margin:0 0 20px;font-size:12px;opacity:.72}
  .row{display:flex;gap:24px;align-items:stretch;margin-bottom:18px}
  .card{box-sizing:border-box;border:1px solid ${border};border-radius:8px;background:${card};padding:14px 18px 12px}
  .cap{font-size:11px;opacity:.72;margin-top:8px}
  .asset{display:flex;align-items:flex-end;gap:16px}
  .asset img{display:block}
  .sw24{width:24px;height:24px}
  .sw96{width:96px;height:96px}
  .mock{position:relative;margin-top:2px}
  .divider{display:flex;width:236px;height:64px;border:1px solid ${border};border-radius:4px;overflow:hidden}
  .divider .pane{flex:1;background:${card}}
  .divider .seam{width:1px;background:${border}}
  .textline{width:236px;padding:10px 12px;border:1px solid ${border};border-radius:4px;background:${card};font-size:13px}
</style></head><body><section class="ctx" id="${mode}">
  <h2>D32 色图光标资产预览（${mode === 'light' ? '亮主题：深形浅描边' : '暗主题：浅形深描边'}）</h2>
  <p class="note">资产 = apps/web/src/styles/wco.css D32 块 data-URI SVG 原件（24px 基准直读，无重绘）。OS 硬件光标不进截图面——实机观感归 SC-8 走查。</p>
  <div class="row">
    <div class="card">
      <div class="asset"><img class="sw24" src="${handleUri}"><img class="sw96" src="${handleUri}"></div>
      <div class="cap">① 分隔线 handle · col-resize 形（1.17 交付零波及——24px 原尺寸 + 4× 放大）</div>
    </div>
    <div class="card">
      <div class="mock divider"><div class="pane"></div><div class="seam"></div><div class="pane"></div></div>
      <div class="cap">① 表面 mock：左栏│中区分隔线（悬停出 handle 光标·热点 = 箭头中心 12 12）</div>
    </div>
  </div>
  <div class="row">
    <div class="card">
      <div class="asset"><img class="sw24" src="${penUri}"><img class="sw96" src="${penUri}"></div>
      <div class="cap">② 会话消息文字 · 钢笔形（裁决 #24——斜向笔身 + 笔尖，24px 原尺寸 + 4× 放大）</div>
    </div>
    <div class="card">
      <div class="mock textline">鼠标悬浮到消息文字上——光标于此面显示为钢笔（笔尖即插入点，热点 5 19），带描边亮暗可辨。</div>
      <div class="cap">② 表面 mock：会话消息文字行（悬停出钢笔光标·笔尖即插入位）</div>
    </div>
  </div>
</section></body></html>`

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let b = null
  for (const exe of EXE_CANDIDATES) { try { b = await chromium.launch({ executablePath: exe }); break } catch (_) {} }
  if (!b) b = await chromium.launch({})
  const p = await (await b.newContext({ viewport: { width: 1100, height: 480 }, deviceScaleFactor: 2 })).newPage()
  for (const [name, html] of [
    ['d32-pen-cursor-assets-light.png', page('light', handleLight, penLight, '#f4f4f2', '#ffffff', '#d9d9d6', '#1f1f1f')],
    ['d32-pen-cursor-assets-dark.png', page('dark', handleDark, penDark, '#1f2023', '#2a2b30', '#3a3b40', '#f8f8f8')],
  ]) {
    await p.setContent(html)
    await p.waitForTimeout(120)
    await p.locator('section.ctx').screenshot({ path: path.join(OUT, name) })
    console.log('shot -> shots/' + name)
  }
  await b.close()
})()
