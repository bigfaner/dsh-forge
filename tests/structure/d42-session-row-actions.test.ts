// M3.1 D42/D45 结构 pin —— 会话行 hover 动作组 CSS 机械面（任务 dsh-forge-m3.1-ui-alignment/
// 1.29 + D45 三钮 + D45-② 浮现 overlay——读文件法 = d36/d38/d44 先例；apps/web 测试面无
// node:fs 类型面，CSS pin 归此）。
// 断言面（官方源码核验锚 = dsh-client-ui-sidebar lib/client.js + ui-workspace Rows.module.css）：
//   1. fading 等价机制：`.fading>*{opacity:0;transition:opacity .15s var(--ds-ease-in-out)}`
//      同款——动作组 opacity:0 + hover/focus-within 显形 + pointer-events 隐形守卫
//      （隐形钮不截击触点）+ prefers-reduced-motion 收敛（官方纪律）；
//   2. 时间标签让位：官方 Rows `.sessionRow:hover .time{display:none}` 同判——fading 等价
//      改透明度承载（占位保留零抖动，非悬浮时间常驻）；
//   3. iconButton 刻度：官方 ui-sidebar `.iconButton` 逐值同款——28 命中区 / radius-sm /
//      label-secondary / 透明底 / hover interactive-bg-hover；
//   4. D45 置顶静止标记：置顶行行尾常显小图钉（官方 rest-state pin marker 同位）——
//      hover 三钮显形时 display:none 让位（marker↔button 同位互换）；
//   5. D45 归档行弱化：官方 archived row 同判——标题降 tertiary 档；
//   6. D45-② 浮现 overlay（用户再追加裁决「按钮浮现在会话上方，不挤占会话的行空间」）：
//      行 relative 锚 + 动作组 absolute（脱离布局流零占位）+ 背板 = 行悬浮合成色
//      （surface[--dsw-specific-sidebar-fill] + tint[interactive-bg-hover] 双层——遮文字
//      穿透且与行面无缝）+ :has 聚焦行底同步。
// 动作集逐位记账（⋯ 菜单/归档/置顶三钮 + 菜单四项）=
// apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx D42/D45 组 + SessionRow 文档块。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const css = readFileSync(join(ROOT, 'apps/web/src/views/sidebar/sidebar.css'), 'utf8')

describe('D42 会话行 hover 动作组（官方 fading 模式 + ui-sidebar iconButton 刻度——CSS pin）', () => {
  it('fading 等价机制：动作组 opacity:0（隐形）+ pointer-events 隐形守卫 + 官方 .15s ease-in-out 过渡', () => {
    // 官方 ui-sidebar `.fading>*{opacity:0;transition:opacity .15s var(--ds-ease-in-out)}` 同款
    expect(css).toMatch(/\.dswf-sidebar-session-actions \{[^}]*opacity: 0;/)
    expect(css).toMatch(/\.dswf-sidebar-session-actions \{[^}]*pointer-events: none;/)
    expect(css).toContain('transition: opacity 0.15s var(--ds-ease-in-out)')
  })

  it('显形缝 = hover（AC 口径）+ focus-within（键盘可达——官方 tab close 同缝）；显形恢复指针命中', () => {
    expect(css).toContain('.dswf-sidebar-session:hover .dswf-sidebar-session-actions')
    expect(css).toContain('.dswf-sidebar-session-actions:focus-within')
    expect(css).toMatch(
      /\.dswf-sidebar-session:hover \.dswf-sidebar-session-actions,[^}]*pointer-events: auto;/,
    )
  })

  it('官方 prefers-reduced-motion 纪律（ui-sidebar `.fading>*` transition:none 同款）', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.dswf-sidebar-session-actions/,
    )
  })

  it('时间标签让位（官方 .sessionRow:hover .time{display:none} 同判——透明度承载、占位保留不走 display:none）', () => {
    expect(css).toMatch(/\.dswf-sidebar-session:hover \.dswf-sidebar-session-time \{[^}]*opacity: 0;/)
    expect(css).not.toMatch(
      /\.dswf-sidebar-session:hover \.dswf-sidebar-session-time \{[^}]*display: none;/,
    )
  })

  it('iconButton 刻度（官方 ui-sidebar .iconButton 源码同款）：28 命中区 / radius-sm / label-secondary / 透明底 / hover interactive-bg-hover', () => {
    expect(css).toMatch(/\.dswf-sidebar-session-action \{[^}]*width: 28px;/)
    expect(css).toMatch(/\.dswf-sidebar-session-action \{[^}]*height: 28px;/)
    expect(css).toMatch(/\.dswf-sidebar-session-action \{[^}]*border-radius: var\(--dsw-radius-sm\);/)
    expect(css).toMatch(/\.dswf-sidebar-session-action \{[^}]*color: var\(--dsw-alias-label-secondary\);/)
    expect(css).toMatch(
      /\.dswf-sidebar-session-action:hover \{[^}]*background: var\(--dsw-alias-interactive-bg-hover\);/,
    )
  })

  it('D45 置顶静止标记：行尾常显（官方 rest-state pin marker 同位——tertiary 弱化）+ hover/聚焦让位（display:none，marker↔button 同位互换）', () => {
    expect(css).toMatch(/\.dswf-sidebar-session-pinmark \{[^}]*color: var\(--dsw-alias-label-tertiary\);/)
    // hover 让位（官方 marker 位 = 置顶钮位——三钮显形时标记隐藏）
    expect(css).toMatch(/\.dswf-sidebar-session:hover \.dswf-sidebar-session-pinmark \{[^}]*display: none;/)
    // 键盘聚焦同判（动作组 focus-within —— 显形钮与标记不并存）
    expect(css).toMatch(
      /\.dswf-sidebar-session-actions:focus-within ~ \.dswf-sidebar-session-pinmark \{[^}]*display: none;/,
    )
  })

  it('D45 归档行弱化（官方 archived row 同判——前导状态点槽空白在渲染层）：标题降 tertiary 档', () => {
    expect(css).toMatch(
      /\.dswf-sidebar-session\[data-archived\] \.dswf-sidebar-session-title \{[^}]*color: var\(--dsw-alias-label-tertiary\);/,
    )
  })

  it('D45-② 浮现 overlay：行 relative 锚 + 动作组 absolute（脱离布局流零占位——不挤占行空间）', () => {
    expect(css).toMatch(/\.dswf-sidebar-session \{[^}]*position: relative;/)
    expect(css).toMatch(/\.dswf-sidebar-session-actions \{[^}]*position: absolute;/)
    // 布局流面退役记账：动作组不再持有 flex 槽位/margin（in-flow 占位形态清零）
    const rule = css.match(/\.dswf-sidebar-session-actions \{[^}]*\}/)![0]
    expect(rule).not.toContain('margin-left')
    expect(rule).not.toContain('flex: none')
  })

  it('D45-② 背板合成 = 行悬浮观感逐像素复刻：surface（官方 sidebar-fill 底漆）+ 行悬浮 tint 双层叠加', () => {
    const rule = css.match(/\.dswf-sidebar-session-actions \{[^}]*\}/)![0]
    expect(rule).toContain('linear-gradient(')
    expect(rule).toContain('var(--dsw-alias-interactive-bg-hover)')
    expect(rule).toContain('var(--dsw-specific-sidebar-fill)')
  })

  it('D45-② 键盘聚焦行底同步（:has 面——钮条聚焦显形时行面同悬浮 tint，合成恒一致）', () => {
    expect(css).toMatch(
      /\.dswf-sidebar-session:has\(\.dswf-sidebar-session-actions:focus-within\) \{[^}]*background: var\(--dsw-alias-interactive-bg-hover\);/,
    )
  })
})
