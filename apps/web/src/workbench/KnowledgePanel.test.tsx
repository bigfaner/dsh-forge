// KnowledgePanel 单测 —— 官方 main 面板 'dswf-knowledge' 占用者（fix-25）。
// SSR 首帧：知识视图锚 + 无项目锚引导空态（RPC/钩子缺席降级）；桥抽屉缝消费 =
// useSyncExternalStore 面在 bridge 缺席时本地自持降级（效应面零执行归 e2e）。
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ForgeKnowledgePanel } from './KnowledgePanel.js'

describe('ForgeKnowledgePanel SSR 首帧', () => {
  it('知识视图锚在场（data-dswf-view=knowledge——e2e 中区知识视图迁移锚）+ 无项目锚引导空态', () => {
    const markup = renderToStaticMarkup(<ForgeKnowledgePanel />)
    expect(markup).toContain('data-dswf-view="knowledge"')
    expect(markup).toContain('data-dswf-knowledge-view')
    expect(markup).toContain('尚未锚定项目')
  })
})
