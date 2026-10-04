// views/session/ barrel（定位：业务——UF-4 会话页签族，fix-25 官方 roster 降位形态；
// fix-29：轨迹 = 官方 'trajectory' 直用——TrajectoryLedger/transcript 随产品复刻退役）。
// 边界：禁 import ../knowledge/（依赖铁律③ 同级业务互禁——跨视图跳转经工作台桥与 rpc/ 解耦）；
// 数据进出全经 props（官方 conversation.view roster 标准面 + 插件 inject face：召回 RPC +
// 跳转缝）。
export * from './ConversationViews.js'
export * from './RecallTab.js'
