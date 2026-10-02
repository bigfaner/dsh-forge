// 三区槽位定义（定位：基础）——zones 容器的域内容注入面（AC「视图内容经槽位注入」的唯一通道）。
// zones 只渲染槽位与布局机制，不含任何域内容（依赖铁律① 基础↛业务）；域视图经装配（2.12）注入：
// rail = 官方 sidebar/ForgeSidebar（2.7 槽位路线 A）、session = views/session（2.11）、
// knowledge = views/knowledge/KnowledgeView（3.8——UF-6 浏览面装配壳）；各槽位缺省渲染机制占位。
import type { ReactNode } from 'react'
import type { DockTabRecord } from './dock.js'

/** 三区槽位（全部可选——缺省 = 机制占位 / 空轨） */
export interface WorkbenchZoneSlots {
  /** 左 rail 槽（常驻；官方 ui-sidebar 形态，宽度与收起由 rail 内容自管理——UF-1 归 2.7） */
  readonly rail?: ReactNode
  /** 中区·会话视图槽（workbench/session 视图态内容；UF-4 归 2.11，召回 tab 接线 3.8） */
  readonly session?: ReactNode
  /** 中区·知识视图槽（workbench/knowledge 视图态内容；UF-6 浏览面装配壳归 3.8） */
  readonly knowledge?: ReactNode
  /** dock 页签内容渲染面（按激活页签渲染域内容；缺省 = 机制内容占位） */
  readonly renderDockTab?: (tab: DockTabRecord) => ReactNode
}
