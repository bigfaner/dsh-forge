// DomainTree 单测 —— UF-6 左轨域目录树（AC1：选择 = 前缀过滤条件）。
// knowledge-review-ui SC-H：H1 收合 caret/aria-expanded（缺省全展开）· H2 树头「＋」
// · H3 拖拽落点锚（仅具体域行）· H4 待审核徽记（官方 Tag warning 数字形态）。
// 交互时序（收合切换/编辑行提交/drop 解析）的语义归 browse-model 纯函数面——本面锁
// 静态结构与锚（renderToStaticMarkup 面无法触发事件）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DomainNode } from '@dsh-forge/contracts'
import { DomainTree } from './DomainTree.js'

const NODES: readonly DomainNode[] = [
  { domainPath: '前端', label: '前端', depth: 1, entryCount: 3, unconfirmedCount: 2 },
  { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1, unconfirmedCount: 0 },
  { domainPath: '后端', label: '后端', depth: 1, entryCount: 2, unconfirmedCount: 1 },
]

describe('DomainTree 域目录树', () => {
  it('「全部域」根行 + 聚合节点行（data-dswf-domain 锚 + 计数含子域）；role=tree/treeitem', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(markup).toContain('data-dswf-kn-tree')
    expect(markup).toContain('role="tree"')
    expect(markup).toContain('data-dswf-domain="前端"')
    expect(markup).toContain('data-dswf-domain="前端/组件"')
    expect(markup).toContain('data-dswf-domain="后端"')
    expect(markup).toContain('role="treeitem"')
    expect(markup).toContain('aria-label="域目录"')
  })

  it('AC1 选中态：active 域行 aria-selected/data-active；根行仅在全选（active 缺席）时激活', () => {
    const frontend = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} active="前端" />)
    expect(frontend).toContain('data-dswf-domain="前端" data-active')
    expect(frontend).toContain('aria-selected="true"')
    expect(frontend).toContain('aria-selected="false"')

    const allActive = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(allActive).toContain('data-dswf-domain="" data-active')
  })

  it('层级缩进：行内 --dswf-depth 按深度注入（CSS calc 消费）', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(markup).toContain('--dswf-depth:0')
    expect(markup).toContain('--dswf-depth:1')
    expect(markup).toContain('--dswf-depth:2')
  })

  it('选择回调缺席 = 行不可点开（onClick 不落；树仍完整呈现——静态展示面）', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(markup).toContain('data-dswf-domain="前端"')
    expect(markup).not.toContain('onclick')
  })

  it('H1 收合面：父行 caret + aria-expanded（缺省全展开 = true——≤3 层常展开口径）；叶行无 aria-expanded', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(markup).toContain('dswf-kn-dom-caret')
    expect(markup).toContain('aria-expanded="true"')
    expect(markup).not.toContain('aria-expanded="false"')
    expect(markup).not.toContain('data-collapsed')
  })

  it('H4 待审核徽记：官方 Tag 数字形态仅 >0 域行在场；根行 = 一级域求和（未过滤口径）', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(markup).toContain('dswf-kn-dom-badge')
    expect(markup).toContain('data-tone="warning"') // 官方 Tag warning 数字形态
    expect(markup).toContain('>3</span>') // 根行徽记 = 一级域求和 2+1
    // 组件行 0 = 无徽记（count 行「1」不作为徽记出现两次以上）
    const badgeCount = markup.split('dswf-kn-dom-badge').length - 1
    expect(badgeCount).toBe(3)
  })

  it('H4 根行徽记可显式供数（unconfirmedTotal 优先于树求和派生）', () => {
    const markup = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} unconfirmedTotal={9} />)
    expect(markup).toContain('>9</span>')
  })

  it('H2 树头「＋」：onCreateDomain 在场出 data-dswf-kn-dom-add 钮；缺席不渲染', () => {
    const withAdd = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} onCreateDomain={() => {}} />)
    expect(withAdd).toContain('data-dswf-kn-dom-add')
    expect(withAdd).toContain('新建目录')
    const withoutAdd = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(withoutAdd).not.toContain('data-dswf-kn-dom-add')
  })

  it('H3 拖拽落点：onMoveEntry 在场 = 仅具体域行带 data-dswf-kn-drop（根行/无动作 = 非落点零动作）', () => {
    const withDrop = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} onMoveEntry={() => {}} />)
    expect(withDrop).toContain('data-dswf-kn-drop')
    const dropCount = withDrop.split('data-dswf-kn-drop').length - 1
    expect(dropCount).toBe(3) // 前端/前端组件/后端——根行（data-dswf-domain=""）不在场
    const withoutDrop = renderToStaticMarkup(<DomainTree nodes={NODES} total={5} />)
    expect(withoutDrop).not.toContain('data-dswf-kn-drop')
  })
})
