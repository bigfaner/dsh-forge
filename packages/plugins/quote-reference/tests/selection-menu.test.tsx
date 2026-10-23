// @vitest-environment happy-dom
// 选区浮出菜单全链路单测（真实 DOM——happy-dom）：物化（mouseup）→ 触发（scope 过滤）
// → 菜单（primitives Menu portal）→ 落 chip（insertReferenceAtTail 同径）→ 聚焦。
import { beforeEach, describe, expect, it } from 'vitest'
import {
  extractSelection,
  insertReferenceAtTail,
  mountSelectionMenu,
  referenceApplied,
  resolveSelectionSource,
  tailSpanOf,
  type QuoteInsertServices,
  type SelectionExtraction,
} from '../src/client/selection-menu.js'
import { createQuoteReferenceSource, QUOTE_REF_PREFIX, type QuoteReferenceSource } from '../src/client/quote-source.js'
import { DEFAULT_SELECTION_ROOTS } from '../src/client/scope.js'
import { mountQuoteSelectionMenu } from '../src/client/index.js'

const PARA_TEXT = '文本引用锚定的核心是把一段选区映射为稳定描述符。'

/** 组装可划选 DOM：scope 域内段落 + 编辑域 + 域外文本。 */
function seedDom(): void {
  document.body.innerHTML = `
    <div data-chat-flow>
      <p id="para">${PARA_TEXT}</p>
      <div id="box" contenteditable="true">编辑域文本</div>
    </div>
    <div id="outside">域外文本</div>
  `
}

/** 划选段落全部文本（真实 Selection + Range）。 */
function selectPara(): void {
  const para = document.getElementById('para')
  if (para === null) throw new Error('missing #para')
  const range = document.createRange()
  range.selectNodeContents(para)
  const selection = document.getSelection()
  if (selection === null) throw new Error('missing selection')
  selection.removeAllRanges()
  selection.addRange(range)
}

/** composer 输入 face 桩（state 快照 + focus 间谍）。 */
type OccurrenceStub = string | { offset: number; length: number; clipboardText: string }
interface FaceSpy {
  focusCalls: number
  snapshot: { draft: string; draftRev: number; occurrences: OccurrenceStub[] }
  face: {
    focus(): void
    state: { getSnapshot(): { draft: string; draftRev: number; occurrences: readonly OccurrenceStub[] } }
  }
}

function makeFaceSpy(): FaceSpy {
  const spy: FaceSpy = {
    focusCalls: 0,
    snapshot: { draft: '', draftRev: 3, occurrences: [] },
    face: undefined as never,
  }
  spy.face = {
    focus() {
      spy.focusCalls += 1
    },
    state: {
      getSnapshot: () => spy.snapshot,
    },
  }
  return spy
}

/** bail 桩：应用插入（草稿尾接 clipboardText + occurrences 增长）并记录载荷。 */
function makeServices(face: FaceSpy, bailImpl?: (payload: unknown) => unknown): {
  services: QuoteInsertServices
  bails: Array<{ name: string; payload: { reference: { ref: string; clipboardText: string }; span: unknown } }>
} {
  const bails: Array<{ name: string; payload: { reference: { ref: string; clipboardText: string }; span: unknown } }> = []
  const services: QuoteInsertServices = {
    sessions: { binding: (sessionId) => (sessionId === 's-1' ? { ctx: { mark: 'actx' } } : undefined) },
    conversation: { input: { for: () => face.face } },
    bail: (_actx, name, payload) => {
      bails.push({ name, payload: payload as { reference: { ref: string; clipboardText: string }; span: unknown } })
      if (bailImpl !== undefined) return bailImpl(payload)
      const p = payload as { reference: { clipboardText: string } }
      face.snapshot = {
        draft: face.snapshot.draft + p.reference.clipboardText,
        draftRev: face.snapshot.draftRev + 1,
        occurrences: [...face.snapshot.occurrences, p.reference.clipboardText],
      }
      return true
    },
  }
  return { services, bails }
}

function makeSource(): QuoteReferenceSource {
  return createQuoteReferenceSource()
}

interface MountSpy {
  dispose(): void
}

function mount(deps: Partial<Parameters<typeof mountSelectionMenu>[0]> = {}): MountSpy {
  return mountSelectionMenu({
    doc: document,
    roots: DEFAULT_SELECTION_ROOTS,
    resolveSessionId: () => 's-1',
    source: makeSource(),
    services: makeServices(makeFaceSpy()).services,
    ...deps,
  })
}

function menuItems(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="menuitem"]'))
}

beforeEach(() => {
  seedDom()
})

describe('extractSelection（DOM → SelectionProbe 提取）', () => {
  it('scope 域内非折叠选区：collapsed=false / editable=false / scopeRoot 命中声明选择器', () => {
    selectPara()
    const probe: SelectionExtraction = extractSelection(document, DEFAULT_SELECTION_ROOTS)
    expect(probe.collapsed).toBe(false)
    expect(probe.editableTarget).toBe(false)
    expect(probe.overlayRole).toBeNull()
    expect(probe.scopeRoot).toBe('[data-chat-flow]')
    expect(probe.text).toBe(PARA_TEXT)
  })

  it('编辑域选区：editableTarget=true（contenteditable 内——input/textarea 内选区不进 document Selection，排除集同判）', () => {
    const box = document.getElementById('box')
    if (box === null) throw new Error('missing #box')
    const range = document.createRange()
    range.selectNodeContents(box)
    const selection = document.getSelection()
    if (selection === null) throw new Error('missing selection')
    selection.removeAllRanges()
    selection.addRange(range)
    expect(extractSelection(document, DEFAULT_SELECTION_ROOTS).editableTarget).toBe(true)
  })

  it('折叠选区：collapsed=true（文本空）', () => {
    const selection = document.getSelection()
    if (selection === null) throw new Error('missing selection')
    selection.removeAllRanges()
    expect(extractSelection(document, DEFAULT_SELECTION_ROOTS).collapsed).toBe(true)
  })

  it('scope 域外选区：scopeRoot=null（声明外划选域不触发）', () => {
    const outside = document.getElementById('outside')
    if (outside === null) throw new Error('missing #outside')
    const range = document.createRange()
    range.selectNodeContents(outside)
    const selection = document.getSelection()
    if (selection === null) throw new Error('missing selection')
    selection.removeAllRanges()
    selection.addRange(range)
    expect(extractSelection(document, DEFAULT_SELECTION_ROOTS).scopeRoot).toBeNull()
  })
})

describe('resolveSelectionSource（1.32 source 语义：doc=相对路径 / sessionMsg=行序）', () => {
  it('文档预览选区：sourceType=doc + sourcePath=data-textpreview-path 投影文本', () => {
    document.body.innerHTML = `
      <div data-dockkit-pane>
        <div data-document-preview="tab-1">
          <div data-textpreview-path="true">docs/dockkit.md</div>
          <p id="dpara">预览正文</p>
        </div>
      </div>`
    const para = document.getElementById('dpara')
    if (para === null) throw new Error('missing #dpara')
    expect(resolveSelectionSource(document, para.firstChild)).toEqual({
      sourceType: 'doc',
      sourcePath: 'docs/dockkit.md',
    })
  })

  it('会话消息选区：sourceType=sessionMsg + sourceSeq=anchor 行在 chat flow 内的序数（1 起）', () => {
    document.body.innerHTML = `
      <div data-chat-flow>
        <div data-chat-anchor-key="a" data-chat-flow-kind="user"><p id="m1">第一条</p></div>
        <div data-chat-anchor-key="b" data-chat-flow-kind="assistant"><p id="m2">第二条</p></div>
      </div>`
    const m2 = document.getElementById('m2')
    if (m2 === null) throw new Error('missing #m2')
    expect(resolveSelectionSource(document, m2.firstChild)).toEqual({
      sourceType: 'sessionMsg',
      sourceSeq: 2,
    })
  })

  it('两者皆非（域外/无 path 投影/无 anchor 行）：undefined——serialize 不出 source 属性', () => {
    document.body.innerHTML = '<div id="bare">裸文本</div>'
    const bare = document.getElementById('bare')
    if (bare === null) throw new Error('missing #bare')
    expect(resolveSelectionSource(document, bare.firstChild)).toBeUndefined()
    expect(resolveSelectionSource(document, null)).toBeUndefined()
  })
})

describe('selection-menu 全链路（mouseup → 菜单 → 落 chip → 聚焦）', () => {
  it('物化→触发→菜单 portal 到 body（单行「添加到对话」）；划选进行中不抢焦点', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    const handle = mount({ services })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    const items = menuItems()
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toContain('添加到对话')
    // 划选进行中不抢焦点：菜单在场但 composer 未被聚焦
    expect(face.focusCalls).toBe(0)
    handle.dispose()
  })

  it('点击落 chip：insertReferenceAtTail 同径（tail span-CAS + bail slash/input-insert-reference）+ 快照入池 + 自动聚焦 + 收菜单', () => {
    const face = makeFaceSpy()
    const { services, bails } = makeServices(face)
    const source = makeSource()
    const handle = mount({ services, source })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    const item = menuItems()[0]
    if (item === undefined) throw new Error('menu did not materialize')
    item.click()
    // bail 同径载荷：官方事件名 + reference + tail span-CAS（draft 尾 + 当前 draftRev）
    expect(bails).toHaveLength(1)
    expect(bails[0]!.name).toBe('slash/input-insert-reference')
    const payload = bails[0]!.payload
    expect(payload.reference.ref.startsWith(QUOTE_REF_PREFIX)).toBe(true)
    expect(payload.span).toEqual({ start: 0, end: 0, draftRev: 3 })
    // bug aced6f28 形状改判：clipboardText = `〔引用：…〕`——uuid 不入明面
    expect(payload.reference.clipboardText).toContain('〔引用：')
    expect(payload.reference.clipboardText).not.toContain(QUOTE_REF_PREFIX)
    // 快照入池（serialize 可取全文块）
    const ref = payload.reference.ref
    expect(source.codec.clipboardText(ref)).toBe(payload.reference.clipboardText)
    // 自动聚焦 composer 输入区 + 菜单收起
    expect(face.focusCalls).toBe(1)
    expect(menuItems()).toHaveLength(0)
    handle.dispose()
  })

  it('bug（fix-7 ①）: 菜单自身 mouseup 不参与选区裁定——真实点击序列（mousedown 折叠选区 + menu 上 mouseup）不抢先收层，click 仍落 chip', () => {
    const face = makeFaceSpy()
    const { services, bails } = makeServices(face)
    const handle = mount({ services })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(1)
    // 真实点击序列：mousedown 落在 menu 上折叠选区 → menu 容器内 mouseup 冒泡到 document
    const selection = document.getSelection()
    if (selection === null) throw new Error('missing selection')
    selection.removeAllRanges() // 模拟 mousedown 折叠选区
    const item = menuItems()[0]!
    // 官方 Menu portal 到 body（容器外）——以官方 role="menu" 锚定位弹层自身
    const menuEl = item.closest('[role="menu"]')
    if (menuEl === null) throw new Error('missing menu element')
    menuEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    // 菜单须仍在场（未被收层）——随后 click 才能落到 onSelect
    expect(menuItems()).toHaveLength(1)
    item.click()
    expect(bails).toHaveLength(1)
    expect(face.focusCalls).toBe(1)
    expect(menuItems()).toHaveLength(0)
    handle.dispose()
  })

  it('全屏面：focusFullscreenInput 提供时聚焦替身（对应面聚焦，不落主 face 焦点间谍）', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    let fullscreenFocused = 0
    const handle = mount({
      services,
      focusFullscreenInput: () => {
        fullscreenFocused += 1
        return true
      },
    })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(fullscreenFocused).toBe(1)
    expect(face.focusCalls).toBe(0)
    handle.dispose()
  })

  it('全屏面：focusFullscreenInput 返回 false（替身不在场）= 回落主 composer face 聚焦', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    let attempted = 0
    const handle = mount({
      services,
      focusFullscreenInput: () => {
        attempted += 1
        return false
      },
    })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(attempted).toBe(1)
    expect(face.focusCalls).toBe(1)
    handle.dispose()
  })

  it('过滤：折叠选区 / 编辑域 / scope 域外 = 菜单不物化', () => {
    const handle = mount()
    const selection = document.getSelection()
    if (selection === null) throw new Error('missing selection')
    // 折叠选区
    selection.removeAllRanges()
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(0)
    // 编辑域选区（contenteditable）
    const box = document.getElementById('box')!
    const boxRange = document.createRange()
    boxRange.selectNodeContents(box)
    selection.removeAllRanges()
    selection.addRange(boxRange)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(0)
    // scope 域外
    const outside = document.getElementById('outside')!
    const range = document.createRange()
    range.selectNodeContents(outside)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(0)
    handle.dispose()
  })

  it('roots 空清单 = 静默不挂监听（零固定税：合法选区也不弹）', () => {
    const handle = mount({ roots: [] })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(0)
    handle.dispose()
  })

  it('无活跃会话（resolveSessionId → undefined）= fail-soft 收菜单零插入', () => {
    const face = makeFaceSpy()
    const { services, bails } = makeServices(face)
    const handle = mount({ services, resolveSessionId: () => undefined })
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(bails).toHaveLength(0)
    expect(face.focusCalls).toBe(0)
    expect(menuItems()).toHaveLength(0)
    handle.dispose()
  })

  it('dispose：监听摘除 + portal 卸载（mouseup 后不再物化）', () => {
    const handle = mount()
    handle.dispose()
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(menuItems()).toHaveLength(0)
  })
})

describe('mountQuoteSelectionMenu 生产装配（bug 1ab2f4e6 全屏聚焦缝接线）', () => {
  /** 带 superComposer 服务的最小 ctx（cordis reflect 缝——super-composer provide 面同型）。 */
  function ctxWithSuperComposer(focusImpl?: () => boolean): {
    ctx: Parameters<typeof mountQuoteSelectionMenu>[0]
    focusCalls: () => number
    faceFocusCalls: () => number
  } {
    const face = makeFaceSpy()
    const { services, bails } = makeServices(face)
    let focused = 0
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ byId: { 's-1': { id: 's-1', retainedBy: { mainView: 1 } } } }) },
        binding: services.sessions.binding,
      },
      conversation: services.conversation,
      bail: services.bail,
      reflect: {
        get: (name: string) =>
          name === 'superComposer'
            ? {
                focusFullscreenInput: () => {
                  focused += 1
                  return focusImpl === undefined ? true : focusImpl()
                },
              }
            : name === 'conversation'
              ? services.conversation
              : undefined,
      },
    }
    return { ctx: ctx as unknown as Parameters<typeof mountQuoteSelectionMenu>[0], focusCalls: () => focused, faceFocusCalls: () => face.focusCalls, bails }
  }

  it('ctx 读到 superComposer 服务 = 落 chip 聚焦替身输入（不落主 composer face）', () => {
    const { ctx, focusCalls, faceFocusCalls, bails } = ctxWithSuperComposer()
    const handle = mountQuoteSelectionMenu(ctx)
    expect(handle).toBeDefined()
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(bails).toHaveLength(1)
    expect(focusCalls()).toBe(1)
    expect(faceFocusCalls()).toBe(0)
    handle?.dispose()
  })

  it('superComposer 服务缺席 = 回落主 composer face 聚焦（非全屏常态）', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    const ctx = {
      sessions: {
        list: { getSnapshot: () => ({ byId: { 's-1': { id: 's-1', retainedBy: { mainView: 1 } } } }) },
        binding: services.sessions.binding,
      },
      conversation: services.conversation,
      bail: services.bail,
      reflect: { get: (name: string) => (name === 'conversation' ? services.conversation : undefined) },
    }
    const handle = mountQuoteSelectionMenu(ctx as unknown as Parameters<typeof mountQuoteSelectionMenu>[0])
    expect(handle).toBeDefined()
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(face.focusCalls).toBe(1)
    handle?.dispose()
  })

  it('superComposer 服务在场但替身不在场（focusFullscreenInput → false）= 回落主 composer face 聚焦', () => {
    const { ctx, focusCalls, faceFocusCalls } = ctxWithSuperComposer(() => false)
    const handle = mountQuoteSelectionMenu(ctx)
    selectPara()
    document.dispatchEvent(new MouseEvent('mouseup'))
    menuItems()[0]!.click()
    expect(focusCalls()).toBe(1)
    expect(faceFocusCalls()).toBe(1)
    handle?.dispose()
  })
})

describe('insertReferenceAtTail（同径插入纯编排——open-session 判例同构）', () => {
  it('tail span-CAS 构造：草稿末尾 + 当前 draftRev', () => {
    expect(tailSpanOf({ draft: 'abc', draftRev: 7 })).toEqual({ start: 3, end: 3, draftRev: 7 })
  })

  it('bug 043166fc: 草稿已含 chip 时 tail span 须用 detect 坐标（官方 span-map selectSpan 边界核销：span.end > detectLength = null → bail 拒绝 → 第二次添加静默 no-op）', () => {
    // 官方守卫镜像：InputState.draft 为 clipboard 投影（chip 展开为 token 全文），
    // 官方 $replaceDetectSpanWithNodes 以 detect 平面映射（chip 坍缩单字符）——
    // span.end 越界 detectLength 即拒绝。clipboard 长度 8 的 chip 使两平面差 7。
    const TOKEN = '〔引用：已有〕'
    const face = makeFaceSpy()
    face.snapshot = {
      draft: `ab${TOKEN} cd`, // clipboard 投影；detect 末尾 = draft.length − (TOKEN.length − 1)
      draftRev: 5,
      occurrences: [{ offset: 2, length: TOKEN.length, clipboardText: TOKEN }],
    }
    const detectLength = face.snapshot.draft.length - (TOKEN.length - 1)
    let rejectedSpan: unknown
    const { services, bails } = makeServices(face, (payload) => {
      const span = (payload as { span: { start: number; end: number } }).span
      const bound = face.snapshot.draft.length
        - face.snapshot.occurrences.reduce((n, o) => n + Math.max(0, (o.length ?? 1) - 1), 0)
      if (span.end > bound) {
        rejectedSpan = span
        return false
      }
      face.snapshot = {
        draft: face.snapshot.draft + '〔引用：新引用〕 ',
        draftRev: face.snapshot.draftRev + 1,
        occurrences: [...face.snapshot.occurrences, { offset: bound, length: 8, clipboardText: '〔引用：新引用〕' }],
      }
      return true
    })
    expect(
      insertReferenceAtTail(services, 's-1', {
        source: 'quote',
        ref: `${QUOTE_REF_PREFIX}u2`,
        label: '新引用',
        clipboardText: '〔引用：新引用〕',
      }),
    ).toBe(true)
    // 修复判据：span 落在 detect 末尾，而非 clipboard 末尾（被官方守卫拒绝）
    expect(rejectedSpan).toBeUndefined()
    expect(bails[0]?.payload.span).toEqual({ start: detectLength, end: detectLength, draftRev: 5 })
  })

  it('bail true = 已应用', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    expect(
      insertReferenceAtTail(services, 's-1', {
        source: 'quote',
        ref: `${QUOTE_REF_PREFIX}u1`,
        label: '摘要',
        clipboardText: '〔引用：摘要〕',
      }),
    ).toBe(true)
  })

  it('bail 返回值漂移（false）+ 症状级复核命中（occurrences 增长）= 仍判已应用（bug 2d5434d1 判例）', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face, () => {
      face.snapshot = {
        draft: face.snapshot.draft + '〔引用：摘要〕',
        draftRev: face.snapshot.draftRev + 1,
        occurrences: [...face.snapshot.occurrences, '〔引用：摘要〕'],
      }
      return false
    })
    expect(
      insertReferenceAtTail(services, 's-1', {
        source: 'quote',
        ref: `${QUOTE_REF_PREFIX}u1`,
        label: '摘要',
        clipboardText: '〔引用：摘要〕',
      }),
    ).toBe(true)
  })

  it('bail 未回 true 且复核无变化 = false（调用方 fail-soft）', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face, () => false)
    expect(
      insertReferenceAtTail(services, 's-1', {
        source: 'quote',
        ref: `${QUOTE_REF_PREFIX}u1`,
        label: '摘要',
        clipboardText: '〔引用：摘要〕',
      }),
    ).toBe(false)
  })

  it('binding 缺席 = false', () => {
    const face = makeFaceSpy()
    const { services } = makeServices(face)
    expect(
      insertReferenceAtTail(services, 's-other', {
        source: 'quote',
        ref: `${QUOTE_REF_PREFIX}u1`,
        label: '摘要',
        clipboardText: '〔引用：摘要〕',
      }),
    ).toBe(false)
  })

  it('referenceApplied 纯函数：occurrences 增长优先，草稿尾接投影兜底', () => {
    expect(referenceApplied({ draft: '', occurrences: [] }, { draft: '', occurrences: ['x'] }, 'x')).toBe(true)
    expect(referenceApplied({ draft: '', occurrences: [] }, { draft: '@[a](quote:u)', occurrences: [] }, '@[a](quote:u)')).toBe(true)
    expect(referenceApplied({ draft: '', occurrences: [] }, { draft: 'nope', occurrences: [] }, '@[a](quote:u)')).toBe(false)
  })
})
