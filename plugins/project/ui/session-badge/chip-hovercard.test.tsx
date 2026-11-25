// 会话头 chip 信息卡承载面单测（真实 DOM 链路，happy-dom）——官方头容器裁剪判例：
// 自绘 absolute 卡片渲染在 `conversation.session.header.actions` 槽内，官方头容器
// `overflow: clip`（实机 titleCluster 高 36px）把向下展开的卡片整张裁掉，只剩顶边一条线。
// 断言面：卡片经官方 HoverCard portal 落 document.body（不在 chip 宿主子树内——
// 头容器裁不到）；悬停延时展开、指针离开过宽限期收起、键盘聚焦展开。
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { SessionWorktreeChip } from './chip.js'

const OPEN_DELAY_MS = 150
/** 官方 pointer-grace：指针离开后 200ms 内回来则不收起 */
const POINTER_GRACE_MS = 200

describe('SessionWorktreeChip × 官方 HoverCard（信息卡 portal 到 body）', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers()
    // 桌面悬停能力位（HoverCard 入口守卫——pointerType mouse 时须 any-hover: hover）
    window.matchMedia = ((query: string) =>
      ({ matches: true, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
    host = document.createElement('div')
    // 官方头容器形态锚：裁剪容器（jsdom 无布局，裁剪本身由「卡片不在其子树内」证伪）
    host.setAttribute('data-header-actions', '')
    host.style.overflow = 'clip'
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
  })

  const anchor = (): HTMLElement => {
    const el = host.querySelector<HTMLElement>('[data-dswt-session-chip]')
    if (el === null) throw new Error('chip 锚缺席')
    return el
  }
  const card = (): Element | null => document.querySelector('[data-dswt-session-chip-popover]')
  const pointer = (type: 'pointerover' | 'pointerout', target: HTMLElement, relatedTarget: EventTarget | null): void => {
    act(() => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', relatedTarget }))
    })
  }

  it('悬停 → 延时后卡片落 document.body（portal），不在会被裁剪的头容器子树内', async () => {
    await act(async () => {
      root.render(
        <SessionWorktreeChip isGit branch="plugins" worktreeName="plugins" worktreePath="Z:/r/.forge/worktrees/plugins" projectRoot="Z:/r" aheadBehind={{ ahead: 7, behind: 0 }} />,
      )
    })
    expect(card()).toBeNull() // 初始收起
    pointer('pointerover', anchor(), document.body)
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS - 1))
    expect(card(), '延时未到不展开').toBeNull()
    act(() => vi.advanceTimersByTime(1))
    const el = card()
    expect(el, '悬停延时后信息卡展开').not.toBeNull()
    expect(document.body.contains(el)).toBe(true)
    expect(host.contains(el), '卡片不得留在头容器子树内（overflow:clip 裁剪面）').toBe(false)
    expect(el!.textContent).toContain('工作区')
    expect(el!.textContent).toContain('Z:/r/.forge/worktrees/plugins')
    expect(el!.textContent).toContain('7↑')
  })

  it('指针离开 → 过宽限期收起；宽限期内回来 → 不收起', async () => {
    await act(async () => {
      root.render(<SessionWorktreeChip isGit branch="b" worktreeName="w" />)
    })
    pointer('pointerover', anchor(), document.body)
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS))
    expect(card()).not.toBeNull()
    pointer('pointerout', anchor(), document.body)
    act(() => vi.advanceTimersByTime(POINTER_GRACE_MS - 1))
    expect(card(), '宽限期内保持展开（指针可跨间隙进入卡片）').not.toBeNull()
    pointer('pointerover', anchor(), document.body)
    act(() => vi.advanceTimersByTime(POINTER_GRACE_MS))
    expect(card(), '宽限期内回来 = 取消收起').not.toBeNull()
    pointer('pointerout', anchor(), document.body)
    act(() => vi.advanceTimersByTime(POINTER_GRACE_MS))
    expect(card(), '指针真正离开后收起').toBeNull()
  })

  it('点击锚点 = 收起（HoverCard 固有语义——卡片非点击开合控件）', async () => {
    await act(async () => {
      root.render(<SessionWorktreeChip isGit branch="b" worktreeName="w" />)
    })
    pointer('pointerover', anchor(), document.body)
    act(() => vi.advanceTimersByTime(OPEN_DELAY_MS))
    expect(card()).not.toBeNull()
    act(() => {
      anchor().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(card(), '点击锚点后收起').toBeNull()
  })

  it('非 git 项目：零注入（不渲染 HoverCard 锚）', async () => {
    await act(async () => {
      root.render(<SessionWorktreeChip isGit={false} branch="b" worktreeName="w" />)
    })
    expect(host.textContent).toBe('')
    expect(host.querySelector('[data-dswt-session-chip]')).toBeNull()
  })
})
