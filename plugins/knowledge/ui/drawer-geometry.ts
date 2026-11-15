// 1.42 随 knowledge 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// 弹窗拖移/拖宽几何纯函数（自 views/overview/drawer 抽出——只取被用导出）：EntryDrawer
// 消费 defaultDrawerPosition/drawerPositionFromDrag/drawerWidthFromEdgeDrag（collapse.ts）
// 与 taskDrawerHeadDragProps/TaskDrawerDragKind（index.tsx）；任务弹窗本体与折叠会话
// 存储等其余导出归壳侧概览域不随迁。口径锚 m3.1 纠正版原型 #m31-tm（D21 交互数学面）。
import type { PointerEvent as ReactPointerEvent } from 'react'

/** 宽度下限（px） */
export const DRAWER_WIDTH_MIN = 320
/** 宽度上限（px） */
export const DRAWER_WIDTH_MAX = 760
/** 默认宽度（px）——双击复位值（原型 M31_TM_W = 440） */
export const DRAWER_WIDTH_DEFAULT = 440
/** 键盘步进（px）——← 加宽 +32 / → 收窄 -32 */
export const DRAWER_WIDTH_STEP = 32
/** 窄屏视口因子（上限 = min(760, 视口×0.92)——弹窗不越窄屏） */
export const DRAWER_VIEWPORT_FACTOR = 0.92
/** 拖移视口边距（px——原型 bindDragMove 钳制刻度 4） */
export const DRAWER_DRAG_MARGIN = 4
/** 默认起始位最小偏移（px——原型 openTaskModal max(8, …) 刻度） */
export const DRAWER_DEFAULT_MIN_OFFSET = 8
/** 默认起始位纵向比率（原型 openTaskModal：viewportHeight × 0.14） */
export const DRAWER_DEFAULT_TOP_RATIO = 0.14
/** 拖移纵向可达下界余量（px——标题栏恒可见：原型 Math.min(target.offsetHeight, 44) 刻度） */
export const DRAWER_DRAG_TOP_FLOOR = 44

/** 宽度上限（视口在场 = min(760, round(视口×0.92))；缺席 = 全幅 760） */
export function drawerWidthCeiling(viewportWidth?: number): number {
  if (viewportWidth === undefined) return DRAWER_WIDTH_MAX
  return Math.min(DRAWER_WIDTH_MAX, Math.round(viewportWidth * DRAWER_VIEWPORT_FACTOR))
}

/** 宽度钳制 [320, 上限]（NaN 防御 → 默认 420） */
export function clampDrawerWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) return DRAWER_WIDTH_DEFAULT
  const ceiling = drawerWidthCeiling(viewportWidth)
  const floor = Math.min(DRAWER_WIDTH_MIN, ceiling)
  return Math.min(ceiling, Math.max(floor, Math.round(width)))
}

/** 缘侧（左缘/右缘——拖宽方向语义） */
export type DrawerResizeEdge = 'left' | 'right'

/**
 * 缘侧拖宽数学（D21：左右缘拖宽——对侧锚定）：左缘 = 起宽 + 起点左移量（指针左移加宽）、
 * 右缘 = 起宽 + 起点右移量（指针右移加宽），钳制 [320, 上限]。
 */
export function drawerWidthFromEdgeDrag(
  edge: DrawerResizeEdge,
  startWidth: number,
  startClientX: number,
  clientX: number,
  viewportWidth?: number,
): number {
  const delta = edge === 'left' ? startClientX - clientX : clientX - startClientX
  return clampDrawerWidth(startWidth + delta, viewportWidth)
}

/** 弹窗位置（px——inline left/top；装载壳本地态，关闭即弃） */
export interface DrawerModalPosition {
  readonly left: number
  readonly top: number
}

/** 默认起始位（D21：水平居中 + 视口高 14%——原型 openTaskModal；8px 最小偏移） */
export function defaultDrawerPosition(viewportWidth: number, viewportHeight: number, width: number): DrawerModalPosition {
  return {
    left: Math.max(DRAWER_DEFAULT_MIN_OFFSET, Math.round((viewportWidth - width) / 2)),
    top: Math.max(DRAWER_DEFAULT_MIN_OFFSET, Math.round(viewportHeight * DRAWER_DEFAULT_TOP_RATIO)),
  }
}

/** 位置钳制（拖移期：左/上 ≥ 4px、右不越视口、标题栏恒可见——原型 bindDragMove 刻度） */
export function clampDrawerPosition(
  position: DrawerModalPosition,
  viewportWidth: number,
  viewportHeight: number,
  width: number,
): DrawerModalPosition {
  const margin = DRAWER_DRAG_MARGIN
  const widthClamped = Math.min(width, viewportWidth - 2 * margin)
  return {
    left: Math.min(Math.max(margin, Math.round(position.left)), Math.max(margin, viewportWidth - widthClamped - margin)),
    top: Math.min(Math.max(margin, Math.round(position.top)), Math.max(margin, viewportHeight - DRAWER_DRAG_TOP_FLOOR - margin)),
  }
}

/** 标题栏拖移位置数学（起位 + 指针位移，视口钳制） */
export function drawerPositionFromDrag(
  start: DrawerModalPosition,
  startClientX: number,
  startClientY: number,
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
  width: number,
): DrawerModalPosition {
  return clampDrawerPosition(
    { left: start.left + (clientX - startClientX), top: start.top + (clientY - startClientY) },
    viewportWidth,
    viewportHeight,
    width,
  )
}

// ───────────────── index.tsx 抽出（标题栏拖移接线 + 拖移种类） ─────────────────

/** 拖移会话种类（标题栏全窗拖移 / 左缘拖宽 / 右缘拖宽——装载壳几何计算定向） */
export type TaskDrawerDragKind = 'move' | 'resize-left' | 'resize-right'

/**
 * 标题栏拖移事件接线（装载/错误/骨架三面共用——D21 全窗拖移）：主键按住拖移、
 * 按钮（✕ 等）命中不劫持。
 */
export function taskDrawerHeadDragProps(
  onDragStart: (kind: TaskDrawerDragKind, clientX: number, clientY: number) => void,
  onDragMove: (clientX: number, clientY: number) => void,
  onDragEnd: () => void,
): {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  readonly onPointerUp: () => void
  readonly onPointerCancel: () => void
} {
  return {
    onPointerDown: (event) => {
      if ((event.target as HTMLElement).closest('button') !== null) return
      event.currentTarget.setPointerCapture(event.pointerId)
      onDragStart('move', event.clientX, event.clientY)
    },
    onPointerMove: (event) => {
      if ((event.buttons & 1) === 0) return // 仅主键按住拖拽
      onDragMove(event.clientX, event.clientY)
    },
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  }
}
