// KnowledgePanel 单测 —— 官方 main 面板 'dswf-knowledge' 占用者（fix-25）。
// SSR 首帧：知识视图锚 + 无项目锚引导空态（RPC/钩子缺席降级）；桥抽屉缝消费 =
// useSyncExternalStore 面在 bridge 缺席时本地自持降级（效应面零执行归 e2e）。
// 多项目锚定（fix-bug）：主视图会话读取 readMainSessionId（纯读）+ MainSessionAnchor
// 锚子件（PanelInfoAnchor 同形制——渲染期读取 + null 渲染，效应上抛归 e2e）+ useSessions
// 在场不炸 SSR（root 标准props 递达面）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ForgeKnowledgePanel, MainSessionAnchor, readMainSessionId } from './KnowledgePanel.js'

describe('ForgeKnowledgePanel SSR 首帧', () => {
  it('知识视图锚在场（data-dswf-view=knowledge——e2e 中区知识视图迁移锚）+ 无项目锚引导空态', () => {
    const markup = renderToStaticMarkup(<ForgeKnowledgePanel />)
    expect(markup).toContain('data-dswf-view="knowledge"')
    expect(markup).toContain('data-dswf-knowledge-view')
    expect(markup).toContain('尚未锚定项目')
  })

  it('bug: useSessions 在场（root 标准props）不炸 SSR 首帧（主视图会话锚子件挂载面——效应上抛归 e2e）', () => {
    const selectorHook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)
    const markup = renderToStaticMarkup(
      <ForgeKnowledgePanel useSessions={selectorHook({ byId: { 's-1': { id: 's-1', retainedBy: { mainView: 1 } } } })} />,
    )
    expect(markup).toContain('data-dswf-view="knowledge"')
    expect(markup).toContain('data-dswf-knowledge-view')
  })
})

describe('readMainSessionId 主视图会话纯读（官方 retainedBy.mainView 口径）', () => {
  const hook = (state: unknown) => (sel: (s: never) => unknown) => sel(state as never)

  it('retainedBy.mainView > 0 的会话行 id 命中；多行取首个（官方 find 同序）', () => {
    const state = {
      byId: {
        's-1': { id: 's-1', retainedBy: { mainView: 0 } },
        's-2': { id: 's-2', retainedBy: { mainView: 1 } },
      },
    }
    expect(readMainSessionId(hook(state))).toBe('s-2')
  })

  it('无 mainView 保留（零计数/缺省）→ null', () => {
    expect(
      readMainSessionId(hook({ byId: { 's-1': { id: 's-1', retainedBy: { mainView: 0 } } } })),
    ).toBeNull()
    expect(readMainSessionId(hook({ byId: { 's-1': { id: 's-1', retainedBy: {} } } }))).toBeNull()
    expect(readMainSessionId(hook({ byId: {} }))).toBeNull()
  })

  it('形状漂移/缺省（byId 缺席/非对象快照）→ null（fail-soft 降级）', () => {
    expect(readMainSessionId(hook(undefined))).toBeNull()
    expect(readMainSessionId(hook({}))).toBeNull()
    expect(readMainSessionId(hook({ byId: 'x' }))).toBeNull()
  })
})

describe('MainSessionAnchor 主视图会话锚子件（PanelInfoAnchor 同形制）', () => {
  it('SSR 渲染期执行钩子读取（选择器直连）且渲染为 null（效应上抛归 e2e）', () => {
    const seen: unknown[] = []
    const markup = renderToStaticMarkup(
      <MainSessionAnchor
        hook={(sel) => {
          const value = sel({ byId: {} } as never)
          seen.push(value)
          return value
        }}
        onChange={() => {}}
      />,
    )
    expect(markup).toBe('')
    expect(seen).toEqual([null])
  })
})
