// 产品视图发布面（定位：装配——壳 bundle 侧发布窗口全局 __DSH_FORGE_VIEWS__）。
// 动机：产品 client 插件 bundle 为自含 classic script（零 import/export——vite 形状 pin），
// 不能共享壳 chunk；槽位注册需要的 React 组件本体经本发布面以页内全局递达（与
// __DSH_FORGE_CLIENT__ 激活标记、__ModuleLoader__ 注册面同族的页内缝）。
// React 单例不变：发布件 = 壳 bundle 内的同一 React（平台模块表种子 = 壳模块本体），
// 官方渲染器渲染本件与官方件共享同一 hook/元素同一性。
// 求值序保证：main.ts 同步 import 本模块（页面模块求值期），插件 bundle 经 boot 注入
// 在就绪门放行后才装载——发布恒先于消费（缺席 = 装配断裂，插件 apply fail-loud）。
// fix-25 发布集（官方基座降位形态）：main.conversation 工作台面板退役——发布 =
// sidebar 族（workspaces 替换 + 品牌行）+ main 面板族（hero/knowledge）+ 页签族
// （召回单签——轨迹 = 官方 'trajectory' 直用，fix-29 退役产品复刻）+ 壳宿主
// （shell.overlay 常驻件）+ 面板行字形 + 工作台桥工厂。4.1 扩右栏 dock tab 族：
// ForgeOverviewTab/ForgeDocsTab（sidebar.right.pane.tab 两 keyed body——M2 UF-1/UF-2）。
// 4.2 扩会话头挂接 pill：ForgeSessionTaskPills（conversation.session.header.actions
// list 槽占用者——M2 UF-3/SC6③）。
// 4.7 扩设置分区：ForgeSettingsSection（官方 ui-settings settings.section list 槽占用者
// ——M3 UF-2 Forge设置 分区；slot 注册归 client 插件，生命周期 = 官方设置对话框）。
import type { ComponentType } from 'react'
import {
  ForgeBrandMark,
  ForgeBrandName,
  ForgeSidebarSlot,
  type ForgeBrandMarkProps,
  type ForgeBrandNameProps,
  type ForgeSidebarSlotProps,
} from './views/sidebar/index.js'
import { ForgeKnowledgeGlyph, type ForgeKnowledgeGlyphProps } from './views/sidebar/KnowledgeGlyph.js'
import { ForgeShellHost, type ForgeShellHostProps } from './workbench/ShellHost.js'
import { ForgeHeroPanel } from './workbench/HeroPanel.js'
import { ForgeKnowledgePanel, type ForgeKnowledgePanelProps } from './workbench/KnowledgePanel.js'
import {
  ForgeDocsTab,
  type ForgeDocsTabProps,
  ForgeOverviewTab,
  type ForgeOverviewTabProps,
} from './workbench/dock-tabs.js'
import { ForgeRecallView, type ForgeRecallViewProps } from './views/session/ConversationViews.js'
import {
  ForgeHeroWorkspacePicker,
  type ForgeHeroWorkspacePickerProps,
} from './views/session/HeroWorkspacePicker.js'
import {
  ForgeSessionTaskPills,
  type ForgeSessionTaskPillsProps,
} from './views/session/ForgeSessionTaskPills.js'
import {
  ForgeSettingsSection,
  type ForgeSettingsSectionProps,
} from './views/settings/ForgeSettingsSection.js'
import { createWorkbenchBridge, type ForgeCenterNav, type WorkbenchBridge } from './workbench/workbench-bridge.js'

/** 发布面形状（client-plugin/plugin.ts 结构同型镜像——bundle 自持纪律，禁跨 chunk import） */
export interface ForgePublishedViews {
  /** sidebar.workspaces 洞位占用者（接线层：快照直读 + 项目 RPC + 动作绑定） */
  readonly ForgeSidebarSlot: ComponentType<ForgeSidebarSlotProps>
  /** sidebar.brand.mark 洞位内容（「鲸游书海」标——fix-38 接入：官方 FISH_LOGO_PATH 鲸 + 书页浪 + 闪电喷泉） */
  readonly ForgeBrandMark: ComponentType<ForgeBrandMarkProps>
  /** sidebar.brand.name 洞位内容（dsh-forge 字标） */
  readonly ForgeBrandName: ComponentType<ForgeBrandNameProps>
  /** shell.overlay 常驻壳宿主（UF-3 流程宿主 + 相位/视图镜像锚 + hero 驱动 + 右栏联动面） */
  readonly ForgeShellHost: ComponentType<ForgeShellHostProps>
  /** main keyed 'dswf-hero' 占用者（UF-2 零项目引导面板） */
  readonly ForgeHeroPanel: ComponentType
  /** main keyed 'dswf-knowledge' 占用者（UF-5 知识视图面板——UF-6 浏览面挂载） */
  readonly ForgeKnowledgePanel: ComponentType<ForgeKnowledgePanelProps>
  /** sidebar.panellist 'dswf-knowledge' 占用者（官方面板行字形） */
  readonly ForgeKnowledgeGlyph: ComponentType<ForgeKnowledgeGlyphProps>
  /** conversation.view 'dswf-recall' 占用者（UF-4 知识召回页签） */
  readonly ForgeRecallView: ComponentType<ForgeRecallViewProps>
  /** sidebar.right.pane.tab keyed 'dswf-overview' 占用者（M2 UF-1 概览 dock tab body——4.1） */
  readonly ForgeOverviewTab: ComponentType<ForgeOverviewTabProps>
  /** sidebar.right.pane.tab keyed 'dswf-doc' 占用者（M2 UF-2 文档 dock tab body——4.1，multiple 按 address 去重） */
  readonly ForgeDocsTab: ComponentType<ForgeDocsTabProps>
  /** conversation.hero.workspace 影子占用者（fix-24 ①——新会话输入框上方控件改列项目） */
  readonly ForgeHeroWorkspacePicker: ComponentType<ForgeHeroWorkspacePickerProps>
  /** conversation.session.header.actions 占用者（M2 UF-3 会话头挂接 pill——4.2 Integration #2） */
  readonly ForgeSessionTaskPills: ComponentType<ForgeSessionTaskPillsProps>
  /** settings.section 占用者（M3 UF-2 Forge设置 分区——4.7 Integration #4；owner share close 由官方设置对话框递达，props 类型已含） */
  readonly ForgeSettingsSection: ComponentType<ForgeSettingsSectionProps>
  /** 工作台桥工厂（插件 apply 期调用——nav 闭包绑定官方 layout.selectPanel 后发布） */
  readonly createWorkbenchBridge: (nav: ForgeCenterNav) => WorkbenchBridge
}

declare global {
  /** 产品视图发布面（main.ts 求值期发布；client 插件槽位注册消费） */
  var __DSH_FORGE_VIEWS__: ForgePublishedViews | undefined
}

;(globalThis as { __DSH_FORGE_VIEWS__?: ForgePublishedViews }).__DSH_FORGE_VIEWS__ = {
  ForgeSidebarSlot,
  ForgeBrandMark,
  ForgeBrandName,
  ForgeShellHost,
  ForgeHeroPanel,
  ForgeKnowledgePanel,
  ForgeKnowledgeGlyph,
  ForgeRecallView,
  ForgeOverviewTab,
  ForgeDocsTab,
  ForgeHeroWorkspacePicker,
  ForgeSessionTaskPills,
  ForgeSettingsSection,
  createWorkbenchBridge,
}
