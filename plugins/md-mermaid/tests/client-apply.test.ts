// client apply 接线补测（S4 / bug 6e9639cc）——client 束（安装形态）接线 fix-1 落的
// onRenderFail 诊断缝：渲染失败 emit 可观察信号（与宿主径同缝同语义——MermaidRenderOutcome
// 归一 reason），缺省发射 = client 束 console 豁免面（[dsh-forge/md-mermaid] 前缀）；
// 显式注入直透（测试替身可达）。无 jsdom——最小 DOM 替身（enhancer.test 同判例）。
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mdMermaidClient, mountMermaidClient } from '../ui/client.js'
import { MD_MERMAID_MOUNT_SENTINEL } from '../ui/enhancer.js'

// ---- 最小 DOM 替身（只覆盖 enhancer 触达面）----

interface StubNode {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string, value?: string): void
  hasAttribute(name: string): boolean
  querySelector(selectors: string): StubNode | null
  readonly children: StubNode[]
  style: { display?: string }
  textContent: string
}

function el(tag: string, attrs: Record<string, string> = {}, text = ''): StubNode {
  const children: StubNode[] = []
  const map = new Map(Object.entries(attrs))
  return {
    children,
    style: {},
    textContent: text,
    getAttribute: (n) => map.get(n) ?? null,
    setAttribute: (n, v) => void map.set(n, v),
    removeAttribute: (n) => void map.delete(n),
    hasAttribute: (n) => map.has(n),
    querySelector: (sel) => {
      if (sel === 'pre') return children.find((c) => c.getAttribute('data-pre') === '1') ?? null
      if (sel === '[data-code-block-content]') return children.find((c) => c.hasAttribute('data-code-block-content')) ?? null
      return null
    },
  }
}

function makeDocWithMermaidBlock(): { documentElement: StubNode; createElement: (t: string) => StubNode; querySelectorAll: (s: string) => StubNode[] } {
  const root = el('html')
  const content = el('div', { 'data-code-block-content': '' })
  const pre = el('pre', { 'data-pre': '1' }, 'flowchart TD\n    A-->B')
  content.children.push(pre)
  const block = el('div', { class: 'md-code-block' })
  block.children.push(content)
  root.children.push(block)
  return {
    documentElement: root,
    createElement: (t) => el(t),
    querySelectorAll: (s) => (s === '.md-code-block' ? [block] : []),
  }
}

// 防抖与 observer 替身（start 装配面；扫描经 face.scan 显式触发）
const schedule = (fn: () => void): (() => void) => () => void fn
const createObserver = () => ({ observe: vi.fn(), disconnect: vi.fn() })
const failingLoad = (): Promise<never> => Promise.reject(new Error('engine boom'))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('client apply 接线 onRenderFail 诊断缝（bug 6e9639cc——安装形态渲染失败可观察）', () => {
  it('缺省发射：引擎装载失败 → console.error（client 束豁免面）携带 md-mermaid 前缀 + 归一 reason', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const face = mountMermaidClient(undefined, {
      doc: makeDocWithMermaidBlock() as never,
      load: failingLoad,
      schedule,
      createObserver,
    })

    await face.scan()

    expect(consoleError).toHaveBeenCalledTimes(1)
    const [first, second] = consoleError.mock.calls[0] as unknown as [string, unknown]
    expect(first).toContain('[dsh-forge/md-mermaid]')
    expect(first).toContain('render fail')
    expect(String(second)).toContain('engine boom')
  })

  it('显式 onRenderFail 直透：缝信号直达注入面（与宿主径同缝同语义），console 零直落', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onRenderFail = vi.fn()
    const face = mountMermaidClient(undefined, {
      doc: makeDocWithMermaidBlock() as never,
      load: failingLoad,
      schedule,
      createObserver,
      onRenderFail,
    })

    await face.scan()

    expect(onRenderFail).toHaveBeenCalledTimes(1)
    expect(onRenderFail.mock.calls[0]?.[0]).toMatchObject({ reason: expect.stringContaining('engine boom') })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('apply() 组合面：装配不外溢 + effect 卸载缝注册 + 哨兵随 dispose 释放', () => {
    const doc = makeDocWithMermaidBlock()
    const previousDocument = (globalThis as { document?: unknown }).document
    ;(globalThis as { document?: unknown }).document = doc
    try {
      const effectCb = vi.fn()
      const face = mountMermaidClient({ effect: effectCb } as never, {
        doc: doc as never,
        load: failingLoad,
        schedule,
        createObserver,
      })

      expect(effectCb).toHaveBeenCalledTimes(1)
      expect(doc.documentElement.getAttribute(MD_MERMAID_MOUNT_SENTINEL)).not.toBeNull()

      face.dispose()
      expect(doc.documentElement.getAttribute(MD_MERMAID_MOUNT_SENTINEL)).toBeNull()
    } finally {
      ;(globalThis as { document?: unknown }).document = previousDocument
    }
  })

  it('mdMermaidClient.apply 与装载器正门 apply 同源（module.exports 顶层 apply 契约）', () => {
    expect(typeof mdMermaidClient.apply).toBe('function')
  })
})
