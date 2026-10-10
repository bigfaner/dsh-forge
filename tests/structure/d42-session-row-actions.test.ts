// M3.1 D42 结构 pin —— 会话行 hover 动作组 CSS 机械面（任务 dsh-forge-m3.1-ui-alignment/1.29
// ——读文件法 = d36/d38/d44 先例；apps/web 测试面无 node:fs 类型面，CSS pin 归此）。
// 断言面（官方源码核验锚 = dsh-client-ui-sidebar lib/client.js）：
//   1. fading 等价机制：`.fading>*{opacity:0;transition:opacity .15s var(--ds-ease-in-out)}`
//      同款——动作组容器 opacity:0 占位（非悬浮行几何零抖动）+ hover/focus-within 显形 +
//      pointer-events 隐形守卫（隐形钮不截击触点）+ prefers-reduced-motion 收敛（官方纪律）；
//   2. 时间标签让位：官方 Rows `.sessionRow:hover .time{display:none}` 同判——fading 等价
//      改透明度承载（占位保留零抖动，非悬浮时间常驻）；
//   3. iconButton 刻度：官方 ui-sidebar `.iconButton` 逐值同款——28 命中区 / radius-sm /
//      label-secondary / 透明底 / hover interactive-bg-hover。
// 动作集逐位记账（打开钮 / ⋯ 菜单零 RPC 支撑缺席 / 扩展槽缺席）=
// apps/web/src/views/sidebar/ForgeWorkspacePanel.test.tsx D42 组 + SessionRow 文档块。
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../')
const css = readFileSync(join(ROOT, 'apps/web/src/views/sidebar/sidebar.css'), 'utf8')

describe('D42 会话行 hover 动作组（官方 fading 模式 + ui-sidebar iconButton 刻度——CSS pin）', () => {
  it('fading 等价机制：容器 opacity:0 占位（零抖动）+ pointer-events 隐形守卫 + 官方 .15s ease-in-out 过渡', () => {
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
})
