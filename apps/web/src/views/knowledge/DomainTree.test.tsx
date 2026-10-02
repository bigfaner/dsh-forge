// DomainTree 单测 —— UF-6 左轨域目录树（AC1：选择 = 前缀过滤条件）。
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DomainNode } from '@dsh-forge/contracts'
import { DomainTree } from './DomainTree.js'

const NODES: readonly DomainNode[] = [
  { domainPath: '前端', label: '前端', depth: 1, entryCount: 3 },
  { domainPath: '前端/组件', label: '组件', depth: 2, entryCount: 1 },
  { domainPath: '后端', label: '后端', depth: 1, entryCount: 2 },
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
})
