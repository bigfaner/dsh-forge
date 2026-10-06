// MermaidDiagram 单测 —— AC1/AC2/AC3：懒加载（动态 import mock——mermaid 模块仅经
// loadMermaidEngine 动态 import 装载，securityLevel='strict' 单次 initialize）、
// 渲染管线（erDiagram 验收锚 + 全图型同库：源原样入 engine.render 零分支）、
// 失败回退（render/import/形状非法三路归一 fail，异常不外溢）+ 回退占位卡呈现。
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import mermaidDefault from 'mermaid'
import {
  loadMermaidEngine,
  MermaidDiagram,
  MermaidFallbackCard,
  nextMermaidId,
  renderMermaidDiagram,
  type MermaidEngine,
} from './mermaid-diagram.js'

// 动态 import mock：loadMermaidEngine 的 import('mermaid') 解析到本替身（零真实库装载）
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}))

const initialize = vi.mocked(mermaidDefault.initialize)
const render = vi.mocked(mermaidDefault.render)

const ER_SOURCE = 'erDiagram\n    PROPOSALS ||--o{ FEATURES : "proposal_id"'
const FLOW_SOURCE = 'flowchart TD\n    A-->B'

describe('loadMermaidEngine（懒加载 + strict 安全边界）', () => {
  it('动态 import 装载 + 单次 initialize（startOnLoad=false + securityLevel=strict）；重复调用复用同 promise 不重复装载', async () => {
    initialize.mockClear()
    const first = loadMermaidEngine()
    const second = loadMermaidEngine()
    expect(second).toBe(first)
    const engine = await first
    expect(engine).toBe(mermaidDefault)
    expect(initialize).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict' })
  })
})

describe('renderMermaidDiagram（渲染管线——loader 注入）', () => {
  it('erDiagram 渲染成功 → SVG 在场（验收锚）；源原样入 engine.render（零预处理零图型分支）', async () => {
    render.mockResolvedValueOnce({ svg: '<svg data-anchor="er"></svg>' } as unknown as Awaited<ReturnType<typeof render>>)
    const engine: MermaidEngine = mermaidDefault as MermaidEngine
    const out = await renderMermaidDiagram(async () => engine, ER_SOURCE, 'dswf-mermaid-1')
    expect(out).toEqual({ ok: true, svg: '<svg data-anchor="er"></svg>' })
    expect(render).toHaveBeenCalledWith('dswf-mermaid-1', ER_SOURCE)
  })

  it('全图型同库：flowchart 与 erDiagram 同一引擎同一路径（无图型分支/无第二装载径）', async () => {
    render.mockClear()
    render.mockResolvedValue({ svg: '<svg></svg>' } as unknown as Awaited<ReturnType<typeof render>>)
    const engine: MermaidEngine = mermaidDefault as MermaidEngine
    await renderMermaidDiagram(async () => engine, ER_SOURCE, 'id-1')
    await renderMermaidDiagram(async () => engine, FLOW_SOURCE, 'id-2')
    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenNthCalledWith(1, 'id-1', ER_SOURCE)
    expect(render).toHaveBeenNthCalledWith(2, 'id-2', FLOW_SOURCE)
  })

  it('渲染失败（engine.render 抛错/非法源）→ 归一 fail，异常不外溢', async () => {
    render.mockRejectedValueOnce(new Error('Parse error'))
    const engine: MermaidEngine = mermaidDefault as MermaidEngine
    await expect(renderMermaidDiagram(async () => engine, 'not a valid diagram @@@', 'id-3')).resolves.toEqual({ ok: false })
  })

  it('装载失败（import 径 reject）→ 归一 fail，异常不外溢', async () => {
    await expect(renderMermaidDiagram(() => Promise.reject(new Error('chunk load failed')), ER_SOURCE, 'id-4')).resolves.toEqual({
      ok: false,
    })
  })

  it('形状非法（svg 非字符串/空串）→ 归一 fail（不注入非 SVG 面）', async () => {
    const bad: MermaidEngine = {
      initialize: () => undefined,
      render: vi.fn().mockResolvedValue({ svg: 42 } as unknown as { svg: string }),
    }
    await expect(renderMermaidDiagram(async () => bad, ER_SOURCE, 'id-5')).resolves.toEqual({ ok: false })
    const empty: MermaidEngine = {
      initialize: () => undefined,
      render: vi.fn().mockResolvedValue({ svg: '' }),
    }
    await expect(renderMermaidDiagram(async () => empty, ER_SOURCE, 'id-6')).resolves.toEqual({ ok: false })
  })
})

describe('MermaidDiagram 组件（静态首渲染面）', () => {
  it('effect 不跑（renderToStaticMarkup）= 在途占位卡锚——动态 import 仅挂载后经 effect 触发', () => {
    const markup = renderToStaticMarkup(<MermaidDiagram source={ER_SOURCE} />) as ReactNode as string
    expect(markup).toContain('data-dswf-doc-mermaid-pending')
    expect(markup).toContain('图渲染中')
    expect(markup).not.toContain('data-dswf-doc-mermaid-svg')
    expect(markup).not.toContain('data-dswf-doc-mermaid-fallback')
  })
})

describe('MermaidFallbackCard（回退占位卡——AC3）', () => {
  it('源码 + 回退注记在场（fail 态纯呈现面；源内引号经 HTML 转义）', () => {
    const markup = renderToStaticMarkup(<MermaidFallbackCard source={ER_SOURCE} />)
    expect(markup).toContain('data-dswf-doc-mermaid-fallback')
    expect(markup).toContain(ER_SOURCE.replaceAll('"', '&quot;'))
    expect(markup).toContain('已回退为源码展示')
    expect(markup).toContain('异常不外溢')
  })
})

describe('nextMermaidId（渲染 id 序）', () => {
  it('递增不重复', () => {
    const a = nextMermaidId()
    const b = nextMermaidId()
    expect(a).toMatch(/^dswf-mermaid-\d+$/)
    expect(b).not.toBe(a)
  })
})
