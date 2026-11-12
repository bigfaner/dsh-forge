// workbench/ barrel（定位：装配——官方基座降位后的产品装配面，fix-25）。
// 组成：常驻壳宿主（ShellHost——shell.overlay：UF-3 流程宿主 + 相位/视图镜像锚 + hero
// 面板驱动 + 知识模式右栏联动 + 概览项目上下文锚定[4.1]）+ main 面板族（HeroPanel——
// UF-2 零项目引导；KnowledgePanel——UF-5 知识视图）+ hero 纯渲染件（HeroEmpty）+
// 面板模型（panel-model——纯推导面）+ 项目锚定装载（anchored-projects——归属锚/主视图
// 会话锚子件 + useAnchoredProjects 共享 hook，fix-36/4.1）+ 工作台桥（workbench-bridge
// ——官方面板导航窄面 + 知识抽屉缝 + 概览上下文缝[4.1]）。
// fix-13 注记（1.45）：右栏 dock tab 装配体（dock-tabs——dswf-overview/dswf-doc 两 keyed
// body）随注册面迁 @dsh-forge/project（ui/dock-tabs/）——本 barrel 零该出口；HeroPanel /
// KnowledgePanel / HeroEmpty 亦为 1.42/1.44 迁移后死面（组件本体在插件包），随 1.45
// 清退退役。
// 消费方：product-views.ts（发布面）与单测；
// 依赖方向：装配 → 基础（shell/components/rpc）+ 业务（views/flows）单向。
export * from './ShellHost.js'
export * from './anchored-projects.js'
export * from './panel-model.js'
export * from './workbench-bridge.js'

