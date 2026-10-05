// KnowledgeView 组件单测 —— 知识视图装配壳（3.8：UF-5 知识视图槽自 M0 占位填入 UF-6 浏览面）。
// 断言面 = 任务 AC-1（浏览主体 + 抽屉挂载、无项目锚降级）与 AC-3 装配方（openEntryId 进出——
// 卡片点击与召回 tab 跳转两入口共用的抽屉打开态）。SSR 直渲（效应拉取不执行——装载壳
// 首帧 = 骨架/空态面，数据相位归 use-knowledge-browse/EntryDrawer 各自单测与 e2e）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KnowledgeView } from './KnowledgeView.js'

describe('KnowledgeView 知识视图装配壳（UF-5 知识视图槽 → UF-6 浏览面）', () => {
  it('无项目锚 = 引导空态（anchor=none——未注册/未就绪不拉取不炸壳）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeView projectId={null} openEntryId={null} onOpenEntryChange={() => {}} />,
    )
    expect(markup).toContain('data-dswf-knowledge-view')
    expect(markup).toContain('data-dswf-kn-anchor="none"')
    expect(markup).toContain('尚未锚定项目')
    expect(markup).not.toContain('data-dswf-kn-browse')
  })
  it('bug: 多项目未锚定空态说实话（不谎称「尚未锚定项目」——告知跟随会话锚定路径）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeView
        projectId={null}
        unanchoredProjectCount={3}
        openEntryId={null}
        onOpenEntryChange={() => {}}
      />,
    )
    expect(markup).toContain('data-dswf-knowledge-view')
    expect(markup).toContain('data-dswf-kn-anchor="none"')
    expect(markup).not.toContain('尚未锚定项目')
    expect(markup).toContain('已注册 3 个项目')
    expect(markup).toContain('会话')
    expect(markup).not.toContain('data-dswf-kn-browse')
  })
  it('bug 回归：count 缺省/0/1 = 引导空态原文案（零项目引导不受多项目分流影响）', () => {
    for (const count of [undefined, 0, 1]) {
      const markup = renderToStaticMarkup(
        <KnowledgeView
          projectId={null}
          unanchoredProjectCount={count}
          openEntryId={null}
          onOpenEntryChange={() => {}}
        />,
      )
      expect(markup).toContain('尚未锚定项目')
      expect(markup).not.toContain('已注册')
    }
  })
  it('项目锚在场 = 浏览主体挂载（工具栏 + 域树轨 + 网格首帧骨架）；anchor = 项目 id', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeView projectId="p-1" openEntryId={null} onOpenEntryChange={() => {}} />,
    )
    expect(markup).toContain('data-dswf-knowledge-view')
    expect(markup).toContain('data-dswf-kn-anchor="p-1"')
    expect(markup).toContain('data-dswf-kn-browse')
    expect(markup).toContain('data-dswf-kn-toolbar')
    // 抽屉关闭态（openEntryId null）不渲染
    expect(markup).not.toContain('data-dswf-kn-drawer')
  })
  it('AC-3 抽屉打开态：openEntryId 在场 = 抽屉滑入层渲染（装载首帧 = 骨架）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeView projectId="p-1" openEntryId={7} onOpenEntryChange={() => {}} />,
    )
    expect(markup).toContain('data-dswf-kn-drawer')
    expect(markup).toContain('data-dswf-kn-drawer-skeleton')
  })
})
