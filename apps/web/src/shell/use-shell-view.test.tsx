// shell/use-shell-view 单测 —— 视图态机 React 绑定（zones 对接面）：初始态 = createShellViewState
// （右栏默认收起 UF-7）、dispatch 分发面形状。转移语义 pin 在 view-state.test；装配消费归 2.12。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { createShellViewState } from './view-state.js'
import { useShellView } from './use-shell-view.js'

function HookProbe(): ReactNode {
  const [state, dispatch] = useShellView()
  return (
    <div
      data-probe="use-shell-view"
      data-state={JSON.stringify(state)}
      data-dispatch={typeof dispatch}
    />
  )
}

describe('useShellView（视图态机 React 绑定）', () => {
  it('初始态 = createShellViewState（会话视图 + 右栏收起 + 无锚）且暴露 dispatch 函数', () => {
    const markup = renderToStaticMarkup(<HookProbe />)
    const state = markup.match(/data-state="([^"]*)"/)?.[1] ?? ''
    expect(JSON.parse(state.replace(/&quot;/g, '"'))).toEqual(createShellViewState())
    expect(markup).toContain('data-dispatch="function"')
  })
})
