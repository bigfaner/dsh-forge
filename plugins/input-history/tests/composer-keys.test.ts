// 键位源 + mention 菜单态守卫单测（composer-correction plugin.ts:1479-1656 判例移植）：
// 官方服务面菜单开合判定 / DOM 弹层降级判定 / 守卫组装 / DOM 方向键源（菜单开不抢键、
// preventDefault = 吞键）/ 编辑面目标与光标偏移判定。
import { describe, expect, it, vi } from 'vitest'
import {
  composerMenuGuardOf,
  createComposerDomKeySource,
  caretOffsetInEditor,
  domMenuPopupOpen,
  isComposerEditableTarget,
  officialMenuOpenOf,
  type ForgeComposerDomKeyEvent,
  type ForgeComposerEventTarget,
  type ForgeComposerMenuDocument,
} from '../src/client/composer-keys.js'

/** 可编辑 target（官方 ComposerContentEditable 消费切片——contenteditable + lexical 标记） */
function editableTarget(): unknown {
  return { closest: (s: string) => (s === '[contenteditable="true"]' ? { __lexicalEditor: {} } : undefined) }
}

function plainTarget(): unknown {
  return { closest: () => undefined }
}

describe('officialMenuOpenOf（官方服务面菜单开合判定）', () => {
  const resolverWithLauncher = (snapshot: unknown): unknown => ({
    inputTriggers: () => ({ launcher: { getSnapshot: () => snapshot } }),
  })

  it('launcher 非空 = 菜单开（slash/mention 共用弹层壳）', () => {
    expect(officialMenuOpenOf(resolverWithLauncher('command'), 's1')).toBe(true)
  })

  it('launcher null = 菜单关', () => {
    expect(officialMenuOpenOf(resolverWithLauncher(null), 's1')).toBe(false)
  })

  it('解析器/inputTriggers/launcher 任一缺席或形状漂移 = undefined（调用方降级 DOM）', () => {
    expect(officialMenuOpenOf(undefined, 's1')).toBeUndefined()
    expect(officialMenuOpenOf({}, 's1')).toBeUndefined()
    expect(officialMenuOpenOf({ inputTriggers: 'not-a-function' }, 's1')).toBeUndefined()
    expect(officialMenuOpenOf({ inputTriggers: () => ({}) }, 's1')).toBeUndefined()
    expect(officialMenuOpenOf({ inputTriggers: () => ({ launcher: {} }) }, 's1')).toBeUndefined()
  })

  it('调用异常 = undefined（fail-soft）', () => {
    expect(
      officialMenuOpenOf(
        {
          inputTriggers: () => {
            throw new Error('boom')
          },
        },
        's1',
      ),
    ).toBeUndefined()
  })
})

describe('domMenuPopupOpen（DOM 弹层降级判定）', () => {
  function docWithOptions(count: number): ForgeComposerMenuDocument {
    return { querySelectorAll: (selectors: string) => (selectors.includes('[role="option"]') ? { length: count } : undefined) }
  }

  it('listbox 容器内有 option 行 = 菜单弹层开', () => {
    expect(domMenuPopupOpen(docWithOptions(3))).toBe(true)
  })

  it('无 option 行 = 关；文档缺席/查询异常 = false（不拦键）', () => {
    expect(domMenuPopupOpen(docWithOptions(0))).toBe(false)
    expect(domMenuPopupOpen(undefined)).toBe(false)
    expect(domMenuPopupOpen({})).toBe(false)
    expect(
      domMenuPopupOpen({
        querySelectorAll: () => {
          throw new Error('boom')
        },
      }),
    ).toBe(false)
  })
})

describe('composerMenuGuardOf（守卫组装：官方优先 → DOM 降级）', () => {
  it('官方面可读 = 官方判定', () => {
    const ctx = {
      reflect: {
        get: (name: string) =>
          name === 'conversation'
            ? { input: { inputTriggers: () => ({ launcher: { getSnapshot: () => null } }) } }
            : undefined,
      },
    }
    expect(composerMenuGuardOf(ctx, undefined)('s1')).toBe(false)
  })

  it('官方面缺席 = DOM 弹层降级；两径皆不可得 = false', () => {
    const doc: ForgeComposerMenuDocument = { querySelectorAll: () => ({ length: 2 }) }
    expect(composerMenuGuardOf({}, doc)('s1')).toBe(true)
    expect(composerMenuGuardOf({}, undefined)('s1')).toBe(false)
  })
})

describe('createComposerDomKeySource（DOM 方向键源）', () => {
  function fakeDoc(): ForgeComposerEventTarget & { dispatch(key: string, target: unknown): { prevented: boolean } } {
    let listener: ((event: ForgeComposerDomKeyEvent) => void) | undefined
    const target: ForgeComposerEventTarget = {
      addEventListener: (_type, l) => {
        listener = l
      },
      removeEventListener: () => {
        listener = undefined
      },
    }
    return Object.assign(target, {
      dispatch(key: string, eventTarget: unknown): { prevented: boolean } {
        const ev = { prevented: false }
        listener?.({
          key,
          target: eventTarget,
          preventDefault: () => {
            ev.prevented = true
          },
          stopImmediatePropagation: () => {},
        })
        return ev
      },
    })
  }

  it('订阅捕获段 keydown；方向键 + 编辑面内 + 菜单关 = 转发且 preventDefault 吞键', () => {
    const doc = fakeDoc()
    const handler = vi.fn()
    const dispose = createComposerDomKeySource(doc, () => false, handler)
    expect(typeof dispose).toBe('function')
    const event = doc.dispatch('ArrowUp', editableTarget())
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]![0].key).toBe('ArrowUp')
    expect(event.prevented).toBe(false) // 吞键由 handler 侧 preventDefault 决定
    handler.mock.calls[0]![0].preventDefault()
    expect(event.prevented).toBe(true) // 吞键语义：event.preventDefault 透传
    dispose!()
  })

  it('mention 菜单开 = 不转发（键归官方菜单导航——不抢键）', () => {
    const doc = fakeDoc()
    const handler = vi.fn()
    createComposerDomKeySource(doc, () => true, handler)
    doc.dispatch('ArrowUp', editableTarget())
    doc.dispatch('ArrowDown', editableTarget())
    expect(handler).not.toHaveBeenCalled()
  })

  it('非方向键 / 非编辑面 target = 不转发', () => {
    const doc = fakeDoc()
    const handler = vi.fn()
    createComposerDomKeySource(doc, () => false, handler)
    doc.dispatch('Enter', editableTarget())
    doc.dispatch('ArrowUp', plainTarget())
    expect(handler).not.toHaveBeenCalled()
  })

  it('文档缺席/订阅面漂移 = undefined（调用方 fail-soft 跳过）', () => {
    expect(createComposerDomKeySource(undefined, () => false, vi.fn())).toBeUndefined()
    expect(createComposerDomKeySource({} as ForgeComposerEventTarget, () => false, vi.fn())).toBeUndefined()
  })
})

describe('isComposerEditableTarget / caretOffsetInEditor', () => {
  it('target 在带 lexical 标记的 contenteditable 内 = true；漂移 = false 不接键', () => {
    expect(isComposerEditableTarget(editableTarget())).toBe(true)
    expect(isComposerEditableTarget(plainTarget())).toBe(false)
    expect(isComposerEditableTarget(null)).toBe(false)
    expect(isComposerEditableTarget({ closest: () => undefined })).toBe(false)
  })

  it('caretOffsetInEditor：anchor 相对编辑面 root 的前缀文本长度 + 段内偏移', () => {
    const a = { nodeType: 3, textContent: 'ab' }
    const b = { nodeType: 3, textContent: 'cd' }
    const root = { childNodes: [a, b] }
    expect(caretOffsetInEditor(root, a, 1)).toBe(1)
    expect(caretOffsetInEditor(root, b, 2)).toBe(4)
    expect(caretOffsetInEditor(root, null, 0)).toBeUndefined()
  })

  it('bug: 草稿首部空行后首个非空行行首 ≠ 文档起点（段落间隙计 \\n，偏移非 0 不触发翻阅）', () => {
    // 草稿 "\n\nfoo"：root > [空p, 空p, p("foo")]，光标在 "foo" 文本节点开头
    const foo = { nodeType: 3, textContent: 'foo' }
    const root = { childNodes: [{ childNodes: [] }, { childNodes: [] }, { childNodes: [foo] }] }
    expect(caretOffsetInEditor(root, foo, 0)).toBe(2) // 两处段落间隙各计 1
  })

  it('bug: 光标在首部之后的空行段内 ≠ 文档起点（首行行首仍 = 起点，翻阅门保留）', () => {
    // 草稿 "\n\nb"：root > [空p, 空p, p("b")]，光标锚在第二个空段（元素锚，行首）
    const secondEmpty = { childNodes: [] }
    const root = { childNodes: [{ childNodes: [] }, secondEmpty, { childNodes: [{ nodeType: 3, textContent: 'b' }] }] }
    expect(caretOffsetInEditor(root, secondEmpty, 0)).toBe(1)
    // 对照：首个空段行首 = 文档起点 0（readline 语义：首行行首 ↑ 触发翻阅）
    expect(caretOffsetInEditor(root, root.childNodes![0], 0)).toBe(0)
  })

  it('bug: 行内 <br>（Shift+Enter）后的行首偏移计入换行', () => {
    // 段内 "ab<br>cd"，光标在 "cd" 开头：前缀 "ab" + <br> 换行 = 3
    const ab = { nodeType: 3, textContent: 'ab' }
    const br = { nodeType: 1, textContent: '', childNodes: [] }
    const cd = { nodeType: 3, textContent: 'cd' }
    const root = { childNodes: [{ childNodes: [ab, br, cd] }] }
    expect(caretOffsetInEditor(root, cd, 0)).toBe(3)
  })
})
