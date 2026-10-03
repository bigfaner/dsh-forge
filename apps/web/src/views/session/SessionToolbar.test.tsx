// SessionToolbar 单测 —— fix-9 会话面板顶部 toolbar（官方 session.header 行语言官方件组合）。
// 断言锚点 = fix-9 AC：toolbar 在场形态（标题位 + utilities 两钮 + corner 面板钮）、
// 面板钮迁移语义（aria/title 随 dockOpen 翻转——收展同径）、hero 相位让位（标题簇与
// utilities 退场、corner 面板钮独存——官方 blank 相位 corner 常驻语义 + e2e L59 实钮口径）、
// WCO 避让相位（右栏收起 = avoid 标记）。SSR 直渲（react-dom/server，沿 views/session 模式）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionToolbar, type SessionToolbarProps } from './SessionToolbar.js'

const render = (over: Partial<SessionToolbarProps> = {}): string =>
  renderToStaticMarkup(<SessionToolbar dockOpen={false} onToggleDock={() => {}} {...over} />)

describe('SessionToolbar toolbar 在场形态（fix-9 AC1）', () => {
  it('行骨架 + 四座结构：lineage 标题 + actions 空位 + utilities 编辑器钮 + corner 面板钮', () => {
    const markup = render({ title: '部署脚本走查' })
    expect(markup).toContain('data-dswf-session-toolbar')
    expect(markup).toContain('data-dswf-session-title')
    expect(markup).toContain('部署脚本走查')
    expect(markup).toContain('aria-label="会话标题"')
    expect(markup).toContain('dswf-session-actions') // actions 槽位保留（P1 空位）
    expect(markup).toContain('data-dswf-utility="open-in-editor"')
    expect(markup).toContain('data-dswf-utility="panel-toggle"')
    expect(markup).toContain('dswf-workbench-docktoggle') // 迁移钮锚类名保持（e2e L59/L689）
  })

  it('utilities 两钮 = 官方件组合（Button toolbar/sm——variant 工厂样式 + 图标钮无文本）', () => {
    const markup = render()
    // 官方 Button 本体类 + toolbar/sm 形态由官方件自持（零自绘平行 header——Hard Rule）；
    // 图标钮无可见文本，语义走 aria/title
    expect(markup).toContain('<button')
    expect(markup).not.toContain('在编辑器中打开工作区</button>')
    expect(markup).toContain('aria-label="在编辑器中打开工作区"')
  })

  it('无会话 = 标题空位（不猜标题——账本直读缺席面）', () => {
    const markup = render({ title: undefined })
    expect(markup).toContain('data-dswf-session-toolbar')
    expect(markup).not.toContain('data-dswf-session-title')
  })

  it('编辑器打开钮 = P1 占位（title 注明即将接入；无 onClick 实功能面）', () => {
    const markup = render()
    expect(markup).toContain('title="在编辑器中打开工作区（动作即将接入）"')
  })
})

describe('SessionToolbar 面板钮迁移语义（fix-9 AC2——收展同径）', () => {
  it('dockOpen=false → 展开右侧栏；dockOpen=true → 收起右侧栏（aria/title 同步翻转）', () => {
    const collapsed = render({ dockOpen: false })
    const expanded = render({ dockOpen: true })
    expect(collapsed).toContain('aria-label="展开右侧栏"')
    expect(collapsed).toContain('title="展开右侧栏"')
    expect(expanded).toContain('aria-label="收起右侧栏"')
    expect(expanded).toContain('title="收起右侧栏"')
  })

  it('面板钮图标 = 官方 PanelLeft 镜像件（ui-sidebar-right ExpandButton 同式 scaleX(-1)）', () => {
    const markup = render()
    expect(markup).toContain('dswf-session-panelicon')
  })
})

describe('SessionToolbar hero 相位让位（fix-9 AC3——不与空会话引导争位）', () => {
  it('hero=true → 标题簇置空 + utilities 退场 + corner 面板钮独存（官方 blank 相位 corner 常驻）', () => {
    const markup = render({ title: '某会话', hero: true })
    expect(markup).toContain('data-dswf-session-toolbar')
    expect(markup).toContain('data-dswf-toolbar-hero') // 独立命名空间（data-dswf-hero = HeroEmpty 专属锚）
    expect(markup).not.toContain('data-dswf-session-title')
    expect(markup).not.toContain('data-dswf-utility="open-in-editor"')
    expect(markup).toContain('data-dswf-utility="panel-toggle"') // 常显 toggle 语义保持（e2e L59 session 相位实钮）
  })
})

describe('SessionToolbar WCO 避让相位（fix-9 AC5——几何结论的标记面）', () => {
  it('右栏收起（默认）= avoid 标记（中区直达窗口右缘——CSS env(titlebar-area-width) 右衬生效）', () => {
    expect(render({ dockOpen: false })).toContain('data-dswf-wco="avoid"')
  })

  it('右栏展开（340px 轨道 > 136px 控制钮区）= 无 avoid 标记（几何已隔离不避让）', () => {
    expect(render({ dockOpen: true })).not.toContain('data-dswf-wco')
  })
})
