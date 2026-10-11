// G1 pin ⑮：WCO 壳补偿面 + 侧栏结构锚（M3.1 左栏三残差 D1–D3 消费的上游事实面）。
// apps/web/src/styles/wco.css 的显式偏离块依赖以下 0.2.0-rc.2 上游事实（profile 组合
// 物化锚——apps/host/profile.dev 实装）：
//   - ui-layout：WCO 补偿 CSS（sidebarCol 去竖线 / centerCol 左上圆角）+ 收起轨宽 0
//     （collapsedWidth 三元）+ frame 直标 data-sidebar-collapsed + overlayLayer
//     [data-shell-overlay] + DocumentTitle 零 DOM（frame 首元素子恒 = sidebarCol）；
//   - ui-sidebar：WCO 收起隐藏三区（panelList/regionArea/footArea display:none）+
//     toggle/newSession 固定标题栏双 28px 圆钮 + wide 三元（WCO 收起即 collapsed 态；
//     toggle fixed 规则官方非收起态限定——展开态同在固定面，D40 对冲目标，⑮-3 pin）；
//   - ui-renderer：SlotOutlet 每洞包裹 [data-slot] 锚（display:contents——偏离块侧栏根
//     /regionArea 结构锚的来源）；
//   - ui-plugin-manager / ui-settings-general：panellist 插件行与 sidebar.settings 设置行
//     官方占用（D2 轨内 ≥4 官方图标的承载面）。
// 末组反向 pin 本仓偏离块本体（wco.css 规则面 + 记账注释——D1/D2/D31/D32/D39/D40/D41
// 验收的机械面）。
// hash 类名（pI_x6G_/hHd-Xa_）为构建期产物不逐字 pin——一律取 hash 无关的结构事实或
// hash 容差正则；任一事实漂移（升级窗口）→ 本 pin 红 → wco.css 偏离块须显式对账。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { expectPinnedVersion, norm, readUpstream, ROOT } from './pins.js'

const LAYOUT = 'lib/client.js'

describe('pin ⑮-1 版本锚（偏离块消费的上游三包）', () => {
  it.each([
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-sidebar',
    '@deepseek-ai/dsh-client-ui-renderer',
  ])('%s（profile 锚）= 精确 pin 版本', (name) => {
    expectPinnedVersion('profile', name)
  })
})

describe('pin ⑮-2 ui-layout WCO 补偿面（D1 对冲目标 + frame 结构事实）', () => {
  const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-layout', LAYOUT)

  it('WCO 补偿 CSS：sidebarCol 去竖线 + centerCol 左上圆角（hash 容差——属性序列为锚）', () => {
    expect(client).toMatch(/\[data-windows-titlebar\][^{]*_sidebarCol\{border-right:none\}/)
    expect(client).toMatch(
      /\[data-windows-titlebar\][^{]*_centerCol\{[^}]*border-radius:var\(--dsh-windows-content-radius\) 0 0 0/,
    )
  })

  it('WCO 收起轨宽 0（collapsedWidth 三元——D2 覆层轨的动因：grid 内联 0 轨不可 CSS 对冲）', () => {
    expect(client).toMatch(
      /collapsedWidth = darwin \|\| document\.documentElement\.hasAttribute\("data-windows-titlebar"\) \? 0 : 56/,
    )
  })

  it('frame 直标 data-sidebar-collapsed + overlayLayer [data-shell-overlay]（偏离块状态/结构锚）', () => {
    expect(client).toContain('"data-sidebar-collapsed": sidebarCollapsed || void 0')
    expect(client).toContain('"data-shell-overlay": true')
  })

  it('frame 带本体 = :before 拖拽条（app-region:drag）；:after 官方未占用（D31 带内段落点——升级窗口占用即红）', () => {
    expect(client).toMatch(/\[data-windows-titlebar\][^{]*_frame:before\{[^}]*-webkit-app-region:drag/)
    expect(client).not.toContain('_frame:after')
  })

  it('frame 首元素子恒为 sidebarCol：DocumentTitle 零 DOM（children 首位 + 仅 document.title 副作用）', () => {
    const titleAt = client.indexOf('(DocumentTitle')
    const sidebarAt = client.indexOf('AppFrame_module_css_default.sidebarCol')
    expect(titleAt).toBeGreaterThanOrEqual(0)
    expect(sidebarAt).toBeGreaterThan(titleAt)
    const fn = client.slice(client.indexOf('function DocumentTitle'), client.indexOf('function DocumentTitle') + 800)
    expect(fn).toContain('document.title')
    expect(norm(fn)).toMatch(/useEffect[\s\S]*return null/)
  })

  it('D39 前提面：WCO frame 背景 = sidebar-fill + centerCol 显式 bg-base + rightbarCol 零独立背景规则（darwin-only bg-base——产品对冲动因）', () => {
    expect(client).toMatch(
      /\[data-windows-titlebar\][^{]*_frame\{[^}]*background:var\(--dsw-specific-sidebar-fill\)/,
    )
    expect(client).toMatch(
      /\[data-windows-titlebar\][^{]*_centerCol\{[^}]*background:var\(--dsw-alias-bg-base\)/,
    )
    expect(client).toMatch(/\[data-platform=darwin\][^{]*_rightbarCol\{background:var\(--dsw-alias-bg-base\)\}/)
    expect(client).not.toMatch(/\[data-windows-titlebar\][^{]*_rightbarCol\{/)
  })
})

describe('pin ⑮-3 ui-sidebar WCO 收起形态（D2 对冲目标）', () => {
  const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar', LAYOUT)

  it('WCO 收起即 collapsed 态（wide 三元——rail 内容按收起态渲染）', () => {
    expect(client).toContain('const wide = windowsTitlebar ? !collapsed : !collapsed || !settled')
  })

  it('WCO 收起隐藏三区（panelList/regionArea/footArea display:none——un-hide 对冲目标）', () => {
    expect(client).toMatch(/\[data-windows-titlebar\][^{]*_collapsed[^{]*\{display:none\}/)
  })

  it('WCO 收起 toggle/newSession 固定标题栏 28px 圆钮（双圆钮退役对冲目标）', () => {
    expect(client).toMatch(/\[data-windows-titlebar\][^{]*_collapsed[^{]*_newSession\{[^}]*position:fixed/)
    expect(client).toMatch(/\[data-windows-titlebar\][^{]*_collapsed[^{]*_toggle,[^{]*_collapsed[^{]*_newSession\{[^}]*width:28px/)
  })

  it('D40 对冲目标面：WCO toggle 固定标题栏钮官方非收起态限定（展开态同在固定面——position:fixed/left:12px；D40 退役对象）', () => {
    // 选择器非 collapsed 限定的 fixed toggle 规则（收起态 28px 圆钮规则为 collapsed 限定，
    // 其 `_toggle,` 逗号选择器不构成 `_toggle{`——本正则唯一命中展开态同吃的官方规则）
    expect(client).toMatch(
      /\[data-windows-titlebar\][^{]*_toggle\{[^}]*position:fixed[^}]*left:12px\}/,
    )
  })
})

describe('pin ⑮-4 ui-renderer SlotOutlet 洞锚（偏离块 [data-slot] 结构锚来源）', () => {
  const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-renderer', LAYOUT)

  it('每洞渲染包裹 [data-slot] 锚 div（display:contents——布局零参与、纯可寻址面）', () => {
    expect(client).toContain('"data-slot": slotKey')
    expect(client).toContain('display: "contents"')
  })
})

describe('pin ⑮-5 官方行占用面（D2 轨内官方图标承载——插件行/设置行）', () => {
  it('ui-plugin-manager 占用 sidebar.panellist（插件行官方 PanelRow）', () => {
    const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-plugin-manager', LAYOUT)
    expect(client).toContain('sidebar.panellist')
  })

  it('ui-settings-general 占用 sidebar.settings（设置行官方件）', () => {
    const client = readUpstream('profile', '@deepseek-ai/dsh-client-ui-settings-general', LAYOUT)
    expect(client).toContain('sidebar.settings')
  })
})

describe('pin ⑮-6 本仓偏离块（wco.css——D1/D2/D31/D32 规则面 + 记账注释的反向 pin）', () => {
  const css = readFileSync(join(ROOT, 'apps/web/src/styles/wco.css'), 'utf8')

  /** 规则体提取（选择器含 needle 的声明块——压空白） */
  function ruleOf(escapedNeedle: string): string {
    const re = new RegExp(`(^|})[^{}]*${escapedNeedle}[^{}]*\\{([^}]*)\\}`, 'm')
    return (css.match(re)?.[2] ?? '').replace(/\s+/g, ' ').trim()
  }

  it('D1 竖线：sidebarCol（frame 首子结构锚）border-right 1px 官方 border 令牌', () => {
    expect(ruleOf('div:has\\(> \\[data-shell-overlay\\]\\) > div:first-child')).toContain(
      'border-right: 1px solid var(--dsw-alias-border-l3)',
    )
  })

  it('D1 圆角移除：centerCol（frame 次子）radius 清零 + corner-shape 复位', () => {
    const body = ruleOf('div:has\\(> \\[data-shell-overlay\\]\\) > div:nth-child\\(2\\)')
    expect(body).toContain('border-radius: 0')
    expect(body).toContain('corner-shape: auto')
  })

  it('D31 竖线带内段：frame::after 补齐标题栏带内 1px（上延至 y=0、与带下段同列同色）+ 收起态轨右缘变体', () => {
    const band = ruleOf('div:has\\(> \\[data-shell-overlay\\]\\)::after')
    expect(band).toContain("content: ''")
    expect(band).toContain('position: absolute')
    expect(band).toContain('top: 0')
    expect(band).toContain('height: var(--dsh-windows-titlebar-height)')
    expect(band).toContain('left: calc(var(--dsh-windows-sidebar-width) - 1px)')
    expect(band).toContain('width: 1px')
    expect(band).toContain('background: var(--dsw-alias-border-l3)')
    expect(band).toContain('-webkit-app-region: drag')
    // 收起态变体 = 属性限定 frame 锚（(0,3,3) 恒压展开态结构锚 (0,2,3)——2026-10-11
    // D41 落地时特异性对账修复：弱式选择器被展开态盖死、线脱窗至 -1px）
    expect(ruleOf("div\\[data-sidebar-collapsed='true'\\]:has\\(> \\[data-shell-overlay\\]\\)::after")).toContain(
      'left: 58px',
    )
  })

  it('D2 覆层轨：收起态 sidebarCol 绝对定位 59px + 顶起于标题栏带；centerCol margin 让位', () => {
    const rail = ruleOf("\\[data-sidebar-collapsed='true'\\] > div:first-child")
    expect(rail).toContain('position: absolute')
    expect(rail).toContain('width: 59px')
    expect(rail).toContain('top: var(--dsh-windows-titlebar-height)')
    const center = ruleOf("\\[data-sidebar-collapsed='true'\\] > div:nth-child\\(2\\)")
    expect(center).toContain('margin-left: 59px')
    // D2 残差修复（2026-10-11「收起左侧栏后左分隔线右侧白屏」）：轨转 absolute 脱 grid
    // 流 → 官方零显式列位下列自动重排（centerCol 挤入 0px 侧栏轨 w=0、rightbarCol 顶入
    // 中列全宽）——双列显式钉回原生列位（e2e 几何取证实锚）
    expect(center).toContain('grid-column: 2')
    expect(ruleOf("\\[data-sidebar-collapsed='true'\\] > div:nth-child\\(3\\)")).toContain('grid-column: 3')
  })

  it('D2 三区 un-hide + 双圆钮退役 + 侧栏根 padding 复位（官方收起态刻度）', () => {
    expect(ruleOf("\\[data-slot='sidebar'\\] > div > nav")).toContain('display: flex')
    expect(ruleOf("div:has\\(> \\[data-slot='sidebar.workspaces'\\]\\)")).toContain('display: flex')
    expect(ruleOf("\\[data-slot='sidebar'\\] > div > div:last-child")).toContain('display: flex')
    const rootPad = (css.match(/\[data-slot='sidebar'\] > div\s*\{([^}]*)\}/m) ?? [])[1] ?? ''
    expect(rootPad.replace(/\s+/g, ' ')).toContain('padding: 18px 10px 6px')
    const toggle = ruleOf('div:first-child > button')
    expect(toggle).toContain('position: static')
    expect(toggle).toContain('width: 36px')
    const newSession = ruleOf("\\[data-slot='sidebar'\\] > div > button")
    expect(newSession).toContain('position: static')
    expect(newSession).toContain('margin: 0 0 12px')
  })

  it('D40 展开态收起钮：static 落 logoRow brand 右侧 + 36px iconButton 家族刻度（2026-10-10 裁决——展开态标题栏 28px 圆钮退役）', () => {
    // 展开态规则（无 [data-sidebar-collapsed] 限定）。选择器以 button:last-child 锚 toggle：
    // 展开态 logoRow 双直接子 button（brand 钮 = 首子、toggle = 末子——上游 wide 非 darwin
    // 分支，见下方 DOM 序断言），无 last-child 限定会连 brand 钮一并 36px 化（结构事实 pin）。
    // 收起态选择器中间隔 [data-sidebar-collapsed='true'] 锚，`html[data-windows-titlebar]
    // [data-slot` 邻接串不撞——本正则唯一命中 D40 规则。
    const body = (
      css.match(/html\[data-windows-titlebar\] \[data-slot='sidebar'\] > div > div:first-child > button:last-child \{([^}]*)\}/)?.[1] ??
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
    expect(body, 'D40 规则在场（wco.css D2 块后专节）').not.toBe('')
    expect(body).toContain('position: static')
    expect(body).toContain('top: auto')
    expect(body).toContain('left: auto')
    expect(body).toContain('z-index: auto')
    expect(body).toContain('width: 36px')
    expect(body).toContain('height: 36px')
    expect(body).toContain('border-radius: var(--dsw-radius-md)')
    expect(body).toContain('corner-shape: auto')
    expect(body).not.toContain('order:') // 列序走 DOM 结构序——零 CSS order 调序（记账）
    // 列序 = brand 之后（DOM 序执行期核验）：上游 logoRow children = [brand(wide), toggle]
    // ——toggle 非 darwin 分支尾随渲染（children 末位），brand.mark 槽位在 logoRow JSX 段内
    const sidebarClient = readUpstream('profile', '@deepseek-ai/dsh-client-ui-sidebar', LAYOUT)
    const rowAt = sidebarClient.indexOf('SidebarRoot_module_css_default.logoRow')
    const toggleTailAt = sidebarClient.indexOf('!darwinDesktop && toggle]')
    expect(rowAt, 'logoRow JSX 在场').toBeGreaterThan(0)
    expect(toggleTailAt, 'toggle 为 logoRow children 末位').toBeGreaterThan(rowAt)
    expect(sidebarClient.slice(rowAt, toggleTailAt), 'brand 先于 toggle（列序 = brand 右侧落点）').toContain(
      'sidebar.brand.mark',
    )
    // 展开态 logoRow 双 button 结构事实（last-child 锚的动因——brand 钮首子不受 D40 波及）
    expect(sidebarClient).toMatch(/_module_css_default\.brand, \w+_module_css_default\.wide\)/)
  })

  it('D32 光标缓解两表面：handle col-resize 形 + 消息文字钢笔形（热点 = 笔尖 5 19 + 关键字降级链——裁决 #24 随形更替）', () => {
    const handle = ruleOf('> div\\[data-side\\]')
    expect(handle).toContain('cursor: url("data:image/svg+xml,')
    expect(handle).toContain('12 12, col-resize')
    const beam = ruleOf('html\\[data-windows-titlebar\\] \\[data-conversation-content\\]')
    expect(beam).toContain('cursor: url("data:image/svg+xml,')
    expect(beam).toContain('5 19, text')
  })

  it('D32 暗主题两套：浅形深描边（body[data-ds-dark-theme] scope——brand.css 先例）', () => {
    const darkHandle = ruleOf(
      'body\\[data-ds-dark-theme\\] div:has\\(> \\[data-shell-overlay\\]\\) > div\\[data-side\\]',
    )
    expect(darkHandle).toContain('cursor: url("data:image/svg+xml,')
    expect(darkHandle).toContain('12 12, col-resize')
    const darkBeam = ruleOf('body\\[data-ds-dark-theme\\] \\[data-conversation-content\\]')
    expect(darkBeam).toContain('cursor: url("data:image/svg+xml,')
    expect(darkBeam).toContain('5 19, text')
  })

  it('D32 记账：恰四条色图光标声明（两表面 × 亮/暗）——全带热点 + 降级链 + data-URI 色值行 dsw-raw 注记', () => {
    const cursorLines = css.split('\n').filter((line) => line.includes('cursor: url('))
    expect(cursorLines).toHaveLength(4)
    for (const line of cursorLines) {
      expect(line).toContain('dsw-raw')
      expect(line).toContain('%23') // data-URI 内色值 URL 编码——无裸 # 十六进制（lint-tokens 裸色面零触发）
      expect(line).toMatch(/ (?:12 12, col-resize|5 19, text);/) // 热点坐标（handle = 箭头中心 / 钢笔 = 笔尖，裁决 #24）+ 关键字降级链（无图环境回退 OS 语义）
    }
  })

  it('D39 dock 余缝同色：rightbarCol（frame 第三结构子）bg-base 对冲——上/下/右余缝与中区同色', () => {
    const body = ruleOf('div:has\\(> \\[data-shell-overlay\\]\\) > div:nth-child\\(3\\)')
    expect(body).toContain('background: var(--dsw-alias-bg-base)')
  })

  it('D41 标题带中区段白漆：frame::before 硬截止渐变（侧栏右缘以右 bg-base，截止点随拖宽联动）+ 收起态 59px 轨外缘变体', () => {
    const band = ruleOf('div:has\\(> \\[data-shell-overlay\\]\\)::before')
    expect(band).toContain('background: linear-gradient(90deg,')
    // 双令牌硬截止：侧栏段 sidebar-fill、中区/右栏段 bg-base——亮/暗随令牌联动
    expect(band).toContain('var(--dsw-specific-sidebar-fill) var(--dsh-windows-sidebar-width)')
    expect(band).toContain('var(--dsw-alias-bg-base) var(--dsh-windows-sidebar-width)')
    expect(band).toContain('var(--dsw-alias-bg-base) 100%')
    expect(band).not.toContain('-webkit-app-region') // 拖拽面官方自持——本规则仅换漆（drag 行为零波及）
    // 收起态变体 = 属性限定 frame 锚（(0,3,3) 恒压展开态 (0,2,3)——弱式选择器会被盖死）
    const collapsed = ruleOf("div\\[data-sidebar-collapsed='true'\\]:has\\(> \\[data-shell-overlay\\]\\)::before")
    expect(collapsed).toContain('var(--dsw-specific-sidebar-fill) 59px') /* dsw-raw 刻度断言（D2 轨宽） */
    expect(collapsed).toContain('var(--dsw-alias-bg-base) 59px')
    expect(collapsed).not.toContain('var(--dsh-windows-sidebar-width)') // 收起 cols.sidebar=0——var 不可用
  })

  it('非 WCO 零波及：全部规则锚定 html[data-windows-titlebar]（D2 收起态另锚 data-sidebar-collapsed）', () => {
    const rules = css.match(/^[^\s@][^{]*\{/gm) ?? []
    expect(rules.length).toBeGreaterThan(0)
    for (const selector of rules) {
      expect(selector).toContain('[data-windows-titlebar]')
    }
    const collapsed = css.match(/html\[data-windows-titlebar\] \[data-sidebar-collapsed='true'\][^{]*\{/g) ?? []
    // 覆层轨/让位+列位钉定/右栏列位钉定/根 padding/logoRow/toggle/newSession/三区 un-hide
    // （末组三选择器共体）；D31/D41 收起态变体走属性限定 frame 锚
    // （div[data-sidebar-collapsed]——特异性对账，不落本弱式选择器族）
    expect(collapsed.length).toBeGreaterThanOrEqual(7)
  })

  it('记账注释在场（AC5——官方补偿面显式偏离记账标记 + dsw-raw 结构刻度注记）', () => {
    expect(css).toContain('官方补偿面显式偏离记账')
    expect(css).toContain('D1')
    expect(css).toContain('D2')
    expect(css).toContain('D31')
    expect(css).toContain('D32')
    expect(css).toContain('D39')
    expect(css).toContain('D40')
    expect(css).toContain('D41')
    // 令牌 lint 口径（lint-tokens TOKEN_PROPS 面）：padding/margin/gap/radius 裸 px 行
    // 均须随行 dsw-raw 注记（59/18/10/6/36/12px 结构刻度族——width/height/z-index 非令牌面）
    const pxLines = css
      .split('\n')
      .filter((line) => /(padding|margin|gap|border-radius)[a-z-]*\s*:/.test(line) && /\d+(?:\.\d+)?px/.test(line))
    expect(pxLines.length).toBeGreaterThan(0)
    for (const line of pxLines) {
      expect(line).toContain('dsw-raw')
    }
  })
})
