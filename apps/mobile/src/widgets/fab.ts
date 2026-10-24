/**
 * 悬浮球（拖拽 / 贴边收纳透明半圆）——任务浮层入口。
 * 纯几何面（单测主战场）：snapToEdge 钳制 + 就近贴边；
 * DOM 装配 = pointer 拖拽（阈值外为拖动、内为点按激活），释放即贴边半圆。
 */

export const FAB_SIZE = 48
export const FAB_MARGIN = 12
/** 移动超过此像素视为拖拽（否则点按）。 */
export const FAB_DRAG_THRESHOLD = 6

export interface FabPosition {
  readonly x: number
  readonly y: number
  readonly edge: 'left' | 'right'
}

/** 钳制到视口内 + 中线就近贴边。 */
export function snapToEdge(x: number, y: number, vw: number, vh: number, size = FAB_SIZE, margin = FAB_MARGIN): FabPosition {
  const cx = Math.min(Math.max(x, margin), Math.max(margin, vw - size - margin))
  const cy = Math.min(Math.max(y, margin), Math.max(margin, vh - size - margin))
  return { x: cx, y: cy, edge: cx + size / 2 <= vw / 2 ? 'left' : 'right' }
}

export interface FabOptions {
  readonly onActivate: () => void
}

export interface FabHandle {
  readonly root: HTMLElement
  /** 贴边收纳（半圆形态）。 */
  settle(): void
}

export function createFab(options: FabOptions): FabHandle {
  const root = document.createElement('button')
  root.className = 'fab'
  root.type = 'button'
  root.title = '任务'
  root.setAttribute('aria-label', '任务浮层')
  root.innerHTML = '<svg class="ic"><use href="#i-menu"/></svg>'

  let dragging = false
  let startX = 0
  let startY = 0
  let moved = false

  const place = (position: FabPosition): void => {
    root.style.left = `${position.x}px`
    root.style.top = `${position.y}px`
    root.classList.toggle('edge-left', position.edge === 'left')
    root.classList.toggle('edge-right', position.edge === 'right')
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    dragging = true
    moved = false
    startX = event.clientX
    startY = event.clientY
    root.setPointerCapture(event.pointerId)
  })
  root.addEventListener('pointermove', (event) => {
    if (!dragging) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!moved && Math.hypot(dx, dy) <= FAB_DRAG_THRESHOLD) return
    moved = true
    root.classList.add('dragging')
    const rect = root.getBoundingClientRect()
    place(snapToEdge(rect.left + dx, rect.top + dy, window.innerWidth, window.innerHeight))
    startX = event.clientX
    startY = event.clientY
  })
  root.addEventListener('pointerup', (event) => {
    if (!dragging) return
    dragging = false
    root.classList.remove('dragging')
    root.releasePointerCapture(event.pointerId)
    if (moved) settle()
    else options.onActivate()
  })
  root.addEventListener('pointercancel', () => {
    dragging = false
    root.classList.remove('dragging')
  })

  function settle(): void {
    const rect = root.getBoundingClientRect()
    place(snapToEdge(rect.left, rect.top, window.innerWidth, window.innerHeight))
    root.classList.add('settled')
  }

  return { root, settle }
}
