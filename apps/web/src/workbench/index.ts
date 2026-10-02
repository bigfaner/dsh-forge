// workbench/ barrel（定位：装配——三区工作台组装：壳入口面板 + hero 相位 + 知识 M0 占位 +
// 官方会话面嵌入 + 工作台桥发布）。消费方：product-views.ts（发布面）与单测；
// 依赖方向：装配 → 基础（shell/zones/components/rpc）+ 业务（views/flows）单向。
export * from './ChatSurface.js'
export * from './HeroEmpty.js'
export * from './KnowledgeM0.js'
export * from './WorkbenchPanel.js'
export * from './workbench-bridge.js'
