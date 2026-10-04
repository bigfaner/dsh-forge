// HeroWorkspacePicker 单测（fix-24 ①）——影子占用者接线层静态面。
// 官方 Menu 门户面（open 弹层经 createPortal(document.body)）静态渲染不可达（node 无 DOM，
// 官方 Modal 壳同口径——AddProjectFlow.test 头注惯例）：开弹层行面/添加项/选中高亮 =
// hero-picker-model.test（行集/映射/空集纯函数）+ e2e hero-control spec（真浏览器面）承载。
// 本文件覆盖：闭态零弹层（owner 开合透传）+ owner 契约零本地持有。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ForgeHeroWorkspacePicker } from './HeroWorkspacePicker.js'

function renderPicker(props: Partial<Parameters<typeof ForgeHeroWorkspacePicker>[0]> = {}): string {
  return renderToStaticMarkup(
    <ForgeHeroWorkspacePicker open onPick={() => {}} onClose={() => {}} {...props} />,
  )
}

describe('ForgeHeroWorkspacePicker（conversation.hero.workspace 影子占用者）', () => {
  it('open=false → 弹层不呈现（owner 开合态透传——chip 点击翻转；门户面静态不可达的对照锚）', () => {
    const markup = renderPicker({ open: false })
    expect(markup).not.toContain('role="menu"')
    expect(markup).not.toContain('dswf-hero-picker-list')
    expect(markup).not.toContain('添加项目')
  })

  it('owner 契约零持有：onPick/onClose 经 props 递达（无本地态副本——官方 selectWorkspace 链直通）', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    renderPicker({ open: false, onPick, onClose })
    expect(onPick).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('anchorRef 缺席不炸（闭态渲染零锚依赖——getAnchorRect 短路 null）', () => {
    const markup = renderPicker({ open: false, anchorRef: undefined })
    expect(markup).not.toContain('role="menu"')
  })
})
