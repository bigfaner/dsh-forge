// DOM 渐进增强器单测 —— AC：门控（内容首行关键字 + frontmatter）→ parse 确认 → 旁插替换；
// 懒加载纪律（无关键字块零引擎装载）；幂等重增强（data 标记 + 源 hash）；安全降级
// （parse 失败 / 探测锚缺席 / render 失败 = 官方代码块现状，无未捕获异常）；
// MutationObserver 防抖合并扫描 + 启停 API。
// 无 jsdom——自建最小 DOM 替身（增强器对 DOM 面收敛为结构化窄接口，替身即合法实现）。
import { describe, expect, it, vi } from 'vitest'

import {
  MD_MERMAID_BLOCK_FLAG,
  MD_MERMAID_FIGURE_FLAG,
  createMermaidEnhancer,
  type EnhancerElement,
  type MermaidEngineLike,
} from './enhancer.js'

// ---- 最小 DOM 替身 ----

function classList(el: StubEl): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
}

function matches(el: StubEl, sel: string): boolean {
  if (sel.startsWith('.')) return classList(el).includes(sel.slice(1))
  if (sel.startsWith('[')) return el.hasAttribute(sel.slice(1, -1))
  return el.tagName === sel
}

class StubEl {
  readonly children: StubEl[] = []
  parent: StubEl | null = null
  readonly style: Record<string, string | undefined> = {}
  innerHTML = ''
  textContent = ''
  private readonly attrs = new Map<string, string>()

  constructor(readonly tagName: string) {}

  get parentElement(): StubEl | null {
    return this.parent
  }

  get nextElementSibling(): StubEl | null {
    if (!this.parent) return null
    const i = this.parent.children.indexOf(this)
    return this.parent.children[i + 1] ?? null
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attrs.has(name)
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }

  appendChild(child: StubEl): StubEl {
    child.parent = this
    this.children.push(child)
    return child
  }

  insertBefore(child: StubEl, ref: StubEl | null): StubEl {
    child.parent = this
    const i = ref === null ? -1 : this.children.indexOf(ref)
    if (i < 0) this.children.push(child)
    else this.children.splice(i, 0, child)
    return child
  }

  querySelector(sel: string): StubEl | null {
    for (const c of this.children) {
      if (matches(c, sel)) return c
      const d = c.querySelector(sel)
      if (d !== null) return d
    }
    return null
  }

  querySelectorAll(sel: string): EnhancerElement[] {
    const out: StubEl[] = []
    const walk = (el: StubEl): void => {
      for (const c of el.children) {
        if (matches(c, sel)) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }
}

class StubDoc {
  readonly documentElement = new StubEl('html')
  readonly body = this.documentElement

  createElement(tagName: string): StubEl {
    return new StubEl(tagName)
  }

  querySelectorAll(sel: string): EnhancerElement[] {
    const out: StubEl[] = []
    const walk = (el: StubEl): void => {
      for (const c of el.children) {
        if (matches(c, sel)) out.push(c)
        walk(c)
      }
    }
    walk(this.documentElement)
    return out
  }
}

// 官方 CodeBlock 形态（附录 B）：根 .md-code-block + 内容锚 [data-code-block-content] + pre 源文本
function makeCodeBlock(doc: StubDoc, source: string): StubEl {
  const block = doc.createElement('div')
  block.setAttribute('class', 'md-code-block')
  const content = doc.createElement('div')
  content.setAttribute('data-code-block-content', '')
  const pre = doc.createElement('pre')
  pre.textContent = source
  content.appendChild(pre)
  block.appendChild(content)
  doc.documentElement.appendChild(block)
  return block
}

const VALID = 'flowchart TD\n    A-->B'

// 防抖调度替身：记录入队 fn，cancel 使 fn 失活；flushDebounce 逐个执行仍存活的 fn
function makeScheduler(): {
  schedule: (fn: () => void, ms: number) => () => void
  flushDebounce: () => void
  calls: number
  cancels: () => number
} {
  let calls = 0
  let cancelled = 0
  const timers: { fn: () => void }[] = []
  return {
    get calls() {
      return calls
    },
    cancels: () => cancelled,
    schedule: (fn) => {
      calls++
      const t = { fn }
      timers.push(t)
      return () => {
        cancelled++
        t.fn = () => {}
      }
    },
    flushDebounce: () => {
      for (const t of timers.splice(0)) t.fn()
    },
  }
}

/** 引擎替身：parse/render 可编程；load 计数即懒加载纪律断言面 */
function makeEngine(opts: { parseFail?: boolean; renderFail?: boolean } = {}): {
  engine: MermaidEngineLike
  load: () => Promise<MermaidEngineLike>
  loadCount: () => number
  renderCount: () => number
} {
  let loads = 0
  let renders = 0
  const engine = {
    initialize: vi.fn(),
    parse: vi.fn(async () => {
      if (opts.parseFail) throw new Error('Expecting ...')
    }),
    render: vi.fn(async (_id: string, source: string): Promise<{ svg: string }> => {
      renders++
      if (opts.renderFail) throw new Error('render boom')
      return { svg: `<svg data-src="${source.split('\n')[0]}" />` }
    }),
  }
  return {
    engine,
    load: vi.fn(() => {
      loads++
      return Promise.resolve(engine)
    }),
    loadCount: () => loads,
    renderCount: () => renders,
  }
}

function makeEnhancer(doc: StubDoc, harness: ReturnType<typeof makeEngine>, scheduler: ReturnType<typeof makeScheduler>) {
  const observerCbs: Array<() => void> = []
  const enhancer = createMermaidEnhancer({
    doc,
    load: harness.load,
    schedule: scheduler.schedule,
    createObserver: (cb) => {
      observerCbs.push(cb)
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
      }
    },
    debounceMs: 50,
  })
  return { enhancer, fireMutation: () => observerCbs.forEach((cb) => cb()) }
}

describe('门控 + 懒加载纪律（无关键字块零引擎装载）', () => {
  it('无关键字块：load 零调用（零动态 import 径触发）、零 figure、原块原样', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    makeCodeBlock(doc, 'const x = 1\nconsole.log(x)')
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    expect(harness.loadCount()).toBe(0)
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(0)
  })

  it('关键字门控过 + parse 确认过：旁插图容器 + 隐藏原块（不删官方节点）+ data 标记源 hash', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, VALID)
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    expect(harness.loadCount()).toBeGreaterThan(0)
    const figures = doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)
    expect(figures).toHaveLength(1)
    expect(figures[0]?.querySelector('.dswf-doc-mermaid-canvas')?.innerHTML).toContain('<svg')
    expect(block.style.display).toBe('none')
    expect(block.hasAttribute(MD_MERMAID_BLOCK_FLAG)).toBe(true)
    // 不删官方节点
    expect(doc.documentElement.querySelectorAll('.md-code-block')).toContain(block)
  })

  it('YAML frontmatter 首行块门控过（--- 界定后取图型关键字）', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    makeCodeBlock(doc, '---\ntitle: x\n---\nflowchart LR\n    A-->B')
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    expect(harness.loadCount()).toBeGreaterThan(0)
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(1)
  })

  it('非图型关键字（graph 之外的普通词）不门控', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    makeCodeBlock(doc, 'notadiagram\n    A-->B')
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    expect(harness.loadCount()).toBe(0)
  })
})

describe('幂等重增强（data 标记 + 源 hash）', () => {
  it('同节点同源重扫：不重复渲染（render 恒 1 次）', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, VALID)
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    await enhancer.scan()
    await enhancer.scan()
    expect(harness.renderCount()).toBe(1)
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(1)
    expect(block.getAttribute(MD_MERMAID_BLOCK_FLAG)).not.toBeNull()
  })

  it('节点重建（新元素无标记同源）：重新增强为独立 figure', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    const first = makeCodeBlock(doc, VALID)
    await enhancer.scan()
    // 官方重渲重建：旧块与其旁插 figure 一并消失（React 不识旁插节点），新块同源无标记
    const oldFigure = first.nextElementSibling
    const parent = first.parent
    if (parent !== null) {
      const drop = (el: StubEl | null): void => {
        if (el === null) return
        const i = parent.children.indexOf(el)
        if (i >= 0) parent.children.splice(i, 1)
      }
      drop(oldFigure)
      drop(first)
    }
    makeCodeBlock(doc, VALID)
    await enhancer.scan()

    expect(harness.renderCount()).toBe(2)
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(1)
  })

  it('同节点源变化（hash 不同）：重渲染并更新既有 figure，不叠插', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, VALID)
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await enhancer.scan()
    const hashBefore = block.getAttribute(MD_MERMAID_BLOCK_FLAG)
    const pre = block.querySelector('[data-code-block-content]')?.querySelector('pre')
    if (pre) pre.textContent = 'sequenceDiagram\n    A->>B: hi'
    await enhancer.scan()

    expect(harness.renderCount()).toBe(2)
    const figures = doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)
    expect(figures).toHaveLength(1)
    expect(figures[0]?.querySelector('.dswf-doc-mermaid-canvas')?.innerHTML).toContain('sequenceDiagram')
    expect(block.getAttribute(MD_MERMAID_BLOCK_FLAG)).not.toBe(hashBefore)
  })
})

describe('安全降级（官方代码块现状，无未捕获异常）', () => {
  it('parse 失败（流式中残源）= 维持代码块：零 figure、原块不隐藏、异常不外溢', async () => {
    const doc = new StubDoc()
    const harness = makeEngine({ parseFail: true })
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, 'flowchart TD\n    A-->')
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await expect(enhancer.scan()).resolves.toBeUndefined()
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(0)
    expect(block.style.display).toBeUndefined()
    expect(block.hasAttribute(MD_MERMAID_BLOCK_FLAG)).toBe(false)
  })

  it('render 失败 = 维持代码块', async () => {
    const doc = new StubDoc()
    const harness = makeEngine({ renderFail: true })
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, VALID)
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await expect(enhancer.scan()).resolves.toBeUndefined()
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(0)
    expect(block.style.display).toBeUndefined()
  })

  it('探测锚缺席（DOM 形变，无 [data-code-block-content]）= 跳过该块', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    const block = doc.createElement('div')
    block.setAttribute('class', 'md-code-block')
    block.textContent = VALID
    doc.documentElement.appendChild(block)
    const { enhancer } = makeEnhancer(doc, harness, scheduler)

    await expect(enhancer.scan()).resolves.toBeUndefined()
    expect(harness.loadCount()).toBe(0)
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(0)
  })

  it('流式闭合后 mutation 重扫出图（先残源回退 → 同块补全后增强）', async () => {
    const doc = new StubDoc()
    const engine = makeEngine()
    let parseFail = true
    const harness = {
      engine: engine.engine,
      load: engine.load,
      loadCount: engine.loadCount,
      renderCount: engine.renderCount,
    }
    const parse = engine.engine.parse
    if (parse) {
      vi.mocked(parse).mockImplementation(async () => {
        if (parseFail) throw new Error('incomplete')
      })
    }
    const scheduler = makeScheduler()
    const block = makeCodeBlock(doc, 'flowchart TD\n    A-->')
    const { enhancer, fireMutation } = makeEnhancer(doc, harness, scheduler)

    enhancer.start()
    await enhancer.scan()
    expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(0)

    parseFail = false
    const pre = block.querySelector('[data-code-block-content]')?.querySelector('pre')
    if (pre) pre.textContent = VALID
    fireMutation()
    scheduler.flushDebounce()
    await vi.waitFor(() => {
      expect(doc.documentElement.querySelectorAll(`[${MD_MERMAID_FIGURE_FLAG}]`)).toHaveLength(1)
    })
    enhancer.stop()
  })
})

describe('MutationObserver 防抖 + 启停', () => {
  it('高频 mutation 合并单次扫描（N 次 fire 只 1 个存活 fn 执行）', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    makeCodeBlock(doc, VALID)
    const { enhancer, fireMutation } = makeEnhancer(doc, harness, scheduler)

    enhancer.start()
    fireMutation()
    fireMutation()
    fireMutation()
    expect(scheduler.calls).toBe(3)
    expect(scheduler.cancels()).toBe(2)
    scheduler.flushDebounce()
    await vi.waitFor(() => expect(harness.renderCount()).toBe(1))
    enhancer.stop()
  })

  it('start 幂等（重复 start 不叠加 observer）+ stop 断开并取消在途扫描', async () => {
    const doc = new StubDoc()
    const harness = makeEngine()
    const scheduler = makeScheduler()
    makeCodeBlock(doc, VALID)
    const observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; cb: () => void }> = []
    const enhancer = createMermaidEnhancer({
      doc,
      load: harness.load,
      schedule: scheduler.schedule,
      createObserver: (cb) => {
        const o = { observe: vi.fn(), disconnect: vi.fn(), cb }
        observers.push(o)
        return o
      },
      debounceMs: 50,
    })

    enhancer.start()
    enhancer.start()
    expect(observers).toHaveLength(1)
    expect(observers[0]?.observe).toHaveBeenCalledTimes(1)

    // 触发在途扫描后 stop：fn 被取消，flush 不产生引擎装载
    observers[0]?.cb()
    enhancer.stop()
    expect(observers[0]?.disconnect).toHaveBeenCalledTimes(1)
    scheduler.flushDebounce()
    expect(harness.loadCount()).toBe(0)
  })
})

