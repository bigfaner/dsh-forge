// KnowledgeBrowse 装配单测 —— UF-6 浏览主体组装（AC5 首显不阻塞的渲染面证据）。
// KnowledgeBrowseBody（纯渲染）：全相位静态断言；KnowledgeBrowse（装载壳）：
// renderToStaticMarkup 不跑 effect → 首帧 = 初始态骨架（索引直读就绪前的唯一相位，
// 首显不被数据装载阻塞——翻卡归 effect 后的 ready 相位，e2e 面 3.8/4.2）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DomainNode, KnowledgeCard } from '@dsh-forge/contracts'
import { KnowledgeBrowse, KnowledgeBrowseBody } from './KnowledgeBrowse.js'
import { EMPTY_FILTER } from './browse-model.js'
import type { KnowledgeBrowseActions, KnowledgeBrowseState } from './use-knowledge-browse.js'

const NOW = Date.parse('2026-10-02T12:00:00.000Z')

const NODES: readonly DomainNode[] = [
  { domainPath: '前端', label: '前端', depth: 1, entryCount: 1 },
  { domainPath: '后端', label: '后端', depth: 1, entryCount: 1 },
]

const CARDS: readonly KnowledgeCard[] = [
  {
    entryId: 1,
    title: '安全编码规范',
    summary: '输入校验与输出编码基线',
    keywords: ['安全'],
    status: 'draft',
    domainPath: '前端',
    updated: '2026-10-02T09:00:00.000Z',
    heat: 3,
  },
]

const ACTIONS: KnowledgeBrowseActions = {
  selectDomain: () => {},
  setKeyword: () => {},
  clearFilters: () => {},
  retry: () => {},
}

function stateOf(overrides: Partial<KnowledgeBrowseState>): KnowledgeBrowseState {
  return {
    phase: 'ready',
    cards: CARDS,
    nodes: NODES,
    total: 2,
    filter: EMPTY_FILTER,
    busy: false,
    error: undefined,
    projectName: 'demo',
    knowledgeDir: 'Z:/ws/demo/.knowledge',
    ...overrides,
  }
}

describe('KnowledgeBrowseBody（纯渲染装配）', () => {
  it('三件组合：工具栏 + 域树（根行 + 节点）+ 网格（卡片）——data 锚齐备', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeBrowseBody state={stateOf({})} actions={ACTIONS} now={NOW} />,
    )
    expect(markup).toContain('data-dswf-kn-browse')
    expect(markup).toContain('data-dswf-kn-toolbar')
    expect(markup).toContain('data-dswf-kn-tree')
    expect(markup).toContain('data-dswf-domain="前端"')
    expect(markup).toContain('data-dswf-kn-cards')
    expect(markup).toContain('data-dswf-entry="1"')
    expect(markup).toContain('项目 · demo')
  })

  it('过滤态贯通：active 域行高亮 + 工具栏关键词受控值', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeBrowseBody
        state={stateOf({ filter: { domain: '前端', keyword: '安全' }, cards: [] })}
        actions={ACTIONS}
        now={NOW}
      />,
    )
    expect(markup).toContain('data-dswf-domain="前端" data-active')
    expect(markup).toContain('value="安全"')
    // 过滤在场零结果 → 无结果空态 + 清除入口
    expect(markup).toContain('无匹配知识')
    expect(markup).toContain('data-dswf-clear-filters')
  })

  it('AC5 缓存先行（重拉在途）：busy 标注下旧卡片保持可见（aria-busy + cards 并存）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeBrowseBody state={stateOf({ busy: true })} actions={ACTIONS} now={NOW} />,
    )
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('data-dswf-entry="1"')
    expect(markup).not.toContain('data-dswf-kn-skeleton')
  })

  it('装载中零数据 → 骨架态（无空库文案闪现）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeBrowseBody
        state={stateOf({ phase: 'loading', cards: [], nodes: [], total: 0, busy: true })}
        actions={ACTIONS}
        now={NOW}
      />,
    )
    expect(markup).toContain('data-dswf-kn-skeleton')
    expect(markup).not.toContain('尚无知识')
  })
})

describe('KnowledgeBrowse（装载壳——首帧相位）', () => {
  it('AC5 首显不阻塞：静态首帧 = 初始骨架相位（effect 未跑——数据装载不阻塞渲染）', () => {
    const markup = renderToStaticMarkup(
      <KnowledgeBrowse projectId="p-1" now={NOW} makeClient={() => {
        throw new Error('静态渲染不应触达 RPC')
      }} />,
    )
    expect(markup).toContain('data-dswf-kn-browse')
    expect(markup).toContain('data-dswf-kn-skeleton')
  })
})
