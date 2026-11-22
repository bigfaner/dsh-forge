// 产品视图发布面（定位：装配——壳 bundle 侧发布窗口全局 __DSH_FORGE_VIEWS__）。
// 动机：产品 client 插件 bundle 为自含 classic script（零 import/export——vite 形状 pin），
// 不能共享壳 chunk；槽位注册需要的 React 组件本体经本发布面以页内全局递达（与
// __DSH_FORGE_CLIENT__ 激活标记、__ModuleLoader__ 注册面同族的页内缝）。
// React 单例不变：发布件 = 壳 bundle 内的同一 React（平台模块表种子 = 壳模块本体），
// 官方渲染器渲染本件与官方件共享同一 hook/元素同一性。
// 求值序保证：main.ts 同步 import 本模块（页面模块求值期），插件 bundle 经 boot 注入
// 在就绪门放行后才装载——发布恒先于消费（缺席 = 装配断裂，插件 apply fail-loud）。
// fix-25 发布集（官方基座降位形态）：main.conversation 工作台面板退役——发布 =
// sidebar 族（品牌行；workspaces 替换发布键已随 1.6 B 类顶替①迁 @dsh-forge/project
// bundle——ui/sidebar-face.ts）+ main 面板族（hero/knowledge）+ 页签族
// （召回单签——轨迹 = 官方 'trajectory' 直用，fix-29 退役产品复刻）+ 壳宿主
// （shell.overlay 常驻件）+ 面板行字形 + 工作台桥工厂。fix-13 注记（1.45）：右栏 dock
// tab 族（ForgeOverviewTab/ForgeDocsTab 两 keyed body）发布退役——注册面与组件本体归
// @dsh-forge/project bundle。
// m3.1 D5：会话头挂接 pill 发布退役（conversation.session.header.actions 槽位卸载——
// 派发任务监视面 = DispatchPanel，经 ShellHost 常驻树直挂不经槽位发布）。
// 4.7 设置分区退役：分区不再发布（expert-squad-default-routing AC4——
// worker 小节随分区整体退役，配置主权归 expert-squad 配置 tab）。
// 1.8 渲染链退役：官方预览径 md mermaid 扩展渲染器随分段链整体退役，sidebar md
// 预览回归官方 builtin；mermaid 出图改经 DOM 增强器——1.9 经本发布面递达
// createMermaidEnhancer（@dsh-forge/markdown-kit ./web 出口单源；client 插件 apply 期
// start、卸载级联 stop——插件 bundle 自含禁跨 chunk import，故经本缝）。
import type { ComponentType } from 'react'
import { createMermaidEnhancer } from '@dsh-forge/markdown-kit/web'
import {
  ForgeBrandMark,
  ForgeBrandName,
  type ForgeBrandMarkProps,
  type ForgeBrandNameProps,
} from './views/sidebar/index.js'
import { ForgeShellHost, type ForgeShellHostProps } from './workbench/ShellHost.js'
// ForgeHeroPanel / ForgeKnowledgePanel / ForgeKnowledgeGlyph / ForgeRecallView 不经壳
// 发布面递达——hero 面板注册在 @dsh-forge/project bundle（ui/hero-panel-face.ts），
// knowledge 三面注册在 @dsh-forge/knowledge bundle（ui/faces.ts），组件本体随插件包。
// fix-13 注记（1.45）：ForgeOverviewTab / ForgeDocsTab 发布退役——dock tab 族注册面与
// 组件本体随 @dsh-forge/project bundle（ui/dock-tabs-face.ts + ui/dock-tabs/）。
// 1.7 注记：ForgeHeroWorkspacePicker 发布退役——B 类顶替②（hero 项目+worktree 双 select
// 全量顶替）注册面与组件本体随 @dsh-forge/project bundle（ui/hero-picker-face.ts +
// ui/worktree-picker/hero-workspace-picker.tsx），不经壳发布面递达。
// fix-13 注记（1.41）：ForgeDispatchToolRow / ForgeEventEntries 发布退役——组件本体与注册面
// 均在 @dsh-forge/project client bundle（ui/dispatch-tool-row/ + ui/event-node/）。
// fix-13 注记（1.43）：ForgeWorktreeSwitchMarker 发布退役——注册面迁 @dsh-forge/project
// bundle（ui/conversation-views-face.ts ③），组件本体在插件包，不经壳发布面递达。
// fix-13 注记：chip / seal overlay 两件发布退役——注册面迁 project bundle apply 期
// 自注册（ui/official-seams.ts，组件随插件 bundle 渲染），发布面机械（页内全局
// __DSH_FORGE_VIEWS__）仅余壳内登记的占用者。
// fix-13 注记（1.40）：ForgeRemoteEntry 发布退役——组件本体与注册面均在 @dsh-forge/project
// client bundle（ui/remote-entry/，apply 期自注册），不经壳发布面递达。
import { createWorkbenchBridge, type ForgeCenterNav, type WorkbenchBridge } from './workbench/workbench-bridge.js'
// fix-13 注记：bug 三件（BugGlyph/BugPreview/ChipRestoreOverlay）发布退役——注册面
// 迁 project bundle apply 期自注册（ui/official-seams.ts），发布面零残留。

/** 发布面形状（client-plugin/plugin.ts 结构同型镜像——bundle 自持纪律，禁跨 chunk import） */
export interface ForgePublishedViews {
  // 1.6 注记：sidebar.workspaces 洞位占用者发布键随 B 类顶替①迁 @dsh-forge/project
  // bundle（ui/sidebar-face.ts + ui/sidebar/ 组件族）退役——壳发布面零该键。
  /** sidebar.brand.mark 洞位内容（「鲸游书海」标——fix-38 接入：官方 FISH_LOGO_PATH 鲸 + 书页浪 + 闪电喷泉） */
  readonly ForgeBrandMark: ComponentType<ForgeBrandMarkProps>
  /** sidebar.brand.name 洞位内容（dsh-forge 字标） */
  readonly ForgeBrandName: ComponentType<ForgeBrandNameProps>
  /** shell.overlay 常驻壳宿主（UF-3 流程宿主 + 相位/视图镜像锚 + hero 驱动 + 右栏联动面） */
  readonly ForgeShellHost: ComponentType<ForgeShellHostProps>
  // fix-13 注记（1.45）：ForgeOverviewTab / ForgeDocsTab 两发布键随 dock tab 族注册迁
  // @dsh-forge/project bundle（ui/dock-tabs-face.ts + ui/dock-tabs/）退役。
  // 1.7 注记：ForgeHeroWorkspacePicker 发布键随 B 类顶替②迁 @dsh-forge/project bundle
  // （ui/hero-picker-face.ts）退役——壳发布面零该键。
  // fix-13 注记（1.43）：ForgeWorktreeSwitchMarker 发布键随切换闸标记行注册迁
  // @dsh-forge/project bundle 退役——壳发布面零该键。
  /** 工作台桥工厂（插件 apply 期调用——nav 闭包绑定官方 layout.selectPanel 后发布） */
  readonly createWorkbenchBridge: (nav: ForgeCenterNav) => WorkbenchBridge
  /** markdown-kit DOM 增强器工厂（1.9——@dsh-forge/markdown-kit ./web 出口；插件 apply 期 start/卸载 stop） */
  readonly createMermaidEnhancer: typeof createMermaidEnhancer
}

declare global {
  /** 产品视图发布面（main.ts 求值期发布；client 插件槽位注册消费） */
  var __DSH_FORGE_VIEWS__: ForgePublishedViews | undefined
}

;(globalThis as { __DSH_FORGE_VIEWS__?: ForgePublishedViews }).__DSH_FORGE_VIEWS__ = {
  ForgeBrandMark,
  ForgeBrandName,
  ForgeShellHost,
  createWorkbenchBridge,
  createMermaidEnhancer,
}
