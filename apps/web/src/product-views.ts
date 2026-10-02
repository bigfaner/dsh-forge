// 产品视图发布面（定位：装配——壳 bundle 侧发布窗口全局 __DSH_FORGE_VIEWS__）。
// 动机：产品 client 插件 bundle 为自含 classic script（零 import/export——vite 形状 pin），
// 不能共享壳 chunk；槽位注册需要的 React 组件本体经本发布面以页内全局递达（与
// __DSH_FORGE_CLIENT__ 激活标记、__ModuleLoader__ 注册面同族的页内缝）。
// React 单例不变：发布件 = 壳 bundle 内的同一 React（平台模块表种子 = 壳模块本体），
// 官方渲染器渲染本件与官方件共享同一 hook/元素同一性。
// 求值序保证：main.ts 同步 import 本模块（页面模块求值期），插件 bundle 经 boot 注入
// 在就绪门放行后才装载——发布恒先于消费（缺席 = 装配断裂，插件 apply fail-loud）。
import type { ComponentType } from 'react'
import { ForgeWorkbenchPanel, type ForgeWorkbenchPanelProps } from './workbench/index.js'
import {
  ForgeBrandMark,
  ForgeBrandName,
  ForgeSidebarSlot,
  type ForgeBrandMarkProps,
  type ForgeBrandNameProps,
  type ForgeSidebarSlotProps,
} from './views/sidebar/index.js'

/** 发布面形状（client-plugin/plugin.ts 结构同型镜像——bundle 自持纪律，禁跨 chunk import） */
export interface ForgePublishedViews {
  /** sidebar.workspaces 洞位占用者（接线层：快照直读 + 项目 RPC + 动作绑定） */
  readonly ForgeSidebarSlot: ComponentType<ForgeSidebarSlotProps>
  /** sidebar.brand.mark 洞位内容（「知」字标） */
  readonly ForgeBrandMark: ComponentType<ForgeBrandMarkProps>
  /** sidebar.brand.name 洞位内容（dsh-forge 字标） */
  readonly ForgeBrandName: ComponentType<ForgeBrandNameProps>
  /** main.conversation 洞位占用者（工作台装配面板：三区装配 + hero 相位 UF-2 + UF-3 流程宿主 + 工作台桥） */
  readonly ForgeWorkbenchPanel: ComponentType<ForgeWorkbenchPanelProps>
}

declare global {
  /** 产品视图发布面（main.ts 求值期发布；client 插件槽位注册消费） */
  var __DSH_FORGE_VIEWS__: ForgePublishedViews | undefined
}

;(globalThis as { __DSH_FORGE_VIEWS__?: ForgePublishedViews }).__DSH_FORGE_VIEWS__ = {
  ForgeSidebarSlot,
  ForgeBrandMark,
  ForgeBrandName,
  ForgeWorkbenchPanel,
}
