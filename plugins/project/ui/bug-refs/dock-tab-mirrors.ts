// dock tab 官方面结构同型镜像（定位：装配——bundle 自含纪律：本文件零上游 import）。
// Bug 台账 pane body（BugPreview）消费的官方 dockkit tab 窄切片在此字面承载，与
// apps/web workbench/dock-tabs.ts 同源同形——漂移由 bug-preview.test 字面 pin 对账。
import type { ReactNode } from 'react'

/** 官方 tab 记录动作面窄面（SidebarRightTabActions 消费切片——结构同型镜像） */
export interface DockTabActionsMirror {
  /** 从本 tab 开资源（dock 开资源 tab——落在本 tab 所在窗格；kind 具名开） */
  openResource(address: string, options?: { readonly kind?: string }): void
}

/** 官方 tab 记录窄面（TabRecord 消费切片——contentId = 资源地址） */
export interface DockTabRecordMirror {
  readonly kind: string
  readonly contentId: string
  readonly actions?: DockTabActionsMirror
}

/** useTabInfo 钩子窄面（UseSidebarRightTabInfo 消费切片——seat inject 递达物） */
export interface UseDockTabInfoMirror {
  (): { readonly tab: DockTabRecordMirror }
}

/**
 * tabInfo 读取子件（钩子形制：可选 tabInfo 钩子经子件无条件调用——在场性
 * 中途变化不漂移；渲染面 = children 渲染递_props）。
 */
export function TabInfoReader({
  hook,
  children,
}: {
  readonly hook: UseDockTabInfoMirror
  readonly children: (info: { readonly tab: DockTabRecordMirror }) => ReactNode
}): ReactNode {
  const info = hook()
  return children(info)
}
