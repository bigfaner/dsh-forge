// views/session/ barrel（定位：业务——UF-4 会话页签族，fix-25 官方 roster 形态；
// fix-29：轨迹 = 官方 'trajectory' 直用——TrajectoryLedger/transcript 随产品复刻退役；
// m3.1 D5/D6：会话头挂接 pill 退役（ForgeSessionTaskPills/SessionTaskPills 删除）——
// loop-event-delivery 1.8：派发任务监视面再退役（DispatchPanel UI 由悬浮进度流面板
// 接替，仅存 worker 解析辅助面）。
// disc-2 壳侧死面退役：DispatchToolRow / RecallTab 出口随本体删除退役——注册面与组件
// 本体归插件 bundle。
// 1.13 迁移退役（plugin-task-loop 1.13）：DispatchEventsPanel 本体随六组件迁批迁
// @dsh-forge/task-loop（ui/dispatch-events-panel/——改缝注册 conversation.session.header.
// utilities），壳侧 barrel 出口与 ShellHost 直挂段一并退役——壳 overlay 树零 forge 派发残留。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁——跨视图跳转经工作台桥与 rpc/ 解耦）；
// 数据进出全经 props（官方 conversation.view roster 标准面 + 插件 inject face：召回 RPC +
// 跳转缝）。
export * from './ConversationViews.js'
// fix-13 注记（1.45）：DispatchPanel 出口随 dock tab 族注册面迁插件 bundle
// （plugins/project/ui/dock-tabs/worker-session.ts——概览任务 tab 消费面），壳零出口。
