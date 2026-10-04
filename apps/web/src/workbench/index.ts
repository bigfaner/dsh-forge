// workbench/ barrel（定位：装配——官方基座降位后的产品装配面，fix-25）。
// 组成：常驻壳宿主（ShellHost——shell.overlay：UF-3 流程宿主 + 相位/视图镜像锚 + hero
// 面板驱动 + 知识模式右栏联动）+ main 面板族（HeroPanel——UF-2 零项目引导；KnowledgePanel
// ——UF-5 知识视图）+ hero 纯渲染件（HeroEmpty）+ 面板模型（panel-model——纯推导面）+
// 项目锚定装载（anchored-projects——归属锚子件 + useAnchoredProjects 共享 hook，fix-36）+
// 工作台桥（workbench-bridge——官方面板导航窄面 + 知识抽屉缝）。
// 消费方：product-views.ts（发布面）与单测；
// 依赖方向：装配 → 基础（shell/components/rpc）+ 业务（views/flows）单向。
export * from './ShellHost.js'
export * from './anchored-projects.js'
export * from './HeroPanel.js'
export * from './HeroEmpty.js'
export * from './KnowledgePanel.js'
export * from './panel-model.js'
export * from './workbench-bridge.js'

