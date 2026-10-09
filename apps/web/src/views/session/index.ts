// views/session/ barrel（定位：业务——UF-4 会话页签族，fix-25 官方 roster 降位形态；
// fix-29：轨迹 = 官方 'trajectory' 直用——TrajectoryLedger/transcript 随产品复刻退役；
// m3.1 D5/D6：会话头挂接 pill 退役（ForgeSessionTaskPills/SessionTaskPills 删除）——
// 派发任务监视面 = DispatchPanel（ShellHost 常驻树挂载，装载面随 pill 装配体迁入）。
// 2026-10-09：DispatchToolRow = dispatchTask 对话工具行（tool.call.toolview keyed
// 占用者——摘要段容器标识化，经 client 插件注册消费）。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁——跨视图跳转经工作台桥与 rpc/ 解耦）；
// 数据进出全经 props（官方 conversation.view roster 标准面 + 插件 inject face：召回 RPC +
// 跳转缝）。
export * from './ConversationViews.js'
export * from './DispatchPanel.js'
export * from './DispatchToolRow.js'
export * from './RecallTab.js'
