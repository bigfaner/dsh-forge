// @vitest-environment happy-dom
// §2.6 D3 单轨贴底保持缝单测（forgeEventTailKeepEffect——增高后贴底态补落底/阅读态不拉拽）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FORGE_TAIL_TOLERANCE_PX, forgeEventTailKeepEffect } from './ForgeEventEntries.js'

/** happy-dom 无 ResizeObserver——观察面用可控回调替身 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** scrollport 替身（几何可写——closest 命中 [data-conversation-scroll]） */
function fakeScrollport(state: { scrollHeight: number; clientHeight: number; scrollTop: number }): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-conversation-scroll', '')
  let { scrollHeight, clientHeight, scrollTop } = state
  Object.defineProperty(el, 'scrollHeight', { get: () => scrollHeight })
  Object.defineProperty(el, 'clientHeight', { get: () => clientHeight })
  Object.defineProperty(el, 'scrollTop', { get: () => scrollTop, set: (v: number) => { scrollTop = v } })
  return el
}

function mountCard(scrollport: HTMLElement): HTMLElement {
  const root = document.createElement('div')
  scrollport.appendChild(root)
  return root
}

const geometry = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')

afterEach(() => {
  FakeResizeObserver.instances = []
  vi.restoreAllMocks()
})

describe('forgeEventTailKeepEffect（§2.6 D3 单轨——增高后补落底）', () => {
  it('增高前在容差内（贴底态）→ 补一发落底（scrollTop 推到新 floor）', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    geometry.mockReturnValue({ height: 100 } as DOMRect)
    const scrollport = fakeScrollport({ scrollHeight: 500, clientHeight: 400, scrollTop: 80 })
    const root = mountCard(scrollport)
    const dispose = forgeEventTailKeepEffect(root)
    // 增高 +40：增高前 distance = 500-80-400-40 = -20 ≤ 25 → 落底 scrollTop = 100
    geometry.mockReturnValue({ height: 140 } as DOMRect)
    FakeResizeObserver.instances[0]!.callback()
    expect(scrollport.scrollTop).toBe(100)
    dispose()
  })

  it('增高前偏离超容差（用户上滚阅读）→ 不拉拽（scrollTop 不变）', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    geometry.mockReturnValue({ height: 100 } as DOMRect)
    // 增高 +40，增高前 distance = 500-420-100-40 = -60？——scrollTop=0：distance = 500-0-400-40 = 60 > 25
    const scrollport = fakeScrollport({ scrollHeight: 500, clientHeight: 400, scrollTop: 0 })
    const root = mountCard(scrollport)
    const dispose = forgeEventTailKeepEffect(root)
    geometry.mockReturnValue({ height: 140 } as DOMRect)
    FakeResizeObserver.instances[0]!.callback()
    expect(scrollport.scrollTop).toBe(0)
    dispose()
  })

  it('收缩（grew ≤ 0）→ 零写回', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    geometry.mockReturnValue({ height: 140 } as DOMRect)
    const scrollport = fakeScrollport({ scrollHeight: 500, clientHeight: 400, scrollTop: 50 })
    const root = mountCard(scrollport)
    const dispose = forgeEventTailKeepEffect(root)
    geometry.mockReturnValue({ height: 100 } as DOMRect)
    FakeResizeObserver.instances[0]!.callback()
    expect(scrollport.scrollTop).toBe(50)
    dispose()
  })

  it('容差常量 = 25（官方 useScrollFollow threshold 同源 pin）', () => {
    expect(FORGE_TAIL_TOLERANCE_PX).toBe(25)
  })

  it('root 缺席 / 无 ResizeObserver 环境 → 零操作解绑器', () => {
    expect(forgeEventTailKeepEffect(null)()).toBeUndefined()
    const saved = globalThis.ResizeObserver
    // @ts-expect-error 环境面拆除（jsdom/happy-dom 形态）
    delete globalThis.ResizeObserver
    expect(forgeEventTailKeepEffect(document.createElement('div'))()).toBeUndefined()
    vi.stubGlobal('ResizeObserver', saved)
  })
})
