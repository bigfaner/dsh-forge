// components/ErrorBar 单测 —— 错误条共享件（fix-36：四域近同构错误条收敛）。
// 断言锚点 = 注入面完整转译（class/文案/重试钮/域前缀 data 锚/role=alert）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorBar } from './ErrorBar.js'

describe('ErrorBar 错误条（注入面 = 域 CSS/锚全参数化）', () => {
  it('容器 class + 文案 + 重试钮（role=alert 可达性面）', () => {
    const markup = renderToStaticMarkup(
      <ErrorBar
        className="dswf-sidebar-error"
        message="项目列表加载失败"
        retryClassName="dswf-sidebar-retry"
        anchor="data-dswf-error"
        onRetry={() => {}}
      />,
    )
    expect(markup).toContain('class="dswf-sidebar-error"')
    expect(markup).toContain('data-dswf-error=""')
    expect(markup).toContain('role="alert"')
    expect(markup).toContain('项目列表加载失败')
    expect(markup).toContain('class="dswf-sidebar-retry"')
    expect(markup).toContain('重试')
  })
  it('重试缺席 = 纯呈现面（无按钮节点）', () => {
    const markup = renderToStaticMarkup(
      <ErrorBar className="dswf-fb-error" message="目录加载失败：x" retryClassName="dswf-fb-retry" textClassName="dswf-fb-error-text" />,
    )
    expect(markup).toContain('class="dswf-fb-error-text"')
    expect(markup).not.toContain('<button')
  })
  it('文案 span 无 class 注入 = 裸 span（sidebar/recall/kn 域原样口径）', () => {
    const markup = renderToStaticMarkup(
      <ErrorBar
        className="dswf-recall-error"
        message="召回记录加载失败：通道未注册"
        retryClassName="dswf-recall-retry"
        anchor="data-dswf-recall-error"
        retryAnchor="data-dswf-recall-retry"
        onRetry={() => {}}
      />,
    )
    expect(markup).toContain('<span>召回记录加载失败：通道未注册</span>')
    expect(markup).toContain('data-dswf-recall-retry=""')
  })
})
